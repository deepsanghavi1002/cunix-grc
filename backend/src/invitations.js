import { Router } from 'express';
import { randomBytes,randomUUID,createHash } from 'node:crypto';
const digest=value=>createHash('sha256').update(value).digest('hex');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const route=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
const invalid=()=>fail(400,'Invitation is invalid, expired or no longer available. Ask your workspace administrator for a new invitation.');
async function audit(db,tenant,actor,action,id){await db.query('INSERT INTO service_events(id,tenant_id,actor_id,action,record_id) VALUES($1,$2,$3,$4,$5)',[randomUUID(),tenant,actor,action,id]);}
const tokenFrom=req=>{const token=String(req.body.token||'');if(!/^[a-f0-9]{64}$/.test(token))throw invalid();return token;};
const usable=invite=>invite&&!invite.accepted_at&&!invite.revoked_at&&new Date(invite.expires_at)>new Date();
async function signedIn(pool,req){
 const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('grc_session='))?.slice(12)||'';
 return (await pool.query('SELECT u.id,u.email FROM service_sessions s JOIN service_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',[digest(token)])).rows[0];
}
export function invitationPublic({pool,passwordHash,passwordMatches}){
 const r=Router();
 r.post('/invitation/inspect',route(async(req,res)=>{
  const token=tokenFrom(req);const {rows}=await pool.query('SELECT i.*,t.name AS company,t.slug FROM service_invitations i JOIN tenants t ON t.id=i.tenant_id WHERE token_hash=$1',[digest(token)]);
  const invite=rows[0];if(!usable(invite))throw invalid();
  const user=await pool.query('SELECT id FROM service_users WHERE email=$1',[invite.email]);
  res.set('Cache-Control','no-store');res.json({email:invite.email,name:invite.name,company:invite.company,role:invite.role,expires_at:invite.expires_at,existingAccount:Boolean(user.rows[0]),authenticatedRecipient:(await signedIn(pool,req))?.email===invite.email});
 }));
 r.post('/invitation/accept',route(async(req,res)=>{
  const token=tokenFrom(req),email=String(req.body.email||'').trim().toLowerCase(),password=req.body.password;
  const session=await signedIn(pool,req);
  if(session?.email!==email&&(typeof password!=='string'||password.length<12||password.length>256))throw fail(400,'Use a password of 12 to 256 characters.');
  const db=await pool.connect();try{
   await db.query('BEGIN');
   const invite=(await db.query('SELECT * FROM service_invitations WHERE token_hash=$1 FOR UPDATE',[digest(token)])).rows[0];
   if(!usable(invite)||invite.email!==email)throw invalid();
   let user=(await db.query('SELECT * FROM service_users WHERE email=$1',[email])).rows[0];
   if(user){if(session?.id!==user.id&&!passwordMatches(password,user.password_hash))throw fail(401,'Use your existing GRC password to accept this invitation.');}
   else {user={id:randomUUID()};await db.query('INSERT INTO service_users VALUES($1,$2,$3,$4)',[user.id,email,passwordHash(password),invite.name]);}
   // Conditional consumption prevents concurrent re-use as well as ordinary replay.
   const consumed=await db.query('UPDATE service_invitations SET accepted_at=now(),accepted_by=$1 WHERE id=$2 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() RETURNING id',[user.id,invite.id]);
   if(!consumed.rows.length)throw invalid();
   await db.query('INSERT INTO service_memberships(user_id,tenant_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[user.id,invite.tenant_id,invite.role]);
   await audit(db,invite.tenant_id,user.id,'invitation.accepted',invite.id);
   const tenant=(await db.query('SELECT slug FROM tenants WHERE id=$1',[invite.tenant_id])).rows[0];
   await db.query('COMMIT');res.set('Cache-Control','no-store');res.json({ok:true,clientSlug:tenant.slug,message:'Access granted. Sign in with your individual GRC account.'});
  }catch(e){await db.query('ROLLBACK');if(e.code==='23505')throw fail(409,'Account changed while accepting. Retry with your existing GRC password.');throw e;}finally{db.release();}
 }));return r;
}
export function invitationAdmin({pool}){
 const r=Router();r.use((req,_res,next)=>req.role==='admin'?next():next(fail(403,'Workspace administrator access required.')));
 r.get('/invitations',route(async(req,res)=>{const {rows}=await pool.query('SELECT id,email,name,role,created_at,expires_at,accepted_at,revoked_at FROM service_invitations WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100',[req.tenant]);res.set('Cache-Control','no-store');res.json(rows);}));
 r.post('/invitations',route(async(req,res)=>{
  const email=String(req.body.email||'').trim().toLowerCase(),name=String(req.body.name||'').trim(),role=req.body.role;
  if(!/^\S+@\S+\.\S+$/.test(email)||email.length>254||!name||name.length>120||!['client','employee','reviewer','auditor'].includes(role))throw fail(400,'Provide a name, valid email and supported workspace role.');
  const db=await pool.connect();try{
   await db.query('BEGIN');
   const member=await db.query('SELECT u.id FROM service_users u JOIN service_memberships m ON m.user_id=u.id WHERE u.email=$1 AND m.tenant_id=$2',[email,req.tenant]);
   if(member.rows.length)throw fail(409,'This person already has workspace access.');
   await db.query('UPDATE service_invitations SET revoked_at=now() WHERE tenant_id=$1 AND email=$2 AND accepted_at IS NULL AND revoked_at IS NULL',[req.tenant,email]);
   const token=randomBytes(32).toString('hex'),id=randomUUID(),expires=new Date(Date.now()+72*3600000).toISOString();
   await db.query('INSERT INTO service_invitations(id,tenant_id,email,name,role,token_hash,created_by,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,req.tenant,email,name,role,digest(token),req.user.id,expires]);
   await audit(db,req.tenant,req.user.id,'invitation.created',id);await db.query('COMMIT');
   res.set('Cache-Control','no-store');res.status(201).json({id,expires_at:expires,url:(process.env.APP_ORIGIN||`${req.protocol}://${req.get('host')}`)+'/#/invite/'+token,delivery:'Share privately with the named recipient. Email delivery is not configured.'});
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }));
 r.post('/invitations/:id/revoke',route(async(req,res)=>{const result=await pool.query('UPDATE service_invitations SET revoked_at=now() WHERE id=$1 AND tenant_id=$2 AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id',[req.params.id,req.tenant]);if(!result.rows.length)throw fail(404,'Pending invitation not found.');await audit(pool,req.tenant,req.user.id,'invitation.revoked',req.params.id);res.json({ok:true});}));
 r.delete('/members/:id',route(async(req,res)=>{if(req.params.id===req.user.id)throw fail(409,'You cannot remove your own access.');const result=await pool.query("DELETE FROM service_memberships WHERE user_id=$1 AND tenant_id=$2 AND role<>'admin' RETURNING user_id",[req.params.id,req.tenant]);if(!result.rows.length)throw fail(404,'Removable member not found. Workspace administrators require a maintainer.');await audit(pool,req.tenant,req.user.id,'membership.revoked',req.params.id);res.json({ok:true});}));return r;
}

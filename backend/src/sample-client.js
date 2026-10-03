import {randomUUID, createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {requirements,guides,routines} from './isms-catalog.js';
import {stageDefinitions} from './stages.js';
import {riskScores} from './readiness.js';

export const SAMPLE_SLUG='northstar-isms-working-release';
export const scopeAreas=[
 {key:'governance',title:'Governance and risk',details:'Management, objectives, risk assessment, applicability, audits and corrective action',owner:'ISMS coordinator'},
 {key:'software',title:'Software development',details:'Customer applications, source code, CI/CD, changes and test information',owner:'Engineering'},
 {key:'cloud',title:'Cloud and hosted services',details:'Production cloud, customer support, backups, recovery and shared responsibility',owner:'Cloud operations'},
 {key:'infrastructure',title:'Networks and endpoints',details:'Servers, laptops, network security, logging, vulnerability and malware handling',owner:'IT operations'},
 {key:'people',title:'People and remote work',details:'Employees, contractors, joiners/leavers, awareness, remote work and BYOD',owner:'People operations'},
 {key:'physical',title:'Offices and data centre',details:'Two offices, a colocation facility, visitors, CCTV, utilities and secure areas',owner:'Facilities'},
 {key:'suppliers',title:'Suppliers and third parties',details:'Cloud, connectivity, payroll, support vendors and supplier assurance',owner:'Procurement'},
 {key:'privacy',title:'Personal and customer information',details:'Employee and customer personal data, classification, retention, deletion and incident response',owner:'Privacy lead'},
 {key:'continuity',title:'Continuity and recovery',details:'Business impact, disruption scenarios, ransomware, restore testing and recovery objectives',owner:'Service delivery'},
 {key:'legal',title:'Legal and contractual obligations',details:'Customer security terms, confidentiality, intellectual property and applicable obligations',owner:'Legal coordinator'},
 {key:'assurance',title:'Monitoring and improvement',details:'Internal audits, management reviews, incidents, lessons learned and corrective actions',owner:'Independent sample reviewer'},
];
export function samplePlan(today=new Date().toISOString().slice(0,10)) {
 const date=offset=>new Date(Date.parse(today+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10);
 const gaps=new Set(['Clause 6.2','A.5.22','A.6.3','A.7.4','A.8.8','A.8.13','Clause 9.2']);
 return {today,date,gaps,requirements,scopeAreas};
}
export async function createSampleClient(pool,{actorId,catalog=[],referenceRoot='',today}={}) {
 const plan=samplePlan(today),db=await pool.connect();
 try {
  await db.query('BEGIN');
  // Serialize setup without locking unrelated customer workspaces.
  await db.query('SELECT id FROM service_users WHERE id=$1 FOR UPDATE',[actorId]);
  const actor=(await db.query('SELECT id FROM service_users WHERE id=$1',[actorId])).rows[0];
  if(!actor)throw Error('An existing operator identity is required');
  const existing=(await db.query('SELECT id FROM tenants WHERE slug=$1',[SAMPLE_SLUG])).rows[0];
  if(existing){await db.query('COMMIT');return {id:existing.id,reused:true};}
  const tenant=randomUUID(),at=plan.today+'T12:00:00.000Z';
  await db.query('INSERT INTO tenants(id,name,slug) VALUES($1,$2,$3)',[tenant,'Northstar Digital — ISMS Sample',SAMPLE_SLUG]);
  await db.query('INSERT INTO service_memberships VALUES($1,$2,$3)',[actorId,tenant,'admin']);
  const add=async(kind,data)=>{const id=randomUUID();await db.query('INSERT INTO service_records(id,tenant_id,kind,data) VALUES($1,$2,$3,$4)',[id,tenant,kind,{...data,sample:true}]);return id;};
  const profile={sample:true,services:'Fictional B2B SaaS development, managed cloud operations and customer support; all 93 Annex A references are applicable for demonstration.',information:'Customer application data, employee personal data, source code, contractual records and operational logs.',coordinator:'Sample ISMS coordinator',sponsor:'Sample managing director',industry:'Software and managed IT services',scopeAreas,referencePack:{name:'ISMS 2022',fileCount:catalog.length,source:'User-supplied Drive reference pack',importedAt:at}};
  await db.query('INSERT INTO service_programs(tenant_id,profile) VALUES($1,$2)',[tenant,profile]);
  await add('scope',{title:'Comprehensive sample ISMS boundary',status:'approved',owner:profile.coordinator,framework:'ISO 27001:2022',description:'SIMULATION: '+profile.services+'\nIn scope: Pune office, Mumbai delivery office, remote staff, colocation, production cloud, development, corporate IT, HR, procurement and customer support. Information: '+profile.information+'\nAll 93 Annex A references included. This intentionally broad sample is not a scope recommendation for every real client.'});
  const controlIds={},documentIds={};
  for(const requirement of requirements){
   const owner=requirement.theme==='People'?'People operations':requirement.theme==='Physical'?'Facilities':requirement.theme==='Technology'?'IT operations':'ISMS coordinator';
   const gap=plan.gaps.has(requirement.ref),controlId=await add('controls',{title:requirement.title,reference:'ISO27001 '+requirement.ref,theme:requirement.theme,owner,status:gap?'attention':'passing',applicable:true,justification:'Applicable to the deliberately broad fictional sample scope.'});controlIds[requirement.ref]=controlId;
   const expired=['A.7.4','A.8.13'].includes(requirement.ref),pending=gap&&!expired;
   const data={title:`Sample ${requirement.ref} — ${requirement.title}`,owner,controlId,stageKey:'evidence',status:pending?'review_required':'approved',description:`SIMULATED OPERATING RECORD — not real client evidence.\nReference: ${requirement.ref}: ${requirement.title}\nOrganization: Northstar Digital (fictional).\nScope: software delivery, cloud operations, corporate IT, people and physical locations, where relevant.\nSample observation period: ${plan.date(-30)} to ${plan.today}.\nScenario: ${gap?'An exception is deliberately retained to demonstrate review, remediation or evidence renewal.':'A fictional owner has documented the arrangement and a sample reviewer has recorded a satisfactory result.'}\nValidation for a real client: replace this simulation with actual implementation details, dated records, source evidence and a reviewer decision.`,collectedOn:plan.date(-2),expiresAt:expired?plan.date(-1):plan.date(90),submittedBy:'Fictional control owner',reviewNote:pending?'Pending sample review':'Fictional reviewer decision for demonstration only',...(!pending?{reviewedAt:at,reviewedBy:'Fictional independent reviewer'}:{})};
   const documentId=await add('documents',data);documentIds[requirement.ref]=documentId;
   const original=Buffer.from(data.description),checksum=createHash('sha256').update(original).digest('hex');
   await db.query('INSERT INTO service_files VALUES($1,$2,$3,$4,$5)',[documentId,tenant,requirement.ref.replace(/\W/g,'-')+'-sample.txt',original,checksum]);
   await db.query('UPDATE service_records SET data=$1 WHERE id=$2',[{...data,sample:true,checksum,fileSize:original.length},documentId]);
   if(gap)await add('tasks',{title:`Sample follow-up: ${requirement.title}`,controlId,owner,status:'in_progress',dueDate:plan.date(requirement.ref==='A.8.8'?-2:7),description:'Replace or renew the sample evidence, record the actual finding and obtain reviewer confirmation. Demonstration exception only.'});
  }
  const locations=[['Pune headquarters','office'],['Mumbai delivery office','office'],['Remote workforce','remote'],['Colocation facility','data centre'],['Production cloud region','cloud']];
  for(const [name,type] of locations)await db.query('INSERT INTO service_sites(id,tenant_id,name,data) VALUES($1,$2,$3,$4)',[randomUUID(),tenant,name,{type,location:'Fictional sample location',owner:type==='office'?'Facilities':'IT operations',sample:true}]);
  for(const area of scopeAreas)await add('assets',{title:area.title+' assets',owner:area.owner,status:'approved',description:'Fictional scope inventory: '+area.details+'\nClassification: confidential where customer or personal information is involved. Review: quarterly.'});
  for(const [title,owner,ref,treatment] of [['Privileged access misuse','IT operations','A.8.2','Least privilege, MFA and quarterly access reviews'],['Customer data exposure','Privacy lead','A.5.34','Access restrictions, retention and breach response'],['Backup restoration failure','Cloud operations','A.8.13','Measured recovery tests and offline copies'],['Supplier disruption','Procurement','A.5.22','Supplier reassessment and continuity alternatives'],['Unpatched production service','IT operations','A.8.8','Time-bound vulnerability remediation'],['Unauthorised physical access','Facilities','A.7.2','Visitor controls and entry reviews']])await add('risks',riskScores({title,owner,controlId:controlIds[ref],status:'in_progress',likelihood:4,impact:4,residualLikelihood:2,residualImpact:3,treatment,description:'Fictional sample risk. Actual acceptance requires a business-owner decision; no formal acceptance workflow is implied.'}));
  for(const title of ['Cloud hosting','Source code hosting','Payroll provider','Connectivity supplier','Managed support partner','Colocation operator'])await add('vendors',{title,owner:'Procurement',status:title==='Managed support partner'?'in_progress':'approved',description:'Fictional supplier inventory and due-diligence example; reassess yearly.'});
  const policyTitles=catalog.filter(item=>item.category==='Policies').map(item=>item.title);
  for(const title of policyTitles.length?policyTitles:['Information security policy','Access control policy','Backup policy'])await add('policies',{title:'Sample '+title,owner:'ISMS coordinator',status:'approved',version:1,description:'SIMULATION — '+title+' for Northstar Digital. Applies to all relevant employees, contractors, suppliers and in-scope systems. The responsible owner reviews implementation quarterly and escalates exceptions to the sample sponsor. This original short sample does not reproduce the supplied template or replace a completed real policy.'});
  for(const title of ['New starter awareness','Annual security awareness','Privileged operator training'])await add('training',{title,owner:'People operations',status:title==='Annual security awareness'?'in_progress':'approved',description:'Fictional attendance and competence example. Annual campaign intentionally includes a completion gap.'});
  for(const title of ['GitHub','Cloud provider','Identity directory','Endpoint management','Ticketing system'])await add('integrations',{title,owner:'IT operations',status:'not_connected',note:'Inventory example only. No provider connection or observations have been fabricated.'});
  for(const routine of routines){
   const blocked=plan.gaps.has(routine.ref),docId=documentIds[routine.ref];
   const data={...routine,owner:scopeAreas.find(a=>a.key==='governance').owner,siteId:'',periodStart:plan.date(-30),dueDate:plan.date(blocked?-1:routine.days),status:blocked?'due':'scheduled',sample:true,history:blocked?[]:[{documentId:docId,collectedOn:plan.date(-2),submittedBy:'Fictional owner',reviewedBy:'Fictional independent reviewer',reviewer:'Sample independent reviewer',note:'Simulated accepted cycle; replace with actual evidence for a real client.',acceptedAt:at,dueDate:plan.today}]};
   await db.query('INSERT INTO service_routines VALUES($1,$2,$3)',[tenant,routine.key,data]);
  }
  for(const guide of guides){const content=Buffer.from(`SAMPLE WALKTHROUGH: ${guide.title}\n${guide.steps.map((step,i)=>`${i+1}. ${step}`).join('\n')}\nFictional exercise only. Expected working record: ${guide.evidence}`);await add('documents',{title:'Sample guide — '+guide.title,guideKey:guide.key,description:content.toString(),controlId:controlIds[guide.refs[0]],status:'review_required',owner:'ISMS coordinator',stageKey:'controls'});}
  for(const item of catalog){
   const data={title:item.title,filename:item.filename,description:'PRIVATE REFERENCE TEMPLATE — not completed operating evidence.\nOriginal path: '+item.path+'\n\n'+item.text,referenceOnly:true,referencePath:item.path,referenceCategory:item.category,referenceLevel:item.level,status:'reference',owner:'CUNIX reference library',stageKey:'controls',checksum:item.sha256,fileSize:item.bytes};
   const recordId=await add('documents',data);
   if(referenceRoot){const absolute=path.resolve(referenceRoot,item.path);if(!absolute.startsWith(path.resolve(referenceRoot)+path.sep))throw Error('Unsafe reference path');const bytes=await readFile(absolute);if(bytes.length>5*1024*1024||createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error('Invalid reference original');await db.query('INSERT INTO service_files VALUES($1,$2,$3,$4,$5)',[recordId,tenant,item.filename,bytes,item.sha256]);}
  }
  await add('audits',{title:'Sample internal audit — all in-scope references',owner:'Fictional independent auditor',periodStart:plan.date(-30),periodEnd:plan.date(14),status:'in_progress',controlIds:Object.values(controlIds),description:'Demonstration audit covering the full reference index. Deliberate gaps remain for review.'});
  for(const stage of stageDefinitions)await db.query('INSERT INTO service_stages(tenant_id,key,status,data) VALUES($1,$2,$3,$4)',[tenant,stage.key,['onboarding','scope'].includes(stage.key)?'approved':'in_progress',{owner:'Sample delivery coordinator',sample:true,checklist:['onboarding','scope'].includes(stage.key)?stage.checklist.map((_title,index)=>index):[],reviewNote:'Fictional stage review for demonstration only'}]);
  await db.query('INSERT INTO service_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)',[randomUUID(),tenant,actorId,'sample.initialized']);
  await db.query('COMMIT');return {id:tenant,reused:false,controls:requirements.length,referenceFiles:catalog.length,scopeAreas:scopeAreas.length};
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const {pool}=await import('./db.js');try{const actor=(await pool.query("SELECT u.id FROM service_users u JOIN service_memberships m ON m.user_id=u.id WHERE m.role='admin' ORDER BY u.email LIMIT 1")).rows[0];if(!actor)throw Error('No existing administrator found');const catalogPath=process.env.ISMS_REFERENCE_CATALOG;const catalog=catalogPath?JSON.parse(await readFile(catalogPath,'utf8')):[];console.log(JSON.stringify(await createSampleClient(pool,{actorId:actor.id,catalog,referenceRoot:process.env.ISMS_REFERENCE_ROOT||''})));}finally{await pool.end();}
}

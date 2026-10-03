import {chromium} from '../frontend/node_modules/playwright/index.mjs';
import express from '../backend/node_modules/express/index.js';
import pgMem from '../backend/node_modules/pg-mem/index.js';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import {pool} from '../backend/src/db.js';
import {service,passwordHash} from '../backend/src/service.js';
import {createSampleClient} from '../backend/src/sample-client.js';
const memory=pgMem.newDb();memory.public.none('CREATE TABLE tenants(id UUID PRIMARY KEY,name TEXT NOT NULL,slug TEXT UNIQUE NOT NULL)');memory.public.none(await readFile(new URL('../backend/db/service.sql',import.meta.url),'utf8'));
const adapter=memory.adapters.createPg(),db=new adapter.Pool();pool.query=db.query.bind(db);pool.connect=db.connect.bind(db);
const actor=randomUUID();await pool.query('INSERT INTO service_users VALUES($1,$2,$3,$4)',[actor,'browser@sample.invalid',passwordHash('SampleBrowserPassword123!'),'Sample browser operator']);
const sample=await createSampleClient(pool,{actorId:actor,catalog:[{title:'Access policy',filename:'policy.txt',path:'sample/access.txt',text:'<<COMPANY NAME>> review accounts quarterly. <<Owner>>',category:'Policies',level:'Level 1',sha256:'fixture',bytes:99}]});
const app=express();app.use(express.json({limit:'8mb'}));app.use('/api/service',service);app.use(express.static(new URL('../frontend/dist/',import.meta.url).pathname));app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.message}));const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
 await page.getByLabel('Email address').fill('browser@sample.invalid');await page.getByLabel('Password',{exact:true}).fill('SampleBrowserPassword123!');await page.getByRole('button',{name:'Open workspace',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.app-shell'));
 await page.goto(base+'/#/workspace/'+sample.id+'/isms');await page.getByText('Fictional sample workspace',{exact:true}).waitFor();await page.getByRole('tab',{name:'Scope areas',exact:true}).click();assert.equal(await page.locator('.scope-area-grid article').count(),11);
 await page.getByRole('tab',{name:'Control coverage',exact:true}).click();await page.getByRole('tab',{name:'Reference pack',exact:true}).click();await page.getByText('1 source files',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Open private document library'}).click();await page.getByRole('button',{name:/Reference templates/}).click();await page.getByText('Access policy',{exact:true}).click();await page.getByRole('button',{name:'Create working draft',exact:true}).click();await page.getByText('Working draft prepared. Complete decisions and map it before review.',{exact:true}).waitFor();
 await page.getByRole('button',{name:/Reference templates/}).click();assert.equal(await page.getByText('Access policy',{exact:true}).count(),1);
 await page.setViewportSize({width:390,height:844});await page.goto(base+'/#/workspace/'+sample.id+'/isms');await page.getByText('Fictional sample workspace',{exact:true}).waitFor();assert.ok(await page.getByRole('tab',{name:'Scope areas',exact:true}).isVisible());assert.deepEqual(errors,[]);
 console.log('Playwright passed: sample login, scope matrix, control/reference tabs, private template to working draft, preserved original, and mobile visibility. Uses disposable in-memory data.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await db.end();}

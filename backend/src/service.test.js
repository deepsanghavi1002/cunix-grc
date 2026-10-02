import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import express from "express";
import request from "supertest";
import { newDb } from "pg-mem";
import { pool } from "./db.js";
import { service } from "./service.js";

test("workspace lifecycle enforces isolation and human document approval", async (context) => {
  if (process.env.TEST_REAL_DATABASE === "true") {
    context.after(() => pool.end());
  } else {
    const memory = newDb();
    memory.public.none(
      "CREATE TABLE tenants(id UUID PRIMARY KEY,name TEXT NOT NULL,slug TEXT UNIQUE NOT NULL)",
    );
    memory.public.none(
      await readFile(new URL("../db/service.sql", import.meta.url), "utf8"),
    );
    const adapter = memory.adapters.createPg();
    const db = new adapter.Pool();
    pool.query = db.query.bind(db);
    pool.connect = db.connect.bind(db);
  }
  const app = express();
  app.use(express.json());
  app.use("/api", service);
  app.use((e, req, res, next) =>
    res.status(e.status || 500).json({ error: e.message }),
  );
  const admin = request.agent(app),
    other = request.agent(app),
    client = request.agent(app);
  const account = {
    email: "owner@example.com",
    password: "test-password-long",
    name: "Owner",
    company: "Acme",
  };
  await admin.post("/api/register").send(account).expect(201);
  await admin
    .post("/api/login")
    .send({ ...account, password: "wrong" })
    .expect(401);
  await admin.post("/api/login").send(account).expect(200);
  const me = (await admin.get("/api/me").expect(200)).body;
  const tenant = me.workspaces[0].id;
  const base = `/api/workspaces/${tenant}`;
  await other
    .post("/api/register")
    .send({ ...account, email: "other@example.com", company: "Other" })
    .expect(201);
  await other
    .post("/api/login")
    .send({ ...account, email: "other@example.com" })
    .expect(200);
  await other.get(base + "/records").expect(403);
  const records = (await admin.get(base + "/records").expect(200)).body;
  assert.equal(records.filter((r) => r.kind === "controls").length, 12);
  await admin
    .post(base + "/members")
    .send({
      email: "client@example.com",
      password: account.password,
      name: "Client",
      role: "client",
    })
    .expect(201);
  await client
    .post("/api/login")
    .send({ email: "client@example.com", password: account.password })
    .expect(200);
  const doc = (
    await client
      .post(base + "/records/documents")
      .send({
        title: "Security policy",
        description: "approved annual",
        status: "approved",
      })
      .expect(201)
  ).body;
  assert.equal(doc.data.status, "review_required");
  await client
    .patch(base + "/records/" + doc.id)
    .send({ status: "approved", reviewNote: "Looks good" })
    .expect(403);
  const file = (
    await client
      .post(base + "/upload")
      .send({
        filename: "policy.txt",
        content: Buffer.from("Information security policy for Acme").toString(
          "base64",
        ),
      })
      .expect(201)
  ).body;
  const downloaded = await client.get(base + "/files/" + file.id).expect(200);
  assert.ok(downloaded.body.toString().includes("Information security"));
  await other.get(base + "/files/" + file.id).expect(403);
  await admin
    .patch(base + "/records/" + doc.id)
    .send({ status: "approved" })
    .expect(400);
  await admin
    .patch(base + "/records/" + doc.id)
    .send({
      status: "approved",
      reviewNote: "Reviewed approval and scope",
      controlId: records.find((r) => r.kind === "controls").id,
    })
    .expect(200);
  const exported = (await admin.get(base + "/export").expect(200)).body;
  assert.ok(exported.events.some((e) => e.action === "documents.updated"));
  const control = records.find((r) => r.kind === "controls");
  await client
    .patch(base + "/records/" + control.id)
    .send({ status: "passing" })
    .expect(403);
  await admin
    .patch(base + "/records/" + control.id)
    .send({ applicable: false })
    .expect(400);
  await admin
    .patch(base + "/records/" + control.id)
    .send({ status: "passing" })
    .expect(200);
  await admin
    .patch(base + "/records/" + doc.id)
    .send({ expiresAt: "2099-01-01" })
    .expect(200);
  let current = (await admin.get(base + "/records")).body.find(
    (item) => item.id === doc.id,
  );
  assert.equal(
    current.data.status,
    "review_required",
    "expiry changes invalidate prior approval",
  );
  await admin
    .patch(base + "/records/" + doc.id)
    .send({ status: "approved", reviewNote: "Version and validity checked" })
    .expect(200);
  assert.equal(
    (await admin.get(base + "/readiness").expect(200)).body.ready,
    1,
  );
  await client
    .patch(base + "/records/" + doc.id)
    .send({ description: "Revised policy" })
    .expect(200);
  assert.equal((await admin.get(base + "/readiness")).body.ready, 0);
  assert.ok(
    (await admin.get(base + "/records/" + doc.id + "/history").expect(200)).body
      .length >= 3,
  );
  const firstMonitor = (
    await admin
      .post(base + "/monitor")
      .send({})
      .expect(200)
  ).body;
  assert.equal(firstMonitor.tasksCreated, 12);
  assert.equal(
    (
      await admin
        .post(base + "/monitor")
        .send({})
        .expect(200)
    ).body.tasksCreated,
    0,
    "monitor does not duplicate open tasks",
  );
  await client
    .post(base + "/monitor")
    .send({})
    .expect(403);
  await other.get(base + "/readiness").expect(403);
  await admin
    .post(base + "/members")
    .send({
      email: "auditor@example.com",
      password: account.password,
      name: "Auditor",
      role: "auditor",
    })
    .expect(201);
  const auditor = request.agent(app);
  await auditor
    .post("/api/login")
    .send({ email: "auditor@example.com", password: account.password })
    .expect(200);
  await auditor.get(base + "/readiness").expect(200);
  await auditor
    .patch(base + "/records/" + control.id)
    .send({ status: "passing" })
    .expect(403);
  await auditor
    .post(base + "/monitor")
    .send({})
    .expect(403);
  const soa = (
    await admin.get(base + "/statement-of-applicability").expect(200)
  ).body;
  assert.equal(soa.controls.length, 12);
  const risk = (
    await client
      .post(base + "/records/risks")
      .send({
        title: "Data leakage",
        likelihood: 5,
        impact: 4,
        residualLikelihood: 2,
        residualImpact: 2,
      })
      .expect(201)
  ).body;
  assert.equal(risk.data.inherentScore, 20);
  assert.equal(risk.data.residualScore, 4);
  await client
    .patch(base + "/records/" + risk.id)
    .send({ impact: 8 })
    .expect(400);
  const policy = (
    await admin
      .post(base + "/records/policies")
      .send({ title: "Security policy", description: "Version one" })
      .expect(201)
  ).body;
  await admin
    .patch(base + "/records/" + policy.id)
    .send({ status: "approved" })
    .expect(200);
  await client
    .post(base + "/records/" + policy.id + "/acknowledge")
    .send({})
    .expect(200);
  await client
    .post(base + "/records/" + policy.id + "/acknowledge")
    .send({})
    .expect(200);
  assert.equal((await admin.get(base + "/acknowledgements")).body.length, 1);
  await admin
    .patch(base + "/records/" + policy.id)
    .send({ description: "Version two" })
    .expect(200);
  await client
    .post(base + "/records/" + policy.id + "/acknowledge")
    .send({})
    .expect(400);
  current = (await admin.get(base + "/records")).body.find(
    (item) => item.id === policy.id,
  );
  assert.equal(current.data.version, 2);
  assert.equal(current.data.status, "draft");
  const audit = (
    await admin
      .post(base + "/audits")
      .send({
        title: "Internal audit",
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
      })
      .expect(201)
  ).body;
  const auditPackage = (
    await admin.get(base + "/audits/" + audit.id + "/package").expect(200)
  ).body;
  assert.equal(auditPackage.requests.length, 12);
  assert.equal(auditPackage.controls.length, 12);
  await other.get(base + "/audits/" + audit.id + "/package").expect(403);
  await client
    .post("/api/workspaces")
    .send({ company: "Unauthorized" })
    .expect(403);
  const newWorkspace = (
    await admin
      .post("/api/workspaces")
      .send({ company: "Second client" })
      .expect(201)
  ).body;
  assert.equal(
    (await admin.get(`/api/workspaces/${newWorkspace.id}/records`)).body.filter(
      (item) => item.kind === "controls",
    ).length,
    12,
  );
  await client.get(`/api/workspaces/${newWorkspace.id}/records`).expect(403);
  const stageList = (await admin.get(base + '/stages').expect(200)).body;
  assert.equal(stageList.length, 6);
  await other.get(base + '/stages').expect(403);
  await auditor.patch(base + '/stages/onboarding').send({notes:'Not allowed'}).expect(403);
  await client.patch(base + '/stages/onboarding').send({status:'approved',checklist:[0,1,2],reviewNote:'Self approved'}).expect(403);
  await admin.patch(base + '/stages/onboarding').send({status:'approved'}).expect(400);
  await admin.patch(base + '/stages/onboarding').send({checklist:[7]}).expect(400);
  await client.patch(base + '/stages/onboarding').send({owner:'Client lead',notes:'Contacts confirmed',checklist:[0,1,2],status:'waiting_review'}).expect(200);
  await admin.patch(base + '/stages/onboarding').send({status:'approved',reviewNote:'Engagement reviewed'}).expect(200);
  assert.equal((await admin.get(base + '/stages')).body.find(item=>item.key==='onboarding').status,'approved');
  const stagedFile=(await client.post(base+'/upload').send({filename:'engagement.txt',stageKey:'onboarding',content:Buffer.from('Engagement scope and client contacts').toString('base64')}).expect(201)).body;
  assert.equal((await admin.get(base+'/stages')).body.find(item=>item.key==='onboarding').status,'in_progress','new evidence reopens the approved stage');
  await admin.patch(base+'/stages/onboarding').send({status:'approved',reviewNote:'Cannot approve unreviewed evidence'}).expect(400);
  await admin.patch(base+'/records/'+stagedFile.id).send({status:'approved',reviewNote:'Evidence inspected',expiresAt:'2099-01-01',controlId:control.id}).expect(200);
  await admin.patch(base+'/stages/onboarding').send({status:'approved',reviewNote:'Evidence complete'}).expect(200);
  await other.delete(base+'/documents/'+stagedFile.id).expect(403);
  await auditor.delete(base+'/documents/'+stagedFile.id).expect(403);
  await client.delete(base+'/documents/'+stagedFile.id).expect(200);
  assert.ok(!(await admin.get(base+'/records')).body.some(item=>item.id===stagedFile.id));
  assert.ok((await admin.get(base+'/trash')).body.some(item=>item.id===stagedFile.id));
  await admin.get(base+'/files/'+stagedFile.id).expect(404);
  await client.patch(base+'/records/'+stagedFile.id).send({title:'Bypass trash'}).expect(404);
  const deletedReport=(await admin.get(base+'/readiness')).body;
  assert.ok(!deletedReport.controls.some(item=>item.evidenceIds.includes(stagedFile.id)));
  assert.equal((await admin.get(base+'/stages')).body.find(item=>item.key==='onboarding').status,'in_progress');
  const deletedExport=(await admin.get(base+'/export')).body;
  assert.ok(!deletedExport.records.some(item=>item.id===stagedFile.id));
  assert.ok(deletedExport.events.some(item=>item.action==='documents.deleted'));
  await other.get(base+'/trash').expect(403);
  await other.post(base+'/documents/'+stagedFile.id+'/restore').send({}).expect(403);
  await client.post(base+'/documents/'+stagedFile.id+'/restore').send({}).expect(200);
  const restored=(await admin.get(base+'/records')).body.find(item=>item.id===stagedFile.id);
  assert.equal(restored.data.status,'review_required');
  assert.equal(restored.data.reviewedBy,undefined);
  await client.get(base+'/files/'+stagedFile.id).expect(200);
  await client.post(base+'/upload').send({filename:'invalid.txt',stageKey:'another-tenant-stage',content:'dGVzdA=='}).expect(400);
  const clientPortfolio=(await client.get('/api/portfolio').expect(200)).body;
  assert.equal(clientPortfolio.length,1);
  assert.equal(clientPortfolio[0].id,tenant);
  await admin.post("/api/logout").expect(200);
  await admin.get("/api/me").expect(401);
});

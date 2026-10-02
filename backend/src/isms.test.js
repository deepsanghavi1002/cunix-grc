import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import express from "express";
import request from "supertest";
import { newDb } from "pg-mem";
import { pool } from "./db.js";
import { service } from "./service.js";
import { requirements } from "./isms-catalog.js";
import { evaluateSignals, runMonitor } from "./isms.js";

test("ISMS coverage includes 93 controls and 25 management topics without duplicates", () => {
  assert.equal(requirements.filter((r) => r.ref.startsWith("A.")).length, 93);
  assert.equal(requirements.length, 118);
  assert.equal(new Set(requirements.map((r) => r.ref)).size, 118);
});
test("monitoring never treats unreviewed or expired evidence as current", () => {
  const rows = [
    { id: "c", kind: "controls", data: { applicable: true } },
    {
      id: "d",
      kind: "documents",
      data: {
        status: "approved",
        reviewedAt: "2026-01-01",
        controlId: "c",
        expiresAt: "2026-01-01",
        description: "[DECISION REQUIRED]",
      },
    },
  ];
  const signals = evaluateSignals(
    rows,
    [{ data: { dueDate: "2026-01-01" } }],
    {},
    "2026-02-01",
  );
  for (const key of [
    "profile",
    "expired",
    "coverage",
    "placeholders",
    "recurrence",
  ])
    assert.equal(signals.find((s) => s.key === key).status, "attention");
  rows[1].data.expiresAt = "2027-01-01";
  rows[1].data.description = "Reviewed operational record";
  assert.equal(
    evaluateSignals(
      rows,
      [],
      { services: "SaaS", coordinator: "A", sponsor: "B" },
      "2026-02-01",
    ).find((s) => s.key === "coverage").status,
    "clear",
  );
});
test("guided service isolates tenants, preserves reviews and schedules accepted evidence cycles", async (context) => {
  if (process.env.TEST_REAL_DATABASE === "true")
    context.after(() => pool.end());
  else {
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
    client = request.agent(app),
    other = request.agent(app),
    auditor = request.agent(app);
  const account = {
    email: "isms-owner@example.com",
    password: "a-long-test-password",
    name: "ISMS Owner",
    company: "ISMS Pilot",
  };
  await admin.post("/api/register").send(account).expect(201);
  await admin.post("/api/login").send(account).expect(200);
  const tenant = (await admin.get("/api/me")).body.workspaces[0].id,
    base = `/api/workspaces/${tenant}`,
    iso = base + "/isms";
  await other
    .post("/api/register")
    .send({ ...account, email: "isms-other@example.com" })
    .expect(201);
  await other
    .post("/api/login")
    .send({ ...account, email: "isms-other@example.com" })
    .expect(200);
  await other.get(iso).expect(403);
  await other
    .post(iso + "/activate")
    .send({})
    .expect(403);
  for (const [agent, role] of [
    [client, "client"],
    [auditor, "auditor"],
  ]) {
    await admin
      .post(base + "/members")
      .send({
        email: `isms-${role}@example.com`,
        password: account.password,
        name: role,
        role,
      })
      .expect(201);
    await agent
      .post("/api/login")
      .send({ email: `isms-${role}@example.com`, password: account.password })
      .expect(200);
  }
  await client
    .post(iso + "/activate")
    .send({})
    .expect(403);
  await auditor
    .post(iso + "/sites")
    .send({ name: "x" })
    .expect(403);
  await admin
    .post(iso + "/activate")
    .send({})
    .expect(201);
  await admin
    .post(iso + "/activate")
    .send({})
    .expect(201);
  let state = (await client.get(iso).expect(200)).body;
  assert.equal(state.coverage.length, 118);
  assert.equal(state.routines.length, 8);
  assert.equal(state.signals.length, 7);
  assert.equal(
    (await admin.get(base + "/records")).body.filter(
      (r) => r.kind === "controls",
    ).length,
    118,
  );
  await client
    .post(iso + "/drafts/scope")
    .send({})
    .expect(400);
  await client
    .patch(iso + "/profile")
    .send({
      services: "Payroll SaaS",
      information: "Employee records",
      coordinator: "Pat",
      sponsor: "Chris",
    })
    .expect(200);
  const draft = (
    await client
      .post(iso + "/drafts/scope")
      .send({})
      .expect(201)
  ).body.id;
  assert.equal(
    (
      await client
        .post(iso + "/drafts/scope")
        .send({})
        .expect(201)
    ).body.id,
    draft,
  );
  await admin
    .patch(base + "/records/" + draft)
    .send({ status: "approved", reviewNote: "Incomplete" })
    .expect(400);
  const site = (
    await client
      .post(iso + "/sites")
      .send({ name: "Mumbai", owner: "Pat", type: "office" })
      .expect(201)
  ).body.id;
  await client
    .patch(iso + "/routines/access")
    .send({ days: 30 })
    .expect(403);
  await admin
    .patch(iso + "/routines/access")
    .send({ days: 0 })
    .expect(400);
  await admin
    .patch(iso + "/routines/access")
    .send({ dueDate: "2026-02-30" })
    .expect(400);
  await admin
    .patch(iso + "/routines/access")
    .send({ siteId: "00000000-0000-0000-0000-000000000000" })
    .expect(400);
  await admin
    .patch(iso + "/routines/access")
    .send({ siteId: site, days: 30 })
    .expect(200);
  const doc = (
    await client
      .post(base + "/records/documents")
      .send({
        title: "Access review",
        description: "Accounts reviewed and removals verified.",
        expiresAt: "2099-01-01",
      })
      .expect(201)
  ).body.id;
  const collectedOn = new Date().toISOString().slice(0, 10);
  await client
    .post(iso + "/routines/access/submit")
    .send({ documentId: doc, collectedOn: "2000-01-01" })
    .expect(400);
  await client
    .post(iso + "/routines/access/submit")
    .send({ documentId: draft, collectedOn, note: "draft" })
    .expect(200);
  await admin
    .post(iso + "/routines/access/review")
    .send({ decision: "accept", note: "Not approved" })
    .expect(409);
  await client
    .post(iso + "/routines/access/submit")
    .send({ documentId: doc, collectedOn, note: "Quarterly review" })
    .expect(200);
  await client
    .post(iso + "/routines/access/review")
    .send({ decision: "accept", note: "Self review" })
    .expect(403);
  await admin
    .patch(base + "/records/" + doc)
    .send({ status: "approved", reviewNote: "Operating evidence verified" })
    .expect(200);
  await admin
    .post(iso + "/routines/access/review")
    .send({ decision: "accept", note: "Population and exceptions checked" })
    .expect(200);
  state = (await client.get(iso)).body;
  const access = state.routines.find((r) => r.key === "access").data;
  assert.equal(access.status, "scheduled");
  assert.equal(access.history.length, 1);
  assert.ok(access.dueDate > collectedOn);
  assert.equal(access.siteId, site);
  await admin
    .post(iso + "/routines/access/review")
    .send({ decision: "accept", note: "Repeated" })
    .expect(409);
  // A privileged submitter still cannot approve their own cycle.
  await admin
    .post(iso + "/routines/restore/submit")
    .send({ documentId: doc, collectedOn, note: "Own submission" })
    .expect(200);
  await admin
    .post(iso + "/routines/restore/review")
    .send({ decision: "accept", note: "Self approval" })
    .expect(403);
  // Changed evidence must be resubmitted even if independently approved again.
  await client
    .post(iso + "/routines/restore/submit")
    .send({ documentId: doc, collectedOn, note: "Client submission" })
    .expect(200);
  await client
    .patch(base + "/records/" + doc)
    .send({ description: "Changed content" })
    .expect(200);
  await admin
    .patch(base + "/records/" + doc)
    .send({ status: "approved", reviewNote: "New version reviewed" })
    .expect(200);
  await admin
    .post(iso + "/routines/restore/review")
    .send({ decision: "accept", note: "Stale submission" })
    .expect(409);
  await admin
    .post(iso + "/routines/restore/review")
    .send({ decision: "changes", note: "Submit current version" })
    .expect(200);
  await client
    .post(iso + "/monitor")
    .send({})
    .expect(403);
  await admin
    .post(iso + "/monitor")
    .send({})
    .expect(200);
  await admin
    .post(iso + "/monitor")
    .send({})
    .expect(200);
  assert.equal((await admin.get(iso)).body.signals.length, 7);
  assert.equal(await runMonitor(tenant, { dueOnly: true }), null);
  await admin
    .patch(iso + "/monitor")
    .send({ enabled: false })
    .expect(200);
  assert.equal(await runMonitor(tenant, { dueOnly: true }), null);
  await admin
    .patch(iso + "/monitor")
    .send({ enabled: true })
    .expect(200);
  assert.ok(
    await runMonitor(tenant, {
      dueOnly: true,
      now: new Date(Date.now() + 1000),
    }),
  );
  const portfolio = (await client.get("/api/portfolio")).body;
  assert.equal(portfolio.length, 1);
  assert.equal(portfolio[0].program.active, true);
  await other.get(iso).expect(403);
  await client
    .post(iso + "/collector")
    .send({})
    .expect(403);
  const credential = (
    await admin
      .post(iso + "/collector")
      .send({})
      .expect(201)
  ).body.token;
  const ingest = `/api/collect/${tenant}`;
  const observation = {
    key: "github.example.main",
    title: "Example branch protection",
    status: "pass",
    detail: "Protection enabled",
    observedAt: new Date().toISOString(),
    source: "github-branch-protection",
  };
  await request(app).post(ingest).send(observation).expect(401);
  await request(app)
    .post(ingest)
    .set("Authorization", `Bearer ${credential}`)
    .send({ ...observation, observedAt: "2000-01-01" })
    .expect(400);
  await request(app)
    .post(ingest)
    .set("Authorization", `Bearer ${credential}`)
    .send(observation)
    .expect(202);
  assert.equal(
    (
      await request(app)
        .post(ingest)
        .set("Authorization", `Bearer ${credential}`)
        .send(observation)
        .expect(200)
    ).body.ignored,
    true,
  );
  const otherTenant = (await other.get("/api/me")).body.workspaces[0].id;
  await request(app)
    .post(`/api/collect/${otherTenant}`)
    .set("Authorization", `Bearer ${credential}`)
    .send(observation)
    .expect(401);
  const config = (await client.get(iso + "/collector")).body;
  assert.equal(config.observations.length, 1);
  assert.equal(config.config.token_hash, undefined);
  await admin
    .post(iso + "/monitor")
    .send({})
    .expect(200);
  assert.equal(
    (await client.get(iso)).body.signals.find((s) => s.key === "collector")
      .status,
    "clear",
  );
  await runMonitor(tenant, { now: new Date(Date.now() + 27 * 3600000) });
  assert.equal(
    (await client.get(iso)).body.signals.find((s) => s.key === "collector")
      .status,
    "attention",
  );
  await admin.delete(iso + "/collector").expect(200);
  await request(app)
    .post(ingest)
    .set("Authorization", `Bearer ${credential}`)
    .send(observation)
    .expect(401);
});

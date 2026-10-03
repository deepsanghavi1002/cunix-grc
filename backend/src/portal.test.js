import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { newDb } from "pg-mem";
import { pool as realPool } from "./db.js";
import { service, passwordHash } from "./service.js";
import { normalizeAdvice, guideMessages } from "./guide.js";

test("guide validates references and task IDs, caps proposals and never trusts executable output", () => {
  const result = normalizeAdvice(
    {
      answer: "Use the existing baseline.",
      tasks: [
        {
          title: "Review access",
          description: "Check the account list.",
          controlRef: "invented",
          dueInDays: -3,
          phase: "execute",
        },
      ],
      updates: [
        { taskId: "foreign", reason: "close everything", status: "resolved" },
        { taskId: "known", reason: "A revised review period", dueInDays: 14 },
      ],
      execute: "delete all",
    },
    { controlRefs: ["A.5.15"], tasks: [{ id: "known" }] },
  );
  assert.equal(result.tasks[0].controlRef, "");
  assert.equal(result.tasks[0].dueInDays, 7);
  assert.equal(result.tasks[0].phase, "operation");
  assert.equal(result.updates.length, 1);
  assert.equal(result.execute, undefined);
  assert.equal(result.updates[0].status, undefined);
  assert.match(
    guideMessages("Help me", { role: "employee" })[0].content,
    /you cannot approve evidence/,
  );
  assert.throws(() => normalizeAdvice({ answer: "" }, {}));
});
test("client journey, restricted employee tasks, evidence review, AI task management and preservation of later work", async (context) => {
  let pool = realPool;
  if (process.env.TEST_REAL_DATABASE === "true")
    context.after(() => pool.end());
  else {
    const mem = newDb();
    mem.public.none(
      "CREATE TABLE tenants(id UUID PRIMARY KEY,name TEXT NOT NULL,slug TEXT UNIQUE NOT NULL)",
    );
    mem.public.none(
      await readFile(new URL("../db/service.sql", import.meta.url), "utf8"),
    );
    pool = new (mem.adapters.createPg().Pool)();
    realPool.query = pool.query.bind(pool);
    realPool.connect = pool.connect.bind(pool);
  }
  // A distinct fixture slug avoids interference with the comprehensive sample's real-PostgreSQL test.
  const actor = randomUUID(),
    email = actor + "@portal.invalid",
    tenant = randomUUID();
  await pool.query("INSERT INTO service_users VALUES($1,$2,$3,$4)", [
    actor,
    email,
    passwordHash("PortalTestPassword123!"),
    "Consultant test",
  ]);
  await pool.query("INSERT INTO tenants VALUES($1,$2,$3)", [
    tenant,
    "Portal fixture",
    tenant,
  ]);
  await pool.query("INSERT INTO service_memberships VALUES($1,$2,'admin')", [
    actor,
    tenant,
  ]);
  const app = express();
  app.use(express.json({ limit: "8mb" }));
  app.use("/api", service);
  app.use((e, _q, r, _n) => {
    if (!e.status) console.error(e.message);
    r.status(e.status || 500).json({ error: e.message });
  });
  const admin = request.agent(app);
  await admin
    .post("/api/login")
    .send({ email, password: "PortalTestPassword123!" })
    .expect(200);
  const base = "/api/workspaces/" + tenant;
  await admin
    .post(base + "/isms/activate")
    .send({})
    .expect(201);
  const first = await admin
    .post(base + "/portal/journey")
    .send({ mode: "existing" })
    .expect(201);
  assert.equal(first.body.taskIds.length, 4);
  await admin
    .post(base + "/portal/journey")
    .send({ mode: "existing" })
    .expect(200);
  await admin
    .post(base + "/portal/journey")
    .send({ mode: "new" })
    .expect(409);
  const employeeEmail = randomUUID() + "@portal.invalid";
  const employeeId = (
    await admin
      .post(base + "/members")
      .send({
        name: "Employee test",
        email: employeeEmail,
        password: "PortalTestPassword123!",
        role: "employee",
      })
      .expect(201)
  ).body.id;
  const clientEmail = randomUUID() + "@portal.invalid";
  const clientId = (
    await admin
      .post(base + "/members")
      .send({
        name: "Coordinator test",
        email: clientEmail,
        password: "PortalTestPassword123!",
        role: "client",
      })
      .expect(201)
  ).body.id;
  const employee = request.agent(app);
  await employee
    .post("/api/login")
    .send({ email: employeeEmail, password: "PortalTestPassword123!" })
    .expect(200);
  const client = request.agent(app);
  await client
    .post("/api/login")
    .send({ email: clientEmail, password: "PortalTestPassword123!" })
    .expect(200);
  for (const route of [
    "/records",
    "/members",
    "/export",
    "/isms",
    "/isms/collector",
    "/stages",
    "/acknowledgements",
  ])
    await employee.get(base + route).expect(403);
  await employee
    .post(base + "/portal/tasks")
    .send({ title: "Unapproved employee task" })
    .expect(403);
  const snapshot = (await employee.get(base + "/portal").expect(200)).body;
  assert.equal(snapshot.tasks.length, 0);
  assert.deepEqual(snapshot.members, []);
  assert.deepEqual(snapshot.controls, []);
  assert.equal(snapshot.readiness, null);
  const task = (
    await admin
      .post(base + "/portal/tasks")
      .send({
        title: "Perform a recovery test",
        assigneeId: employeeId,
        dueDate: "2026-12-01",
        description: "Capture the restoration result.",
      })
      .expect(201)
  ).body.id;
  await employee
    .get(base + "/portal/tasks/" + first.body.taskIds[0])
    .expect(404);
  const other = (
    await admin
      .post("/api/workspaces")
      .send({ company: "Other isolated client" })
      .expect(201)
  ).body.id;
  await employee.get("/api/workspaces/" + other + "/portal").expect(403);
  await admin
    .post(base + "/portal/tasks")
    .send({ title: "Invalid foreign owner", assigneeId: randomUUID() })
    .expect(400);
  await admin
    .post(base + "/portal/tasks")
    .send({ title: "Invalid date", dueDate: "2026-02-30" })
    .expect(400);
  await employee
    .patch(base + "/portal/tasks/" + task)
    .send({ assigneeId: actor })
    .expect(403);
  await employee
    .patch(base + "/portal/tasks/" + task)
    .send({ status: "resolved", note: "Approve myself" })
    .expect(403);
  await employee
    .patch(base + "/portal/tasks/" + task)
    .send({ status: "in_progress" })
    .expect(200);
  await employee
    .post(base + "/portal/tasks/" + task + "/evidence")
    .send({
      filename: "recovery.txt",
      content: Buffer.from(
        "Restoration test completed, result recorded.",
      ).toString("base64"),
      expiresAt: "2027-01-01",
    })
    .expect(201);
  const detail = (
    await employee.get(base + "/portal/tasks/" + task).expect(200)
  ).body;
  assert.equal(detail.evidence.status, "review_required");
  await employee
    .get(base + "/portal/tasks/" + task + "/files/" + detail.evidence.id)
    .expect(200);
  await employee.get(base + "/files/" + detail.evidence.id).expect(403);
  await employee
    .patch(base + "/portal/tasks/" + task)
    .send({
      status: "in_review",
      note: "Recovery exercise performed; result attached.",
    })
    .expect(200);
  await client
    .patch(base + "/portal/tasks/" + task)
    .send({ status: "resolved", note: "Not a reviewer" })
    .expect(403);
  await admin
    .patch(base + "/records/" + task)
    .send({ status: "resolved" })
    .expect(409);
  await admin
    .patch(base + "/portal/tasks/" + task)
    .send({ status: "resolved", note: "Original reviewed, result accepted." })
    .expect(400);
  await admin
    .patch(base + "/portal/tasks/" + task)
    .send({
      status: "resolved",
      note: "Original reviewed, result accepted.",
      evidenceDecision: "approved",
    })
    .expect(200);
  assert.equal(
    (await employee.get(base + "/portal/tasks/" + task).expect(200)).body
      .evidence.status,
    "approved",
  );
  await admin
    .patch(base + "/portal/tasks/" + task)
    .send({ status: "in_progress" })
    .expect(200);
  const self = (
    await admin
      .post(base + "/portal/tasks")
      .send({ title: "Self review guard", assigneeId: actor })
      .expect(201)
  ).body.id;
  await admin
    .patch(base + "/portal/tasks/" + self)
    .send({ status: "in_review", note: "I completed this." })
    .expect(200);
  await admin
    .patch(base + "/portal/tasks/" + self)
    .send({ status: "resolved", note: "I approve myself." })
    .expect(403);
  const policy = (
    await admin
      .post(base + "/records/policies")
      .send({
        title: "Published staff policy",
        description: "Read these published security rules.",
      })
      .expect(201)
  ).body.id;
  await admin
    .patch(base + "/records/" + policy)
    .send({ status: "approved", reviewNote: "Policy reviewed" })
    .expect(200);
  await employee
    .post(base + "/records/" + policy + "/acknowledge")
    .send({})
    .expect(200);
  assert.equal(
    (await employee.get(base + "/portal").expect(200)).body.policies.find(
      (p) => p.id === policy,
    ).acknowledged,
    true,
  );
  const oldFetch = globalThis.fetch,
    oldKey = process.env.FIREWORKS_API_KEY;
  process.env.FIREWORKS_API_KEY = "mock-provider-key";
  let calls = 0;
  globalThis.fetch = async (_url, opts) => {
    calls++;
    const payload = JSON.parse(opts.body);
    assert.ok(!JSON.stringify(payload).includes("Restoration test completed"));
    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                answer:
                  "Review the existing ISMS and retain accepted documents.",
                nextSteps: ["Assign a review owner."],
                tasks: [
                  {
                    title: "Confirm upcoming supplier review",
                    description:
                      "Confirm the supplier review date and evidence needed.",
                    dueInDays: 14,
                    phase: "operation",
                  },
                ],
              }),
            },
          },
        ],
      }),
      { status: 200 },
    );
  };
  context.after(() => {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.FIREWORKS_API_KEY;
    else process.env.FIREWORKS_API_KEY = oldKey;
  });
  await admin
    .post(base + "/portal/guide")
    .send({ question: "Next steps?", requestId: randomUUID() })
    .expect(403);
  await admin
    .patch(base + "/portal/ai-settings")
    .send({ enabled: true })
    .expect(200);
  const requestId = randomUUID(),
    turn = (
      await admin
        .post(base + "/portal/guide")
        .send({ question: "Plan my next activities", requestId })
        .expect(201)
    ).body;
  await admin
    .post(base + "/portal/guide")
    .send({ question: "Repeated click", requestId })
    .expect(200);
  assert.equal(calls, 1);
  assert.equal(turn.data.tasks.length, 1);
  const created = (
    await admin
      .post(base + "/portal/guide/" + turn.id + "/tasks")
      .send({ indexes: [0], assigneeId: employeeId })
      .expect(201)
  ).body.ids;
  assert.equal(created.length, 1);
  assert.deepEqual(
    (
      await admin
        .post(base + "/portal/guide/" + turn.id + "/tasks")
        .send({ indexes: [0] })
        .expect(200)
    ).body.ids,
    created,
  );
  await client
    .post(base + "/portal/guide/" + turn.id + "/tasks")
    .send({ indexes: [0] })
    .expect(404);
  await employee
    .post(base + "/portal/guide/" + turn.id + "/tasks")
    .send({ indexes: [0] })
    .expect(403);
  await employee
    .post(base + "/portal/tasks/" + created[0] + "/comments")
    .send({ body: "I have started checking the supplier dates." })
    .expect(201);
  await admin
    .post(base + "/portal/guide/" + turn.id + "/undo")
    .send({})
    .expect(409);
  const cleanTurn = (
    await admin
      .post(base + "/portal/guide")
      .send({ question: "One more action", requestId: randomUUID() })
      .expect(201)
  ).body;
  // Change its proposed title to avoid the intentional duplicate-task guard.
  await pool.query("UPDATE service_guide_turns SET data=$1 WHERE id=$2", [
    {
      ...cleanTurn.data,
      tasks: [
        { ...cleanTurn.data.tasks[0], title: "Separate untouched follow-up" },
      ],
    },
    cleanTurn.id,
  ]);
  const untouched = (
    await admin
      .post(base + "/portal/guide/" + cleanTurn.id + "/tasks")
      .send({ indexes: [0] })
      .expect(201)
  ).body.ids;
  await admin
    .post(base + "/portal/guide/" + cleanTurn.id + "/undo")
    .send({})
    .expect(200);
  await admin.get(base + "/portal/tasks/" + untouched[0]).expect(404);
  await admin
    .patch(base + "/portal/tasks/" + task)
    .send({ assigneeId: clientId })
    .expect(200);
  await employee.get(base + "/portal/tasks/" + task).expect(404);
  await employee
    .get(base + "/portal/tasks/" + task + "/files/" + detail.evidence.id)
    .expect(404);
  const target = first.body.taskIds[0];
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                answer: "Revise the instructions for the agreed review.",
                tasks: [],
                updates: [
                  {
                    taskId: target,
                    reason: "Requested a clearer baseline review.",
                    description:
                      "Review existing applicability with the coordinator.",
                    dueInDays: 10,
                  },
                ],
              }),
            },
          },
        ],
      }),
      { status: 200 },
    );
  const updateTurn = (
    await admin
      .post(base + "/portal/guide")
      .send({ question: "Clarify this baseline task", requestId: randomUUID() })
      .expect(201)
  ).body;
  await admin
    .post(base + "/portal/guide/" + updateTurn.id + "/updates")
    .send({})
    .expect(200);
  await admin
    .post(base + "/portal/guide/" + updateTurn.id + "/updates")
    .send({})
    .expect(200);
  await admin
    .post(base + "/portal/guide/" + updateTurn.id + "/undo-updates")
    .send({})
    .expect(200);
  await admin
    .post(base + "/portal/guide/" + updateTurn.id + "/undo-updates")
    .send({})
    .expect(200);
  const stale = (
    await admin
      .post(base + "/portal/guide")
      .send({ question: "Another suggested change", requestId: randomUUID() })
      .expect(201)
  ).body;
  await admin
    .patch(base + "/portal/tasks/" + target)
    .send({ description: "Later human work must remain." })
    .expect(200);
  await admin
    .post(base + "/portal/guide/" + stale.id + "/updates")
    .send({})
    .expect(409);
  const changedPlan = (
    await admin
      .post(base + "/portal/guide")
      .send({ question: "Propose another update", requestId: randomUUID() })
      .expect(201)
  ).body;
  await admin
    .post(base + "/portal/guide/" + changedPlan.id + "/updates")
    .send({})
    .expect(200);
  await admin
    .post(base + "/portal/tasks/" + target + "/comments")
    .send({ body: "Later work after the suggested update." })
    .expect(201);
  await admin
    .post(base + "/portal/guide/" + changedPlan.id + "/undo-updates")
    .send({})
    .expect(409);
  assert.equal(
    (await admin.get(base + "/portal/tasks/" + target).expect(200)).body.task
      .data.description,
    "Review existing applicability with the coordinator.",
  );
  const employeeTurn = (
    await employee
      .post(base + "/portal/guide")
      .send({ question: "Help me with my actions", requestId: randomUUID() })
      .expect(201)
  ).body;
  assert.deepEqual(employeeTurn.data.tasks, []);
  assert.deepEqual(employeeTurn.data.updates, []);
  assert.equal(
    (await employee.get(base + "/portal/guide").expect(200)).body.length,
    1,
  );
  globalThis.fetch = async () =>
    new Response("provider failed", { status: 503 });
  await admin
    .post(base + "/portal/guide")
    .send({ question: "Provider failure test", requestId: randomUUID() })
    .expect(503);
});

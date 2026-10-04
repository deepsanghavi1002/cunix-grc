import { AI_MODES, modelForMode } from './ai-models.js';
import { Router } from "express";
import { randomUUID, createHash } from "node:crypto";
import { pool } from "./db.js";
import {
  phases,
  normalizeAdvice,
  guideMessages,
  providerAdvice,
} from "./guide.js";
import { extract } from "./extract.js";
import { readiness } from "./readiness.js";
export const portal = Router({ mergeParams: true });
const route = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res)).catch(next);
const fail = (status, message) => Object.assign(Error(message), { status });
const reviewer = (req) => ["admin", "reviewer"].includes(req.role);
const manage = (req) => ["admin", "reviewer", "client"].includes(req.role);
const clean = (s, max = 1800) =>
  typeof s === "string" ? s.trim().slice(0, max) : "";
const guidePending = new Set(),
  guideAttempts = new Map();
const today = () => new Date().toISOString().slice(0, 10);
const assigned = (r, user) => r.data.assigneeId === user.id;
async function event(db, req, action, id) {
  await db.query(
    "INSERT INTO service_events(id,tenant_id,actor_id,action,record_id) VALUES($1,$2,$3,$4,$5)",
    [randomUUID(), req.tenant, req.user.id, action, id],
  );
}
async function task(db, req, id, lock = false) {
  const result = await db.query(
    "SELECT * FROM service_records WHERE id=$1 AND tenant_id=$2 AND kind='tasks' AND deleted_at IS NULL" +
      (lock ? " FOR UPDATE" : ""),
    [id, req.tenant],
  );
  const r = result.rows[0];
  if (!r || (req.role === "employee" && !assigned(r, req.user)))
    throw fail(404, "Task not found.");
  return r;
}
async function member(db, req, id) {
  if (!id) return null;
  const r = await db.query(
    "SELECT u.id,u.name,m.role FROM service_users u JOIN service_memberships m ON m.user_id=u.id WHERE m.tenant_id=$1 AND u.id=$2",
    [req.tenant, id],
  );
  if (!r.rows[0] || r.rows[0].role === "auditor")
    throw fail(400, "Choose an active member of this client workspace.");
  return r.rows[0];
}
async function insertTask(db, req, value, source = {}) {
  const title = clean(value.title, 180);
  if (!title) throw fail(400, "Task title required.");
  const owner = await member(db, req, value.assigneeId),
    dueDate =
      value.dueDate ||
      new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
    !Number.isFinite(Date.parse(dueDate)) ||
    new Date(dueDate + "T12:00:00Z").toISOString().slice(0, 10) !== dueDate
  )
    throw fail(400, "Choose a valid due date.");
  if (value.controlId) {
    const c = await db.query(
      "SELECT id FROM service_records WHERE id=$1 AND tenant_id=$2 AND kind='controls' AND deleted_at IS NULL",
      [value.controlId, req.tenant],
    );
    if (!c.rows[0]) throw fail(400, "Control must belong to this workspace.");
  }
  const id = randomUUID(),
    data = {
      title,
      description: clean(value.description),
      owner: owner?.name || "Unassigned",
      assigneeId: owner?.id || "",
      dueDate,
      status: "not_started",
      controlId: value.controlId || "",
      phase: phases.some((p) => p.key === value.phase)
        ? value.phase
        : "operation",
      createdById: req.user.id,
      taskManaged: true,
      ...source,
    };
  await db.query(
    "INSERT INTO service_records(id,tenant_id,kind,data) VALUES($1,$2,$3,$4)",
    [id, req.tenant, "tasks", data],
  );
  await event(db, req, "task.created", id);
  return id;
}
export async function portalSnapshot(req) {
  const records = (
    await pool.query(
      "SELECT id,kind,data,updated_at FROM service_records WHERE tenant_id=$1 AND deleted_at IS NULL",
      [req.tenant],
    )
  ).rows;
  const program = (
    await pool.query(
      "SELECT profile FROM service_programs WHERE tenant_id=$1",
      [req.tenant],
    )
  ).rows[0];
  const employee = req.role === "employee",
    tasks = records.filter(
      (r) => r.kind === "tasks" && (!employee || assigned(r, req.user)),
    );
  const acknowledgements = (
    await pool.query(
      "SELECT record_id,version FROM service_acknowledgements WHERE tenant_id=$1 AND user_id=$2",
      [req.tenant, req.user.id],
    )
  ).rows;
  const policies = records
    .filter((r) => r.kind === "policies" && r.data.status === "approved")
    .map((r) => ({
      id: r.id,
      title: r.data.title,
      description: r.data.description || "",
      version: r.data.version || 1,
      acknowledged: acknowledgements.some(
        (a) => a.record_id === r.id && a.version === (r.data.version || 1),
      ),
    }));
  const stages = employee
    ? []
    : (
        await pool.query(
          "SELECT key,status,data FROM service_stages WHERE tenant_id=$1",
          [req.tenant],
        )
      ).rows;
  const routines = employee
    ? []
    : (
        await pool.query(
          "SELECT key,data FROM service_routines WHERE tenant_id=$1",
          [req.tenant],
        )
      ).rows;
  const members = employee
    ? []
    : (
        await pool.query(
          "SELECT u.id,u.name,m.role FROM service_users u JOIN service_memberships m ON m.user_id=u.id WHERE m.tenant_id=$1 AND m.role!='auditor' ORDER BY u.name",
          [req.tenant],
        )
      ).rows;
  const name =
    (await pool.query("SELECT name FROM tenants WHERE id=$1", [req.tenant]))
      .rows[0]?.name || "Client";
  const report = employee ? null : readiness(records);
  const profile = program?.profile || {};
  return {
    name,
    role: req.role,
    userId: req.user.id,
    scope: employee
      ? null
      : {
          services: clean(profile.services, 1200),
          industry: clean(profile.industry, 100),
        },
    mode: profile.journeyMode || "",
    phases,
    stages,
    routines,
    tasks,
    policies,
    members,
    controls: employee
      ? []
      : records
          .filter((r) => r.kind === "controls")
          .map((r) => ({
            id: r.id,
            title: r.data.title,
            reference: r.data.reference,
          })),
    readiness: report
      ? { applicable: report.applicable, ready: report.ready }
      : null,
    ai: {
      configured: Boolean(process.env.FIREWORKS_API_KEY),
      enabled: profile.aiGuideEnabled === true,
      mode:profile.aiGuideMode||"default",model:modelForMode(profile.aiGuideMode),modes:AI_MODES,
    },
    sample: profile.sample === true,
  };
}
portal.get(
  "/portal",
  route(async (req, res) => res.json(await portalSnapshot(req))),
);
portal.post(
  "/portal/journey",
  route(async (req, res) => {
    if (!manage(req))
      throw fail(403, "Client coordinator or consultant access required.");
    if (!["new", "existing"].includes(req.body.mode))
      throw fail(400, "Choose new implementation or existing ISMS.");
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const p = await db.query(
        "SELECT profile FROM service_programs WHERE tenant_id=$1 FOR UPDATE",
        [req.tenant],
      );
      if (!p.rows[0])
        throw fail(
          400,
          "Ask your CUNIX consultant to activate the ISMS program first.",
        );
      if (p.rows[0].profile.journeyMode) {
        if (p.rows[0].profile.journeyMode !== req.body.mode)
          throw fail(
            409,
            "The journey is already configured. Ask CUNIX to review a change in starting point.",
          );
        await db.query("COMMIT");
        return res.json({ reused: true });
      }
      await db.query(
        "UPDATE service_programs SET profile=$1 WHERE tenant_id=$2",
        [
          {
            ...p.rows[0].profile,
            journeyMode: req.body.mode,
            journeyStartedAt: new Date().toISOString(),
          },
          req.tenant,
        ],
      );
      const titles =
        req.body.mode === "existing"
          ? [
              "Review the existing scope and applicability baseline",
              "Confirm owners and register completeness",
              "Review current policies and evidence validity",
              "Set recurring reviews and the next audit date",
            ]
          : [
              "Agree the ISMS scope and boundaries",
              "Assign owners and establish the risk and asset registers",
              "Prepare and review required policies",
              "Implement processes and collect operating evidence",
            ];
      const ids = [];
      for (let i = 0; i < titles.length; i++)
        ids.push(
          await insertTask(
            db,
            req,
            {
              title: titles[i],
              phase: phases[i].key,
              description:
                req.body.mode === "existing"
                  ? "Reuse the accepted baseline. Record missing, expired or changed items and obtain a reviewer decision; do not recreate valid approved documents."
                  : "Work with the assigned CUNIX consultant. Record actual client decisions and operating evidence; templates alone are not evidence.",
            },
            { journeyStarter: true },
          ),
        );
      await event(db, req, "journey.started");
      await db.query("COMMIT");
      res.status(201).json({ taskIds: ids });
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  }),
);
portal.patch(
  "/portal/ai-settings",
  route(async (req, res) => {
    if (!reviewer(req))
      throw fail(403, "CUNIX administrator or reviewer access required.");
    if(req.body.mode!==undefined&&!AI_MODES.some(m=>m.id===req.body.mode))throw fail(400,"Choose a supported AI model mode.");
    if(req.body.mode!==undefined&&req.role!=="admin")throw fail(403,"Workspace administrator access required to change the model.");
    if (req.body.mode===undefined&&typeof req.body.enabled !== "boolean")
      throw fail(400, "Choose enabled or disabled.");
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const p = (
        await db.query(
          "SELECT profile FROM service_programs WHERE tenant_id=$1 FOR UPDATE",
          [req.tenant],
        )
      ).rows[0];
      if (!p) throw fail(400, "Activate ISMS first.");
      await db.query(
        "UPDATE service_programs SET profile=$1 WHERE tenant_id=$2",
        [{ ...p.profile, aiGuideEnabled: typeof req.body.enabled==="boolean"?req.body.enabled:p.profile.aiGuideEnabled, aiGuideMode:req.body.mode||p.profile.aiGuideMode||"default" }, req.tenant],
      );
      await event(
        db,
        req,
        req.body.mode?"guide.model_changed":req.body.enabled ? "guide.enabled" : "guide.disabled",
      );
      await db.query("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  }),
);
portal.post(
  "/portal/tasks",
  route(async (req, res) => {
    if (!manage(req))
      throw fail(403, "Coordinator or consultant access required.");
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const id = await insertTask(db, req, req.body);
      await db.query("COMMIT");
      res.status(201).json({ id });
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  }),
);
portal.get(
  "/portal/tasks/:id",
  route(async (req, res) => {
    const r = await task(pool, req, req.params.id);
    const comments = (
      await pool.query(
        "SELECT c.id,c.body,c.created_at,u.name FROM service_task_comments c JOIN service_users u ON u.id=c.actor_id WHERE c.tenant_id=$1 AND c.task_id=$2 ORDER BY c.created_at",
        [req.tenant, r.id],
      )
    ).rows;
    const evidence = r.data.documentId
      ? (
          await pool.query(
            "SELECT id,data FROM service_records WHERE tenant_id=$1 AND id=$2 AND kind='documents' AND deleted_at IS NULL",
            [req.tenant, r.data.documentId],
          )
        ).rows[0]
      : null;
    res.json({
      task: r,
      comments,
      evidence: evidence
        ? {
            id: evidence.id,
            title: evidence.data.title,
            status: evidence.data.status,
            description: evidence.data.description,
            checksum: evidence.data.checksum,
          }
        : null,
    });
  }),
);
portal.post(
  "/portal/tasks/:id/comments",
  route(async (req, res) => {
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      await task(db, req, req.params.id, true);
      const body = clean(req.body.body, 3000);
      if (!body) throw fail(400, "Write a note.");
      await db.query(
        "INSERT INTO service_task_comments(id,tenant_id,task_id,actor_id,body) VALUES($1,$2,$3,$4,$5)",
        [randomUUID(), req.tenant, req.params.id, req.user.id, body],
      );
      await event(db, req, "task.comment_added", req.params.id);
      await db.query("COMMIT");
      res.status(201).json({ ok: true });
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  }),
);
portal.patch(
  "/portal/tasks/:id",
  route(async (req, res) => {
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const r = await task(db, req, req.params.id, true),
        data = { ...r.data, taskManaged: true };
      if (
        Object.keys(req.body).some(
          (k) =>
            ![
              "title",
              "description",
              "dueDate",
              "assigneeId",
              "status",
              "note",
              "evidenceDecision",
            ].includes(k),
        )
      )
        throw fail(400, "Unsupported task update.");
      if (
        ["title", "description", "dueDate", "assigneeId"].some(
          (k) => req.body[k] !== undefined,
        ) &&
        !manage(req)
      )
        throw fail(
          403,
          "Only coordinators or consultants can change task assignments.",
        );
      for (const key of ["title", "description"])
        if (req.body[key] !== undefined) {
          data[key] = clean(req.body[key], key === "title" ? 180 : 1800);
          if (key === "title" && !data[key])
            throw fail(400, "Task title required.");
        }
      if (req.body.assigneeId !== undefined) {
        const m = await member(db, req, req.body.assigneeId);
        data.assigneeId = m?.id || "";
        data.owner = m?.name || "Unassigned";
      }
      if (req.body.dueDate !== undefined) {
        const d = req.body.dueDate;
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(d || "") ||
          !Number.isFinite(Date.parse(d)) ||
          new Date(d + "T12:00:00Z").toISOString().slice(0, 10) !== d
        )
          throw fail(400, "Choose a valid due date.");
        data.dueDate = d;
      }
      if (req.body.status !== undefined) {
        const status = req.body.status;
        if (
          !["in_progress", "in_review", "resolved", "not_started"].includes(
            status,
          )
        )
          throw fail(400, "Choose a valid task state.");
        if (
          req.role === "employee" &&
          !["in_progress", "in_review"].includes(status)
        )
          throw fail(
            403,
            "Submit your work for review; a reviewer completes it.",
          );
        if (r.data.status === "resolved" && !reviewer(req))
          throw fail(403, "Ask a reviewer to reopen this completed task.");
        if (
          status === "resolved" ||
          (status === "not_started" && r.data.status === "in_review")
        ) {
          if (!reviewer(req)) throw fail(403, "Reviewer decision required.");
          if (r.data.submittedById === req.user.id)
            throw fail(
              403,
              "A different reviewer must decide on your submission.",
            );
          if (!clean(req.body.note))
            throw fail(400, "Add a reviewer decision note.");
        }
        if (status === "resolved" && r.data.status !== "in_review")
          throw fail(400, "Submit the task for review before completing it.");
        if (status === "in_review") {
          if (!clean(req.body.note))
            throw fail(400, "Describe the work performed before submitting.");
          data.submittedById = req.user.id;
          data.submittedAt = new Date().toISOString();
        }
        if (status === "resolved" && data.documentId) {
          const evidence = (
            await db.query(
              "SELECT * FROM service_records WHERE id=$1 AND tenant_id=$2 AND kind='documents' AND deleted_at IS NULL FOR UPDATE",
              [data.documentId, req.tenant],
            )
          ).rows[0];
          if (!evidence) throw fail(400, "The linked evidence is missing.");
          if (evidence.data.status !== "approved") {
            if (req.body.evidenceDecision !== "approved")
              throw fail(
                400,
                "Review and approve the attached evidence before completing this task.",
              );
            if (/\[DECISION REQUIRED\]/.test(evidence.data.description || ""))
              throw fail(
                400,
                "Complete evidence placeholders before approval.",
              );
            await db.query(
              "INSERT INTO service_versions(id,tenant_id,record_id,actor_id,data) VALUES($1,$2,$3,$4,$5)",
              [
                randomUUID(),
                req.tenant,
                evidence.id,
                req.user.id,
                evidence.data,
              ],
            );
            await db.query(
              "UPDATE service_records SET data=$1,updated_at=now() WHERE id=$2 AND tenant_id=$3",
              [
                {
                  ...evidence.data,
                  status: "approved",
                  reviewedBy: req.user.name,
                  reviewedAt: new Date().toISOString(),
                  reviewNote: clean(req.body.note),
                },
                evidence.id,
                req.tenant,
              ],
            );
            await event(db, req, "documents.approved", evidence.id);
          }
        }
        data.status = status;
        if (status === "resolved") {
          data.reviewedById = req.user.id;
          data.reviewedAt = new Date().toISOString();
        } else {
          delete data.reviewedById;
          delete data.reviewedAt;
        }
      }
      if (
        req.body.evidenceDecision !== undefined &&
        req.body.status !== "resolved"
      )
        throw fail(
          400,
          "Evidence approval requires an explicit task review decision.",
        );
      await db.query(
        "INSERT INTO service_versions(id,tenant_id,record_id,actor_id,data) VALUES($1,$2,$3,$4,$5)",
        [randomUUID(), req.tenant, r.id, req.user.id, r.data],
      );
      await db.query(
        "UPDATE service_records SET data=$1,updated_at=now() WHERE id=$2 AND tenant_id=$3",
        [data, r.id, req.tenant],
      );
      if (clean(req.body.note))
        await db.query(
          "INSERT INTO service_task_comments(id,tenant_id,task_id,actor_id,body) VALUES($1,$2,$3,$4,$5)",
          [
            randomUUID(),
            req.tenant,
            r.id,
            req.user.id,
            clean(req.body.note, 3000),
          ],
        );
      await event(db, req, "task.updated", r.id);
      await db.query("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  }),
);
portal.post(
  "/portal/tasks/:id/evidence",
  route(async (req, res) => {
    const r = await task(pool, req, req.params.id);
    if (!manage(req) && req.role !== "employee")
      throw fail(403, "Task contributor access required.");
    if (r.data.status === "resolved")
      throw fail(
        400,
        "Ask a reviewer to reopen this task before uploading new evidence.",
      );
    const { filename, content } = req.body;
    if (
      typeof filename !== "string" ||
      filename.length > 200 ||
      typeof content !== "string" ||
      content.length > 7200000
    )
      throw fail(400, "Choose a supported file up to 5 MB.");
    const bytes = Buffer.from(content, "base64");
    if (!bytes.length || bytes.length > 5 * 1024 * 1024)
      throw fail(400, "Choose a supported file up to 5 MB.");
    let parsed;
    try {
      parsed = await extract(filename, bytes);
    } catch (e) {
      throw fail(400, e.message);
    }
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const current = await task(db, req, r.id, true);
      if (current.data.status === "resolved")
        throw fail(
          409,
          "This task was completed while the file was processed.",
        );
      const id = randomUUID(),
        checksum = createHash("sha256").update(bytes).digest("hex");
      const data = {
        title: filename,
        filename,
        description: parsed.text || parsed,
        status: "review_required",
        controlId: current.data.controlId || "",
        stageKey: "evidence",
        submittedBy: req.user.name,
        submittedById: req.user.id,
        checksum,
        fileSize: bytes.length,
        collectedOn: today(),
        expiresAt: clean(req.body.expiresAt, 10),
        taskId: r.id,
      };
      if (
        data.expiresAt &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(data.expiresAt) ||
          !Number.isFinite(Date.parse(data.expiresAt)))
      )
        throw fail(400, "Choose a valid evidence expiry date.");
      await db.query(
        "INSERT INTO service_records(id,tenant_id,kind,data) VALUES($1,$2,$3,$4)",
        [id, req.tenant, "documents", data],
      );
      await db.query("INSERT INTO service_files VALUES($1,$2,$3,$4,$5)", [
        id,
        req.tenant,
        filename,
        bytes,
        checksum,
      ]);
      await db.query(
        "INSERT INTO service_versions(id,tenant_id,record_id,actor_id,data) VALUES($1,$2,$3,$4,$5)",
        [randomUUID(), req.tenant, r.id, req.user.id, current.data],
      );
      await db.query(
        "UPDATE service_records SET data=$1,updated_at=now() WHERE id=$2 AND tenant_id=$3",
        [
          { ...current.data, documentId: id, status: "in_progress" },
          r.id,
          req.tenant,
        ],
      );
      await event(db, req, "task.evidence_uploaded", r.id);
      await db.query("COMMIT");
      res.status(201).json({ id });
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  }),
);
portal.get(
  "/portal/tasks/:id/files/:fileId",
  route(async (req, res) => {
    const r = await task(pool, req, req.params.id);
    if (r.data.documentId !== req.params.fileId)
      throw fail(404, "File not found.");
    const f = (
      await pool.query(
        "SELECT filename,content FROM service_files WHERE tenant_id=$1 AND record_id=$2",
        [req.tenant, req.params.fileId],
      )
    ).rows[0];
    if (!f) throw fail(404, "File not found.");
    res.set("Content-Type", "application/octet-stream");
    res.set(
      "Content-Disposition",
      `attachment; filename="${f.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
    );
    res.send(f.content);
  }),
);
portal.get(
  "/portal/guide",
  route(async (req, res) => {
    const rows = (
      await pool.query(
        "SELECT id,data,created_at FROM service_guide_turns WHERE tenant_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 12",
        [req.tenant, req.user.id],
      )
    ).rows;
    res.json(
      rows
        .reverse()
        .filter(
          (r) => req.role !== "employee" || r.data.audience === "employee",
        ),
    );
  }),
);
portal.post(
  "/portal/guide",
  route(async (req, res) => {
    if (req.role === "auditor")
      throw fail(403, "Auditors have read-only access.");
    const question = clean(req.body.question, 3000);
    if (
      !question ||
      typeof req.body.requestId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        req.body.requestId,
      )
    )
      throw fail(400, "Write a question and provide a request ID.");
    const previous = (
      await pool.query(
        "SELECT id,data FROM service_guide_turns WHERE tenant_id=$1 AND user_id=$2 AND request_id=$3",
        [req.tenant, req.user.id, req.body.requestId],
      )
    ).rows[0];
    if (previous) return res.json(previous);
    const snapshot = await portalSnapshot(req);
    if (!snapshot.ai.enabled)
      throw fail(
        403,
        "Ask your CUNIX reviewer to enable the AI guide for this workspace.",
      );
    const recent = (
      await pool.query(
        "SELECT count(*)::int AS count FROM service_guide_turns WHERE tenant_id=$1 AND user_id=$2 AND created_at>now()-interval '15 minutes'",
        [req.tenant, req.user.id],
      )
    ).rows[0];
    if (recent.count >= 12)
      throw fail(429, "Please wait before sending more guide questions.");
    const context = {
      role: req.role,
      scope: snapshot.scope,
      mode: snapshot.mode || "not yet selected",
      date: today(),
      sample: snapshot.sample,
      stages: snapshot.stages.map((s) => ({ key: s.key, status: s.status })),
      controlRefs: snapshot.controls.map((c) => c.reference),
      readiness: snapshot.readiness,
      tasks: snapshot.tasks
        .filter((t) => t.data.status !== "resolved")
        .sort((a,b) => (a.data.dueDate || "9999").localeCompare(b.data.dueDate || "9999"))
        .slice(0, 60)
        .map((t) => ({
          id: t.id,
          title: t.data.title,
          instructions: clean(t.data.description,1200),
          status: t.data.status,
          dueDate: t.data.dueDate,
          phase: t.data.phase || "",
        })),
      policies: snapshot.policies
        .map((p) => ({ title: p.title, acknowledged: p.acknowledged }))
        .slice(0, 50),
      routines: snapshot.routines.map((r) => ({
        key: r.key,
        status: r.data.status,
        dueDate: r.data.dueDate,
      })),
    };
    const history = (
      await pool.query(
        "SELECT data FROM service_guide_turns WHERE tenant_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 6",
        [req.tenant, req.user.id],
      )
    ).rows
      .reverse()
      .filter((r) => req.role !== "employee" || r.data.audience === "employee")
      .map((r) => r.data);
    const pendingKey =
        req.tenant + ":" + req.user.id + ":" + req.body.requestId,
      rateKey = req.tenant + ":" + req.user.id;
    if (guidePending.has(pendingKey))
      throw fail(409, "That guide question is still being processed.");
    for (const [key, v] of guideAttempts)
      if (v.until < Date.now()) guideAttempts.delete(key);
    const attempts = guideAttempts.get(rateKey) || {
      count: 0,
      until: Date.now() + 900000,
    };
    if (attempts.count >= 12)
      throw fail(429, "Please wait before sending more guide questions.");
    attempts.count++;
    guideAttempts.set(rateKey, attempts);
    guidePending.add(pendingKey);
    let advice;
    try {
      advice = normalizeAdvice(
        await providerAdvice(guideMessages(question, context, history),snapshot.ai.model),
        context,
      );
    } catch (e) {
      if (e.status) throw e;
      throw fail(502, "AI response was invalid. No tasks were changed.");
    } finally {
      guidePending.delete(pendingKey);
    }
    if (req.role === "employee") {
      advice.tasks = [];
      advice.updates = [];
    }
    const membership = (
      await pool.query(
        "SELECT role FROM service_memberships WHERE tenant_id=$1 AND user_id=$2",
        [req.tenant, req.user.id],
      )
    ).rows[0];
    if (!membership || membership.role !== req.role)
      throw fail(403, "Workspace permissions changed. Sign in again.");
    const id = randomUUID(),
      data = {
        question,
        ...advice,
        provider: "Fireworks AI",
        model:snapshot.ai.model,
        createdTaskIds: [],
        taskSnapshots: Object.fromEntries(
          snapshot.tasks.map((t) => [
            t.id,
            { data: t.data, updatedAt: new Date(t.updated_at).toISOString() },
          ]),
        ),
        audience: req.role,
        contextMode:
          "workspace metadata; no original files or document contents",
      };
    await pool.query(
      "INSERT INTO service_guide_turns(id,tenant_id,user_id,request_id,data) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,user_id,request_id) DO NOTHING",
      [id, req.tenant, req.user.id, req.body.requestId, data],
    );
    const saved = (
      await pool.query(
        "SELECT id,data FROM service_guide_turns WHERE tenant_id=$1 AND user_id=$2 AND request_id=$3",
        [req.tenant, req.user.id, req.body.requestId],
      )
    ).rows[0];
    res.status(201).json(saved);
  }),
);
portal.post(
  "/portal/guide/:id/tasks",
  route(async (req, res) => {
    if (!manage(req))
      throw fail(403, "Coordinator or consultant access required.");
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const turn = (
        await db.query(
          "SELECT * FROM service_guide_turns WHERE id=$1 AND tenant_id=$2 AND user_id=$3 FOR UPDATE",
          [req.params.id, req.tenant, req.user.id],
        )
      ).rows[0];
      if (!turn) throw fail(404, "Guide response not found.");
      if (turn.data.tasksAdded) {
        await db.query("COMMIT");
        return res.json({ ids: turn.data.createdTaskIds, reused: true });
      }
      const indexes = req.body.indexes;
      if (
        !Array.isArray(indexes) ||
        !indexes.length ||
        indexes.length > 6 ||
        indexes.some((i) => !Number.isInteger(i) || !turn.data.tasks[i]) ||
        new Set(indexes).size !== indexes.length
      )
        throw fail(400, "Choose the suggested tasks to add.");
      const ids = [];
      for (const index of indexes) {
        const p = turn.data.tasks[index];
        const c = p.controlRef
          ? (
              await db.query(
                "SELECT id,data FROM service_records WHERE tenant_id=$1 AND kind='controls' AND deleted_at IS NULL",
                [req.tenant],
              )
            ).rows.find((c) => c.data.reference === p.controlRef)
          : null;
        const existing = (
          await db.query(
            "SELECT id,data FROM service_records WHERE tenant_id=$1 AND kind='tasks' AND deleted_at IS NULL",
            [req.tenant],
          )
        ).rows.find(
          (t) =>
            t.data.status !== "resolved" &&
            (t.data.title || "").toLowerCase() === p.title.toLowerCase(),
        );
        if (existing) continue;
        ids.push(
          await insertTask(
            db,
            req,
            {
              ...p,
              controlId: c?.id || "",
              assigneeId: req.body.assigneeId || "",
              dueDate: new Date(Date.now() + p.dueInDays * 86400000)
                .toISOString()
                .slice(0, 10),
            },
            { guideTurnId: turn.id },
          ),
        );
      }
      await db.query("UPDATE service_guide_turns SET data=$1 WHERE id=$2", [
        { ...turn.data, createdTaskIds: ids, tasksAdded: true },
        turn.id,
      ]);
      await db.query("COMMIT");
      res.status(201).json({ ids });
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  }),
);
portal.post(
  "/portal/guide/:id/undo",
  route(async (req, res) => {
    if (!manage(req))
      throw fail(403, "Coordinator or consultant access required.");
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const turn = (
        await db.query(
          "SELECT * FROM service_guide_turns WHERE id=$1 AND tenant_id=$2 AND user_id=$3 FOR UPDATE",
          [req.params.id, req.tenant, req.user.id],
        )
      ).rows[0];
      if (!turn) throw fail(404, "Guide response not found.");
      const tasks = [];
      for (const id of turn.data.createdTaskIds || []) {
        const r = (
          await db.query(
            "SELECT * FROM service_records WHERE id=$1 AND tenant_id=$2 AND deleted_at IS NULL FOR UPDATE",
            [id, req.tenant],
          )
        ).rows[0];
        if (!r) continue;
        const edits = (
          await db.query(
            "SELECT id FROM service_versions WHERE tenant_id=$1 AND record_id=$2",
            [req.tenant, id],
          )
        ).rows;
        const notes = (
          await db.query(
            "SELECT id,created_at FROM service_task_comments WHERE tenant_id=$1 AND task_id=$2",
            [req.tenant, id],
          )
        ).rows;
        if (edits.length || notes.length || r.data.status !== "not_started")
          throw fail(
            409,
            "These tasks have later work. Preserve it and review the tasks individually.",
          );
        tasks.push(id);
      }
      for (const id of tasks) {
        await db.query(
          "UPDATE service_records SET deleted_at=now() WHERE tenant_id=$1 AND id=$2",
          [req.tenant, id],
        );
        await event(db, req, "guide.task_undone", id);
      }
      await db.query("UPDATE service_guide_turns SET data=$1 WHERE id=$2", [
        { ...turn.data, undone: true },
        turn.id,
      ]);
      await db.query("COMMIT");
      res.json({ undone: tasks.length });
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  }),
);
portal.post(
  "/portal/guide/:id/updates",
  route(async (req, res) => {
    if (!manage(req))
      throw fail(403, "Coordinator or consultant access required.");
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const turn = (
        await db.query(
          "SELECT * FROM service_guide_turns WHERE id=$1 AND tenant_id=$2 AND user_id=$3 FOR UPDATE",
          [req.params.id, req.tenant, req.user.id],
        )
      ).rows[0];
      if (!turn) throw fail(404, "Guide response not found.");
      if (turn.data.updatesApplied) {
        await db.query("COMMIT");
        return res.json({ reused: true });
      }
      if (!turn.data.updates?.length)
        throw fail(400, "No task updates were proposed.");
      const changes = [];
      for (const proposal of turn.data.updates) {
        const r = await task(db, req, proposal.taskId, true),
          baseline = turn.data.taskSnapshots?.[r.id];
        if (
          !baseline ||
          new Date(r.updated_at).toISOString() !== baseline.updatedAt ||
          JSON.stringify(r.data) !== JSON.stringify(baseline.data)
        )
          throw fail(
            409,
            "A task changed after this suggestion. Ask the guide for an updated plan.",
          );
        if (["resolved", "in_review"].includes(r.data.status))
          throw fail(
            409,
            "Tasks already submitted or completed require their normal review workflow.",
          );
        const notes = (
          await db.query(
            "SELECT id,created_at FROM service_task_comments WHERE tenant_id=$1 AND task_id=$2",
            [req.tenant, r.id],
          )
        ).rows;
        if (
          notes.some((n) => new Date(n.created_at) > new Date(turn.created_at))
        )
          throw fail(
            409,
            "This task has new discussion. Review it before changing the plan.",
          );
        const data = {
          ...r.data,
          taskManaged: true,
          ...(proposal.description
            ? { description: proposal.description }
            : {}),
          ...(proposal.dueInDays
            ? {
                dueDate: new Date(Date.now() + proposal.dueInDays * 86400000)
                  .toISOString()
                  .slice(0, 10),
              }
            : {}),
        };
        await db.query(
          "INSERT INTO service_versions(id,tenant_id,record_id,actor_id,data) VALUES($1,$2,$3,$4,$5)",
          [randomUUID(), req.tenant, r.id, req.user.id, r.data],
        );
        await db.query(
          "UPDATE service_records SET data=$1,updated_at=now() WHERE id=$2 AND tenant_id=$3",
          [data, r.id, req.tenant],
        );
        await event(db, req, "guide.task_updated", r.id);
        const after = (
          await db.query(
            "SELECT data,updated_at FROM service_records WHERE id=$1 AND tenant_id=$2",
            [r.id, req.tenant],
          )
        ).rows[0];
        changes.push({
          id: r.id,
          before: r.data,
          after: after.data,
          updatedAt: new Date(after.updated_at).toISOString(),
        });
      }
      await db.query("UPDATE service_guide_turns SET data=$1 WHERE id=$2", [
        {
          ...turn.data,
          updatesApplied: true,
          updatedTaskIds: changes.map((c) => c.id),
          appliedChanges: changes,
          updatesAppliedAt: new Date().toISOString(),
        },
        turn.id,
      ]);
      await db.query("COMMIT");
      res.json({ ids: changes.map((c) => c.id) });
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  }),
);
portal.post(
  "/portal/guide/:id/undo-updates",
  route(async (req, res) => {
    if (!manage(req))
      throw fail(403, "Coordinator or consultant access required.");
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const turn = (
        await db.query(
          "SELECT * FROM service_guide_turns WHERE id=$1 AND tenant_id=$2 AND user_id=$3 FOR UPDATE",
          [req.params.id, req.tenant, req.user.id],
        )
      ).rows[0];
      if (!turn) throw fail(404, "Guide response not found.");
      if (turn.data.updatesUndone) {
        await db.query("COMMIT");
        return res.json({ reused: true });
      }
      if (!turn.data.appliedChanges?.length)
        throw fail(400, "No applied updates to undo.");
      for (const change of turn.data.appliedChanges) {
        const r = await task(db, req, change.id, true);
        if (
          new Date(r.updated_at).toISOString() !== change.updatedAt ||
          JSON.stringify(r.data) !== JSON.stringify(change.after)
        )
          throw fail(
            409,
            "A task has later work. Review it individually instead of undoing this plan.",
          );
        const notes = (
          await db.query(
            "SELECT created_at FROM service_task_comments WHERE tenant_id=$1 AND task_id=$2",
            [req.tenant, r.id],
          )
        ).rows;
        if (
          notes.some(
            (n) =>
              new Date(n.created_at) > new Date(turn.data.updatesAppliedAt),
          )
        )
          throw fail(
            409,
            "A task has later discussion. Preserve it and review the task individually.",
          );
        await db.query(
          "INSERT INTO service_versions(id,tenant_id,record_id,actor_id,data) VALUES($1,$2,$3,$4,$5)",
          [randomUUID(), req.tenant, r.id, req.user.id, r.data],
        );
        await db.query(
          "UPDATE service_records SET data=$1,updated_at=now() WHERE id=$2 AND tenant_id=$3",
          [change.before, r.id, req.tenant],
        );
        await event(db, req, "guide.task_update_undone", r.id);
      }
      await db.query("UPDATE service_guide_turns SET data=$1 WHERE id=$2", [
        { ...turn.data, updatesUndone: true },
        turn.id,
      ]);
      await db.query("COMMIT");
      res.json({ undone: turn.data.appliedChanges.length });
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  }),
);

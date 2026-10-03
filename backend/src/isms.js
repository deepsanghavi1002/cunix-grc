import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool } from "./db.js";
import {
  requirements,
  guides,
  routines,
  draftDocument,
} from "./isms-catalog.js";
import { invalidateStage } from "./stages.js";

export const isms = Router({ mergeParams: true });
const route = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res)).catch(next);
const fail = (status, message) => Object.assign(new Error(message), { status });
const review = (req) => {
  if (!["admin", "reviewer"].includes(req.role))
    throw fail(403, "A workspace reviewer is required.");
};
const day = () => new Date().toISOString().slice(0, 10);
const addDays = (date, days) =>
  new Date(Date.parse(date + "T12:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
const reference = (value) => (value || "").replace(/^ISO27001\s+/, "");
const validDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const clean = (value, max = 2000) => {
  if (typeof value !== "string" || value.length > max)
    throw fail(400, "Invalid text value.");
  return value.trim();
};
async function transaction(fn) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const result = await fn(db);
    await db.query("COMMIT");
    return result;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
async function event(db, req, action, id = null) {
  await db.query(
    "INSERT INTO service_events(id,tenant_id,actor_id,action,record_id) VALUES($1,$2,$3,$4,$5)",
    [randomUUID(), req.tenant, req.user.id, action, id],
  );
}
async function active(db, tenant) {
  const { rows } = await db.query(
    "SELECT * FROM service_programs WHERE tenant_id=$1 FOR UPDATE",
    [tenant],
  );
  if (!rows[0]) throw fail(409, "Activate the guided ISMS program first.");
  return rows[0];
}
const currentEvidence = (doc, today) =>
  !doc.data.referenceOnly &&
  doc.data.status === "approved" &&
  Boolean(doc.data.reviewedAt) &&
  Boolean(doc.data.expiresAt) &&
  doc.data.expiresAt >= today &&
  !/\[DECISION REQUIRED\]/.test(doc.data.description || "");

export function evaluateSignals(records, scheduled, profile, today = day()) {
  const docs = records.filter((r) => r.kind === "documents" && !r.data.referenceOnly);
  const controls = records.filter(
    (r) => r.kind === "controls" && r.data.applicable !== false,
  );
  const expired = docs.filter(
    (r) =>
      (r.data.expiresAt && r.data.expiresAt < today) ||
      (r.data.status === "approved" && !r.data.expiresAt),
  );
  const unmapped = docs.filter((r) => !r.data.controlId);
  const missing = controls.filter(
    (c) =>
      !docs.some((d) => d.data.controlId === c.id && currentEvidence(d, today)),
  );
  const placeholders = docs.filter((d) =>
    /\[DECISION REQUIRED\]|<<Company Name>>|Organization Name/.test(
      d.data.description || "",
    ),
  );
  const due = scheduled.filter((r) => r.data.dueDate <= today);
  const overdue = records.filter(
    (r) =>
      r.kind === "tasks" &&
      r.data.dueDate &&
      r.data.dueDate < today &&
      !["done", "closed", "resolved", "completed"].includes(r.data.status),
  );
  const definitions = [
    [
      "profile",
      "Organization profile incomplete",
      !profile.services || !profile.coordinator || !profile.sponsor
        ? "Confirm your services, coordinator and sponsor."
        : "",
      "high",
      "Set up your organization so requests and draft documents use the right context.",
      "profile",
    ],
    [
      "expired",
      "Evidence has expired",
      expired.length ? `${expired.length} document(s) need renewal.` : "",
      "high",
      "Collect current evidence and obtain fresh review.",
      "documents",
    ],
    [
      "coverage",
      "Controls need accepted evidence",
      missing.length
        ? `${missing.length} applicable control(s) have no current approved evidence.`
        : "",
      "high",
      "Open the control index, map relevant documents and request review.",
      "coverage",
    ],
    [
      "mapping",
      "Documents need control mapping",
      unmapped.length
        ? `${unmapped.length} document(s) are not linked to a control.`
        : "",
      "medium",
      "Map each supporting document to its relevant control.",
      "documents",
    ],
    [
      "placeholders",
      "Draft decisions are unresolved",
      placeholders.length
        ? `${placeholders.length} document(s) still contain template placeholders.`
        : "",
      "medium",
      "Describe the actual process before submitting the draft for approval.",
      "documents",
    ],
    [
      "recurrence",
      "Recurring evidence is due",
      due.length
        ? `${due.length} recurring request(s) need evidence for the current cycle.`
        : "",
      "high",
      "Submit a dated operating record, then ask a reviewer to accept this cycle.",
      "routines",
    ],
    [
      "overdue",
      "Remediation is overdue",
      overdue.length
        ? `${overdue.length} action(s) are past their due date.`
        : "",
      "high",
      "Resolve the underlying issue or agree a revised action with your reviewer.",
      "tasks",
    ],
  ];
  return definitions.map(
    ([key, title, detail, severity, action, destination]) => ({
      key,
      title,
      status: detail ? "attention" : "clear",
      detail: detail || "No issue detected by this metadata check.",
      severity,
      action,
      destination,
      checkedAt: new Date().toISOString(),
    }),
  );
}

export async function runMonitor(
  tenant,
  { dueOnly = false, now = new Date() } = {},
) {
  return transaction(async (db) => {
    const p = await active(db, tenant);
    if (dueOnly && (!p.enabled || new Date(p.next_run_at) > now)) return null;
    const records = (
      await db.query(
        "SELECT id,kind,data FROM service_records WHERE tenant_id=$1 AND deleted_at IS NULL",
        [tenant],
      )
    ).rows;
    const scheduled = (
      await db.query(
        "SELECT key,data FROM service_routines WHERE tenant_id=$1",
        [tenant],
      )
    ).rows;
    const signals = evaluateSignals(
      records,
      scheduled,
      p.profile,
      now.toISOString().slice(0, 10),
    );
    const observations = (
      await db.query(
        "SELECT data FROM service_observations WHERE tenant_id=$1",
        [tenant],
      )
    ).rows.map((r) => r.data);
    const collector = (
      await db.query(
        "SELECT enabled,expires_at FROM service_collectors WHERE tenant_id=$1",
        [tenant],
      )
    ).rows[0];
    if (collector) {
      const unhealthy = observations.filter(
        (o) =>
          o.status !== "pass" || now - Date.parse(o.observedAt) > 26 * 3600000,
      );
      const disconnected =
        !collector.enabled || new Date(collector.expires_at) < now;
      signals.push({
        key: "collector",
        title: "Connected system observations",
        status:
          disconnected || !observations.length || unhealthy.length
            ? "attention"
            : "clear",
        severity: "high",
        detail: disconnected
          ? "Collector token revoked or expired."
          : !observations.length
            ? "Waiting for the first authenticated observation."
            : `${unhealthy.length} failed, unknown or stale observation(s).`,
        action:
          "Check the client collector schedule and resolve reported findings.",
        destination: "connections",
        checkedAt: now.toISOString(),
      });
    }
    for (const signal of signals)
      await db.query(
        "INSERT INTO service_signals(tenant_id,key,data) VALUES($1,$2,$3) ON CONFLICT(tenant_id,key) DO UPDATE SET data=EXCLUDED.data",
        [tenant, signal.key, signal],
      );
    const result = {
      checked: signals.length,
      attention: signals.filter((s) => s.status === "attention").length,
      source: "Workspace metadata and scheduled evidence",
      checkedAt: now.toISOString(),
    };
    await db.query(
      "INSERT INTO service_monitor_runs(id,tenant_id,data) VALUES($1,$2,$3)",
      [randomUUID(), tenant, result],
    );
    await db.query(
      "UPDATE service_programs SET last_run_at=$1,next_run_at=$2 WHERE tenant_id=$3",
      [now, new Date(now.getTime() + 3600000), tenant],
    );
    return result;
  });
}

export function startMonitor() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const { rows } = await pool.query(
        "SELECT tenant_id FROM service_programs WHERE enabled=true AND next_run_at<=now()",
      );
      for (const row of rows) {
        try {
          await runMonitor(row.tenant_id, { dueOnly: true });
        } catch (e) {
          console.error("ISMS monitor failed", row.tenant_id, e.message);
        }
      }
    } catch (e) {
      console.error("ISMS scheduler unavailable", e.message);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, 60000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}

isms.get(
  "/isms",
  route(async (req, res) => {
    const [program, sites, scheduled, signals, runs, records] =
      await Promise.all([
        pool.query("SELECT * FROM service_programs WHERE tenant_id=$1", [
          req.tenant,
        ]),
        pool.query(
          "SELECT * FROM service_sites WHERE tenant_id=$1 ORDER BY name",
          [req.tenant],
        ),
        pool.query("SELECT key,data FROM service_routines WHERE tenant_id=$1", [
          req.tenant,
        ]),
        pool.query("SELECT key,data FROM service_signals WHERE tenant_id=$1", [
          req.tenant,
        ]),
        pool.query(
          "SELECT id,created_at,data FROM service_monitor_runs WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 12",
          [req.tenant],
        ),
        pool.query(
          "SELECT id,kind,data FROM service_records WHERE tenant_id=$1 AND deleted_at IS NULL",
          [req.tenant],
        ),
      ]);
    const documents = records.rows.filter((r) => r.kind === "documents" && !r.data.referenceOnly);
    const coverage = requirements.map((r) => {
      const control = records.rows.find(
        (c) => c.kind === "controls" && reference(c.data.reference) === r.ref,
      );
      const evidence = documents.filter(
        (d) => d.data.controlId === control?.id,
      );
      return {
        ...r,
        id: control?.id,
        owner: control?.data.owner || "",
        applicable: control?.data.applicable !== false,
        implemented: control?.data.status === "passing",
        evidence: evidence.length,
        accepted: evidence.filter((d) => currentEvidence(d, day())).length,
        justification: control?.data.justification || "",
      };
    });
    res.json({
      program: program.rows[0] || null,
      sites: sites.rows,
      routines: scheduled.rows,
      signals: signals.rows.map((r) => r.data),
      runs: runs.rows,
      coverage,
      guides,
    });
  }),
);

isms.post(
  "/isms/activate",
  route(async (req, res) => {
    review(req);
    await transaction(async (db) => {
      // Lock the tenant so simultaneous activation is idempotent, including seeding.
      await db.query("SELECT id FROM tenants WHERE id=$1 FOR UPDATE", [
        req.tenant,
      ]);
      const existing = (
        await db.query(
          "SELECT tenant_id FROM service_programs WHERE tenant_id=$1",
          [req.tenant],
        )
      ).rows;
      if (existing.length) return;
      await db.query(
        "INSERT INTO service_programs(tenant_id,profile) VALUES($1,$2)",
        [req.tenant, { coordinator: req.user.name }],
      );
      const controls = (
        await db.query(
          "SELECT id,data FROM service_records WHERE tenant_id=$1 AND kind='controls' AND deleted_at IS NULL",
          [req.tenant],
        )
      ).rows;
      for (const r of requirements) {
        if (controls.some((c) => reference(c.data.reference) === r.ref))
          continue;
        await db.query(
          "INSERT INTO service_records(id,tenant_id,kind,data) VALUES($1,$2,$3,$4)",
          [
            randomUUID(),
            req.tenant,
            "controls",
            {
              title: r.title,
              reference: `ISO27001 ${r.ref}`,
              theme: r.theme,
              owner: "",
              status: "not_started",
              applicable: true,
              justification: "",
            },
          ],
        );
      }
      for (const r of routines)
        await db.query(
          "INSERT INTO service_routines(tenant_id,key,data) VALUES($1,$2,$3)",
          [
            req.tenant,
            r.key,
            {
              ...r,
              owner: req.user.name,
              dueDate: day(),
              periodStart: day(),
              status: "due",
              siteId: "",
              history: [],
            },
          ],
        );
      await event(db, req, "isms.activated");
    });
    await runMonitor(req.tenant);
    res.status(201).json({ ok: true });
  }),
);

isms.post('/isms/reference-drafts/:id', route(async (req,res)=>{
  const created=await transaction(async db=>{
    await active(db,req.tenant);
    const source=(await db.query("SELECT id,data FROM service_records WHERE tenant_id=$1 AND id=$2 AND kind='documents' AND deleted_at IS NULL",[req.tenant,req.params.id])).rows[0];
    if(!source?.data.referenceOnly)throw fail(404,'Reference template not found.');
    const drafts=(await db.query("SELECT id,data FROM service_records WHERE tenant_id=$1 AND kind='documents' AND deleted_at IS NULL",[req.tenant])).rows;
    const existing=drafts.find(row=>row.data.referenceSourceId===source.id&&row.data.status!=='approved');
    if(existing)return existing.id;
    const company=(await db.query('SELECT name FROM tenants WHERE id=$1',[req.tenant])).rows[0].name;
    const text=(source.data.description||'').replace(/^PRIVATE REFERENCE TEMPLATE[^\n]*\nOriginal path:[^\n]*\n\n/,'').replace(/<<\s*COMPANY NAME\s*>>/gi,company).replace(/“Legal Name of the company”/g,company).replace(/<<[^>]+>>/g,'[DECISION REQUIRED]').replace(/DD-MMM-YY|DD-MM-YYYY|DD-MMM-YYYY/gi,'[DECISION REQUIRED]');
    const id=randomUUID();
    const data={title:company+' — '+source.data.title,description:'DRAFT — complete decisions and confirm actual practices before review.\n\n'+text,referenceSourceId:source.id,referencePath:source.data.referencePath,draftSource:'Private ISMS 2022 reference template',stageKey:'controls',status:'review_required',owner:req.user.name,submittedBy:req.user.name,checks:['Complete organization-specific decisions','Confirm applicability and actual practices','Map to the relevant control and obtain review']};
    await db.query('INSERT INTO service_records(id,tenant_id,kind,data) VALUES($1,$2,$3,$4)',[id,req.tenant,'documents',data]);
    await invalidateStage(db,req.tenant,'controls',req.user.id);await event(db,req,'isms.reference_draft.created',id);return id;
  });
  res.status(201).json({id:created});
}));

isms.patch(
  "/isms/profile",
  route(async (req, res) => {
    const profile = {};
    for (const key of [
      "services",
      "information",
      "coordinator",
      "sponsor",
      "industry",
    ])
      if(req.body[key] !== undefined) profile[key] = clean(req.body[key]);
    await transaction(async (db) => {
      const existing = await active(db, req.tenant);
      await db.query(
        "UPDATE service_programs SET profile=$1,next_run_at=now() WHERE tenant_id=$2",
        [{...existing.profile,...profile}, req.tenant],
      );
      await event(db, req, "isms.profile.updated");
    });
    res.json({ ok: true });
  }),
);
isms.post(
  "/isms/sites",
  route(async (req, res) => {
    const name = clean(req.body.name, 120);
    if (!name) throw fail(400, "Site name required.");
    const data = {
      location: clean(req.body.location || "", 200),
      owner: clean(req.body.owner || "", 120),
      type: clean(req.body.type || "office", 40),
    };
    const id = randomUUID();
    await transaction(async (db) => {
      await active(db, req.tenant);
      await db.query(
        "INSERT INTO service_sites(id,tenant_id,name,data) VALUES($1,$2,$3,$4)",
        [id, req.tenant, name, data],
      );
      await event(db, req, "isms.site.created", id);
    });
    res.status(201).json({ id });
  }),
);
isms.post(
  "/isms/drafts/:key",
  route(async (req, res) => {
    const guide = guides.find((g) => g.key === req.params.key);
    if (!guide) throw fail(404, "Guide not found.");
    const id = await transaction(async (db) => {
      const p = await active(db, req.tenant);
      if (!p.profile.services || !p.profile.sponsor || !p.profile.coordinator)
        throw fail(
          400,
          "Complete services, coordinator and sponsor in the organization profile first.",
        );
      const company = (
        await db.query("SELECT name FROM tenants WHERE id=$1", [req.tenant])
      ).rows[0].name;
      const records = (
        await db.query(
          "SELECT id,data FROM service_records WHERE tenant_id=$1 AND kind='documents' AND deleted_at IS NULL",
          [req.tenant],
        )
      ).rows;
      const existing = records.find(
        (d) => d.data.guideKey === guide.key && d.data.status !== "approved",
      );
      if (existing) return existing.id;
      const controls = (
        await db.query(
          "SELECT id,data FROM service_records WHERE tenant_id=$1 AND kind='controls' AND deleted_at IS NULL",
          [req.tenant],
        )
      ).rows;
      const id = randomUUID();
      await db.query(
        "INSERT INTO service_records(id,tenant_id,kind,data) VALUES($1,$2,$3,$4)",
        [
          id,
          req.tenant,
          "documents",
          {
            title: `${company} — ${guide.title}`,
            description: draftDocument(guide, p.profile, company),
            stageKey: "controls",
            guideKey: guide.key,
            controlId: controls.find(
              (c) => reference(c.data.reference) === guide.refs[0],
            )?.id,
            status: "review_required",
            owner: p.profile.coordinator,
            submittedBy: req.user.name,
            draftSource: "Guided template v1",
            checks: [
              "Replace all decision placeholders",
              "Confirm actual business practices",
              "Obtain client adoption and independent review",
            ],
          },
        ],
      );
      await invalidateStage(db, req.tenant, "controls", req.user.id);
      await event(db, req, "isms.draft.generated", id);
      return id;
    });
    res.status(201).json({ id });
  }),
);
isms.patch(
  "/isms/routines/:key",
  route(async (req, res) => {
    review(req);
    await transaction(async (db) => {
      await active(db, req.tenant);
      const row = (
        await db.query(
          "SELECT data FROM service_routines WHERE tenant_id=$1 AND key=$2",
          [req.tenant, req.params.key],
        )
      ).rows[0];
      if (!row) throw fail(404, "Routine not found.");
      const data = { ...row.data };
      if (req.body.days !== undefined) {
        if (
          !Number.isInteger(req.body.days) ||
          req.body.days < 1 ||
          req.body.days > 730
        )
          throw fail(400, "Frequency must be 1–730 days.");
        data.days = req.body.days;
      }
      if (req.body.dueDate !== undefined) {
        if (!validDate(req.body.dueDate) || req.body.dueDate < data.periodStart)
          throw fail(
            400,
            "Choose a valid due date on or after the cycle start.",
          );
        data.dueDate = req.body.dueDate;
      }
      if (req.body.owner !== undefined) data.owner = clean(req.body.owner, 120);
      if (req.body.siteId !== undefined) {
        const siteId = clean(req.body.siteId, 36);
        if (siteId) {
          const match = await db.query(
            "SELECT id FROM service_sites WHERE tenant_id=$1 AND id=$2",
            [req.tenant, siteId],
          );
          if (!match.rows.length)
            throw fail(400, "Site must belong to this client.");
        }
        data.siteId = siteId;
      }
      await db.query(
        "UPDATE service_routines SET data=$1 WHERE tenant_id=$2 AND key=$3",
        [data, req.tenant, req.params.key],
      );
      await event(db, req, "isms.routine.configured");
    });
    res.json({ ok: true });
  }),
);
isms.post(
  "/isms/routines/:key/submit",
  route(async (req, res) => {
    if (!validDate(req.body.collectedOn) || req.body.collectedOn > day())
      throw fail(400, "Provide a valid evidence date no later than today.");
    await transaction(async (db) => {
      await active(db, req.tenant);
      const row = (
        await db.query(
          "SELECT data FROM service_routines WHERE tenant_id=$1 AND key=$2",
          [req.tenant, req.params.key],
        )
      ).rows[0];
      if (!row) throw fail(404, "Routine not found.");
      const data = { ...row.data };
      if (req.body.collectedOn < data.periodStart)
        throw fail(400, "Evidence must come from the current cycle.");
      const doc = (
        await db.query(
          "SELECT id,data FROM service_records WHERE tenant_id=$1 AND id=$2 AND kind='documents' AND deleted_at IS NULL",
          [req.tenant, req.body.documentId],
        )
      ).rows[0];
      if (!doc) throw fail(400, "Select evidence from this workspace.");
      if (data.history.some((h) => h.documentId === doc.id))
        throw fail(400, "Provide a new evidence record for the new cycle.");
      data.submission = {
        documentId: doc.id,
        collectedOn: req.body.collectedOn,
        note: clean(req.body.note || ""),
        submittedBy: req.user.id,
        submittedAt: new Date().toISOString(),
        checksum: doc.data.checksum || null,
        description: doc.data.description || "",
        title: doc.data.title,
        controlId: doc.data.controlId || null,
      };
      data.status = "in_review";
      await db.query(
        "UPDATE service_routines SET data=$1 WHERE tenant_id=$2 AND key=$3",
        [data, req.tenant, req.params.key],
      );
      await event(db, req, "isms.cycle.submitted", doc.id);
    });
    res.json({ ok: true });
  }),
);
isms.post(
  "/isms/routines/:key/review",
  route(async (req, res) => {
    review(req);
    const note = clean(req.body.note || "");
    if (!note) throw fail(400, "A review decision needs a note.");
    if (!["accept", "changes"].includes(req.body.decision))
      throw fail(400, "Choose accept or changes.");
    await transaction(async (db) => {
      await active(db, req.tenant);
      const row = (
        await db.query(
          "SELECT data FROM service_routines WHERE tenant_id=$1 AND key=$2",
          [req.tenant, req.params.key],
        )
      ).rows[0];
      if (!row) throw fail(404, "Routine not found.");
      const data = { ...row.data };
      if (data.status !== "in_review" || !data.submission)
        throw fail(409, "No submission awaiting review.");
      if (data.submission.submittedBy === req.user.id)
        throw fail(403, "A different reviewer must decide this submission.");
      if (req.body.decision === "accept") {
        const doc = (
          await db.query(
            "SELECT id,data FROM service_records WHERE tenant_id=$1 AND id=$2 AND kind='documents' AND deleted_at IS NULL",
            [req.tenant, data.submission.documentId],
          )
        ).rows[0];
        if (!doc || !currentEvidence(doc, day()))
          throw fail(
            409,
            "The linked evidence must be current and approved first.",
          );
        if (
          ["checksum", "description", "title", "controlId"].some(
            (k) => (doc.data[k] || null) !== (data.submission[k] || null),
          )
        )
          throw fail(
            409,
            "Evidence changed after submission. Submit the current version again.",
          );
        if (/\[DECISION REQUIRED\]/.test(doc.data.description || ""))
          throw fail(
            409,
            "Unresolved template decisions are not operating evidence.",
          );
        data.history = [
          ...data.history,
          {
            ...data.submission,
            reviewedBy: req.user.id,
            reviewer: req.user.name,
            note,
            acceptedAt: new Date().toISOString(),
            dueDate: data.dueDate,
          },
        ];
        data.periodStart = addDays(day(), 1);
        data.dueDate = addDays(day(), data.days);
        data.status = "scheduled";
        delete data.submission;
      } else {
        data.status = "changes_requested";
        data.reviewNote = note;
      }
      await db.query(
        "UPDATE service_routines SET data=$1 WHERE tenant_id=$2 AND key=$3",
        [data, req.tenant, req.params.key],
      );
      await event(db, req, `isms.cycle.${req.body.decision}`);
    });
    await runMonitor(req.tenant);
    res.json({ ok: true });
  }),
);
isms.post(
  "/isms/monitor",
  route(async (req, res) => {
    review(req);
    res.json(await runMonitor(req.tenant));
  }),
);
isms.patch(
  "/isms/monitor",
  route(async (req, res) => {
    review(req);
    if (typeof req.body.enabled !== "boolean")
      throw fail(400, "Provide enabled true or false.");
    await transaction(async (db) => {
      await active(db, req.tenant);
      await db.query(
        "UPDATE service_programs SET enabled=$1,next_run_at=now() WHERE tenant_id=$2",
        [req.body.enabled, req.tenant],
      );
      await event(db, req, "isms.monitor.configured");
    });
    res.json({ ok: true });
  }),
);

export async function programHealth(tenant) {
  const p = (
    await pool.query(
      "SELECT enabled,last_run_at FROM service_programs WHERE tenant_id=$1",
      [tenant],
    )
  ).rows[0];
  if (!p) return { active: false, attention: 0, due: 0 };
  const signals = (
    await pool.query("SELECT data FROM service_signals WHERE tenant_id=$1", [
      tenant,
    ])
  ).rows;
  const scheduled = (
    await pool.query("SELECT data FROM service_routines WHERE tenant_id=$1", [
      tenant,
    ])
  ).rows;
  return {
    active: true,
    enabled: p.enabled,
    lastRun: p.last_run_at,
    attention: signals.filter((s) => s.data.status === "attention").length,
    due: scheduled.filter((r) => r.data.dueDate <= day()).length,
  };
}

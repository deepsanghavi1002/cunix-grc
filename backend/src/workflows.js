import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool } from "./db.js";
import { readiness } from "./readiness.js";

export const workflows = Router({ mergeParams: true });
const route = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res)).catch(next);
const fail = (status, message) => Object.assign(new Error(message), { status });

workflows.post(
  "/audits",
  route(async (req, res) => {
    if (!["admin", "reviewer"].includes(req.role))
      throw fail(403, "Reviewer access required.");
    const { title, periodStart, periodEnd } = req.body;
    if (
      !title?.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(periodStart || "") ||
      !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd || "") ||
      !Number.isFinite(Date.parse(periodStart)) ||
      !Number.isFinite(Date.parse(periodEnd)) ||
      periodStart > periodEnd
    ) {
      throw fail(400, "Provide an audit title and a valid start/end period.");
    }
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const { rows } = await db.query(
        "SELECT id,kind,data FROM service_records WHERE tenant_id=$1 AND deleted_at IS NULL",
        [req.tenant],
      );
      const report = readiness(rows);
      const id = randomUUID();
      const data = {
        title,
        periodStart,
        periodEnd,
        status: "in_progress",
        owner: req.user.name,
        controlIds: report.controls
          .filter((control) => control.applicable)
          .map((control) => control.id),
      };
      await db.query(
        "INSERT INTO service_records(id,tenant_id,kind,data) VALUES($1,$2,$3,$4)",
        [id, req.tenant, "audits", data],
      );
      for (const control of report.controls.filter(
        (control) => control.applicable,
      )) {
        await db.query(
          "INSERT INTO service_records(id,tenant_id,kind,data) VALUES($1,$2,$3,$4)",
          [
            randomUUID(),
            req.tenant,
            "tasks",
            {
              title: `Audit evidence: ${control.reference || control.title}`,
              owner: control.owner,
              controlId: control.id,
              auditId: id,
              status: "not_started",
              dueDate: periodEnd,
              description:
                "Submit evidence for the audit period, obtain reviewer approval, then resolve this request.",
            },
          ],
        );
      }
      await db.query(
        "INSERT INTO service_events(id,tenant_id,actor_id,action,record_id) VALUES($1,$2,$3,$4,$5)",
        [randomUUID(), req.tenant, req.user.id, "audit.created", id],
      );
      await db.query("COMMIT");
      res.status(201).json({ id, data });
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
  }),
);

workflows.get(
  "/audits/:id/package",
  route(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT id,kind,data FROM service_records WHERE tenant_id=$1 AND deleted_at IS NULL",
      [req.tenant],
    );
    const audit = rows.find(
      (item) => item.kind === "audits" && item.id === req.params.id,
    );
    if (!audit) throw fail(404, "Audit not found.");
    const controls = rows.filter(
      (item) =>
        item.kind === "controls" && audit.data.controlIds.includes(item.id),
    );
    const evidence = rows.filter(
      (item) =>
        item.kind === "documents" &&
        audit.data.controlIds.includes(item.data.controlId),
    );
    const requests = rows.filter(
      (item) => item.kind === "tasks" && item.data.auditId === audit.id,
    );
    const versions = await pool.query(
      "SELECT record_id,data,created_at FROM service_versions WHERE tenant_id=$1",
      [req.tenant],
    );
    res.set("Content-Disposition", 'attachment; filename="audit-package.json"');
    res.json({
      audit,
      generatedAt: new Date().toISOString(),
      controls,
      evidence,
      requests,
      readiness: readiness([...controls, ...evidence, ...requests]),
      evidenceHistory: versions.rows.filter((version) =>
        evidence.some((item) => item.id === version.record_id),
      ),
      note: "Evidence period relevance requires human review. Originals are available through authenticated downloads.",
    });
  }),
);

workflows.get(
  "/readiness",
  route(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT id,kind,data FROM service_records WHERE tenant_id=$1 AND deleted_at IS NULL",
      [req.tenant],
    );
    res.json(readiness(rows));
  }),
);

workflows.get(
  "/statement-of-applicability",
  route(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT id,kind,data FROM service_records WHERE tenant_id=$1 AND deleted_at IS NULL",
      [req.tenant],
    );
    res.set(
      "Content-Disposition",
      'attachment; filename="statement-of-applicability.json"',
    );
    res.json({
      workspace: req.tenant,
      framework: "ISO 27001:2022",
      coverage:
        "Illustrative starter control set; extend using your licensed standard.",
      ...readiness(rows),
    });
  }),
);

workflows.get(
  "/records/:id/history",
  route(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT id FROM service_records WHERE id=$1 AND tenant_id=$2 AND deleted_at IS NULL",
      [req.params.id, req.tenant],
    );
    if (!rows.length) throw fail(404, "Record not found.");
    const history = await pool.query(
      "SELECT * FROM service_versions WHERE record_id=$1 AND tenant_id=$2 ORDER BY created_at DESC",
      [req.params.id, req.tenant],
    );
    res.json(history.rows);
  }),
);

workflows.post(
  "/monitor",
  route(async (req, res) => {
    if (!["admin", "reviewer"].includes(req.role))
      throw fail(403, "Reviewer access required.");
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT id FROM tenants WHERE id=$1 FOR UPDATE", [
        req.tenant,
      ]);
      const { rows } = await db.query(
        "SELECT id,kind,data FROM service_records WHERE tenant_id=$1 AND deleted_at IS NULL",
        [req.tenant],
      );
      const report = readiness(rows);
      let created = 0;
      for (const control of report.controls.filter(
        (item) => item.state === "gap",
      )) {
        const key = `readiness:${control.id}`;
        const existing = rows.find(
          (item) =>
            item.kind === "tasks" &&
            item.data.monitorKey === key &&
            item.data.status !== "resolved",
        );
        if (existing) continue;
        await db.query(
          "INSERT INTO service_records(id,tenant_id,kind,data) VALUES($1,$2,$3,$4)",
          [
            randomUUID(),
            req.tenant,
            "tasks",
            {
              title: `Remediate ${control.reference || control.title}`,
              description: control.reasons.join("; "),
              owner: control.owner,
              controlId: control.id,
              monitorKey: key,
              status: "not_started",
              dueDate: new Date(Date.now() + 7 * 86400000)
                .toISOString()
                .slice(0, 10),
            },
          ],
        );
        created++;
      }
      await db.query(
        "INSERT INTO service_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)",
        [randomUUID(), req.tenant, req.user.id, "monitor.completed"],
      );
      await db.query("COMMIT");
      res.json({ ...report, tasksCreated: created });
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
  }),
);

workflows.post(
  "/records/:id/acknowledge",
  route(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT * FROM service_records WHERE id=$1 AND tenant_id=$2 AND deleted_at IS NULL AND kind='policies'",
      [req.params.id, req.tenant],
    );
    if (!rows.length) throw fail(404, "Policy not found.");
    if (rows[0].data.status !== "approved")
      throw fail(400, "Only published policies can be acknowledged.");
    await pool.query(
      "INSERT INTO service_acknowledgements(id,tenant_id,record_id,user_id,version) VALUES($1,$2,$3,$4,$5) ON CONFLICT(record_id,user_id,version) DO NOTHING",
      [
        randomUUID(),
        req.tenant,
        req.params.id,
        req.user.id,
        rows[0].data.version || 1,
      ],
    );
    res.json({ acknowledged: true, version: rows[0].data.version || 1 });
  }),
);

workflows.get(
  "/acknowledgements",
  route(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT a.*,u.name FROM service_acknowledgements a JOIN service_users u ON u.id=a.user_id WHERE a.tenant_id=$1",
      [req.tenant],
    );
    res.json(rows);
  }),
);

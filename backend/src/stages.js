import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool } from "./db.js";

export const stageDefinitions = [
  {
    key: "onboarding",
    title: "Client onboarding",
    description:
      "Confirm the engagement, key contacts and delivery responsibilities.",
    output: "Agreed engagement brief",
    checklist: [
      "Confirm client contacts",
      "Agree engagement objectives",
      "Assign delivery responsibilities",
    ],
  },
  {
    key: "scope",
    title: "Scope & planning",
    description:
      "Define the services, systems and information in the ISMS boundary.",
    output: "Reviewed ISMS scope",
    checklist: [
      "Document the ISMS boundary",
      "Identify systems and locations",
      "Agree the delivery plan",
    ],
  },
  {
    key: "controls",
    title: "Controls & policies",
    description:
      "Review applicability, assign owners and prepare the required policies.",
    output: "Control and policy register",
    checklist: [
      "Review control applicability",
      "Assign control owners",
      "Review the policy register",
    ],
  },
  {
    key: "evidence",
    title: "Evidence collection",
    description:
      "Collect client documents and verify their relevance, ownership and validity.",
    output: "Reviewed evidence library",
    checklist: [
      "Upload supporting documents",
      "Map evidence to controls",
      "Review evidence validity",
    ],
  },
  {
    key: "remediation",
    title: "Gap remediation",
    description:
      "Assess risks, close gaps and track the actions needed for readiness.",
    output: "Reviewed remediation register",
    checklist: [
      "Review identified risks",
      "Assign remediation actions",
      "Verify closure evidence",
    ],
  },
  {
    key: "audit",
    title: "Audit preparation",
    description:
      "Review readiness, coordinate audit requests and prepare the handover.",
    output: "Audit preparation package",
    checklist: [
      "Review outstanding gaps",
      "Coordinate audit evidence requests",
      "Prepare the handover package",
    ],
  },
];
export const stageKey = (value) =>
  stageDefinitions.some((stage) => stage.key === value);
const fail = (status, message) => Object.assign(new Error(message), { status });
const route = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res)).catch(next);

export async function seedStages(db, tenant, owner = "") {
  for (const stage of stageDefinitions) {
    await db.query(
      "INSERT INTO service_stages(tenant_id,key,data) VALUES($1,$2,$3) ON CONFLICT(tenant_id,key) DO NOTHING",
      [tenant, stage.key, { owner, notes: "", checklist: [] }],
    );
  }
}

export async function invalidateStage(db, tenant, key, actor) {
  if (!key) key = "evidence";
  const result = await db.query(
    "UPDATE service_stages SET status='in_progress',data=data - 'approvedBy' - 'approvedAt',updated_at=now() WHERE tenant_id=$1 AND key=$2 AND status='approved' RETURNING key",
    [tenant, key],
  );
  if (result.rows.length)
    await db.query(
      "INSERT INTO service_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)",
      [randomUUID(), tenant, actor, `stage.${key}.reopened_by_evidence_change`],
    );
}

export const stages = Router({ mergeParams: true });
stages.get(
  "/stages",
  route(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT * FROM service_stages WHERE tenant_id=$1",
      [req.tenant],
    );
    res.json(
      stageDefinitions.map((definition, index) => ({
        ...definition,
        number: index + 1,
        ...(rows.find((row) => row.key === definition.key) || {
          status: "not_started",
          data: {},
        }),
      })),
    );
  }),
);

stages.patch(
  "/stages/:key",
  route(async (req, res) => {
    const definition = stageDefinitions.find(
      (stage) => stage.key === req.params.key,
    );
    if (!definition) throw fail(404, "Stage not found.");
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const { rows } = await db.query(
        "SELECT * FROM service_stages WHERE tenant_id=$1 AND key=$2 FOR UPDATE",
        [req.tenant, definition.key],
      );
      if (!rows.length) throw fail(404, "Stage not initialized.");
      const previous = rows[0];
      const data = { ...previous.data };
      const status =
        req.body.status ||
        (previous.status === "approved" ? "in_progress" : previous.status);
      if (
        !["not_started", "in_progress", "waiting_review", "approved"].includes(
          status,
        )
      )
        throw fail(400, "Invalid stage status.");
      for (const key of ["owner", "notes", "dueDate", "reviewNote"]) {
        if (req.body[key] !== undefined) {
          if (typeof req.body[key] !== "string" || req.body[key].length > 12000)
            throw fail(400, `Invalid ${key}.`);
          data[key] = req.body[key];
        }
      }
      if (
        data.dueDate &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(data.dueDate) ||
          !Number.isFinite(Date.parse(data.dueDate)))
      )
        throw fail(400, "Choose a valid due date.");
      if (req.body.checklist !== undefined) {
        if (
          !Array.isArray(req.body.checklist) ||
          req.body.checklist.some(
            (item) =>
              !Number.isInteger(item) ||
              item < 0 ||
              item >= definition.checklist.length,
          )
        )
          throw fail(400, "Invalid checklist items.");
        data.checklist = [...new Set(req.body.checklist)];
      }
      if (status === "approved") {
        if (!["admin", "reviewer"].includes(req.role))
          throw fail(403, "A reviewer must approve the stage.");
        if (
          (data.checklist || []).length !== definition.checklist.length ||
          !data.reviewNote?.trim()
        )
          throw fail(
            400,
            "Complete the checklist and add a review note before approval.",
          );
        const documents = await db.query(
          "SELECT data FROM service_records WHERE tenant_id=$1 AND kind='documents' AND deleted_at IS NULL",
          [req.tenant],
        );
        if (
          documents.rows.some(
            (item) =>
              (item.data.stageKey || "evidence") === definition.key &&
              item.data.status !== "approved",
          )
        )
          throw fail(
            400,
            "Review all documents in this stage before approval.",
          );
        data.approvedBy = req.user.name;
        data.approvedAt = new Date().toISOString();
      } else {
        delete data.approvedBy;
        delete data.approvedAt;
      }
      await db.query(
        "UPDATE service_stages SET status=$1,data=$2,updated_at=now() WHERE tenant_id=$3 AND key=$4",
        [status, data, req.tenant, definition.key],
      );
      await db.query(
        "INSERT INTO service_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)",
        [
          randomUUID(),
          req.tenant,
          req.user.id,
          `stage.${definition.key}.${status}`,
        ],
      );
      await db.query("COMMIT");
      res.json({ key: definition.key, status, data });
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
  }),
);

stages.get(
  "/trash",
  route(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT id,kind,data,deleted_at FROM service_records WHERE tenant_id=$1 AND kind='documents' AND deleted_at IS NOT NULL ORDER BY deleted_at DESC",
      [req.tenant],
    );
    res.json(rows);
  }),
);

async function documentTrash(req, res, restore) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const { rows } = await db.query(
      "SELECT * FROM service_records WHERE tenant_id=$1 AND id=$2 AND kind='documents' FOR UPDATE",
      [req.tenant, req.params.id],
    );
    if (!rows.length || (restore ? !rows[0].deleted_at : rows[0].deleted_at))
      throw fail(404, "Document not found.");
    const document = rows[0];
    const data = { ...document.data };
    if (restore) {
      data.status = "review_required";
      delete data.reviewedBy;
      delete data.reviewedAt;
    }
    await db.query(
      "INSERT INTO service_versions(id,tenant_id,record_id,actor_id,data) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), req.tenant, document.id, req.user.id, document.data],
    );
    await db.query(
      "UPDATE service_records SET data=$1,deleted_at=$2,updated_at=now() WHERE id=$3",
      [data, restore ? null : new Date(), document.id],
    );
    await invalidateStage(db, req.tenant, data.stageKey, req.user.id);
    await db.query(
      "INSERT INTO service_events(id,tenant_id,actor_id,action,record_id) VALUES($1,$2,$3,$4,$5)",
      [
        randomUUID(),
        req.tenant,
        req.user.id,
        restore ? "documents.restored" : "documents.deleted",
        document.id,
      ],
    );
    await db.query("COMMIT");
    res.json({ id: document.id, restored: restore });
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}
stages.delete(
  "/documents/:id",
  route((req, res) => documentTrash(req, res, false)),
);
stages.post(
  "/documents/:id/restore",
  route((req, res) => documentTrash(req, res, true)),
);

stages.get(
  "/members",
  route(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT u.id,u.name,u.email,m.role FROM service_memberships m JOIN service_users u ON u.id=m.user_id WHERE m.tenant_id=$1",
      [req.tenant],
    );
    res.json(rows);
  }),
);

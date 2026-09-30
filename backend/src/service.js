import { Router } from "express";
import {
  randomUUID,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { pool } from "./db.js";
import { extract } from "./extract.js";
import { workflows } from "./workflows.js";
import { riskScores } from "./readiness.js";

export const service = Router();
const hash = (value) => createHash("sha256").update(value).digest("hex");
export function passwordHash(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function passwordMatches(password, stored) {
  const [salt, key] = stored.split(":");
  return timingSafeEqual(
    scryptSync(password, salt, 64),
    Buffer.from(key, "hex"),
  );
}
const route = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res)).catch(next);
const fail = (status, message) => Object.assign(new Error(message), { status });
const kinds = [
  "controls",
  "documents",
  "risks",
  "vendors",
  "assets",
  "policies",
  "tasks",
  "training",
  "integrations",
  "scope",
];
const baseline = [
  ["5.1", "Security policy"],
  ["5.2", "Security responsibilities"],
  ["5.9", "Asset inventory"],
  ["5.15", "Access control"],
  ["5.19", "Supplier security"],
  ["5.24", "Incident preparedness"],
  ["5.30", "Business continuity"],
  ["6.3", "Security awareness"],
  ["8.8", "Vulnerability management"],
  ["8.13", "Backup"],
  ["8.15", "Logging"],
  ["8.32", "Change management"],
];
const attempts = new Map();
service.use((req, res, next) => {
  if (!["/login", "/register"].includes(req.path)) return next();
  const now = Date.now();
  for (const [key, value] of attempts)
    if (value.until < now) attempts.delete(key);
  const key = req.ip;
  const value = attempts.get(key) || { count: 0, until: now + 600000 };
  value.count++;
  attempts.set(key, value);
  if (value.count > 30)
    return res
      .status(429)
      .json({ error: "Too many sign-in attempts. Try again in ten minutes." });
  next();
});
async function record(db, tenant, kind, data) {
  const id = randomUUID();
  await db.query(
    "INSERT INTO service_records(id,tenant_id,kind,data) VALUES($1,$2,$3,$4)",
    [id, tenant, kind, data],
  );
  return id;
}
async function event(db, tenant, actor, action, id) {
  await db.query(
    "INSERT INTO service_events(id,tenant_id,actor_id,action,record_id) VALUES($1,$2,$3,$4,$5)",
    [randomUUID(), tenant, actor, action, id],
  );
}

service.post(
  "/register",
  route(async (req, res) => {
    const { email, password, name, company } = req.body;
    if (
      typeof email !== "string" ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      typeof password !== "string" ||
      password.length < 12 ||
      !name ||
      !company
    )
      throw fail(
        400,
        "Provide company, name, email and a password of at least 12 characters.",
      );
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const user = randomUUID(),
        tenant = randomUUID();
      await db.query("INSERT INTO service_users VALUES($1,$2,$3,$4)", [
        user,
        email.toLowerCase(),
        passwordHash(password),
        name,
      ]);
      await db.query("INSERT INTO tenants(id,name,slug) VALUES($1,$2,$3)", [
        tenant,
        company,
        tenant,
      ]);
      await db.query("INSERT INTO service_memberships VALUES($1,$2,$3)", [
        user,
        tenant,
        "admin",
      ]);
      for (const [ref, title] of baseline)
        await record(db, tenant, "controls", {
          title,
          reference: `ISO27001 A.${ref}`,
          owner: name,
          status: "not_started",
          applicable: true,
          justification: "",
        });
      await record(db, tenant, "scope", {
        title: "ISMS scope",
        framework: "ISO 27001:2022",
        status: "draft",
        description: "",
        owner: name,
      });
      await event(db, tenant, user, "workspace.created", tenant);
      await db.query("COMMIT");
      res
        .status(201)
        .json({ message: "Workspace created. Sign in to continue." });
    } catch (e) {
      await db.query("ROLLBACK");
      if (e.code === "23505") throw fail(409, "Email already registered.");
      throw e;
    } finally {
      db.release();
    }
  }),
);
service.post(
  "/login",
  route(async (req, res) => {
    const { email, password } = req.body;
    if (typeof email !== "string" || typeof password !== "string")
      throw fail(400, "Email and password required.");
    const { rows } = await pool.query(
      "SELECT * FROM service_users WHERE email=$1",
      [email.toLowerCase()],
    );
    if (!rows[0] || !passwordMatches(password, rows[0].password_hash))
      throw fail(401, "Invalid email or password.");
    const token = randomBytes(32).toString("hex");
    await pool.query(
      "INSERT INTO service_sessions VALUES($1,$2,now()+interval '8 hours')",
      [hash(token), rows[0].id],
    );
    res.cookie("grc_session", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 28800000,
      path: "/",
    });
    res.json({ name: rows[0].name });
  }),
);
service.use((req, res, next) => {
  (async () => {
    const token = (req.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("grc_session="))
      ?.slice(12);
    const { rows } = await pool.query(
      "SELECT u.id,u.name,u.email FROM service_sessions s JOIN service_users u ON u.id=s.user_id WHERE token_hash=$1 AND expires_at>now()",
      [hash(token || "")],
    );
    if (!rows[0]) throw fail(401, "Sign in required.");
    req.user = rows[0];
    next();
  })().catch(next);
});
service.get(
  "/me",
  route(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT t.id,t.name,m.role FROM tenants t JOIN service_memberships m ON t.id=m.tenant_id WHERE m.user_id=$1",
      [req.user.id],
    );
    res.json({ user: req.user, workspaces: rows });
  }),
);
service.post(
  "/workspaces",
  route(async (req, res) => {
    const membership = await pool.query(
      "SELECT tenant_id FROM service_memberships WHERE user_id=$1 AND role='admin'",
      [req.user.id],
    );
    if (!membership.rows.length)
      throw fail(403, "Administrator access required.");
    if (typeof req.body.company !== "string" || !req.body.company.trim())
      throw fail(400, "Client company required.");
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const tenant = randomUUID();
      await db.query("INSERT INTO tenants(id,name,slug) VALUES($1,$2,$3)", [
        tenant,
        req.body.company.trim(),
        tenant,
      ]);
      await db.query("INSERT INTO service_memberships VALUES($1,$2,$3)", [
        req.user.id,
        tenant,
        "admin",
      ]);
      for (const [ref, title] of baseline)
        await record(db, tenant, "controls", {
          title,
          reference: `ISO27001 A.${ref}`,
          owner: req.user.name,
          status: "not_started",
          applicable: true,
          justification: "",
        });
      await record(db, tenant, "scope", {
        title: "ISMS scope",
        framework: "ISO 27001:2022",
        status: "draft",
        owner: req.user.name,
      });
      await event(db, tenant, req.user.id, "workspace.created", tenant);
      await db.query("COMMIT");
      res.status(201).json({ id: tenant });
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
  }),
);
service.post(
  "/logout",
  route(async (req, res) => {
    await pool.query("DELETE FROM service_sessions WHERE user_id=$1", [
      req.user.id,
    ]);
    res.clearCookie("grc_session", { path: "/" });
    res.json({ ok: true });
  }),
);
service.use("/workspaces/:tenantId", (req, res, next) => {
  (async () => {
    const { rows } = await pool.query(
      "SELECT role FROM service_memberships WHERE user_id=$1 AND tenant_id=$2",
      [req.user.id, req.params.tenantId],
    );
    if (!rows[0]) throw fail(403, "Workspace access denied.");
    req.tenant = req.params.tenantId;
    req.role = rows[0].role;
    if (req.method !== "GET" && req.role === "auditor")
      throw fail(403, "Auditors have read-only access.");
    next();
  })().catch(next);
});
service.get(
  "/workspaces/:tenantId/records",
  route(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT id,kind,data,created_at,updated_at FROM service_records WHERE tenant_id=$1 ORDER BY created_at DESC",
      [req.tenant],
    );
    res.json(rows);
  }),
);
service.use("/workspaces/:tenantId", workflows);
service.get(
  "/workspaces/:tenantId/events",
  route(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT e.*,u.name AS actor FROM service_events e JOIN service_users u ON u.id=e.actor_id WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200",
      [req.tenant],
    );
    res.json(rows);
  }),
);
service.post(
  "/workspaces/:tenantId/upload",
  route(async (req, res) => {
    const { filename, content } = req.body;
    if (
      typeof filename !== "string" ||
      typeof content !== "string" ||
      content.length > 7000000
    )
      throw fail(400, "Provide a document of at most 5 MB.");
    const bytes = Buffer.from(content, "base64");
    if (bytes.length > 5 * 1024 * 1024)
      throw fail(400, "Document exceeds 5 MB.");
    let text;
    try {
      text = await extract(filename, bytes);
    } catch (e) {
      throw fail(422, "Document extraction failed: " + e.message);
    }
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const id = await record(db, req.tenant, "documents", {
        title: filename,
        description: text.slice(0, 200000),
        status: "review_required",
        owner: req.user.name,
        submittedBy: req.user.name,
        extractionStatus: text.trim() ? "extracted" : "ocr_required",
        checksum: hash(bytes),
        checks: [
          "Confirm ISMS scope relevance",
          "Validate document version and approvals",
          "Review evidence period and control mapping",
        ],
      });
      await db.query("INSERT INTO service_files VALUES($1,$2,$3,$4,$5)", [
        id,
        req.tenant,
        filename,
        bytes,
        hash(bytes),
      ]);
      await event(db, req.tenant, req.user.id, "documents.uploaded", id);
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
service.get(
  "/workspaces/:tenantId/files/:id",
  route(async (req, res) => {
    const { rows } = await pool.query(
      "SELECT filename,content FROM service_files WHERE record_id=$1 AND tenant_id=$2",
      [req.params.id, req.tenant],
    );
    if (!rows[0]) throw fail(404, "File not found.");
    res.set("Content-Type", "application/octet-stream");
    res.set(
      "Content-Disposition",
      `attachment; filename="${rows[0].filename.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
    );
    res.send(rows[0].content);
  }),
);
service.post(
  "/workspaces/:tenantId/members",
  route(async (req, res) => {
    if (req.role !== "admin") throw fail(403, "Administrator access required.");
    const { email, password, name, role } = req.body;
    if (
      !["reviewer", "client", "auditor"].includes(role) ||
      typeof password !== "string" ||
      password.length < 12 ||
      !name ||
      typeof email !== "string" ||
      !/^\S+@\S+\.\S+$/.test(email)
    )
      throw fail(
        400,
        "Provide valid member details and a 12-character password.",
      );
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const id = randomUUID();
      await db.query("INSERT INTO service_users VALUES($1,$2,$3,$4)", [
        id,
        email.toLowerCase(),
        passwordHash(password),
        name,
      ]);
      await db.query("INSERT INTO service_memberships VALUES($1,$2,$3)", [
        id,
        req.tenant,
        role,
      ]);
      await event(db, req.tenant, req.user.id, "member.created", id);
      await db.query("COMMIT");
      res.status(201).json({ id });
    } catch (e) {
      await db.query("ROLLBACK");
      if (e.code === "23505") throw fail(409, "Account already exists.");
      throw e;
    } finally {
      db.release();
    }
  }),
);
service.post(
  "/workspaces/:tenantId/records/:kind",
  route(async (req, res) => {
    const { kind } = req.params;
    if (!kinds.includes(kind)) throw fail(400, "Unknown module.");
    const data = req.body;
    if (typeof data.title !== "string" || !data.title.trim())
      throw fail(400, "Title required.");
    delete data.reviewedBy;
    delete data.reviewedAt;
    if (kind === "risks") riskScores(data);
    if (data.controlId) {
      const target = await pool.query(
        "SELECT id FROM service_records WHERE id=$1 AND tenant_id=$2 AND kind='controls'",
        [data.controlId, req.tenant],
      );
      if (!target.rows[0])
        throw fail(400, "Control must belong to this workspace.");
    }
    if (
      ["controls", "policies", "scope"].includes(kind) &&
      !["admin", "reviewer"].includes(req.role)
    )
      throw fail(403, "Reviewer access required for governance records.");
    if (kind === "policies") {
      data.status = "draft";
      data.version = 1;
    }
    if (kind === "documents") {
      data.status = "review_required";
      data.submittedBy = req.user.name;
      data.checks = [
        "Review scope relevance",
        "Confirm ownership and document version",
        "Validate approvals and evidence period",
      ];
    } else if (kind === "integrations") {
      data.status = "not_connected";
      data.note =
        "Connection credentials and provider implementation required.";
    } else data.status = data.status || "draft";
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const id = await record(db, req.tenant, kind, data);
      await event(db, req.tenant, req.user.id, `${kind}.created`, id);
      await db.query("COMMIT");
      res.status(201).json({ id, kind, data });
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  }),
);
service.patch(
  "/workspaces/:tenantId/records/:id",
  route(async (req, res) => {
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const { rows } = await db.query(
        "SELECT * FROM service_records WHERE id=$1 AND tenant_id=$2 FOR UPDATE",
        [req.params.id, req.tenant],
      );
      if (!rows[0]) throw fail(404, "Record not found.");
      const previous = rows[0];
      const data = { ...previous.data, ...req.body };
      if (
        ["controls", "policies", "scope", "audits"].includes(previous.kind) &&
        !["admin", "reviewer"].includes(req.role)
      )
        throw fail(403, "Reviewer access required for governance records.");
      if (
        previous.kind === "controls" &&
        data.applicable === false &&
        !data.justification?.trim()
      )
        throw fail(
          400,
          "Excluded controls require an applicability justification.",
        );
      if (previous.kind === "risks") riskScores(data);
      if (previous.kind === "policies") {
        data.version = previous.data.version || 1;
        if (
          req.body.description !== undefined &&
          req.body.description !== previous.data.description
        ) {
          data.version++;
          data.status = "draft";
        }
      }
      if (data.expiresAt && Number.isNaN(Date.parse(data.expiresAt)))
        throw fail(400, "Evidence expiry must be a valid date.");
      delete data.reviewedBy;
      delete data.reviewedAt;
      if (
        previous.kind === "documents" &&
        previous.data.status === "approved" &&
        ["title", "description", "controlId", "expiresAt"].some(
          (key) =>
            req.body[key] !== undefined && req.body[key] !== previous.data[key],
        )
      ) {
        data.status = "review_required";
        data.reviewNote = "";
      }
      if (previous.kind === "documents" && data.status === "approved") {
        if (!["admin", "reviewer"].includes(req.role))
          throw fail(403, "Reviewer approval required.");
        if (!data.reviewNote?.trim())
          throw fail(400, "Document approval requires a review note.");
        data.reviewedBy = req.user.name;
        data.reviewedAt = new Date().toISOString();
      }
      if (data.controlId) {
        const target = await db.query(
          "SELECT id FROM service_records WHERE id=$1 AND tenant_id=$2 AND kind='controls'",
          [data.controlId, req.tenant],
        );
        if (!target.rows[0])
          throw fail(400, "Control must belong to this workspace.");
      }
      await db.query(
        "INSERT INTO service_versions(id,tenant_id,record_id,actor_id,data) VALUES($1,$2,$3,$4,$5)",
        [randomUUID(), req.tenant, previous.id, req.user.id, previous.data],
      );
      await db.query(
        "UPDATE service_records SET data=$1,updated_at=now() WHERE id=$2",
        [data, previous.id],
      );
      await event(
        db,
        req.tenant,
        req.user.id,
        `${previous.kind}.updated`,
        previous.id,
      );
      await db.query("COMMIT");
      res.json({ id: previous.id, kind: previous.kind, data });
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  }),
);
service.get(
  "/workspaces/:tenantId/export",
  route(async (req, res) => {
    const records = await pool.query(
      "SELECT id,kind,data,created_at,updated_at FROM service_records WHERE tenant_id=$1",
      [req.tenant],
    );
    const events = await pool.query(
      "SELECT action,record_id,created_at FROM service_events WHERE tenant_id=$1",
      [req.tenant],
    );
    res.set(
      "Content-Disposition",
      'attachment; filename="grc-audit-package.json"',
    );
    res.json({
      workspace: req.tenant,
      exportedAt: new Date().toISOString(),
      records: records.rows,
      events: events.rows,
    });
  }),
);

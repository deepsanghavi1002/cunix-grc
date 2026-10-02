import { Router } from "express";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { pool } from "./db.js";
import { runMonitor } from "./isms.js";

export const collectorIngest = Router(),
  collectorSettings = Router({ mergeParams: true });
const hash = (s) => createHash("sha256").update(s).digest("hex");
const route = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res)).catch(next);
const fail = (status, message) => Object.assign(new Error(message), { status });
const attempts = new Map();
const requireAdmin = (req) => {
  if (req.role !== "admin")
    throw fail(403, "Workspace administrator required.");
};

collectorIngest.post(
  "/collect/:tenantId",
  route(async (req, res) => {
    const token = (req.headers.authorization || "").replace(/^Bearer /, "");
    if (!/^[a-f0-9]{64}$/.test(token))
      throw fail(401, "Valid collector token required.");
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const row = (
        await db.query(
          "SELECT * FROM service_collectors WHERE tenant_id=$1 AND token_hash=$2 AND enabled=true AND expires_at>now() FOR UPDATE",
          [req.params.tenantId, hash(token)],
        )
      ).rows[0];
      if (!row)
        throw fail(401, "Collector token is invalid, revoked or expired.");
      const now = Date.now();
      for (const [key, value] of attempts)
        if (value.until < now) attempts.delete(key);
      const limit = attempts.get(row.tenant_id) || {
        count: 0,
        until: now + 60000,
      };
      limit.count++;
      attempts.set(row.tenant_id, limit);
      if (limit.count > 30) throw fail(429, "Collector rate limit exceeded.");
      const { key, title, status, observedAt, detail, source } = req.body;
      if (
        typeof key !== "string" ||
        !/^github\.[a-zA-Z0-9_.-]{1,180}$/.test(key) ||
        typeof title !== "string" ||
        title.length > 200 ||
        !title.trim() ||
        !["pass", "fail", "unknown"].includes(status) ||
        typeof detail !== "string" ||
        detail.length > 2000 ||
        source !== "github-branch-protection"
      )
        throw fail(400, "Invalid GitHub collector observation.");
      const observed = Date.parse(observedAt);
      if (
        !Number.isFinite(observed) ||
        observed > now + 300000 ||
        observed < now - 86400000
      )
        throw fail(
          400,
          "Observation must be from the last 24 hours, with at most 5 minutes clock skew.",
        );
      const previous = (
        await db.query(
          "SELECT data FROM service_observations WHERE tenant_id=$1 AND key=$2",
          [row.tenant_id, key],
        )
      ).rows[0];
      if (previous && Date.parse(previous.data.observedAt) >= observed) {
        await db.query("COMMIT");
        return res.json({ ok: true, ignored: true });
      }
      const data = {
        key,
        title,
        status,
        observedAt: new Date(observed).toISOString(),
        receivedAt: new Date().toISOString(),
        detail,
        source,
        provenance:
          "Reported by an authenticated client collector; requires assurance review",
        ref: "A.8.32",
      };
      await db.query(
        "INSERT INTO service_observations(tenant_id,key,data) VALUES($1,$2,$3) ON CONFLICT(tenant_id,key) DO UPDATE SET data=EXCLUDED.data",
        [row.tenant_id, key, data],
      );
      await db.query(
        "UPDATE service_programs SET next_run_at=now() WHERE tenant_id=$1",
        [row.tenant_id],
      );
      await db.query(
        "INSERT INTO service_monitor_runs(id,tenant_id,data) VALUES($1,$2,$3)",
        [
          randomUUID(),
          row.tenant_id,
          {
            checked: 1,
            attention: status === "pass" ? 0 : 1,
            source: `Collector: ${title}`,
            observation: data,
          },
        ],
      );
      await db.query("COMMIT");
      res.status(202).json({ ok: true });
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  }),
);

collectorSettings.get(
  "/isms/collector",
  route(async (req, res) => {
    const config = (
      await pool.query(
        "SELECT enabled,expires_at,updated_at FROM service_collectors WHERE tenant_id=$1",
        [req.tenant],
      )
    ).rows[0];
    const observations = (
      await pool.query(
        "SELECT data FROM service_observations WHERE tenant_id=$1",
        [req.tenant],
      )
    ).rows.map((r) => ({
      ...r.data,
      stale: Date.now() - Date.parse(r.data.observedAt) > 26 * 3600000,
    }));
    res.json({ config: config || null, observations });
  }),
);
collectorSettings.post(
  "/isms/collector",
  route(async (req, res) => {
    requireAdmin(req);
    const program = await pool.query(
      "SELECT tenant_id FROM service_programs WHERE tenant_id=$1",
      [req.tenant],
    );
    if (!program.rows.length) throw fail(409, "Activate ISMS first.");
    const token = randomBytes(32).toString("hex"),
      expires = new Date(Date.now() + 90 * 86400000);
    await pool.query(
      "INSERT INTO service_collectors(tenant_id,token_hash,expires_at) VALUES($1,$2,$3) ON CONFLICT(tenant_id) DO UPDATE SET token_hash=EXCLUDED.token_hash,expires_at=EXCLUDED.expires_at,enabled=true,updated_at=now()",
      [req.tenant, hash(token), expires],
    );
    await pool.query(
      "INSERT INTO service_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)",
      [randomUUID(), req.tenant, req.user.id, "collector.token.rotated"],
    );
    await runMonitor(req.tenant);
    res.status(201).json({ token, expiresAt: expires });
  }),
);
collectorSettings.delete(
  "/isms/collector",
  route(async (req, res) => {
    requireAdmin(req);
    await pool.query(
      "UPDATE service_collectors SET enabled=false WHERE tenant_id=$1",
      [req.tenant],
    );
    await pool.query(
      "INSERT INTO service_events(id,tenant_id,actor_id,action) VALUES($1,$2,$3,$4)",
      [randomUUID(), req.tenant, req.user.id, "collector.revoked"],
    );
    await runMonitor(req.tenant);
    res.json({ ok: true });
  }),
);

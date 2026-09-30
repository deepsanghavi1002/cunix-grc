import { Router } from 'express';
import { pool } from '../db.js';

export const dashboardRouter = Router();

dashboardRouter.get('/:tenantSlug', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT t.id, t.name, t.slug,
        (SELECT count(*) FROM controls c WHERE c.tenant_id = t.id) AS controls_total,
        (SELECT count(*) FROM controls c WHERE c.tenant_id = t.id AND c.status = 'passing') AS controls_passing,
        (SELECT count(*) FROM findings f WHERE f.tenant_id = t.id AND f.status IN ('open', 'in_progress')) AS findings_open,
        (SELECT count(*) FROM evidence e JOIN controls c ON c.id = e.control_id WHERE c.tenant_id = t.id AND e.status = 'expired') AS evidence_expired
      FROM tenants t WHERE t.slug = $1`, [req.params.tenantSlug]);
    if (!rows[0]) return res.status(404).json({ error: 'Tenant not found' });

    const tenant = rows[0];
    const [controls, findings, frameworks] = await Promise.all([
      pool.query('SELECT external_id, title, owner, status FROM controls WHERE tenant_id = $1 ORDER BY external_id', [tenant.id]),
      pool.query("SELECT id, title, severity, owner, due_date, status FROM findings WHERE tenant_id = $1 AND status IN ('open', 'in_progress') ORDER BY due_date", [tenant.id]),
      pool.query(`SELECT f.code, f.name, tf.status FROM tenant_frameworks tf JOIN frameworks f ON f.id = tf.framework_id WHERE tf.tenant_id = $1`, [tenant.id])
    ]);
    res.json({ tenant, controls: controls.rows, findings: findings.rows, frameworks: frameworks.rows });
  } catch (error) { next(error); }
});


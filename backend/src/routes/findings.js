import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db.js';

export const findingsRouter = Router();

findingsRouter.post('/', async (req, res, next) => {
  try {
    const { tenantId, controlId, title, severity, owner, dueDate } = req.body;
    if (![tenantId, title, severity, owner, dueDate].every(Boolean)) return res.status(400).json({ error: 'tenantId, title, severity, owner, and dueDate are required' });
    const { rows } = await pool.query(
      'INSERT INTO findings (id, tenant_id, control_id, title, severity, owner, due_date) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [randomUUID(), tenantId, controlId || null, title, severity, owner, dueDate]
    );
    res.status(201).json(rows[0]);
  } catch (error) { next(error); }
});


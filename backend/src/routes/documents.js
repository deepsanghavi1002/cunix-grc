import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { pool } from '../db.js';

export const documentsRouter = Router();

function inspectDocument(text = '') {
  const normalized = text.toLowerCase();
  const hasApproval = /approved|approval|signed/.test(normalized);
  const hasReviewCycle = /annual|annually|every 12 months/.test(normalized);
  return {
    documentType: /access|entra|permission/.test(normalized) ? 'access_review' : 'policy',
    controlIds: ['20000000-0000-4000-8000-000000000001'],
    status: hasApproval && hasReviewCycle ? 'approved' : 'review_required',
    gapSummary: hasApproval && hasReviewCycle ? null : 'Confirm annual review cadence and management approval before accepting this as ISO 27001 evidence.'
  };
}

documentsRouter.post('/', async (req, res, next) => {
  try {
    const { tenantId, filename, extractedText = '' } = req.body;
    if (![tenantId, filename].every(Boolean)) return res.status(400).json({ error: 'tenantId and filename are required' });
    const review = inspectDocument(extractedText);
    const { rows } = await pool.query(
      `INSERT INTO compliance_documents (id, tenant_id, filename, document_type, status, mapped_control_ids, gap_summary)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [randomUUID(), tenantId, filename, review.documentType, review.status, review.controlIds, review.gapSummary]
    );
    res.status(201).json(rows[0]);
  } catch (error) { next(error); }
});

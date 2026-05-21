import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { getLogs, cleanupOldLogs } from '../services/audit';
import { getDb } from '../db';

const router = Router();

router.get('/logs', requireAuth, requireRole('administrator'), (req, res) => {
  const {
    dateFrom, dateTo, userId, action, entityType,
    page = '1', limit = '50',
  } = req.query as Record<string, string>;

  const result = getLogs({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    userId: userId ? parseInt(userId) : undefined,
    action: action || undefined,
    entityType: entityType || undefined,
    page: parseInt(page),
    limit: Math.min(parseInt(limit) || 50, 200),
  });

  res.json(result);
});

// Available filter options (users + action types)
router.get('/logs/meta', requireAuth, requireRole('administrator'), (_req, res) => {
  const users = getDb().prepare(
    'SELECT DISTINCT user_id AS id, username FROM audit_logs WHERE username IS NOT NULL ORDER BY username'
  ).all();
  const actions = getDb().prepare(
    'SELECT DISTINCT action FROM audit_logs ORDER BY action'
  ).all() as Array<{ action: string }>;
  const entityTypes = getDb().prepare(
    'SELECT DISTINCT entity_type AS entityType FROM audit_logs WHERE entity_type IS NOT NULL ORDER BY entity_type'
  ).all() as Array<{ entityType: string }>;

  res.json({
    users,
    actions: actions.map(r => r.action),
    entityTypes: entityTypes.map(r => r.entityType),
  });
});

export default router;

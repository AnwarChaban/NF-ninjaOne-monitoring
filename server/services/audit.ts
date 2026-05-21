import { getDb } from '../db';
import type { Request } from 'express';
import type { AuthUser } from './auth';

export interface AuditLogEntry {
  id: number;
  timestamp: string;
  userId: number | null;
  username: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  entityName: string | null;
  details: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface LogFilters {
  dateFrom?: string;
  dateTo?: string;
  userId?: number;
  action?: string;
  entityType?: string;
  page?: number;
  limit?: number;
}

export function logAction(
  user: AuthUser | null,
  action: string,
  entityType?: string | null,
  entityId?: string | number | null,
  entityName?: string | null,
  details?: Record<string, unknown> | string | null,
  req?: Request | null,
): void {
  try {
    const db = getDb();
    const ua = req
      ? (Array.isArray(req.headers['user-agent']) ? req.headers['user-agent'][0] : req.headers['user-agent'])
      : null;
    db.prepare(`
      INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, entity_name, details, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      user?.id ?? null,
      user?.username ?? 'system',
      action,
      entityType ?? null,
      entityId != null ? String(entityId) : null,
      entityName ?? null,
      details != null ? (typeof details === 'string' ? details : JSON.stringify(details)) : null,
      req?.ip ?? null,
      ua ?? null,
    );
  } catch (e) {
    console.error('[Audit] Failed to log action:', e);
  }
}

export function getLogs(filters: LogFilters = {}): { logs: AuditLogEntry[]; total: number } {
  const db = getDb();
  const { dateFrom, dateTo, userId, action, entityType, page = 1, limit = 50 } = filters;

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (dateFrom) { conditions.push('timestamp >= ?'); values.push(dateFrom); }
  if (dateTo) { conditions.push('timestamp <= ?'); values.push(dateTo + 'T23:59:59'); }
  if (userId) { conditions.push('user_id = ?'); values.push(userId); }
  if (action) { conditions.push('action LIKE ?'); values.push(`${action}%`); }
  if (entityType) { conditions.push('entity_type = ?'); values.push(entityType); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = (db.prepare(`SELECT COUNT(*) as count FROM audit_logs ${where}`).get(...values) as { count: number }).count;
  const offset = (page - 1) * limit;

  const logs = db.prepare(`
    SELECT id, timestamp, user_id AS userId, username, action,
           entity_type AS entityType, entity_id AS entityId, entity_name AS entityName,
           details, ip_address AS ipAddress, user_agent AS userAgent
    FROM audit_logs ${where}
    ORDER BY timestamp DESC
    LIMIT ? OFFSET ?
  `).all(...values, limit, offset) as AuditLogEntry[];

  return { logs, total };
}

export function cleanupOldLogs(): number {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 6);
  const result = getDb().prepare('DELETE FROM audit_logs WHERE timestamp < ?').run(cutoff.toISOString());
  return result.changes;
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAction = logAction;
exports.getLogs = getLogs;
exports.cleanupOldLogs = cleanupOldLogs;
const db_1 = require("../db");
function logAction(user, action, entityType, entityId, entityName, details, req) {
    try {
        const db = (0, db_1.getDb)();
        const ua = req
            ? (Array.isArray(req.headers['user-agent']) ? req.headers['user-agent'][0] : req.headers['user-agent'])
            : null;
        db.prepare(`
      INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, entity_name, details, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(user?.id ?? null, user?.username ?? 'system', action, entityType ?? null, entityId != null ? String(entityId) : null, entityName ?? null, details != null ? (typeof details === 'string' ? details : JSON.stringify(details)) : null, req?.ip ?? null, ua ?? null);
    }
    catch (e) {
        console.error('[Audit] Failed to log action:', e);
    }
}
function getLogs(filters = {}) {
    const db = (0, db_1.getDb)();
    const { dateFrom, dateTo, userId, action, entityType, page = 1, limit = 50 } = filters;
    const conditions = [];
    const values = [];
    if (dateFrom) {
        conditions.push('timestamp >= ?');
        values.push(dateFrom);
    }
    if (dateTo) {
        conditions.push('timestamp <= ?');
        values.push(dateTo + 'T23:59:59');
    }
    if (userId) {
        conditions.push('user_id = ?');
        values.push(userId);
    }
    if (action) {
        conditions.push('action LIKE ?');
        values.push(`${action}%`);
    }
    if (entityType) {
        conditions.push('entity_type = ?');
        values.push(entityType);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = db.prepare(`SELECT COUNT(*) as count FROM audit_logs ${where}`).get(...values).count;
    const offset = (page - 1) * limit;
    const logs = db.prepare(`
    SELECT id, timestamp, user_id AS userId, username, action,
           entity_type AS entityType, entity_id AS entityId, entity_name AS entityName,
           details, ip_address AS ipAddress, user_agent AS userAgent
    FROM audit_logs ${where}
    ORDER BY timestamp DESC
    LIMIT ? OFFSET ?
  `).all(...values, limit, offset);
    return { logs, total };
}
function cleanupOldLogs() {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 6);
    const result = (0, db_1.getDb)().prepare('DELETE FROM audit_logs WHERE timestamp < ?').run(cutoff.toISOString());
    return result.changes;
}

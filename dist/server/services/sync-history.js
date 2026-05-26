"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startSync = startSync;
exports.completeSync = completeSync;
exports.failSync = failSync;
exports.getLastSync = getLastSync;
exports.getLastSyncByTask = getLastSyncByTask;
exports.getSyncHistory = getSyncHistory;
exports.getSyncHistoryByTask = getSyncHistoryByTask;
exports.getAllLatestSyncs = getAllLatestSyncs;
exports.getAllLatestByTaskType = getAllLatestByTaskType;
const db_1 = require("../db");
const TASK_SQL = `
  id, integration, task_type AS taskType,
  started_at AS startedAt, completed_at AS completedAt,
  status, devices_synced AS devicesSynced, customers_synced AS customersSynced,
  error_message AS errorMessage, triggered_by AS triggeredBy
`;
function startSync(integration, triggeredBy, taskType) {
    const result = (0, db_1.getDb)().prepare(`
    INSERT INTO sync_history (integration, task_type, started_at, status, triggered_by)
    VALUES (?, ?, datetime('now'), 'running', ?)
  `).run(integration, taskType ?? null, triggeredBy);
    return result.lastInsertRowid;
}
function completeSync(id, devicesSynced, customersSynced = 0) {
    (0, db_1.getDb)().prepare(`
    UPDATE sync_history
    SET status = 'success', completed_at = datetime('now'), devices_synced = ?, customers_synced = ?
    WHERE id = ?
  `).run(devicesSynced, customersSynced, id);
}
function failSync(id, errorMessage) {
    (0, db_1.getDb)().prepare(`
    UPDATE sync_history
    SET status = 'error', completed_at = datetime('now'), error_message = ?
    WHERE id = ?
  `).run(errorMessage, id);
}
function getLastSync(integration) {
    return (0, db_1.getDb)().prepare(`SELECT ${TASK_SQL} FROM sync_history WHERE integration = ? ORDER BY started_at DESC LIMIT 1`).get(integration) ?? null;
}
function getLastSyncByTask(taskType) {
    return (0, db_1.getDb)().prepare(`SELECT ${TASK_SQL} FROM sync_history WHERE task_type = ? ORDER BY started_at DESC LIMIT 1`).get(taskType) ?? null;
}
function getSyncHistory(integration, limit = 20) {
    return (0, db_1.getDb)().prepare(`SELECT ${TASK_SQL} FROM sync_history WHERE integration = ? ORDER BY started_at DESC LIMIT ?`).all(integration, limit);
}
function getSyncHistoryByTask(taskType, limit = 20) {
    return (0, db_1.getDb)().prepare(`SELECT ${TASK_SQL} FROM sync_history WHERE task_type = ? ORDER BY started_at DESC LIMIT ?`).all(taskType, limit);
}
function getAllLatestSyncs() {
    const db = (0, db_1.getDb)();
    const integrations = ['ninjaone', 'unifi', 'sophos', 'backup'];
    return Object.fromEntries(integrations.map(i => [i, db.prepare(`SELECT ${TASK_SQL} FROM sync_history WHERE integration = ? ORDER BY started_at DESC LIMIT 1`).get(i) ?? null]));
}
function getAllLatestByTaskType() {
    const db = (0, db_1.getDb)();
    const tasks = ['ninjaone_customers', 'ninjaone_devices', 'unifi_customers', 'unifi_devices', 'sophos_customers', 'sophos_devices', 'sophos_alerts', 'backup_emails'];
    return Object.fromEntries(tasks.map(t => [t, db.prepare(`SELECT ${TASK_SQL} FROM sync_history WHERE task_type = ? ORDER BY started_at DESC LIMIT 1`).get(t) ?? null]));
}

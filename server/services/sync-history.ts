import { getDb } from '../db';

export type SyncIntegration = 'ninjaone' | 'unifi' | 'sophos' | 'backup';

export type TaskType =
  | 'ninjaone_customers' | 'ninjaone_devices'
  | 'unifi_customers'    | 'unifi_devices'
  | 'sophos_customers'   | 'sophos_devices' | 'sophos_alerts'
  | 'backup_emails';

export interface SyncRecord {
  id: number;
  integration: SyncIntegration;
  taskType: string | null;
  startedAt: string;
  completedAt: string | null;
  status: 'running' | 'success' | 'error';
  devicesSynced: number;
  customersSynced: number;
  errorMessage: string | null;
  triggeredBy: string | null;
}

const TASK_SQL = `
  id, integration, task_type AS taskType,
  started_at AS startedAt, completed_at AS completedAt,
  status, devices_synced AS devicesSynced, customers_synced AS customersSynced,
  error_message AS errorMessage, triggered_by AS triggeredBy
`;

export function startSync(integration: SyncIntegration, triggeredBy: string, taskType?: TaskType): number {
  const result = getDb().prepare(`
    INSERT INTO sync_history (integration, task_type, started_at, status, triggered_by)
    VALUES (?, ?, datetime('now'), 'running', ?)
  `).run(integration, taskType ?? null, triggeredBy);
  return result.lastInsertRowid as number;
}

export function completeSync(id: number, devicesSynced: number, customersSynced = 0): void {
  getDb().prepare(`
    UPDATE sync_history
    SET status = 'success', completed_at = datetime('now'), devices_synced = ?, customers_synced = ?
    WHERE id = ?
  `).run(devicesSynced, customersSynced, id);
}

export function failSync(id: number, errorMessage: string): void {
  getDb().prepare(`
    UPDATE sync_history
    SET status = 'error', completed_at = datetime('now'), error_message = ?
    WHERE id = ?
  `).run(errorMessage, id);
}

export function getLastSync(integration: SyncIntegration): SyncRecord | null {
  return (getDb().prepare(`SELECT ${TASK_SQL} FROM sync_history WHERE integration = ? ORDER BY started_at DESC LIMIT 1`).get(integration) as SyncRecord | undefined) ?? null;
}

export function getLastSyncByTask(taskType: TaskType): SyncRecord | null {
  return (getDb().prepare(`SELECT ${TASK_SQL} FROM sync_history WHERE task_type = ? ORDER BY started_at DESC LIMIT 1`).get(taskType) as SyncRecord | undefined) ?? null;
}

export function getSyncHistory(integration: SyncIntegration, limit = 20): SyncRecord[] {
  return getDb().prepare(`SELECT ${TASK_SQL} FROM sync_history WHERE integration = ? ORDER BY started_at DESC LIMIT ?`).all(integration, limit) as SyncRecord[];
}

export function getSyncHistoryByTask(taskType: TaskType, limit = 20): SyncRecord[] {
  return getDb().prepare(`SELECT ${TASK_SQL} FROM sync_history WHERE task_type = ? ORDER BY started_at DESC LIMIT ?`).all(taskType, limit) as SyncRecord[];
}

export function getAllLatestSyncs(): Record<SyncIntegration, SyncRecord | null> {
  const db = getDb();
  const integrations: SyncIntegration[] = ['ninjaone', 'unifi', 'sophos', 'backup'];
  return Object.fromEntries(
    integrations.map(i => [i, (db.prepare(`SELECT ${TASK_SQL} FROM sync_history WHERE integration = ? ORDER BY started_at DESC LIMIT 1`).get(i) as SyncRecord | undefined) ?? null])
  ) as Record<SyncIntegration, SyncRecord | null>;
}

export function getAllLatestByTaskType(): Record<TaskType, SyncRecord | null> {
  const db = getDb();
  const tasks: TaskType[] = ['ninjaone_customers', 'ninjaone_devices', 'unifi_customers', 'unifi_devices', 'sophos_customers', 'sophos_devices', 'sophos_alerts', 'backup_emails'];
  return Object.fromEntries(
    tasks.map(t => [t, (db.prepare(`SELECT ${TASK_SQL} FROM sync_history WHERE task_type = ? ORDER BY started_at DESC LIMIT 1`).get(t) as SyncRecord | undefined) ?? null])
  ) as Record<TaskType, SyncRecord | null>;
}

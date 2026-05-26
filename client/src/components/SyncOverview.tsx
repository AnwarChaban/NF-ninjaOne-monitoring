import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch, getStoredUser } from '../api';

// --- Types ---
interface TaskStatus {
  lastRun: string | null;
  completedAt: string | null;
  status: 'running' | 'success' | 'error' | 'never';
  devicesSynced: number;
  customersSynced: number;
  error: string | null;
}

interface SyncStatusResponse {
  ninjaone: { customers: TaskStatus; devices: TaskStatus };
  unifi:    { customers: TaskStatus; devices: TaskStatus };
  sophos:   { customers: TaskStatus; devices: TaskStatus; alerts: TaskStatus };
  backup:   { emails: TaskStatus };
}

interface HistoryRecord {
  id: number;
  startedAt: string;
  completedAt: string | null;
  status: 'running' | 'success' | 'error';
  devicesSynced: number;
  customersSynced: number;
  errorMessage: string | null;
  triggeredBy: string | null;
}

type Integration = 'ninjaone' | 'unifi' | 'sophos' | 'backup';

// --- Helpers ---
function statusBadge(status: TaskStatus['status']) {
  const map: Record<string, { color: string; bg: string; label: string }> = {
    running: { color: '#fbbf24', bg: '#78350f30', label: '🔄 Läuft' },
    success: { color: '#4ade80', bg: '#065f4620', label: '✅ OK' },
    error:   { color: '#f87171', bg: '#7f1d1d30', label: '❌ Fehler' },
    never:   { color: '#64748b', bg: '#1e293b',   label: '—' },
  };
  const s = map[status] ?? map.never;
  return (
    <span style={{ fontSize: '12px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', color: s.color, backgroundColor: s.bg }}>
      {s.label}
    </span>
  );
}

function formatTs(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

function parseCronHuman(expr: string): string {
  if (!expr) return expr;
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return expr;
  const [min, hour, , , ] = parts;
  if (min.startsWith('*/')) return `Alle ${min.slice(2)} Minuten`;
  if (hour.startsWith('*/')) return `Alle ${hour.slice(2)} Stunden`;
  if (min === '0' && !hour.includes('*')) return `Täglich um ${hour.padStart(2, '0')}:00 Uhr`;
  return expr;
}

// Compute next 5 runs from a cron expression (simple client-side)
function nextRuns(cronExpr: string, count = 5): string[] {
  try {
    // Use the server-provided cronSchedule, compute approximate next runs
    const results: string[] = [];
    const now = new Date();
    const parts = cronExpr.trim().split(/\s+/);
    if (parts.length < 5) return [];
    const [minPart, hourPart] = parts;

    const intervalMin = minPart.startsWith('*/') ? parseInt(minPart.slice(2)) : null;
    const intervalHour = hourPart.startsWith('*/') ? parseInt(hourPart.slice(2)) : null;
    const fixedHour = (!hourPart.includes('*') && !hourPart.includes('/')) ? parseInt(hourPart) : null;
    const fixedMin = (!minPart.includes('*') && !minPart.includes('/')) ? parseInt(minPart) : null;

    const next = new Date(now);
    for (let i = 0; i < count; i++) {
      if (intervalMin) {
        const minsLeft = intervalMin - (next.getMinutes() % intervalMin || intervalMin);
        next.setMinutes(next.getMinutes() + (i === 0 ? minsLeft : intervalMin), 0, 0);
      } else if (intervalHour) {
        const hoursLeft = intervalHour - (next.getHours() % intervalHour || intervalHour);
        next.setHours(next.getHours() + (i === 0 ? hoursLeft : intervalHour), 0, 0, 0);
      } else if (fixedHour !== null && fixedMin !== null) {
        if (i === 0) {
          next.setHours(fixedHour, fixedMin, 0, 0);
          if (next <= now) next.setDate(next.getDate() + 1);
        } else {
          next.setDate(next.getDate() + 1);
        }
      } else {
        break;
      }
      results.push(new Date(next).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }));
    }
    return results;
  } catch {
    return [];
  }
}

// --- Cron Editor Modal ---
function CronModal({ integration, current, onClose, onSave }: {
  integration: Integration;
  current: string;
  onClose: () => void;
  onSave: (expr: string) => Promise<void>;
}) {
  const [expr, setExpr] = useState(current);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const previews = nextRuns(expr);

  const EXAMPLES = [
    { label: 'Täglich 02:00', value: '0 2 * * *' },
    { label: 'Täglich 03:00', value: '0 3 * * *' },
    { label: 'Alle 4 Stunden', value: '0 */4 * * *' },
    { label: 'Alle 15 Min.', value: '*/15 * * * *' },
    { label: 'Alle 30 Min.', value: '*/30 * * * *' },
    { label: 'Stündlich', value: '0 * * * *' },
  ];

  async function handleSave() {
    if (!expr.trim()) { setError('Pflichtfeld'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave(expr.trim());
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px', backgroundColor: '#0f172a', border: '1px solid #334155',
    borderRadius: '6px', color: '#f1f5f9', fontSize: '14px', outline: 'none', width: '100%', boxSizing: 'border-box',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ backgroundColor: '#1e293b', borderRadius: '10px', padding: '28px 32px', width: '480px', border: '1px solid #334155' }}>
        <h3 style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: 700, margin: '0 0 20px' }}>
          Cron-Zeitplan bearbeiten — {integration}
        </h3>

        <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
          Cron-Ausdruck <span style={{ color: '#475569', fontWeight: 400 }}>(Minuten Stunden Tag Monat Wochentag)</span>
        </label>
        <input style={inputStyle} value={expr} onChange={e => { setExpr(e.target.value); setError(''); }} placeholder="0 2 * * *" />

        {error && <p style={{ color: '#f87171', fontSize: '12px', marginTop: '6px' }}>{error}</p>}

        <div style={{ marginTop: '12px', marginBottom: '14px' }}>
          <span style={{ color: '#475569', fontSize: '12px', marginRight: '8px' }}>Beispiele:</span>
          {EXAMPLES.map(e => (
            <button key={e.value} onClick={() => setExpr(e.value)} style={{
              marginRight: '6px', marginBottom: '4px', padding: '2px 8px', borderRadius: '4px',
              border: '1px solid #334155', backgroundColor: expr === e.value ? '#1e3a5f' : 'transparent',
              color: '#94a3b8', fontSize: '11px', cursor: 'pointer',
            }}>
              {e.label}
            </button>
          ))}
        </div>

        {previews.length > 0 && (
          <div style={{ backgroundColor: '#0f172a', borderRadius: '6px', padding: '10px 12px', marginBottom: '16px' }}>
            <p style={{ color: '#475569', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', margin: '0 0 6px' }}>Nächste 5 Ausführungen:</p>
            {previews.map((p, i) => <p key={i} style={{ color: '#64748b', fontSize: '12px', margin: '2px 0' }}>{p}</p>)}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #334155', backgroundColor: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '14px' }}>
            Abbrechen
          </button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', backgroundColor: saving ? '#1e40af' : '#3b82f6', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 600 }}>
            {saving ? 'Speichern...' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Task Row ---
function TaskRow({ label, status, taskType, onSync, canSync }: {
  label: string;
  status: TaskStatus & { cronSchedule?: string };
  taskType: string;
  onSync?: (taskType: string) => Promise<void>;
  canSync: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [errorDetail, setErrorDetail] = useState('');
  const [editingCron, setEditingCron] = useState(false);
  const [localCron, setLocalCron] = useState(status.cronSchedule ?? '');
  const [parts] = useState(() => taskType.split('/'));

  async function loadHistory() {
    if (history.length > 0) { setExpanded(e => !e); return; }
    setLoadingHistory(true);
    try {
      const res = await apiFetch(`/api/sync/history/${parts[0]}/${parts[1]}`);
      if (res.ok) setHistory(await res.json());
    } finally {
      setLoadingHistory(false);
      setExpanded(true);
    }
  }

  async function handleSync() {
    if (!onSync) return;
    setSyncing(true);
    try {
      await onSync(taskType);
    } finally {
      setSyncing(false);
    }
  }

  async function saveCron(expr: string) {
    const dbTaskType = parts.join('_');
    const res = await apiFetch(`/api/settings/cron/${dbTaskType}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cronExpression: expr }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(d.error || 'Fehler');
    }
    setLocalCron(expr);
  }

  const count = (status.devicesSynced || 0) + (status.customersSynced || 0);
  const integration = parts[0] as Integration;

  return (
    <div style={{ borderBottom: '1px solid #0f172a' }}>
      {/* Main row */}
      <div style={{ display: 'grid', gridTemplateColumns: '110px 90px 115px 55px auto', alignItems: 'center', gap: '6px', padding: '8px 16px', fontSize: '13px' }}>
        <span style={{ color: '#cbd5e1', fontWeight: 500 }}>{label}</span>
        <span>{statusBadge(status.status)}</span>
        <span style={{ color: '#64748b', fontSize: '12px' }}>{formatTs(status.lastRun)}</span>
        <span style={{ color: '#94a3b8', textAlign: 'right', fontSize: '12px' }}>{count > 0 ? count : '—'}</span>
        <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', alignItems: 'center' }}>
          {status.error && (
            <button onClick={() => setErrorDetail(errorDetail ? '' : status.error!)} title={status.error}
              style={{ padding: '2px 6px', borderRadius: '4px', border: '1px solid #7f1d1d', backgroundColor: 'transparent', color: '#f87171', fontSize: '11px', cursor: 'pointer' }}>!</button>
          )}
          {canSync && (
            <button onClick={handleSync} disabled={syncing || status.status === 'running'}
              style={{ padding: '4px 14px', borderRadius: '6px', border: 'none', backgroundColor: (syncing || status.status === 'running') ? '#1e3a5f' : '#3b82f6', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: (syncing || status.status === 'running') ? 'not-allowed' : 'pointer' }}>
              {syncing ? '...' : 'Sync'}
            </button>
          )}
          {canSync && (
            <button onClick={() => setEditingCron(true)} title="Zeitplan bearbeiten"
              style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid #334155', backgroundColor: 'transparent', color: '#64748b', fontSize: '16px', cursor: 'pointer', lineHeight: 1 }}>
              ⏱
            </button>
          )}
          <button onClick={loadHistory}
            style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid #334155', backgroundColor: 'transparent', color: '#475569', fontSize: '16px', cursor: 'pointer', lineHeight: 1 }}>
            {loadingHistory ? '...' : expanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* Cron display */}
      {localCron && (
        <div style={{ paddingLeft: '16px', paddingBottom: '6px', fontSize: '11px', color: '#334155' }}>
          <span style={{ fontFamily: 'monospace' }}>{localCron}</span>
          <span style={{ marginLeft: '6px', color: '#475569' }}>({parseCronHuman(localCron)})</span>
        </div>
      )}

      {errorDetail && (
        <div style={{ margin: '0 16px 8px', padding: '8px 10px', backgroundColor: '#7f1d1d20', borderRadius: '6px', color: '#f87171', fontSize: '12px', borderLeft: '3px solid #ef4444' }}>
          {errorDetail}
        </div>
      )}

      {expanded && (
        <div style={{ margin: '0 16px 8px', backgroundColor: '#0f172a', borderRadius: '6px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b' }}>
                {['Gestartet', 'Beendet', 'Status', 'Anzahl', 'Ausgelöst von'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '5px 10px', color: '#475569', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '10px', color: '#475569', textAlign: 'center' }}>Keine Einträge</td></tr>
              ) : history.slice(0, 10).map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '5px 10px', color: '#64748b' }}>{formatTs(r.startedAt)}</td>
                  <td style={{ padding: '5px 10px', color: '#64748b' }}>{formatTs(r.completedAt)}</td>
                  <td style={{ padding: '5px 10px' }}>{statusBadge(r.status)}</td>
                  <td style={{ padding: '5px 10px', color: '#94a3b8' }}>{(r.devicesSynced || 0) + (r.customersSynced || 0)}</td>
                  <td style={{ padding: '5px 10px', color: '#475569' }}>{r.triggeredBy ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingCron && (
        <CronModal
          integration={integration}
          current={localCron}
          onClose={() => setEditingCron(false)}
          onSave={saveCron}
        />
      )}
    </div>
  );
}

// --- Integration Card ---
function IntegrationCard({ title, icon, integration, tasks, onSyncDone, isAdmin }: {
  title: string;
  icon: string;
  integration: Integration;
  tasks: Array<{ label: string; taskType: string; status: TaskStatus & { cronSchedule?: string } }>;
  onSyncDone: () => void;
  isAdmin: boolean;
}) {
  async function handleSync(taskType: string) {
    const [integ, task] = taskType.split('/');
    await apiFetch(`/api/sync/${integ}/${task}`, { method: 'POST' });
    setTimeout(onSyncDone, 1500);
  }

  async function handleSyncFull() {
    await apiFetch(`/api/sync/${integration}`, { method: 'POST' });
    setTimeout(onSyncDone, 1500);
  }

  const overallStatus = tasks.some(t => t.status.status === 'error') ? 'error'
    : tasks.some(t => t.status.status === 'running') ? 'running'
    : tasks.every(t => t.status.status === 'success') ? 'success'
    : tasks.some(t => t.status.status === 'success') ? 'success'
    : 'never';

  return (
    <div style={{ backgroundColor: '#1e293b', borderRadius: '10px', border: '1px solid #334155', overflow: 'hidden' }}>
      {/* Card Header */}
      <div style={{ padding: '12px 16px', backgroundColor: '#111827', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '18px' }}>{icon}</span>
          <span style={{ color: '#f1f5f9', fontSize: '15px', fontWeight: 700 }}>{title}</span>
          {statusBadge(overallStatus)}
        </div>
        {isAdmin && (
          <button onClick={handleSyncFull}
            style={{ padding: '5px 12px', borderRadius: '6px', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', backgroundColor: '#3b82f6', color: '#fff' }}>
            Alles Sync
          </button>
        )}
      </div>

      {/* Column Headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '110px 90px 115px 55px auto', gap: '6px', padding: '4px 16px', borderBottom: '1px solid #1e293b' }}>
        {['Aufgabe', 'Status', 'Letzter Lauf', 'Anzahl', ''].map(h => (
          <span key={h} style={{ color: '#475569', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' }}>{h}</span>
        ))}
      </div>

      {/* Task Rows */}
      {tasks.map(task => (
        <TaskRow
          key={task.taskType}
          label={task.label}
          status={task.status}
          taskType={task.taskType}
          onSync={isAdmin ? handleSync : undefined}
          canSync={isAdmin}
        />
      ))}
    </div>
  );
}

// --- Main Component ---
export default function SyncOverview() {
  const [data, setData] = useState<SyncStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const isAdmin = getStoredUser()?.role === 'administrator';

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/sync/status');
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 30_000);
    return () => clearInterval(iv);
  }, [load]);

  if (loading) return <div style={{ color: '#64748b', padding: '40px' }}>Lade...</div>;

  const empty: TaskStatus = { lastRun: null, completedAt: null, status: 'never', devicesSynced: 0, customersSynced: 0, error: null };

  return (
    <div>
      <h2 style={{ color: '#f1f5f9', fontSize: '20px', fontWeight: 700, margin: '0 0 20px' }}>Sync-Übersicht</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <IntegrationCard title="NinjaOne" icon="🟣" integration="ninjaone"
          tasks={[
            { label: 'Kunden', taskType: 'ninjaone/customers', status: data?.ninjaone?.customers ?? empty },
            { label: 'Geräte',  taskType: 'ninjaone/devices',   status: data?.ninjaone?.devices   ?? empty },
          ]}
          onSyncDone={load} isAdmin={isAdmin} />

        <IntegrationCard title="UniFi" icon="🔵" integration="unifi"
          tasks={[
            { label: 'Kunden', taskType: 'unifi/customers', status: data?.unifi?.customers ?? empty },
            { label: 'Geräte',  taskType: 'unifi/devices',   status: data?.unifi?.devices   ?? empty },
          ]}
          onSyncDone={load} isAdmin={isAdmin} />

        <IntegrationCard title="Sophos" icon="🔥" integration="sophos"
          tasks={[
            { label: 'Kunden', taskType: 'sophos/customers', status: data?.sophos?.customers ?? empty },
            { label: 'Geräte',  taskType: 'sophos/devices',   status: data?.sophos?.devices   ?? empty },
            { label: 'Alerts',  taskType: 'sophos/alerts',    status: data?.sophos?.alerts    ?? empty },
          ]}
          onSyncDone={load} isAdmin={isAdmin} />

        <IntegrationCard title="Backup E-Mail" icon="💾" integration="backup"
          tasks={[
            { label: 'E-Mail Sync', taskType: 'backup/emails', status: data?.backup?.emails ?? empty },
          ]}
          onSyncDone={load} isAdmin={isAdmin} />
      </div>
    </div>
  );
}

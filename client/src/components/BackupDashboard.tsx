import { useEffect, useState } from 'react';
import {
  fetchBackupStatus, triggerBackupSync,
  setBackupCheckManualStatus, pauseBackupCheck, resumeBackupCheck,
  type BackupDashboardResponse, type BackupCheckStatus, type BackupStatus,
} from '../api';

const REFRESH_INTERVAL = 60_000;

function statusColor(status: BackupStatus): string {
  if (status === 'success') return '#22c55e';
  if (status === 'failed') return '#ef4444';
  if (status === 'missed') return '#ef4444';
  if (status === 'paused') return '#6366f1';
  return '#64748b';
}

function statusLabel(status: BackupStatus): string {
  if (status === 'success') return 'OK';
  if (status === 'failed') return 'Fehler';
  if (status === 'missed') return 'Ausgeblieben';
  if (status === 'paused') return 'Pausiert';
  return 'Unbekannt';
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return `vor ${Math.floor(diff / 60_000)} Min.`;
  if (h < 24) return `vor ${h} Std.`;
  return `vor ${Math.floor(h / 24)} Tag(en)`;
}

const slotDotColor = (status: 'success' | 'failed' | 'missed') =>
  status === 'success' ? '#22c55e' : '#ef4444';

const slotDotLabel = (status: 'success' | 'failed' | 'missed') => {
  if (status === 'success') return 'OK';
  if (status === 'failed') return 'Fehler';
  return 'Ausgeblieben';
};

// Most-recent slot shows as green square with ✓ when manually set to OK
function HistoryDots({
  results,
  manualStatus,
}: {
  results: BackupCheckStatus['recentResults'];
  manualStatus: BackupCheckStatus['manualStatus'];
}) {
  const reversed = [...results].reverse();
  return (
    <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
      {reversed.length === 0 && (
        <span style={{ color: '#475569', fontSize: '12px' }}>Keine Daten</span>
      )}
      {reversed.map((r, i) => {
        const isNewest = i === reversed.length - 1;
        const showManual = isNewest && manualStatus === 'success';

        if (showManual) {
          return (
            <div
              key={i}
              title="Manuell als OK markiert"
              style={{
                width: '10px', height: '10px', borderRadius: '2px',
                backgroundColor: '#22c55e', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <span style={{ color: '#fff', fontSize: '7px', fontWeight: 900, lineHeight: 1 }}>✓</span>
            </div>
          );
        }

        return (
          <div
            key={i}
            title={`${new Date(r.slotEnd).toLocaleString('de-DE')} — ${slotDotLabel(r.status)}`}
            style={{
              width: '10px', height: '10px', borderRadius: '50%',
              backgroundColor: slotDotColor(r.status),
              flexShrink: 0,
              opacity: r.status === 'missed' ? 0.5 : 1,
            }}
          />
        );
      })}
    </div>
  );
}

function CheckRow({ check, onRefresh }: { check: BackupCheckStatus; onRefresh: () => void }) {
  const [saving, setSaving] = useState(false);

  async function handleManualOkToggle() {
    if (saving) return;
    setSaving(true);
    try {
      const newStatus = check.manualStatus === 'success' ? null : 'success';
      await setBackupCheckManualStatus(check.id, newStatus, null);
      onRefresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handlePauseToggle() {
    if (saving) return;
    setSaving(true);
    try {
      if (check.paused) {
        await resumeBackupCheck(check.id);
      } else {
        const reason = window.prompt('Pausierungsgrund (optional):');
        if (reason === null) return;
        await pauseBackupCheck(check.id, reason || 'Manuell pausiert');
      }
      onRefresh();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const color = statusColor(check.currentStatus);
  const isPaused = Boolean(check.paused);
  const isManualOk = check.manualStatus === 'success';

  const pauseTitle = isPaused
    ? `Pausiert${check.pausedReason ? `: ${check.pausedReason}` : ''}${check.pausedUntil ? ` (bis ${new Date(check.pausedUntil).toLocaleDateString('de-DE')})` : ''}`
    : 'Pausieren';

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '14px 1fr auto 120px 110px auto',
      alignItems: 'center',
      gap: '12px',
      padding: '10px 16px',
      borderBottom: '1px solid #1e293b',
      opacity: isPaused ? 0.85 : 1,
    }}>
      {/* Status dot — square when manual, circle when auto */}
      <div style={{
        width: '10px', height: '10px',
        borderRadius: isManualOk ? '2px' : '50%',
        backgroundColor: color,
        flexShrink: 0,
      }} />

      {/* Name + paused badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
        <span
          style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={isPaused ? pauseTitle : undefined}
        >
          {check.name}
        </span>
        {isPaused && (
          <span style={{
            fontSize: '10px', fontWeight: 700, color: '#818cf8',
            backgroundColor: '#1e1b4b', border: '1px solid #4338ca55',
            borderRadius: '3px', padding: '1px 5px', flexShrink: 0,
          }}>
            PAUSIERT
          </span>
        )}
      </div>

      {/* History dots — most-recent slot shows ✓ square when manually OK */}
      <HistoryDots results={check.recentResults} manualStatus={check.manualStatus} />

      {/* Last email */}
      <span style={{ color: '#64748b', fontSize: '12px', textAlign: 'right' }}>
        {formatRelative(check.lastReceivedAt)}
      </span>

      {/* Status label */}
      <span style={{ fontSize: '12px', fontWeight: 600, color, textAlign: 'right' }}>
        {statusLabel(check.currentStatus)}
      </span>

      {/* Actions: ✓ OK-toggle + Pause */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'flex-end' }}>
        {/* Manual OK checkmark toggle */}
        <button
          onClick={handleManualOkToggle}
          disabled={saving || isPaused}
          title={isManualOk ? 'Manuelle OK-Markierung aufheben' : 'Als OK markieren'}
          style={{
            width: '26px', height: '26px', borderRadius: '5px', padding: 0,
            border: `2px solid ${isManualOk ? '#22c55e' : '#334155'}`,
            backgroundColor: isManualOk ? '#065f4620' : 'transparent',
            color: isManualOk ? '#22c55e' : '#475569',
            cursor: saving || isPaused ? 'default' : 'pointer',
            fontSize: '15px', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1,
          }}
        >
          ✓
        </button>

        {/* Pause / Resume */}
        <button
          onClick={handlePauseToggle}
          disabled={saving}
          title={pauseTitle}
          style={{
            fontSize: '11px', padding: '2px 8px',
            backgroundColor: isPaused ? '#1e1b4b' : 'transparent',
            border: `1px solid ${isPaused ? '#4338ca' : '#334155'}`,
            borderRadius: '4px',
            color: isPaused ? '#818cf8' : '#64748b',
            cursor: saving ? 'default' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {isPaused ? '▶ Fortsetzen' : '⏸ Pause'}
        </button>
      </div>
    </div>
  );
}

export default function BackupDashboard() {
  const [data, setData] = useState<BackupDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  async function load() {
    try {
      const result = await fetchBackupStatus();
      setData(result);
      setLastUpdate(new Date());
    } catch {
      // keep old data on error
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const iv = setInterval(load, REFRESH_INTERVAL);
    return () => clearInterval(iv);
  }, []);

  async function handleSync() {
    setSyncing(true);
    setSyncMsg('');
    try {
      const result = await triggerBackupSync();
      setSyncMsg(`Sync abgeschlossen: ${result.newResults} neue Ergebnisse`);
      await load();
    } catch (err) {
      setSyncMsg((err as Error).message || 'Sync fehlgeschlagen');
    } finally {
      setSyncing(false);
    }
  }

  const groups = data?.groups ?? [];
  const totalChecks  = groups.reduce((s, g) => s + g.checks.length, 0);
  const pausedCount  = groups.reduce((s, g) => s + g.checks.filter(c => c.currentStatus === 'paused').length, 0);
  const failedCount  = groups.reduce((s, g) => s + g.checks.filter(c => c.currentStatus === 'failed' || c.currentStatus === 'missed').length, 0);
  const successCount = groups.reduce((s, g) => s + g.checks.filter(c => c.currentStatus === 'success').length, 0);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#f1f5f9', margin: 0 }}>Backup-Überwachung</h1>
          <p style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>
            {totalChecks} Check(s) · {successCount} OK · {failedCount} Problem(e)
            {pausedCount > 0 && <span style={{ color: '#818cf8', marginLeft: '8px' }}>· {pausedCount} Pausiert</span>}
            {lastUpdate && <span style={{ marginLeft: '8px' }}>· Aktualisiert: {lastUpdate.toLocaleTimeString('de-DE')}</span>}
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing || !data?.configured}
          title={!data?.configured ? 'Graph API nicht konfiguriert' : undefined}
          style={{
            padding: '8px 16px', borderRadius: '6px', border: 'none',
            backgroundColor: data?.configured ? '#3b82f6' : '#334155',
            color: data?.configured ? '#fff' : '#64748b',
            fontSize: '13px', fontWeight: 600, cursor: data?.configured ? 'pointer' : 'default',
          }}
        >
          {syncing ? 'Sync läuft...' : 'Jetzt synchronisieren'}
        </button>
      </div>

      {syncMsg && <div style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '16px' }}>{syncMsg}</div>}

      {!data?.configured && (
        <div style={{
          padding: '16px', backgroundColor: '#1e293b', borderRadius: '8px',
          borderLeft: '4px solid #f59e0b', color: '#fbbf24', fontSize: '14px', marginBottom: '24px',
        }}>
          Microsoft Graph API ist nicht konfiguriert. Bitte Tenant ID, Client ID und Client Secret unter Admin → Einstellungen eingeben.
        </div>
      )}

      {loading && <p style={{ color: '#64748b', textAlign: 'center', padding: '60px' }}>Lade Backup-Status...</p>}

      {!loading && groups.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px', color: '#64748b', backgroundColor: '#1e293b', borderRadius: '10px' }}>
          <p style={{ fontSize: '16px', marginBottom: '8px' }}>Keine Backup-Checks konfiguriert</p>
          <p style={{ fontSize: '13px' }}>Gehe zu Checks verwalten um Checks anzulegen.</p>
        </div>
      )}

      {groups.map(group => {
        const groupFailed = group.checks.filter(c => c.currentStatus === 'failed' || c.currentStatus === 'missed').length;
        const groupOk     = group.checks.filter(c => c.currentStatus === 'success').length;
        const groupPaused = group.checks.filter(c => c.currentStatus === 'paused').length;

        return (
          <div key={group.customerId ?? '__none__'} style={{
            backgroundColor: '#0f1929', border: '1px solid #1e293b',
            borderRadius: '10px', marginBottom: '16px', overflow: 'hidden',
          }}>
            {/* Group header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 16px', backgroundColor: '#111827', borderBottom: '1px solid #1e293b',
            }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#f1f5f9' }}>{group.customerName}</span>
              <div style={{ display: 'flex', gap: '12px', fontSize: '12px' }}>
                {groupOk     > 0 && <span style={{ color: '#22c55e' }}>{groupOk} OK</span>}
                {groupFailed > 0 && <span style={{ color: '#ef4444', fontWeight: 700 }}>{groupFailed} Problem(e)</span>}
                {groupPaused > 0 && <span style={{ color: '#818cf8' }}>{groupPaused} Pausiert</span>}
                <span style={{ color: '#475569' }}>{group.checks.length} Checks</span>
              </div>
            </div>

            {/* Column header */}
            <div style={{
              display: 'grid', gridTemplateColumns: '14px 1fr auto 120px 110px auto',
              gap: '12px', padding: '6px 16px', borderBottom: '1px solid #1e293b',
            }}>
              <div />
              <span style={{ color: '#475569', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Name</span>
              <span style={{ color: '#475569', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Historie</span>
              <span style={{ color: '#475569', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', textAlign: 'right' }}>Letzte E-Mail</span>
              <span style={{ color: '#475569', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', textAlign: 'right' }}>Status</span>
              <span style={{ color: '#475569', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', textAlign: 'right' }}>Aktionen</span>
            </div>

            {group.checks.map(check => (
              <CheckRow key={check.id} check={check} onRefresh={load} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

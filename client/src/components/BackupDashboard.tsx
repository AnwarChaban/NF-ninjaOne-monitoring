import { useEffect, useState } from 'react';
import {
  fetchBackupStatus, triggerBackupSync,
  type BackupDashboardResponse, type BackupCheckStatus, type BackupStatus,
} from '../api';

const REFRESH_INTERVAL = 60_000;

function statusColor(status: BackupStatus): string {
  if (status === 'success') return '#22c55e';
  if (status === 'failed') return '#ef4444';
  if (status === 'missed') return '#ef4444';
  return '#64748b';
}

function statusLabel(status: BackupStatus): string {
  if (status === 'success') return 'OK';
  if (status === 'failed') return 'Fehler';
  if (status === 'missed') return 'Ausgeblieben';
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

const slotDotColor = (status: 'success' | 'failed' | 'missed') => {
  if (status === 'success') return '#22c55e';
  if (status === 'failed') return '#ef4444';
  return '#ef4444'; // missed = rot
};

const slotDotLabel = (status: 'success' | 'failed' | 'missed') => {
  if (status === 'success') return 'OK';
  if (status === 'failed') return 'Fehler';
  return 'Ausgeblieben';
};

function HistoryDots({ results }: { results: BackupCheckStatus['recentResults'] }) {
  return (
    <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
      {results.length === 0 && (
        <span style={{ color: '#475569', fontSize: '12px' }}>Keine Daten</span>
      )}
      {[...results].reverse().map((r, i) => (
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
      ))}
    </div>
  );
}

function CheckRow({ check }: { check: BackupCheckStatus }) {
  const color = statusColor(check.currentStatus);
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '20px 1fr auto 120px 110px',
      alignItems: 'center',
      gap: '12px',
      padding: '10px 16px',
      borderBottom: '1px solid #1e293b',
    }}>
      <div style={{
        width: '10px', height: '10px', borderRadius: '50%',
        backgroundColor: color, flexShrink: 0,
      }} />
      <span style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: 500 }}>{check.name}</span>
      <HistoryDots results={check.recentResults} />
      <span style={{ color: '#64748b', fontSize: '12px', textAlign: 'right' }}>
        {formatRelative(check.lastReceivedAt)}
      </span>
      <span style={{
        fontSize: '12px', fontWeight: 600, color,
        textAlign: 'right',
      }}>
        {statusLabel(check.currentStatus)}
      </span>
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
  const totalChecks = groups.reduce((s, g) => s + g.checks.length, 0);
  const failedCount = groups.reduce((s, g) =>
    s + g.checks.filter(c => c.currentStatus === 'failed' || c.currentStatus === 'missed').length, 0);
  const successCount = groups.reduce((s, g) =>
    s + g.checks.filter(c => c.currentStatus === 'success').length, 0);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#f1f5f9', margin: 0 }}>Backup-Überwachung</h1>
          <p style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>
            {totalChecks} Check(s) · {successCount} OK · {failedCount} Problem(e)
            {lastUpdate && ` · Aktualisiert: ${lastUpdate.toLocaleTimeString('de-DE')}`}
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

      {syncMsg && (
        <div style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '16px' }}>{syncMsg}</div>
      )}

      {!data?.configured && (
        <div style={{
          padding: '16px', backgroundColor: '#1e293b', borderRadius: '8px',
          borderLeft: '4px solid #f59e0b', color: '#fbbf24', fontSize: '14px', marginBottom: '24px',
        }}>
          Microsoft Graph API ist nicht konfiguriert. Bitte Tenant ID, Client ID und Client Secret unter Admin → Einstellungen eingeben.
        </div>
      )}

      {loading && (
        <p style={{ color: '#64748b', textAlign: 'center', padding: '60px' }}>Lade Backup-Status...</p>
      )}

      {!loading && groups.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '60px', color: '#64748b',
          backgroundColor: '#1e293b', borderRadius: '10px',
        }}>
          <p style={{ fontSize: '16px', marginBottom: '8px' }}>Keine Backup-Checks konfiguriert</p>
          <p style={{ fontSize: '13px' }}>Gehe zu Admin → Backup-Checks um Checks anzulegen.</p>
        </div>
      )}

      {/* Customer Groups */}
      {groups.map(group => {
        const groupFailed = group.checks.filter(c =>
          c.currentStatus === 'failed' || c.currentStatus === 'missed'
        ).length;
        const groupOk = group.checks.filter(c => c.currentStatus === 'success').length;

        return (
          <div key={group.customerId ?? '__none__'} style={{
            backgroundColor: '#0f1929',
            border: '1px solid #1e293b',
            borderRadius: '10px',
            marginBottom: '16px',
            overflow: 'hidden',
          }}>
            {/* Group Header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 16px',
              backgroundColor: '#111827',
              borderBottom: '1px solid #1e293b',
            }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#f1f5f9' }}>
                {group.customerName}
              </span>
              <div style={{ display: 'flex', gap: '12px', fontSize: '12px' }}>
                {groupOk > 0 && (
                  <span style={{ color: '#22c55e' }}>{groupOk} OK</span>
                )}
                {groupFailed > 0 && (
                  <span style={{ color: '#ef4444', fontWeight: 700 }}>{groupFailed} Problem(e)</span>
                )}
                <span style={{ color: '#475569' }}>{group.checks.length} Checks</span>
              </div>
            </div>

            {/* Column Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '20px 1fr auto 120px 110px',
              gap: '12px',
              padding: '6px 16px',
              borderBottom: '1px solid #1e293b',
            }}>
              <div />
              <span style={{ color: '#475569', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Name</span>
              <span style={{ color: '#475569', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Historie</span>
              <span style={{ color: '#475569', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', textAlign: 'right' }}>Letzte E-Mail</span>
              <span style={{ color: '#475569', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', textAlign: 'right' }}>Status</span>
            </div>

            {group.checks.map(check => (
              <CheckRow key={check.id} check={check} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

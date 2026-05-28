import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../api';

interface LogEntry {
  id: number;
  timestamp: string;
  username: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  entityName: string | null;
  details: string | null;
  ipAddress: string | null;
}

interface LogMeta {
  users: Array<{ id: number; username: string }>;
  actions: string[];
  entityTypes: string[];
}

interface LogsResponse {
  logs: LogEntry[];
  total: number;
}

const PAGE_SIZE = 50;

const ACTION_LABELS: Record<string, string> = {
  'user.create': 'Benutzer erstellt',
  'user.update': 'Benutzer bearbeitet',
  'user.delete': 'Benutzer deaktiviert',
  'customer.create': 'Kunde erstellt',
  'customer.update': 'Kunde bearbeitet',
  'customer.delete': 'Kunde gelöscht',
  'product.create': 'Produkt erstellt',
  'product.update': 'Produkt bearbeitet',
  'product.delete': 'Produkt gelöscht',
  'backup_check.create': 'Backup-Check erstellt',
  'backup_check.update': 'Backup-Check bearbeitet',
  'backup_check.delete': 'Backup-Check gelöscht',
  'backup_check_status_manual_set': 'Backup Check Status manuell gesetzt',
  'backup_check_status_manual_cleared': 'Manueller Status zurückgesetzt',
  'backup_check_paused': 'Backup Check pausiert',
  'backup_check_resumed': 'Backup Check fortgesetzt',
  'settings.update': 'Einstellungen geändert',
  'sync.manual': 'Sync manuell',
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function actionColor(action: string): string {
  if (action.includes('delete')) return '#ef4444';
  if (action.includes('create')) return '#4ade80';
  if (action === 'backup_check_paused') return '#6366f1';
  if (action === 'backup_check_resumed') return '#22c55e';
  if (action === 'backup_check_status_manual_set') return '#f59e0b';
  if (action === 'backup_check_status_manual_cleared') return '#94a3b8';
  if (action.includes('update') || action.includes('settings')) return '#fbbf24';
  if (action.includes('sync')) return '#60a5fa';
  return '#94a3b8';
}

function formatTs(ts: string): string {
  return new Date(ts).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'medium' });
}

export default function AuditLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<LogMeta>({ users: [], actions: [], entityTypes: [] });
  const [page, setPage] = useState(1);

  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterEntityType, setFilterEntityType] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (filterDateFrom) params.set('dateFrom', filterDateFrom);
      if (filterDateTo) params.set('dateTo', filterDateTo);
      if (filterUser) params.set('userId', filterUser);
      if (filterAction) params.set('action', filterAction);
      if (filterEntityType) params.set('entityType', filterEntityType);

      const res = await apiFetch(`/api/logs?${params}`);
      if (res.ok) {
        const data = await res.json() as LogsResponse;
        setLogs(data.logs);
        setTotal(data.total);
      } else {
        const text = await res.text().catch(() => '');
        setError(`Fehler ${res.status}: ${text || res.statusText}`);
      }
    } catch (e) {
      setError((e as Error).message || 'Netzwerkfehler');
    } finally {
      setLoading(false);
    }
  }, [page, filterDateFrom, filterDateTo, filterUser, filterAction, filterEntityType]);

  useEffect(() => {
    apiFetch('/api/logs/meta').then(r => r.json()).then(setMeta).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleFilterChange() {
    setPage(1);
  }

  function exportCsv() {
    const header = ['Zeitstempel', 'Benutzer', 'Aktion', 'Entitätstyp', 'Name', 'Details', 'IP'];
    const rows = logs.map(l => [
      formatTs(l.timestamp),
      l.username ?? 'system',
      actionLabel(l.action),
      l.entityType ?? '',
      l.entityName ?? '',
      l.details ?? '',
      l.ipAddress ?? '',
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const inputStyle: React.CSSProperties = {
    padding: '6px 10px', backgroundColor: '#0f172a', border: '1px solid #334155',
    borderRadius: '6px', color: '#f1f5f9', fontSize: '13px', outline: 'none',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ color: '#f1f5f9', fontSize: '20px', fontWeight: 700, margin: 0 }}>Audit-Protokoll</h2>
        <button onClick={exportCsv} style={{
          padding: '7px 14px', borderRadius: '6px', border: '1px solid #334155',
          backgroundColor: 'transparent', color: '#94a3b8', fontSize: '13px', cursor: 'pointer',
        }}>
          ↓ CSV exportieren
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <input type="date" value={filterDateFrom}
          onChange={e => { setFilterDateFrom(e.target.value); handleFilterChange(); }}
          style={inputStyle} title="Von Datum" />
        <input type="date" value={filterDateTo}
          onChange={e => { setFilterDateTo(e.target.value); handleFilterChange(); }}
          style={inputStyle} title="Bis Datum" />
        <select value={filterUser}
          onChange={e => { setFilterUser(e.target.value); handleFilterChange(); }}
          style={inputStyle}>
          <option value="">Alle Benutzer</option>
          {meta.users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
        </select>
        <select value={filterAction}
          onChange={e => { setFilterAction(e.target.value); handleFilterChange(); }}
          style={inputStyle}>
          <option value="">Alle Aktionen</option>
          {meta.actions.map(a => <option key={a} value={a}>{actionLabel(a)}</option>)}
        </select>
        <select value={filterEntityType}
          onChange={e => { setFilterEntityType(e.target.value); handleFilterChange(); }}
          style={inputStyle}>
          <option value="">Alle Entitäten</option>
          {meta.entityTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {(filterDateFrom || filterDateTo || filterUser || filterAction || filterEntityType) && (
          <button onClick={() => {
            setFilterDateFrom(''); setFilterDateTo(''); setFilterUser('');
            setFilterAction(''); setFilterEntityType(''); setPage(1);
          }} style={{ ...inputStyle, cursor: 'pointer', color: '#f87171', borderColor: '#7f1d1d' }}>
            × Zurücksetzen
          </button>
        )}
      </div>

      {error && (
        <div style={{ backgroundColor: '#450a0a', border: '1px solid #7f1d1d', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', color: '#fca5a5', fontSize: '13px' }}>
          {error}
        </div>
      )}

      <div style={{ color: '#64748b', fontSize: '12px', marginBottom: '12px' }}>
        {total} Einträge gesamt
      </div>

      {/* Table */}
      <div style={{ backgroundColor: '#1e293b', borderRadius: '10px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #334155' }}>
              {['Zeitstempel', 'Benutzer', 'Aktion', 'Entität', 'Details', 'IP'].map(h => (
                <th key={h} style={{
                  textAlign: 'left', padding: '8px 12px', color: '#64748b',
                  fontSize: '11px', fontWeight: 600, textTransform: 'uppercase',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Lade...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Keine Einträge</td></tr>
            ) : logs.map(log => (
              <tr key={log.id} style={{ borderBottom: '1px solid #0f172a' }}>
                <td style={{ padding: '8px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>{formatTs(log.timestamp)}</td>
                <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{log.username ?? 'system'}</td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                  <span style={{ color: actionColor(log.action), fontWeight: 600 }}>{actionLabel(log.action)}</span>
                </td>
                <td style={{ padding: '8px 12px', color: '#94a3b8' }}>
                  {log.entityName ?? log.entityId ?? '—'}
                  {log.entityType && <span style={{ color: '#475569', fontSize: '11px', marginLeft: '5px' }}>({log.entityType})</span>}
                </td>
                <td style={{ padding: '8px 12px', color: '#64748b', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {log.details ?? '—'}
                </td>
                <td style={{ padding: '8px 12px', color: '#475569', fontFamily: 'monospace', fontSize: '11px' }}>{log.ipAddress ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '16px' }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #334155', backgroundColor: 'transparent', color: page === 1 ? '#334155' : '#94a3b8', cursor: page === 1 ? 'default' : 'pointer' }}>
            ←
          </button>
          <span style={{ color: '#64748b', fontSize: '13px', padding: '6px 12px' }}>
            Seite {page} / {totalPages}
          </span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #334155', backgroundColor: 'transparent', color: page === totalPages ? '#334155' : '#94a3b8', cursor: page === totalPages ? 'default' : 'pointer' }}>
            →
          </button>
        </div>
      )}
    </div>
  );
}

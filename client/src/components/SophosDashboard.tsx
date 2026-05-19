import React, { useEffect, useState } from 'react';
import { fetchSophosOverview, type SophosCustomerOverview } from '../api';
import StatusBadge from './StatusBadge';

const REFRESH_INTERVAL = 60_000;

export default function SophosDashboard() {
  const [data, setData] = useState<SophosCustomerOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  async function load() {
    try {
      const result = await fetchSophosOverview();
      setData(result);
      setLastUpdate(new Date());
      setError('');

      // Auto-expand customers with outdated firewalls
      const autoExpand: Record<number, boolean> = {};
      result.forEach(c => {
        if (c.firewalls.some(fw => fw.status === 'update-available' || fw.status === 'major-update')) {
          autoExpand[c.customerId] = true;
        }
      });
      setExpanded(prev => ({ ...autoExpand, ...prev }));
    } catch {
      setError('Fehler beim Laden der Sophos-Daten');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  function toggle(customerId: number) {
    setExpanded(prev => ({ ...prev, [customerId]: !prev[customerId] }));
  }

  const totalFirewalls = data.reduce((s, c) => s + c.firewalls.length, 0);
  const outdatedFirewalls = data.reduce(
    (s, c) => s + c.firewalls.filter(fw => fw.status === 'update-available' || fw.status === 'major-update').length,
    0
  );
  const latestVersion = data.find(c => c.latestVersion)?.latestVersion || '';
  const releaseUrl = data.find(c => c.releaseUrl)?.releaseUrl || '';

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 16px' }}>
      <header style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#f1f5f9', margin: 0 }}>
              Sophos Firewall
            </h1>
            <p style={{ color: '#64748b', fontSize: '14px', marginTop: '6px' }}>
              {totalFirewalls} Firewall{totalFirewalls !== 1 ? 's' : ''} überwacht
              {outdatedFirewalls > 0 && (
                <span style={{ color: '#fbbf24', marginLeft: '12px' }}>
                  {outdatedFirewalls} Update{outdatedFirewalls !== 1 ? 's' : ''} verfügbar
                </span>
              )}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            {latestVersion && (
              <div style={{ color: '#94a3b8', fontSize: '13px' }}>
                Aktuelle Version:{' '}
                {releaseUrl ? (
                  <a href={releaseUrl} target="_blank" rel="noreferrer" style={{ color: '#38bdf8', fontFamily: 'monospace' }}>
                    {latestVersion}
                  </a>
                ) : (
                  <span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{latestVersion}</span>
                )}
              </div>
            )}
            {lastUpdate && (
              <div style={{ color: '#475569', fontSize: '12px', marginTop: '4px' }}>
                Aktualisiert: {lastUpdate.toLocaleTimeString('de-DE')}
              </div>
            )}
          </div>
        </div>
      </header>

      {error && (
        <div style={{ padding: '12px 16px', backgroundColor: '#7f1d1d', borderRadius: '8px', color: '#fca5a5', marginBottom: '16px', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {loading && (
        <p style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>Lade Daten...</p>
      )}

      {!loading && data.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px', color: '#475569' }}>
          <p style={{ fontSize: '16px', marginBottom: '8px' }}>Keine Sophos-Tenants konfiguriert</p>
          <p style={{ fontSize: '13px' }}>
            Tenants können unter{' '}
            <a href="#/admin" style={{ color: '#3b82f6' }}>Admin → Sophos</a> verknüpft werden.
          </p>
        </div>
      )}

      {!loading && data.map(customer => {
        const isExpanded = !!expanded[customer.customerId];
        const outdated = customer.firewalls.filter(
          fw => fw.status === 'update-available' || fw.status === 'major-update'
        ).length;

        return (
          <div
            key={customer.customerId}
            style={{
              backgroundColor: '#1e293b',
              borderRadius: '10px',
              marginBottom: '12px',
              overflow: 'hidden',
              border: outdated > 0 ? '1px solid #f59e0b33' : '1px solid transparent',
            }}
          >
            {/* Customer header */}
            <div
              onClick={() => toggle(customer.customerId)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ color: '#94a3b8', fontSize: '13px' }}>{isExpanded ? '▾' : '▸'}</span>
                <span style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: 600 }}>
                  {customer.customerName}
                </span>
                <span style={{
                  fontFamily: 'monospace', fontSize: '11px', color: '#64748b',
                  backgroundColor: '#0f172a', borderRadius: '4px', padding: '2px 7px',
                }}>
                  {customer.tenantId}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {outdated > 0 && (
                  <span style={{
                    fontSize: '12px', fontWeight: 600, color: '#fbbf24',
                    backgroundColor: '#451a0340', borderRadius: '4px', padding: '2px 8px',
                  }}>
                    {outdated} Update{outdated !== 1 ? 's' : ''}
                  </span>
                )}
                <span style={{ color: '#64748b', fontSize: '13px' }}>
                  {customer.firewalls.length} Firewall{customer.firewalls.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Firewalls table */}
            {isExpanded && (
              <div style={{ borderTop: '1px solid #0f172a', padding: '0 20px 16px' }}>
                {customer.firewalls.length === 0 ? (
                  <p style={{ color: '#475569', fontSize: '13px', padding: '12px 0 0' }}>
                    Noch keine Firewalls synchronisiert.
                  </p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '12px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #334155' }}>
                        <th style={{ textAlign: 'left', padding: '6px 8px', color: '#64748b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Name</th>
                        <th style={{ textAlign: 'left', padding: '6px 8px', color: '#64748b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hostname</th>
                        <th style={{ textAlign: 'left', padding: '6px 8px', color: '#64748b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Installiert</th>
                        <th style={{ textAlign: 'left', padding: '6px 8px', color: '#64748b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Aktuell</th>
                        <th style={{ textAlign: 'left', padding: '6px 8px', color: '#64748b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customer.firewalls.map(fw => (
                        <tr key={fw.id} style={{ borderBottom: '1px solid #0f172a' }}>
                          <td style={{ padding: '10px 8px', color: '#e2e8f0', fontSize: '14px', fontWeight: 500 }}>
                            {fw.name}
                          </td>
                          <td style={{ padding: '10px 8px', color: '#94a3b8', fontSize: '13px', fontFamily: 'monospace' }}>
                            {fw.hostname || '—'}
                          </td>
                          <td style={{ padding: '10px 8px', color: '#94a3b8', fontSize: '13px', fontFamily: 'monospace' }}>
                            {fw.currentVersion}
                          </td>
                          <td style={{ padding: '10px 8px', color: '#94a3b8', fontSize: '13px', fontFamily: 'monospace' }}>
                            {fw.latestVersion || '—'}
                          </td>
                          <td style={{ padding: '10px 8px' }}>
                            <StatusBadge status={fw.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

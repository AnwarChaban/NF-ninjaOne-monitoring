import React, { useEffect, useState } from 'react';
import { fetchSophosOverview, type SophosCustomerOverview, type SophosAlert } from '../api';

const REFRESH_INTERVAL = 60_000;

function decodeHtml(text: string): string {
  const txt = document.createElement('textarea');
  txt.innerHTML = text;
  return txt.value;
}

const SEVERITY_STYLES: Record<string, { color: string; bg: string; border: string; label: string; order: number }> = {
  high:   { color: '#f87171', bg: '#7f1d1d30', border: '#f8717140', label: 'Hoch',    order: 0 },
  medium: { color: '#fbbf24', bg: '#78350f30', border: '#fbbf2440', label: 'Mittel',  order: 1 },
  low:    { color: '#94a3b8', bg: '#1e293b',   border: '#33415560', label: 'Niedrig', order: 2 },
};

function severityOrder(s: string) {
  return SEVERITY_STYLES[s]?.order ?? 3;
}

function AlertRow({ alert }: { alert: SophosAlert }) {
  const sev = SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.low;
  const date = alert.raisedAt
    ? new Date(alert.raisedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
    : '—';

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '12px',
      backgroundColor: sev.bg, border: `1px solid ${sev.border}`,
      borderRadius: '8px', padding: '12px 14px',
    }}>
      <span style={{
        flexShrink: 0, fontSize: '11px', fontWeight: 700,
        color: sev.color, borderRadius: '4px',
        padding: '2px 8px', marginTop: '1px',
        minWidth: '52px', textAlign: 'center',
        border: `1px solid ${sev.color}40`,
      }}>
        {sev.label}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#e2e8f0', fontSize: '13px', lineHeight: 1.5 }}>
          {decodeHtml(alert.description)}
        </div>
        <div style={{ display: 'flex', gap: '14px', marginTop: '5px', flexWrap: 'wrap' }}>
          {alert.category && (
            <span style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {alert.category}
            </span>
          )}
          {alert.product && (
            <span style={{ color: '#64748b', fontSize: '11px' }}>{alert.product}</span>
          )}
          <span style={{ color: '#475569', fontSize: '11px' }}>{date}</span>
        </div>
      </div>
    </div>
  );
}

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

      // Auto-expand customers with high or medium alerts
      const autoExpand: Record<number, boolean> = {};
      result.forEach(c => {
        const alerts = c.alerts ?? [];
        if (alerts.some(a => a.severity === 'high' || a.severity === 'medium')) {
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

  // Only show customers that have alerts, sorted by highest severity first
  const customersWithAlerts = data
    .filter(c => (c.alerts ?? []).length > 0)
    .sort((a, b) => {
      const aMin = Math.min(...(a.alerts ?? []).map(x => severityOrder(x.severity)));
      const bMin = Math.min(...(b.alerts ?? []).map(x => severityOrder(x.severity)));
      if (aMin !== bMin) return aMin - bMin;
      return (b.alerts ?? []).length - (a.alerts ?? []).length;
    });

  const totalAlerts = customersWithAlerts.reduce((s, c) => s + (c.alerts ?? []).length, 0);
  const highCount  = customersWithAlerts.reduce((s, c) => s + (c.alerts ?? []).filter(a => a.severity === 'high').length, 0);
  const medCount   = customersWithAlerts.reduce((s, c) => s + (c.alerts ?? []).filter(a => a.severity === 'medium').length, 0);

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '32px 16px' }}>
      <header style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#f1f5f9', margin: 0 }}>
              Sophos Alerts
            </h1>
            <p style={{ color: '#64748b', fontSize: '14px', marginTop: '6px', margin: '6px 0 0' }}>
              {customersWithAlerts.length} Kunde{customersWithAlerts.length !== 1 ? 'n' : ''} mit Alerts
              {highCount > 0 && (
                <span style={{ color: '#f87171', marginLeft: '14px', fontWeight: 600 }}>
                  {highCount} Hoch
                </span>
              )}
              {medCount > 0 && (
                <span style={{ color: '#fbbf24', marginLeft: '10px', fontWeight: 600 }}>
                  {medCount} Mittel
                </span>
              )}
            </p>
          </div>
          {lastUpdate && (
            <div style={{ color: '#475569', fontSize: '12px', paddingTop: '6px' }}>
              Aktualisiert: {lastUpdate.toLocaleTimeString('de-DE')}
            </div>
          )}
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

      {!loading && totalAlerts === 0 && (
        <div style={{ textAlign: 'center', padding: '60px', color: '#475569' }}>
          <p style={{ fontSize: '16px', marginBottom: '8px' }}>Keine aktiven Alerts</p>
          <p style={{ fontSize: '13px' }}>
            Alerts werden beim nächsten Sophos-Sync aktualisiert.
          </p>
        </div>
      )}

      {!loading && customersWithAlerts.map(customer => {
        const isExpanded = !!expanded[customer.customerId];
        const alerts = [...(customer.alerts ?? [])].sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity));
        const highAlerts = alerts.filter(a => a.severity === 'high').length;
        const borderColor = highAlerts > 0 ? '#f8717140' : '#fbbf2430';

        return (
          <div
            key={customer.customerId}
            style={{
              backgroundColor: '#1e293b',
              borderRadius: '10px',
              marginBottom: '10px',
              overflow: 'hidden',
              border: `1px solid ${borderColor}`,
            }}
          >
            {/* Customer header */}
            <div
              onClick={() => toggle(customer.customerId)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ color: '#94a3b8', fontSize: '13px' }}>{isExpanded ? '▾' : '▸'}</span>
                <span style={{ color: '#f1f5f9', fontSize: '15px', fontWeight: 600 }}>
                  {customer.customerName}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {highAlerts > 0 && (
                  <span style={{
                    fontSize: '12px', fontWeight: 700, color: '#f87171',
                    backgroundColor: '#7f1d1d30', border: '1px solid #f8717140',
                    borderRadius: '4px', padding: '2px 8px',
                  }}>
                    {highAlerts} Hoch
                  </span>
                )}
                {alerts.filter(a => a.severity === 'medium').length > 0 && (
                  <span style={{
                    fontSize: '12px', fontWeight: 700, color: '#fbbf24',
                    backgroundColor: '#78350f30', border: '1px solid #fbbf2440',
                    borderRadius: '4px', padding: '2px 8px',
                  }}>
                    {alerts.filter(a => a.severity === 'medium').length} Mittel
                  </span>
                )}
                <span style={{ color: '#64748b', fontSize: '12px' }}>
                  {alerts.length} Alert{alerts.length !== 1 ? 's' : ''} gesamt
                </span>
              </div>
            </div>

            {/* Alerts list */}
            {isExpanded && (
              <div style={{ borderTop: '1px solid #0f172a', padding: '12px 20px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {alerts.map(a => (
                  <AlertRow key={a.alertId} alert={a} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

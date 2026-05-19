import React, { useEffect, useState } from 'react';
import { fetchCustomerDetail, type CustomerDetail, type CustomerDeviceDetail, type BackupCheckStatus, type CustomerProductDetail } from '../api';
import StatusBadge from './StatusBadge';

const PAGE_SIZE = 30;

function formatVersion(version: string): string {
  return version.replace(/\+[^\s]+$/, '').trim();
}

function sourceLabel(source: CustomerDeviceDetail['source']): string {
  if (source === 'ninjaone') return 'NinjaOne';
  if (source === 'unifi') return 'UniFi';
  return 'Sophos';
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '7px 10px',
  color: '#64748b',
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
};

const navBtn = (disabled: boolean): React.CSSProperties => ({
  padding: '3px 9px',
  borderRadius: '6px',
  border: '1px solid #334155',
  backgroundColor: disabled ? '#0f172a' : '#1e293b',
  color: disabled ? '#334155' : '#94a3b8',
  fontSize: '12px',
  cursor: disabled ? 'default' : 'pointer',
});

function ProductTableSection({ product }: { product: CustomerProductDetail }) {
  const outdated = product.devices.filter(
    d => d.status === 'update-available' || d.status === 'major-update'
  ).length;
  const hasMajor = product.devices.some(d => d.status === 'major-update');

  const [isExpanded, setIsExpanded] = useState(outdated > 0);
  const [page, setPage] = useState(0);

  const totalPages = Math.ceil(product.devices.length / PAGE_SIZE);
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const pageDevices = product.devices.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const pageButtons = Array.from({ length: totalPages }, (_, i) => i).filter(
    i => Math.abs(i - safePage) <= 2
  );

  const borderColor = outdated > 0 ? (hasMajor ? '#7f1d1d' : '#f59e0b33') : 'transparent';

  return (
    <div style={{
      backgroundColor: '#1e293b',
      borderRadius: '10px',
      overflow: 'hidden',
      border: `1px solid ${borderColor}`,
      marginBottom: '10px',
    }}>
      {/* Product header */}
      <div
        onClick={() => setIsExpanded(e => !e)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: '#94a3b8', fontSize: '18px', lineHeight: 1 }}>{isExpanded ? '▾' : '▸'}</span>
          <span style={{ color: '#f1f5f9', fontSize: '15px', fontWeight: 700 }}>{product.productName}</span>
          {product.latestVersion && (
            <span style={{
              fontFamily: 'monospace',
              fontSize: '12px',
              color: '#64748b',
              backgroundColor: '#0f172a',
              borderRadius: '4px',
              padding: '2px 7px',
            }}>
              {product.releaseUrl ? (
                <a
                  href={product.releaseUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={e => e.stopPropagation()}
                  style={{ color: '#38bdf8', textDecoration: 'none' }}
                >
                  {formatVersion(product.latestVersion)}
                </a>
              ) : formatVersion(product.latestVersion)}
            </span>
          )}
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
            {product.devices.length} Gerät{product.devices.length !== 1 ? 'e' : ''}
          </span>
        </div>
      </div>

      {/* Table */}
      {isExpanded && (
        <div style={{ borderTop: '1px solid #0f172a' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #334155' }}>
                <th style={{ ...thStyle, paddingLeft: '18px' }}>Gerät</th>
                <th style={thStyle}>Quelle</th>
                <th style={thStyle}>Installiert</th>
                <th style={thStyle}>Aktuell</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {pageDevices.map(device => (
                <tr key={device.id} style={{ borderBottom: '1px solid #0f172a' }}>
                  <td style={{ padding: '9px 10px 9px 18px', color: '#e2e8f0', fontSize: '13px', fontWeight: 500 }}>
                    {device.name}
                  </td>
                  <td style={{ padding: '9px 10px', fontSize: '12px', color: '#475569' }}>
                    {sourceLabel(device.source)}
                  </td>
                  <td style={{ padding: '9px 10px', color: '#94a3b8', fontSize: '13px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                    {formatVersion(device.currentVersion)}
                  </td>
                  <td style={{ padding: '9px 10px', color: '#94a3b8', fontSize: '13px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                    {device.latestVersion ? formatVersion(device.latestVersion) : '—'}
                  </td>
                  <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
                    <StatusBadge status={device.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 18px',
              borderTop: '1px solid #0f172a',
              gap: '12px',
            }}>
              <span style={{ color: '#475569', fontSize: '12px', whiteSpace: 'nowrap' }}>
                {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, product.devices.length)} von {product.devices.length}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button type="button" onClick={() => setPage(0)} disabled={safePage === 0} style={navBtn(safePage === 0)}>«</button>
                <button type="button" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={safePage === 0} style={navBtn(safePage === 0)}>‹</button>

                {pageButtons[0] > 0 && <span style={{ color: '#475569', fontSize: '12px', padding: '0 4px' }}>…</span>}

                {pageButtons.map(i => (
                  <button key={i} type="button" onClick={() => setPage(i)} style={{
                    padding: '3px 9px', borderRadius: '6px', border: '1px solid #334155',
                    backgroundColor: i === safePage ? '#3b82f6' : '#0f172a',
                    color: i === safePage ? '#fff' : '#64748b',
                    fontSize: '12px', cursor: i === safePage ? 'default' : 'pointer',
                    fontWeight: i === safePage ? 600 : 400, minWidth: '30px',
                  }}>
                    {i + 1}
                  </button>
                ))}

                {pageButtons[pageButtons.length - 1] < totalPages - 1 && <span style={{ color: '#475569', fontSize: '12px', padding: '0 4px' }}>…</span>}

                <button type="button" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={safePage === totalPages - 1} style={navBtn(safePage === totalPages - 1)}>›</button>
                <button type="button" onClick={() => setPage(totalPages - 1)} disabled={safePage === totalPages - 1} style={navBtn(safePage === totalPages - 1)}>»</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BackupStatusDot({ status }: { status: 'success' | 'failed' | 'missed' }) {
  const color = status === 'success' ? '#22c55e' : '#ef4444';
  return (
    <div
      title={status === 'success' ? 'OK' : status === 'failed' ? 'Fehler' : 'Ausgeblieben'}
      style={{
        width: '10px', height: '10px', borderRadius: '50%',
        backgroundColor: color,
        opacity: status === 'missed' ? 0.5 : 1,
        flexShrink: 0,
      }}
    />
  );
}

function BackupCheckCard({ check }: { check: BackupCheckStatus }) {
  const statusColor =
    check.currentStatus === 'success' ? '#22c55e' :
    check.currentStatus === 'failed' || check.currentStatus === 'missed' ? '#ef4444' :
    '#64748b';

  const statusLabel =
    check.currentStatus === 'success' ? 'OK' :
    check.currentStatus === 'failed' ? 'Fehler' :
    check.currentStatus === 'missed' ? 'Ausgeblieben' :
    'Unbekannt';

  function formatRelative(iso: string | null): string {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3_600_000);
    if (h < 1) return `vor ${Math.floor(diff / 60_000)} Min.`;
    if (h < 24) return `vor ${h} Std.`;
    return `vor ${Math.floor(h / 24)} Tag(en)`;
  }

  return (
    <div style={{
      backgroundColor: '#0f172a',
      border: '1px solid #1e293b',
      borderRadius: '8px',
      padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#cbd5e1' }}>{check.name}</span>
        <span style={{
          fontSize: '12px', fontWeight: 600, color: statusColor,
          padding: '2px 8px', borderRadius: '9999px',
          backgroundColor: statusColor + '22',
          border: `1px solid ${statusColor}44`,
        }}>
          {statusLabel}
        </span>
      </div>
      <div style={{ fontSize: '12px', color: '#475569', marginBottom: '6px' }}>
        Letzter Eingang: {formatRelative(check.lastReceivedAt)}
        {' · '}
        Intervall: {check.intervalHours}h
      </div>
      <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
        {check.recentResults.length === 0 ? (
          <span style={{ color: '#475569', fontSize: '12px' }}>Keine Daten</span>
        ) : (
          [...check.recentResults].reverse().map((r, i) => (
            <BackupStatusDot key={i} status={r.status} />
          ))
        )}
      </div>
    </div>
  );
}

export default function CustomerDetailPage({ customerId }: { customerId: number }) {
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    fetchCustomerDetail(customerId)
      .then(data => { setDetail(data); setLoading(false); })
      .catch(() => { setError('Fehler beim Laden des Kunden'); setLoading(false); });
  }, [customerId]);

  if (loading) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 16px' }}>
        <p style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>Lade Daten...</p>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 16px' }}>
        <a href="#/customers" style={{ color: '#60a5fa', fontSize: '13px', textDecoration: 'none' }}>
          ← Alle Kunden
        </a>
        <p style={{ color: '#f87171', marginTop: '16px' }}>{error || 'Kunde nicht gefunden'}</p>
      </div>
    );
  }

  const totalDevices = detail.products.reduce((s, p) => s + p.devices.length, 0);
  const outdatedDevices = detail.products.reduce((s, p) =>
    s + p.devices.filter(d => d.status === 'update-available' || d.status === 'major-update').length, 0);

  const sortedProducts = [...detail.products].sort((a, b) => {
    const aOutdated = a.devices.filter(d => d.status === 'update-available' || d.status === 'major-update').length;
    const bOutdated = b.devices.filter(d => d.status === 'update-available' || d.status === 'major-update').length;
    if (bOutdated !== aOutdated) return bOutdated - aOutdated;
    return a.productName.localeCompare(b.productName, 'de');
  });

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 16px' }}>
      <a href="#/customers" style={{ color: '#60a5fa', fontSize: '13px', textDecoration: 'none' }}>
        ← Alle Kunden
      </a>

      <header style={{ margin: '16px 0 28px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#f1f5f9', margin: 0 }}>
          {detail.name}
        </h1>
        <p style={{ color: '#64748b', fontSize: '14px', marginTop: '6px' }}>
          {totalDevices} Gerät{totalDevices === 1 ? '' : 'e'}
          {outdatedDevices > 0 && (
            <span style={{ color: '#fbbf24', marginLeft: '12px' }}>
              {outdatedDevices} Update{outdatedDevices === 1 ? '' : 's'} verfügbar
            </span>
          )}
          {detail.backup.length > 0 && (
            <span style={{ color: '#94a3b8', marginLeft: '12px' }}>
              · {detail.backup.length} Backup-Check{detail.backup.length === 1 ? '' : 's'}
            </span>
          )}
        </p>
      </header>

      {/* Products / Devices section */}
      {sortedProducts.length === 0 ? (
        <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '32px' }}>
          Keine Geräte zugeordnet
        </p>
      ) : (
        <div style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '14px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Geräte & Versionen
          </h2>
          {sortedProducts.map(product => (
            <ProductTableSection key={product.productId} product={product} />
          ))}
        </div>
      )}

      {/* Backup section */}
      {detail.backup.length > 0 && (
        <div>
          <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '14px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Backup-Checks
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
            {detail.backup.map(check => (
              <BackupCheckCard key={check.id} check={check} />
            ))}
          </div>
        </div>
      )}

      {detail.backup.length === 0 && sortedProducts.length > 0 && (
        <div style={{ color: '#475569', fontSize: '13px' }}>
          Keine Backup-Checks konfiguriert
        </div>
      )}
    </div>
  );
}

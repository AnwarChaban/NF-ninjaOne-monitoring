import { useEffect, useState } from 'react';
import { fetchCustomerDetail, type CustomerDetail, type CustomerDeviceDetail, type BackupCheckStatus } from '../api';
import StatusBadge from './StatusBadge';

function formatVersion(version: string): string {
  return version.replace(/\+[^\s]+$/, '').trim();
}

function sourceLabel(source: CustomerDeviceDetail['source']): string {
  if (source === 'ninjaone') return 'NinjaOne';
  if (source === 'unifi') return 'UniFi';
  return 'Sophos';
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
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#94a3b8', marginBottom: '14px', letterSpacing: '0.05em' }}>
            GERÄTE & VERSIONEN
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
            {sortedProducts.map(product => {
              const outdated = product.devices.filter(
                d => d.status === 'update-available' || d.status === 'major-update'
              ).length;
              const borderColor = outdated > 0
                ? (product.devices.some(d => d.status === 'major-update') ? '#7f1d1d' : '#78350f')
                : '#1e293b';

              return (
                <div key={product.productId} style={{
                  backgroundColor: '#1e293b',
                  borderRadius: '10px',
                  padding: '14px',
                  borderLeft: `4px solid ${borderColor}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#f1f5f9' }}>{product.productName}</div>
                      {product.latestVersion && (
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                          Aktuell:{' '}
                          {product.releaseUrl ? (
                            <a
                              href={product.releaseUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: '#60a5fa', textDecoration: 'none' }}
                            >
                              {formatVersion(product.latestVersion)}
                            </a>
                          ) : (
                            formatVersion(product.latestVersion)
                          )}
                        </div>
                      )}
                    </div>
                    {outdated > 0 && (
                      <span style={{
                        fontSize: '12px', fontWeight: 600, color: '#fbbf24',
                        backgroundColor: '#78350f', padding: '2px 8px', borderRadius: '9999px',
                      }}>
                        {outdated} veraltet
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {product.devices.map(device => (
                      <div key={device.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        backgroundColor: '#0f172a',
                        borderRadius: '6px',
                        fontSize: '13px',
                      }}>
                        <div>
                          <span style={{ color: '#cbd5e1' }}>{device.name}</span>
                          <span style={{ color: '#334155', fontSize: '11px', marginLeft: '6px' }}>
                            {sourceLabel(device.source)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {device.status !== 'up-to-date' && device.status !== 'unknown' && (
                            <code style={{ color: '#94a3b8', fontSize: '12px' }}>
                              {formatVersion(device.currentVersion)}
                              {device.latestVersion && device.latestVersion !== device.currentVersion
                                ? ` → ${formatVersion(device.latestVersion)}`
                                : ''}
                            </code>
                          )}
                          {device.status === 'up-to-date' && (
                            <code style={{ color: '#475569', fontSize: '12px' }}>
                              {formatVersion(device.currentVersion)}
                            </code>
                          )}
                          <StatusBadge status={device.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Backup section */}
      {detail.backup.length > 0 && (
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#94a3b8', marginBottom: '14px', letterSpacing: '0.05em' }}>
            BACKUP-CHECKS
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

import React, { useState } from 'react';
import type { ProductStatus, DeviceStatus } from '../api';
import StatusBadge from './StatusBadge';

const PAGE_SIZE = 30;

type HeaderRow = {
  kind: 'header';
  customerId: number;
  customerName: string;
  outdated: number;
  total: number;
};

type DeviceRow = {
  kind: 'device';
  customerId: number;
  customerName: string;
  device: DeviceStatus;
};

type DisplayRow = HeaderRow | DeviceRow;

function formatVersion(version: string): string {
  return version.replace(/\+[^\s]+$/, '').trim();
}

function formatDeviceName(name: string): string {
  return name.replace(/\s*\((UniFi OS|Network App)\)\s*$/i, '').trim();
}

function getOutdatedCount(product: ProductStatus): number {
  return product.customers.reduce(
    (sum, c) => sum + c.devices.filter(d => d.status === 'update-available' || d.status === 'major-update').length,
    0
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  color: '#64748b',
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
};

const navBtn = (disabled: boolean): React.CSSProperties => ({
  padding: '4px 10px',
  borderRadius: '6px',
  border: '1px solid #334155',
  backgroundColor: disabled ? '#0f172a' : '#1e293b',
  color: disabled ? '#334155' : '#94a3b8',
  fontSize: '12px',
  cursor: disabled ? 'default' : 'pointer',
});

export default function ProductCard({
  product,
  showUpToDateDevices,
}: {
  product: ProductStatus;
  showUpToDateDevices: boolean;
}) {
  const outdated = getOutdatedCount(product);
  const [isExpanded, setIsExpanded] = useState(outdated > 0);
  const [page, setPage] = useState(0);

  const [expandedCustomers, setExpandedCustomers] = useState<Record<number, boolean>>(() => {
    const init: Record<number, boolean> = {};
    product.customers.forEach(c => {
      if (c.devices.some(d => d.status === 'update-available' || d.status === 'major-update')) {
        init[c.id] = true;
      }
    });
    return init;
  });

  function toggleCustomer(id: number) {
    setExpandedCustomers(prev => ({ ...prev, [id]: !prev[id] }));
    setPage(0);
  }

  function goTo(p: number) {
    setPage(p);
  }

  const sortedCustomers = product.customers
    .map(c => ({
      ...c,
      filtered: c.devices.filter(d =>
        showUpToDateDevices
          ? d.status !== 'unknown'
          : d.status === 'update-available' || d.status === 'major-update'
      ),
      outdatedCount: c.devices.filter(d => d.status === 'update-available' || d.status === 'major-update').length,
    }))
    .filter(c => c.filtered.length > 0)
    .sort((a, b) => {
      if (b.outdatedCount !== a.outdatedCount) return b.outdatedCount - a.outdatedCount;
      return a.name.localeCompare(b.name, 'de');
    });

  // Build display rows (header + device rows) based on current expand state
  const allRows: DisplayRow[] = [];
  for (const customer of sortedCustomers) {
    allRows.push({
      kind: 'header',
      customerId: customer.id,
      customerName: customer.name,
      outdated: customer.outdatedCount,
      total: customer.devices.length,
    });
    if (expandedCustomers[customer.id]) {
      customer.filtered.forEach(device => {
        allRows.push({ kind: 'device', customerId: customer.id, customerName: customer.name, device });
      });
    }
  }

  const totalDevices = product.customers.reduce((sum, c) => sum + c.devices.length, 0);
  const totalPages = Math.ceil(allRows.length / PAGE_SIZE);
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const pageRows = allRows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const pageButtons = Array.from({ length: totalPages }, (_, i) => i).filter(
    i => Math.abs(i - safePage) <= 2
  );

  return (
    <div style={{
      backgroundColor: '#1e293b',
      borderRadius: '10px',
      overflow: 'hidden',
      border: outdated > 0 ? '1px solid #f59e0b33' : '1px solid transparent',
    }}>
      {/* Product header */}
      <div
        onClick={() => setIsExpanded(e => !e)}
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
          <span style={{ color: '#94a3b8', fontSize: '18px', lineHeight: 1 }}>{isExpanded ? '▾' : '▸'}</span>
          <span style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: 600 }}>{product.productName}</span>
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
              fontSize: '12px',
              fontWeight: 600,
              color: '#fbbf24',
              backgroundColor: '#451a0340',
              borderRadius: '4px',
              padding: '2px 8px',
            }}>
              {outdated} Update{outdated !== 1 ? 's' : ''}
            </span>
          )}
          <span style={{ color: '#64748b', fontSize: '13px' }}>
            {totalDevices} Gerät{totalDevices !== 1 ? 'e' : ''}
          </span>
        </div>
      </div>

      {/* Body */}
      {isExpanded && (
        <div style={{ borderTop: '1px solid #0f172a' }}>
          {allRows.length === 0 ? (
            <p style={{ color: '#475569', fontSize: '13px', padding: '16px 20px', margin: 0 }}>
              Keine Updates erforderlich.
            </p>
          ) : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #334155' }}>
                    <th style={{ ...thStyle, paddingLeft: '20px' }}>Kunde</th>
                    <th style={thStyle}>Gerät</th>
                    <th style={thStyle}>Installiert</th>
                    <th style={thStyle}>Aktuell</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, idx) => {
                    if (row.kind === 'header') {
                      const isCustomerExpanded = !!expandedCustomers[row.customerId];
                      return (
                        <tr
                          key={`header-${row.customerId}-${idx}`}
                          onClick={() => toggleCustomer(row.customerId)}
                          style={{
                            backgroundColor: '#0f172a',
                            cursor: 'pointer',
                            borderBottom: '1px solid #1e293b',
                          }}
                        >
                          <td colSpan={5} style={{ padding: '9px 20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ color: '#64748b', fontSize: '17px', lineHeight: 1, width: '16px', flexShrink: 0 }}>
                                {isCustomerExpanded ? '▾' : '▸'}
                              </span>
                              <a
                                href={`#/customers/${row.customerId}`}
                                onClick={e => e.stopPropagation()}
                                style={{ color: '#cbd5e1', fontWeight: 600, fontSize: '13px', textDecoration: 'none' }}
                                onMouseEnter={e => (e.currentTarget.style.color = '#60a5fa')}
                                onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}
                              >
                                {row.customerName}
                              </a>
                              {row.outdated > 0 && (
                                <span style={{
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  color: '#fbbf24',
                                  backgroundColor: '#451a0320',
                                  borderRadius: '4px',
                                  padding: '1px 6px',
                                }}>
                                  {row.outdated} Update{row.outdated !== 1 ? 's' : ''}
                                </span>
                              )}
                              <span style={{ color: '#475569', fontSize: '11px', marginLeft: 'auto' }}>
                                {row.total} Gerät{row.total !== 1 ? 'e' : ''}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    // Device row
                    const { device, customerId } = row;
                    return (
                      <tr key={`device-${customerId}:${device.id}-${idx}`} style={{ borderBottom: '1px solid #0f172a' }}>
                        <td style={{ padding: '8px 10px 8px 38px', color: '#334155', fontSize: '12px', width: '1%', whiteSpace: 'nowrap' }}>
                          —
                        </td>
                        <td style={{ padding: '8px 10px', color: '#e2e8f0', fontSize: '13px', fontWeight: 500 }}>
                          {formatDeviceName(device.name)}
                          {device.groupLabel && (
                            <span style={{ color: '#64748b', fontSize: '11px', marginLeft: '6px' }}>
                              ({device.groupLabel})
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', color: '#94a3b8', fontSize: '13px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                          {formatVersion(device.currentVersion)}
                        </td>
                        <td style={{ padding: '8px 10px', color: '#94a3b8', fontSize: '13px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                          {device.latestVersion ? formatVersion(device.latestVersion) : '—'}
                        </td>
                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                          <StatusBadge status={device.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination bar */}
              {totalPages > 1 && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 20px',
                  borderTop: '1px solid #0f172a',
                  gap: '12px',
                }}>
                  <span style={{ color: '#475569', fontSize: '12px', whiteSpace: 'nowrap' }}>
                    Zeilen {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, allRows.length)} von {allRows.length}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button type="button" onClick={() => goTo(0)} disabled={safePage === 0} style={navBtn(safePage === 0)}>«</button>
                    <button type="button" onClick={() => goTo(safePage - 1)} disabled={safePage === 0} style={navBtn(safePage === 0)}>‹</button>

                    {pageButtons[0] > 0 && (
                      <span style={{ color: '#475569', padding: '0 4px', fontSize: '12px' }}>…</span>
                    )}

                    {pageButtons.map(i => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => goTo(i)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          border: '1px solid #334155',
                          backgroundColor: i === safePage ? '#3b82f6' : '#0f172a',
                          color: i === safePage ? '#fff' : '#64748b',
                          fontSize: '12px',
                          cursor: i === safePage ? 'default' : 'pointer',
                          fontWeight: i === safePage ? 600 : 400,
                          minWidth: '32px',
                        }}
                      >
                        {i + 1}
                      </button>
                    ))}

                    {pageButtons[pageButtons.length - 1] < totalPages - 1 && (
                      <span style={{ color: '#475569', padding: '0 4px', fontSize: '12px' }}>…</span>
                    )}

                    <button type="button" onClick={() => goTo(safePage + 1)} disabled={safePage === totalPages - 1} style={navBtn(safePage === totalPages - 1)}>›</button>
                    <button type="button" onClick={() => goTo(totalPages - 1)} disabled={safePage === totalPages - 1} style={navBtn(safePage === totalPages - 1)}>»</button>
                  </div>
                </div>
              )}
            </>
          )}

          {product.error && (
            <p style={{ fontSize: '12px', color: '#f87171', margin: 0, padding: '8px 20px 14px' }}>
              {product.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

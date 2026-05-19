import React, { useEffect, useState } from 'react';
import {
  fetchCustomers,
  fetchSophosTenants,
  fetchSophosUnmatchedTenants,
  deleteSophosAccount,
  assignSophosTenant,
  triggerSophosSync,
  type MockCustomer,
  type SophosTenantEntry,
  type SophosUnmatchedTenant,
} from '../../api';

const inputStyle: React.CSSProperties = {
  padding: '8px 12px', backgroundColor: '#1e293b', border: '1px solid #334155',
  borderRadius: '6px', color: '#f1f5f9', fontSize: '14px', outline: 'none',
};
const btnStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer',
  fontSize: '13px', fontWeight: 600,
};
const primaryBtn: React.CSSProperties = { ...btnStyle, backgroundColor: '#3b82f6', color: '#fff' };
const dangerBtn: React.CSSProperties = { ...btnStyle, backgroundColor: '#7f1d1d', color: '#fca5a5' };
const ghostBtn: React.CSSProperties = { ...btnStyle, backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #334155' };

export default function SophosPage() {
  const [tenants, setTenants] = useState<SophosTenantEntry[]>([]);
  const [customers, setCustomers] = useState<MockCustomer[]>([]);
  const [unmatched, setUnmatched] = useState<SophosUnmatchedTenant[]>([]);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState(false);

  // Manual assignment form
  const [assignForm, setAssignForm] = useState<{ tenantId: string; customerId: string }>({ tenantId: '', customerId: '' });
  const [assignError, setAssignError] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);

  async function load() {
    const [t, c, u] = await Promise.all([
      fetchSophosTenants().catch(() => [] as SophosTenantEntry[]),
      fetchCustomers().catch(() => [] as MockCustomer[]),
      fetchSophosUnmatchedTenants().catch(() => [] as SophosUnmatchedTenant[]),
    ]);
    setTenants(t);
    setCustomers(c);
    setUnmatched(u);
  }

  useEffect(() => { load(); }, []);

  const linkedCustomerIds = new Set(tenants.map(t => t.customerId));
  const unlinkedCustomers = customers.filter(c => !linkedCustomerIds.has(c.id));

  function toggle(customerId: number) {
    setExpanded(prev => ({ ...prev, [customerId]: !prev[customerId] }));
  }

  async function handleSync() {
    setIsSyncing(true);
    setSyncMessage(null);
    setSyncError(false);
    try {
      const result = await triggerSophosSync();
      const parts = [`${result.tenants} Tenant(s) synchronisiert`, `${result.devices} Gerät(e)`];
      if (result.unmatched > 0) parts.push(`${result.unmatched} nicht zugeordnet`);
      setSyncMessage(parts.join(' · '));
      await load();
    } catch (error) {
      setSyncMessage((error as Error).message || 'Sophos-Sync fehlgeschlagen');
      setSyncError(true);
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleAssign() {
    if (!assignForm.tenantId || !assignForm.customerId) {
      setAssignError('Bitte Tenant und Kunden auswählen');
      return;
    }
    setAssignError(null);
    setIsAssigning(true);
    const tenant = unmatched.find(u => u.tenantId === assignForm.tenantId);
    if (!tenant) {
      setAssignError('Tenant nicht gefunden');
      setIsAssigning(false);
      return;
    }
    try {
      await assignSophosTenant({
        customerId: Number(assignForm.customerId),
        tenantId: tenant.tenantId,
        tenantName: tenant.tenantName,
      });
      setAssignForm({ tenantId: '', customerId: '' });
      await load();
    } catch (error) {
      setAssignError((error as Error).message || 'Zuweisung fehlgeschlagen');
    } finally {
      setIsAssigning(false);
    }
  }

  async function handleDelete(customerId: number) {
    if (!confirm('Sophos-Verknüpfung und alle synchronisierten Firewalls löschen?')) return;
    await deleteSophosAccount(customerId);
    await load();
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: 700, margin: 0 }}>Sophos</h2>
        <button style={primaryBtn} onClick={handleSync} disabled={isSyncing}>
          {isSyncing ? 'Sync läuft...' : 'Jetzt synchronisieren'}
        </button>
      </div>

      {syncMessage && (
        <div style={{ color: syncError ? '#fca5a5' : '#94a3b8', fontSize: '13px', marginBottom: '20px' }}>
          {syncMessage}
        </div>
      )}

      {/* Unmatched tenants — shown when sync found tenants with no customer match */}
      {unmatched.length > 0 && (
        <div style={{ backgroundColor: '#1e293b', borderRadius: '10px', padding: '16px 20px', marginBottom: '20px', border: '1px solid #f59e0b44' }}>
          <h3 style={{ color: '#fbbf24', fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
            Nicht zugeordnete Tenants ({unmatched.length})
          </h3>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '14px' }}>
            Diese Tenants wurden aus der Sophos API geladen, konnten aber keinem Kunden automatisch zugeordnet werden. Bitte manuell zuweisen.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Sophos Tenant</label>
              <select
                style={{ ...inputStyle, width: '100%' }}
                value={assignForm.tenantId}
                onChange={e => setAssignForm(prev => ({ ...prev, tenantId: e.target.value }))}
              >
                <option value="">Tenant auswählen...</option>
                {unmatched.map(u => (
                  <option key={u.tenantId} value={u.tenantId}>{u.tenantName}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Kunde</label>
              <select
                style={{ ...inputStyle, width: '100%' }}
                value={assignForm.customerId}
                onChange={e => setAssignForm(prev => ({ ...prev, customerId: e.target.value }))}
              >
                <option value="">Kunde auswählen...</option>
                {unlinkedCustomers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <button
              style={{ ...primaryBtn, alignSelf: 'flex-end' }}
              onClick={handleAssign}
              disabled={isAssigning || !assignForm.tenantId || !assignForm.customerId}
            >
              {isAssigning ? 'Speichert...' : 'Zuweisen'}
            </button>
          </div>
          {assignError && (
            <div style={{ color: '#fca5a5', fontSize: '12px', marginTop: '8px' }}>{assignError}</div>
          )}
        </div>
      )}

      {/* Linked tenants */}
      {tenants.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
            Verknüpfte Tenants ({tenants.length})
          </h3>
          {tenants.map(tenant => {
            const isExpanded = !!expanded[tenant.customerId];
            return (
              <div key={tenant.id} style={{ backgroundColor: '#1e293b', borderRadius: '10px', padding: '16px 20px', marginBottom: '10px' }}>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                  onClick={() => toggle(tenant.customerId)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ color: '#94a3b8', fontSize: '13px' }}>{isExpanded ? '▾' : '▸'}</span>
                    <span style={{ color: '#f1f5f9', fontSize: '15px', fontWeight: 600 }}>{tenant.customerName}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#64748b', backgroundColor: '#0f172a', borderRadius: '4px', padding: '2px 8px' }}>
                      {tenant.tenantId}
                    </span>
                    <span style={{ color: '#64748b', fontSize: '13px' }}>
                      {tenant.devices.length} Firewall{tenant.devices.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div onClick={e => e.stopPropagation()}>
                    <button style={{ ...dangerBtn, padding: '5px 12px', fontSize: '12px' }} onClick={() => handleDelete(tenant.customerId)}>
                      Entfernen
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: '14px' }}>
                    {tenant.devices.length === 0 ? (
                      <p style={{ color: '#475569', fontSize: '13px', margin: 0 }}>
                        Noch keine Firewalls synchronisiert. Bitte Sync ausführen.
                      </p>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #334155' }}>
                            <th style={{ textAlign: 'left', padding: '6px 8px', color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>Name</th>
                            <th style={{ textAlign: 'left', padding: '6px 8px', color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>Hostname</th>
                            <th style={{ textAlign: 'left', padding: '6px 8px', color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>Version</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tenant.devices.map(dev => (
                            <tr key={dev.id} style={{ borderBottom: '1px solid #0f172a' }}>
                              <td style={{ padding: '7px 8px', color: '#e2e8f0', fontSize: '14px' }}>{dev.name}</td>
                              <td style={{ padding: '7px 8px', color: '#94a3b8', fontSize: '13px', fontFamily: 'monospace' }}>{dev.hostname || '—'}</td>
                              <td style={{ padding: '7px 8px', color: '#94a3b8', fontSize: '13px', fontFamily: 'monospace' }}>{dev.currentVersion}</td>
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
      )}

      {tenants.length === 0 && unmatched.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px', color: '#475569' }}>
          <p style={{ fontSize: '15px', marginBottom: '8px' }}>Noch keine Tenants synchronisiert</p>
          <p style={{ fontSize: '13px' }}>Bitte zuerst Sophos-Zugangsdaten in den Einstellungen hinterlegen und dann synchronisieren.</p>
        </div>
      )}
    </div>
  );
}

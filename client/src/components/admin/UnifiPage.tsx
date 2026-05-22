import React, { useEffect, useState } from 'react';
import {
  fetchCustomers,
  fetchUnifiCustomers,
  fetchUnifiMappings,
  fetchUnifiUnmatchedHosts,
  createUnifiMapping,
  deleteUnifiMapping,
  triggerUnifiSync,
  type Customer,
  type UnifiCustomerEntry,
  type UnifiCustomerMapping,
  type UnifiUnmatchedHost,
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

const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  'update-available': { bg: '#78350f', color: '#fbbf24' },
  'major-update':     { bg: '#7f1d1d', color: '#fca5a5' },
  'up-to-date':       { bg: '#065f46', color: '#6ee7b7' },
  'unknown':          { bg: '#374151', color: '#9ca3af' },
};
const STATUS_LABEL: Record<string, string> = {
  'update-available': 'Update verfügbar',
  'major-update':     'Major Update',
  'up-to-date':       'Aktuell',
  'unknown':          'Unbekannt',
};

const PRODUCT_LABEL: Record<string, string> = {
  'unifi-os':      'UniFi OS',
  'unifi-network': 'Network App',
};
function productLabel(id: string) { return PRODUCT_LABEL[id] ?? id; }

export default function UnifiPage() {
  const [unifiCustomers, setUnifiCustomers] = useState<UnifiCustomerEntry[]>([]);
  const [mappings, setMappings] = useState<UnifiCustomerMapping[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [unmatchedHosts, setUnmatchedHosts] = useState<UnifiUnmatchedHost[]>([]);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState(false);
  const [mappingForm, setMappingForm] = useState<{ hostName: string; customerId: string }>({ hostName: '', customerId: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [mappingError, setMappingError] = useState<string | null>(null);

  async function load() {
    const [uc, m, c, u] = await Promise.all([
      fetchUnifiCustomers().catch(() => [] as UnifiCustomerEntry[]),
      fetchUnifiMappings().catch(() => [] as UnifiCustomerMapping[]),
      fetchCustomers().catch(() => [] as Customer[]),
      fetchUnifiUnmatchedHosts().catch(() => [] as UnifiUnmatchedHost[]),
    ]);
    setUnifiCustomers(uc);
    setMappings(m);
    setCustomers(c);
    setUnmatchedHosts(u);
  }

  useEffect(() => { load(); }, []);

  // Filter out hosts that already have a manual mapping (stale unmatched entries)
  const mappedTexts = new Set(mappings.map(m => m.matchText));
  const filteredUnmatched = unmatchedHosts.filter(h => !mappedTexts.has(h.hostName));

  function toggle(customerId: number) {
    setExpanded(prev => ({ ...prev, [customerId]: !prev[customerId] }));
  }

  async function handleSync() {
    setIsSyncing(true);
    setSyncMessage(null);
    setSyncError(false);
    try {
      const result = await triggerUnifiSync();
      const parts = [`${result.hosts} Host(s)`, `${result.devices} Gerät(e)`];
      if (result.unmatchedHosts > 0) parts.push(`${result.unmatchedHosts} ohne Match`);
      if (result.ambiguousHosts > 0) parts.push(`${result.ambiguousHosts} mehrdeutig`);
      setSyncMessage(parts.join(' · '));
      await load();
    } catch (error) {
      setSyncMessage((error as Error).message || 'UniFi-Sync fehlgeschlagen');
      setSyncError(true);
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleCreateMapping() {
    const matchText = mappingForm.hostName.trim();
    const customerId = Number(mappingForm.customerId);
    if (!matchText || !Number.isFinite(customerId) || customerId <= 0) {
      setMappingError('Bitte UniFi Host und Kunden auswählen');
      return;
    }
    setMappingError(null);
    setIsSaving(true);
    try {
      await createUnifiMapping({ matchText, customerId });
      setMappingForm({ hostName: '', customerId: '' });
      // Sync immediately so the newly mapped customer appears in the list
      setIsSyncing(true);
      setSyncMessage(null);
      setSyncError(false);
      try {
        const result = await triggerUnifiSync();
        const parts = [`${result.hosts} Host(s)`, `${result.devices} Gerät(e)`];
        if (result.unmatchedHosts > 0) parts.push(`${result.unmatchedHosts} ohne Match`);
        setSyncMessage(parts.join(' · '));
      } catch (syncErr) {
        setSyncMessage((syncErr as Error).message || 'Sync fehlgeschlagen');
        setSyncError(true);
      } finally {
        setIsSyncing(false);
      }
      await load();
    } catch (error) {
      setMappingError((error as Error).message || 'Mapping konnte nicht gespeichert werden');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteMapping(id: number) {
    if (!confirm('Mapping löschen?')) return;
    await deleteUnifiMapping(id);
    await load();
  }

  const totalDevices = unifiCustomers.reduce((s, c) => s + c.devices.length, 0);
  const outdatedCount = unifiCustomers.reduce((s, c) =>
    s + c.devices.filter(d => d.status === 'update-available' || d.status === 'major-update').length, 0);
  const pendingSyncCount = unifiCustomers.filter(c => c.pendingSync).length;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: 700, margin: 0 }}>UniFi</h2>
        <button style={primaryBtn} onClick={handleSync} disabled={isSyncing}>
          {isSyncing ? 'Sync läuft...' : 'Jetzt synchronisieren'}
        </button>
      </div>

      {syncMessage && (
        <div style={{ color: syncError ? '#fca5a5' : '#94a3b8', fontSize: '13px', marginBottom: '20px' }}>
          {syncMessage}
        </div>
      )}

      {/* Unmatched Hosts — manual mapping form */}
      <div style={{ backgroundColor: '#1e293b', borderRadius: '10px', padding: '16px 20px', marginBottom: '20px', border: filteredUnmatched.length > 0 ? '1px solid #3b82f644' : '1px solid transparent' }}>
        <h3 style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', marginTop: 0 }}>
          Host-Mapping (manuell)
          {filteredUnmatched.length > 0 && (
            <span style={{ marginLeft: '8px', color: '#60a5fa', fontWeight: 700 }}>
              {filteredUnmatched.length} nicht zugeordnet
            </span>
          )}
        </h3>
        <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '14px', marginTop: 0 }}>
          Hosts, die beim Sync keinem Kunden zugeordnet werden konnten, können hier manuell verknüpft werden.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr auto', gap: '10px', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
              Match-Text
            </label>
            <p style={{ color: '#475569', fontSize: '11px', margin: '0 0 6px' }}>
              Freitext — z.B. <code style={{ backgroundColor: '#0f172a', padding: '1px 5px', borderRadius: '3px' }}>ELEMENTS</code> matcht alle Hosts die diesen Text enthalten (mehrere Sites eines Kunden)
            </p>
            <input
              list="unmatched-hosts-list"
              style={{ ...inputStyle, width: '100%' }}
              placeholder="Text eingeben oder Host auswählen…"
              value={mappingForm.hostName}
              onChange={e => setMappingForm(prev => ({ ...prev, hostName: e.target.value }))}
            />
            <datalist id="unmatched-hosts-list">
              {filteredUnmatched.map(host => (
                <option key={host.id} value={host.hostName} />
              ))}
            </datalist>
          </div>
          <div>
            <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Kunde</label>
            <select
              style={{ ...inputStyle, width: '100%' }}
              value={mappingForm.customerId}
              onChange={e => setMappingForm(prev => ({ ...prev, customerId: e.target.value }))}
            >
              <option value="">Kunde auswählen...</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <button
            style={{ ...primaryBtn, alignSelf: 'flex-end' }}
            onClick={handleCreateMapping}
            disabled={isSaving || !mappingForm.hostName || !mappingForm.customerId}
          >
            {isSaving ? 'Speichert...' : 'Mapping speichern'}
          </button>
        </div>

        {mappingError && (
          <div style={{ color: '#fca5a5', fontSize: '12px', marginTop: '8px' }}>{mappingError}</div>
        )}

        {filteredUnmatched.length === 0 && !mappingForm.hostName && (
          <div style={{ color: '#475569', fontSize: '12px', marginTop: '10px' }}>
            Keine offenen Hosts. Bitte zuerst Sync ausführen oder Match-Text manuell eingeben.
          </div>
        )}
      </div>

      {/* Saved mappings (collapsed into accordion) */}
      {mappings.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
            Gespeicherte Mappings ({mappings.length})
          </h3>
          <div style={{ backgroundColor: '#1e293b', borderRadius: '10px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <th style={{ textAlign: 'left', padding: '10px 16px', color: '#64748b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Match-Text</th>
                  <th style={{ textAlign: 'left', padding: '10px 16px', color: '#64748b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Kunde</th>
                  <th style={{ padding: '10px 16px' }} />
                </tr>
              </thead>
              <tbody>
                {mappings.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid #0f172a' }}>
                    <td style={{ padding: '10px 16px', color: '#e2e8f0', fontFamily: 'monospace', fontSize: '13px' }}>{m.matchText}</td>
                    <td style={{ padding: '10px 16px', color: '#cbd5e1', fontSize: '13px' }}>{m.customerName}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                      <button style={{ ...dangerBtn, padding: '5px 12px', fontSize: '12px' }} onClick={() => handleDeleteMapping(m.id)}>
                        Löschen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Linked customers with devices */}
      {unifiCustomers.length > 0 && (
        <div>
          <h3 style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
            Synchronisierte Kunden ({unifiCustomers.length})
          </h3>
          <p style={{ color: '#64748b', fontSize: '12px', marginBottom: '12px', marginTop: 0 }}>
            {totalDevices} Gerät{totalDevices !== 1 ? 'e' : ''}
            {outdatedCount > 0 && (
              <span style={{ color: '#fbbf24', marginLeft: '10px', fontWeight: 600 }}>
                {outdatedCount} Update{outdatedCount !== 1 ? 's' : ''} verfügbar
              </span>
            )}
            {pendingSyncCount > 0 && (
              <span style={{ color: '#94a3b8', marginLeft: '10px' }}>
                · {pendingSyncCount} Mapping{pendingSyncCount !== 1 ? 's' : ''} noch nicht synchronisiert
              </span>
            )}
          </p>

          {unifiCustomers.map(entry => {
            const isExpanded = !!expanded[entry.customerId];
            const entryOutdated = entry.devices.filter(d => d.status === 'update-available' || d.status === 'major-update').length;
            return (
              <div key={`${entry.customerId}-${entry.pendingSync}`} style={{
                backgroundColor: '#1e293b',
                borderRadius: '10px',
                padding: '14px 20px',
                marginBottom: '10px',
                border: entry.pendingSync
                  ? '1px solid rgba(148,163,184,0.2)'
                  : entryOutdated > 0 ? '1px solid rgba(251,191,36,0.2)' : '1px solid transparent',
                opacity: entry.pendingSync ? 0.75 : 1,
              }}>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: entry.pendingSync ? 'default' : 'pointer', userSelect: 'none' }}
                  onClick={() => !entry.pendingSync && toggle(entry.customerId)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {!entry.pendingSync && (
                      <span style={{ color: '#94a3b8', fontSize: '13px' }}>{isExpanded ? '▾' : '▸'}</span>
                    )}
                    <span style={{ color: '#f1f5f9', fontSize: '15px', fontWeight: 600 }}>{entry.customerName}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#64748b', backgroundColor: '#0f172a', borderRadius: '4px', padding: '2px 8px' }}>
                      {entry.hostName}
                    </span>
                    {entry.pendingSync ? (
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '4px', padding: '2px 8px' }}>
                        ⏳ Sync ausstehend
                      </span>
                    ) : (
                      <>
                        <span style={{ color: '#64748b', fontSize: '13px' }}>
                          {entry.devices.length} Gerät{entry.devices.length !== 1 ? 'e' : ''}
                        </span>
                        {entryOutdated > 0 && (
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#fbbf24', backgroundColor: '#78350f', borderRadius: '4px', padding: '2px 8px' }}>
                            {entryOutdated} Update{entryOutdated !== 1 ? 's' : ''}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {entry.pendingSync && (
                  <p style={{ color: '#475569', fontSize: '12px', margin: '8px 0 0', fontStyle: 'italic' }}>
                    Mapping vorhanden — bitte "Jetzt synchronisieren" drücken um Geräte zu laden.
                  </p>
                )}

                {!entry.pendingSync && isExpanded && (
                  <div style={{ marginTop: '14px' }}>
                    {entry.devices.length === 0 ? (
                      <p style={{ color: '#475569', fontSize: '13px', margin: 0 }}>
                        Noch keine Geräte synchronisiert.
                      </p>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #334155' }}>
                            {['Name', 'Produkt', 'Installiert', 'Aktuell', 'Status'].map(h => (
                              <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {entry.devices.map(dev => {
                            const sc = STATUS_COLOR[dev.status] ?? STATUS_COLOR.unknown;
                            return (
                              <tr key={dev.id} style={{ borderBottom: '1px solid #0f172a' }}>
                                <td style={{ padding: '8px 8px', color: '#e2e8f0', fontSize: '14px' }}>{dev.name}</td>
                                <td style={{ padding: '8px 8px', color: '#64748b', fontSize: '12px' }}>{productLabel(dev.productId)}</td>
                                <td style={{ padding: '8px 8px', color: '#94a3b8', fontSize: '13px', fontFamily: 'monospace' }}>{dev.currentVersion || '—'}</td>
                                <td style={{ padding: '8px 8px', color: '#94a3b8', fontSize: '13px', fontFamily: 'monospace' }}>{dev.latestVersion || '—'}</td>
                                <td style={{ padding: '8px 8px' }}>
                                  <span style={{
                                    fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px',
                                    backgroundColor: sc.bg, color: sc.color,
                                  }}>
                                    {STATUS_LABEL[dev.status] ?? 'Unbekannt'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
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

      {unifiCustomers.length === 0 && mappings.length === 0 && filteredUnmatched.length === 0 && !syncMessage && (
        <div style={{ textAlign: 'center', padding: '48px', color: '#475569' }}>
          <p style={{ fontSize: '15px', marginBottom: '8px' }}>Noch keine UniFi-Daten</p>
          <p style={{ fontSize: '13px' }}>Bitte zuerst UniFi-Zugangsdaten in den Einstellungen hinterlegen und dann synchronisieren.</p>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import {
  fetchCustomers,
  fetchUnifiMappings,
  fetchUnifiUnmatchedHosts,
  createUnifiMapping,
  deleteUnifiMapping,
  triggerUnifiSync,
  type MockCustomer,
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

export default function UnifiPage() {
  const [mappings, setMappings] = useState<UnifiCustomerMapping[]>([]);
  const [customers, setCustomers] = useState<MockCustomer[]>([]);
  const [unmatchedHosts, setUnmatchedHosts] = useState<UnifiUnmatchedHost[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState(false);
  const [mappingForm, setMappingForm] = useState<{ hostName: string; customerId: string }>({ hostName: '', customerId: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [mappingError, setMappingError] = useState<string | null>(null);

  async function load() {
    const [m, c, u] = await Promise.all([
      fetchUnifiMappings().catch(() => [] as UnifiCustomerMapping[]),
      fetchCustomers().catch(() => [] as MockCustomer[]),
      fetchUnifiUnmatchedHosts().catch(() => [] as UnifiUnmatchedHost[]),
    ]);
    setMappings(m);
    setCustomers(c);
    setUnmatchedHosts(u);
  }

  useEffect(() => { load(); }, []);

  async function handleSync() {
    setIsSyncing(true);
    setSyncMessage(null);
    setSyncError(false);
    try {
      const result = await triggerUnifiSync();
      const parts = [
        `${result.hosts} Host(s)`,
        `${result.devices} Gerät(e)`,
      ];
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
      <div style={{ backgroundColor: '#1e293b', borderRadius: '10px', padding: '16px 20px', marginBottom: '20px', border: unmatchedHosts.length > 0 ? '1px solid #3b82f644' : '1px solid transparent' }}>
        <h3 style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', marginTop: 0 }}>
          Host-Mapping (manuell)
          {unmatchedHosts.length > 0 && (
            <span style={{ marginLeft: '8px', color: '#60a5fa', fontWeight: 700 }}>
              {unmatchedHosts.length} nicht zugeordnet
            </span>
          )}
        </h3>
        <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '14px', marginTop: 0 }}>
          Hosts, die beim Sync keinem Kunden zugeordnet werden konnten, können hier manuell verknüpft werden.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr auto', gap: '10px', alignItems: 'end' }}>
          <div>
            <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>UniFi Host</label>
            <select
              style={{ ...inputStyle, width: '100%' }}
              value={mappingForm.hostName}
              onChange={e => setMappingForm(prev => ({ ...prev, hostName: e.target.value }))}
            >
              <option value="">Host auswählen...</option>
              {unmatchedHosts.map(host => (
                <option key={host.id} value={host.hostName}>{host.hostName}</option>
              ))}
            </select>
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

        {unmatchedHosts.length === 0 && (
          <div style={{ color: '#475569', fontSize: '12px', marginTop: '10px' }}>
            Keine offenen Hosts. Bitte zuerst Sync ausführen.
          </div>
        )}
      </div>

      {/* Existing Mappings */}
      {mappings.length > 0 && (
        <div>
          <h3 style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
            Gespeicherte Mappings ({mappings.length})
          </h3>
          <div style={{ backgroundColor: '#1e293b', borderRadius: '10px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <th style={{ textAlign: 'left', padding: '10px 16px', color: '#64748b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Match-Text</th>
                  <th style={{ textAlign: 'left', padding: '10px 16px', color: '#64748b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Kunde</th>
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

      {mappings.length === 0 && unmatchedHosts.length === 0 && !syncMessage && (
        <div style={{ textAlign: 'center', padding: '48px', color: '#475569' }}>
          <p style={{ fontSize: '15px', marginBottom: '8px' }}>Noch keine UniFi-Daten</p>
          <p style={{ fontSize: '13px' }}>Bitte zuerst UniFi-Zugangsdaten in den Einstellungen hinterlegen und dann synchronisieren.</p>
        </div>
      )}
    </div>
  );
}

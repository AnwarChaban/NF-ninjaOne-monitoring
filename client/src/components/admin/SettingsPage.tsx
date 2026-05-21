import React, { useEffect, useState } from 'react';
import { fetchSettings, updateSettings, apiFetch } from '../../api';

interface SecretInfo {
  key: string;
  label: string;
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  isExpired: boolean;
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px', backgroundColor: '#1e293b', border: '1px solid #334155',
  borderRadius: '6px', color: '#f1f5f9', fontSize: '14px', outline: 'none', width: '100%',
};
const btnStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer',
  fontSize: '13px', fontWeight: 600,
};
const primaryBtn: React.CSSProperties = { ...btnStyle, backgroundColor: '#3b82f6', color: '#fff' };
const cardStyle: React.CSSProperties = { backgroundColor: '#1e293b', borderRadius: '10px', padding: '20px' };
const sectionTitleStyle: React.CSSProperties = {
  color: '#94a3b8', fontSize: '14px', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px',
};

function extractTenantId(tokenUrl: string): string {
  const match = tokenUrl.match(/login\.microsoftonline\.com\/([^/]+)\//);
  return match ? match[1] : tokenUrl.trim();
}

// Inline expiry row component
function ExpiryRow({
  settingsKey,
  expiryInfo,
  expiryDates,
  saving,
  onChange,
  onSave,
}: {
  settingsKey: string;
  expiryInfo: SecretInfo[];
  expiryDates: Record<string, string>;
  saving: boolean;
  onChange: (key: string, value: string) => void;
  onSave: (key: string) => void;
}) {
  const info = expiryInfo.find(e => e.key === settingsKey);
  const days = info?.daysUntilExpiry;
  const isExpired = info?.isExpired;
  const isWarning = !isExpired && days !== null && days !== undefined && days <= 14;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
      <span style={{ color: '#475569', fontSize: '12px', whiteSpace: 'nowrap' }}>Ablaufdatum:</span>
      <input
        type="date"
        value={expiryDates[settingsKey] ?? ''}
        onChange={e => onChange(settingsKey, e.target.value)}
        style={{
          flex: 1, padding: '5px 8px', backgroundColor: '#0f172a',
          border: `1px solid ${isExpired ? '#ef4444' : isWarning ? '#f59e0b' : '#334155'}`,
          borderRadius: '5px', color: '#f1f5f9', fontSize: '12px', outline: 'none',
        }}
      />
      {isExpired && <span style={{ fontSize: '11px', color: '#f87171', whiteSpace: 'nowrap' }}>❌ Abgelaufen</span>}
      {isWarning && <span style={{ fontSize: '11px', color: '#fbbf24', whiteSpace: 'nowrap' }}>⚠ {days}d</span>}
      {!isExpired && !isWarning && info?.expiresAt && (
        <span style={{ fontSize: '11px', color: '#4ade80', whiteSpace: 'nowrap' }}>✓ {days}d</span>
      )}
      <button
        onClick={() => onSave(settingsKey)}
        disabled={saving}
        style={{
          padding: '4px 10px', borderRadius: '5px', border: 'none', fontSize: '12px',
          fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
          backgroundColor: '#1e40af', color: '#93c5fd',
        }}
      >
        OK
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const [ninjaApiKey, setNinjaApiKey] = useState('');
  const [ninjaClientId, setNinjaClientId] = useState('');
  const [ninjaClientSecret, setNinjaClientSecret] = useState('');
  const [unifiApiKey, setUnifiApiKey] = useState('');
  const [unifiClientId, setUnifiClientId] = useState('');
  const [unifiClientSecret, setUnifiClientSecret] = useState('');
  const [sophosTokenUrl, setSophosTokenUrl] = useState('');
  const [sophosClientId, setSophosClientId] = useState('');
  const [sophosClientSecret, setSophosClientSecret] = useState('');
  const [sophosPartnerId, setSophosPartnerId] = useState('');
  const [sophosScope, setSophosScope] = useState('');
  const [graphTokenUrl, setGraphTokenUrl] = useState('');
  const [graphClientId, setGraphClientId] = useState('');
  const [graphClientSecret, setGraphClientSecret] = useState('');
  const [backupMailbox, setBackupMailbox] = useState('');
  const [showUpToDateDevices, setShowUpToDateDevices] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expiryInfo, setExpiryInfo] = useState<SecretInfo[]>([]);
  const [expiryDates, setExpiryDates] = useState<Record<string, string>>({});
  const [expirySaving, setExpirySaving] = useState(false);

  async function load() {
    const s = await fetchSettings();
    setNinjaApiKey(s.ninjaoneApiKey || '');
    setNinjaClientId(s.ninjaoneClientId || '');
    setNinjaClientSecret(s.ninjaoneClientSecret || '');
    setUnifiApiKey(s.unifiApiKey || '');
    setUnifiClientId(s.unifiClientId || '');
    setUnifiClientSecret(s.unifiClientSecret || '');
    setSophosTokenUrl(s.sophosTokenUrl || '');
    setSophosClientId(s.sophosClientId || '');
    setSophosClientSecret(s.sophosClientSecret || '');
    setSophosPartnerId(s.sophosPartnerId || '');
    setSophosScope(s.sophosScope || 'token');
    const tenantId = s.graphTenantId || '';
    setGraphTokenUrl(tenantId ? `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token` : '');
    setGraphClientId(s.graphClientId || '');
    setGraphClientSecret(s.graphClientSecret || '');
    setBackupMailbox(s.backupMailbox || '');
    setShowUpToDateDevices(s.showUpToDateDevices === 'true');
  }

  async function loadExpiry() {
    const res = await apiFetch('/api/settings/expiry');
    if (res.ok) {
      const data = await res.json() as SecretInfo[];
      setExpiryInfo(data);
      const dates: Record<string, string> = {};
      for (const s of data) {
        if (s.expiresAt) dates[s.key] = s.expiresAt.slice(0, 10);
      }
      setExpiryDates(dates);
    }
  }

  function handleExpiryChange(key: string, value: string) {
    setExpiryDates(prev => ({ ...prev, [key]: value }));
  }

  async function saveExpiryDate(key: string) {
    setExpirySaving(true);
    try {
      await apiFetch(`/api/settings/${key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expires_at: expiryDates[key] || null }),
      });
      await loadExpiry();
    } finally {
      setExpirySaving(false);
    }
  }

  useEffect(() => { load(); loadExpiry(); }, []);

  async function handleSave() {
    await updateSettings({
      ninjaoneApiKey: ninjaApiKey, ninjaoneClientId: ninjaClientId, ninjaoneClientSecret: ninjaClientSecret,
      unifiApiKey, unifiClientId, unifiClientSecret,
      sophosTokenUrl, sophosClientId, sophosClientSecret, sophosPartnerId, sophosScope,
      graphTenantId: extractTenantId(graphTokenUrl), graphClientId, graphClientSecret,
      backupMailbox, showUpToDateDevices: showUpToDateDevices ? 'true' : 'false',
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    load();
  }

  const expiryProps = { expiryInfo, expiryDates, saving: expirySaving, onChange: handleExpiryChange, onSave: saveExpiryDate };

  return (
    <div>
      <h2 style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: 700, marginBottom: '24px' }}>Einstellungen</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(320px, 1fr))', gap: '16px', maxWidth: '1200px' }}>

        {/* NinjaOne */}
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>NinjaOne</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Client ID</label>
              <input style={inputStyle} placeholder="Client ID" value={ninjaClientId} onChange={e => setNinjaClientId(e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Client Secret</label>
              <input style={inputStyle} type="password" placeholder="Client Secret" value={ninjaClientSecret} onChange={e => setNinjaClientSecret(e.target.value)} />
              <ExpiryRow settingsKey="ninjaoneClientSecret" {...expiryProps} />
            </div>
          </div>
        </div>

        {/* UniFi */}
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>UniFi</h3>
          <div>
            <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>API Key</label>
            <input style={inputStyle} type="password" placeholder="UniFi API Key" value={unifiApiKey} onChange={e => setUnifiApiKey(e.target.value)} />
            <ExpiryRow settingsKey="unifiApiKey" {...expiryProps} />
          </div>
        </div>

        {/* Sophos */}
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>Sophos</h3>
          <div style={{ display: 'grid', rowGap: '10px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: '12px' }}>
              <span style={{ color: '#64748b', fontSize: '13px' }}>Grant type</span>
              <span style={{ padding: '8px 12px', backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', color: '#64748b', fontSize: '13px', fontFamily: 'monospace' }}>Client Credentials</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: '12px' }}>
              <span style={{ color: '#94a3b8', fontSize: '13px' }}>Access Token URL</span>
              <input style={inputStyle} placeholder="https://id.sophos.com/api/v2/oauth2/token" value={sophosTokenUrl} onChange={e => setSophosTokenUrl(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: '12px' }}>
              <span style={{ color: '#94a3b8', fontSize: '13px' }}>Client ID</span>
              <input style={inputStyle} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={sophosClientId} onChange={e => setSophosClientId(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'start', gap: '12px' }}>
              <span style={{ color: '#94a3b8', fontSize: '13px', paddingTop: '9px' }}>Client Secret</span>
              <div>
                <input style={inputStyle} type="password" placeholder="••••••••••••••••••••" value={sophosClientSecret} onChange={e => setSophosClientSecret(e.target.value)} />
                <ExpiryRow settingsKey="sophosClientSecret" {...expiryProps} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: '12px' }}>
              <span style={{ color: '#94a3b8', fontSize: '13px' }}>Partner ID</span>
              <input style={inputStyle} placeholder="X-Partner-ID" value={sophosPartnerId} onChange={e => setSophosPartnerId(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: '12px' }}>
              <span style={{ color: '#94a3b8', fontSize: '13px' }}>Scope</span>
              <input style={inputStyle} placeholder="token" value={sophosScope} onChange={e => setSophosScope(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Microsoft Graph */}
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>Microsoft Graph API (Backup)</h3>
          <div style={{ display: 'grid', rowGap: '10px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: '12px' }}>
              <span style={{ color: '#64748b', fontSize: '13px' }}>Grant type</span>
              <span style={{ padding: '8px 12px', backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', color: '#64748b', fontSize: '13px', fontFamily: 'monospace' }}>Client Credentials</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: '12px' }}>
              <span style={{ color: '#94a3b8', fontSize: '13px' }}>Access Token URL</span>
              <div>
                <input style={inputStyle} placeholder="https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token" value={graphTokenUrl} onChange={e => setGraphTokenUrl(e.target.value)} />
                {extractTenantId(graphTokenUrl) && graphTokenUrl.includes('microsoftonline') && (
                  <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px', fontFamily: 'monospace' }}>
                    Tenant ID: {extractTenantId(graphTokenUrl)}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: '12px' }}>
              <span style={{ color: '#94a3b8', fontSize: '13px' }}>Client ID</span>
              <input style={inputStyle} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={graphClientId} onChange={e => setGraphClientId(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'start', gap: '12px' }}>
              <span style={{ color: '#94a3b8', fontSize: '13px', paddingTop: '9px' }}>Client Secret</span>
              <div>
                <input style={inputStyle} type="password" placeholder="••••••••••••••••••••" value={graphClientSecret} onChange={e => setGraphClientSecret(e.target.value)} />
                <ExpiryRow settingsKey="graphClientSecret" {...expiryProps} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: '12px' }}>
              <span style={{ color: '#64748b', fontSize: '13px' }}>Scope</span>
              <span style={{ padding: '8px 12px', backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', color: '#64748b', fontSize: '13px', fontFamily: 'monospace' }}>
                https://graph.microsoft.com/.default
              </span>
            </div>
            <div style={{ height: '1px', backgroundColor: '#1e293b', margin: '4px 0' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: '12px' }}>
              <span style={{ color: '#94a3b8', fontSize: '13px' }}>Backup-Postfach</span>
              <input style={inputStyle} placeholder="backup@firma.de" value={backupMailbox} onChange={e => setBackupMailbox(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Aktionen */}
        <div style={{ ...cardStyle, gridColumn: '1 / -1' }}>
          <h3 style={sectionTitleStyle}>Aktionen</h3>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#cbd5e1', fontSize: '14px' }}>
              <input type="checkbox" checked={showUpToDateDevices} onChange={e => setShowUpToDateDevices(e.target.checked)} />
              Aktuelle Geräte im Dashboard anzeigen
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button style={primaryBtn} onClick={handleSave}>Speichern</button>
            {saved && <span style={{ color: '#6ee7b7', fontSize: '13px' }}>Gespeichert!</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

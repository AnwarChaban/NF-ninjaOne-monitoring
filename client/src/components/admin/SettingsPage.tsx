import React, { useEffect, useState } from 'react';
import { fetchSettings, updateSettings } from '../../api';

const inputStyle: React.CSSProperties = {
  padding: '8px 12px', backgroundColor: '#1e293b', border: '1px solid #334155',
  borderRadius: '6px', color: '#f1f5f9', fontSize: '14px', outline: 'none', width: '100%',
};
const btnStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer',
  fontSize: '13px', fontWeight: 600,
};
const primaryBtn: React.CSSProperties = { ...btnStyle, backgroundColor: '#3b82f6', color: '#fff' };
const cardStyle: React.CSSProperties = {
  backgroundColor: '#1e293b',
  borderRadius: '10px',
  padding: '20px',
};
const sectionTitleStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: '14px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '1px',
  marginBottom: '12px',
};

function extractTenantId(tokenUrl: string): string {
  const match = tokenUrl.match(/login\.microsoftonline\.com\/([^/]+)\//);
  return match ? match[1] : tokenUrl.trim();
}


export default function SettingsPage() {
  const [ninjaApiKey, setNinjaApiKey] = useState('');
  const [ninjaClientId, setNinjaClientId] = useState('');
  const [ninjaClientSecret, setNinjaClientSecret] = useState('');
  const [unifiApiKey, setUnifiApiKey] = useState('');
  const [unifiClientId, setUnifiClientId] = useState('');
  const [unifiClientSecret, setUnifiClientSecret] = useState('');
  const [sophosApiKey, setSophosApiKey] = useState('');
  const [sophosClientId, setSophosClientId] = useState('');
  const [sophosClientSecret, setSophosClientSecret] = useState('');
  const [graphTokenUrl, setGraphTokenUrl] = useState('');
  const [graphClientId, setGraphClientId] = useState('');
  const [graphClientSecret, setGraphClientSecret] = useState('');
  const [backupMailbox, setBackupMailbox] = useState('');
  const [showUpToDateDevices, setShowUpToDateDevices] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    const s = await fetchSettings();
    setNinjaApiKey(s.ninjaoneApiKey || '');
    setNinjaClientId(s.ninjaoneClientId || '');
    setNinjaClientSecret(s.ninjaoneClientSecret || '');
    setUnifiApiKey(s.unifiApiKey || '');
    setUnifiClientId(s.unifiClientId || '');
    setUnifiClientSecret(s.unifiClientSecret || '');
    setSophosApiKey(s.sophosApiKey || '');
    setSophosClientId(s.sophosClientId || '');
    setSophosClientSecret(s.sophosClientSecret || '');
    const tenantId = s.graphTenantId || '';
    setGraphTokenUrl(tenantId
      ? `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
      : '');
    setGraphClientId(s.graphClientId || '');
    setGraphClientSecret(s.graphClientSecret || '');
    setBackupMailbox(s.backupMailbox || '');
    setShowUpToDateDevices(s.showUpToDateDevices === 'true');
  }

  useEffect(() => { load(); }, []);

  async function handleSave() {
    await updateSettings({
      ninjaoneApiKey: ninjaApiKey,
      ninjaoneClientId: ninjaClientId,
      ninjaoneClientSecret: ninjaClientSecret,
      unifiApiKey,
      unifiClientId,
      unifiClientSecret,
      sophosApiKey,
      sophosClientId,
      sophosClientSecret,
      graphTenantId: extractTenantId(graphTokenUrl),
      graphClientId,
      graphClientSecret,
      backupMailbox,
      showUpToDateDevices: showUpToDateDevices ? 'true' : 'false',
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    load();
  }

  return (
    <div>
      <h2 style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: 700, marginBottom: '24px' }}>Einstellungen</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(320px, 1fr))', gap: '16px', maxWidth: '1200px' }}>
        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>NinjaOne</h3>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>API Key (optional)</label>
            <input style={inputStyle} type="password" placeholder="NinjaOne API Key" value={ninjaApiKey} onChange={e => setNinjaApiKey(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Client ID</label>
              <input style={inputStyle} placeholder="Client ID" value={ninjaClientId} onChange={e => setNinjaClientId(e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Client Secret</label>
              <input style={inputStyle} type="password" placeholder="Client Secret" value={ninjaClientSecret} onChange={e => setNinjaClientSecret(e.target.value)} />
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>UniFi</h3>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>API Key (optional)</label>
            <input style={inputStyle} type="password" placeholder="UniFi API Key" value={unifiApiKey} onChange={e => setUnifiApiKey(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Client ID</label>
              <input style={inputStyle} placeholder="Client ID" value={unifiClientId} onChange={e => setUnifiClientId(e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Client Secret</label>
              <input style={inputStyle} type="password" placeholder="Client Secret" value={unifiClientSecret} onChange={e => setUnifiClientSecret(e.target.value)} />
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>Sophos</h3>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>API Key (optional)</label>
            <input style={inputStyle} type="password" placeholder="Sophos API Key" value={sophosApiKey} onChange={e => setSophosApiKey(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Client ID</label>
              <input style={inputStyle} placeholder="Client ID" value={sophosClientId} onChange={e => setSophosClientId(e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Client Secret</label>
              <input style={inputStyle} type="password" placeholder="Client Secret" value={sophosClientSecret} onChange={e => setSophosClientSecret(e.target.value)} />
            </div>
          </div>
        </div>

        <div style={{ ...cardStyle, gridColumn: '1 / -1' }}>
          <h3 style={sectionTitleStyle}>Microsoft Graph API (Backup)</h3>

          {/* Postman-style rows */}
          <div style={{ display: 'grid', rowGap: '10px' }}>

            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', alignItems: 'center', gap: '12px' }}>
              <span style={{ color: '#64748b', fontSize: '13px', fontWeight: 500 }}>Grant type</span>
              <span style={{ padding: '8px 12px', backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', color: '#64748b', fontSize: '13px', fontFamily: 'monospace' }}>
                Client Credentials
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', alignItems: 'center', gap: '12px' }}>
              <span style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 500 }}>Access Token URL</span>
              <div>
                <input
                  style={inputStyle}
                  placeholder="https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token"
                  value={graphTokenUrl}
                  onChange={e => setGraphTokenUrl(e.target.value)}
                />
                {extractTenantId(graphTokenUrl) && graphTokenUrl.includes('microsoftonline') && (
                  <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px', fontFamily: 'monospace' }}>
                    Tenant ID: {extractTenantId(graphTokenUrl)}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', alignItems: 'center', gap: '12px' }}>
              <span style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 500 }}>Client ID</span>
              <input style={inputStyle} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={graphClientId} onChange={e => setGraphClientId(e.target.value)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', alignItems: 'center', gap: '12px' }}>
              <span style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 500 }}>Client Secret</span>
              <input style={inputStyle} type="password" placeholder="••••••••••••••••••••" value={graphClientSecret} onChange={e => setGraphClientSecret(e.target.value)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', alignItems: 'center', gap: '12px' }}>
              <span style={{ color: '#64748b', fontSize: '13px', fontWeight: 500 }}>Scope</span>
              <span style={{ padding: '8px 12px', backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '6px', color: '#64748b', fontSize: '13px', fontFamily: 'monospace' }}>
                https://graph.microsoft.com/.default
              </span>
            </div>

            <div style={{ height: '1px', backgroundColor: '#1e293b', margin: '4px 0' }} />

            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', alignItems: 'center', gap: '12px' }}>
              <span style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 500 }}>Backup-Postfach</span>
              <input style={inputStyle} placeholder="backup@firma.de" value={backupMailbox} onChange={e => setBackupMailbox(e.target.value)} />
            </div>

          </div>
        </div>

        <div style={cardStyle}>
          <h3 style={sectionTitleStyle}>Aktionen</h3>
          <div style={{ display: 'grid', gap: '10px', marginBottom: '14px' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#cbd5e1', fontSize: '14px' }}>
              <input
                type="checkbox"
                checked={showUpToDateDevices}
                onChange={e => setShowUpToDateDevices(e.target.checked)}
              />
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

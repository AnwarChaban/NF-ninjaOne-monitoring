import React, { useState } from 'react';
import BackupDashboard from './BackupDashboard';
import BackupChecksPage from './admin/BackupChecksPage';

type Tab = 'status' | 'checks';

export default function BackupPage() {
  const [tab, setTab] = useState<Tab>('status');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: '2px', padding: '12px 24px 0',
        borderBottom: '1px solid #1e293b', backgroundColor: '#0f172a', flexShrink: 0,
      }}>
        {([
          { key: 'status', label: 'Übersicht' },
          { key: 'checks', label: 'Checks verwalten' },
        ] as { key: Tab; label: string }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 18px', border: 'none', cursor: 'pointer', fontSize: '14px',
              fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? '#f1f5f9' : '#64748b',
              backgroundColor: 'transparent',
              borderBottom: `2px solid ${tab === t.key ? '#3b82f6' : 'transparent'}`,
              marginBottom: '-1px', transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'status' && <BackupDashboard />}
        {tab === 'checks' && (
          <div style={{ padding: '32px 24px' }}>
            <BackupChecksPage />
          </div>
        )}
      </div>
    </div>
  );
}

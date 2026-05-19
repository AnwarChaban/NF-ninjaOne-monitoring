import React, { useState } from 'react';
import CustomersPage from './admin/CustomersPage';
import ProductsPage from './admin/ProductsPage';
import SettingsPage from './admin/SettingsPage';
import BackupChecksPage from './admin/BackupChecksPage';
import SophosPage from './admin/SophosPage';

type AdminTab = 'customers' | 'products' | 'sophos' | 'backup-checks' | 'settings';

const tabs: { key: AdminTab; label: string }[] = [
  { key: 'customers', label: 'Kunden' },
  { key: 'products', label: 'Produkte' },
  { key: 'sophos', label: 'Sophos' },
  { key: 'backup-checks', label: 'Backup-Checks' },
  { key: 'settings', label: 'Einstellungen' },
];

export default function AdminLayout() {
  const [activeTab, setActiveTab] = useState<AdminTab>('customers');

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside style={{
        width: '220px', backgroundColor: '#0f172a', borderRight: '1px solid #1e293b',
        padding: '20px 0', flexShrink: 0,
      }}>
        <div style={{ padding: '0 20px', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '18px', fontWeight: 800, color: '#f1f5f9', margin: 0 }}>Admin</h1>
          <p style={{ color: '#64748b', fontSize: '12px', marginTop: '4px' }}>Version Checker</p>
        </div>

        <nav>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 20px', border: 'none', cursor: 'pointer',
                fontSize: '14px', fontWeight: activeTab === tab.key ? 600 : 400,
                color: activeTab === tab.key ? '#f1f5f9' : '#94a3b8',
                backgroundColor: activeTab === tab.key ? '#1e293b' : 'transparent',
                borderLeft: activeTab === tab.key ? '3px solid #3b82f6' : '3px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div style={{ padding: '0 20px', marginTop: '32px' }}>
          <a
            href="#/"
            style={{
              display: 'block', padding: '8px 12px', borderRadius: '6px',
              backgroundColor: '#1e293b', color: '#94a3b8', textDecoration: 'none',
              fontSize: '13px', textAlign: 'center', border: '1px solid #334155',
            }}
          >
            &larr; Dashboard
          </a>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, padding: '32px 40px', overflow: 'auto' }}>
        {activeTab === 'customers' && <CustomersPage />}
        {activeTab === 'products' && <ProductsPage />}
        {activeTab === 'sophos' && <SophosPage />}
        {activeTab === 'backup-checks' && <BackupChecksPage />}
        {activeTab === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}

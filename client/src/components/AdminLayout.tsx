import React, { useState } from 'react';
import CustomersPage from './admin/CustomersPage';
import ProductsPage from './admin/ProductsPage';
import SettingsPage from './admin/SettingsPage';
import SophosPage from './admin/SophosPage';
import UnifiPage from './admin/UnifiPage';
import UserManagement from './UserManagement';
import { logout, type AuthUser } from '../api';

type AdminTab = 'customers' | 'products' | 'unifi' | 'sophos' | 'settings' | 'users';

interface TabDef {
  key: AdminTab;
  label: string;
  adminOnly?: boolean;
}

const ALL_TABS: TabDef[] = [
  { key: 'customers', label: 'Kunden', adminOnly: true },
  { key: 'products', label: 'Produkte', adminOnly: true },
  { key: 'unifi', label: 'UniFi', adminOnly: true },
  { key: 'sophos', label: 'Sophos', adminOnly: true },
  { key: 'settings', label: 'Einstellungen', adminOnly: true },
  { key: 'users', label: 'Benutzer', adminOnly: true },
];

interface Props {
  currentUser: AuthUser;
  onLogout: () => void;
}

export default function AdminLayout({ currentUser, onLogout }: Props) {
  const isAdmin = currentUser.role === 'administrator';
  const visibleTabs = ALL_TABS.filter(t => !t.adminOnly || isAdmin);
  const [activeTab, setActiveTab] = useState<AdminTab>('customers');

  async function handleLogout() {
    try { await logout(); } catch { /* ignore */ }
    onLogout();
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside style={{
        width: '220px', backgroundColor: '#0f172a', borderRight: '1px solid #1e293b',
        padding: '20px 0', flexShrink: 0, display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '0 20px', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '18px', fontWeight: 800, color: '#f1f5f9', margin: 0 }}>Admin</h1>
          <p style={{ color: '#64748b', fontSize: '12px', marginTop: '4px' }}>Version Checker</p>
        </div>

        <nav style={{ flex: 1 }}>
          {visibleTabs.map(tab => (
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

        <div style={{ padding: '0 20px', marginTop: 'auto', paddingBottom: '20px' }}>
          <a
            href="#/"
            style={{
              display: 'block', padding: '8px 12px', borderRadius: '6px',
              backgroundColor: '#1e293b', color: '#94a3b8', textDecoration: 'none',
              fontSize: '13px', textAlign: 'center', border: '1px solid #334155',
              marginBottom: '8px',
            }}
          >
            &larr; Dashboard
          </a>
        </div>
      </aside>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <header style={{
          padding: '12px 40px', borderBottom: '1px solid #1e293b',
          backgroundColor: '#0f172a', display: 'flex',
          justifyContent: 'flex-end', alignItems: 'center', flexShrink: 0,
        }}>
          <span style={{ color: '#94a3b8', fontSize: '13px', marginRight: '16px' }}>
            Angemeldet als:{' '}
            <span style={{ color: '#f1f5f9', fontWeight: 600 }}>
              {currentUser.displayName}
            </span>
            {' '}
            <span style={{
              display: 'inline-block', padding: '1px 6px', borderRadius: '4px', fontSize: '11px',
              backgroundColor: isAdmin ? '#1e3a5f' : '#1e3a2f',
              color: isAdmin ? '#60a5fa' : '#4ade80',
              marginLeft: '4px',
            }}>
              {isAdmin ? 'Administrator' : 'Techniker'}
            </span>
          </span>
          <button
            onClick={handleLogout}
            style={{
              padding: '6px 14px', borderRadius: '6px', border: '1px solid #334155',
              backgroundColor: 'transparent', color: '#94a3b8', fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Abmelden
          </button>
        </header>

        <main style={{ flex: 1, padding: '32px 40px', overflow: 'auto' }}>
          {activeTab === 'customers' && <CustomersPage />}
          {activeTab === 'products' && <ProductsPage />}
          {activeTab === 'unifi' && <UnifiPage />}
          {activeTab === 'sophos' && <SophosPage />}
          {activeTab === 'settings' && <SettingsPage />}
          {activeTab === 'users' && <UserManagement />}
        </main>
      </div>
    </div>
  );
}

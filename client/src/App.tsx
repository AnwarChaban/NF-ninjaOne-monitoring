import React, { useEffect, useState } from 'react';
import { fetchProducts, fetchSettings, getStoredUser, clearAuthSession, apiFetch, type ProductStatus, type AuthUser } from './api';

interface SecretExpiry {
  key: string;
  label: string;
  daysUntilExpiry: number | null;
  isExpired: boolean;
}
import ProductCard from './components/ProductCard';
import AdminLayout from './components/AdminLayout';
import Sidebar from './components/Sidebar';
import BackupPage from './components/BackupPage';
import CustomerOverview from './components/CustomerOverview';
import CustomerDetailPage from './components/CustomerDetailPage';
import SophosDashboard from './components/SophosDashboard';
import Login from './components/Login';

type GroupBy = 'software' | 'kunde';

const REFRESH_INTERVAL = 60_000; // Auto-refresh every 60 seconds

function useHash() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onHashChange = () => setHash(location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  return hash;
}

function Dashboard() {
  const [products, setProducts] = useState<ProductStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [showUpToDateDevices, setShowUpToDateDevices] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>('software');

  async function loadProducts() {
    try {
      const data = await fetchProducts();
      setProducts(data);
      setLastUpdate(new Date());
      setError('');
    } catch (e) {
      setError('Fehler beim Laden der Produkte');
    } finally {
      setLoading(false);
    }
  }

  async function loadSettings() {
    try {
      const settings = await fetchSettings();
      setShowUpToDateDevices(settings.showUpToDateDevices === 'true');
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadProducts();
    loadSettings();

    // Auto-refresh dashboard
    const interval = setInterval(loadProducts, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  function mergeUnifiProducts(inputProducts: ProductStatus[]): ProductStatus[] {
    const unifiKeys = new Set(['unifi-os', 'unifi-network']);
    const hasUnifi = inputProducts.some(product => unifiKeys.has(product.product));
    if (!hasUnifi) return inputProducts;

    const firstUnifiIndex = inputProducts.findIndex(product => unifiKeys.has(product.product));
    const otherProducts = inputProducts.filter(product => !unifiKeys.has(product.product));

    const unifiProductsOrdered = ['unifi-os', 'unifi-network']
      .map(key => inputProducts.find(product => product.product === key))
      .filter((product): product is ProductStatus => !!product);

    const customerMap = new Map<number, ProductStatus['customers'][number]>();

    unifiProductsOrdered.forEach(product => {
      const groupLabel = product.product === 'unifi-os' ? 'UniFi OS' : 'Network App';
      product.customers.forEach(customer => {
        const existing = customerMap.get(customer.id) ?? {
          id: customer.id,
          name: customer.name,
          devices: [],
        };

        existing.devices.push(
          ...customer.devices.map(device => ({
            ...device,
            groupLabel,
          }))
        );

        customerMap.set(customer.id, existing);
      });
    });

    const mergedUnifi: ProductStatus = {
      product: 'unifi',
      productName: 'UniFi',
      latestVersion: '',
      releaseUrl: '',
      checkedAt: new Date().toISOString(),
      error: unifiProductsOrdered.map(product => product.error).filter(Boolean).join(' | ') || undefined,
      customers: Array.from(customerMap.values()),
    };

    const result = [...otherProducts];
    const insertAt = Math.max(0, Math.min(firstUnifiIndex, result.length));
    result.splice(insertAt, 0, mergedUnifi);

    return result;
  }

  const mergedProducts = mergeUnifiProducts(products);
  const totalDevices = mergedProducts.reduce((sum, p) => sum + p.customers.reduce((s, c) => s + c.devices.length, 0), 0);
  const updatesAvailable = mergedProducts.reduce((sum, p) =>
    sum + p.customers.reduce((s, c) =>
      s + c.devices.filter(d => d.status === 'update-available' || d.status === 'major-update').length, 0), 0);
  const productsWithUpdates = mergedProducts.filter(product =>
    product.customers.some(customer =>
      customer.devices.some(device => device.status === 'update-available' || device.status === 'major-update')
    )
  );
  const sortedProducts = [...productsWithUpdates].sort((a, b) => {
    const aOutdated = a.customers.reduce(
      (sum, customer) => sum + customer.devices.filter(device => device.status === 'update-available' || device.status === 'major-update').length,
      0
    );
    const bOutdated = b.customers.reduce(
      (sum, customer) => sum + customer.devices.filter(device => device.status === 'update-available' || device.status === 'major-update').length,
      0
    );

    if (bOutdated !== aOutdated) return bOutdated - aOutdated;

    const aTotal = a.customers.reduce((sum, customer) => sum + customer.devices.length, 0);
    const bTotal = b.customers.reduce((sum, customer) => sum + customer.devices.length, 0);
    if (bTotal !== aTotal) return bTotal - aTotal;

    return a.productName.localeCompare(b.productName, 'de');
  });

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px 16px' }}>
      <header style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#f1f5f9' }}>
              NetFactory Monitoring
            </h1>
            <p style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>
              {totalDevices} Geräte überwacht
              {updatesAvailable > 0 && (
                <span style={{ color: '#fbbf24', marginLeft: '12px' }}>
                  {updatesAvailable} Update(s) verfügbar
                </span>
              )}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {lastUpdate && (
              <span style={{ color: '#64748b', fontSize: '12px' }}>
                Aktualisiert: {lastUpdate.toLocaleTimeString('de-DE')}
              </span>
            )}
          </div>
        </div>

        {/* Toggle: Nach Software / Nach Kunde */}
        <div style={{ display: 'flex', gap: '4px', marginTop: '20px', background: '#0f172a', borderRadius: '8px', padding: '4px', width: 'fit-content' }}>
          {(['software', 'kunde'] as GroupBy[]).map(view => (
            <button
              key={view}
              type="button"
              onClick={() => setGroupBy(view)}
              style={{
                padding: '6px 18px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                backgroundColor: groupBy === view ? '#1e293b' : 'transparent',
                color: groupBy === view ? '#f1f5f9' : '#64748b',
                transition: 'all 0.15s',
              }}
            >
              {view === 'software' ? 'Nach Software' : 'Nach Kunde'}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: '#7f1d1d',
          borderRadius: '8px',
          color: '#fca5a5',
          marginBottom: '16px',
          fontSize: '14px',
        }}>
          {error}
        </div>
      )}

      {groupBy === 'kunde' ? (
        <CustomerOverview embedded />
      ) : loading ? (
        <p style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>Lade Daten...</p>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: '16px',
        }}>
          {sortedProducts.map(product => (
            <ProductCard key={product.product} product={product} showUpToDateDevices={showUpToDateDevices} />
          ))}
          {sortedProducts.length === 0 && (
            <p style={{ color: '#64748b', fontSize: '14px', gridColumn: '1 / -1' }}>
              Keine Updates erforderlich
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ExpiryBanner() {
  const [expiring, setExpiring] = useState<SecretExpiry[]>([]);

  useEffect(() => {
    if (getStoredUser()?.role !== 'administrator') return;
    apiFetch('/api/settings/expiry')
      .then(r => r.ok ? r.json() : [])
      .then((data: SecretExpiry[]) => setExpiring(data.filter(s => s.isExpired || (s.daysUntilExpiry !== null && s.daysUntilExpiry <= 14))))
      .catch(() => {});
  }, []);

  if (expiring.length === 0) return null;

  const msg = expiring.map(s => s.isExpired ? `${s.label} (abgelaufen)` : `${s.label} (${s.daysUntilExpiry}d)`).join(', ');
  return (
    <div style={{
      backgroundColor: expiring.some(s => s.isExpired) ? '#7f1d1d' : '#78350f',
      color: expiring.some(s => s.isExpired) ? '#fca5a5' : '#fbbf24',
      padding: '8px 20px', fontSize: '13px', display: 'flex',
      justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
    }}>
      <span>{expiring.some(s => s.isExpired) ? '❌' : '⚠️'} API-Schlüssel: {msg}</span>
      <a href="#/admin" style={{ color: 'inherit', fontWeight: 700, marginLeft: '16px' }}>→ Einstellungen</a>
    </div>
  );
}

export default function App() {
  const hash = useHash();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => getStoredUser());

  function handleLogin() {
    setCurrentUser(getStoredUser());
  }

  function handleLogout() {
    clearAuthSession();
    setCurrentUser(null);
    location.hash = '#/';
  }

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  const isAdmin = hash.startsWith('#/admin');
  const isBackup = hash.startsWith('#/backup');
  const isSophos = hash.startsWith('#/sophos');

  if (isAdmin) return <AdminLayout currentUser={currentUser} onLogout={handleLogout} />;

  const customerDetailMatch = hash.match(/^#\/customers\/(\d+)$/);
  const customerDetailId = customerDetailMatch ? parseInt(customerDetailMatch[1]) : null;

  const activeView = isBackup ? 'backup' : isSophos ? 'sophos' : 'versions';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <ExpiryBanner />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <Sidebar activeView={activeView} currentUser={currentUser} onLogout={handleLogout} />
      <main style={{ flex: 1, overflowY: 'auto' }}>
        {isBackup && <BackupPage />}
        {isSophos && <SophosDashboard />}
        {!isBackup && !isSophos && customerDetailId !== null && (
          <CustomerDetailPage customerId={customerDetailId} />
        )}
        {!isBackup && !isSophos && customerDetailId === null && <Dashboard />}
      </main>
      </div>
    </div>
  );
}

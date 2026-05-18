import { useEffect, useState } from 'react';
import { fetchCustomerList, type CustomerSummary, type BackupStatus } from '../api';

const REFRESH_INTERVAL = 60_000;

function backupStatusColor(status: BackupStatus | 'none'): string {
  if (status === 'success') return '#22c55e';
  if (status === 'failed' || status === 'missed') return '#ef4444';
  if (status === 'unknown') return '#64748b';
  return '#334155'; // none
}

function backupStatusLabel(status: BackupStatus | 'none'): string {
  if (status === 'success') return 'Backup OK';
  if (status === 'failed') return 'Backup Fehler';
  if (status === 'missed') return 'Backup ausgeblieben';
  if (status === 'unknown') return 'Backup unbekannt';
  return 'Kein Backup';
}

function UpdateBadge({ outdated, total }: { outdated: number; total: number }) {
  if (total === 0) return <span style={{ color: '#475569', fontSize: '12px' }}>Keine Geräte</span>;
  if (outdated === 0) {
    return (
      <span style={{
        display: 'inline-block', padding: '2px 8px', borderRadius: '9999px',
        fontSize: '12px', fontWeight: 600, backgroundColor: '#065f46', color: '#6ee7b7',
      }}>
        Alle aktuell
      </span>
    );
  }
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '9999px',
      fontSize: '12px', fontWeight: 600,
      backgroundColor: '#78350f', color: '#fbbf24',
    }}>
      {outdated} Update{outdated === 1 ? '' : 's'}
    </span>
  );
}

export default function CustomerOverview({ embedded = false }: { embedded?: boolean }) {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    try {
      const data = await fetchCustomerList();
      setCustomers(data);
      setError('');
    } catch {
      setError('Fehler beim Laden der Kunden');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  const totalCustomers = customers.length;
  const customersWithUpdates = customers.filter(c => c.outdatedDevices > 0).length;
  const customersWithBackupIssues = customers.filter(
    c => c.backupStatus === 'failed' || c.backupStatus === 'missed'
  ).length;

  return (
    <div style={embedded ? {} : { maxWidth: '1400px', margin: '0 auto', padding: '32px 16px' }}>
      {!embedded && (
        <header style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#f1f5f9' }}>Kunden</h1>
          <p style={{ color: '#64748b', fontSize: '14px', marginTop: '4px' }}>
            {totalCustomers} Kunden
            {customersWithUpdates > 0 && (
              <span style={{ color: '#fbbf24', marginLeft: '12px' }}>
                {customersWithUpdates} mit offenen Updates
              </span>
            )}
            {customersWithBackupIssues > 0 && (
              <span style={{ color: '#ef4444', marginLeft: '12px' }}>
                {customersWithBackupIssues} mit Backup-Problemen
              </span>
            )}
          </p>
        </header>
      )}

      {error && (
        <div style={{
          padding: '12px 16px', backgroundColor: '#7f1d1d', borderRadius: '8px',
          color: '#fca5a5', marginBottom: '16px', fontSize: '14px',
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>Lade Daten...</p>
      ) : customers.length === 0 ? (
        <p style={{ color: '#64748b', fontSize: '14px' }}>Keine Kunden vorhanden</p>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '12px',
        }}>
          {customers.map(customer => {
            const hasIssue = customer.outdatedDevices > 0 ||
              customer.backupStatus === 'failed' || customer.backupStatus === 'missed';
            const borderColor = customer.outdatedDevices > 0
              ? '#78350f'
              : (customer.backupStatus === 'failed' || customer.backupStatus === 'missed')
                ? '#7f1d1d'
                : '#1e293b';

            return (
              <a
                key={customer.id}
                href={`#/customers/${customer.id}`}
                style={{
                  display: 'block',
                  textDecoration: 'none',
                  backgroundColor: '#1e293b',
                  borderRadius: '10px',
                  padding: '16px',
                  borderLeft: `4px solid ${borderColor}`,
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#263347')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#1e293b')}
              >
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#f1f5f9', marginBottom: '8px' }}>
                  {customer.name}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                  <UpdateBadge outdated={customer.outdatedDevices} total={customer.totalDevices} />
                  {customer.backupStatus !== 'none' && (
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: '9999px',
                      fontSize: '12px', fontWeight: 600,
                      backgroundColor: backupStatusColor(customer.backupStatus) + '22',
                      color: backupStatusColor(customer.backupStatus),
                      border: `1px solid ${backupStatusColor(customer.backupStatus)}44`,
                    }}>
                      {backupStatusLabel(customer.backupStatus)}
                    </span>
                  )}
                </div>

                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  {customer.totalDevices} Gerät{customer.totalDevices === 1 ? '' : 'e'}
                  {!hasIssue && (
                    <span style={{ color: '#22c55e', marginLeft: '8px' }}>Alles in Ordnung</span>
                  )}
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

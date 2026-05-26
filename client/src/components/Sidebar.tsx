import { logout, type AuthUser } from '../api';

type View = 'versions' | 'sophos' | 'backup';

interface SidebarProps {
  activeView: View;
  currentUser: AuthUser | null;
  onLogout: () => void;
}

const navItems: { view: View; label: string; hash: string; icon: string }[] = [
  { view: 'versions', label: 'Versionen', hash: '#/', icon: '📦' },
  { view: 'sophos', label: 'Sophos', hash: '#/sophos', icon: '🔥' },
  { view: 'backup', label: 'Backup', hash: '#/backup', icon: '💾' },
];

export default function Sidebar({ activeView, currentUser, onLogout }: SidebarProps) {
  const isAdmin = currentUser?.role === 'administrator';

  async function handleLogout() {
    try { await logout(); } catch { /* ignore */ }
    onLogout();
  }

  return (
    <aside style={{
      width: '200px',
      backgroundColor: '#0f172a',
      borderRight: '1px solid #1e293b',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      height: '100vh',
      position: 'sticky',
      top: 0,
    }}>
      <div style={{ padding: '24px 20px 16px' }}>
        <div style={{ fontSize: '16px', fontWeight: 800, color: '#f1f5f9' }}>NetFactory</div>
        <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px', fontWeight: 500 }}>Monitoring</div>
      </div>

      <nav style={{ flex: 1 }}>
        {navItems.map(item => {
          const isActive = activeView === item.view;
          return (
            <a
              key={item.view}
              href={item.hash}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 20px',
                textDecoration: 'none',
                fontSize: '14px',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? '#f1f5f9' : '#94a3b8',
                backgroundColor: isActive ? '#1e293b' : 'transparent',
                borderLeft: `3px solid ${isActive ? '#3b82f6' : 'transparent'}`,
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: '16px' }}>{item.icon}</span>
              {item.label}
            </a>
          );
        })}
      </nav>

      <div style={{ padding: '12px 20px', borderTop: '1px solid #1e293b' }}>
        {isAdmin && (
          <a
            href="#/admin"
            style={{
              display: 'block', padding: '7px 12px', borderRadius: '6px',
              backgroundColor: 'transparent', border: '1px solid #334155',
              color: '#64748b', textDecoration: 'none', fontSize: '12px',
              fontWeight: 500, textAlign: 'center', marginBottom: '8px',
            }}
          >
            ⚙ Admin
          </a>
        )}

        {/* Logged-in user + logout */}
        <div style={{
          padding: '8px 10px', borderRadius: '6px', backgroundColor: '#1e293b',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px',
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: '12px', fontWeight: 600, color: '#f1f5f9',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {currentUser?.displayName ?? currentUser?.username}
            </div>
            <div style={{ fontSize: '10px', color: '#475569', marginTop: '1px' }}>
              {currentUser?.role === 'administrator' ? 'Administrator' : 'Techniker'}
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Abmelden"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#64748b', fontSize: '14px', padding: '2px 4px',
              flexShrink: 0, lineHeight: 1,
            }}
          >
            ⏻
          </button>
        </div>
      </div>
    </aside>
  );
}

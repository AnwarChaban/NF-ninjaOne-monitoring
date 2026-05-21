import { getStoredUser } from '../api';

type View = 'versions' | 'sophos' | 'backup';

interface SidebarProps {
  activeView: View;
}

const navItems: { view: View; label: string; hash: string; icon: string }[] = [
  { view: 'versions', label: 'Versionen', hash: '#/', icon: '📦' },
  { view: 'sophos', label: 'Sophos', hash: '#/sophos', icon: '🔥' },
  { view: 'backup', label: 'Backup', hash: '#/backup', icon: '💾' },
];

export default function Sidebar({ activeView }: SidebarProps) {
  const isAdmin = getStoredUser()?.role === 'administrator';
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
      <div style={{ padding: '24px 20px 20px' }}>
        <div style={{ fontSize: '16px', fontWeight: 800, color: '#f1f5f9' }}>Net Factory</div>
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

      {isAdmin && (
        <div style={{ padding: '16px 20px', borderTop: '1px solid #1e293b' }}>
          <a
            href="#/admin"
            style={{
              display: 'block',
              padding: '7px 12px',
              borderRadius: '6px',
              backgroundColor: 'transparent',
              border: '1px solid #334155',
              color: '#64748b',
              textDecoration: 'none',
              fontSize: '12px',
              fontWeight: 500,
              textAlign: 'center',
            }}
          >
            ⚙ Admin
          </a>
        </div>
      )}
    </aside>
  );
}

import React, { useEffect, useState } from 'react';
import {
  fetchUsers, createUser, updateUser, deactivateUser, syncNinjaUsers,
  type ManagedUser,
} from '../api';

const ROLE_LABELS: Record<string, string> = {
  administrator: 'Administrator',
  techniker: 'Techniker',
};

export default function UserManagement() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState<ManagedUser | null>(null);

  const [formUsername, setFormUsername] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<'administrator' | 'techniker'>('techniker');
  const [formPassword, setFormPassword] = useState('');
  const [formRemovePassword, setFormRemovePassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSaving, setFormSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  async function load() {
    try {
      setUsers(await fetchUsers());
      setError('');
    } catch {
      setError('Benutzer konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditUser(null);
    setFormUsername('');
    setFormDisplayName('');
    setFormEmail('');
    setFormRole('techniker');
    setFormPassword('');
    setFormRemovePassword(false);
    setFormError('');
    setShowForm(true);
  }

  function openEdit(u: ManagedUser) {
    setEditUser(u);
    setFormUsername(u.username);
    setFormDisplayName(u.displayName);
    setFormEmail(u.email ?? '');
    setFormRole(u.role);
    setFormPassword('');
    setFormRemovePassword(false);
    setFormError('');
    setShowForm(true);
  }

  async function handleSave() {
    if (!formUsername.trim() || !formDisplayName.trim()) {
      setFormError('Alle Felder sind erforderlich');
      return;
    }
    setFormSaving(true);
    setFormError('');
    try {
      if (editUser) {
        await updateUser(editUser.id, {
          username: formUsername.trim(),
          display_name: formDisplayName.trim(),
          role: formRole,
          email: formEmail.trim() || undefined,
          ...(formPassword ? { password: formPassword } : {}),
          ...(formRemovePassword && !formPassword ? { remove_password: true } : {}),
        });
      } else {
        await createUser({
          username: formUsername.trim(),
          display_name: formDisplayName.trim(),
          role: formRole,
          email: formEmail.trim() || undefined,
          ...(formRole === 'administrator' && formPassword ? { password: formPassword } : {}),
        });
      }
      setShowForm(false);
      load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setFormSaving(false);
    }
  }

  async function handleNinjaSync() {
    setSyncing(true);
    setSyncMsg('');
    try {
      const r = await syncNinjaUsers();
      setSyncMsg(`✓ ${r.synced} gefunden · ${r.created} neu · ${r.updated} aktualisiert`);
      load();
    } catch (e) {
      setSyncMsg(`Fehler: ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  }

  async function handleDeactivate(u: ManagedUser) {
    if (!confirm(`Benutzer "${u.displayName}" deaktivieren?`)) return;
    try {
      await deactivateUser(u.id);
      load();
    } catch {
      setError('Fehler beim Deaktivieren');
    }
  }

  async function handleReactivate(u: ManagedUser) {
    try {
      await updateUser(u.id, { active: true });
      load();
    } catch {
      setError('Fehler beim Reaktivieren');
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: '6px',
    backgroundColor: '#0f172a', border: '1px solid #334155',
    color: '#f1f5f9', fontSize: '14px', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', color: '#94a3b8', fontSize: '12px', marginBottom: '4px',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#f1f5f9', margin: 0 }}>
          Benutzerverwaltung
        </h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {syncMsg && (
            <span style={{ fontSize: '12px', color: syncMsg.startsWith('Fehler') ? '#f87171' : '#4ade80' }}>
              {syncMsg}
            </span>
          )}
          <button
            onClick={handleNinjaSync}
            disabled={syncing}
            style={{
              padding: '8px 16px', borderRadius: '6px', border: '1px solid #334155',
              backgroundColor: 'transparent', color: '#94a3b8', fontSize: '13px',
              fontWeight: 600, cursor: syncing ? 'not-allowed' : 'pointer',
            }}
          >
            {syncing ? '⟳ Sync...' : '↓ NinjaOne User Sync'}
          </button>
          <button
            onClick={openCreate}
            style={{
              padding: '8px 16px', borderRadius: '6px', border: 'none',
              backgroundColor: '#3b82f6', color: '#fff', fontSize: '14px',
              fontWeight: 600, cursor: 'pointer',
            }}
          >
            + Neuer Benutzer
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          padding: '10px 14px', backgroundColor: '#7f1d1d', borderRadius: '6px',
          color: '#fca5a5', fontSize: '13px', marginBottom: '16px',
        }}>
          {error}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }}>
          <div style={{
            backgroundColor: '#1e293b', borderRadius: '10px', padding: '28px 32px',
            width: '400px', border: '1px solid #334155',
          }}>
            <h3 style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: 700, margin: '0 0 20px' }}>
              {editUser ? 'Benutzer bearbeiten' : 'Neuer Benutzer'}
            </h3>

            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Benutzername (Login)</label>
              <input
                value={formUsername}
                onChange={e => setFormUsername(e.target.value)}
                placeholder="z.B. max.mustermann"
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Anzeigename</label>
              <input
                value={formDisplayName}
                onChange={e => setFormDisplayName(e.target.value)}
                placeholder="z.B. Max Mustermann"
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>
                E-Mail-Adresse{' '}
                <span style={{ color: '#475569', fontWeight: 400 }}>(für NinjaOne Auto-Login)</span>
              </label>
              <input
                type="email"
                value={formEmail}
                onChange={e => setFormEmail(e.target.value)}
                placeholder="z.B. max.mustermann@net-factory.de"
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: formRole === 'administrator' ? '14px' : '20px' }}>
              <label style={labelStyle}>Rolle</label>
              <select
                value={formRole}
                onChange={e => setFormRole(e.target.value as 'administrator' | 'techniker')}
                style={inputStyle}
              >
                <option value="techniker">Techniker</option>
                <option value="administrator">Administrator</option>
              </select>
            </div>

            {formRole === 'administrator' && (
              <div style={{ marginBottom: '20px' }}>
                <label style={labelStyle}>
                  {editUser
                    ? editUser.hasPassword ? 'Neues Kennwort (leer = unverändert)' : 'Kennwort setzen (optional)'
                    : 'Kennwort (optional)'}
                </label>
                <input
                  type="password"
                  value={formPassword}
                  onChange={e => { setFormPassword(e.target.value); if (e.target.value) setFormRemovePassword(false); }}
                  placeholder="Kennwort eingeben..."
                  style={inputStyle}
                />
                {editUser?.hasPassword && !formPassword && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formRemovePassword}
                      onChange={e => setFormRemovePassword(e.target.checked)}
                    />
                    <span style={{ color: '#f87171', fontSize: '12px' }}>Kennwort entfernen</span>
                  </label>
                )}
              </div>
            )}

            {formError && (
              <p style={{
                color: '#fca5a5', fontSize: '13px', backgroundColor: '#7f1d1d',
                padding: '8px 10px', borderRadius: '5px', marginBottom: '14px',
              }}>
                {formError}
              </p>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowForm(false)}
                style={{
                  padding: '8px 16px', borderRadius: '6px', border: '1px solid #334155',
                  backgroundColor: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '14px',
                }}
              >
                Abbrechen
              </button>
              <button
                onClick={handleSave}
                disabled={formSaving}
                style={{
                  padding: '8px 16px', borderRadius: '6px', border: 'none',
                  backgroundColor: formSaving ? '#1e40af' : '#3b82f6',
                  color: '#fff', cursor: formSaving ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 600,
                }}
              >
                {formSaving ? 'Speichern...' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Table */}
      {loading ? (
        <p style={{ color: '#64748b', fontSize: '14px' }}>Lade Benutzer...</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #334155' }}>
              {['Anzeigename', 'Benutzername', 'E-Mail', 'NinjaOne', 'Rolle', 'Kennwort', 'Erstellt am', 'Status', ''].map(h => (
                <th key={h} style={{
                  textAlign: 'left', padding: '8px 12px', color: '#64748b',
                  fontSize: '12px', fontWeight: 600, textTransform: 'uppercase',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{
                borderBottom: '1px solid #1e293b',
                opacity: u.active ? 1 : 0.5,
              }}>
                <td style={{ padding: '10px 12px', color: '#f1f5f9', fontWeight: 500 }}>
                  {u.displayName}
                </td>
                <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{u.username}</td>
                <td style={{ padding: '10px 12px', color: u.email ? '#60a5fa' : '#334155', fontSize: '13px' }}>
                  {u.email ?? '—'}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  {u.ninjaUid ? (
                    <span style={{
                      display: 'inline-block', padding: '2px 7px', borderRadius: '4px',
                      fontSize: '11px', backgroundColor: '#14532d', color: '#4ade80',
                    }}>
                      ✓ Verknüpft
                    </span>
                  ) : (
                    <span style={{ fontSize: '12px', color: '#334155' }}>—</span>
                  )}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '12px',
                    backgroundColor: u.role === 'administrator' ? '#1e3a5f' : '#1e3a2f',
                    color: u.role === 'administrator' ? '#60a5fa' : '#4ade80',
                  }}>
                    {ROLE_LABELS[u.role] ?? u.role}
                  </span>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  {u.role === 'administrator' ? (
                    <span style={{ fontSize: '12px', color: u.hasPassword ? '#4ade80' : '#64748b' }}>
                      {u.hasPassword ? '●●●●●●' : '—'}
                    </span>
                  ) : (
                    <span style={{ fontSize: '12px', color: '#334155' }}>—</span>
                  )}
                </td>
                <td style={{ padding: '10px 12px', color: '#64748b' }}>
                  {new Date(u.createdAt).toLocaleDateString('de-DE')}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <span style={{ color: u.active ? '#4ade80' : '#ef4444', fontSize: '12px' }}>
                    {u.active ? 'Aktiv' : 'Inaktiv'}
                  </span>
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => openEdit(u)}
                      style={{
                        padding: '4px 10px', borderRadius: '4px', border: '1px solid #334155',
                        backgroundColor: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '12px',
                      }}
                    >
                      Bearbeiten
                    </button>
                    {u.active ? (
                      <button
                        onClick={() => handleDeactivate(u)}
                        style={{
                          padding: '4px 10px', borderRadius: '4px', border: '1px solid #7f1d1d',
                          backgroundColor: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: '12px',
                        }}
                      >
                        Deaktivieren
                      </button>
                    ) : (
                      <button
                        onClick={() => handleReactivate(u)}
                        style={{
                          padding: '4px 10px', borderRadius: '4px', border: '1px solid #166534',
                          backgroundColor: 'transparent', color: '#4ade80', cursor: 'pointer', fontSize: '12px',
                        }}
                      >
                        Reaktivieren
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

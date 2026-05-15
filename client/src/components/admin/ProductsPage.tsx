import React, { useEffect, useState } from 'react';
import {
  fetchScraperProducts, updateScraperProduct, deleteScraperProduct,
  fetchCustomProducts, createCustomProduct, updateCustomProduct, deleteCustomProduct,
  type ScraperProduct, type CustomProduct,
} from '../../api';

const inputStyle: React.CSSProperties = {
  padding: '8px 12px', backgroundColor: '#1e293b', border: '1px solid #334155',
  borderRadius: '6px', color: '#f1f5f9', fontSize: '14px', outline: 'none',
};
const btnStyle: React.CSSProperties = {
  padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer',
  fontSize: '13px', fontWeight: 600,
};
const primaryBtn: React.CSSProperties = { ...btnStyle, backgroundColor: '#3b82f6', color: '#fff' };
const dangerBtn: React.CSSProperties = { ...btnStyle, backgroundColor: '#7f1d1d', color: '#fca5a5' };
const ghostBtn: React.CSSProperties = { ...btnStyle, backgroundColor: 'transparent', color: '#94a3b8', border: '1px solid #334155' };

export default function ProductsPage() {
  const [scrapers, setScrapers] = useState<ScraperProduct[]>([]);
  const [customs, setCustoms] = useState<CustomProduct[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ id: '', name: '', latestVersion: '', releaseUrl: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', latestVersion: '', releaseUrl: '' });
  const [editingScraperId, setEditingScraperId] = useState<string | null>(null);
  const [editScraperForm, setEditScraperForm] = useState({ name: '', latestVersion: '', releaseUrl: '' });

  async function load() {
    const [s, c] = await Promise.all([fetchScraperProducts(), fetchCustomProducts()]);
    setScrapers(s);
    setCustoms(c);
  }

  useEffect(() => { load(); }, []);

  async function handleToggleScraper(product: string, active: boolean) {
    await updateScraperProduct(product, active);
    load();
  }

  async function handleUpdateScraper(product: string) {
    if (!editScraperForm.name.trim()) return;
    await updateScraperProduct(product, {
      name: editScraperForm.name.trim(),
      latestVersion: editScraperForm.latestVersion.trim() || undefined,
      releaseUrl: editScraperForm.releaseUrl.trim() || undefined,
    });
    setEditingScraperId(null);
    load();
  }

  async function handleDeleteScraper(product: string) {
    if (!confirm(`Produkt "${product}" löschen? Alle zugehörigen Gerätedaten werden ebenfalls gelöscht.`)) return;
    await deleteScraperProduct(product);
    load();
  }

  async function handleCreateCustom() {
    if (!form.id || !form.name || !form.latestVersion) return;
    await createCustomProduct(form);
    setForm({ id: '', name: '', latestVersion: '', releaseUrl: '' });
    setShowForm(false);
    load();
  }

  async function handleUpdateCustom(id: string) {
    await updateCustomProduct(id, editForm);
    setEditingId(null);
    load();
  }

  async function handleDeleteCustom(id: string) {
    if (!confirm('Custom-Produkt löschen?')) return;
    await deleteCustomProduct(id);
    load();
  }

  return (
    <div>
      <h2 style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: 700, marginBottom: '24px' }}>Produkte</h2>

      {/* Scraper Products */}
      <h3 style={{ color: '#94a3b8', fontSize: '14px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
        Scraper-Produkte
      </h3>
      <div style={{ backgroundColor: '#1e293b', borderRadius: '10px', padding: '16px', marginBottom: '32px' }}>
        {scrapers.map(s => (
          <div key={s.product} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 0', borderBottom: '1px solid #334155', gap: '12px',
          }}>
            {/* Name / Edit */}
            {editingScraperId === s.product ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ color: '#64748b', fontSize: '11px', marginBottom: '3px' }}>Name</div>
                  <input
                    style={{ ...inputStyle, width: '180px' }}
                    value={editScraperForm.name}
                    onChange={e => setEditScraperForm(f => ({ ...f, name: e.target.value }))}
                    autoFocus
                  />
                </div>
                <div>
                  <div style={{ color: '#64748b', fontSize: '11px', marginBottom: '3px' }}>Version</div>
                  <input
                    style={{ ...inputStyle, width: '120px' }}
                    placeholder={s.latestVersion || 'z.B. 1.0.0'}
                    value={editScraperForm.latestVersion}
                    onChange={e => setEditScraperForm(f => ({ ...f, latestVersion: e.target.value }))}
                  />
                </div>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <div style={{ color: '#64748b', fontSize: '11px', marginBottom: '3px' }}>Release-URL</div>
                  <input
                    style={{ ...inputStyle, width: '100%' }}
                    placeholder={s.releaseUrl || 'https://...'}
                    value={editScraperForm.releaseUrl}
                    onChange={e => setEditScraperForm(f => ({ ...f, releaseUrl: e.target.value }))}
                  />
                </div>
                <div style={{ display: 'flex', gap: '6px', alignSelf: 'flex-end' }}>
                  <button style={{ ...primaryBtn, padding: '6px 12px', fontSize: '12px' }} onClick={() => handleUpdateScraper(s.product)}>Speichern</button>
                  <button style={{ ...ghostBtn, padding: '6px 10px', fontSize: '12px' }} onClick={() => setEditingScraperId(null)}>✕</button>
                </div>
              </div>
            ) : (
              <div>
                <span style={{ color: '#f1f5f9', fontSize: '14px', fontWeight: 500 }}>{s.name}</span>
                <span style={{ color: '#64748b', fontSize: '12px', marginLeft: '8px' }}>({s.product})</span>
              </div>
            )}

            {/* Actions */}
            {editingScraperId !== s.product && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <span style={{ color: s.active ? '#6ee7b7' : '#64748b', fontSize: '13px' }}>
                    {s.active ? 'Aktiv' : 'Inaktiv'}
                  </span>
                  <div
                    onClick={() => handleToggleScraper(s.product, !s.active)}
                    style={{
                      width: '44px', height: '24px', borderRadius: '12px',
                      backgroundColor: s.active ? '#065f46' : '#374151',
                      position: 'relative', transition: 'background-color 0.2s', cursor: 'pointer',
                    }}
                  >
                    <div style={{
                      width: '18px', height: '18px', borderRadius: '50%',
                      backgroundColor: '#fff', position: 'absolute', top: '3px',
                      left: s.active ? '23px' : '3px', transition: 'left 0.2s',
                    }} />
                  </div>
                </label>
                <button
                  style={{ ...ghostBtn, padding: '4px 10px', fontSize: '12px' }}
                  onClick={() => { setEditingScraperId(s.product); setEditScraperForm({ name: s.name, latestVersion: s.latestVersion, releaseUrl: s.releaseUrl }); }}
                >
                  Bearbeiten
                </button>
                <button
                  style={{ ...dangerBtn, padding: '4px 10px', fontSize: '12px' }}
                  onClick={() => handleDeleteScraper(s.product)}
                >
                  Löschen
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Custom Products */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ color: '#94a3b8', fontSize: '14px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>
          Custom-Produkte
        </h3>
        <button style={primaryBtn} onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Abbrechen' : '+ Neues Produkt'}
        </button>
      </div>

      {showForm && (
        <div style={{
          backgroundColor: '#1e293b', borderRadius: '10px', padding: '20px', marginBottom: '16px',
          display: 'flex', gap: '8px', flexWrap: 'wrap',
        }}>
          <input style={inputStyle} placeholder="ID (z.B. my-product)" value={form.id}
            onChange={e => setForm({ ...form, id: e.target.value })} />
          <input style={inputStyle} placeholder="Name" value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })} />
          <input style={inputStyle} placeholder="Version (z.B. 1.0.0)" value={form.latestVersion}
            onChange={e => setForm({ ...form, latestVersion: e.target.value })} />
          <input style={{ ...inputStyle, flex: 1 }} placeholder="Release-URL (optional)" value={form.releaseUrl}
            onChange={e => setForm({ ...form, releaseUrl: e.target.value })} />
          <button style={primaryBtn} onClick={handleCreateCustom}>Erstellen</button>
        </div>
      )}

      <div style={{ backgroundColor: '#1e293b', borderRadius: '10px', padding: '16px' }}>
        {customs.length === 0 ? (
          <p style={{ color: '#64748b', textAlign: 'center', padding: '20px' }}>Keine Custom-Produkte vorhanden.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #334155' }}>
                <th style={{ textAlign: 'left', padding: '8px', color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>ID</th>
                <th style={{ textAlign: 'left', padding: '8px', color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>Name</th>
                <th style={{ textAlign: 'left', padding: '8px', color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>Version</th>
                <th style={{ textAlign: 'left', padding: '8px', color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>URL</th>
                <th style={{ textAlign: 'right', padding: '8px', color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {customs.map(cp => (
                <tr key={cp.id} style={{ borderBottom: '1px solid #0f172a' }}>
                  {editingId === cp.id ? (
                    <>
                      <td style={{ padding: '8px', color: '#64748b', fontSize: '14px' }}>{cp.id}</td>
                      <td style={{ padding: '8px' }}>
                        <input style={{ ...inputStyle, width: '100%' }} value={editForm.name}
                          onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                      </td>
                      <td style={{ padding: '8px' }}>
                        <input style={{ ...inputStyle, width: '100%' }} value={editForm.latestVersion}
                          onChange={e => setEditForm({ ...editForm, latestVersion: e.target.value })} />
                      </td>
                      <td style={{ padding: '8px' }}>
                        <input style={{ ...inputStyle, width: '100%' }} value={editForm.releaseUrl}
                          onChange={e => setEditForm({ ...editForm, releaseUrl: e.target.value })} />
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                          <button style={primaryBtn} onClick={() => handleUpdateCustom(cp.id)}>OK</button>
                          <button style={ghostBtn} onClick={() => setEditingId(null)}>X</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{ padding: '8px', color: '#64748b', fontSize: '14px', fontFamily: 'monospace' }}>{cp.id}</td>
                      <td style={{ padding: '8px', color: '#e2e8f0', fontSize: '14px' }}>{cp.name}</td>
                      <td style={{ padding: '8px', color: '#94a3b8', fontSize: '14px', fontFamily: 'monospace' }}>{cp.latestVersion}</td>
                      <td style={{ padding: '8px', color: '#60a5fa', fontSize: '13px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cp.releaseUrl && <a href={cp.releaseUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa' }}>{cp.releaseUrl}</a>}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                          <button style={ghostBtn} onClick={() => { setEditingId(cp.id); setEditForm({ name: cp.name, latestVersion: cp.latestVersion, releaseUrl: cp.releaseUrl }); }}>Bearbeiten</button>
                          <button style={dangerBtn} onClick={() => handleDeleteCustom(cp.id)}>Löschen</button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import {
  fetchCustomers, createCustomer, updateCustomer, deleteCustomer,
  createDevice, updateDevice, deleteDevice,
  fetchScraperProducts, fetchCustomProducts, triggerNinjaSync,
  type Customer, type CustomerDevice, type ScraperProduct, type CustomProduct,
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
const deviceTableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', marginBottom: '12px', tableLayout: 'fixed' };
const truncateCellStyle: React.CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

interface GroupedDevice {
  key: string;
  name: string;
  orgId?: number;
  ninjaDeviceId?: number;
  entries: CustomerDevice[];
}

function isUnknownEntry(device: CustomerDevice): boolean {
  if (!device.product) return false;
  return device.product.toLowerCase() === 'unknown' && device.currentVersion.toLowerCase() === 'unknown';
}

function groupDevices(devices: CustomerDevice[]): GroupedDevice[] {
  const map = new Map<string, GroupedDevice>();

  for (const device of devices) {
    const key = device.ninjaDeviceId
      ? `ninja:${device.orgId ?? 0}:${device.ninjaDeviceId}`
      : `name:${device.name.toLowerCase()}`;

    if (!map.has(key)) {
      map.set(key, {
        key,
        name: device.name,
        orgId: device.orgId,
        ninjaDeviceId: device.ninjaDeviceId,
        entries: [],
      });
    }

    map.get(key)!.entries.push(device);
  }

  return [...map.values()]
    .map(group => {
      const hasKnownEntries = group.entries.some(entry => !isUnknownEntry(entry));
      const normalizedEntries = hasKnownEntries
        ? group.entries.filter(entry => !isUnknownEntry(entry))
        : group.entries;

      return {
        ...group,
        entries: [...normalizedEntries].sort((a, b) => (a.product ?? '').localeCompare(b.product ?? '')),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<{ id: number; name: string } | null>(null);
  const [expandedCustomers, setExpandedCustomers] = useState<Record<number, boolean>>({});
  const [addingDevice, setAddingDevice] = useState<number | null>(null);
  const [deviceForm, setDeviceForm] = useState<{ name: string; versions: Record<string, string> }>({ name: '', versions: {} });
  const [editingDevice, setEditingDevice] = useState<(CustomerDevice & { customerId: number }) | null>(null);
  const [expandedDevices, setExpandedDevices] = useState<Record<string, boolean>>({});
  const [isSyncingNinja, setIsSyncingNinja] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const hasAutoSyncedRef = useRef(false);
  const [addingProductForDevice, setAddingProductForDevice] = useState<{
    customerId: number;
    groupKey: string;
    deviceName: string;
    orgId?: number;
    ninjaDeviceId?: number;
    product: string;
    currentVersion: string;
  } | null>(null);

  async function load() {
    const [c, sp, cp] = await Promise.all([
      fetchCustomers().catch(() => [] as typeof customers),
      fetchScraperProducts().catch(() => [] as ScraperProduct[]),
      fetchCustomProducts().catch(() => [] as CustomProduct[]),
    ]);
    setCustomers(c);
    setProducts([...sp.map(p => p.product), ...cp.map(p => p.id)]);
  }

  function toggleExpandedDevice(key: string) {
    setExpandedDevices(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleExpandedCustomer(customerId: number) {
    setExpandedCustomers(prev => ({ ...prev, [customerId]: !prev[customerId] }));
  }

  async function handleNinjaSync() {
    setIsSyncingNinja(true);
    setSyncMessage(null);
    try {
      const result = await triggerNinjaSync();
      setSyncMessage(`Synchronisiert: ${result.customers} Kunden, ${result.devices} Produkt-Einträge`);
      await load();
    } catch (error) {
      setSyncMessage((error as Error).message || 'NinjaOne-Sync fehlgeschlagen');
    } finally {
      setIsSyncingNinja(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreateCustomer() {
    if (!newName.trim()) return;
    await createCustomer(newName.trim());
    setNewName('');
    load();
  }

  async function handleUpdateCustomer() {
    if (!editingCustomer || !editingCustomer.name.trim()) return;
    await updateCustomer(editingCustomer.id, editingCustomer.name.trim());
    setEditingCustomer(null);
    load();
  }

  async function handleDeleteCustomer(id: number) {
    if (!confirm('Kunde und alle Geräte löschen?')) return;
    await deleteCustomer(id);
    load();
  }

  async function handleCreateDevice(customerId: number) {
    const selectedEntries = Object.entries(deviceForm.versions)
      .map(([product, currentVersion]) => ({ product, currentVersion: currentVersion.trim() }))
      .filter(entry => !!entry.currentVersion);

    if (!deviceForm.name.trim() || selectedEntries.length === 0) return;

    await Promise.all(
      selectedEntries.map(entry =>
        createDevice(customerId, {
          name: deviceForm.name.trim(),
          product: entry.product,
          currentVersion: entry.currentVersion,
        })
      )
    );

    setAddingDevice(null);
    setDeviceForm({ name: '', versions: {} });
    load();
  }

  function toggleDeviceProduct(product: string) {
    setDeviceForm(prev => {
      if (prev.versions[product] !== undefined) {
        const nextVersions = { ...prev.versions };
        delete nextVersions[product];
        return { ...prev, versions: nextVersions };
      }
      return { ...prev, versions: { ...prev.versions, [product]: '' } };
    });
  }

  function setDeviceProductVersion(product: string, version: string) {
    setDeviceForm(prev => ({
      ...prev,
      versions: {
        ...prev.versions,
        [product]: version,
      },
    }));
  }

  async function handleUpdateDevice() {
    if (!editingDevice) return;
    await updateDevice(editingDevice.id, {
      name: editingDevice.name,
      product: editingDevice.product,
      currentVersion: editingDevice.currentVersion,
    });
    setEditingDevice(null);
    load();
  }

  async function handleDeleteDevice(id: number) {
    if (!confirm('Gerät löschen?')) return;
    await deleteDevice(id);
    load();
  }

  async function handleCreateAdditionalProduct() {
    if (!addingProductForDevice) return;
    if (!addingProductForDevice.product || !addingProductForDevice.currentVersion.trim()) return;

    await createDevice(addingProductForDevice.customerId, {
      name: addingProductForDevice.deviceName,
      product: addingProductForDevice.product,
      currentVersion: addingProductForDevice.currentVersion.trim(),
      orgId: addingProductForDevice.orgId,
      ninjaDeviceId: addingProductForDevice.ninjaDeviceId,
    });

    setAddingProductForDevice(null);
    load();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '12px', flexWrap: 'wrap' }}>
        <h2 style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: 700, margin: 0 }}>Kunden & Geräte</h2>
        <button style={primaryBtn} onClick={handleNinjaSync} disabled={isSyncingNinja}>
          {isSyncingNinja ? 'NinjaOne Sync läuft...' : 'NinjaOne jetzt synchronisieren'}
        </button>
      </div>
      {syncMessage && (
        <div style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '12px' }}>{syncMessage}</div>
      )}

      {/* Add Customer */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          placeholder="Neuer Kundenname..."
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreateCustomer()}
        />
        <button style={primaryBtn} onClick={handleCreateCustomer}>Kunde hinzufügen</button>
      </div>

      {/* Customer List */}
      {customers.map(customer => {
        const groupedDevices = groupDevices(customer.devices);
        const isCustomerExpanded = !!expandedCustomers[customer.id] || editingCustomer?.id === customer.id;

        return (
          <div key={customer.id} style={{
            backgroundColor: '#1e293b', borderRadius: '10px', padding: '20px', marginBottom: '16px',
          }}>
          {/* Customer Header */}
          {editingCustomer?.id === customer.id ? (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <input
                style={{ ...inputStyle, flex: 1 }}
                value={editingCustomer.name}
                onChange={e => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && handleUpdateCustomer()}
              />
              <button style={primaryBtn} onClick={handleUpdateCustomer}>Speichern</button>
              <button style={ghostBtn} onClick={() => setEditingCustomer(null)}>Abbrechen</button>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: isCustomerExpanded ? '12px' : 0,
                cursor: 'pointer',
                padding: '2px 0',
              }}
              onClick={() => toggleExpandedCustomer(customer.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f1f5f9', fontSize: '16px', fontWeight: 600 }}>
                <span style={{ color: '#94a3b8', fontSize: '13px' }}>{isCustomerExpanded ? '▾' : '▸'}</span>
                <span>{customer.name}</span>
                <span style={{ color: '#64748b', fontSize: '13px', fontWeight: 400, marginLeft: '8px' }}>
                  ({groupedDevices.length} Geräte)
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }} onClick={e => e.stopPropagation()}>
                <button style={ghostBtn} onClick={() => setEditingCustomer({ id: customer.id, name: customer.name })}>Bearbeiten</button>
                <button style={dangerBtn} onClick={() => handleDeleteCustomer(customer.id)}>Löschen</button>
              </div>
            </div>
          )}

          {/* Devices Table */}
          {isCustomerExpanded && groupedDevices.length > 0 && (
            <table style={deviceTableStyle}>
              <colgroup>
                <col style={{ width: '36%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '26%' }} />
                <col style={{ width: '28%' }} />
              </colgroup>
              <thead>
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <th style={{ textAlign: 'left', padding: '8px', color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>Gerät</th>
                  <th style={{ textAlign: 'left', padding: '8px', color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>Produkte</th>
                  <th style={{ textAlign: 'left', padding: '8px', color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>Details</th>
                  <th style={{ textAlign: 'right', padding: '8px', color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {groupedDevices.map(group => {
                  const isExpanded = !!expandedDevices[group.key];
                  const availableProductsForAdd = products.filter(p => !group.entries.some(entry => entry.product === p));

                  return (
                    <React.Fragment key={group.key}>
                    <tr style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '8px' }}>
                        <button
                          style={{ ...ghostBtn, padding: '4px 10px', fontSize: '12px' }}
                          onClick={() => toggleExpandedDevice(group.key)}
                        >
                          {isExpanded ? '▾' : '▸'} {group.name}
                        </button>
                      </td>
                      <td style={{ padding: '8px', color: '#94a3b8', fontSize: '14px' }}>{group.entries.some(e => !isUnknownEntry(e)) ? group.entries.length : 0}</td>
                      <td style={{ ...truncateCellStyle, padding: '8px', color: '#94a3b8', fontSize: '13px' }}>
                        {group.orgId ? `Org ${group.orgId}` : 'Manuell'}{group.ninjaDeviceId ? ` · Device ${group.ninjaDeviceId}` : ''}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                          <button
                            style={ghostBtn}
                            onClick={() => setAddingProductForDevice({
                              customerId: customer.id,
                              groupKey: group.key,
                              deviceName: group.name,
                              orgId: group.orgId,
                              ninjaDeviceId: group.ninjaDeviceId,
                              product: '',
                              currentVersion: '',
                            })}
                          >
                            + Produkt
                          </button>
                          <button style={dangerBtn} onClick={() => {
                            if (!confirm('Alle Produkt-Einträge für dieses Gerät löschen?')) return;
                            Promise.all(group.entries.map(entry => deleteDevice(entry.id))).then(() => load());
                          }}>Gerät löschen</button>
                        </div>
                      </td>
                    </tr>

                    {addingProductForDevice?.groupKey === group.key && (
                      <tr style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '8px', color: '#94a3b8', fontSize: '13px' }}>
                          Neues Produkt für {group.name}
                          <div style={{ marginTop: '6px', color: '#64748b', fontSize: '12px' }}>
                            Vorhanden: {group.entries.some(e => !isUnknownEntry(e)) ? group.entries.map(e => `${e.product ?? 'Nicht erfasst'}${e.currentVersion ? ` (${e.currentVersion})` : ''}`).join(', ') : 'keine'}
                          </div>
                        </td>
                        <td style={{ padding: '8px' }}>
                          <select
                            style={{ ...inputStyle, width: '100%' }}
                            value={addingProductForDevice.product}
                            onChange={e => setAddingProductForDevice({ ...addingProductForDevice, product: e.target.value })}
                          >
                            <option value="">Produkt wählen...</option>
                            {availableProductsForAdd.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                          {availableProductsForAdd.length === 0 && (
                            <div style={{ marginTop: '6px', color: '#64748b', fontSize: '12px' }}>Alle Produkte bereits vorhanden.</div>
                          )}
                        </td>
                        <td style={{ padding: '8px' }}>
                          <input
                            style={{ ...inputStyle, width: '100%' }}
                            placeholder="Version"
                            value={addingProductForDevice.currentVersion}
                            onChange={e => setAddingProductForDevice({ ...addingProductForDevice, currentVersion: e.target.value })}
                          />
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                            <button style={primaryBtn} onClick={handleCreateAdditionalProduct}>Speichern</button>
                            <button style={ghostBtn} onClick={() => setAddingProductForDevice(null)}>Abbrechen</button>
                          </div>
                        </td>
                      </tr>
                    )}

                    {isExpanded && group.entries.map(device => (
                      <tr key={device.id} style={{ borderBottom: '1px solid #1e293b' }}>
                        {editingDevice?.id === device.id ? (
                          <>
                            <td style={{ padding: '8px 8px 8px 24px', color: '#64748b', fontSize: '13px' }}>↳ {group.name}</td>
                            <td style={{ padding: '8px' }}>
                              <select style={{ ...inputStyle, width: '100%' }} value={editingDevice.product}
                                onChange={e => setEditingDevice({ ...editingDevice, product: e.target.value })}>
                                {products.map(p => <option key={p} value={p}>{p}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: '8px' }}>
                              <input style={{ ...inputStyle, width: '100%' }} value={editingDevice.currentVersion}
                                onChange={e => setEditingDevice({ ...editingDevice, currentVersion: e.target.value })} />
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                <button style={primaryBtn} onClick={handleUpdateDevice}>OK</button>
                                <button style={ghostBtn} onClick={() => setEditingDevice(null)}>X</button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td style={{ padding: '8px 8px 8px 24px', color: '#64748b', fontSize: '13px' }}>↳ {group.name}</td>
                            <td style={{ padding: '8px', color: device.product ? '#94a3b8' : '#475569', fontSize: '14px', fontStyle: device.product ? 'normal' : 'italic' }}>{device.product ?? 'Nicht erfasst'}</td>
                            <td style={{ padding: '8px', color: '#94a3b8', fontSize: '14px', fontFamily: 'monospace' }}>{device.currentVersion}</td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                <button style={ghostBtn} onClick={() => setEditingDevice({ ...device, customerId: customer.id })}>Bearbeiten</button>
                                <button style={dangerBtn} onClick={() => handleDeleteDevice(device.id)}>Löschen</button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </React.Fragment>
                )})}
              </tbody>
            </table>
          )}

          {isCustomerExpanded && groupedDevices.length === 0 && (
            <p style={{ color: '#64748b', margin: '8px 0 12px 0' }}>Keine Geräte vorhanden.</p>
          )}

          {/* Add Device */}
          {isCustomerExpanded && addingDevice === customer.id ? (
            <div style={{ display: 'grid', gap: '12px' }}>
              <input style={{ ...inputStyle, maxWidth: '360px' }} placeholder="Gerätename" value={deviceForm.name}
                onChange={e => setDeviceForm({ ...deviceForm, name: e.target.value })} />

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(220px, 320px) minmax(220px, 1fr)',
                gap: '8px 16px',
                alignItems: 'center',
              }}>
                <div style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>Produkt</div>
                <div style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 600 }}>Version</div>
                {products.map(p => {
                  const selected = deviceForm.versions[p] !== undefined;
                  return (
                    <React.Fragment key={p}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#e2e8f0', fontSize: '14px' }}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleDeviceProduct(p)}
                        />
                        {p}
                      </label>
                      <input
                        style={{ ...inputStyle, width: '100%' }}
                        placeholder="Version (z.B. 7.2.1)"
                        value={selected ? deviceForm.versions[p] : ''}
                        onChange={e => setDeviceProductVersion(p, e.target.value)}
                        disabled={!selected}
                      />
                    </React.Fragment>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button style={primaryBtn} onClick={() => handleCreateDevice(customer.id)}>Hinzufügen</button>
                <button style={ghostBtn} onClick={() => { setAddingDevice(null); setDeviceForm({ name: '', versions: {} }); }}>Abbrechen</button>
              </div>
            </div>
          ) : isCustomerExpanded ? (
            <button style={{ ...ghostBtn, fontSize: '12px' }} onClick={() => setAddingDevice(customer.id)}>+ Gerät hinzufügen</button>
          ) : null}
          </div>
        );
      })}

      {customers.length === 0 && (
        <p style={{ color: '#64748b', textAlign: 'center', padding: '40px' }}>Keine Kunden vorhanden. Erstellen Sie einen neuen Kunden.</p>
      )}
    </div>
  );
}

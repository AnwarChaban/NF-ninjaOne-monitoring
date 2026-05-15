import React, { useEffect, useState } from 'react';
import {
  fetchBackupChecks, createBackupCheck, updateBackupCheck, deleteBackupCheck,
  fetchBackupAccounts, triggerBackupSync,
  type BackupCheckDef, type BackupAccount,
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

const emptyForm = {
  backupAccountId: '' as string,
  name: '',
  intervalHours: '24',
  graceHours: '1',
  subjectFilter: '',
  subjectMatchType: 'contains' as 'contains' | 'exact',
  bodyFilter: '',
};

type FormState = typeof emptyForm;

function CheckForm({
  form, accounts, onChange, onSave, onCancel, saveLabel,
}: {
  form: FormState;
  accounts: BackupAccount[];
  onChange: (f: FormState) => void;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
      <div>
        <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Kunde (Backup-Account) *</label>
        <select style={{ ...inputStyle, width: '100%' }} value={form.backupAccountId}
          onChange={e => onChange({ ...form, backupAccountId: e.target.value })}>
          <option value="">Kunden auswählen...</option>
          {accounts.map(a => (
            <option key={a.id} value={String(a.id)}>
              {a.customerName} ({a.fromEmail})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Job-Name *</label>
        <input style={{ ...inputStyle, width: '100%' }} placeholder="z.B. pve01 - ACO-Backup01 NAS"
          value={form.name} onChange={e => onChange({ ...form, name: e.target.value })} />
      </div>
      <div>
        <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Subject-Filter (optional)</label>
        <input style={{ ...inputStyle, width: '100%' }} placeholder="z.B. vzdump backup status (pve01"
          value={form.subjectFilter} onChange={e => onChange({ ...form, subjectFilter: e.target.value })} />
        <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px' }}>Leer lassen = alle Mails von dieser Adresse</div>
      </div>
      <div>
        <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Subject-Matching</label>
        <select style={{ ...inputStyle, width: '100%' }} value={form.subjectMatchType}
          onChange={e => onChange({ ...form, subjectMatchType: e.target.value as 'contains' | 'exact' })}>
          <option value="contains">Enthält</option>
          <option value="exact">Exakt</option>
        </select>
      </div>
      <div>
        <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Body-Filter (optional)</label>
        <input style={{ ...inputStyle, width: '100%' }} placeholder="z.B. --storage pbs01"
          value={form.bodyFilter} onChange={e => onChange({ ...form, bodyFilter: e.target.value })} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Intervall (Std.) *</label>
          <input style={{ ...inputStyle, width: '100%' }} type="number" min="1" step="1"
            value={form.intervalHours} onChange={e => onChange({ ...form, intervalHours: e.target.value })} />
        </div>
        <div>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Toleranz (Std.)</label>
          <input style={{ ...inputStyle, width: '100%' }} type="number" min="0" step="0.5"
            value={form.graceHours} onChange={e => onChange({ ...form, graceHours: e.target.value })} />
        </div>
      </div>
      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '8px' }}>
        <button style={primaryBtn} onClick={onSave}>{saveLabel}</button>
        <button style={ghostBtn} onClick={onCancel}>Abbrechen</button>
      </div>
    </div>
  );
}

export default function BackupChecksPage() {
  const [checks, setChecks] = useState<BackupCheckDef[]>([]);
  const [accounts, setAccounts] = useState<BackupAccount[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  async function load() {
    const [c, a] = await Promise.all([fetchBackupChecks(), fetchBackupAccounts()]);
    setChecks(c);
    setAccounts(a);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!form.backupAccountId || !form.name || !form.intervalHours) return;
    await createBackupCheck({
      backupAccountId: parseInt(form.backupAccountId),
      name: form.name,
      intervalHours: parseFloat(form.intervalHours),
      graceHours: parseFloat(form.graceHours) || 1,
      subjectFilter: form.subjectFilter || null,
      subjectMatchType: form.subjectMatchType,
      bodyFilter: form.bodyFilter || null,
    });
    setForm(emptyForm);
    setShowForm(false);
    load();
  }

  async function handleUpdate(id: number) {
    await updateBackupCheck(id, {
      backupAccountId: parseInt(editForm.backupAccountId),
      name: editForm.name,
      intervalHours: parseFloat(editForm.intervalHours),
      graceHours: parseFloat(editForm.graceHours) || 1,
      subjectFilter: editForm.subjectFilter || null,
      subjectMatchType: editForm.subjectMatchType,
      bodyFilter: editForm.bodyFilter || null,
    });
    setEditingId(null);
    load();
  }

  async function handleDelete(id: number) {
    if (!confirm('Backup-Check löschen?')) return;
    await deleteBackupCheck(id);
    load();
  }

  async function handleToggle(check: BackupCheckDef) {
    await updateBackupCheck(check.id, { active: !check.active });
    load();
  }

  async function handleSync() {
    setSyncing(true);
    setSyncMsg('');
    try {
      const result = await triggerBackupSync();
      setSyncMsg(`${result.newResults} neue Ergebnisse aus ${result.checked} Check(s)`);
    } catch (err) {
      setSyncMsg((err as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  function startEdit(check: BackupCheckDef) {
    setEditingId(check.id);
    setEditForm({
      backupAccountId: String(check.backupAccountId),
      name: check.name,
      intervalHours: String(check.intervalHours),
      graceHours: String(check.graceHours),
      subjectFilter: check.subjectFilter ?? '',
      subjectMatchType: check.subjectMatchType,
      bodyFilter: check.bodyFilter ?? '',
    });
  }

  // Group checks by customer
  const grouped = new Map<number, { customerName: string; fromEmail: string; checks: BackupCheckDef[] }>();
  for (const check of checks) {
    if (!grouped.has(check.customerId)) {
      grouped.set(check.customerId, { customerName: check.customerName, fromEmail: check.fromEmail, checks: [] });
    }
    grouped.get(check.customerId)!.checks.push(check);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: 700, margin: 0 }}>Backup-Checks</h2>
          {accounts.length === 0 && (
            <p style={{ color: '#f59e0b', fontSize: '13px', marginTop: '4px' }}>
              Kein Backup-Account konfiguriert — bitte zuerst unter Kunden eine FROM-Adresse hinterlegen.
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={ghostBtn} onClick={handleSync} disabled={syncing}>
            {syncing ? 'Sync läuft...' : 'Jetzt synchronisieren'}
          </button>
          <button style={primaryBtn} onClick={() => setShowForm(!showForm)} disabled={accounts.length === 0}>
            {showForm ? 'Abbrechen' : '+ Neuer Check'}
          </button>
        </div>
      </div>

      {syncMsg && <div style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '16px' }}>{syncMsg}</div>}

      {showForm && (
        <div style={{ backgroundColor: '#1e293b', borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '16px' }}>
            Neuer Backup-Check
          </h3>
          <CheckForm form={form} accounts={accounts} onChange={setForm}
            onSave={handleCreate} onCancel={() => setShowForm(false)} saveLabel="Check erstellen" />
        </div>
      )}

      {checks.length === 0 ? (
        <div style={{ backgroundColor: '#1e293b', borderRadius: '10px', padding: '40px', textAlign: 'center', color: '#64748b' }}>
          Noch keine Backup-Checks konfiguriert.
        </div>
      ) : (
        Array.from(grouped.entries()).map(([customerId, group]) => (
          <div key={customerId} style={{ backgroundColor: '#1e293b', borderRadius: '10px', marginBottom: '16px', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', backgroundColor: '#111827', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '15px' }}>{group.customerName}</span>
                <span style={{ color: '#475569', fontSize: '12px', marginLeft: '10px', fontFamily: 'monospace' }}>FROM: {group.fromEmail}</span>
              </div>
              <span style={{ color: '#64748b', fontSize: '12px' }}>{group.checks.length} Check(s)</span>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  {['Job-Name', 'Subject-Filter', 'Intervall', 'Toleranz', 'Aktiv', 'Aktionen'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.checks.map(check => (
                  <React.Fragment key={check.id}>
                    {editingId === check.id ? (
                      <tr style={{ borderBottom: '1px solid #0f172a' }}>
                        <td colSpan={6} style={{ padding: '16px 12px' }}>
                          <CheckForm form={editForm} accounts={accounts} onChange={setEditForm}
                            onSave={() => handleUpdate(check.id)} onCancel={() => setEditingId(null)} saveLabel="Speichern" />
                        </td>
                      </tr>
                    ) : (
                      <tr style={{ borderBottom: '1px solid #0f172a' }}>
                        <td style={{ padding: '10px 12px', color: '#e2e8f0', fontSize: '14px', fontWeight: 500 }}>{check.name}</td>
                        <td style={{ padding: '10px 12px', maxWidth: '220px' }}>
                          {check.subjectFilter ? (
                            <>
                              <span style={{ color: '#475569', fontSize: '11px', marginRight: '4px' }}>{check.subjectMatchType === 'exact' ? '=' : '~'}</span>
                              <span style={{ color: '#94a3b8', fontSize: '13px', fontFamily: 'monospace' }}>{check.subjectFilter}</span>
                            </>
                          ) : (
                            <span style={{ color: '#475569', fontSize: '12px', fontStyle: 'italic' }}>alle Mails</span>
                          )}
                          {check.bodyFilter && (
                            <div style={{ color: '#475569', fontSize: '11px', fontFamily: 'monospace', marginTop: '2px' }}>body: {check.bodyFilter}</div>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#94a3b8', fontSize: '13px' }}>{check.intervalHours} Std.</td>
                        <td style={{ padding: '10px 12px', color: '#94a3b8', fontSize: '13px' }}>{check.graceHours} Std.</td>
                        <td style={{ padding: '10px 12px' }}>
                          <div onClick={() => handleToggle(check)} style={{
                            width: '40px', height: '22px', borderRadius: '11px', cursor: 'pointer',
                            backgroundColor: check.active ? '#065f46' : '#374151', position: 'relative',
                          }}>
                            <div style={{
                              width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#fff',
                              position: 'absolute', top: '3px', left: check.active ? '21px' : '3px', transition: 'left 0.2s',
                            }} />
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button style={ghostBtn} onClick={() => startEdit(check)}>Bearbeiten</button>
                            <button style={dangerBtn} onClick={() => handleDelete(check.id)}>Löschen</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}

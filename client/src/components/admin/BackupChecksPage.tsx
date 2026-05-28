import React, { useEffect, useState } from 'react';
import {
  fetchCustomers, fetchBackupChecks, createBackupCheck, updateBackupCheck, deleteBackupCheck,
  fetchBackupAccounts, createBackupAccount, deleteBackupAccount, updateBackupAccount, triggerBackupSync,
  pauseBackupCheck, resumeBackupCheck, apiFetch,
  type Customer, type BackupCheckDef, type BackupAccount,
} from '../../api';

const BASE = '/api';

interface JobSuggestion {
  subject: string;
  count: number;
  lastReceivedAt: string;
  bodyPreview: string;
  suggestedInterval: number;
}

interface RecentEmail {
  id: string;
  subject: string;
  receivedAt: string;
  bodyPreview: string;
}

async function fetchRecentEmails(accountId: string, hours = 720): Promise<{
  emails: RecentEmail[];
  jobs: JobSuggestion[];
  suggestedInterval: number;
}> {
  const res = await apiFetch(`${BASE}/admin/backup-accounts/${accountId}/recent-emails?hours=${hours}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

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

function cleanJobName(subject: string): string {
  return subject
    .replace(/^.*?\[(Success|Failed)\]\s*/i, '')  // alles bis inkl. [Success]/[Failed] entfernen
    .replace(/\s*\(.*$/, '')                       // alles ab ( entfernen
    .trim();
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return `vor ${Math.floor(diff / 60_000)} Min.`;
  if (h < 24) return `vor ${h} Std.`;
  return `vor ${Math.floor(h / 24)} Tag(en)`;
}

// ── Bulk Import Panel ──────────────────────────────────────────────────────────

function BulkImportPanel({
  accounts,
  existingChecks,
  onDone,
  onCancel,
}: {
  accounts: BackupAccount[];
  existingChecks: BackupCheckDef[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [accountId, setAccountId] = useState('');
  const [hours, setHours] = useState(24);
  const [jobs, setJobs] = useState<JobSuggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  const existingSubjects = new Set(existingChecks.map(c => c.subjectFilter ?? ''));

  async function load() {
    if (!accountId) return;
    setLoading(true);
    setError('');
    setJobs([]);
    setSelected(new Set());
    try {
      const data = await fetchRecentEmails(accountId, hours);
      setJobs(data.jobs);
      // Pre-select all jobs that don't already exist
      const toSelect = new Set(
        data.jobs
          .filter(j => !existingSubjects.has(j.subject))
          .map(j => j.subject)
      );
      setSelected(toSelect);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function toggleAll() {
    if (selected.size === jobs.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(jobs.map(j => j.subject)));
    }
  }

  function toggle(subject: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(subject) ? next.delete(subject) : next.add(subject);
      return next;
    });
  }

  async function importSelected() {
    const toImport = jobs.filter(j => selected.has(j.subject));
    if (toImport.length === 0) return;
    setImporting(true);
    setError('');
    let created = 0;
    const errors: string[] = [];
    for (const job of toImport) {
      try {
        await createBackupCheck({
          backupAccountId: parseInt(accountId),
          name: cleanJobName(job.subject),
          intervalHours: job.suggestedInterval,
          graceHours: 1,
          subjectFilter: job.subject,
          subjectMatchType: 'contains',
          bodyFilter: null,
        });
        created++;
      } catch (e) {
        errors.push(`„${job.subject}": ${(e as Error).message}`);
      }
    }
    setImporting(false);
    if (errors.length > 0) {
      setError(`${errors.length} Fehler:\n${errors.join('\n')}`);
    }
    setResult(`${created} Job${created !== 1 ? 's' : ''} erfolgreich importiert.`);
    if (created > 0) onDone();
  }

  return (
    <div style={{ backgroundColor: '#1e293b', borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
      <h3 style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '16px', margin: '0 0 16px' }}>
        Jobs aus E-Mails importieren
      </h3>

      {/* Account + Zeitraum */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '10px', alignItems: 'flex-end', marginBottom: '14px' }}>
        <div>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Backup-Account</label>
          <select style={{ ...inputStyle, width: '100%' }} value={accountId} onChange={e => setAccountId(e.target.value)}>
            <option value="">Kunden auswählen…</option>
            {accounts.map(a => (
              <option key={a.id} value={String(a.id)}>{a.customerName} ({a.fromEmail})</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Zeitraum</label>
          <select style={{ ...inputStyle }} value={hours} onChange={e => setHours(parseInt(e.target.value))}>
            <option value={24}>Letzte 24 Std.</option>
            <option value={48}>Letzte 48 Std.</option>
            <option value={168}>Letzte 7 Tage</option>
            <option value={720}>Letzte 30 Tage</option>
          </select>
        </div>
        <button
          style={{ ...primaryBtn, alignSelf: 'flex-end' }}
          onClick={load}
          disabled={!accountId || loading}
        >
          {loading ? 'Lade…' : 'E-Mails laden'}
        </button>
      </div>

      {error && <p style={{ color: '#f87171', fontSize: '13px', marginBottom: '12px' }}>{error}</p>}
      {result && <p style={{ color: '#6ee7b7', fontSize: '13px', marginBottom: '12px' }}>{result}</p>}

      {/* Job-Liste */}
      {jobs.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: '#64748b', fontSize: '12px' }}>
              {jobs.length} unique Job{jobs.length !== 1 ? 's' : ''} gefunden · {selected.size} ausgewählt
            </span>
            <button style={{ ...ghostBtn, padding: '4px 10px', fontSize: '12px' }} onClick={toggleAll}>
              {selected.size === jobs.length ? 'Alle abwählen' : 'Alle auswählen'}
            </button>
          </div>

          <div style={{ backgroundColor: '#0f172a', borderRadius: '8px', overflow: 'hidden', marginBottom: '14px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b' }}>
                  <th style={{ width: '40px', padding: '8px 12px' }} />
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Betreff (Job-Name)</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Intervall</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Anzahl</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Zuletzt</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => {
                  const alreadyExists = existingSubjects.has(job.subject);
                  const isSelected = selected.has(job.subject);
                  return (
                    <tr
                      key={job.subject}
                      onClick={() => !alreadyExists && toggle(job.subject)}
                      style={{
                        borderBottom: '1px solid #1e293b',
                        cursor: alreadyExists ? 'default' : 'pointer',
                        backgroundColor: isSelected ? '#1e293b' : 'transparent',
                        opacity: alreadyExists ? 0.5 : 1,
                      }}
                    >
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={alreadyExists}
                          onChange={() => toggle(job.subject)}
                          onClick={e => e.stopPropagation()}
                          style={{ accentColor: '#3b82f6', width: '15px', height: '15px' }}
                        />
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 500 }}>{cleanJobName(job.subject)}</div>
                        <div style={{ color: '#475569', fontSize: '11px', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '400px' }}>
                          {job.subject}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#94a3b8', fontSize: '13px', whiteSpace: 'nowrap' }}>
                        {job.suggestedInterval} Std.
                      </td>
                      <td style={{ padding: '10px 12px', color: '#64748b', fontSize: '13px' }}>
                        {job.count}×
                      </td>
                      <td style={{ padding: '10px 12px', color: '#64748b', fontSize: '12px', whiteSpace: 'nowrap' }}>
                        {formatRelative(job.lastReceivedAt)}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {alreadyExists ? (
                          <span style={{ fontSize: '11px', color: '#6ee7b7', backgroundColor: '#065f4622', borderRadius: '4px', padding: '2px 7px' }}>
                            Bereits vorhanden
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', color: '#fbbf24', backgroundColor: '#78350f22', borderRadius: '4px', padding: '2px 7px' }}>
                            Neu
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              style={{ ...primaryBtn, opacity: selected.size === 0 ? 0.5 : 1 }}
              disabled={selected.size === 0 || importing}
              onClick={importSelected}
            >
              {importing ? 'Importiere…' : `${selected.size} Job${selected.size !== 1 ? 's' : ''} importieren`}
            </button>
            <button style={ghostBtn} onClick={onCancel}>Abbrechen</button>
          </div>
        </>
      )}

      {!loading && jobs.length === 0 && accountId && !error && (
        <div style={{ marginTop: '4px' }}>
          <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '10px' }}>
            Keine E-Mails im gewählten Zeitraum gefunden. Versuche einen längeren Zeitraum (z.B. 30 Tage).
          </p>
          <button style={ghostBtn} onClick={onCancel}>Abbrechen</button>
        </div>
      )}

      {!accountId && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <button style={ghostBtn} onClick={onCancel}>Abbrechen</button>
        </div>
      )}
    </div>
  );
}

// ── Single Check Form ──────────────────────────────────────────────────────────

function CheckForm({
  form, accounts, onChange, onSave, onCancel, saveLabel, isEdit = false,
}: {
  form: FormState;
  accounts: BackupAccount[];
  onChange: (f: FormState) => void;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
  isEdit?: boolean;
}) {
  const [recentEmails, setRecentEmails] = useState<RecentEmail[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [suggestedInterval, setSuggestedInterval] = useState(24);

  useEffect(() => {
    if (isEdit || !form.backupAccountId) { setRecentEmails([]); return; }
    setLoadingEmails(true);
    setEmailError('');
    fetchRecentEmails(form.backupAccountId, 720)
      .then(({ emails, suggestedInterval: si }) => {
        setRecentEmails(emails);
        setSuggestedInterval(si);
        onChange({ ...form, intervalHours: String(si) });
      })
      .catch(e => setEmailError(e.message))
      .finally(() => setLoadingEmails(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.backupAccountId, isEdit]);

  function applyEmail(email: RecentEmail) {
    onChange({
      ...form,
      name: email.subject,
      subjectFilter: email.subject,
      subjectMatchType: 'contains',
      intervalHours: String(suggestedInterval),
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Kunde (Backup-Account) *</label>
          <select style={{ ...inputStyle, width: '100%' }} value={form.backupAccountId}
            onChange={e => onChange({ ...form, backupAccountId: e.target.value })}>
            <option value="">Kunden auswählen…</option>
            {accounts.map(a => (
              <option key={a.id} value={String(a.id)}>{a.customerName} ({a.fromEmail})</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Job-Name *</label>
          <input style={{ ...inputStyle, width: '100%' }} placeholder="z.B. pve01 - ACO-Backup01 NAS"
            value={form.name} onChange={e => onChange({ ...form, name: e.target.value })} />
        </div>
      </div>

      {/* Recent emails — only in create mode */}
      {!isEdit && form.backupAccountId && (
        <div style={{ backgroundColor: '#0f172a', borderRadius: '8px', padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ color: '#64748b', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Letzte E-Mails
            </span>
            {loadingEmails && <span style={{ color: '#475569', fontSize: '11px' }}>wird geladen…</span>}
            {emailError && <span style={{ color: '#f87171', fontSize: '11px' }}>{emailError}</span>}
          </div>
          {!loadingEmails && recentEmails.length === 0 && !emailError && (
            <p style={{ color: '#475569', fontSize: '12px', margin: 0 }}>Keine E-Mails in den letzten 30 Tagen.</p>
          )}
          {recentEmails.map(email => (
            <div key={email.id} onClick={() => applyEmail(email)} style={{
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px',
              padding: '8px 10px', borderRadius: '6px', marginBottom: '4px', backgroundColor: '#1e293b',
              cursor: 'pointer', border: '1px solid transparent', transition: 'border-color 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#3b82f6')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {email.subject}
                </div>
                {email.bodyPreview && (
                  <div style={{ color: '#475569', fontSize: '11px', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {email.bodyPreview}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <span style={{ color: '#64748b', fontSize: '11px' }}>{formatRelative(email.receivedAt)}</span>
                <span style={{ fontSize: '11px', color: '#3b82f6', border: '1px solid #3b82f633', borderRadius: '4px', padding: '1px 6px', backgroundColor: '#3b82f610' }}>
                  Übernehmen
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Subject-Filter (optional)</label>
          <input style={{ ...inputStyle, width: '100%' }} placeholder="z.B. vzdump backup status (pve01"
            value={form.subjectFilter} onChange={e => onChange({ ...form, subjectFilter: e.target.value })} />
          <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px' }}>Leer = alle Mails von dieser Adresse</div>
        </div>
        <div>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>Subject-Matching</label>
          <select style={{ ...inputStyle, width: '100%' }} value={form.subjectMatchType}
            onChange={e => onChange({ ...form, subjectMatchType: e.target.value as 'contains' | 'exact' })}>
            <option value="contains">Enthält</option>
            <option value="exact">Exakt</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button style={primaryBtn} onClick={onSave}>{saveLabel}</button>
        <button style={ghostBtn} onClick={onCancel}>Abbrechen</button>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

type ActivePanel = 'none' | 'single' | 'import';

export default function BackupChecksPage() {
  const [checks, setChecks] = useState<BackupCheckDef[]>([]);
  const [accounts, setAccounts] = useState<BackupAccount[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [emailForms, setEmailForms] = useState<Record<number, string>>({});
  const [editingEmail, setEditingEmail] = useState<number | null>(null);
  const [editEmailValue, setEditEmailValue] = useState('');
  const [activePanel, setActivePanel] = useState<ActivePanel>('none');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  async function load() {
    const [c, a, cust] = await Promise.all([fetchBackupChecks(), fetchBackupAccounts(), fetchCustomers()]);
    setChecks(c);
    setAccounts(a);
    setCustomers(cust);
  }

  async function handleCreateBackupAccount(customerId: number, customerName: string) {
    const email = emailForms[customerId]?.trim();
    if (!email) return;
    await createBackupAccount(customerId, { fromEmail: email, name: customerName });
    setEmailForms(prev => { const next = { ...prev }; delete next[customerId]; return next; });
    load();
  }

  async function handleDeleteBackupAccount(customerId: number) {
    if (!confirm('Backup-Account löschen? Alle zugehörigen Checks werden ebenfalls gelöscht.')) return;
    await deleteBackupAccount(customerId);
    load();
  }

  async function handleUpdateEmail(customerId: number) {
    const email = editEmailValue.trim();
    if (!email) return;
    try {
      await updateBackupAccount(customerId, email);
      setEditingEmail(null);
      load();
    } catch (err) {
      alert((err as Error).message);
    }
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
    setActivePanel('none');
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

  async function handlePause(check: BackupCheckDef) {
    const reason = window.prompt(`Check "${check.name}" pausieren. Grund (optional):`) ?? null;
    if (reason === null) return; // cancelled
    try {
      await pauseBackupCheck(check.id, reason || 'Manuell pausiert');
      load();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function handleResume(check: BackupCheckDef) {
    try {
      await resumeBackupCheck(check.id);
      load();
    } catch (err) {
      alert((err as Error).message);
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

  const allGroups = customers
    .map(c => ({
      customerId: c.id,
      customerName: c.name,
      backupAccount: accounts.find(a => a.customerId === c.id) ?? null,
      checks: checks.filter(ch => ch.customerId === c.id),
    }))
    .sort((a, b) => a.customerName.localeCompare(b.customerName));

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: 700, margin: 0 }}>Backup-Checks</h2>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={ghostBtn} onClick={handleSync} disabled={syncing}>
            {syncing ? 'Sync läuft...' : 'Jetzt synchronisieren'}
          </button>
          <button
            style={{ ...ghostBtn, color: '#a78bfa', borderColor: '#7c3aed44' }}
            onClick={() => setActivePanel(activePanel === 'import' ? 'none' : 'import')}
            disabled={accounts.length === 0}
          >
            ↓ Jobs importieren
          </button>
          <button
            style={primaryBtn}
            onClick={() => setActivePanel(activePanel === 'single' ? 'none' : 'single')}
            disabled={accounts.length === 0}
          >
            {activePanel === 'single' ? 'Abbrechen' : '+ Neuer Check'}
          </button>
        </div>
      </div>

      {syncMsg && <div style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '16px' }}>{syncMsg}</div>}

      {/* Bulk import panel */}
      {activePanel === 'import' && (
        <BulkImportPanel
          accounts={accounts}
          existingChecks={checks}
          onDone={() => { setActivePanel('none'); load(); }}
          onCancel={() => setActivePanel('none')}
        />
      )}

      {/* Single check form */}
      {activePanel === 'single' && (
        <div style={{ backgroundColor: '#1e293b', borderRadius: '10px', padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ color: '#94a3b8', fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '16px', margin: '0 0 16px' }}>
            Neuer Backup-Check
          </h3>
          <CheckForm form={form} accounts={accounts} onChange={setForm}
            onSave={handleCreate} onCancel={() => setActivePanel('none')} saveLabel="Check erstellen" />
        </div>
      )}

      {/* Customer list */}
      {customers.length === 0 ? (
        <div style={{ backgroundColor: '#1e293b', borderRadius: '10px', padding: '40px', textAlign: 'center', color: '#64748b' }}>
          Noch keine Kunden vorhanden.
        </div>
      ) : (
        allGroups.map(group => (
          <div key={group.customerId} style={{ backgroundColor: '#1e293b', borderRadius: '10px', marginBottom: '16px', overflow: 'hidden' }}>
            {/* Customer header */}
            <div style={{ padding: '12px 16px', backgroundColor: '#111827', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '15px' }}>{group.customerName}</span>
                {group.backupAccount ? (
                  <>
                    {editingEmail === group.customerId ? (
                      <>
                        <input
                          style={{ ...inputStyle, width: '260px', fontSize: '12px', padding: '4px 8px' }}
                          value={editEmailValue}
                          onChange={e => setEditEmailValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleUpdateEmail(group.customerId);
                            if (e.key === 'Escape') setEditingEmail(null);
                          }}
                          autoFocus
                        />
                        <button style={{ ...primaryBtn, padding: '2px 8px', fontSize: '11px' }} onClick={() => handleUpdateEmail(group.customerId)}>Speichern</button>
                        <button style={{ ...ghostBtn, padding: '2px 8px', fontSize: '11px' }} onClick={() => setEditingEmail(null)}>Abbrechen</button>
                      </>
                    ) : (
                      <>
                        <span style={{ color: '#475569', fontSize: '12px', fontFamily: 'monospace' }}>{group.backupAccount.fromEmail}</span>
                        <button
                          style={{ ...ghostBtn, padding: '2px 8px', fontSize: '11px' }}
                          onClick={() => { setEditingEmail(group.customerId); setEditEmailValue(group.backupAccount!.fromEmail); }}
                        >✎ Bearbeiten</button>
                        <button
                          style={{ ...dangerBtn, padding: '2px 8px', fontSize: '11px' }}
                          onClick={() => handleDeleteBackupAccount(group.customerId)}
                        >✕ Entfernen</button>
                      </>
                    )}
                  </>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      style={{ ...inputStyle, width: '240px', fontSize: '12px', padding: '4px 8px' }}
                      placeholder="FROM-Adresse hinterlegen…"
                      value={emailForms[group.customerId] ?? ''}
                      onChange={e => setEmailForms(prev => ({ ...prev, [group.customerId]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && handleCreateBackupAccount(group.customerId, group.customerName)}
                    />
                    <button
                      style={{ ...primaryBtn, padding: '4px 10px', fontSize: '12px' }}
                      onClick={() => handleCreateBackupAccount(group.customerId, group.customerName)}
                    >Speichern</button>
                  </div>
                )}
              </div>
              <span style={{ color: '#64748b', fontSize: '12px' }}>{group.checks.length} Checks</span>
            </div>

            {/* Checks table (only if backup account is set) */}
            {group.backupAccount ? (
              group.checks.length === 0 ? (
                <p style={{ color: '#475569', fontSize: '13px', fontStyle: 'italic', padding: '12px 16px', margin: 0 }}>Keine Checks vorhanden.</p>
              ) : (
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
                                onSave={() => handleUpdate(check.id)} onCancel={() => setEditingId(null)} saveLabel="Speichern" isEdit />
                            </td>
                          </tr>
                        ) : (
                          <tr style={{ borderBottom: '1px solid #0f172a', opacity: check.paused ? 0.85 : 1 }}>
                            <td style={{ padding: '10px 12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: 500 }}>{check.name}</span>
                                {check.paused && (
                                  <span style={{
                                    fontSize: '10px', fontWeight: 700, color: '#818cf8',
                                    backgroundColor: '#1e1b4b', border: '1px solid #4338ca55',
                                    borderRadius: '3px', padding: '1px 5px',
                                  }}
                                    title={check.pausedReason ?? undefined}
                                  >
                                    PAUSIERT
                                  </span>
                                )}
                              </div>
                            </td>
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
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                <button style={ghostBtn} onClick={() => startEdit(check)}>Bearbeiten</button>
                                {check.paused ? (
                                  <button style={{ ...ghostBtn, color: '#818cf8', borderColor: '#4338ca55' }} onClick={() => handleResume(check)}>▶ Fortsetzen</button>
                                ) : (
                                  <button style={{ ...ghostBtn, color: '#64748b' }} onClick={() => handlePause(check)}>⏸ Pause</button>
                                )}
                                <button style={dangerBtn} onClick={() => handleDelete(check.id)}>Löschen</button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              )
            ) : (
              <p style={{ color: '#475569', fontSize: '13px', fontStyle: 'italic', padding: '12px 16px', margin: 0 }}>Keine E-Mail hinterlegt — bitte oben eine FROM-Adresse eingeben.</p>
            )}
          </div>
        ))
      )}
    </div>
  );
}

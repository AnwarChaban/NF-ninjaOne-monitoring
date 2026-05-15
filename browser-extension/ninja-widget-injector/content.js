// ── Updates Panel ──────────────────────────────────────────────────────────────

const UPDATES_BTN_ID = 'nf-updates-btn';
const UPDATES_PANEL_ID = 'nf-updates-panel';
const UPDATES_BACKDROP_ID = 'nf-updates-backdrop';

function closeUpdatesPanel() {
  const panel = document.getElementById(UPDATES_PANEL_ID);
  const backdrop = document.getElementById(UPDATES_BACKDROP_ID);
  if (panel) {
    panel.style.transform = 'translateX(100%)';
    setTimeout(() => panel.remove(), 260);
  }
  if (backdrop) backdrop.remove();
}

function buildUpdatesPanel() {
  const panel = document.createElement('div');
  panel.id = UPDATES_PANEL_ID;
  Object.assign(panel.style, {
    position: 'fixed', top: '0', right: '0',
    width: '860px', maxWidth: '92vw', height: '100vh',
    background: '#1e293b', boxShadow: '-4px 0 24px rgba(0,0,0,0.18)',
    zIndex: '99999', display: 'flex', flexDirection: 'column',
    transform: 'translateX(100%)', transition: 'transform 0.25s ease',
  });

  const header = document.createElement('div');
  Object.assign(header.style, {
    padding: '14px 20px', borderBottom: '1px solid #334155',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: '#0f172a', flexShrink: '0',
  });

  const left = document.createElement('div');
  left.style.display = 'flex';
  left.style.alignItems = 'center';
  left.style.gap = '10px';
  left.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>`;
  const title = document.createElement('span');
  Object.assign(title.style, { fontSize: '15px', fontWeight: '700', color: '#f1f5f9', fontFamily: 'Inter,Segoe UI,sans-serif' });
  title.textContent = 'Software-Updates';
  left.appendChild(title);

  const closeBtn = document.createElement('button');
  Object.assign(closeBtn.style, {
    background: 'none', border: 'none', color: '#94a3b8',
    fontSize: '22px', cursor: 'pointer', padding: '2px 8px',
    borderRadius: '4px', lineHeight: '1',
  });
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', closeUpdatesPanel);

  header.appendChild(left);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  const frame = document.createElement('iframe');
  frame.src = chrome.runtime.getURL('widget.html');
  frame.title = 'Software-Updates';
  Object.assign(frame.style, {
    flex: '1', width: '100%', border: '0', display: 'block',
  });
  panel.appendChild(frame);

  const backdrop = document.createElement('div');
  backdrop.id = UPDATES_BACKDROP_ID;
  Object.assign(backdrop.style, {
    position: 'fixed', top: '0', left: '0', right: '0', bottom: '0',
    background: 'rgba(0,0,0,0.3)', zIndex: '99998',
  });
  backdrop.addEventListener('click', closeUpdatesPanel);

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);

  requestAnimationFrame(() => requestAnimationFrame(() => {
    panel.style.transform = 'translateX(0)';
  }));
}

function buildUpdatesSidebarButton() {
  const btn = document.createElement('button');
  btn.id = UPDATES_BTN_ID;
  btn.type = 'button';
  btn.title = 'Software-Updates';
  Object.assign(btn.style, {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '100%', padding: '8px 4px',
    background: 'transparent', border: 'none', cursor: 'pointer',
    borderRadius: '6px', color: '#6b7280',
  });
  btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>`;
  btn.addEventListener('mouseenter', () => {
    btn.style.color = '#111827';
    btn.style.background = 'rgba(0,0,0,0.06)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.color = '#6b7280';
    btn.style.background = 'transparent';
  });
  btn.addEventListener('click', () => {
    if (document.getElementById(UPDATES_PANEL_ID)) {
      closeUpdatesPanel();
    } else {
      closeBackupPanel();
      buildUpdatesPanel();
    }
  });
  return btn;
}

// ── Backup Panel ───────────────────────────────────────────────────────────────

const BACKUP_BTN_ID = 'nf-backup-btn';
const BACKUP_PANEL_ID = 'nf-backup-panel';
const BACKUP_BACKDROP_ID = 'nf-backup-backdrop';
const BACKUP_API_CANDIDATES = [
  'http://localhost:3001/api/backup/status',
  'http://127.0.0.1:3001/api/backup/status'
];

function closeBackupPanel() {
  const panel = document.getElementById(BACKUP_PANEL_ID);
  const backdrop = document.getElementById(BACKUP_BACKDROP_ID);
  if (panel) {
    panel.style.transform = 'translateX(100%)';
    setTimeout(() => panel.remove(), 260);
  }
  if (backdrop) backdrop.remove();
}

function formatBackupBytes(bytes) {
  if (bytes == null || bytes === 0) return '–';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function formatBackupDate(dateStr) {
  if (!dateStr) return '–';
  try { return new Date(dateStr).toLocaleString('de-DE'); } catch { return String(dateStr); }
}

function backupStatusColor(status) {
  if (status === 'success') return '#22c55e';
  if (status === 'failed' || status === 'missed') return '#ef4444';
  return '#64748b';
}

function backupStatusLabel(status) {
  if (status === 'success') return 'OK';
  if (status === 'failed') return 'Fehler';
  if (status === 'missed') return 'Ausgeblieben';
  return 'Unbekannt';
}

function backupFormatRelative(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return `vor ${Math.floor(diff / 60_000)} Min.`;
  if (h < 24) return `vor ${h} Std.`;
  return `vor ${Math.floor(h / 24)} Tag(en)`;
}

function buildHistoryDots(recentResults) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;gap:3px;align-items:center;';
  if (!recentResults || recentResults.length === 0) {
    const empty = document.createElement('span');
    empty.style.cssText = 'color:#475569;font-size:12px;font-family:Inter,Segoe UI,sans-serif;';
    empty.textContent = 'Keine Daten';
    wrap.appendChild(empty);
    return wrap;
  }
  const dotColor = s => (s === 'success' ? '#22c55e' : '#ef4444');
  const dotLabel = s => (s === 'success' ? 'OK' : s === 'failed' ? 'Fehler' : 'Ausgeblieben');
  [...recentResults].reverse().forEach(r => {
    const dot = document.createElement('div');
    dot.title = `${new Date(r.slotEnd).toLocaleString('de-DE')} — ${dotLabel(r.status)}`;
    dot.style.cssText = `width:10px;height:10px;border-radius:50%;background:${dotColor(r.status)};flex-shrink:0;opacity:${r.status === 'missed' ? '0.5' : '1'};`;
    wrap.appendChild(dot);
  });
  return wrap;
}

function renderBackupTable(data) {
  const content = document.getElementById('nf-backup-content');
  if (!content) return;

  const FONT = 'Inter,Segoe UI,Arial,sans-serif';
  content.style.background = '#0a111e';
  const groups = data?.groups ?? [];

  if (groups.length === 0) {
    content.innerHTML = `<div style="text-align:center;padding:60px;color:#64748b;background:#1e293b;border-radius:10px;font-family:${FONT};">
      <p style="font-size:16px;margin:0 0 8px;">Keine Backup-Checks konfiguriert</p>
      <p style="font-size:13px;margin:0;">Gehe zu Admin → Backup-Checks um Checks anzulegen.</p>
    </div>`;
    return;
  }

  const totalChecks = groups.reduce((s, g) => s + g.checks.length, 0);
  const failedCount = groups.reduce((s, g) => s + g.checks.filter(c => c.currentStatus === 'failed' || c.currentStatus === 'missed').length, 0);
  const successCount = groups.reduce((s, g) => s + g.checks.filter(c => c.currentStatus === 'success').length, 0);

  content.innerHTML = '';

  // Summary line
  const summary = document.createElement('p');
  summary.style.cssText = `color:#64748b;font-size:13px;margin:0 0 20px;font-family:${FONT};`;
  summary.textContent = `${totalChecks} Check(s) · ${successCount} OK · ${failedCount} Problem(e)`;
  content.appendChild(summary);

  for (const group of groups) {
    const groupFailed = group.checks.filter(c => c.currentStatus === 'failed' || c.currentStatus === 'missed').length;
    const groupOk = group.checks.filter(c => c.currentStatus === 'success').length;

    const card = document.createElement('div');
    card.style.cssText = 'background:#0f1929;border:1px solid #1e293b;border-radius:10px;margin-bottom:16px;overflow:hidden;';

    // Group header
    const groupHeader = document.createElement('div');
    groupHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#111827;border-bottom:1px solid #1e293b;';
    const groupName = document.createElement('span');
    groupName.style.cssText = `font-size:15px;font-weight:700;color:#f1f5f9;font-family:${FONT};`;
    groupName.textContent = group.customerName;
    const groupStats = document.createElement('div');
    groupStats.style.cssText = 'display:flex;gap:12px;font-size:12px;';
    if (groupOk > 0) {
      const ok = document.createElement('span');
      ok.style.color = '#22c55e';
      ok.style.fontFamily = FONT;
      ok.textContent = `${groupOk} OK`;
      groupStats.appendChild(ok);
    }
    if (groupFailed > 0) {
      const fail = document.createElement('span');
      fail.style.cssText = `color:#ef4444;font-weight:700;font-family:${FONT};`;
      fail.textContent = `${groupFailed} Problem(e)`;
      groupStats.appendChild(fail);
    }
    const total = document.createElement('span');
    total.style.cssText = `color:#475569;font-family:${FONT};`;
    total.textContent = `${group.checks.length} Checks`;
    groupStats.appendChild(total);
    groupHeader.appendChild(groupName);
    groupHeader.appendChild(groupStats);
    card.appendChild(groupHeader);

    // Column headers
    const colHeader = document.createElement('div');
    colHeader.style.cssText = 'display:grid;grid-template-columns:20px 1fr auto 130px 110px;gap:12px;padding:6px 16px;border-bottom:1px solid #1e293b;';
    colHeader.innerHTML = `
      <div></div>
      <span style="color:#475569;font-size:11px;font-weight:600;text-transform:uppercase;font-family:${FONT};">Name</span>
      <span style="color:#475569;font-size:11px;font-weight:600;text-transform:uppercase;font-family:${FONT};">Historie</span>
      <span style="color:#475569;font-size:11px;font-weight:600;text-transform:uppercase;text-align:right;font-family:${FONT};">Letzte E-Mail</span>
      <span style="color:#475569;font-size:11px;font-weight:600;text-transform:uppercase;text-align:right;font-family:${FONT};">Status</span>
    `;
    card.appendChild(colHeader);

    // Check rows
    for (const check of group.checks) {
      const color = backupStatusColor(check.currentStatus);
      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:20px 1fr auto 130px 110px;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid #1e293b;';

      const dot = document.createElement('div');
      dot.style.cssText = `width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;`;

      const name = document.createElement('span');
      name.style.cssText = `color:#e2e8f0;font-size:14px;font-weight:500;font-family:${FONT};`;
      name.textContent = check.name;

      const hist = buildHistoryDots(check.recentResults);

      const lastMail = document.createElement('span');
      lastMail.style.cssText = `color:#64748b;font-size:12px;text-align:right;font-family:${FONT};`;
      lastMail.textContent = backupFormatRelative(check.lastReceivedAt);

      const statusEl = document.createElement('span');
      statusEl.style.cssText = `font-size:12px;font-weight:600;color:${color};text-align:right;font-family:${FONT};`;
      statusEl.textContent = backupStatusLabel(check.currentStatus);

      row.appendChild(dot);
      row.appendChild(name);
      row.appendChild(hist);
      row.appendChild(lastMail);
      row.appendChild(statusEl);
      card.appendChild(row);
    }

    content.appendChild(card);
  }
}

async function fetchAndShowBackups() {
  const content = document.getElementById('nf-backup-content');
  if (content) {
    content.innerHTML = '<div style="color:#94a3b8;padding:32px;text-align:center;font-family:Inter,Segoe UI,sans-serif;">Lade Backup-Daten…</div>';
  }
  let lastError = null;
  for (const endpoint of BACKUP_API_CANDIDATES) {
    try {
      const res = await fetch(endpoint, { cache: 'no-store' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg = body?.error || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      renderBackupTable(await res.json());
      return;
    } catch (err) { lastError = err; }
  }
  if (content) {
    content.innerHTML = `<div style="color:#991b1b;padding:32px;text-align:center;font-family:Inter,Segoe UI,sans-serif;">Fehler: ${lastError?.message || 'Lokale API nicht erreichbar'}</div>`;
  }
}

function buildBackupPanel() {
  const panel = document.createElement('div');
  panel.id = BACKUP_PANEL_ID;
  Object.assign(panel.style, {
    position: 'fixed', top: '0', right: '0',
    width: '860px', maxWidth: '92vw', height: '100vh',
    background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.18)',
    zIndex: '99999', display: 'flex', flexDirection: 'column',
    transform: 'translateX(100%)', transition: 'transform 0.25s ease',
  });

  const header = document.createElement('div');
  Object.assign(header.style, {
    padding: '14px 20px', borderBottom: '1px solid #334155',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: '#1e293b', flexShrink: '0',
  });

  const left = document.createElement('div');
  left.style.display = 'flex';
  left.style.alignItems = 'center';
  left.style.gap = '10px';
  left.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`;
  const title = document.createElement('span');
  Object.assign(title.style, { fontSize: '15px', fontWeight: '700', color: '#f1f5f9', fontFamily: 'Inter,Segoe UI,sans-serif' });
  title.textContent = 'Backup-Übersicht';
  left.appendChild(title);

  const closeBtn = document.createElement('button');
  Object.assign(closeBtn.style, {
    background: 'none', border: 'none', color: '#94a3b8',
    fontSize: '22px', cursor: 'pointer', padding: '2px 8px',
    borderRadius: '4px', lineHeight: '1',
  });
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', closeBackupPanel);

  header.appendChild(left);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  const content = document.createElement('div');
  content.id = 'nf-backup-content';
  Object.assign(content.style, { flex: '1', overflow: 'auto', padding: '24px', background: '#0a111e' });
  panel.appendChild(content);

  const backdrop = document.createElement('div');
  backdrop.id = BACKUP_BACKDROP_ID;
  Object.assign(backdrop.style, {
    position: 'fixed', top: '0', left: '0', right: '0', bottom: '0',
    background: 'rgba(0,0,0,0.3)', zIndex: '99998',
  });
  backdrop.addEventListener('click', closeBackupPanel);

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);

  requestAnimationFrame(() => requestAnimationFrame(() => {
    panel.style.transform = 'translateX(0)';
  }));
}

function buildBackupSidebarButton() {
  const btn = document.createElement('button');
  btn.id = BACKUP_BTN_ID;
  btn.type = 'button';
  btn.title = 'Backup-Übersicht';
  Object.assign(btn.style, {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '100%', padding: '8px 4px',
    background: 'transparent', border: 'none', cursor: 'pointer',
    borderRadius: '6px', color: '#6b7280',
  });
  btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`;
  btn.addEventListener('mouseenter', () => {
    btn.style.color = '#111827';
    btn.style.background = 'rgba(0,0,0,0.06)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.color = '#6b7280';
    btn.style.background = 'transparent';
  });
  btn.addEventListener('click', () => {
    if (document.getElementById(BACKUP_PANEL_ID)) {
      closeBackupPanel();
    } else {
      closeUpdatesPanel();
      buildBackupPanel();
      fetchAndShowBackups();
    }
  });
  return btn;
}

// ── Sidebar Injection ──────────────────────────────────────────────────────────

function findAdminListItem() {
  const adminLink =
    document.querySelector('a[href="#/administration/general/settings"]') ||
    document.querySelector('a[aria-label="Administration"]');
  if (!adminLink) return null;

  let target = adminLink.closest('li');
  if (!target) {
    target = adminLink.parentElement;
    while (target && target.tagName !== 'LI' && target !== document.body) {
      target = target.parentElement;
    }
  }
  return target && target !== document.body ? target : null;
}

function injectSidebarButtons() {
  if (document.getElementById(UPDATES_BTN_ID) && document.getElementById(BACKUP_BTN_ID)) return true;

  const adminItem = findAdminListItem();
  if (!adminItem || !adminItem.parentElement) return false;

  if (!document.getElementById(BACKUP_BTN_ID)) {
    const backupWrapper = document.createElement('li');
    backupWrapper.style.listStyle = 'none';
    backupWrapper.appendChild(buildBackupSidebarButton());
    adminItem.parentElement.insertBefore(backupWrapper, adminItem);
  }

  if (!document.getElementById(UPDATES_BTN_ID)) {
    const updatesWrapper = document.createElement('li');
    updatesWrapper.style.listStyle = 'none';
    updatesWrapper.appendChild(buildUpdatesSidebarButton());
    const backupItem = document.getElementById(BACKUP_BTN_ID)?.closest('li');
    adminItem.parentElement.insertBefore(updatesWrapper, backupItem || adminItem);
  }

  return true;
}

function boot() {
  if (injectSidebarButtons()) return;

  const observer = new MutationObserver(() => {
    if (injectSidebarButtons()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 30000);
}

boot();

// ── NetFactory Monitoring Panel ────────────────────────────────────────────────

const PANEL_BTN_ID     = 'nf-monitoring-btn';
const PANEL_ID         = 'nf-monitoring-panel';
const BACKDROP_ID      = 'nf-monitoring-backdrop';

function closePanel() {
  const panel    = document.getElementById(PANEL_ID);
  const backdrop = document.getElementById(BACKDROP_ID);
  if (panel) {
    panel.style.transform = 'translateX(100%)';
    setTimeout(() => panel.remove(), 260);
  }
  if (backdrop) backdrop.remove();
}

async function buildPanel() {
  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  Object.assign(panel.style, {
    position: 'fixed', top: '0', right: '0',
    width: '1100px', maxWidth: '96vw', height: '100vh',
    background: '#1e293b', boxShadow: '-4px 0 32px rgba(0,0,0,0.25)',
    zIndex: '99999', display: 'flex', flexDirection: 'column',
    transform: 'translateX(100%)', transition: 'transform 0.25s ease',
  });

  // Header
  const header = document.createElement('div');
  Object.assign(header.style, {
    padding: '14px 20px', borderBottom: '1px solid #334155',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: '#0f172a', flexShrink: '0',
  });

  const left = document.createElement('div');
  left.style.cssText = 'display:flex;align-items:center;gap:10px;';
  left.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>`;
  const title = document.createElement('span');
  Object.assign(title.style, {
    fontSize: '15px', fontWeight: '700', color: '#f1f5f9',
    fontFamily: 'Inter,Segoe UI,sans-serif',
  });
  title.textContent = 'NetFactory Monitoring';
  left.appendChild(title);

  const closeBtn = document.createElement('button');
  Object.assign(closeBtn.style, {
    background: 'none', border: 'none', color: '#94a3b8',
    fontSize: '22px', cursor: 'pointer', padding: '2px 8px',
    borderRadius: '4px', lineHeight: '1',
  });
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', closePanel);

  header.appendChild(left);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  // Widget iframe (fills the panel)
  const frame = document.createElement('iframe');
  const runtimeAPI = typeof browser !== 'undefined' ? browser : chrome;
  const ninjaUid = await getNinjaUid();
  const widgetBase = runtimeAPI.runtime.getURL('widget.html');
  frame.src = ninjaUid ? `${widgetBase}?ninja_uid=${encodeURIComponent(ninjaUid)}` : widgetBase;
  frame.title = 'NetFactory Monitoring';
  Object.assign(frame.style, { flex: '1', width: '100%', border: '0', display: 'block' });
  panel.appendChild(frame);

  // Backdrop
  const backdrop = document.createElement('div');
  backdrop.id = BACKDROP_ID;
  Object.assign(backdrop.style, {
    position: 'fixed', top: '0', left: '0', right: '0', bottom: '0',
    background: 'rgba(0,0,0,0.3)', zIndex: '99998',
  });
  backdrop.addEventListener('click', closePanel);

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);

  requestAnimationFrame(() => requestAnimationFrame(() => {
    panel.style.transform = 'translateX(0)';
  }));
}

function buildSidebarButton() {
  const btn = document.createElement('button');
  btn.id = PANEL_BTN_ID;
  btn.type = 'button';
  btn.title = 'NetFactory Monitoring';
  Object.assign(btn.style, {
    display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
    gap: '10px',
    width: '100%', padding: '8px 16px',
    background: 'transparent', border: 'none', cursor: 'pointer',
    borderRadius: '6px', color: '#ecf2f7',
    fontFamily: 'Inter,"Segoe UI",Arial,sans-serif',
    overflow: 'hidden',
  });
  btn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
    <span style="font-size:14px;font-weight:500;white-space:nowrap;margin-left:6px;">NetFactory Monitoring</span>
  `;
  btn.addEventListener('mouseenter', () => {
    btn.style.color = '#111827';
    btn.style.background = 'rgba(0,0,0,0.06)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.color = '#e6eeff';
    btn.style.background = 'transparent';
  });
  btn.addEventListener('click', () => {
    if (document.getElementById(PANEL_ID)) {
      closePanel();
    } else {
      buildPanel();
    }
  });
  return btn;
}

// ── NinjaOne User Detection via sessionproperties ─────────────────────────────

let cachedNinjaUid = null;

async function getNinjaUid() {
  if (cachedNinjaUid) return cachedNinjaUid;
  try {
    const res = await fetch(
      `${window.location.origin}/ws/webapp/sessionproperties`,
      { credentials: 'include', cache: 'no-store' }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const uid = data.appUserUid || data.userUid || null;
    if (uid) cachedNinjaUid = uid;
    return uid;
  } catch {
    return null;
  }
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
  if (document.getElementById(PANEL_BTN_ID)) return true;

  const adminItem = findAdminListItem();
  if (!adminItem || !adminItem.parentElement) return false;

  const wrapper = document.createElement('li');
  wrapper.style.cssText = 'list-style:none;overflow:hidden;';
  wrapper.appendChild(buildSidebarButton());
  adminItem.parentElement.insertBefore(wrapper, adminItem);

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

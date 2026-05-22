const API_BASE_CANDIDATES = [
  "http://localhost:3001/api",
  "http://127.0.0.1:3001/api"
];

const REFRESH_INTERVAL_MS = 30000;

// ── Auth ──────────────────────────────────────────────────────────────────────
const AUTH_KEY = 'nf_widget_token';
let authToken = sessionStorage.getItem(AUTH_KEY);

// Navigation state
let groupBy = "software";      // "software" | "kunde" | "sophos" | "backup"
let currentView = "list";      // "list" | "detail"
let selectedCustomerId = null;
let resolvedBase = null;
let backupSubView = "status";  // "status" | "manage"

const elements = {
  root: document.getElementById("widget-root"),
  content: document.getElementById("content"),
  apiSource: document.getElementById("api-source"),
  lastSync: document.getElementById("last-sync"),
  errorBox: document.getElementById("error-box"),
  toggleSoftware: document.getElementById("toggle-software"),
  toggleKunde: document.getElementById("toggle-kunde"),
  toggleSophos: document.getElementById("toggle-sophos"),
  toggleBackup: document.getElementById("toggle-backup"),
};

const STATUS_LABEL = {
  "update-available": "Update verfügbar",
  "major-update": "Major Update",
  "up-to-date": "Aktuell",
  "unknown": "Unbekannt"
};

const STATUS_COLOR = {
  "update-available": { bg: "#78350f", color: "#fbbf24" },
  "major-update":     { bg: "#7f1d1d", color: "#fca5a5" },
  "up-to-date":       { bg: "#065f46", color: "#6ee7b7" },
  "unknown":          { bg: "#374151", color: "#9ca3af" },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function setError(message) {
  elements.errorBox.textContent = message;
  elements.errorBox.classList.remove("hidden");
}

function clearError() {
  elements.errorBox.textContent = "";
  elements.errorBox.classList.add("hidden");
}

function updateTimestamp() {
  elements.lastSync.textContent = new Date().toLocaleTimeString("de-DE");
}

function formatVersion(version) {
  return String(version || "").replace(/\+[^\s]+$/, "").trim();
}

function sendHeight() {
  const height = Math.ceil(elements.root.getBoundingClientRect().height);
  window.parent.postMessage({ type: "NF_WIDGET_HEIGHT", height }, "*");
}

function calcStatus(devices) {
  const statuses = devices.map(d => d.status);
  if (statuses.includes("major-update"))   return { label: STATUS_LABEL["major-update"],   border: "#7f1d1d", pillBg: "#7f1d1d", pillColor: "#fca5a5" };
  if (statuses.includes("update-available")) return { label: STATUS_LABEL["update-available"], border: "#78350f", pillBg: "#78350f", pillColor: "#fbbf24" };
  if (statuses.length > 0 && statuses.every(s => s === "up-to-date")) return { label: STATUS_LABEL["up-to-date"], border: "#065f46", pillBg: "#065f46", pillColor: "#6ee7b7" };
  return { label: STATUS_LABEL.unknown, border: "#374151", pillBg: "#374151", pillColor: "#9ca3af" };
}

function backupBadgeClass(status) {
  if (status === "success") return "badge-backup-ok";
  if (status === "failed" || status === "missed") return "badge-backup-warn";
  if (status === "none") return null;
  return "badge-backup-unknown";
}

function backupBadgeLabel(status) {
  if (status === "success") return "Backup OK";
  if (status === "failed")  return "Backup Fehler";
  if (status === "missed")  return "Backup ausgeblieben";
  if (status === "unknown") return "Backup unbekannt";
  return null;
}

function backupStatusColor(status) {
  if (status === "success") return "#22c55e";
  if (status === "failed" || status === "missed") return "#ef4444";
  return "#64748b";
}

function backupStatusLabel(status) {
  if (status === "success") return "OK";
  if (status === "failed")  return "Fehler";
  if (status === "missed")  return "Ausgeblieben";
  return "Unbekannt";
}

function backupFormatRelative(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return `vor ${Math.floor(diff / 60_000)} Min.`;
  if (h < 24) return `vor ${h} Std.`;
  return `vor ${Math.floor(h / 24)} Tag(en)`;
}

function buildHistoryDots(recentResults) {
  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex;gap:3px;align-items:center;margin-top:4px;";
  if (!recentResults || recentResults.length === 0) {
    const empty = document.createElement("span");
    empty.style.cssText = "color:#475569;font-size:11px;";
    empty.textContent = "Keine Daten";
    wrap.appendChild(empty);
    return wrap;
  }
  const dotColor = s => s === "success" ? "#22c55e" : "#ef4444";
  const dotTitle = s => s === "success" ? "OK" : s === "failed" ? "Fehler" : "Ausgeblieben";
  [...recentResults].reverse().forEach(r => {
    const dot = document.createElement("div");
    dot.title = `${new Date(r.slotEnd).toLocaleString("de-DE")} — ${dotTitle(r.status)}`;
    dot.style.cssText = `width:9px;height:9px;border-radius:50%;background:${dotColor(r.status)};flex-shrink:0;opacity:${r.status === "missed" ? "0.45" : "1"};`;
    wrap.appendChild(dot);
  });
  return wrap;
}

// ── API ────────────────────────────────────────────────────────────────────────

async function fetchFromApi(path) {
  let lastError = null;
  const candidates = resolvedBase ? [resolvedBase] : API_BASE_CANDIDATES;
  for (const base of candidates) {
    try {
      const headers = authToken ? { "Authorization": `Bearer ${authToken}` } : {};
      const res = await fetch(`${base}${path}`, { cache: "no-store", headers });
      if (res.status === 401) {
        authToken = null;
        sessionStorage.removeItem(AUTH_KEY);
        showAuthError("Sitzung abgelaufen. Bitte Seite neu laden.");
        throw new Error("Unauthorized");
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!resolvedBase) {
        resolvedBase = base;
        elements.apiSource.textContent = base.replace("/api", "");
      }
      return await res.json();
    } catch (err) {
      lastError = err;
      if (err.message !== "Unauthorized") resolvedBase = null;
    }
  }
  throw lastError || new Error("Lokale API nicht erreichbar.");
}

const fetchProducts        = () => fetchFromApi("/products");
const fetchCustomers       = () => fetchFromApi("/customers");
const fetchCustomerDetail  = id => fetchFromApi(`/customers/${id}`);
const fetchSophosOverview  = () => fetchFromApi("/sophos/overview");
const fetchBackupStatus    = () => fetchFromApi("/backup/status");
const fetchBackupAccounts  = () => fetchFromApi("/admin/backup-accounts");
const fetchBackupChecks    = () => fetchFromApi("/admin/backup-checks");

async function callApi(method, path, body) {
  const base = resolvedBase;
  if (!base) throw new Error("API nicht erreichbar");
  const headers = { "Content-Type": "application/json" };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  const res = await fetch(`${base}${path}`, {
    method, headers, cache: "no-store",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (res.status === 401) {
    authToken = null;
    sessionStorage.removeItem(AUTH_KEY);
    showAuthError("Sitzung abgelaufen. Bitte Seite neu laden.");
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function decodeHtml(text) {
  const txt = document.createElement("textarea");
  txt.innerHTML = text;
  return txt.value;
}

// ── Shared: build + render a paginated table with customer grouping ────────────

const PAGE_SIZE = 30;

function makePill(status) {
  const sc = STATUS_COLOR[status] || STATUS_COLOR.unknown;
  const pill = document.createElement("span");
  pill.className = "device-pill";
  pill.style.backgroundColor = sc.bg;
  pill.style.color = sc.color;
  pill.textContent = STATUS_LABEL[status] || STATUS_LABEL.unknown;
  return pill;
}

/**
 * Builds a self-contained paginated table section (collapsible per customer).
 * columns: ["Kunde","Gerät","Installiert","Aktuell","Status"] when hasCustomerCol=true
 *          ["Gerät","Quelle","Installiert","Aktuell","Status"] when hasCustomerCol=false
 *
 * rows: array of { kind:"header", id, name, outdated, total }
 *             or { kind:"device", customerId, device, source? }
 */
function buildTableSection({ rows: initialRows, hasCustomerCol, showHostname = false, onHeightChange }) {
  const wrap = document.createElement("div");
  wrap.className = "prod-table-wrap";

  let currentPage = 0;
  // For customer-grouped mode: track which customers are expanded
  const expandedMap = {};
  if (hasCustomerCol) {
    initialRows.forEach(r => { if (r.kind === "header") expandedMap[r.id] = true; });
  }

  function getDisplayRows() {
    if (!hasCustomerCol) return initialRows; // no grouping, all device rows
    const out = [];
    for (const r of initialRows) {
      if (r.kind === "header") {
        out.push(r);
        if (expandedMap[r.id]) {
          initialRows.forEach(dr => { if (dr.kind === "device" && dr.customerId === r.id) out.push(dr); });
        }
      }
    }
    return out;
  }

  function render() {
    wrap.innerHTML = "";
    const allRows = getDisplayRows();
    const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE));
    const safePage = Math.min(currentPage, totalPages - 1);
    const pageRows = allRows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

    // Table
    const table = document.createElement("table");
    table.className = "prod-table";

    const thead = document.createElement("thead");
    const headTr = document.createElement("tr");
    const cols = hasCustomerCol
      ? (showHostname ? ["Kunde", "Hostname", "Gerät", "Installiert", "Aktuell", "Status"] : ["Kunde", "Gerät", "Installiert", "Aktuell", "Status"])
      : (showHostname ? ["Hostname", "Gerät", "Quelle", "Installiert", "Aktuell", "Status"] : ["Gerät", "Quelle", "Installiert", "Aktuell", "Status"]);
    cols.forEach(col => {
      const th = document.createElement("th");
      th.textContent = col;
      headTr.appendChild(th);
    });
    thead.appendChild(headTr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    pageRows.forEach(row => {
      if (row.kind === "header") {
        const tr = document.createElement("tr");
        tr.className = "customer-hdr-row";
        tr.addEventListener("click", () => {
          expandedMap[row.id] = !expandedMap[row.id];
          currentPage = 0;
          render();
          if (onHeightChange) onHeightChange();
        });
        const td = document.createElement("td");
        td.colSpan = showHostname ? 6 : 5;

        const arrow = document.createElement("span");
        arrow.className = "cust-hdr-arrow";
        arrow.textContent = expandedMap[row.id] ? "▾" : "▸";

        const name = document.createElement("span");
        name.className = "cust-hdr-name";
        name.textContent = row.name;

        td.appendChild(arrow);
        td.appendChild(name);

        if (row.outdated > 0) {
          const badge = document.createElement("span");
          badge.className = "cust-hdr-badge";
          badge.textContent = `${row.outdated} Update${row.outdated !== 1 ? "s" : ""}`;
          td.appendChild(badge);
        }

        const count = document.createElement("span");
        count.className = "cust-hdr-count";
        count.textContent = `${row.total} Gerät${row.total !== 1 ? "e" : ""}`;
        td.appendChild(count);

        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
      }

      // Device row
      const d = row.device;
      const tr = document.createElement("tr");

      if (hasCustomerCol) {
        if (showHostname) {
          const tdHost = document.createElement("td");
          tdHost.className = "col-mono";
          tdHost.style.cssText = "color:#64748b;padding-left:20px;";
          tdHost.textContent = d.hostname || "—";
          tr.appendChild(tdHost);
        } else {
          const tdIndent = document.createElement("td");
          tdIndent.className = "device-indent";
          tdIndent.textContent = "—";
          tr.appendChild(tdIndent);
        }
      } else if (showHostname) {
        const tdHost = document.createElement("td");
        tdHost.className = "col-mono";
        tdHost.style.cssText = "color:#64748b;";
        tdHost.textContent = d.hostname || "—";
        tr.appendChild(tdHost);
      }

      const tdName = document.createElement("td");
      tdName.className = "col-name";
      tdName.textContent = d.name || "";
      tr.appendChild(tdName);

      if (!hasCustomerCol) {
        const tdSource = document.createElement("td");
        tdSource.className = "col-source";
        tdSource.textContent = row.source || "";
        tr.appendChild(tdSource);
      }

      const tdCurrent = document.createElement("td");
      tdCurrent.className = "col-mono";
      tdCurrent.textContent = formatVersion(d.currentVersion);
      tr.appendChild(tdCurrent);

      const tdLatest = document.createElement("td");
      tdLatest.className = "col-mono";
      tdLatest.textContent = d.latestVersion ? formatVersion(d.latestVersion) : "—";
      tr.appendChild(tdLatest);

      const tdStatus = document.createElement("td");
      tdStatus.className = "col-status";
      tdStatus.appendChild(makePill(d.status));
      tr.appendChild(tdStatus);

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrap.appendChild(table);

    // Pagination
    if (totalPages > 1) {
      const pager = document.createElement("div");
      pager.className = "table-pager";

      const info = document.createElement("span");
      info.className = "pager-info";
      info.textContent = `Zeilen ${safePage * PAGE_SIZE + 1}–${Math.min((safePage + 1) * PAGE_SIZE, allRows.length)} von ${allRows.length}`;
      pager.appendChild(info);

      const btns = document.createElement("div");
      btns.className = "pager-btns";

      function mkBtn(label, disabled, onClick) {
        const b = document.createElement("button");
        b.className = "pager-btn";
        b.textContent = label;
        b.disabled = disabled;
        if (!disabled) b.addEventListener("click", () => { onClick(); render(); if (onHeightChange) onHeightChange(); });
        return b;
      }

      btns.appendChild(mkBtn("«", safePage === 0, () => { currentPage = 0; }));
      btns.appendChild(mkBtn("‹", safePage === 0, () => { currentPage = safePage - 1; }));

      const start = Math.max(0, safePage - 2);
      const end = Math.min(totalPages - 1, safePage + 2);
      if (start > 0) { const d = document.createElement("span"); d.textContent = "…"; d.style.cssText = "color:#475569;font-size:11px;padding:0 3px;"; btns.appendChild(d); }
      for (let i = start; i <= end; i++) {
        const b = document.createElement("button");
        b.className = "pager-btn" + (i === safePage ? " active" : "");
        b.textContent = String(i + 1);
        if (i !== safePage) b.addEventListener("click", () => { currentPage = i; render(); if (onHeightChange) onHeightChange(); });
        btns.appendChild(b);
      }
      if (end < totalPages - 1) { const d = document.createElement("span"); d.textContent = "…"; d.style.cssText = "color:#475569;font-size:11px;padding:0 3px;"; btns.appendChild(d); }

      btns.appendChild(mkBtn("›", safePage === totalPages - 1, () => { currentPage = safePage + 1; }));
      btns.appendChild(mkBtn("»", safePage === totalPages - 1, () => { currentPage = totalPages - 1; }));

      pager.appendChild(btns);
      wrap.appendChild(pager);
    }
  }

  render();
  return wrap;
}

// ── Render: Software view ──────────────────────────────────────────────────────

function renderProduct(product) {
  const outdatedCount = product.customers.reduce(
    (s, c) => s + c.devices.filter(d => d.status === "update-available" || d.status === "major-update").length, 0
  );
  const totalDevices = product.customers.reduce((s, c) => s + c.devices.length, 0);

  // Section wrapper
  const section = document.createElement("section");
  section.className = "prod-section" + (outdatedCount > 0 ? " has-updates" : "");

  // Header
  let isExpanded = outdatedCount > 0;
  const header = document.createElement("div");
  header.className = "prod-section-header";

  const left = document.createElement("div");
  left.className = "prod-section-left";

  const arrow = document.createElement("span");
  arrow.className = "prod-section-arrow";
  arrow.textContent = isExpanded ? "▾" : "▸";

  const nameEl = document.createElement("span");
  nameEl.className = "prod-section-name";
  nameEl.textContent = product.productName || product.product;

  left.appendChild(arrow);
  left.appendChild(nameEl);

  if (product.latestVersion) {
    const ver = document.createElement("span");
    ver.className = "prod-section-ver";
    if (product.releaseUrl) {
      const a = document.createElement("a");
      a.href = product.releaseUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = formatVersion(product.latestVersion);
      a.addEventListener("click", e => e.stopPropagation());
      ver.appendChild(a);
    } else {
      ver.textContent = formatVersion(product.latestVersion);
    }
    left.appendChild(ver);
  }

  const right = document.createElement("div");
  right.className = "prod-section-right";

  if (outdatedCount > 0) {
    const upd = document.createElement("span");
    upd.className = "prod-section-updates";
    upd.textContent = `${outdatedCount} Update${outdatedCount !== 1 ? "s" : ""}`;
    right.appendChild(upd);
  }

  const cnt = document.createElement("span");
  cnt.className = "prod-section-count";
  cnt.textContent = `${totalDevices} Gerät${totalDevices !== 1 ? "e" : ""}`;
  right.appendChild(cnt);

  header.appendChild(left);
  header.appendChild(right);

  // Build display rows for table
  const sortedCustomers = product.customers
    .map(c => ({
      ...c,
      filtered: c.devices.filter(d => d.status === "update-available" || d.status === "major-update"),
      outdatedCount: c.devices.filter(d => d.status === "update-available" || d.status === "major-update").length,
    }))
    .filter(c => c.filtered.length > 0)
    .sort((a, b) => b.outdatedCount - a.outdatedCount || a.name.localeCompare(b.name, "de"));

  const rows = [];
  for (const c of sortedCustomers) {
    rows.push({ kind: "header", id: c.id, name: c.name, outdated: c.outdatedCount, total: c.devices.length });
    c.filtered.forEach(d => rows.push({ kind: "device", customerId: c.id, device: d }));
  }

  // Table body (hidden when collapsed)
  const isSophos = product.product === "sophos-firewall";
  const tableWrap = buildTableSection({ rows, hasCustomerCol: true, showHostname: isSophos, onHeightChange: sendHeight });
  tableWrap.style.display = isExpanded ? "" : "none";

  header.addEventListener("click", () => {
    isExpanded = !isExpanded;
    arrow.textContent = isExpanded ? "▾" : "▸";
    tableWrap.style.display = isExpanded ? "" : "none";
    sendHeight();
  });

  section.appendChild(header);
  if (rows.length > 0) section.appendChild(tableWrap);
  if (product.error) setError(product.error);
  return section;
}

function renderSoftware(products) {
  elements.content.innerHTML = "";
  const withUpdates = products.filter(p =>
    p.customers.some(c => c.devices.some(d => d.status === "update-available" || d.status === "major-update"))
  );
  if (withUpdates.length === 0) {
    elements.content.innerHTML = '<div class="loading">Alle Geräte sind aktuell.</div>';
    sendHeight();
    return;
  }
  for (const product of withUpdates) elements.content.appendChild(renderProduct(product));
  sendHeight();
}

// ── Render: Kunden list ────────────────────────────────────────────────────────

function renderCustomers(customers) {
  elements.content.innerHTML = "";

  if (customers.length === 0) {
    elements.content.innerHTML = '<div class="loading">Keine Kunden vorhanden.</div>';
    sendHeight();
    return;
  }

  const grid = document.createElement("div");
  grid.className = "customer-overview-grid";

  for (const customer of customers) {
    const card = document.createElement("div");
    card.className = "customer-overview-card";
    if (customer.outdatedDevices > 0) card.classList.add("has-updates");
    if (customer.backupStatus === "failed" || customer.backupStatus === "missed") card.classList.add("has-backup-issue");

    card.addEventListener("click", () => navigate("detail", customer.id));

    const name = document.createElement("div");
    name.className = "customer-overview-name";
    name.textContent = customer.name;
    card.appendChild(name);

    const badges = document.createElement("div");
    badges.className = "customer-overview-badges";

    if (customer.outdatedDevices > 0) {
      const b = document.createElement("span");
      b.className = "badge badge-update";
      b.textContent = `${customer.outdatedDevices} Update${customer.outdatedDevices === 1 ? "" : "s"}`;
      badges.appendChild(b);
    } else if (customer.totalDevices > 0) {
      const b = document.createElement("span");
      b.className = "badge badge-ok";
      b.textContent = "Alle aktuell";
      badges.appendChild(b);
    }

    const backupClass = backupBadgeClass(customer.backupStatus);
    const backupLabel = backupBadgeLabel(customer.backupStatus);
    if (backupClass && backupLabel) {
      const b = document.createElement("span");
      b.className = `badge ${backupClass}`;
      b.textContent = backupLabel;
      badges.appendChild(b);
    }

    card.appendChild(badges);

    const meta = document.createElement("div");
    meta.className = "customer-overview-meta";
    meta.textContent = `${customer.totalDevices} Gerät${customer.totalDevices === 1 ? "" : "e"}`;
    card.appendChild(meta);

    grid.appendChild(card);
  }

  elements.content.appendChild(grid);
  sendHeight();
}

// ── Render: Kunden detail ──────────────────────────────────────────────────────

function sourceLabel(source) {
  if (source === "ninjaone") return "NinjaOne";
  if (source === "unifi") return "UniFi";
  return "Sophos";
}

function renderCustomerDetail(detail) {
  elements.content.innerHTML = "";

  // Back button + header
  const header = document.createElement("div");
  header.className = "detail-header";

  const backBtn = document.createElement("button");
  backBtn.className = "detail-back-btn";
  backBtn.type = "button";
  backBtn.innerHTML = "&#8592; Kunden";
  backBtn.addEventListener("click", () => navigate("list"));
  header.appendChild(backBtn);

  const customerName = document.createElement("h2");
  customerName.className = "detail-customer-name";
  customerName.textContent = detail.name;
  header.appendChild(customerName);

  const totalDevices = detail.products.reduce((s, p) => s + p.devices.length, 0);
  const outdatedDevices = detail.products.reduce((s, p) =>
    s + p.devices.filter(d => d.status === "update-available" || d.status === "major-update").length, 0);

  const summaryEl = document.createElement("p");
  summaryEl.className = "detail-summary";
  summaryEl.textContent = `${totalDevices} Gerät${totalDevices === 1 ? "" : "e"}`;
  if (outdatedDevices > 0) {
    const span = document.createElement("span");
    span.style.cssText = "color:#fbbf24;margin-left:10px;";
    span.textContent = `${outdatedDevices} Update${outdatedDevices === 1 ? "" : "s"} verfügbar`;
    summaryEl.appendChild(span);
  }
  header.appendChild(summaryEl);
  elements.content.appendChild(header);

  // Products as collapsible table sections
  if (detail.products.length > 0) {
    const sectionLabel = document.createElement("div");
    sectionLabel.className = "detail-section-label";
    sectionLabel.textContent = "GERÄTE & VERSIONEN";
    elements.content.appendChild(sectionLabel);

    const sortedProducts = [...detail.products].sort((a, b) => {
      const aOut = a.devices.filter(d => d.status === "update-available" || d.status === "major-update").length;
      const bOut = b.devices.filter(d => d.status === "update-available" || d.status === "major-update").length;
      return bOut - aOut || a.productName.localeCompare(b.productName, "de");
    });

    for (const product of sortedProducts) {
      const outdated = product.devices.filter(d => d.status === "update-available" || d.status === "major-update").length;
      const hasMajor = product.devices.some(d => d.status === "major-update");

      const section = document.createElement("div");
      section.className = "prod-section" + (outdated > 0 ? " has-updates" : "");
      if (hasMajor) section.style.borderColor = "rgba(127,29,29,0.5)";

      // Section header
      let isExpanded = outdated > 0;
      const secHeader = document.createElement("div");
      secHeader.className = "prod-section-header";

      const secLeft = document.createElement("div");
      secLeft.className = "prod-section-left";

      const arrow = document.createElement("span");
      arrow.className = "prod-section-arrow";
      arrow.textContent = isExpanded ? "▾" : "▸";

      const pName = document.createElement("span");
      pName.className = "prod-section-name";
      pName.textContent = product.productName;

      secLeft.appendChild(arrow);
      secLeft.appendChild(pName);

      if (product.latestVersion) {
        const ver = document.createElement("span");
        ver.className = "prod-section-ver";
        if (product.releaseUrl) {
          const a = document.createElement("a");
          a.href = product.releaseUrl;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = formatVersion(product.latestVersion);
          a.addEventListener("click", e => e.stopPropagation());
          ver.appendChild(a);
        } else {
          ver.textContent = formatVersion(product.latestVersion);
        }
        secLeft.appendChild(ver);
      }

      const secRight = document.createElement("div");
      secRight.className = "prod-section-right";
      if (outdated > 0) {
        const upd = document.createElement("span");
        upd.className = "prod-section-updates";
        upd.textContent = `${outdated} Update${outdated !== 1 ? "s" : ""}`;
        secRight.appendChild(upd);
      }
      const cnt = document.createElement("span");
      cnt.className = "prod-section-count";
      cnt.textContent = `${product.devices.length} Gerät${product.devices.length !== 1 ? "e" : ""}`;
      secRight.appendChild(cnt);

      secHeader.appendChild(secLeft);
      secHeader.appendChild(secRight);

      // Table (Gerät | Quelle | Installiert | Aktuell | Status)
      const rows = product.devices.map(d => ({
        kind: "device",
        device: d,
        source: sourceLabel(d.source),
      }));

      const tableWrap = buildTableSection({ rows, hasCustomerCol: false, showHostname: product.productId === "sophos-firewall", onHeightChange: sendHeight });
      tableWrap.style.display = isExpanded ? "" : "none";

      secHeader.addEventListener("click", () => {
        isExpanded = !isExpanded;
        arrow.textContent = isExpanded ? "▾" : "▸";
        tableWrap.style.display = isExpanded ? "" : "none";
        sendHeight();
      });

      section.appendChild(secHeader);
      section.appendChild(tableWrap);
      elements.content.appendChild(section);
    }
  } else {
    const empty = document.createElement("p");
    empty.style.cssText = "color:#64748b;font-size:13px;margin:4px 0 16px;";
    empty.textContent = "Keine Geräte zugeordnet";
    elements.content.appendChild(empty);
  }

  // Backup
  if (detail.backup && detail.backup.length > 0) {
    const backupLabel = document.createElement("div");
    backupLabel.className = "detail-section-label";
    backupLabel.textContent = "BACKUP-CHECKS";
    elements.content.appendChild(backupLabel);

    const backupGrid = document.createElement("div");
    backupGrid.className = "detail-backup-grid";

    for (const check of detail.backup) {
      const color = backupStatusColor(check.currentStatus);
      const card = document.createElement("div");
      card.className = "detail-backup-card";

      const top = document.createElement("div");
      top.className = "detail-backup-top";

      const checkName = document.createElement("span");
      checkName.className = "detail-backup-name";
      checkName.textContent = check.name;
      top.appendChild(checkName);

      const statusPill = document.createElement("span");
      statusPill.style.cssText = `font-size:11px;font-weight:700;color:${color};padding:2px 7px;border-radius:999px;background:${color}22;border:1px solid ${color}44;white-space:nowrap;`;
      statusPill.textContent = backupStatusLabel(check.currentStatus);
      top.appendChild(statusPill);

      card.appendChild(top);

      const lastMail = document.createElement("div");
      lastMail.style.cssText = "font-size:11px;color:#475569;margin:3px 0;";
      lastMail.textContent = `Letzter Eingang: ${backupFormatRelative(check.lastReceivedAt)}`;
      card.appendChild(lastMail);

      card.appendChild(buildHistoryDots(check.recentResults));
      backupGrid.appendChild(card);
    }

    elements.content.appendChild(backupGrid);
  }

  sendHeight();
}

// ── Render: Backup ─────────────────────────────────────────────────────────────

function renderBackup(data) {
  elements.content.innerHTML = "";
  elements.content.appendChild(renderBackupSubTabs());
  const groups = data?.groups ?? [];

  if (groups.length === 0) {
    elements.content.innerHTML = '<div class="loading">Keine Backup-Checks konfiguriert.</div>';
    sendHeight();
    return;
  }

  const totalChecks  = groups.reduce((s, g) => s + g.checks.length, 0);
  const failedCount  = groups.reduce((s, g) => s + g.checks.filter(c => c.currentStatus === "failed" || c.currentStatus === "missed").length, 0);
  const successCount = groups.reduce((s, g) => s + g.checks.filter(c => c.currentStatus === "success").length, 0);

  const summary = document.createElement("p");
  summary.style.cssText = "color:#64748b;font-size:12px;margin:0 0 14px;";
  summary.textContent = `${totalChecks} Check(s) · ${successCount} OK · ${failedCount} Problem(e)`;
  elements.content.appendChild(summary);

  for (const group of groups) {
    const groupFailed = group.checks.filter(c => c.currentStatus === "failed" || c.currentStatus === "missed").length;
    const groupOk     = group.checks.filter(c => c.currentStatus === "success").length;

    const card = document.createElement("div");
    card.className = "backup-group-card";

    // Group header
    const groupHeader = document.createElement("div");
    groupHeader.className = "backup-group-header";

    const groupName = document.createElement("span");
    groupName.className = "backup-group-name";
    groupName.textContent = group.customerName;

    const groupStats = document.createElement("div");
    groupStats.style.cssText = "display:flex;gap:10px;font-size:11px;";
    if (groupOk > 0) {
      const s = document.createElement("span");
      s.style.color = "#22c55e";
      s.textContent = `${groupOk} OK`;
      groupStats.appendChild(s);
    }
    if (groupFailed > 0) {
      const s = document.createElement("span");
      s.style.cssText = "color:#ef4444;font-weight:700;";
      s.textContent = `${groupFailed} Problem(e)`;
      groupStats.appendChild(s);
    }
    const tot = document.createElement("span");
    tot.style.color = "#475569";
    tot.textContent = `${group.checks.length} Checks`;
    groupStats.appendChild(tot);

    groupHeader.appendChild(groupName);
    groupHeader.appendChild(groupStats);
    card.appendChild(groupHeader);

    // Col header
    const colHdr = document.createElement("div");
    colHdr.className = "backup-col-header";
    colHdr.innerHTML = `
      <span></span>
      <span>Name</span>
      <span>Historie</span>
      <span style="text-align:right;">Letzte E-Mail</span>
      <span style="text-align:right;">Status</span>
    `;
    card.appendChild(colHdr);

    for (const check of group.checks) {
      const color = backupStatusColor(check.currentStatus);
      const row = document.createElement("div");
      row.className = "backup-check-row";

      const dot = document.createElement("div");
      dot.style.cssText = `width:9px;height:9px;border-radius:50%;background:${color};flex-shrink:0;`;

      const name = document.createElement("span");
      name.className = "backup-check-name";
      name.textContent = check.name;

      const hist = buildHistoryDots(check.recentResults);

      const lastMail = document.createElement("span");
      lastMail.style.cssText = "color:#64748b;font-size:11px;text-align:right;";
      lastMail.textContent = backupFormatRelative(check.lastReceivedAt);

      const statusEl = document.createElement("span");
      statusEl.style.cssText = `font-size:11px;font-weight:600;color:${color};text-align:right;`;
      statusEl.textContent = backupStatusLabel(check.currentStatus);

      row.appendChild(dot);
      row.appendChild(name);
      row.appendChild(hist);
      row.appendChild(lastMail);
      row.appendChild(statusEl);
      card.appendChild(row);
    }

    elements.content.appendChild(card);
  }

  sendHeight();
}

// ── Render: Backup Sub-Tabs ───────────────────────────────────────────────────

function renderBackupSubTabs() {
  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;gap:2px;margin-bottom:14px;border-bottom:1px solid #1e293b;";
  [["status", "Übersicht"], ["manage", "Checks verwalten"]].forEach(([key, label]) => {
    const btn = document.createElement("button");
    const active = backupSubView === key;
    btn.style.cssText = `padding:7px 16px;border:none;cursor:pointer;font-size:13px;font-weight:${active ? 600 : 400};color:${active ? "#f1f5f9" : "#64748b"};background:transparent;border-bottom:2px solid ${active ? "#3b82f6" : "transparent"};margin-bottom:-1px;`;
    btn.textContent = label;
    btn.addEventListener("click", () => { backupSubView = key; refresh(); });
    bar.appendChild(btn);
  });
  return bar;
}

// ── Render: Backup Management ─────────────────────────────────────────────────

function renderBackupManagement(accounts, checks) {
  elements.content.innerHTML = "";
  elements.content.appendChild(renderBackupSubTabs());

  const accountMap = {};
  accounts.forEach(a => { accountMap[a.id] = a; });

  // Group checks by account
  const byAccount = {};
  accounts.forEach(a => { byAccount[a.id] = []; });
  checks.forEach(c => { if (byAccount[c.backupAccountId]) byAccount[c.backupAccountId].push(c); });

  let showForm = false;
  let formAccountId = accounts.length ? String(accounts[0].id) : "";
  let formName = "";
  let formSubject = "";
  let formMatchType = "contains";
  let formInterval = "24";
  let formGrace = "1";
  let formError = "";

  const wrap = document.createElement("div");
  elements.content.appendChild(wrap);

  function renderForm() {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;";
    const box = document.createElement("div");
    box.style.cssText = "background:#1e293b;border-radius:10px;padding:28px 32px;width:420px;border:1px solid #334155;";

    const title = document.createElement("h3");
    title.style.cssText = "color:#f1f5f9;font-size:16px;font-weight:700;margin:0 0 20px;";
    title.textContent = "Neuer Backup-Check";
    box.appendChild(title);

    const inp = (label, value, onChange, type = "text") => {
      const g = document.createElement("div");
      g.style.cssText = "margin-bottom:12px;";
      const l = document.createElement("label");
      l.style.cssText = "display:block;color:#94a3b8;font-size:12px;margin-bottom:4px;";
      l.textContent = label;
      g.appendChild(l);
      const i = document.createElement("input");
      i.type = type;
      i.value = value;
      i.style.cssText = "width:100%;padding:8px 12px;background:#0f172a;border:1px solid #334155;border-radius:6px;color:#f1f5f9;font-size:14px;box-sizing:border-box;";
      i.addEventListener("input", () => onChange(i.value));
      g.appendChild(i);
      return g;
    };

    // Account select
    const accGroup = document.createElement("div");
    accGroup.style.cssText = "margin-bottom:12px;";
    const accLabel = document.createElement("label");
    accLabel.style.cssText = "display:block;color:#94a3b8;font-size:12px;margin-bottom:4px;";
    accLabel.textContent = "Backup Account";
    const accSel = document.createElement("select");
    accSel.style.cssText = "width:100%;padding:8px 12px;background:#0f172a;border:1px solid #334155;border-radius:6px;color:#f1f5f9;font-size:14px;box-sizing:border-box;";
    accounts.forEach(a => {
      const opt = document.createElement("option");
      opt.value = String(a.id);
      opt.textContent = `${a.name} (${a.fromEmail})`;
      if (String(a.id) === formAccountId) opt.selected = true;
      accSel.appendChild(opt);
    });
    accSel.addEventListener("change", () => { formAccountId = accSel.value; });
    accGroup.appendChild(accLabel);
    accGroup.appendChild(accSel);
    box.appendChild(accGroup);

    box.appendChild(inp("Name des Checks", formName, v => formName = v));
    box.appendChild(inp("Betreff-Filter (optional)", formSubject, v => formSubject = v));

    // Match type
    const mtGroup = document.createElement("div");
    mtGroup.style.cssText = "margin-bottom:12px;";
    const mtLabel = document.createElement("label");
    mtLabel.style.cssText = "display:block;color:#94a3b8;font-size:12px;margin-bottom:4px;";
    mtLabel.textContent = "Betreff-Übereinstimmung";
    const mtSel = document.createElement("select");
    mtSel.style.cssText = accSel.style.cssText;
    [["contains", "Enthält"], ["exact", "Exakt"]].forEach(([v, l]) => {
      const o = document.createElement("option");
      o.value = v; o.textContent = l;
      if (v === formMatchType) o.selected = true;
      mtSel.appendChild(o);
    });
    mtSel.addEventListener("change", () => { formMatchType = mtSel.value; });
    mtGroup.appendChild(mtLabel);
    mtGroup.appendChild(mtSel);
    box.appendChild(mtGroup);

    // Interval select
    const intGroup = document.createElement("div");
    intGroup.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;";
    const makeNumField = (label, val, setter) => {
      const g = document.createElement("div");
      const l = document.createElement("label");
      l.style.cssText = "display:block;color:#94a3b8;font-size:12px;margin-bottom:4px;";
      l.textContent = label;
      const i = document.createElement("input");
      i.type = "number"; i.min = "1"; i.value = val;
      i.style.cssText = "width:100%;padding:8px 12px;background:#0f172a;border:1px solid #334155;border-radius:6px;color:#f1f5f9;font-size:14px;box-sizing:border-box;";
      i.addEventListener("input", () => setter(i.value));
      g.appendChild(l); g.appendChild(i);
      return g;
    };
    intGroup.appendChild(makeNumField("Intervall (Stunden)", formInterval, v => formInterval = v));
    intGroup.appendChild(makeNumField("Toleranz (Stunden)", formGrace, v => formGrace = v));
    box.appendChild(intGroup);

    if (formError) {
      const err = document.createElement("p");
      err.style.cssText = "color:#f87171;font-size:12px;background:#7f1d1d;padding:8px 10px;border-radius:5px;margin-bottom:12px;";
      err.textContent = formError;
      box.appendChild(err);
    }

    const btns = document.createElement("div");
    btns.style.cssText = "display:flex;gap:10px;justify-content:flex-end;";

    const cancel = document.createElement("button");
    cancel.textContent = "Abbrechen";
    cancel.style.cssText = "padding:8px 16px;border-radius:6px;border:1px solid #334155;background:transparent;color:#94a3b8;cursor:pointer;font-size:14px;";
    cancel.addEventListener("click", () => { overlay.remove(); showForm = false; });

    const save = document.createElement("button");
    save.textContent = "Speichern";
    save.style.cssText = "padding:8px 16px;border-radius:6px;border:none;background:#3b82f6;color:#fff;cursor:pointer;font-size:14px;font-weight:600;";
    save.addEventListener("click", async () => {
      if (!formName.trim()) { formError = "Name ist erforderlich"; overlay.remove(); renderForm(); return; }
      save.textContent = "Speichern...";
      save.disabled = true;
      try {
        await callApi("POST", "/admin/backup-checks", {
          backupAccountId: parseInt(formAccountId),
          name: formName.trim(),
          subjectFilter: formSubject.trim() || null,
          subjectMatchType: formMatchType,
          intervalHours: parseFloat(formInterval) || 24,
          graceHours: parseFloat(formGrace) || 1,
        });
        overlay.remove();
        refresh();
      } catch (e) {
        formError = e.message;
        save.textContent = "Speichern";
        save.disabled = false;
        overlay.remove();
        renderForm();
      }
    });

    btns.appendChild(cancel);
    btns.appendChild(save);
    box.appendChild(btns);
    overlay.appendChild(box);
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  // "Neuer Check" button
  const addBtn = document.createElement("button");
  addBtn.style.cssText = "padding:7px 14px;border-radius:6px;border:1px solid #334155;background:transparent;color:#94a3b8;cursor:pointer;font-size:13px;font-weight:600;margin-bottom:16px;";
  addBtn.textContent = "+ Neuer Check";
  addBtn.addEventListener("click", () => {
    formName = ""; formSubject = ""; formMatchType = "contains";
    formInterval = "24"; formGrace = "1"; formError = "";
    renderForm();
  });
  wrap.appendChild(addBtn);

  if (accounts.length === 0) {
    const empty = document.createElement("p");
    empty.style.cssText = "color:#64748b;font-size:13px;";
    empty.textContent = "Keine Backup-Accounts konfiguriert.";
    wrap.appendChild(empty);
    sendHeight();
    return;
  }

  // Render per account
  accounts.forEach(account => {
    const accountChecks = byAccount[account.id] || [];

    const card = document.createElement("div");
    card.style.cssText = "background:#0f172a;border:1px solid #1e293b;border-radius:8px;margin-bottom:12px;overflow:hidden;";

    const hdr = document.createElement("div");
    hdr.style.cssText = "padding:10px 14px;border-bottom:1px solid #1e293b;display:flex;justify-content:space-between;align-items:center;";
    const hdrLeft = document.createElement("div");
    const hdrName = document.createElement("span");
    hdrName.style.cssText = "color:#f1f5f9;font-size:14px;font-weight:600;";
    hdrName.textContent = account.name;
    const hdrEmail = document.createElement("span");
    hdrEmail.style.cssText = "color:#475569;font-size:11px;margin-left:8px;";
    hdrEmail.textContent = account.fromEmail;
    hdrLeft.appendChild(hdrName);
    hdrLeft.appendChild(hdrEmail);
    const hdrCount = document.createElement("span");
    hdrCount.style.cssText = "color:#64748b;font-size:12px;";
    hdrCount.textContent = `${accountChecks.length} Check${accountChecks.length !== 1 ? "s" : ""}`;
    hdr.appendChild(hdrLeft);
    hdr.appendChild(hdrCount);
    card.appendChild(hdr);

    if (accountChecks.length === 0) {
      const none = document.createElement("p");
      none.style.cssText = "color:#475569;font-size:12px;padding:10px 14px;margin:0;";
      none.textContent = "Keine Checks vorhanden.";
      card.appendChild(none);
    } else {
      accountChecks.forEach(check => {
        const row = document.createElement("div");
        row.style.cssText = `display:grid;grid-template-columns:1fr auto auto auto;align-items:center;gap:12px;padding:9px 14px;border-bottom:1px solid #0f172a;opacity:${check.active ? 1 : 0.5};`;

        const nameEl = document.createElement("span");
        nameEl.style.cssText = "color:#e2e8f0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        nameEl.textContent = check.name;

        const interval = document.createElement("span");
        interval.style.cssText = "color:#64748b;font-size:11px;white-space:nowrap;";
        interval.textContent = `${check.intervalHours}h`;

        const activeToggle = document.createElement("button");
        activeToggle.style.cssText = `padding:3px 8px;border-radius:4px;border:1px solid;font-size:11px;cursor:pointer;white-space:nowrap;background:transparent;color:${check.active ? "#4ade80" : "#64748b"};border-color:${check.active ? "#166534" : "#334155"};`;
        activeToggle.textContent = check.active ? "Aktiv" : "Inaktiv";
        activeToggle.addEventListener("click", async () => {
          try { await callApi("PUT", `/admin/backup-checks/${check.id}`, { active: !check.active }); refresh(); }
          catch (e) { alert(e.message); }
        });

        const delBtn = document.createElement("button");
        delBtn.style.cssText = "padding:3px 8px;border-radius:4px;border:1px solid #7f1d1d;background:transparent;color:#ef4444;font-size:11px;cursor:pointer;";
        delBtn.textContent = "Löschen";
        delBtn.addEventListener("click", async () => {
          if (!confirm(`Check "${check.name}" löschen?`)) return;
          try { await callApi("DELETE", `/admin/backup-checks/${check.id}`); refresh(); }
          catch (e) { alert(e.message); }
        });

        row.appendChild(nameEl);
        row.appendChild(interval);
        row.appendChild(activeToggle);
        row.appendChild(delBtn);
        card.appendChild(row);
      });
    }

    wrap.appendChild(card);
  });

  sendHeight();
}

// ── Render: Sophos Alerts ──────────────────────────────────────────────────────

const SEVERITY_STYLE = {
  high:   { color: "#f87171", bg: "rgba(127,29,29,0.25)", border: "rgba(248,113,113,0.3)", label: "Hoch" },
  medium: { color: "#fbbf24", bg: "rgba(120,53,15,0.25)", border: "rgba(251,191,36,0.3)",  label: "Mittel" },
  low:    { color: "#94a3b8", bg: "rgba(30,41,59,0.6)",   border: "rgba(51,65,85,0.5)",    label: "Niedrig" },
};

function severityOrder(s) {
  return s === "high" ? 0 : s === "medium" ? 1 : 2;
}

function renderSophosAlerts(customers) {
  elements.content.innerHTML = "";

  const withAlerts = customers
    .filter(c => c.alerts && c.alerts.length > 0)
    .sort((a, b) => {
      const aMin = Math.min(...a.alerts.map(x => severityOrder(x.severity)));
      const bMin = Math.min(...b.alerts.map(x => severityOrder(x.severity)));
      return aMin !== bMin ? aMin - bMin : b.alerts.length - a.alerts.length;
    });

  if (withAlerts.length === 0) {
    elements.content.innerHTML = '<div class="loading">Keine aktiven Sophos-Alerts.</div>';
    sendHeight();
    return;
  }

  const totalAlerts = withAlerts.reduce((s, c) => s + c.alerts.length, 0);
  const highCount   = withAlerts.reduce((s, c) => s + c.alerts.filter(a => a.severity === "high").length, 0);
  const medCount    = withAlerts.reduce((s, c) => s + c.alerts.filter(a => a.severity === "medium").length, 0);

  // Summary bar
  const summary = document.createElement("div");
  summary.className = "sophos-alert-summary";
  const summaryText = document.createElement("span");
  summaryText.style.cssText = "color:#94a3b8;font-size:12px;";
  summaryText.textContent = `${withAlerts.length} Kunden · ${totalAlerts} Alerts`;
  summary.appendChild(summaryText);
  const badges = document.createElement("div");
  badges.style.cssText = "display:flex;gap:6px;";
  if (highCount > 0) {
    const b = document.createElement("span");
    b.className = "alert-sev-badge";
    b.style.cssText = `color:#f87171;background:rgba(127,29,29,0.3);border:1px solid rgba(248,113,113,0.4);`;
    b.textContent = `${highCount} Hoch`;
    badges.appendChild(b);
  }
  if (medCount > 0) {
    const b = document.createElement("span");
    b.className = "alert-sev-badge";
    b.style.cssText = `color:#fbbf24;background:rgba(120,53,15,0.3);border:1px solid rgba(251,191,36,0.4);`;
    b.textContent = `${medCount} Mittel`;
    badges.appendChild(b);
  }
  summary.appendChild(badges);
  elements.content.appendChild(summary);

  for (const customer of withAlerts) {
    const alerts = [...customer.alerts].sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity));
    const highAlerts = alerts.filter(a => a.severity === "high").length;
    const borderColor = highAlerts > 0 ? "rgba(248,113,113,0.3)" : "rgba(251,191,36,0.2)";

    const card = document.createElement("div");
    card.className = "sophos-alert-card";
    card.style.borderColor = borderColor;

    // Customer header
    const cardHeader = document.createElement("div");
    cardHeader.className = "sophos-alert-card-header";
    cardHeader.style.cursor = "pointer";
    cardHeader.style.userSelect = "none";

    const arrow = document.createElement("span");
    arrow.className = "prod-section-arrow";
    arrow.textContent = "▾";
    let expanded = true;

    const custName = document.createElement("span");
    custName.className = "sophos-alert-cust-name";
    custName.textContent = customer.customerName;

    const headerRight = document.createElement("div");
    headerRight.style.cssText = "display:flex;gap:6px;align-items:center;";
    if (highAlerts > 0) {
      const b = document.createElement("span");
      b.className = "alert-sev-badge";
      b.style.cssText = `color:#f87171;background:rgba(127,29,29,0.3);border:1px solid rgba(248,113,113,0.4);`;
      b.textContent = `${highAlerts} Hoch`;
      headerRight.appendChild(b);
    }
    const medInCustomer = alerts.filter(a => a.severity === "medium").length;
    if (medInCustomer > 0) {
      const b = document.createElement("span");
      b.className = "alert-sev-badge";
      b.style.cssText = `color:#fbbf24;background:rgba(120,53,15,0.3);border:1px solid rgba(251,191,36,0.4);`;
      b.textContent = `${medInCustomer} Mittel`;
      headerRight.appendChild(b);
    }
    const totalSpan = document.createElement("span");
    totalSpan.style.cssText = "color:#64748b;font-size:11px;";
    totalSpan.textContent = `${alerts.length} gesamt`;
    headerRight.appendChild(totalSpan);

    cardHeader.appendChild(arrow);
    cardHeader.appendChild(custName);
    cardHeader.appendChild(headerRight);
    card.appendChild(cardHeader);

    // Alert rows container
    const alertList = document.createElement("div");
    alertList.className = "sophos-alert-list";

    for (const a of alerts) {
      const sev = SEVERITY_STYLE[a.severity] || SEVERITY_STYLE.low;
      const date = a.raisedAt
        ? new Date(a.raisedAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })
        : "—";

      const row = document.createElement("div");
      row.className = "sophos-alert-row";
      row.style.cssText = `background:${sev.bg};border:1px solid ${sev.border};`;

      const sevBadge = document.createElement("span");
      sevBadge.className = "sophos-alert-sev";
      sevBadge.style.cssText = `color:${sev.color};border-color:${sev.color}40;`;
      sevBadge.textContent = sev.label;
      row.appendChild(sevBadge);

      const rowBody = document.createElement("div");
      rowBody.style.cssText = "flex:1;min-width:0;";

      const desc = document.createElement("div");
      desc.className = "sophos-alert-desc";
      desc.textContent = decodeHtml(a.description || "");
      rowBody.appendChild(desc);

      const meta = document.createElement("div");
      meta.className = "sophos-alert-meta";
      if (a.category) {
        const cat = document.createElement("span");
        cat.textContent = a.category.toUpperCase();
        meta.appendChild(cat);
      }
      if (a.product) {
        const prod = document.createElement("span");
        prod.textContent = a.product;
        meta.appendChild(prod);
      }
      const dateEl = document.createElement("span");
      dateEl.textContent = date;
      meta.appendChild(dateEl);
      rowBody.appendChild(meta);

      row.appendChild(rowBody);
      alertList.appendChild(row);
    }

    card.appendChild(alertList);
    elements.content.appendChild(card);

    // Toggle expand
    cardHeader.addEventListener("click", () => {
      expanded = !expanded;
      arrow.textContent = expanded ? "▾" : "▸";
      alertList.style.display = expanded ? "" : "none";
      sendHeight();
    });
  }

  sendHeight();
}

// ── Navigation ─────────────────────────────────────────────────────────────────

function navigate(view, customerId = null) {
  currentView = view;
  selectedCustomerId = customerId;
  refresh();
}

function setGroupBy(view) {
  groupBy = view;
  currentView = "list";
  selectedCustomerId = null;
  if (view !== "backup") backupSubView = "status";
  elements.toggleSoftware.classList.toggle("toggle-active", view === "software");
  elements.toggleKunde.classList.toggle("toggle-active", view === "kunde");
  elements.toggleSophos.classList.toggle("toggle-active", view === "sophos");
  elements.toggleBackup.classList.toggle("toggle-active", view === "backup");
  refresh();
}

// ── Main refresh ───────────────────────────────────────────────────────────────

async function refresh() {
  try {
    clearError();
    if (groupBy === "backup") {
      if (backupSubView === "manage") {
        const [accounts, checks] = await Promise.all([fetchBackupAccounts(), fetchBackupChecks()]);
        renderBackupManagement(accounts, checks);
      } else {
        const data = await fetchBackupStatus();
        renderBackup(data);
      }
    } else if (groupBy === "sophos") {
      const data = await fetchSophosOverview();
      renderSophosAlerts(data);
    } else if (groupBy === "software") {
      const products = await fetchProducts();
      renderSoftware(products);
    } else if (currentView === "detail" && selectedCustomerId !== null) {
      const detail = await fetchCustomerDetail(selectedCustomerId);
      renderCustomerDetail(detail);
    } else {
      const customers = await fetchCustomers();
      renderCustomers(customers);
    }
    updateTimestamp();
  } catch (error) {
    setError(`Fehler beim Laden: ${error instanceof Error ? error.message : String(error)}`);
    sendHeight();
  }
}

// ── Auth UI + Auto-Login ───────────────────────────────────────────────────────

function showAuthError(msg, hint) {
  elements.content.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.style.cssText = "padding:32px 24px;text-align:center;";

  const icon = document.createElement("div");
  icon.style.cssText = "font-size:36px;margin-bottom:16px;";
  icon.textContent = "🔒";

  const text = document.createElement("p");
  text.style.cssText = "color:#f87171;font-size:14px;font-weight:600;margin:0 0 8px;line-height:1.4;";
  text.textContent = msg;

  const hintEl = document.createElement("p");
  hintEl.style.cssText = "color:#64748b;font-size:12px;margin:0;line-height:1.5;";
  hintEl.textContent = hint || "Bitte im Version Checker einen passenden Benutzer anlegen.";

  wrap.appendChild(icon);
  wrap.appendChild(text);
  wrap.appendChild(hintEl);
  elements.content.appendChild(wrap);
  sendHeight();
}

async function pingApiBase() {
  for (const base of API_BASE_CANDIDATES) {
    try {
      const res = await fetch(`${base}/auth/users`, { cache: "no-store" });
      if (res.ok || res.status === 401) {
        resolvedBase = base;
        elements.apiSource.textContent = base.replace("/api", "");
        return base;
      }
    } catch { /* try next */ }
  }
  return null;
}

async function tryAutoLogin(ninjaUid) {
  const base = resolvedBase || await pingApiBase();
  if (!base) {
    showAuthError(
      "Version Checker nicht erreichbar.",
      "Bitte sicherstellen, dass der Server auf localhost:3001 läuft."
    );
    return false;
  }

  try {
    const loginRes = await fetch(`${base}/auth/ninja-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ninja_uid: ninjaUid }),
      cache: "no-store",
    });

    if (loginRes.status === 401) {
      const data = await loginRes.json().catch(() => ({}));
      showAuthError(
        "Kein Version Checker Konto gefunden.",
        (data.error || "") + " Bitte NinjaOne User Sync in der Benutzerverwaltung ausführen."
      );
      return false;
    }

    if (!loginRes.ok) {
      showAuthError("Login fehlgeschlagen.", "Bitte Administrator kontaktieren.");
      return false;
    }

    const { token } = await loginRes.json();
    authToken = token;
    sessionStorage.setItem(AUTH_KEY, token);
    return true;
  } catch {
    showAuthError(
      "Verbindung zum Version Checker fehlgeschlagen.",
      "Bitte sicherstellen, dass der Server auf localhost:3001 läuft."
    );
    return false;
  }
}

async function init() {
  const params   = new URLSearchParams(window.location.search);
  const ninjaUid = params.get("ninja_uid");

  if (!authToken) {
    if (!ninjaUid) {
      showAuthError(
        "NinjaOne-Sitzung nicht erkannt.",
        "Bitte NinjaOne neu laden und das Panel erneut öffnen."
      );
      return;
    }
    const ok = await tryAutoLogin(ninjaUid);
    if (!ok) return;
  }

  refresh();
  window.setInterval(refresh, REFRESH_INTERVAL_MS);
}

// ── Startup ───────────────────────────────────────────────────────────────────

elements.toggleSoftware.addEventListener("click", () => setGroupBy("software"));
elements.toggleKunde.addEventListener("click", () => setGroupBy("kunde"));
elements.toggleSophos.addEventListener("click", () => setGroupBy("sophos"));
elements.toggleBackup.addEventListener("click", () => setGroupBy("backup"));

window.addEventListener("load", sendHeight);
init();

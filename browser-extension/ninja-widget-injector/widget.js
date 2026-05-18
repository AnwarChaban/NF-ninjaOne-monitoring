const API_BASE_CANDIDATES = [
  "http://localhost:3001/api",
  "http://127.0.0.1:3001/api"
];

const REFRESH_INTERVAL_MS = 30000;

// Navigation state
let groupBy = "software";   // "software" | "kunde"
let currentView = "list";   // "list" | "detail"
let selectedCustomerId = null;
let resolvedBase = null;

const elements = {
  root: document.getElementById("widget-root"),
  content: document.getElementById("content"),
  apiSource: document.getElementById("api-source"),
  lastSync: document.getElementById("last-sync"),
  errorBox: document.getElementById("error-box"),
  toggleSoftware: document.getElementById("toggle-software"),
  toggleKunde: document.getElementById("toggle-kunde"),
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
      const res = await fetch(`${base}${path}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!resolvedBase) {
        resolvedBase = base;
        elements.apiSource.textContent = base.replace("/api", "");
      }
      return await res.json();
    } catch (err) {
      lastError = err;
      resolvedBase = null;
    }
  }
  throw lastError || new Error("Lokale API nicht erreichbar.");
}

const fetchProducts       = () => fetchFromApi("/products");
const fetchCustomers      = () => fetchFromApi("/customers");
const fetchCustomerDetail = id => fetchFromApi(`/customers/${id}`);

// ── Render: Software view (unchanged) ─────────────────────────────────────────

function renderProduct(product) {
  const card = document.createElement("section");
  card.className = "product-card";

  const allDevices = product.customers.flatMap(c => c.devices);
  const status = calcStatus(allDevices);
  card.style.borderLeftColor = status.border;

  const title = document.createElement("h3");
  title.className = "product-title";
  title.textContent = product.productName || product.product;

  const badge = document.createElement("span");
  badge.className = "status-pill";
  badge.style.backgroundColor = status.pillBg;
  badge.style.color = status.pillColor;
  badge.textContent = status.label;

  const version = document.createElement("p");
  version.className = "product-meta";
  version.textContent = "Version: ";
  if (product.releaseUrl) {
    const link = document.createElement("a");
    link.href = product.releaseUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = formatVersion(product.latestVersion);
    version.appendChild(link);
  } else {
    const text = document.createElement("span");
    text.textContent = formatVersion(product.latestVersion);
    version.appendChild(text);
  }

  const outdatedCount = allDevices.filter(d => d.status === "update-available" || d.status === "major-update").length;
  const summary = document.createElement("p");
  summary.className = "product-summary";
  summary.textContent = allDevices.length > 0
    ? outdatedCount > 0 ? `${outdatedCount}/${allDevices.length} Geräte veraltet` : `${allDevices.length} Geräte aktuell`
    : "Keine Geräte vorhanden";

  const customerGrid = document.createElement("div");
  customerGrid.className = "customer-grid";

  const customers = product.customers
    .map(c => ({ ...c, devices: c.devices.filter(d => d.status === "update-available" || d.status === "major-update") }))
    .filter(c => c.devices.length > 0)
    .sort((a, b) => b.devices.length - a.devices.length);

  for (const customer of customers) {
    const customerCard = document.createElement("article");
    customerCard.className = "customer-card";
    customerCard.style.cursor = "pointer";
    customerCard.addEventListener("click", () => navigate("detail", customer.id));

    const customerTitle = document.createElement("h4");
    customerTitle.className = "customer-title";
    customerTitle.textContent = customer.name;
    const updSpan = document.createElement("span");
    updSpan.className = "update-count";
    updSpan.textContent = `(${customer.devices.length} Updates)`;
    customerTitle.appendChild(updSpan);
    customerCard.appendChild(customerTitle);

    const topDevices = customer.devices.slice(0, 3);
    for (const device of topDevices) {
      const row = document.createElement("div");
      row.className = "device-row";
      const left = document.createElement("div");
      const deviceName = document.createElement("div");
      deviceName.className = "device-name";
      deviceName.textContent = device.name;
      const deviceVersion = document.createElement("div");
      deviceVersion.className = "device-version";
      deviceVersion.textContent = formatVersion(device.currentVersion);
      left.appendChild(deviceName);
      left.appendChild(deviceVersion);
      const pill = document.createElement("span");
      pill.className = "device-pill";
      pill.textContent = STATUS_LABEL[device.status] || STATUS_LABEL.unknown;
      row.appendChild(left);
      row.appendChild(pill);
      customerCard.appendChild(row);
    }

    if (customer.devices.length > 3) {
      const more = document.createElement("div");
      more.className = "more-devices";
      more.textContent = `+${customer.devices.length - 3} weitere Geräte`;
      customerCard.appendChild(more);
    }

    customerGrid.appendChild(customerCard);
  }

  card.appendChild(title);
  card.appendChild(badge);
  card.appendChild(version);
  card.appendChild(summary);
  if (product.error) setError(product.error);
  if (customers.length > 0) card.appendChild(customerGrid);
  return card;
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

  // Products
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

    const productGrid = document.createElement("div");
    productGrid.className = "detail-product-grid";

    for (const product of sortedProducts) {
      const outdated = product.devices.filter(d => d.status === "update-available" || d.status === "major-update").length;
      const hasMajor = product.devices.some(d => d.status === "major-update");
      const borderColor = outdated > 0 ? (hasMajor ? "#7f1d1d" : "#78350f") : "#1e2d3d";

      const card = document.createElement("div");
      card.className = "detail-product-card";
      card.style.borderLeftColor = borderColor;

      const cardTop = document.createElement("div");
      cardTop.className = "detail-product-top";

      const productName = document.createElement("div");
      productName.className = "detail-product-name";
      productName.textContent = product.productName;
      cardTop.appendChild(productName);

      if (product.latestVersion) {
        const ver = document.createElement("div");
        ver.className = "detail-product-version";
        if (product.releaseUrl) {
          const link = document.createElement("a");
          link.href = product.releaseUrl;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = formatVersion(product.latestVersion);
          link.style.color = "#60a5fa";
          link.style.textDecoration = "none";
          ver.appendChild(link);
        } else {
          ver.textContent = formatVersion(product.latestVersion);
        }
        cardTop.appendChild(ver);
      }

      card.appendChild(cardTop);

      for (const device of product.devices) {
        const sc = STATUS_COLOR[device.status] || STATUS_COLOR.unknown;
        const row = document.createElement("div");
        row.className = "detail-device-row";

        const left = document.createElement("div");
        const dName = document.createElement("div");
        dName.className = "device-name";
        dName.textContent = device.name;
        const dVer = document.createElement("div");
        dVer.className = "device-version";
        if (device.status !== "up-to-date" && device.latestVersion && device.latestVersion !== device.currentVersion) {
          dVer.textContent = `${formatVersion(device.currentVersion)} → ${formatVersion(device.latestVersion)}`;
        } else {
          dVer.textContent = formatVersion(device.currentVersion);
        }
        left.appendChild(dName);
        left.appendChild(dVer);

        const pill = document.createElement("span");
        pill.className = "device-pill";
        pill.style.backgroundColor = sc.bg;
        pill.style.color = sc.color;
        pill.textContent = STATUS_LABEL[device.status] || STATUS_LABEL.unknown;

        row.appendChild(left);
        row.appendChild(pill);
        card.appendChild(row);
      }

      productGrid.appendChild(card);
    }

    elements.content.appendChild(productGrid);
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
  elements.toggleSoftware.classList.toggle("toggle-active", view === "software");
  elements.toggleKunde.classList.toggle("toggle-active", view === "kunde");
  refresh();
}

// ── Main refresh ───────────────────────────────────────────────────────────────

async function refresh() {
  try {
    clearError();
    if (groupBy === "software") {
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

elements.toggleSoftware.addEventListener("click", () => setGroupBy("software"));
elements.toggleKunde.addEventListener("click", () => setGroupBy("kunde"));

refresh();
window.setInterval(refresh, REFRESH_INTERVAL_MS);
window.addEventListener("load", sendHeight);

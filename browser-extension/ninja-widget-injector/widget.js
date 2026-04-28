const API_CANDIDATES = [
  "http://localhost:3001/api/products",
  "http://127.0.0.1:3001/api/products"
];

const REFRESH_INTERVAL_MS = 30000;

const elements = {
  root: document.getElementById("widget-root"),
  content: document.getElementById("content"),
  apiSource: document.getElementById("api-source"),
  lastSync: document.getElementById("last-sync"),
  errorBox: document.getElementById("error-box")
};

const STATUS_LABEL = {
  "update-available": "Update verfügbar",
  "major-update": "Major Update",
  "up-to-date": "Aktuell",
  "unknown": "Unbekannt"
};

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

async function fetchProducts() {
  let lastError = null;

  for (const endpoint of API_CANDIDATES) {
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const products = await response.json();
      elements.apiSource.textContent = endpoint.replace("/api/products", "");
      return products;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Lokale API nicht erreichbar.");
}

function calcStatus(devices) {
  const statuses = devices.map((device) => device.status);
  if (statuses.includes("major-update")) {
    return { label: STATUS_LABEL["major-update"], border: "#7f1d1d", pillBg: "#7f1d1d", pillColor: "#fca5a5" };
  }
  if (statuses.includes("update-available")) {
    return { label: STATUS_LABEL["update-available"], border: "#78350f", pillBg: "#78350f", pillColor: "#fbbf24" };
  }
  if (statuses.length > 0 && statuses.every((status) => status === "up-to-date")) {
    return { label: STATUS_LABEL["up-to-date"], border: "#065f46", pillBg: "#065f46", pillColor: "#6ee7b7" };
  }
  return { label: STATUS_LABEL.unknown, border: "#374151", pillBg: "#374151", pillColor: "#9ca3af" };
}

function sendHeight() {
  const height = Math.ceil(elements.root.getBoundingClientRect().height);
  window.parent.postMessage({ type: "NF_WIDGET_HEIGHT", height }, "*");
}

function renderProduct(product) {
  const card = document.createElement("section");
  card.className = "product-card";

  const allDevices = product.customers.flatMap((customer) => customer.devices);
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

  const outdatedCount = allDevices.filter((device) => device.status === "update-available" || device.status === "major-update").length;
  const summary = document.createElement("p");
  summary.className = "product-summary";
  summary.textContent = allDevices.length > 0
    ? outdatedCount > 0
      ? `${outdatedCount}/${allDevices.length} Geräte veraltet`
      : `${allDevices.length} Geräte aktuell`
    : "Keine Geräte vorhanden";

  const customerGrid = document.createElement("div");
  customerGrid.className = "customer-grid";

  const customers = product.customers
    .map((customer) => ({
      ...customer,
      devices: customer.devices.filter((device) => device.status === "update-available" || device.status === "major-update")
    }))
    .filter((customer) => customer.devices.length > 0)
    .sort((a, b) => b.devices.length - a.devices.length);

  for (const customer of customers) {
    const customerCard = document.createElement("article");
    customerCard.className = "customer-card";

    const customerTitle = document.createElement("h4");
    customerTitle.className = "customer-title";
    customerTitle.textContent = customer.name;

    const updates = document.createElement("span");
    updates.className = "update-count";
    updates.textContent = `(${customer.devices.length} Updates)`;
    customerTitle.appendChild(updates);

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

  if (product.error) {
    setError(product.error);
  }

  if (customers.length > 0) {
    card.appendChild(customerGrid);
  }

  return card;
}

function render(products) {
  elements.content.innerHTML = "";

  const withUpdates = products.filter((product) =>
    product.customers.some((customer) =>
      customer.devices.some((device) => device.status === "update-available" || device.status === "major-update")
    )
  );

  const target = withUpdates.length > 0 ? withUpdates[0] : products[0];
  if (!target) {
    elements.content.innerHTML = '<div class="loading">Keine Daten vorhanden.</div>';
    sendHeight();
    return;
  }

  elements.content.appendChild(renderProduct(target));
  sendHeight();
}

async function refresh() {
  try {
    const products = await fetchProducts();
    render(products);
    updateTimestamp();
    clearError();
  } catch (error) {
    setError(`Fehler beim Laden: ${error instanceof Error ? error.message : String(error)}`);
    sendHeight();
  }
}

refresh();
window.setInterval(refresh, REFRESH_INTERVAL_MS);
window.addEventListener("load", sendHeight);
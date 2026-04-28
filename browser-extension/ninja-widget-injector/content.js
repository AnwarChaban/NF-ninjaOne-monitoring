const ROOT_ID = "nf-local-version-widget";
const HIDDEN_STATE_KEY = "nfLocalWidgetHidden";
const ANCHOR_TEST_IDS = [
  "Gerätegesundheitsprobleme-dashboard-widget",
  "Geraetegesundheitsprobleme-dashboard-widget"
];
const CONTAINER_SELECTORS = [
  ".dashboard-grid",
  ".react-grid-layout",
  "[data-testid='dashboard-grid']",
  "main .grid",
  "main"
];

const INSERT_MODE = "append";

function saveHiddenState(isHidden) {
  if (chrome?.storage?.local) {
    chrome.storage.local.set({ [HIDDEN_STATE_KEY]: isHidden });
    return;
  }

  try {
    window.localStorage.setItem(HIDDEN_STATE_KEY, JSON.stringify(isHidden));
  } catch {
    // ignore persistence errors
  }
}

function loadHiddenState(callback) {
  if (chrome?.storage?.local) {
    chrome.storage.local.get([HIDDEN_STATE_KEY], (result) => {
      callback(Boolean(result?.[HIDDEN_STATE_KEY]));
    });
    return;
  }

  try {
    const rawValue = window.localStorage.getItem(HIDDEN_STATE_KEY);
    callback(rawValue === "true");
  } catch {
    callback(false);
  }
}

function findDashboardContainer() {
  for (const selector of CONTAINER_SELECTORS) {
    const element = document.querySelector(selector);
    if (element) {
      return element;
    }
  }
  return null;
}

function buildCard() {
  const wrapper = document.createElement("section");
  wrapper.id = ROOT_ID;
  wrapper.setAttribute("data-nf-widget", "true");
  wrapper.style.background = "#fff";
  wrapper.style.borderRadius = "12px";
  wrapper.style.boxShadow = "0 2px 12px rgba(0, 0, 0, 0.08)";
  wrapper.style.border = "1px solid #e6e8ec";
  wrapper.style.padding = "0";
  wrapper.style.overflow = "hidden";
  wrapper.style.minHeight = "280px";
  wrapper.style.width = "100%";

  const header = document.createElement("div");
  header.style.padding = "10px 14px";
  header.style.borderBottom = "1px solid #eef0f3";

  const title = document.createElement("span");
  title.style.fontFamily = "Inter, Segoe UI, Arial, sans-serif";
  title.style.fontSize = "13px";
  title.style.fontWeight = "600";
  title.style.color = "#2b2f36";
  title.textContent = "Net Factory Update-Widget (lokal)";

  const frame = document.createElement("iframe");
  frame.src = chrome.runtime.getURL("widget.html");
  frame.title = "Local Version Widget";
  frame.style.display = "block";
  frame.style.width = "100%";
  frame.style.height = "420px";
  frame.style.border = "0";
  frame.loading = "lazy";

  function onMessage(event) {
    if (event.source !== frame.contentWindow) {
      return;
    }

    if (!event.data || event.data.type !== "NF_WIDGET_HEIGHT") {
      return;
    }

    const nextHeight = Number(event.data.height);
    if (Number.isFinite(nextHeight) && nextHeight > 120) {
      frame.style.height = `${Math.min(nextHeight + 8, 2400)}px`;
    }
  }

  window.addEventListener("message", onMessage);

  header.appendChild(title);
  wrapper.appendChild(header);
  wrapper.appendChild(frame);
  return wrapper;
}

function buildSlot(card) {
  const slot = document.createElement("div");
  slot.id = `${ROOT_ID}-slot`;
  slot.style.width = "100%";
  slot.style.maxWidth = "100%";
  slot.style.height = "auto";
  slot.style.minHeight = "0";
  slot.style.alignSelf = "stretch";

  const controlRow = document.createElement("div");
  controlRow.style.display = "flex";
  controlRow.style.justifyContent = "flex-end";
  controlRow.style.marginBottom = "8px";

  const visibilityButton = document.createElement("button");
  visibilityButton.type = "button";
  visibilityButton.style.border = "1px solid #d0d5dd";
  visibilityButton.style.background = "#fff";
  visibilityButton.style.color = "#344054";
  visibilityButton.style.fontSize = "12px";
  visibilityButton.style.fontWeight = "600";
  visibilityButton.style.padding = "4px 8px";
  visibilityButton.style.borderRadius = "6px";
  visibilityButton.style.cursor = "pointer";

  function applyHidden(isHidden) {
    card.style.display = isHidden ? "none" : "block";
    visibilityButton.textContent = isHidden ? "Widget anzeigen" : "Widget ausblenden";
    visibilityButton.setAttribute("aria-pressed", String(isHidden));
  }

  visibilityButton.addEventListener("click", () => {
    const nextHidden = card.style.display !== "none";
    applyHidden(nextHidden);
    saveHiddenState(nextHidden);
  });

  loadHiddenState((isHidden) => applyHidden(isHidden));

  controlRow.appendChild(visibilityButton);
  slot.appendChild(controlRow);
  slot.appendChild(card);
  return slot;
}

function findAnchorWidget() {
  for (const testId of ANCHOR_TEST_IDS) {
    const anchor = document.querySelector(`[data-testid='${testId}']`);
    if (anchor) {
      return anchor;
    }
  }

  return null;
}

function inject() {
  if (document.getElementById(ROOT_ID)) {
    return true;
  }

  const anchor = findAnchorWidget();
  const card = buildCard();

  if (anchor && anchor.parentElement) {
    const slot = buildSlot(card);
    const anchorComputed = window.getComputedStyle(anchor);
    if (anchorComputed.gridColumnStart !== "auto" || anchorComputed.gridColumnEnd !== "auto") {
      slot.style.gridColumn = "span 1";
    }
    if (anchorComputed.gridRowStart !== "auto" || anchorComputed.gridRowEnd !== "auto") {
      slot.style.gridRow = "auto";
    }
    card.setAttribute("data-testid", "Net-Factory-Update-Widget-dashboard-widget");
    anchor.insertAdjacentElement("afterend", slot);
    return true;
  }

  const container = findDashboardContainer();
  if (!container) {
    return false;
  }

  if (INSERT_MODE === "prepend") {
    container.prepend(card);
  } else {
    container.appendChild(card);
  }

  return true;
}

function boot() {
  if (inject()) {
    return;
  }

  const observer = new MutationObserver(() => {
    if (inject()) {
      observer.disconnect();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  window.setTimeout(() => observer.disconnect(), 30000);
}

boot();
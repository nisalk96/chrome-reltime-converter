(() => {
  const STATE = {
    preferredCurrency: "LKR",
    autoConvert: false,
    displayMode: "alongside",
    showSymbols: true,
    valueMode: "fullPrice",
    /** click-triggered: active for this page session after Convert */
    sessionActive: false,
    converting: false,
    observer: null,
    debounceTimer: null,
  };

  function isActive() {
    return STATE.autoConvert || STATE.sessionActive;
  }

  function restoreAll() {
    document.querySelectorAll(".nkc-converted").forEach((el) => {
      const original = el.getAttribute("data-original");
      if (original == null) return;
      const text = document.createTextNode(original);
      el.replaceWith(text);
    });
  }

  function wrapMatch(originalText, convertedLabel) {
    const span = document.createElement("span");
    span.className = "nkc-converted";
    span.setAttribute("data-original", originalText);
    span.setAttribute("title", `Converted to ${STATE.preferredCurrency}`);

    if (STATE.displayMode === "replace") {
      const approx = document.createElement("span");
      approx.className = "nkc-approx nkc-replaced";
      approx.textContent = convertedLabel;
      span.appendChild(approx);
    } else {
      span.appendChild(document.createTextNode(originalText + " "));
      const approx = document.createElement("span");
      approx.className = "nkc-approx";
      approx.textContent = `≈ ${convertedLabel}`;
      span.appendChild(approx);
    }
    return span;
  }

  async function processTextNode(node) {
    if (!node?.parentNode || !window.NKCDetector || !window.NKCConverter) return;

    const text = node.nodeValue;
    const matches = window.NKCDetector.findPricesInText(text);
    if (!matches.length) return;

    const target = STATE.preferredCurrency;
    const fragments = [];
    let cursor = 0;

    for (const match of matches) {
      if (match.currency === target) continue;

      if (match.index > cursor) {
        fragments.push(document.createTextNode(text.slice(cursor, match.index)));
      }

      let convertedLabel;
      try {
        const rate = await window.NKCConverter.getRate(match.currency, target);
        const converted = match.amount * rate;
        convertedLabel = window.NKCConverter.formatConvertedLabel({
          amount: match.amount,
          from: match.currency,
          to: target,
          rate,
          converted,
          showSymbols: STATE.showSymbols,
          valueMode: STATE.valueMode,
        });
      } catch {
        fragments.push(
          document.createTextNode(text.slice(match.index, match.index + match.length))
        );
        cursor = match.index + match.length;
        continue;
      }

      fragments.push(wrapMatch(match.text, convertedLabel));
      cursor = match.index + match.length;
    }

    if (!fragments.some((f) => f.nodeType === Node.ELEMENT_NODE)) return;

    if (cursor < text.length) {
      fragments.push(document.createTextNode(text.slice(cursor)));
    }

    const parent = node.parentNode;
    if (!parent || parent.closest?.(".nkc-converted")) return;

    const frag = document.createDocumentFragment();
    for (const f of fragments) frag.appendChild(f);
    parent.replaceChild(frag, node);
  }

  async function scan(root = document.body) {
    if (!isActive() || !root || STATE.converting) return;
    STATE.converting = true;
    try {
      const nodes = window.NKCDetector.collectTextNodes(root);
      const batchSize = 40;
      for (let i = 0; i < nodes.length; i += batchSize) {
        if (!isActive()) break;
        const batch = nodes.slice(i, i + batchSize);
        await Promise.all(
          batch
            .filter((n) => n.isConnected && !n.parentElement?.closest?.(".nkc-converted"))
            .map((n) => processTextNode(n))
        );
      }
    } finally {
      STATE.converting = false;
    }
  }

  function scheduleScan(root) {
    clearTimeout(STATE.debounceTimer);
    STATE.debounceTimer = setTimeout(() => {
      scan(root || document.body);
    }, 250);
  }

  function startObserver() {
    if (STATE.observer || !document.body) return;
    STATE.observer = new MutationObserver((mutations) => {
      if (!isActive()) return;
      let shouldScan = false;
      for (const m of mutations) {
        if (m.type === "characterData") {
          const el = m.target.parentElement;
          if (el && !el.closest?.(".nkc-converted")) {
            shouldScan = true;
            break;
          }
        }
        for (const node of m.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.classList?.contains("nkc-converted")) continue;
            if (node.closest?.(".nkc-converted")) continue;
            shouldScan = true;
            break;
          }
          if (node.nodeType === Node.TEXT_NODE) {
            shouldScan = true;
            break;
          }
        }
        if (shouldScan) break;
      }
      if (shouldScan) scheduleScan(document.body);
    });

    STATE.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function stopObserver() {
    if (STATE.observer) {
      STATE.observer.disconnect();
      STATE.observer = null;
    }
  }

  function settingsFingerprint(s) {
    return [
      s.preferredCurrency,
      s.autoConvert,
      s.displayMode,
      s.showSymbols,
      s.valueMode,
    ].join("|");
  }

  async function applySettings(raw, { forceScan = false } = {}) {
    const next = window.NKCSettings
      ? window.NKCSettings.normalizeSettings(raw)
      : {
          preferredCurrency: raw.preferredCurrency || "LKR",
          autoConvert: Boolean(raw.autoConvert ?? raw.realtimeEnabled),
          displayMode: raw.displayMode === "replace" ? "replace" : "alongside",
          showSymbols: raw.showSymbols != null ? Boolean(raw.showSymbols) : true,
          valueMode: raw.valueMode === "rateOnly" ? "rateOnly" : "fullPrice",
        };

    const prevFp = settingsFingerprint(STATE);
    const nextFp = settingsFingerprint(next);
    const changed = prevFp !== nextFp;

    if (changed) {
      window.NKCConverter?.clearMemoryCache?.();
    }

    Object.assign(STATE, next);

    // Switching to click mode clears any prior auto session unless forceScan
    if (!STATE.autoConvert && !forceScan) {
      STATE.sessionActive = false;
      stopObserver();
      restoreAll();
      return;
    }

    if (STATE.autoConvert) {
      STATE.sessionActive = false;
    }

    if (changed || forceScan) {
      restoreAll();
    }

    if (!isActive()) {
      stopObserver();
      return;
    }

    startObserver();
    await scan(document.body);
  }

  async function convertNow() {
    STATE.sessionActive = true;
    restoreAll();
    startObserver();
    await scan(document.body);
  }

  async function loadFromStorage() {
    if (window.NKCSettings?.loadSettings) {
      return window.NKCSettings.loadSettings();
    }
    return new Promise((resolve) => {
      chrome.storage.sync.get(
        [
          "preferredCurrency",
          "autoConvert",
          "realtimeEnabled",
          "displayMode",
          "showSymbols",
          "valueMode",
        ],
        (result) => {
          resolve({
            preferredCurrency: result.preferredCurrency || "LKR",
            autoConvert: Boolean(result.autoConvert ?? result.realtimeEnabled),
            displayMode: result.displayMode === "replace" ? "replace" : "alongside",
            showSymbols: result.showSymbols != null ? Boolean(result.showSymbols) : true,
            valueMode: result.valueMode === "rateOnly" ? "rateOnly" : "fullPrice",
          });
        }
      );
    });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "NKC_SETTINGS_CHANGED") {
      applySettings(message).then(() => sendResponse({ ok: true }));
      return true;
    }
    if (message?.type === "NKC_CONVERT_NOW") {
      convertNow()
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }
    if (message?.type === "NKC_CLEAR") {
      STATE.sessionActive = false;
      stopObserver();
      restoreAll();
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    const keys = [
      "preferredCurrency",
      "autoConvert",
      "realtimeEnabled",
      "displayMode",
      "showSymbols",
      "valueMode",
    ];
    if (!keys.some((k) => k in changes)) return;

    loadFromStorage().then((settings) => applySettings(settings));
  });

  loadFromStorage().then((settings) => applySettings(settings));
})();

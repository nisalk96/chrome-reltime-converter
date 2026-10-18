(() => {
  const STATE = {
    preferredCurrency: "LKR",
    realtimeEnabled: false,
    converting: false,
    observer: null,
    debounceTimer: null,
  };

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

    const base = document.createTextNode(originalText + " ");
    const approx = document.createElement("span");
    approx.className = "nkc-approx";
    approx.textContent = `≈ ${convertedLabel}`;

    span.appendChild(base);
    span.appendChild(approx);
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
        const converted = await window.NKCConverter.convertAmount(
          match.amount,
          match.currency,
          target
        );
        convertedLabel = window.NKCConverter.formatConverted(converted, target);
      } catch {
        // Leave this match as plain text on failure
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
    if (!STATE.realtimeEnabled || !root || STATE.converting) return;
    STATE.converting = true;
    try {
      const nodes = window.NKCDetector.collectTextNodes(root);
      // Process in small batches to keep UI responsive
      const batchSize = 40;
      for (let i = 0; i < nodes.length; i += batchSize) {
        if (!STATE.realtimeEnabled) break;
        const batch = nodes.slice(i, i + batchSize);
        // Re-check nodes still in DOM
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
      if (!STATE.realtimeEnabled) return;
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

  async function applySettings({ preferredCurrency, realtimeEnabled }) {
    const currencyChanged =
      preferredCurrency && preferredCurrency !== STATE.preferredCurrency;
    const enabledChanged = realtimeEnabled !== STATE.realtimeEnabled;

    if (preferredCurrency) STATE.preferredCurrency = preferredCurrency;
    STATE.realtimeEnabled = Boolean(realtimeEnabled);

    if (currencyChanged) {
      window.NKCConverter?.clearMemoryCache?.();
      restoreAll();
    }

    if (!STATE.realtimeEnabled) {
      stopObserver();
      restoreAll();
      return;
    }

    if (enabledChanged || currencyChanged) {
      restoreAll();
    }

    startObserver();
    await scan(document.body);
  }

  async function loadFromStorage() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(["preferredCurrency", "realtimeEnabled"], (result) => {
        resolve({
          preferredCurrency: result.preferredCurrency || "LKR",
          realtimeEnabled: Boolean(result.realtimeEnabled),
        });
      });
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "NKC_SETTINGS_CHANGED") {
      applySettings({
        preferredCurrency: message.preferredCurrency,
        realtimeEnabled: message.realtimeEnabled,
      });
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    const preferredCurrency =
      changes.preferredCurrency?.newValue ?? STATE.preferredCurrency;
    const realtimeEnabled =
      changes.realtimeEnabled?.newValue ?? STATE.realtimeEnabled;
    applySettings({ preferredCurrency, realtimeEnabled });
  });

  loadFromStorage().then((settings) => applySettings(settings));
})();

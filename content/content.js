(() => {
  const STATE = {
    preferredCurrency: "LKR",
    autoConvert: false,
    displayMode: "alongside",
    showSymbols: true,
    valueMode: "fullPrice",
    sessionActive: false,
    converting: false,
    mutationObserver: null,
    intersectionObserver: null,
    debounceTimer: null,
    /** Elements already queued for visibility watch / conversion */
    watched: new WeakSet(),
  };

  const ROOT_MARGIN = "160px 0px";

  function isActive() {
    return STATE.autoConvert || STATE.sessionActive;
  }

  function restoreAll() {
    document.querySelectorAll(".nkc-converted").forEach((el) => {
      const original = el.getAttribute("data-original");
      if (original == null) return;
      el.replaceWith(document.createTextNode(original));
    });
    STATE.watched = new WeakSet();
  }

  function parseCssColor(value) {
    if (!value || value === "transparent") return null;
    const m = value.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
    if (!m) return null;
    const a = m[4] == null ? 1 : Number(m[4]);
    if (a < 0.4) return null;
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  }

  function relativeLuminance({ r, g, b }) {
    const toLin = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
  }

  /** Walk ancestors for an opaque background; dark host → light teal text */
  function isOnDarkBackground(el) {
    let node = el;
    for (let i = 0; i < 8 && node && node !== document.documentElement; i++) {
      const bg = parseCssColor(window.getComputedStyle(node).backgroundColor);
      if (bg) return relativeLuminance(bg) < 0.45;
      node = node.parentElement;
    }
    return false;
  }

  function wrapMatch(originalText, convertedLabel, hostEl) {
    const span = document.createElement("span");
    span.className = "nkc-converted";
    span.setAttribute("data-original", originalText);
    span.setAttribute("title", `Converted to ${STATE.preferredCurrency}`);

    const onDark = isOnDarkBackground(hostEl || document.body);
    const approxClass = onDark ? "nkc-approx nkc-on-dark" : "nkc-approx";

    if (STATE.displayMode === "replace") {
      const approx = document.createElement("span");
      approx.className = `${approxClass} nkc-replaced`;
      approx.textContent = convertedLabel;
      span.appendChild(approx);
    } else {
      span.appendChild(document.createTextNode(originalText + " "));
      const approx = document.createElement("span");
      approx.className = approxClass;
      approx.textContent = `≈ ${convertedLabel}`;
      span.appendChild(approx);
    }
    return span;
  }

  function isElementVisible(el) {
    if (!el || !el.isConnected) return false;
    const style = window.getComputedStyle(el);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;

    const margin = 160;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const vw = window.innerWidth || document.documentElement.clientWidth;
    return (
      rect.bottom >= -margin &&
      rect.top <= vh + margin &&
      rect.right >= -margin &&
      rect.left <= vw + margin
    );
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

      fragments.push(wrapMatch(match.text, convertedLabel, node.parentElement));
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

  async function prefetchRatesForNodes(nodes) {
    const target = STATE.preferredCurrency;
    const fromCodes = new Set();
    for (const node of nodes) {
      if (!node?.nodeValue) continue;
      const matches = window.NKCDetector.findPricesInText(node.nodeValue);
      for (const m of matches) {
        if (m.currency && m.currency !== target) fromCodes.add(m.currency);
      }
    }
    await Promise.all(
      [...fromCodes].map((from) =>
        window.NKCConverter.getRate(from, target).catch(() => null)
      )
    );
  }

  async function convertVisibleIn(root) {
    if (!isActive() || !root || !window.NKCDetector) return;

    const nodes = window.NKCDetector.collectTextNodes(root).filter((n) => {
      const el = n.parentElement;
      return (
        el &&
        !el.closest?.(".nkc-converted") &&
        isElementVisible(el)
      );
    });

    if (!nodes.length) return;

    STATE.converting = true;
    try {
      await prefetchRatesForNodes(nodes);
      const batchSize = 30;
      for (let i = 0; i < nodes.length; i += batchSize) {
        if (!isActive()) break;
        const batch = nodes.slice(i, i + batchSize).filter((n) => n.isConnected);
        await Promise.all(batch.map((n) => processTextNode(n)));
      }
    } finally {
      STATE.converting = false;
    }
  }

  function watchElement(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return;
    if (el.classList?.contains("nkc-converted")) return;
    if (el.closest?.(".nkc-converted")) return;
    if (STATE.watched.has(el)) return;

    // Skip non-content containers
    const tag = el.tagName;
    if (
      tag === "SCRIPT" ||
      tag === "STYLE" ||
      tag === "NOSCRIPT" ||
      tag === "SVG" ||
      tag === "PATH"
    ) {
      return;
    }

    STATE.watched.add(el);

    if (isElementVisible(el)) {
      convertVisibleIn(el);
      return;
    }

    ensureIntersectionObserver();
    STATE.intersectionObserver.observe(el);
  }

  function enqueueFromRoot(root) {
    if (!root || !isActive()) return;

    if (root.nodeType === Node.TEXT_NODE) {
      if (root.parentElement) watchElement(root.parentElement);
      return;
    }

    if (root.nodeType !== Node.ELEMENT_NODE) return;

    // Prefer observing leaf-ish blocks that likely hold prices
    const candidates = root.querySelectorAll
      ? root.querySelectorAll("body, div, span, p, li, a, td, th, strong, b, em, h1, h2, h3, h4, label, button")
      : [];

    watchElement(root);
    candidates.forEach((el) => {
      // Only watch nodes that look like they contain a digit (cheap prefilter)
      const t = el.childNodes.length <= 3 ? el.textContent : "";
      if (t && /\d/.test(t) && t.length < 200) {
        watchElement(el);
      }
    });

    // Also convert whatever is already visible under root
    convertVisibleIn(root);
  }

  function ensureIntersectionObserver() {
    if (STATE.intersectionObserver) return;
    STATE.intersectionObserver = new IntersectionObserver(
      (entries) => {
        if (!isActive()) return;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target;
          STATE.intersectionObserver.unobserve(el);
          convertVisibleIn(el);
        }
      },
      { root: null, rootMargin: ROOT_MARGIN, threshold: 0 }
    );
  }

  function scheduleDiscover(root) {
    clearTimeout(STATE.debounceTimer);
    STATE.debounceTimer = setTimeout(() => {
      enqueueFromRoot(root || document.body);
    }, 200);
  }

  function startMutationObserver() {
    if (STATE.mutationObserver || !document.body) return;
    STATE.mutationObserver = new MutationObserver((mutations) => {
      if (!isActive()) return;
      let dirty = false;
      for (const m of mutations) {
        if (m.type === "characterData") {
          const el = m.target.parentElement;
          if (el && !el.closest?.(".nkc-converted")) {
            dirty = true;
            watchElement(el);
          }
        }
        for (const node of m.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.classList?.contains("nkc-converted")) continue;
            dirty = true;
            enqueueFromRoot(node);
          } else if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
            dirty = true;
            watchElement(node.parentElement);
          }
        }
      }
      if (dirty) scheduleDiscover(document.body);
    });

    STATE.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function stopObservers() {
    if (STATE.mutationObserver) {
      STATE.mutationObserver.disconnect();
      STATE.mutationObserver = null;
    }
    if (STATE.intersectionObserver) {
      STATE.intersectionObserver.disconnect();
      STATE.intersectionObserver = null;
    }
    clearTimeout(STATE.debounceTimer);
    STATE.watched = new WeakSet();
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

    if (!STATE.autoConvert && !forceScan) {
      STATE.sessionActive = false;
      stopObservers();
      restoreAll();
      return;
    }

    if (STATE.autoConvert) {
      STATE.sessionActive = false;
    }

    if (changed || forceScan) {
      stopObservers();
      restoreAll();
    }

    if (!isActive()) {
      stopObservers();
      return;
    }

    startMutationObserver();
    ensureIntersectionObserver();
    enqueueFromRoot(document.body);
  }

  async function convertNow() {
    STATE.sessionActive = true;
    stopObservers();
    restoreAll();
    startMutationObserver();
    ensureIntersectionObserver();
    enqueueFromRoot(document.body);
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
      stopObservers();
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

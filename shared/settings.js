(() => {
  const DEFAULT_SETTINGS = {
    preferredCurrency: "LKR",
    /** true = convert every page automatically; false = only after Convert click */
    autoConvert: false,
    /** "alongside" | "replace" */
    displayMode: "alongside",
    /** include currency symbols in formatted output */
    showSymbols: true,
    /** "fullPrice" | "rateOnly" */
    valueMode: "fullPrice",
  };

  const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS);

  function normalizeSettings(raw = {}) {
    const displayMode =
      raw.displayMode === "replace" ? "replace" : "alongside";
    const valueMode = raw.valueMode === "rateOnly" ? "rateOnly" : "fullPrice";
    return {
      preferredCurrency:
        typeof raw.preferredCurrency === "string" && raw.preferredCurrency
          ? raw.preferredCurrency.toUpperCase()
          : DEFAULT_SETTINGS.preferredCurrency,
      autoConvert: Boolean(
        raw.autoConvert ?? raw.realtimeEnabled ?? DEFAULT_SETTINGS.autoConvert
      ),
      displayMode,
      showSymbols:
        raw.showSymbols == null ? DEFAULT_SETTINGS.showSymbols : Boolean(raw.showSymbols),
      valueMode,
    };
  }

  async function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(SETTINGS_KEYS.concat(["realtimeEnabled"]), (result) => {
        resolve(normalizeSettings(result));
      });
    });
  }

  function saveSettings(partial) {
    return chrome.storage.sync.set(partial);
  }

  const root =
    typeof globalThis !== "undefined"
      ? globalThis
      : typeof window !== "undefined"
        ? window
        : self;
  root.NKCSettings = {
    DEFAULT_SETTINGS,
    SETTINGS_KEYS,
    normalizeSettings,
    loadSettings,
    saveSettings,
  };
})();

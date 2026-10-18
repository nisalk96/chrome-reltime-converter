const currencySelect = document.getElementById("currency");
const showSymbolsToggle = document.getElementById("showSymbols");
const statusEl = document.getElementById("status");
const previewEl = document.getElementById("preview");

const FALLBACK = [
  { iso_code: "LKR", name: "Sri Lankan Rupee" },
  { iso_code: "USD", name: "US Dollar" },
  { iso_code: "EUR", name: "Euro" },
  { iso_code: "GBP", name: "British Pound" },
  { iso_code: "INR", name: "Indian Rupee" },
];

function setStatus(text, kind = "") {
  statusEl.textContent = text || "";
  statusEl.className = `status${kind ? ` ${kind}` : ""}`;
}

function fillCurrencies(list, selected) {
  currencySelect.innerHTML = "";
  for (const c of list) {
    const opt = document.createElement("option");
    opt.value = c.iso_code;
    opt.textContent = `${c.iso_code} — ${c.name}`;
    currencySelect.appendChild(opt);
  }
  const codes = list.map((c) => c.iso_code);
  currencySelect.value = codes.includes(selected)
    ? selected
    : codes.includes("LKR")
      ? "LKR"
      : codes[0];
}

function readFormSettings() {
  const autoConvert = document.querySelector(
    'input[name="convertMode"]:checked'
  )?.value === "always";
  const displayMode =
    document.querySelector('input[name="displayMode"]:checked')?.value ||
    "alongside";
  const valueMode =
    document.querySelector('input[name="valueMode"]:checked')?.value ||
    "fullPrice";
  return {
    preferredCurrency: currencySelect.value || "LKR",
    autoConvert,
    displayMode,
    showSymbols: showSymbolsToggle.checked,
    valueMode,
    realtimeEnabled: autoConvert,
  };
}

function applyFormSettings(settings) {
  if (currencySelect.querySelector(`option[value="${settings.preferredCurrency}"]`)) {
    currencySelect.value = settings.preferredCurrency;
  }

  document.getElementById(settings.autoConvert ? "modeAlways" : "modeClick").checked =
    true;
  document.getElementById(
    settings.displayMode === "replace" ? "displayReplace" : "displayAlongside"
  ).checked = true;
  document.getElementById(
    settings.valueMode === "rateOnly" ? "valueRate" : "valueFull"
  ).checked = true;
  showSymbolsToggle.checked = settings.showSymbols;
  updatePreview();
}

function formatPreviewAmount(currency, showSymbols) {
  if (showSymbols) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(3307.4);
    } catch {
      return `3307.40 ${currency}`;
    }
  }
  return `3307.40 ${currency}`;
}

function formatPreviewRate(from, to, showSymbols) {
  const rate = 330.74;
  if (showSymbols) {
    try {
      const formatted = new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: to,
        maximumFractionDigits: 2,
      }).format(rate);
      return `1 ${from} = ${formatted}`;
    } catch {
      /* fall through */
    }
  }
  return `1 ${from} = ${rate.toFixed(2)} ${to}`;
}

function updatePreview() {
  const s = readFormSettings();
  const to = s.preferredCurrency || "LKR";
  let converted;
  if (s.valueMode === "rateOnly") {
    converted = formatPreviewRate("USD", to, s.showSymbols);
  } else {
    converted = formatPreviewAmount(to, s.showSymbols);
  }

  if (s.displayMode === "replace") {
    previewEl.textContent = `Preview: ${converted}`;
  } else {
    previewEl.textContent = `Preview: $10 ≈ ${converted}`;
  }
}

async function persist() {
  const settings = readFormSettings();
  await chrome.storage.sync.set(settings);
  setStatus("Settings saved", "ok");
  updatePreview();
  chrome.runtime.sendMessage({ type: "NKC_SETTINGS_CHANGED", ...settings }, () => {
    void chrome.runtime.lastError;
  });
}

async function loadCurrencies(preferred) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_CURRENCIES" }, (response) => {
      const list =
        response?.currencies?.length > 0 ? response.currencies : FALLBACK;
      fillCurrencies(list, preferred || "LKR");
      resolve(list);
    });
  });
}

async function init() {
  const settings = await NKCSettings.loadSettings();
  await loadCurrencies(settings.preferredCurrency);
  applyFormSettings(settings);

  currencySelect.addEventListener("change", persist);
  showSymbolsToggle.addEventListener("change", persist);
  document.querySelectorAll('input[name="convertMode"]').forEach((el) => {
    el.addEventListener("change", persist);
  });
  document.querySelectorAll('input[name="displayMode"]').forEach((el) => {
    el.addEventListener("change", persist);
  });
  document.querySelectorAll('input[name="valueMode"]').forEach((el) => {
    el.addEventListener("change", persist);
  });
}

init();

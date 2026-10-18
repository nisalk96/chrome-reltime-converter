const currencyHidden = document.getElementById("currency");
const currencySearch = document.getElementById("currencySearch");
const currencyList = document.getElementById("currencyList");
const currencyToggle = document.getElementById("currencyToggle");
const combobox = document.getElementById("currencyCombobox");
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

let allCurrencies = [...FALLBACK];
let activeIndex = -1;

function setStatus(text, kind = "") {
  statusEl.textContent = text || "";
  statusEl.className = `status${kind ? ` ${kind}` : ""}`;
}

function labelFor(code) {
  const found = allCurrencies.find((c) => c.iso_code === code);
  return found ? `${found.iso_code} — ${found.name}` : code;
}

function setSelectedCurrency(code, { persistChange = false } = {}) {
  const normalized = String(code || "").toUpperCase();
  const exists = allCurrencies.some((c) => c.iso_code === normalized);
  const value = exists
    ? normalized
    : allCurrencies.some((c) => c.iso_code === "LKR")
      ? "LKR"
      : allCurrencies[0]?.iso_code || "LKR";

  currencyHidden.value = value;
  currencySearch.value = labelFor(value);
  if (persistChange) persist();
  else updatePreview();
}

function openList() {
  combobox.classList.add("open");
  currencyList.hidden = false;
  currencySearch.setAttribute("aria-expanded", "true");
  renderList(currencySearch.value);
}

function closeList() {
  combobox.classList.remove("open");
  currencyList.hidden = true;
  currencySearch.setAttribute("aria-expanded", "false");
  activeIndex = -1;
  // Restore canonical label for selected code
  currencySearch.value = labelFor(currencyHidden.value);
}

function filteredCurrencies(query) {
  const raw = String(query || "").trim();
  // While the field still shows the selected label, show the full list
  if (!raw || raw === labelFor(currencyHidden.value)) return allCurrencies;

  const q = raw.toLowerCase().replace(/—/g, " ");
  return allCurrencies.filter((c) => {
    const hay = `${c.iso_code} ${c.name}`.toLowerCase();
    return hay.includes(q) || c.iso_code.toLowerCase().startsWith(q);
  });
}

function renderList(query) {
  const items = filteredCurrencies(query);
  currencyList.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("li");
    empty.className = "combobox-empty";
    empty.textContent = "No currencies match";
    currencyList.appendChild(empty);
    activeIndex = -1;
    return;
  }

  items.forEach((c, index) => {
    const li = document.createElement("li");
    li.className = "combobox-option";
    li.role = "option";
    li.id = `currency-opt-${c.iso_code}`;
    li.dataset.code = c.iso_code;
    li.setAttribute("aria-selected", c.iso_code === currencyHidden.value ? "true" : "false");
    if (index === activeIndex) li.classList.add("active");

    const code = document.createElement("span");
    code.className = "code";
    code.textContent = c.iso_code;
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = c.name;
    li.append(code, name);

    li.addEventListener("mousedown", (e) => {
      e.preventDefault();
      setSelectedCurrency(c.iso_code, { persistChange: true });
      closeList();
    });

    currencyList.appendChild(li);
  });
}

function moveActive(delta) {
  const options = [...currencyList.querySelectorAll(".combobox-option")];
  if (!options.length) return;
  activeIndex = (activeIndex + delta + options.length) % options.length;
  options.forEach((el, i) => el.classList.toggle("active", i === activeIndex));
  options[activeIndex].scrollIntoView({ block: "nearest" });
}

function readFormSettings() {
  const autoConvert =
    document.querySelector('input[name="convertMode"]:checked')?.value === "always";
  const displayMode =
    document.querySelector('input[name="displayMode"]:checked')?.value || "alongside";
  const valueMode =
    document.querySelector('input[name="valueMode"]:checked')?.value || "fullPrice";
  return {
    preferredCurrency: currencyHidden.value || "LKR",
    autoConvert,
    displayMode,
    showSymbols: showSymbolsToggle.checked,
    valueMode,
    realtimeEnabled: autoConvert,
  };
}

function applyFormSettings(settings) {
  setSelectedCurrency(settings.preferredCurrency);
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
      allCurrencies =
        response?.currencies?.length > 0 ? response.currencies : FALLBACK;
      setSelectedCurrency(preferred || "LKR");
      resolve(allCurrencies);
    });
  });
}

function wireCombobox() {
  currencySearch.addEventListener("focus", () => {
    currencySearch.select();
    openList();
  });

  currencySearch.addEventListener("input", () => {
    activeIndex = 0;
    if (currencyList.hidden) openList();
    else renderList(currencySearch.value);
  });

  currencySearch.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (currencyList.hidden) openList();
      else moveActive(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!currencyList.hidden) moveActive(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const options = [...currencyList.querySelectorAll(".combobox-option")];
      const pick =
        (activeIndex >= 0 && options[activeIndex]) ||
        options.find((o) => o.getAttribute("aria-selected") === "true") ||
        options[0];
      if (pick) {
        setSelectedCurrency(pick.dataset.code, { persistChange: true });
        closeList();
        currencySearch.blur();
      }
    } else if (e.key === "Escape") {
      closeList();
      currencySearch.blur();
    }
  });

  currencySearch.addEventListener("blur", () => {
    // Delay so option mousedown can fire first
    setTimeout(() => {
      if (!combobox.contains(document.activeElement)) closeList();
    }, 120);
  });

  currencyToggle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    if (currencyList.hidden) {
      currencySearch.focus();
      openList();
    } else {
      closeList();
    }
  });

  document.addEventListener("mousedown", (e) => {
    if (!combobox.contains(e.target)) closeList();
  });
}

async function init() {
  const settings = await NKCSettings.loadSettings();
  await loadCurrencies(settings.preferredCurrency);
  applyFormSettings(settings);
  wireCombobox();

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

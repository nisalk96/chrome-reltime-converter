const currencySelect = document.getElementById("currency");
const convertBtn = document.getElementById("convertBtn");
const clearBtn = document.getElementById("clearBtn");
const statusEl = document.getElementById("status");
const modeHint = document.getElementById("modeHint");
const openSettings = document.getElementById("openSettings");

const FALLBACK = [
  { iso_code: "LKR", name: "Sri Lankan Rupee" },
  { iso_code: "USD", name: "US Dollar" },
  { iso_code: "EUR", name: "Euro" },
  { iso_code: "GBP", name: "British Pound" },
  { iso_code: "INR", name: "Indian Rupee" },
];

let currentSettings = NKCSettings.DEFAULT_SETTINGS;

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

function updateModeUI() {
  if (currentSettings.autoConvert) {
    modeHint.textContent = "Full realtime is on — pages convert automatically.";
    convertBtn.textContent = "Re-scan this page";
  } else {
    modeHint.textContent = "Click-triggered — convert the current page when you want.";
    convertBtn.textContent = "Convert this page";
  }
}

async function loadCurrencies(preferred) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_CURRENCIES" }, (response) => {
      if (chrome.runtime.lastError) {
        fillCurrencies(FALLBACK, preferred);
        setStatus("Using offline currency list", "error");
        resolve(FALLBACK);
        return;
      }
      const list =
        response?.currencies?.length > 0 ? response.currencies : FALLBACK;
      fillCurrencies(list, preferred || "LKR");
      if (!response?.ok) {
        setStatus("Currency list fallback loaded", "error");
      } else {
        setStatus(`${list.length} currencies ready`, "ok");
      }
      resolve(list);
    });
  });
}

function sendToActiveTab(payload) {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) {
        resolve({ ok: false, error: "No active tab" });
        return;
      }
      chrome.tabs.sendMessage(tab.id, payload, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { ok: true });
      });
    });
  });
}

async function persistCurrency() {
  const preferredCurrency = currencySelect.value;
  currentSettings = { ...currentSettings, preferredCurrency };
  await chrome.storage.sync.set({ preferredCurrency });
  await sendToActiveTab({
    type: "NKC_SETTINGS_CHANGED",
    ...currentSettings,
  });
  setStatus(`Preferred: ${preferredCurrency}`, "ok");
}

async function init() {
  currentSettings = await NKCSettings.loadSettings();
  updateModeUI();
  await loadCurrencies(currentSettings.preferredCurrency);

  currencySelect.addEventListener("change", persistCurrency);

  convertBtn.addEventListener("click", async () => {
    setStatus("Converting…");
    const result = await sendToActiveTab({ type: "NKC_CONVERT_NOW" });
    if (!result.ok) {
      setStatus(result.error || "Could not convert this page", "error");
      return;
    }
    setStatus("Page converted", "ok");
  });

  clearBtn.addEventListener("click", async () => {
    const result = await sendToActiveTab({ type: "NKC_CLEAR" });
    if (!result.ok) {
      setStatus(result.error || "Could not clear", "error");
      return;
    }
    setStatus("Conversions cleared", "ok");
  });

  openSettings.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

init();

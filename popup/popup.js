const currencySelect = document.getElementById("currency");
const realtimeToggle = document.getElementById("realtime");
const statusEl = document.getElementById("status");

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
  currencySelect.value = codes.includes(selected) ? selected : codes.includes("LKR") ? "LKR" : codes[0];
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

function notifyActiveTab(payload) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, payload, () => {
      void chrome.runtime.lastError;
    });
  });
}

async function init() {
  const stored = await chrome.storage.sync.get([
    "preferredCurrency",
    "realtimeEnabled",
  ]);
  const preferred = stored.preferredCurrency || "LKR";
  realtimeToggle.checked = Boolean(stored.realtimeEnabled);

  await loadCurrencies(preferred);

  currencySelect.addEventListener("change", async () => {
    const preferredCurrency = currencySelect.value;
    await chrome.storage.sync.set({ preferredCurrency });
    notifyActiveTab({
      type: "NKC_SETTINGS_CHANGED",
      preferredCurrency,
      realtimeEnabled: realtimeToggle.checked,
    });
    setStatus(`Preferred: ${preferredCurrency}`, "ok");
  });

  realtimeToggle.addEventListener("change", async () => {
    const realtimeEnabled = realtimeToggle.checked;
    await chrome.storage.sync.set({ realtimeEnabled });
    notifyActiveTab({
      type: "NKC_SETTINGS_CHANGED",
      preferredCurrency: currencySelect.value,
      realtimeEnabled,
    });
    setStatus(realtimeEnabled ? "Realtime on" : "Realtime off", "ok");
  });
}

init();

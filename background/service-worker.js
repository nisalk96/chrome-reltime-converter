const API_BASE = "https://api.frankfurter.dev/v2";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FALLBACK_CURRENCIES = [
  { iso_code: "USD", name: "US Dollar" },
  { iso_code: "EUR", name: "Euro" },
  { iso_code: "GBP", name: "British Pound" },
  { iso_code: "INR", name: "Indian Rupee" },
  { iso_code: "LKR", name: "Sri Lankan Rupee" },
  { iso_code: "JPY", name: "Japanese Yen" },
  { iso_code: "AUD", name: "Australian Dollar" },
  { iso_code: "CAD", name: "Canadian Dollar" },
  { iso_code: "CHF", name: "Swiss Franc" },
  { iso_code: "CNY", name: "Chinese Yuan" },
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(["preferredCurrency", "realtimeEnabled"], (result) => {
    const updates = {};
    if (result.preferredCurrency == null) updates.preferredCurrency = "LKR";
    if (result.realtimeEnabled == null) updates.realtimeEnabled = false;
    if (Object.keys(updates).length) chrome.storage.sync.set(updates);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_CURRENCIES") {
    getCurrencies()
      .then((currencies) => sendResponse({ ok: true, currencies }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: String(error),
          currencies: FALLBACK_CURRENCIES,
        })
      );
    return true;
  }

  if (message?.type === "GET_RATE") {
    const { from, to } = message;
    getRate(from, to)
      .then((rate) => sendResponse({ ok: true, rate, from, to }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === "GET_RATES_FOR_BASE") {
    const { base, quotes } = message;
    getRatesForBase(base, quotes)
      .then((rates) => sendResponse({ ok: true, rates, base }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  return false;
});

async function getCurrencies() {
  const cached = await chrome.storage.local.get(["currenciesCache"]);
  const entry = cached.currenciesCache;
  if (entry?.data?.length && Date.now() - entry.fetchedAt < CACHE_TTL_MS) {
    return entry.data;
  }

  try {
    const res = await fetch(`${API_BASE}/currencies`);
    if (!res.ok) throw new Error(`Currencies HTTP ${res.status}`);
    const raw = await res.json();
    const data = (Array.isArray(raw) ? raw : [])
      .filter((c) => c?.iso_code)
      .map((c) => ({
        iso_code: String(c.iso_code).toUpperCase(),
        name: c.name || String(c.iso_code).toUpperCase(),
      }))
      .sort((a, b) => a.iso_code.localeCompare(b.iso_code));

    if (!data.length) throw new Error("Empty currencies list");

    await chrome.storage.local.set({
      currenciesCache: { fetchedAt: Date.now(), data },
    });
    return data;
  } catch {
    return FALLBACK_CURRENCIES;
  }
}

async function getRate(from, to) {
  const fromCode = String(from || "").toUpperCase();
  const toCode = String(to || "").toUpperCase();
  if (!fromCode || !toCode) throw new Error("Missing currency codes");
  if (fromCode === toCode) return 1;

  const cacheKey = `rate:${fromCode}:${toCode}`;
  const cached = await chrome.storage.local.get([cacheKey]);
  const entry = cached[cacheKey];
  if (entry?.rate != null && Date.now() - entry.fetchedAt < CACHE_TTL_MS) {
    return entry.rate;
  }

  const res = await fetch(
    `${API_BASE}/rate/${encodeURIComponent(fromCode)}/${encodeURIComponent(toCode)}`
  );
  if (!res.ok) throw new Error(`Rate HTTP ${res.status}`);
  const data = await res.json();
  const rate = Number(data.rate);
  if (!Number.isFinite(rate)) throw new Error("Invalid rate");

  await chrome.storage.local.set({
    [cacheKey]: { fetchedAt: Date.now(), rate },
  });
  return rate;
}

async function getRatesForBase(base, quotes = []) {
  const baseCode = String(base || "").toUpperCase();
  if (!baseCode) throw new Error("Missing base currency");

  const uniqueQuotes = [
    ...new Set(
      (quotes || [])
        .map((q) => String(q || "").toUpperCase())
        .filter((q) => q && q !== baseCode)
    ),
  ];

  const rates = { [baseCode]: 1 };
  const missing = [];

  for (const quote of uniqueQuotes) {
    const cacheKey = `rate:${baseCode}:${quote}`;
    const cached = await chrome.storage.local.get([cacheKey]);
    const entry = cached[cacheKey];
    if (entry?.rate != null && Date.now() - entry.fetchedAt < CACHE_TTL_MS) {
      rates[quote] = entry.rate;
    } else {
      missing.push(quote);
    }
  }

  if (!missing.length) return rates;

  // Prefer bulk rates endpoint when many quotes are needed
  const url = new URL(`${API_BASE}/rates`);
  url.searchParams.set("base", baseCode.toLowerCase());
  if (missing.length) {
    url.searchParams.set("quotes", missing.map((q) => q.toLowerCase()).join(","));
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    // Fallback: pairwise
    for (const quote of missing) {
      rates[quote] = await getRate(baseCode, quote);
    }
    return rates;
  }

  const data = await res.json();
  // v2 returns either an array of {base, quote, rate} or a rates map
  const fetched = {};
  if (Array.isArray(data)) {
    for (const row of data) {
      const q = String(row.quote || "").toUpperCase();
      const rate = Number(row.rate);
      if (q && Number.isFinite(rate)) fetched[q] = rate;
    }
  } else if (data && typeof data === "object") {
    const map = data.rates || data.quotes || data;
    for (const [q, v] of Object.entries(map)) {
      const rate = Number(v);
      if (Number.isFinite(rate)) fetched[String(q).toUpperCase()] = rate;
    }
  }

  const now = Date.now();
  const toStore = {};

  for (const quote of missing) {
    const rate = fetched[quote];
    if (Number.isFinite(rate)) {
      rates[quote] = rate;
      toStore[`rate:${baseCode}:${quote}`] = { fetchedAt: now, rate };
    }
  }

  // Pairwise fallback for any still missing
  for (const quote of missing) {
    if (rates[quote] == null) {
      rates[quote] = await getRate(baseCode, quote);
    }
  }

  if (Object.keys(toStore).length) {
    await chrome.storage.local.set(toStore);
  }

  return rates;
}

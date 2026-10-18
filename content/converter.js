(() => {
  const rateCache = new Map(); // `${from}:${to}` -> rate

  function formatMoney(amount, currency, showSymbols) {
    if (showSymbols) {
      try {
        return new Intl.NumberFormat(undefined, {
          style: "currency",
          currency,
          maximumFractionDigits: 2,
        }).format(amount);
      } catch {
        /* fall through */
      }
    }
    const n = Number(amount);
    const fixed = Number.isFinite(n) ? n.toFixed(2) : String(amount);
    return `${fixed} ${currency}`;
  }

  function formatConvertedLabel({
    amount,
    from,
    to,
    rate,
    converted,
    showSymbols = true,
    valueMode = "fullPrice",
  }) {
    if (valueMode === "rateOnly") {
      const rateLabel = formatMoney(rate, to, showSymbols);
      return showSymbols
        ? `1 ${from} = ${rateLabel}`
        : `1 ${from} = ${Number(rate).toFixed(4)} ${to}`;
    }
    return formatMoney(converted != null ? converted : amount * rate, to, showSymbols);
  }

  function sendMessage(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { ok: false, error: "No response" });
        });
      } catch (error) {
        resolve({ ok: false, error: String(error) });
      }
    });
  }

  async function getRate(from, to) {
    const key = `${from}:${to}`;
    if (from === to) return 1;
    if (rateCache.has(key)) return rateCache.get(key);

    const response = await sendMessage({ type: "GET_RATE", from, to });
    if (!response?.ok || !Number.isFinite(response.rate)) {
      throw new Error(response?.error || "Rate fetch failed");
    }
    rateCache.set(key, response.rate);
    return response.rate;
  }

  async function convertAmount(amount, from, to) {
    const rate = await getRate(from, to);
    return amount * rate;
  }

  function clearMemoryCache() {
    rateCache.clear();
  }

  window.NKCConverter = {
    convertAmount,
    getRate,
    formatMoney,
    formatConvertedLabel,
    clearMemoryCache,
  };
})();

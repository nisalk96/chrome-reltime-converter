(() => {
  const SYMBOL_TO_ISO = {
    $: "USD",
    "€": "EUR",
    "£": "GBP",
    "¥": "JPY",
    "₹": "INR",
    "₩": "KRW",
    "₽": "RUB",
    "₺": "TRY",
    "₪": "ILS",
    "₫": "VND",
    "₦": "NGN",
    "₡": "CRC",
    "₱": "PHP",
    "₴": "UAH",
    A$: "AUD",
    C$: "CAD",
    NZ$: "NZD",
    HK$: "HKD",
    S$: "SGD",
    R$: "BRL",
  };

  const SYMBOL_CHARS = Object.keys(SYMBOL_TO_ISO)
    .sort((a, b) => b.length - a.length)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

  // Amount: 1,299.00 | 1.299,00 | 1299 | 1,299
  const AMOUNT = "\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?";

  const PRICE_REGEX = new RegExp(
    [
      // A$ 10 / $1,299.00 / €49.99
      `(?<prefixSymbol>(?:${SYMBOL_CHARS}))\\s*(?<prefixAmount>${AMOUNT})`,
      // 10 USD / 1,299.00 EUR
      `(?<suffixAmountCode>${AMOUNT})\\s*(?<suffixCode>[A-Z]{3})\\b`,
      // USD 10 / EUR 49.99
      `\\b(?<prefixCode>[A-Z]{3})\\s*(?<prefixAmountCode>${AMOUNT})`,
      // 25€ / 100$
      `(?<suffixAmountSymbol>${AMOUNT})\\s*(?<suffixSymbol>(?:${SYMBOL_CHARS}))`,
    ].join("|"),
    "g"
  );

  const SKIP_TAGS = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEXTAREA",
    "INPUT",
    "SELECT",
    "OPTION",
    "CODE",
    "PRE",
    "SVG",
    "MATH",
  ]);

  function parseAmount(raw) {
    if (!raw) return null;
    let s = String(raw).trim();
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");

    if (lastComma > -1 && lastDot > -1) {
      if (lastComma > lastDot) {
        // 1.299,00
        s = s.replace(/\./g, "").replace(",", ".");
      } else {
        // 1,299.00
        s = s.replace(/,/g, "");
      }
    } else if (lastComma > -1) {
      const decimals = s.length - lastComma - 1;
      if (decimals === 3 && !s.includes(".")) {
        // thousands: 1,299
        s = s.replace(/,/g, "");
      } else {
        s = s.replace(",", ".");
      }
    } else if (lastDot > -1) {
      const decimals = s.length - lastDot - 1;
      if (decimals === 3 && (s.match(/\./g) || []).length > 1) {
        s = s.replace(/\./g, "");
      }
    }

    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function findPricesInText(text) {
    if (!text || !/\d/.test(text)) return [];
    const matches = [];
    PRICE_REGEX.lastIndex = 0;
    let m;
    while ((m = PRICE_REGEX.exec(text)) !== null) {
      let currency = null;
      let amountRaw = null;

      if (m.groups.prefixSymbol && m.groups.prefixAmount) {
        currency = SYMBOL_TO_ISO[m.groups.prefixSymbol];
        amountRaw = m.groups.prefixAmount;
      } else if (m.groups.suffixCode && m.groups.suffixAmountCode) {
        currency = m.groups.suffixCode.toUpperCase();
        amountRaw = m.groups.suffixAmountCode;
      } else if (m.groups.prefixCode && m.groups.prefixAmountCode) {
        currency = m.groups.prefixCode.toUpperCase();
        amountRaw = m.groups.prefixAmountCode;
      } else if (m.groups.suffixSymbol && m.groups.suffixAmountSymbol) {
        currency = SYMBOL_TO_ISO[m.groups.suffixSymbol];
        amountRaw = m.groups.suffixAmountSymbol;
      }

      const amount = parseAmount(amountRaw);
      if (!currency || amount == null || amount <= 0) continue;

      matches.push({
        index: m.index,
        length: m[0].length,
        text: m[0],
        currency,
        amount,
      });
    }
    return matches;
  }

  function shouldSkipNode(node) {
    if (!node) return true;
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node;
      if (SKIP_TAGS.has(el.tagName)) return true;
      if (el.classList?.contains("nkc-converted")) return true;
      if (el.isContentEditable) return true;
      if (el.closest?.(".nkc-converted, [contenteditable='true']")) return true;
    }
    return false;
  }

  function collectTextNodes(root) {
    const nodes = [];
    if (!root) return nodes;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) {
          return NodeFilter.FILTER_REJECT;
        }
        const parent = node.parentElement;
        if (!parent || shouldSkipNode(parent)) {
          return NodeFilter.FILTER_REJECT;
        }
        // Skip if already inside converted wrapper
        if (parent.closest?.(".nkc-converted")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let current;
    while ((current = walker.nextNode())) {
      nodes.push(current);
    }
    return nodes;
  }

  window.NKCDetector = {
    findPricesInText,
    collectTextNodes,
    parseAmount,
    SYMBOL_TO_ISO,
  };
})();

# NK Currency (`nk-currency-converter`)

Chrome extension that detects prices on any page and shows conversions alongside them in your preferred currency (default: LKR).

> Project id: **nk-currency-converter**. If this folder is still named `chrome-reltime-converter`, rename it when Cursor is not locking the directory.

## Features

- **Realtime** toggle — scan the entire page for prices with symbols (`$`, `€`, `£`, …) or ISO codes (`USD 10`)
- Convert via [Frankfurter](https://frankfurter.dev/) (free, no API key)
- Display format: `$10 ≈ Rs 3,307.40`
- Watches dynamic page updates (infinite scroll / SPAs)
- Preferred currency list loaded from Frankfurter (~165 currencies)

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this project folder
4. Open the **NK Currency** popup, pick a currency, enable **Realtime**

## Project layout

```
manifest.json
popup/
background/
content/
icons/
```

## Notes

- Rates are mid-market and update about daily
- Rates are cached locally for about 6 hours

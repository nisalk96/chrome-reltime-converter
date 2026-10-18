# NK Currency (`nk-currency-converter`)

Chrome extension that detects prices on any page and shows conversions alongside them in your preferred currency (default: LKR).

**Author:** [nisalk](https://nisalk.dev)

> Project id: **nk-currency-converter**. If this folder is still named `chrome-reltime-converter`, rename it when Cursor is not locking the directory.

## Features

- **Settings page** — full realtime (always convert) or click-triggered Convert
- Display: beside original or replace; symbols on/off; full price or rate only
- Convert via [Frankfurter](https://frankfurter.dev/) (free, no API key)
- Watches dynamic page updates (infinite scroll / SPAs)
- Preferred currency list loaded from Frankfurter (~165 currencies)

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this project folder
4. Open **Settings** (or popup → Settings), pick currency and conversion mode
5. Use **Convert this page** in the popup, or turn on **Full realtime**

## Project layout

```
manifest.json
popup/
options/
background/
content/
shared/
icons/
```

## Notes

- Rates are mid-market and update about daily
- Rates are cached locally for about 6 hours

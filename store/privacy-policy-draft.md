# Privacy Policy — NK Currency

**Last updated:** October 20, 2026  
**Developer:** nisalk ([nisalk.dev](https://nisalk.dev))  
**Source code:** [github.com/nisalk96/chrome-reltime-converter](https://github.com/nisalk96/chrome-reltime-converter)

## Summary

NK Currency is a Chrome extension that detects prices on web pages and converts them to your preferred currency. It is designed to be privacy-friendly: no accounts, no ads, no malware/spyware, and no selling of user data.

## Data we store on your device

The extension may store locally in Chrome storage:

- Preferred currency and display settings
- Conversion mode (full realtime vs click-triggered)
- Temporary cached exchange rates (to reduce API calls)

This data stays on your device unless you sync Chrome settings across your own devices via your Google account (controlled by Chrome, not by NK Currency servers).

## Data we do not collect

We do not operate a backend that collects:

- Browsing history
- Personal identity (name, email) for NK Currency accounts
- Payment card data
- Keystrokes, passwords, or clipboard contents for upload
- Advertising or tracking identifiers for sale

## Network requests

When converting currencies, the extension requests public exchange-rate JSON from:

- `https://api.frankfurter.dev` ([frankfurter.dev](https://frankfurter.dev))

Those requests are for rate data only. The response is not executed as remote code.

## Permissions

- **storage** — save settings and rate cache locally  
- **Content scripts** — read visible page text to find prices and show conversions when enabled (declarative injection; no `scripting` or `activeTab` permission)  
- **Host access to api.frankfurter.dev** — fetch exchange rates  

## Children’s privacy

NK Currency is a general utility and does not knowingly collect personal information from children.

## Changes

We may update this policy when the extension changes. The latest version will be posted at this URL and/or in the GitHub repository.

## Contact

Questions: use the contact email listed on the Chrome Web Store listing, or open an issue on GitHub:  
https://github.com/nisalk96/chrome-reltime-converter

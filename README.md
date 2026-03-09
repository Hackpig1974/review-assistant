# 🌿 Review Assistant

A desktop app for writing and submitting product reviews. Scrapes product details, generates AI-written review drafts via Claude, and automates opening review tabs with text pre-filled and 5 stars pre-selected.

---

## Features

- **Folder-based workflow** — one subfolder per product under a root directory
- **AI review generation** — Claude Haiku writes a title + body based on product page data and optional notes
- **Browser automation** — opens all selected review tabs at once, pastes the generated text, clicks 5 stars
- **Persistent browser session** — logs in once per session; session is saved for next time
- **Dark / Light / System theme** — switchable from Settings
- **Portable** — single `.exe`, no installer required
- **Update checker** — notifies you on launch if a newer version is available on GitHub

---

## Requirements

- Windows 10/11
- An [Anthropic API key](https://console.anthropic.com/settings/keys)
- A review platform account (e.g. hamandron.com)

---

## Setup (Development)

```bash
# 1. Clone the repo
git clone https://github.com/Hackpig1974/review-assistant.git
cd review-assistant

# 2. Install dependencies
npm install --include=dev

# 3. Install Playwright browser
npx playwright install chromium

# 4. Launch
start.bat
```

---

## First Run

1. Click **⚙ Settings** and configure:
   - **Root Folder Path** — the directory containing your product subfolders
   - **Anthropic API Key** — from [console.anthropic.com](https://console.anthropic.com/settings/keys)
   - **Review Platform URL** — your review site (e.g. `hamandron.com`)
2. Click **Save Settings**

---

## Folder Structure

Each product lives in its own subfolder under your root path:

```
C:\Reviews\
├── Blue Hiking Backpack\
│   ├── product_url.txt       # Product page URL (optional, used for AI context)
│   ├── review_url.txt        # Review submission URL (required)
│   ├── notes.txt             # Optional notes fed to the AI
│   └── photo.jpg             # Any images (counted and shown in the UI)
├── Wireless Earbuds\
│   └── ...
```

The review submission URL for hamandron.com looks like:
```
https://www.hamandron.com/review/create?id=XXXXXXXXXX
```

---

## Workflow

1. Check the boxes next to products you want to review
2. Fill in the Product URL and Review URL for each (saved automatically to the folder)
3. Click **▶ Generate & Open Reviews**
4. The app scrapes each product page, generates a review with Claude, then opens browser tabs
5. If not already logged in, a browser window opens — log in, then click **I'm Logged In — Continue**
6. Each tab has the title, body, and 5 stars pre-filled — adjust anything you want, then submit
7. Close the browser when done; the app resets automatically

---

## Config

Settings are stored in your app data folder (`%APPDATA%\review-assistant\config.json`). This file contains your API key and is excluded from version control. **Never commit it.**

---

## Building a Portable Executable

```bash
npm run dist
```

Output will be in the `dist/` folder as `ReviewAssistant-portable.exe`.

---

## Project Structure

| Path | Purpose |
|------|---------|
| `src/main.js` | Electron main process — config, IPC, scraping, AI, browser automation |
| `src/preload.js` | Context bridge between main and renderer |
| `src/renderer/index.html` | App UI |
| `src/renderer/styles.css` | Theming and layout (CSS variables) |
| `src/renderer/app.js` | UI logic |
| `start.bat` | Dev launch script |

---

## Version History

### v1.0.0
- Initial release
- Folder-based product management with image count display
- AI review generation via Claude Haiku
- Playwright browser automation with persistent session
- 5-star auto-selection, title + body pre-fill
- Settings panel with API key, platform URL, root folder, theme selector
- Dark / Light / System theme support
- GitHub update checker
- Portable single-exe build via electron-builder

---

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).

You are free to use, modify, and distribute this software under the terms of the GPL v3.
Any derivative works must also be distributed under the same license.

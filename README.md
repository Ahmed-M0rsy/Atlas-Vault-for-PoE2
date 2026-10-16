# ⚗️ Atlas Vault – PoE2 Build Manager

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-orange?style=flat-square)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Compatibility](https://img.shields.io/badge/Browser-Chrome%20%7C%20Edge%20%7C%20Brave-blue?style=flat-square)](#-installation)
[![Target](https://img.shields.io/badge/Platform-Mobalytics%20PoE2-blueviolet?style=flat-square)](https://mobalytics.gg/poe-2)
[![License: MIT](https://img.shields.io/badge/License-MIT-gold?style=flat-square)](LICENSE)

**Atlas Vault** is a lightweight, dark-themed browser extension for **Microsoft Edge**, **Google Chrome**, and other Chromium browsers. Designed specifically for *Path of Exile 2* players on [Mobalytics](https://mobalytics.gg/poe-2), it lets you bookmark and categorize builds into custom folders, jump around long build guides with a pinned Table of Contents, and keep your whole vault visible on the page itself.

---

## ✨ Features

### 🌲 Your vault, organized
- Save builds into custom folders (*League Starters*, *Endgame Bossers*, *Act Leveling*…) plus an automatic **No folder** group at the bottom.
- Create, rename (✏️), and delete folders inline.
- Rename any saved build to whatever you call it — not just the folder it's in.
- **Drag & drop** builds to reorder them by hand, or drag one straight into a different folder.
- Re-saving a build you already have updates it in place instead of piling up duplicates.

### 📌 Sidebar that lives on the page
- Appears on any Mobalytics PoE 2 page, docked to the right edge just below the site's navigation bar so nothing on Mobalytics gets covered.
- **➖ Minimize** it down to a slim strip, or collapse it entirely to the ⚗️ tab and click to bring it back.
- Drag the edge to make it wider or narrower — double-click the handle to reset.
- Everything you do in the toolbar popup is reflected in the sidebar instantly, and vice versa.

### 📑 Pinned Table of Contents
- On any build guide, the page's own Table of Contents is detected and mirrored inside the sidebar.
- Click any section (*Overview*, *Gems*, *Passives*, *Equipment*, *Quest Rewards*…) to jump straight there instead of scrolling back to Mobalytics' navigation.
- Drag the splitter to give the ToC more or less room; double-click to reset.

### 🔀 Build Variants
- If the guide has level variants (lvl 1–14, Endgame, and so on), they're listed in the sidebar as **🔀 Build Variants** so you can flip between stages without hunting for the tab on the page.
- Collapsible, and independently resizable.

### 🔍 Search, sort, and zoom
- Filter your vault instantly by guide title or creator.
- Sort by **Manual**, **Newest**, **Oldest**, **A–Z**, or **Z–A**.
- **A− / A＋** scales the whole interface up or down if the default size doesn't suit you; double-click the percentage to reset to 100%.

### 💾 Backup
- **📤 Export** your builds, folders, and settings to a JSON file.
- **📥 Import** it again — handy for moving to a new machine, or for keeping a spare copy.

### 🎨 PoE2 aesthetic
- Dark-slate and gold throughout, matching Path of Exile 2's dark fantasy styling.

---

## 🚀 Installation

Works with any Chromium-based browser (**Microsoft Edge**, **Google Chrome**, **Brave**, **Opera**, **Vivaldi**).

1. Download or clone this repository to your computer.
2. Open your browser's extensions page:
   - **Edge** → `edge://extensions/`
   - **Chrome** → `chrome://extensions/`
3. Turn on **Developer mode** (bottom-left in Edge, top-right in Chrome).
4. Click **Load unpacked**.
5. Select **the repository folder itself** — the one containing `manifest.json`.

*(Optional)* Click the puzzle piece icon in your toolbar and pin **Atlas Vault** for one-click access.

---

## 🎮 How to Use

### Saving a build
1. Open any PoE 2 build on [Mobalytics](https://mobalytics.gg/poe-2/builds).
2. Press **💾 Save Build** in the sidebar, or click the Atlas Vault toolbar icon and use **💾 Save Current Build**.
3. Pick a folder from the dropdown (or leave it as *No folder*).
4. The title, creator, and thumbnail are captured for you.

### Organizing your vault
| I want to… | Do this |
|---|---|
| **Create a folder** | Type a name in the *"New folder…"* box and press **＋** or `Enter` |
| **Expand / collapse a folder** | Click its header |
| **Rename a folder** | Hover the header, click **✏️**, edit inline |
| **Rename a build** | Hover the build, click **✏️**, edit inline |
| **Move a build** | Drag it into another folder, or hover it and pick a folder from the 📁 menu |
| **Reorder builds** | Drag them up or down (sort is set to **Manual**) |
| **Delete** | Hover and click **🗑️** — deleting a folder keeps its builds, it just moves them to *No folder* |

### Using the Table of Contents
Open the sidebar on any build guide and the **📋 Table of Contents** section appears at the top. Click any entry to jump to that part of the guide.

### Backing up
Hit **📤 Export** in either the popup or the sidebar to download a JSON backup, and **📥 Import** to restore one.

### Getting the sidebar out of the way
- **➖** in the header minimizes it to a slim strip.
- Click the **⚗️** tab on the left edge to collapse it to nothing, and click it again to restore.
- Drag the sidebar's edge to resize it; double-click the handle to reset to the default width.

---

## 🔒 Privacy

Atlas Vault is Manifest V3 and runs entirely on your machine:

- Your builds, folders, and settings are stored **only** in your browser's local extension storage (`chrome.storage.local`).
- The extension only has access to **mobalytics.gg** — no other site.
- **No analytics, no tracking, no telemetry.** Nothing is sent anywhere. Your data stays yours.

---

## 🛠️ Project Layout

Everything the browser needs is in the repository root — there's no build step, and nothing to compile.

```text
Atlas-Vault-for-PoE2/
├── manifest.json     # Extension configuration
├── background.js     # Service worker: storage & data operations
├── content/          # In-page sidebar, ToC and variant parsing
│   ├── content.js
│   └── content.css
├── popup/            # Toolbar popup
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
└── icons/            # Extension icons (16, 48, 128)
```

---

## ⚖️ Disclaimer

Atlas Vault is a third-party fan project and is not affiliated with, endorsed by, or associated with **Mobalytics** or **Grinding Gear Games**. All game assets and trademarks belong to their respective owners.

---

## 📄 License

Released under the [MIT License](LICENSE).

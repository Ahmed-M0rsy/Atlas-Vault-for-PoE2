# ⚗️ Atlas Vault – PoE2 Build Manager

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-orange?style=flat-square)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Compatibility](https://img.shields.io/badge/Browser-Chrome%20%7C%20Edge%20%7C%20Brave-blue?style=flat-square)](#-installation)
[![Target](https://img.shields.io/badge/Platform-Mobalytics%20PoE2-blueviolet?style=flat-square)](https://mobalytics.gg/poe-2)
[![License: MIT](https://img.shields.io/badge/License-MIT-gold?style=flat-square)](LICENSE)

**Atlas Vault** is a lightweight, dark-themed browser extension for **Microsoft Edge**, **Google Chrome**, and other Chromium browsers. Designed specifically for *Path of Exile 2* players on [Mobalytics](https://mobalytics.gg/poe-2), it allows you to bookmark and categorize builds into custom folders, navigate complex build guides with a floating Table of Contents, and access your vault anywhere with an on-page sidebar.

---

## ✨ Features

### 🌲 Hierarchical Tree View
- Organize your saved builds into custom expandable folders (e.g., *League Starters*, *Endgame Bossers*, *Act Leveling*).
- Uncategorized builds are neatly grouped at the bottom.
- Inline folder creation, deletion, and quick renaming (✏️).
- Move builds between folders in two clicks.

### 📌 In-Page Persistent Sidebar
- Always accessible on any Mobalytics PoE 2 page (`https://mobalytics.gg/poe-2/*`).
- Sits unobtrusively on the right edge, below the site's top navigation bar so buttons remain fully clickable.
- Includes a quick **⚗️ tab toggle** on the left edge to collapse or expand the panel anytime.
- Real-time synchronization between the extension popup and the in-page sidebar via `chrome.storage`.

### 📑 Sticky Table of Contents (ToC)
- When viewing any build guide, the page's Table of Contents is automatically detected, mirrored, and pinned inside the sidebar.
- Smoothly jumps to any section (Overview, Gems, Passives, Equipment, Quest Rewards) without having to scroll back to find the native navigation list.

### 🖱️ Single-Click Navigation
- The entire build card is clickable — click anywhere on a card to open the build guide in a new browser tab.
- Hover-reveal controls for moving (📁) or deleting (🗑️) builds without misclicking.

### 🔍 Quick Search & Filter
- Instantly filter through your saved builds by guide title or creator name.

### 🎨 PoE2 Aesthetic
- Custom dark-slate and gold interface matching Path of Exile 2's dark fantasy theme.

---

## 🚀 Installation

Works with any Chromium-based browser (**Microsoft Edge**, **Google Chrome**, **Brave**, **Opera**, **Vivaldi**).

### Microsoft Edge
1. Download or clone this repository to your computer.
2. In Edge, navigate to `edge://extensions/`.
3. Enable **Developer mode** using the toggle switch in the bottom-left sidebar.
4. Click the **Load unpacked** button at the top of the page.
5. Select the `mobalytics-build-manager` directory (the folder containing `manifest.json`).

### Google Chrome & Chromium Browsers
1. Download or clone this repository to your computer.
2. In Chrome, navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top-right corner.
4. Click **Load unpacked**.
5. Select the `mobalytics-build-manager` directory.

*(Optional)* Click the puzzle piece icon in your browser toolbar and pin **Atlas Vault** for one-click access.

---

## 🎮 How to Use

### 1. Saving a Build
1. Open any PoE 2 build on [Mobalytics](https://mobalytics.gg/poe-2/builds).
2. Click the **Atlas Vault** extension icon or use the **Save Build** button directly in the on-page sidebar.
3. Choose a destination folder from the dropdown (or leave as *No folder*).
4. Click **💾 Save Current Build**. The title, creator, and thumbnail will be captured automatically.

### 2. Managing Folders
- **Create**: Type a folder name into the "New folder..." input and click **＋** (or press `Enter`).
- **Toggle**: Click any folder header to expand or collapse its contents.
- **Rename**: Hover over a folder header and click the pencil icon (✏️) to edit the name inline.
- **Move Builds**: Hover over any build card and click the folder icon (📁) to move it to a different category.

### 3. Using the Floating Table of Contents
- On any build page, open the right-side **Atlas Vault** sidebar.
- The **TABLE OF CONTENTS** section will appear at the top. Click any section link to immediately scroll directly to that guide section.

---

## 📁 Repository Structure

```text
Atlas_Vault_for_PoE2/
├── README.md
└── mobalytics-build-manager/
    ├── manifest.json         # Manifest V3 extension configuration
    ├── background.js         # Service worker handling storage & CRUD operations
    ├── icons/                # Extension icon assets (16x16, 48x48, 128x128)
    │   ├── icon-16.png
    │   ├── icon-48.png
    │   └── icon-128.png
    ├── content/              # In-page script and stylesheet
    │   ├── content.js        # Sidebar injector, ToC parser & SPA navigation watcher
    │   └── content.css       # Persistent sidebar and tree view styles
    └── popup/                # Extension toolbar popup interface
        ├── popup.html        # Popup markup (tree view layout)
        ├── popup.js          # Controller for popup interactions & metadata scraping
        └── popup.css         # Popup styling
```

---

## 🔒 Permissions & Privacy

Atlas Vault adheres strictly to **Manifest V3** security standards:
- **`storage`**: Used solely to persist your folder structure and saved build URLs locally in your browser (`chrome.storage.local`).
- **`tabs` & `scripting`**: Used only to read the title and metadata of the active Mobalytics build tab when you choose to save it.
- **`host_permissions` (`https://mobalytics.gg/*`)**: Restricted strictly to Mobalytics. The extension has no access to any other websites.
- **No Analytics / No Tracking**: Atlas Vault sends zero telemetry or analytics anywhere. Your data remains strictly local to your machine.

---

## 🛠️ Technology Stack
- **JavaScript (ES6+)** with modern async/await patterns
- **Chrome Extensions API (Manifest V3)**
- **CSS3 Variables & Flexbox**
- **DOM MutationObserver** for SPA route transitions

---

## ⚖️ Disclaimer
Atlas Vault is a third-party fan project and is not affiliated with, endorsed by, or associated with **Mobalytics** or **Grinding Gear Games**. All game assets and trademarks belong to their respective owners.

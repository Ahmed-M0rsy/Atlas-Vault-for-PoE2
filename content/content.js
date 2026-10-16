// content/content.js — Atlas Vault sidebar, always visible on mobalytics.gg/poe-2/*
'use strict';

// ── Constants ────────────────────────────────────────────────────────────────
const IS_BUILD_PAGE = () => /\/poe-2\/builds\//.test(location.pathname);

// ── Toast ────────────────────────────────────────────────────────────────────
function showToast(title, body = '') {
  let el = document.getElementById('av-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'av-toast';
    document.body.appendChild(el);
  }
  el.innerHTML = `<strong>${escHtml(title)}</strong>${body ? escHtml(body) : ''}`;
  el.classList.add('av-show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('av-show'), 3000);
}

function escHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Settings & Layout State ──────────────────────────────────────────────────
let currentTocHeight = 220;
let currentSidebarWidth = 272; // visual (on-screen) width in px; zoom-compensated
let currentZoom = 1;
let currentSort = 'newest';
let sidebarCollapsed = false;
let sidebarMinimized = false; // true = fully hidden, only floating restore pill visible
let currentVariantsHeight = 120;
const ZOOM_MIN = 0.7, ZOOM_MAX = 1.6, ZOOM_STEP = 0.1;
const SORT_MODES = ['manual', 'newest', 'oldest', 'az', 'za'];

// Visual (on-screen) shell geometry — kept constant across zoom levels.
// The CSS `zoom` property scales the shell's own top/height/width, so every
// geometric value is specified as visual/zoom to cancel the scaling.
const AV_TOP = 108;    // visual px from viewport top (below the site nav bars)
const AV_BOTTOM_GAP = 10; // visual px gap at the viewport bottom
const AV_COLLAPSED_W = 36; // visual px of the collapsed strip

// Specified (pre-zoom) px string for a desired visual px value.
function spec(visualPx) {
  return `${Math.max(0, Math.round(visualPx / currentZoom))}px`;
}

function applyShellGeometry() {
  if (!sidebar) return;
  sidebar.style.zoom = String(currentZoom);
  sidebar.style.top = spec(AV_TOP);
  const visualH = window.innerHeight - AV_TOP - AV_BOTTOM_GAP;
  sidebar.style.height = spec(Math.max(200, visualH));
  if (sidebar.classList.contains('av-minimized')) {
    sidebar.style.width = '';
  } else if (sidebar.classList.contains('av-collapsed')) {
    sidebar.style.width = spec(AV_COLLAPSED_W);
  } else {
    sidebar.style.width = spec(currentSidebarWidth);
  }
}

function applyZoom() {
  // Shell footprint stays fixed; only inner content scales (and scrolls inside).
  applyShellGeometry();
  const tocEl = document.getElementById('av-toc-section');
  if (tocEl && tocOpen && tocEl.style.display !== 'none') {
    tocEl.style.height = spec(currentTocHeight);
  }
  const vList = document.getElementById('av-variants-list');
  if (vList) vList.style.maxHeight = spec(currentVariantsHeight);
  const label = document.getElementById('av-zoom-label');
  if (label) label.textContent = `${Math.round(currentZoom * 100)}%`;
  const sortSel = document.getElementById('av-sb-sort');
  if (sortSel && SORT_MODES.includes(currentSort)) sortSel.value = currentSort;
}

function applyMinimized() {
  if (!sidebar) return;
  sidebar.classList.toggle('av-minimized', sidebarMinimized);
  const float = document.getElementById('av-restore-float');
  if (float) float.style.display = sidebarMinimized ? 'flex' : 'none';
}

async function persistSettings(patch) {
  const { settings = {} } = await chrome.storage.local.get('settings');
  const updated = { ...settings, ...patch };
  await chrome.storage.local.set({ settings: updated });
  if (typeof patch.uiZoom === 'number') { currentZoom = patch.uiZoom; applyZoom(); }
  if (typeof patch.buildSort === 'string') currentSort = patch.buildSort;
  if (typeof patch.sidebarCollapsed === 'boolean') sidebarCollapsed = patch.sidebarCollapsed;
  if (typeof patch.sidebarMinimized === 'boolean') { sidebarMinimized = patch.sidebarMinimized; applyMinimized(); }
  if (typeof patch.variantsHeight === 'number') {
    currentVariantsHeight = patch.variantsHeight;
    const list = document.getElementById('av-variants-list');
    if (list) list.style.maxHeight = spec(currentVariantsHeight);
  }
}

function sortBuilds(list) {
  const arr = [...list];
  if (currentSort === 'az') return arr.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  if (currentSort === 'za') return arr.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
  if (currentSort === 'oldest') return arr.sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0));
  if (currentSort === 'manual') {
    if (!arr.some(b => typeof b.order === 'number')) return arr.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    return arr.sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
  }
  return arr.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}

// ── Data helpers (direct storage access in content script) ───────────────────
async function loadData() {
  const { folders = [], builds = [], settings = {} } = await chrome.storage.local.get(['folders', 'builds', 'settings']);
  if (settings.tocHeight && typeof settings.tocHeight === 'number') {
    currentTocHeight = settings.tocHeight;
    const tocEl = document.getElementById('av-toc-section');
    if (tocEl && tocOpen && tocEl.style.display !== 'none') {
      tocEl.style.height = spec(currentTocHeight);
    }
  }
  if (settings.sidebarWidth && typeof settings.sidebarWidth === 'number') {
    currentSidebarWidth = Math.max(200, Math.min(650, settings.sidebarWidth));
  }
  if (typeof settings.uiZoom === 'number' && Number.isFinite(settings.uiZoom)) {
    currentZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, settings.uiZoom));
    applyZoom();
  }
  if (typeof settings.buildSort === 'string' && SORT_MODES.includes(settings.buildSort)) {
    currentSort = settings.buildSort;
    const sortSel = document.getElementById('av-sb-sort');
    if (sortSel) sortSel.value = currentSort;
  }
  if (typeof settings.sidebarCollapsed === 'boolean') {
    sidebarCollapsed = settings.sidebarCollapsed;
    if (sidebar) sidebar.classList.toggle('av-collapsed', sidebarCollapsed);
  }
  if (typeof settings.sidebarMinimized === 'boolean') {
    sidebarMinimized = settings.sidebarMinimized;
    applyMinimized();
  }
  if (typeof settings.variantsHeight === 'number' && Number.isFinite(settings.variantsHeight)) {
    currentVariantsHeight = Math.max(60, Math.min(400, settings.variantsHeight));
    const vList = document.getElementById('av-variants-list');
    if (vList) vList.style.maxHeight = spec(currentVariantsHeight);
  }
  applyShellGeometry();
  return { folders, builds, settings };
}

async function saveBuild(build) {
  const { builds = [] } = await chrome.storage.local.get('builds');
  const idx = builds.findIndex(b => b.url === build.url);
  if (idx >= 0) {
    builds[idx] = { ...builds[idx], ...build };
  } else {
    builds.push({ ...build, id: crypto.randomUUID(), savedAt: Date.now() });
  }
  await chrome.storage.local.set({ builds });
}

async function deleteBuild(id) {
  const { builds = [] } = await chrome.storage.local.get('builds');
  await chrome.storage.local.set({ builds: builds.filter(b => b.id !== id) });
}

async function createFolder(name) {
  const { folders = [] } = await chrome.storage.local.get('folders');
  const folder = { id: crypto.randomUUID(), name, createdAt: Date.now() };
  folders.push(folder);
  await chrome.storage.local.set({ folders });
  return folder;
}

async function deleteFolder(id) {
  const { folders = [], builds = [] } = await chrome.storage.local.get(['folders', 'builds']);
  const updatedBuilds = builds.map(b => b.folderId === id ? { ...b, folderId: null } : b);
  await chrome.storage.local.set({
    folders: folders.filter(f => f.id !== id),
    builds: updatedBuilds
  });
}

async function renameFolder(id, name) {
  const { folders = [] } = await chrome.storage.local.get('folders');
  const idx = folders.findIndex(f => f.id === id);
  if (idx >= 0) { folders[idx].name = name; await chrome.storage.local.set({ folders }); }
}

async function renameBuild(id, title) {
  const name = String(title || '').trim().slice(0, 120);
  if (!name) return;
  const { builds = [] } = await chrome.storage.local.get('builds');
  const idx = builds.findIndex(b => b.id === id);
  if (idx >= 0) { builds[idx].title = name; await chrome.storage.local.set({ builds }); }
}

async function moveBuildOrder(buildId, dir) {
  const { builds = [] } = await chrome.storage.local.get('builds');
  const build = builds.find(b => b.id === buildId);
  if (!build) return false;
  const group = builds.filter(b => (b.folderId || null) === (build.folderId || null));
  const seedManual = currentSort !== 'manual' || !group.some(b => typeof b.order === 'number');
  if (seedManual) {
    // Seed global order from current display order so manual starts where the user was
    const allSorted = sortBuilds(builds);
    allSorted.forEach((b, i) => {
      const t = builds.find(x => x.id === b.id);
      if (t) t.order = i;
    });
    currentSort = 'manual';
    await persistSettings({ buildSort: 'manual' });
  }
  const sorted = sortBuilds(builds.filter(b => (b.folderId || null) === (build.folderId || null)));
  const idx = sorted.findIndex(b => b.id === buildId);
  const swapIdx = idx + dir;
  if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) {
    await chrome.storage.local.set({ builds });
    return true;
  }
  const tmp = sorted[idx].order;
  sorted[idx].order = sorted[swapIdx].order;
  sorted[swapIdx].order = tmp;
  [sorted[idx], sorted[swapIdx]].forEach(b => {
    const t = builds.find(x => x.id === b.id);
    if (t) t.order = b.order;
  });
  await chrome.storage.local.set({ builds });
  return true;
}

async function moveBuildToFolder(buildId, folderId) {
  const { builds = [] } = await chrome.storage.local.get('builds');
  const idx = builds.findIndex(b => b.id === buildId);
  if (idx >= 0) { builds[idx].folderId = folderId || null; await chrome.storage.local.set({ builds }); }
}

// ── Build meta extraction ─────────────────────────────────────────────────────
function extractBuildMeta() {
  const ogTitle = document.querySelector('meta[property="og:title"]')?.content;
  const h1 = document.querySelector('h1')?.textContent?.trim();
  const ogImg = document.querySelector('meta[property="og:image"]')?.content;
  const authorEl = document.querySelector('[class*="author"], [class*="creator"]');
  return {
    title: ogTitle || h1 || document.title || 'Unknown Build',
    author: authorEl?.textContent?.trim().replace(/^by\s*/i, '') || '',
    buildClass: '',
    url: location.href,
    thumbnail: ogImg || ''
  };
}

// ── Export / Import helpers ──────────────────────────────────────────────────
async function exportData() {
  const { folders = [], builds = [], settings = {} } = await chrome.storage.local.get(['folders', 'builds', 'settings']);
  settings.tocHeight = currentTocHeight;
  settings.sidebarWidth = currentSidebarWidth;
  settings.uiZoom = currentZoom;
  settings.buildSort = currentSort;
  settings.sidebarCollapsed = sidebarCollapsed;
  settings.sidebarMinimized = sidebarMinimized;
  settings.variantsHeight = currentVariantsHeight;

  const backup = {
    app: 'Atlas Vault',
    version: 1,
    exportedAt: new Date().toISOString(),
    folders,
    builds,
    settings
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `atlas-vault-backup-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);

  showToast('📤 Export Complete', `Exported ${folders.length} folder(s) and ${builds.length} build(s).`);
}

function triggerImport() {
  let input = document.getElementById('av-import-file-input');
  if (!input) {
    input = document.createElement('input');
    input.type = 'file';
    input.id = 'av-import-file-input';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    document.body.appendChild(input);
  }

  input.value = '';
  input.onchange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        const normalized = normalizeImportData(parsed);
        if (normalized.builds.length === 0 && normalized.folders.length === 0) {
          showToast('❌ Import Error', 'No valid builds or folders found in file.');
          return;
        }
        showImportModal(normalized);
      } catch (err) {
        showToast('❌ Import Error', 'Invalid JSON backup file.');
      }
    };
    reader.onerror = () => {
      showToast('❌ Import Error', 'Could not read selected file.');
    };
    reader.readAsText(file);
  };

  input.click();
}

function normalizeImportData(raw) {
  let folders = [];
  let builds = [];
  let settings = null;
  let exportedAt = null;

  if (Array.isArray(raw)) {
    builds = raw;
  } else if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.folders)) folders = raw.folders;
    if (Array.isArray(raw.builds)) builds = raw.builds;
    if (raw.settings && typeof raw.settings === 'object') settings = raw.settings;
    if (raw.exportedAt) exportedAt = raw.exportedAt;
  }

  builds = builds.filter(b => b && (b.url || b.title)).map(b => ({
    id: b.id || crypto.randomUUID(),
    title: b.title || 'Untitled Build',
    author: b.author || '',
    buildClass: b.buildClass || '',
    url: b.url || '',
    thumbnail: b.thumbnail || '',
    folderId: b.folderId || null,
    savedAt: b.savedAt || Date.now(),
    ...(typeof b.order === 'number' ? { order: b.order } : {})
  }));

  folders = folders.filter(f => f && f.name).map(f => ({
    id: f.id || crypto.randomUUID(),
    name: String(f.name).trim(),
    createdAt: f.createdAt || Date.now()
  }));

  return { folders, builds, settings, exportedAt };
}

function showImportModal(importedData) {
  let modal = document.getElementById('av-import-modal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'av-import-modal';
  modal.className = 'av-modal-backdrop';

  const dateFormatted = importedData.exportedAt
    ? new Date(importedData.exportedAt).toLocaleDateString() + ' ' + new Date(importedData.exportedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  modal.innerHTML = `
    <div class="av-modal-card">
      <div class="av-modal-header">
        <span class="av-modal-title">📥 Import Atlas Vault Data</span>
        <button class="av-modal-close" title="Close">✕</button>
      </div>
      <div class="av-modal-body">
        <p class="av-modal-desc">Backup contents detected:</p>
        <div class="av-import-stats">
          <div class="av-import-stat"><strong>${importedData.folders.length}</strong><span>Folders</span></div>
          <div class="av-import-stat"><strong>${importedData.builds.length}</strong><span>Builds</span></div>
          <div class="av-import-stat"><strong>${importedData.settings ? 'Yes' : 'No'}</strong><span>Settings</span></div>
        </div>
        ${dateFormatted ? `<div class="av-import-meta">📅 Exported: ${escHtml(dateFormatted)}</div>` : ''}
        <div class="av-import-help">
          <b>Merge Data:</b> Keep existing builds and add incoming items without duplicates.<br/>
          <b>Replace All:</b> Overwrite existing builds and settings completely.
        </div>
      </div>
      <div class="av-modal-actions">
        <button id="av-btn-import-cancel" class="av-btn-secondary">Cancel</button>
        <button id="av-btn-import-replace" class="av-btn-danger" title="Overwrite current data">Replace All</button>
        <button id="av-btn-import-merge" class="av-btn-primary" title="Keep existing and add incoming">Merge Data</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('.av-modal-close').addEventListener('click', close);
  modal.querySelector('#av-btn-import-cancel').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  modal.querySelector('#av-btn-import-merge').addEventListener('click', async () => {
    close();
    await executeMerge(importedData);
    await loadAndRender();
    showToast('✅ Import Complete', `Merged ${importedData.builds.length} build(s) & ${importedData.folders.length} folder(s).`);
  });

  modal.querySelector('#av-btn-import-replace').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to replace ALL current builds and folders with this backup? This cannot be undone.')) return;
    close();
    await executeReplace(importedData);
    await loadAndRender();
    showToast('✅ Import Complete', `Restored ${importedData.builds.length} build(s) & ${importedData.folders.length} folder(s).`);
  });
}

async function executeMerge(imported) {
  const { folders: curFolders = [], builds: curBuilds = [], settings: curSettings = {} } =
    await chrome.storage.local.get(['folders', 'builds', 'settings']);

  const folderIdMap = new Map();
  const finalFolders = [...curFolders];

  imported.folders.forEach(impFolder => {
    const existing = finalFolders.find(f => f.name.toLowerCase() === impFolder.name.toLowerCase());
    if (existing) {
      folderIdMap.set(impFolder.id, existing.id);
    } else {
      const newFolder = { ...impFolder, id: impFolder.id || crypto.randomUUID() };
      finalFolders.push(newFolder);
      folderIdMap.set(impFolder.id, newFolder.id);
    }
  });

  const finalBuilds = [...curBuilds];
  imported.builds.forEach(impBuild => {
    const targetFolderId = impBuild.folderId ? (folderIdMap.get(impBuild.folderId) || impBuild.folderId) : null;
    const validFolderId = finalFolders.some(f => f.id === targetFolderId) ? targetFolderId : null;

    const existingIdx = finalBuilds.findIndex(b => (impBuild.url && b.url === impBuild.url) || b.id === impBuild.id);
    if (existingIdx >= 0) {
      finalBuilds[existingIdx] = {
        ...finalBuilds[existingIdx],
        ...impBuild,
        folderId: validFolderId !== undefined ? validFolderId : finalBuilds[existingIdx].folderId
      };
    } else {
      finalBuilds.push({
        ...impBuild,
        id: impBuild.id || crypto.randomUUID(),
        folderId: validFolderId
      });
    }
  });

  const finalSettings = { ...curSettings, ...(imported.settings || {}) };

  await chrome.storage.local.set({
    folders: finalFolders,
    builds: finalBuilds,
    settings: finalSettings
  });

  if (finalSettings.tocHeight) {
    currentTocHeight = finalSettings.tocHeight;
    const tocSection = document.getElementById('av-toc-section');
    if (tocSection && tocOpen) tocSection.style.height = spec(currentTocHeight);
  }
  if (finalSettings.sidebarWidth) {
    currentSidebarWidth = finalSettings.sidebarWidth;
    applyShellGeometry();
  }
}

async function executeReplace(imported) {
  const finalSettings = imported.settings || {};
  await chrome.storage.local.set({
    folders: imported.folders,
    builds: imported.builds,
    settings: finalSettings
  });

  if (finalSettings.tocHeight) {
    currentTocHeight = finalSettings.tocHeight;
    const tocSection = document.getElementById('av-toc-section');
    if (tocSection && tocOpen) tocSection.style.height = spec(currentTocHeight);
  }
  if (finalSettings.sidebarWidth) {
    currentSidebarWidth = finalSettings.sidebarWidth;
    applyShellGeometry();
  }
}

// ── ToC & Sidebar Resizers ───────────────────────────────────────────────────
function initTocResizer(resizer, tocSection) {
  let isDragging = false;
  let startY = 0;
  let startH = 0;

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    isDragging = true;
    startY = e.clientY;
    startH = tocSection.getBoundingClientRect().height;
    resizer.classList.add('av-active');
    document.body.classList.add('av-resizing');

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    e.preventDefault();
  };

  const onMouseMove = (e) => {
    if (!isDragging) return;
    const delta = e.clientY - startY;
    let newH = Math.round(startH + delta);
    const minH = 60;
    // getBoundingClientRect is visual px, so newH is visual — clamp against the
    // visual sidebar height and store visual px (applied via spec()).
    const sidebarEl = document.getElementById('av-sidebar');
    const sidebarH = sidebarEl ? sidebarEl.getBoundingClientRect().height : window.innerHeight;
    const maxH = Math.max(minH, sidebarH - 240);

    newH = Math.max(minH, Math.min(newH, maxH));
    currentTocHeight = newH;
    tocSection.style.height = spec(newH);
  };

  const onMouseUp = async () => {
    if (!isDragging) return;
    isDragging = false;
    resizer.classList.remove('av-active');
    document.body.classList.remove('av-resizing');
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);

    const { settings = {} } = await chrome.storage.local.get('settings');
    settings.tocHeight = currentTocHeight;
    await chrome.storage.local.set({ settings });
  };

  const onDoubleClick = async () => {
    currentTocHeight = 220;
    tocSection.style.height = spec(220);
    const { settings = {} } = await chrome.storage.local.get('settings');
    settings.tocHeight = 220;
    await chrome.storage.local.set({ settings });
    showToast('Reset ToC Size', 'Table of Contents height reset to 220px.');
  };

  resizer.addEventListener('mousedown', onMouseDown);
  resizer.addEventListener('dblclick', onDoubleClick);
}

function initSidebarWidthResizer(sidebarEl) {
  const edgeResizer = document.createElement('div');
  edgeResizer.id = 'av-sidebar-edge-resizer';
  edgeResizer.title = 'Drag left/right to resize sidebar width (Double-click to reset)';
  sidebarEl.appendChild(edgeResizer);

  let isDragging = false;
  let startX = 0;
  let startW = 0;

  edgeResizer.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (sidebarEl.classList.contains('av-collapsed')) return;
    isDragging = true;
    startX = e.clientX;
    // getBoundingClientRect returns the zoomed (visual) width — keep everything in visual px
    startW = sidebarEl.getBoundingClientRect().width;
    edgeResizer.classList.add('av-active');
    document.body.classList.add('av-col-resizing');

    const onMouseMove = (ev) => {
      if (!isDragging) return;
      const deltaX = ev.clientX - startX;
      let newW = Math.round(startW - deltaX);
      newW = Math.max(200, Math.min(newW, Math.min(650, window.innerWidth - 100)));
      currentSidebarWidth = newW; // visual width stays zoom-independent
      sidebarEl.style.width = spec(newW);
    };

    const onMouseUp = async () => {
      if (!isDragging) return;
      isDragging = false;
      edgeResizer.classList.remove('av-active');
      document.body.classList.remove('av-col-resizing');
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      const { settings = {} } = await chrome.storage.local.get('settings');
      settings.sidebarWidth = currentSidebarWidth;
      await chrome.storage.local.set({ settings });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    e.preventDefault();
  });

  edgeResizer.addEventListener('dblclick', async () => {
    currentSidebarWidth = 272;
    sidebarEl.style.width = spec(272);
    const { settings = {} } = await chrome.storage.local.get('settings');
    settings.sidebarWidth = 272;
    await chrome.storage.local.set({ settings });
    showToast('Reset Sidebar Width', 'Sidebar width reset to 272px.');
  });
}

// ── Variants resizer (drag up/down, double-click resets) ──────────────────────
function initVariantsResizer(resizer, listEl) {
  let isDragging = false;
  let startY = 0;
  let startH = 0;

  resizer.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    isDragging = true;
    startY = e.clientY;
    // Visual px (rect is post-zoom); delta is converted back to specified units below.
    startH = listEl.getBoundingClientRect().height;
    resizer.classList.add('av-active');
    document.body.classList.add('av-resizing');

    const onMouseMove = (ev) => {
      if (!isDragging) return;
      const delta = ev.clientY - startY;
      const newH = Math.max(60, Math.min(Math.round(startH + delta), 400));
      currentVariantsHeight = newH;
      listEl.style.maxHeight = spec(newH);
    };

    const onMouseUp = async () => {
      if (!isDragging) return;
      isDragging = false;
      resizer.classList.remove('av-active');
      document.body.classList.remove('av-resizing');
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      await persistSettings({ variantsHeight: currentVariantsHeight });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    e.preventDefault();
  });

  resizer.addEventListener('dblclick', async () => {
    currentVariantsHeight = 120;
    listEl.style.maxHeight = spec(120);
    await persistSettings({ variantsHeight: 120 });
    showToast('Reset Variants Size', 'Build Variants height reset.');
  });
}

// ── Sidebar build ─────────────────────────────────────────────────────────────
let sidebar = null;
let tocOpen = true;
let searchQuery = '';
let folderStates = {}; // { [folderId]: bool expanded }

function createSidebar() {
  if (document.getElementById('av-sidebar')) return;

  sidebar = document.createElement('div');
  sidebar.id = 'av-sidebar';
  if (sidebarCollapsed) sidebar.classList.add('av-collapsed');
  if (sidebarMinimized) sidebar.classList.add('av-minimized');
  applyShellGeometry();

  // ── Floating restore pill (visible only when fully minimized) ──
  let restoreFloat = document.getElementById('av-restore-float');
  if (!restoreFloat) {
    restoreFloat = document.createElement('button');
    restoreFloat.id = 'av-restore-float';
    restoreFloat.title = 'Restore Atlas Vault sidebar';
    restoreFloat.setAttribute('aria-label', 'Restore Atlas Vault sidebar');
    restoreFloat.innerHTML = `<span>⚗️</span><span>Atlas Vault</span>`;
    restoreFloat.style.display = sidebarMinimized ? 'flex' : 'none';
    restoreFloat.addEventListener('click', restoreSidebar);
    document.body.appendChild(restoreFloat);
  }

  // ── Toggle tab (sticks out to the left) ──
  const toggleTab = document.createElement('div');
  toggleTab.id = 'av-toggle-tab';
  toggleTab.textContent = '⚗';
  toggleTab.title = 'Toggle Atlas Vault (collapse / restore)';
  toggleTab.setAttribute('role', 'button');
  toggleTab.setAttribute('tabindex', '0');
  toggleTab.addEventListener('click', toggleSidebar);
  toggleTab.addEventListener('keydown', e => { if (e.key === 'Enter') toggleSidebar(); });
  sidebar.appendChild(toggleTab);

  // ── Collapsed strip (minimized state with explicit restore) ──
  const collapsedStrip = document.createElement('div');
  collapsedStrip.className = 'av-collapsed-only';
  collapsedStrip.title = 'Click to restore Atlas Vault sidebar';
  collapsedStrip.setAttribute('role', 'button');
  collapsedStrip.setAttribute('tabindex', '0');
  collapsedStrip.innerHTML = `<span style="font-size:18px;color:#c8a96e">⚗️</span>
    <button id="av-restore-btn" title="Restore sidebar">🗖</button>
    <span class="av-collapsed-hint">Restore</span>`;
  collapsedStrip.addEventListener('click', e => {
    if (e.target.closest('#av-restore-btn') || !sidebar.classList.contains('av-collapsed')) { restoreSidebar(); return; }
    restoreSidebar();
  });
  collapsedStrip.addEventListener('keydown', e => { if (e.key === 'Enter') restoreSidebar(); });
  sidebar.appendChild(collapsedStrip);

  // ── Main expanded content ──
  const expandedWrap = document.createElement('div');
  expandedWrap.className = 'av-expanded-only';
  expandedWrap.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';

  // Header with Import/Export + Minimize
  const header = document.createElement('div');
  header.id = 'av-sidebar-header';
  header.innerHTML = `
    <div class="av-header-left">
      <div id="av-sidebar-logo">⚗️ Atlas Vault</div>
      <div id="av-sidebar-sub">PoE2 Build Manager</div>
    </div>
    <div class="av-header-actions">
      <button id="av-min-btn" class="av-hdr-btn" title="Minimize sidebar">➖</button>
      <button id="av-sb-export-btn" class="av-hdr-btn" title="Export all builds, folders & settings">📤</button>
      <button id="av-sb-import-btn" class="av-hdr-btn" title="Import builds, folders & settings">📥</button>
    </div>
  `;
  expandedWrap.appendChild(header);

  // Save bar
  const saveBar = document.createElement('div');
  saveBar.id = 'av-sb-save-bar';
  saveBar.innerHTML = `
    <button id="av-sb-save-btn" title="Save the currently open Mobalytics build">💾 Save Build</button>
    <select id="av-sb-folder-sel"></select>
  `;
  expandedWrap.appendChild(saveBar);

  // Search
  const searchRow = document.createElement('div');
  searchRow.id = 'av-sb-search';
  searchRow.innerHTML = `<input type="search" placeholder="🔍 Search builds…" aria-label="Search builds" />`;
  expandedWrap.appendChild(searchRow);

  // Sort + Zoom toolbar (resize UI elements & font)
  const toolbar = document.createElement('div');
  toolbar.id = 'av-sb-toolbar';
  toolbar.innerHTML = `
    <select id="av-sb-sort" title="Sort builds">
      <option value="manual">⇅ Manual</option>
      <option value="newest">🕘 Newest</option>
      <option value="oldest">🕰️ Oldest</option>
      <option value="az">🔤 A–Z</option>
      <option value="za">🔤 Z–A</option>
    </select>
    <div id="av-zoom-controls" title="Zoom in / out resizes UI elements and font">
      <button id="av-zoom-out" title="Zoom out (smaller)">A−</button>
      <span id="av-zoom-label" title="Double-click to reset to 100%">100%</span>
      <button id="av-zoom-in" title="Zoom in (larger)">A＋</button>
    </div>
  `;
  expandedWrap.appendChild(toolbar);

  // New folder
  const newFolder = document.createElement('div');
  newFolder.id = 'av-sb-new-folder';
  newFolder.innerHTML = `
    <input type="text" placeholder="New folder…" maxlength="40" aria-label="New folder name" />
    <button title="Create folder">＋</button>
  `;
  expandedWrap.appendChild(newFolder);

  // Build Variants section (mirrors Mobalytics variant tabs, e.g. lvl 1-14 … Endgame)
  const variantsSection = document.createElement('div');
  variantsSection.id = 'av-variants-section';
  variantsSection.style.display = 'none';
  variantsSection.innerHTML = `
    <div id="av-variants-header">
      <span id="av-variants-arrow" class="av-open">▶</span>
      <span id="av-variants-title">🔀 Build Variants</span>
      <span id="av-variants-count"></span>
    </div>
    <div id="av-variants-list" class="av-open" style="max-height:${spec(currentVariantsHeight)}"></div>
  `;
  expandedWrap.appendChild(variantsSection);

  // Variants resizer splitter (drag up/down, double-click resets)
  const variantsResizer = document.createElement('div');
  variantsResizer.id = 'av-variants-resizer';
  variantsResizer.title = 'Drag up/down to resize Build Variants (Double-click to reset)';
  variantsResizer.style.display = 'none';
  variantsResizer.innerHTML = `<div class="av-resizer-grip"></div>`;
  expandedWrap.appendChild(variantsResizer);
  initVariantsResizer(variantsResizer, variantsSection.querySelector('#av-variants-list'));

  // ToC section (build pages only)
  const tocSection = document.createElement('div');
  tocSection.id = 'av-toc-section';
  tocSection.style.display = 'none';
  tocSection.innerHTML = `
    <div id="av-toc-section-header">
      <span id="av-toc-section-arrow" class="av-open">▶</span>
      <span id="av-toc-section-title">📋 Table of Contents</span>
    </div>
    <div id="av-toc-links-sb" class="av-open"></div>
  `;
  expandedWrap.appendChild(tocSection);

  // ToC resizer splitter
  const tocResizer = document.createElement('div');
  tocResizer.id = 'av-toc-resizer';
  tocResizer.title = 'Drag up/down to resize Table of Contents & Builds (Double-click to reset)';
  tocResizer.style.display = 'none';
  tocResizer.innerHTML = `<div class="av-resizer-grip"></div>`;
  expandedWrap.appendChild(tocResizer);
  initTocResizer(tocResizer, tocSection);

  // Tree view
  const tree = document.createElement('div');
  tree.id = 'av-sb-tree';
  expandedWrap.appendChild(tree);

  sidebar.appendChild(expandedWrap);

  // Sidebar horizontal edge resizer
  initSidebarWidthResizer(sidebar);

  document.body.appendChild(sidebar);

  // ── Wire up events ──

  // Export / Import
  header.querySelector('#av-sb-export-btn').addEventListener('click', exportData);
  header.querySelector('#av-sb-import-btn').addEventListener('click', triggerImport);
  header.querySelector('#av-min-btn').addEventListener('click', minimizeSidebar);

  // Save button
  saveBar.querySelector('#av-sb-save-btn').addEventListener('click', handleSave);

  // Search
  searchRow.querySelector('input').addEventListener('input', e => {
    searchQuery = e.target.value.toLowerCase();
    renderTree();
  });

  // New folder
  const folderInput = newFolder.querySelector('input');
  const folderBtn   = newFolder.querySelector('button');
  folderBtn.addEventListener('click', () => handleCreateFolder(folderInput));
  folderInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleCreateFolder(folderInput); });

  // Sort + Zoom wiring
  const sortSel = toolbar.querySelector('#av-sb-sort');
  sortSel.value = SORT_MODES.includes(currentSort) ? currentSort : 'newest';
  sortSel.addEventListener('change', async e => {
    if (!SORT_MODES.includes(e.target.value)) return;
    currentSort = e.target.value;
    await persistSettings({ buildSort: currentSort });
    renderTree();
  });
  toolbar.querySelector('#av-zoom-in').addEventListener('click', async () => {
    currentZoom = Math.min(ZOOM_MAX, Math.round((currentZoom + ZOOM_STEP) * 100) / 100);
    applyZoom();
    await persistSettings({ uiZoom: currentZoom });
  });
  toolbar.querySelector('#av-zoom-out').addEventListener('click', async () => {
    currentZoom = Math.max(ZOOM_MIN, Math.round((currentZoom - ZOOM_STEP) * 100) / 100);
    applyZoom();
    await persistSettings({ uiZoom: currentZoom });
  });
  toolbar.querySelector('#av-zoom-label').addEventListener('dblclick', async () => {
    currentZoom = 1;
    applyZoom();
    await persistSettings({ uiZoom: 1 });
    showToast('Reset Zoom', 'UI size reset to 100%.');
  });
  applyZoom();

  // Variants toggle
  let variantsOpen = true;
  variantsSection.querySelector('#av-variants-header').addEventListener('click', () => {
    variantsOpen = !variantsOpen;
    variantsSection.querySelector('#av-variants-arrow').classList.toggle('av-open', variantsOpen);
    variantsSection.querySelector('#av-variants-list').classList.toggle('av-open', variantsOpen);
    const vResizer = document.getElementById('av-variants-resizer');
    if (vResizer && variantsSection.style.display !== 'none') {
      vResizer.style.display = variantsOpen ? 'flex' : 'none';
    }
  });

  // ToC toggle
  tocSection.querySelector('#av-toc-section-header').addEventListener('click', () => {
    tocOpen = !tocOpen;
    tocSection.querySelector('#av-toc-section-arrow').classList.toggle('av-open', tocOpen);
    tocSection.querySelector('#av-toc-links-sb').classList.toggle('av-open', tocOpen);
    const resizer = document.getElementById('av-toc-resizer');
    if (resizer) resizer.style.display = tocOpen ? 'flex' : 'none';
    if (tocOpen) {
      tocSection.style.height = spec(currentTocHeight);
    } else {
      tocSection.style.height = 'auto';
    }
  });

  loadAndRender();
}

function toggleSidebar() {
  if (!sidebar || sidebarMinimized) { restoreSidebar(); return; }
  const collapsed = !sidebar.classList.contains('av-collapsed');
  sidebar.classList.toggle('av-collapsed', collapsed);
  sidebarCollapsed = collapsed;
  applyShellGeometry();
  persistSettings({ sidebarCollapsed: collapsed });
}

function minimizeSidebar() {
  // Fully hide the sidebar; only the floating restore pill remains visible.
  if (!sidebar || sidebarMinimized) return;
  sidebarMinimized = true;
  sidebar.classList.add('av-minimized');
  applyShellGeometry();
  const float = document.getElementById('av-restore-float');
  if (float) float.style.display = 'flex';
  persistSettings({ sidebarMinimized: true });
}

function restoreSidebar() {
  const float = document.getElementById('av-restore-float');
  if (float) float.style.display = 'none';
  let changed = false;
  if (sidebarMinimized) { sidebarMinimized = false; changed = true; }
  if (sidebar) {
    sidebar.classList.remove('av-minimized');
    if (sidebar.classList.contains('av-collapsed')) {
      sidebar.classList.remove('av-collapsed');
      sidebarCollapsed = false;
      changed = true;
    }
    // Re-apply zoom-compensated geometry in case settings changed while hidden
    applyShellGeometry();
  }
  if (changed || sidebarMinimized) persistSettings({ sidebarMinimized: false, sidebarCollapsed: false });
  else persistSettings({ sidebarMinimized: false });
}

// ── Save handler ──────────────────────────────────────────────────────────────
async function handleSave() {
  if (!IS_BUILD_PAGE()) {
    showToast('ℹ️ Not a build page', 'Navigate to a build to save it.');
    return;
  }
  const meta = extractBuildMeta();
  const folderId = document.getElementById('av-sb-folder-sel')?.value || null;
  if (folderId) meta.folderId = folderId;
  await saveBuild(meta);
  showToast('✅ Saved!', meta.title);
  await loadAndRender();
}

async function handleCreateFolder(input) {
  const name = input.value.trim();
  if (!name) return;
  await createFolder(name);
  input.value = '';
  await loadAndRender();
}

// ── Folder select populate ────────────────────────────────────────────────────
async function populateFolderSelect(folders) {
  const sel = document.getElementById('av-sb-folder-sel');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">No folder</option>';
  folders.forEach(f => {
    const o = document.createElement('option');
    o.value = f.id; o.textContent = f.name;
    sel.appendChild(o);
  });
  if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
}

// ── Load + render ─────────────────────────────────────────────────────────────
async function loadAndRender() {
  const { folders, builds } = await loadData();
  await populateFolderSelect(folders);
  renderTree(folders, builds);
  // Also update ToC + Variants if on a build page
  if (IS_BUILD_PAGE()) {
    tryInjectToC();
    tryInjectVariants();
  } else {
    resetVariants();
  }
}

// ── Tree rendering ────────────────────────────────────────────────────────────
function renderTree(folders, builds) {
  const tree = document.getElementById('av-sb-tree');
  if (!tree) return;

  // If no args, load async
  if (!folders) { loadAndRender(); return; }

  tree.innerHTML = '';

  // Filter builds by search
  const filtered = builds.filter(b => {
    if (!searchQuery) return true;
    return (b.title || '').toLowerCase().includes(searchQuery) ||
           (b.author || '').toLowerCase().includes(searchQuery);
  });

  const assignedIds = new Set();

  // ── Folders ──
  folders.forEach(folder => {
    const folderBuilds = filtered.filter(b => b.folderId === folder.id);
    folderBuilds.forEach(b => assignedIds.add(b.id));

    const node = document.createElement('div');
    node.className = 'av-folder-node';
    node.dataset.folderId = folder.id;

    const isOpen = folderStates[folder.id] !== false; // default open

    // Folder header
    const fHeader = document.createElement('div');
    fHeader.className = 'av-folder-header';
    fHeader.innerHTML = `
      <span class="av-folder-arrow ${isOpen ? 'av-open' : ''}">▶</span>
      <span class="av-folder-icon-em">📁</span>
      <span class="av-folder-label" title="${escHtml(folder.name)}">${escHtml(folder.name)}</span>
      <span class="av-folder-count">${folderBuilds.length}</span>
      <button class="av-folder-rename-btn" title="Rename" data-id="${folder.id}">✏️</button>
      <button class="av-folder-del-btn" title="Delete folder" data-id="${folder.id}">🗑️</button>
    `;

    // Children
    const children = document.createElement('div');
    children.className = `av-folder-children ${isOpen ? 'av-open' : ''}`;
    children.dataset.folderId = folder.id;

    if (folderBuilds.length === 0) {
      children.innerHTML = `<div class="av-drop-empty" style="padding:4px 8px 4px 24px;font-size:10.5px;color:#353555;">Empty folder — drop builds here</div>`;
      enableDropZone(children, folder.id);
    } else {
      sortBuilds(folderBuilds).forEach(build => {
        children.appendChild(createBuildItem(build, folders));
      });
      enableDropZone(children, folder.id);
    }

    // Toggle expand/collapse
    const arrowEl = fHeader.querySelector('.av-folder-arrow');
    fHeader.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      folderStates[folder.id] = !children.classList.contains('av-open');
      children.classList.toggle('av-open');
      arrowEl.classList.toggle('av-open');
    });

    // Rename
    fHeader.querySelector('.av-folder-rename-btn').addEventListener('click', e => {
      e.stopPropagation();
      startInlineRename(folder, fHeader);
    });

    // Delete folder
    fHeader.querySelector('.av-folder-del-btn').addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm(`Delete folder "${folder.name}"?\nBuilds inside will become uncategorized.`)) return;
      await deleteFolder(folder.id);
      await loadAndRender();
    });

    // Drop onto the header itself moves the build into this folder (appends)
    enableDropZone(fHeader, folder.id);

    node.appendChild(fHeader);
    node.appendChild(children);
    tree.appendChild(node);
  });

  // ── Uncategorized ──
  const uncat = filtered.filter(b => !assignedIds.has(b.id));

  if (uncat.length > 0 || filtered.length === 0) {
    if (folders.length > 0 || uncat.length > 0) {
      const label = document.createElement('div');
      label.className = 'av-uncategorized-label';
      label.textContent = `📂 Uncategorized (${uncat.length})`;
      tree.appendChild(label);
    }
    if (uncat.length === 0 && filtered.length === 0 && !searchQuery) {
      const empty = document.createElement('div');
      empty.className = 'av-tree-empty';
      empty.innerHTML = 'No builds saved yet.<br/>Open a Mobalytics build and click <b>Save Build</b>.';
      tree.appendChild(empty);
    } else {
      const uncatWrap = document.createElement('div');
      uncatWrap.id = 'av-uncat-wrap';
      uncatWrap.dataset.folderId = '';
      sortBuilds(uncat).forEach(build => {
        uncatWrap.appendChild(createBuildItem(build, folders));
      });
      tree.appendChild(uncatWrap);
      enableDropZone(uncatWrap, null);
    }
  }

  if (searchQuery && filtered.length === 0) {
    const noResult = document.createElement('div');
    noResult.className = 'av-tree-empty';
    noResult.textContent = 'No builds match your search.';
    tree.appendChild(noResult);
  }
}

// ── Build item (rename + sort + move + delete + drag & drop) ───────────────────
function createBuildItem(build, folders) {
  const item = document.createElement('div');
  item.className = 'av-build-item';
  item.title = build.title;
  item.dataset.buildId = build.id;
  // Drag & drop (disabled while searching to avoid corrupting order from a filtered view)
  item.draggable = !searchQuery;
  if (searchQuery) item.title = `${build.title} (reorder unavailable while searching)`;

  // Drag grip
  const grip = document.createElement('span');
  grip.className = 'av-drag-grip';
  grip.title = searchQuery ? 'Clear search to drag & reorder' : 'Drag to reorder / move across folders';
  grip.textContent = '⠿';
  grip.setAttribute('aria-hidden', 'true');

  // Thumbnail
  const thumb = document.createElement('div');
  thumb.className = 'av-build-thumb-sm';
  if (build.thumbnail) {
    thumb.innerHTML = `<img src="${escHtml(build.thumbnail)}" alt="" loading="lazy" />`;
  } else {
    thumb.textContent = '⚗️';
  }

  // Info
  const info = document.createElement('div');
  info.className = 'av-build-item-info';
  const metaParts = [build.buildClass, build.author].filter(Boolean);
  info.innerHTML = `
    <div class="av-build-item-title">${escHtml(build.title)}</div>
    ${metaParts.length ? `<div class="av-build-item-meta">${metaParts.map(escHtml).join(' · ')}</div>` : ''}
  `;

  // Actions
  const actions = document.createElement('div');
  actions.className = 'av-build-item-actions';

  const upBtn = document.createElement('button');
  upBtn.title = 'Move up (switches to Manual sort)';
  upBtn.textContent = '⬆️';
  upBtn.addEventListener('click', async e => {
    e.stopPropagation();
    await moveBuildOrder(build.id, -1);
    await loadAndRender();
  });

  const downBtn = document.createElement('button');
  downBtn.title = 'Move down (switches to Manual sort)';
  downBtn.textContent = '⬇️';
  downBtn.addEventListener('click', async e => {
    e.stopPropagation();
    await moveBuildOrder(build.id, 1);
    await loadAndRender();
  });

  const renameBtn = document.createElement('button');
  renameBtn.title = 'Rename build';
  renameBtn.textContent = '✏️';
  renameBtn.addEventListener('click', e => {
    e.stopPropagation();
    startBuildRename(build, item, info);
  });

  const moveBtn = document.createElement('button');
  moveBtn.title = 'Move to folder';
  moveBtn.textContent = '📁';
  moveBtn.addEventListener('click', e => {
    e.stopPropagation();
    openMoveModal(build.id, build.folderId, folders);
  });

  // Delete button
  const delBtn = document.createElement('button');
  delBtn.className = 'av-build-del-btn';
  delBtn.title = 'Delete build';
  delBtn.textContent = '🗑️';
  delBtn.addEventListener('click', async e => {
    e.stopPropagation();
    if (!confirm(`Delete "${build.title}"?`)) return;
    await deleteBuild(build.id);
    await loadAndRender();
  });

  actions.append(upBtn, downBtn, renameBtn, moveBtn, delBtn);

  item.appendChild(grip);
  item.appendChild(thumb);
  item.appendChild(info);
  item.appendChild(actions);

  // ── Drag & drop wiring ──
  item.addEventListener('dragstart', e => {
    if (item.querySelector('.av-build-rename-input')) { e.preventDefault(); return; }
    e.dataTransfer.setData('text/plain', build.id);
    e.dataTransfer.effectAllowed = 'move';
    item.classList.add('av-dragging');
    setTimeout(() => document.body.classList.add('av-dnd-active'), 0);
  });
  item.addEventListener('dragend', () => {
    item.classList.remove('av-dragging');
    document.body.classList.remove('av-dnd-active');
    document.querySelectorAll('.av-drop-target,.av-drop-before,.av-drop-after').forEach(el => {
      el.classList.remove('av-drop-target', 'av-drop-before', 'av-drop-after');
    });
  });
  // Dropping ONTO a card inserts before/after it (top/bottom half decides)
  item.addEventListener('dragover', e => {
    if (!e.dataTransfer || searchQuery) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = item.getBoundingClientRect();
    const after = (e.clientY - rect.top) > rect.height / 2;
    item.classList.toggle('av-drop-before', !after);
    item.classList.toggle('av-drop-after', after);
  });
  item.addEventListener('dragleave', () => {
    item.classList.remove('av-drop-before', 'av-drop-after');
  });
  item.addEventListener('drop', async e => {
    e.preventDefault();
    e.stopPropagation();
    const sourceId = e.dataTransfer.getData('text/plain');
    const rect = item.getBoundingClientRect();
    const after = (e.clientY - rect.top) > rect.height / 2;
    item.classList.remove('av-drop-before', 'av-drop-after');
    if (!sourceId || sourceId === build.id) return;
    const zone = item.closest('[data-folder-id]');
    const targetFolderId = zone && zone.dataset.folderId ? zone.dataset.folderId : null;
    await handleBuildDrop(sourceId, targetFolderId, build.id, after);
  });

  // ── Whole item click → open build in new tab ──
  item.addEventListener('click', e => {
    if (e.target.closest('.av-build-item-actions')) return;
    if (e.target.closest('.av-build-rename-input')) return;
    window.open(build.url, '_blank', 'noopener');
  });

  return item;
}

// ── Drag & drop: zones (folder children / uncategorized) ──────────────────────
function enableDropZone(zoneEl, folderId) {
  zoneEl.addEventListener('dragover', e => {
    if (searchQuery) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    zoneEl.classList.add('av-drop-target');
  });
  zoneEl.addEventListener('dragleave', e => {
    if (e.target === zoneEl) zoneEl.classList.remove('av-drop-target');
  });
  zoneEl.addEventListener('drop', async e => {
    // Card-level drops stop propagation; only handle drops on empty zone space here.
    if (e.target.closest('.av-build-item')) return;
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain');
    zoneEl.classList.remove('av-drop-target');
    if (!sourceId) return;
    await handleBuildDrop(sourceId, folderId || null, null, true);
  });
}

// Persist a drag & drop move: cross-folder relocation + manual ordering in one write.
async function handleBuildDrop(sourceId, targetFolderId, beforeBuildId, insertAfter) {
  const { builds = [] } = await chrome.storage.local.get('builds');
  const source = builds.find(b => b.id === sourceId);
  if (!source) return;
  const targetFid = targetFolderId || null;

  // Work from the current display order so the drop lands where the user saw it.
  const groupAll = builds.filter(b => (b.folderId || null) === targetFid && b.id !== sourceId);
  const sortedGroup = sortBuilds(groupAll);

  // Seed integer orders within the target group so fractional inserts are stable.
  sortedGroup.forEach((b, i) => {
    const t = builds.find(x => x.id === b.id);
    if (t && typeof t.order !== 'number') t.order = i;
  });
  const ordered = [...sortedGroup].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  let newOrder;
  if (!beforeBuildId) {
    // Dropped on empty zone space → append to end (or start if group empty)
    newOrder = ordered.length ? (ordered[ordered.length - 1].order ?? ordered.length - 1) + 1 : 0;
  } else {
    const idx = ordered.findIndex(b => b.id === beforeBuildId);
    if (idx < 0) {
      newOrder = ordered.length ? (ordered[ordered.length - 1].order ?? 0) + 1 : 0;
    } else if (!insertAfter) {
      if (idx === 0) newOrder = (ordered[0].order ?? 1) - 1;
      else newOrder = ((ordered[idx - 1].order ?? 0) + (ordered[idx].order ?? 0)) / 2;
    } else {
      if (idx === ordered.length - 1) newOrder = (ordered[idx].order ?? 0) + 1;
      else newOrder = ((ordered[idx].order ?? 0) + (ordered[idx + 1].order ?? 0)) / 2;
    }
  }

  source.folderId = targetFid;
  source.order = newOrder;

  // Renormalize the target group to clean integers (avoids float drift).
  const finalGroup = builds
    .filter(b => (b.folderId || null) === targetFid)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  finalGroup.forEach((b, i) => { b.order = i; });

  await chrome.storage.local.set({ builds });
  if (currentSort !== 'manual') {
    currentSort = 'manual';
    await persistSettings({ buildSort: 'manual' });
  }
  await loadAndRender();
}

// ── Inline build rename ───────────────────────────────────────────────────────
function startBuildRename(build, item, info) {
  if (item.querySelector('.av-build-rename-input')) return;
  const titleEl = info.querySelector('.av-build-item-title');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'av-build-rename-input';
  input.value = build.title || '';
  input.maxLength = 120;
  if (titleEl) titleEl.replaceWith(input);
  else info.prepend(input);
  input.focus();
  input.select();

  let done = false;
  const commit = async (save) => {
    if (done) return;
    done = true;
    const name = input.value.trim();
    if (save && name && name !== build.title) await renameBuild(build.id, name);
    await loadAndRender();
  };
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') commit(true);
    if (e.key === 'Escape') commit(false);
  });
  input.addEventListener('blur', () => commit(true));
  input.addEventListener('click', e => e.stopPropagation());
}

// ── Move-to-folder modal (sidebar) ────────────────────────────────────────────
function openMoveModal(buildId, currentFolderId, folders) {
  let modal = document.getElementById('av-move-modal');
  if (modal) modal.remove();
  modal = document.createElement('div');
  modal.id = 'av-move-modal';
  modal.className = 'av-modal-backdrop';
  modal.innerHTML = `
    <div class="av-modal-card" style="width:260px">
      <div class="av-modal-header">
        <span class="av-modal-title">📁 Move Build</span>
        <button class="av-modal-close" title="Close">✕</button>
      </div>
      <select id="av-move-sel" style="width:100%;padding:7px 8px;background:#0d0d1e;border:1px solid #2a2a52;border-radius:6px;color:#c0c0e0;font-size:12px;margin-bottom:14px;">
        <option value="">— No folder —</option>
        ${(folders || []).map(f => `<option value="${escHtml(f.id)}" ${f.id === currentFolderId ? 'selected' : ''}>${escHtml(f.name)}</option>`).join('')}
      </select>
      <div class="av-modal-actions">
        <button id="av-move-cancel" class="av-btn-secondary">Cancel</button>
        <button id="av-move-confirm" class="av-btn-primary">Move</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const close = () => modal.remove();
  modal.querySelector('.av-modal-close').addEventListener('click', close);
  modal.querySelector('#av-move-cancel').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  modal.querySelector('#av-move-confirm').addEventListener('click', async () => {
    const folderId = modal.querySelector('#av-move-sel').value || null;
    close();
    await moveBuildToFolder(buildId, folderId);
    await loadAndRender();
  });
}

// ── Inline folder rename ──────────────────────────────────────────────────────
function startInlineRename(folder, fHeader) {
  const labelEl = fHeader.querySelector('.av-folder-label');
  const renameBtn = fHeader.querySelector('.av-folder-rename-btn');
  const input = document.createElement('input');
  input.className = 'av-folder-rename-input';
  input.value = folder.name;
  input.maxLength = 40;
  labelEl.replaceWith(input);
  renameBtn.textContent = '✅';
  input.focus();
  input.select();

  const commit = async () => {
    const name = input.value.trim();
    if (name && name !== folder.name) await renameFolder(folder.id, name);
    await loadAndRender();
  };

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') loadAndRender();
  });
  renameBtn.addEventListener('click', commit, { once: true });
}

// ── Table of Contents injection ───────────────────────────────────────────────
let tocInjected = false;
let scrollSpyObserver = null;

function findToCSection() {
  const anchor = document.getElementById('ngfdocumentcmwidgettableofcontentv1');
  if (anchor) return anchor.closest('section');
  const headers = document.querySelectorAll('h2');
  for (const h of headers) {
    if (h.textContent.trim().toLowerCase().includes('table of contents')) return h.closest('section');
  }
  return null;
}

function tryInjectToC() {
  if (!IS_BUILD_PAGE()) return;
  const tocEl = document.getElementById('av-toc-section');
  if (!tocEl) return;

  const section = findToCSection();
  if (!section) return;

  const links = Array.from(section.querySelectorAll('a[href*="#"]'));
  if (!links.length) return;

  const linksContainer = document.getElementById('av-toc-links-sb');
  if (!linksContainer) return;

  // Don't re-inject if links already populated
  if (linksContainer.children.length === links.length) return;

  linksContainer.innerHTML = '';
  links.forEach(orig => {
    const a = document.createElement('a');
    a.setAttribute('data-google-interstitial', 'false');
    const isSub = orig.classList.contains('xayvskk') || orig.querySelector('span.x1lliihq') !== null;
    if (isSub) a.classList.add('av-toc-sub');
    const textSpan = orig.querySelector('span:last-child');
    a.textContent = textSpan ? textSpan.textContent.trim() : orig.textContent.trim();
    const hash = orig.getAttribute('href')?.split('#')[1];
    a.href = hash ? `#${hash}` : '#';

    a.addEventListener('click', e => {
      e.preventDefault();
      if (hash) {
        const target = document.getElementById(hash);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    linksContainer.appendChild(a);
  });

  tocEl.style.display = 'flex';
  const resizer = document.getElementById('av-toc-resizer');
  if (tocOpen) {
    tocEl.style.height = spec(currentTocHeight);
    if (resizer) resizer.style.display = 'flex';
  } else {
    tocEl.style.height = 'auto';
    if (resizer) resizer.style.display = 'none';
  }
  tocInjected = true;
  setupScrollSpy(links, linksContainer);
}

function setupScrollSpy(originalLinks, container) {
  if (scrollSpyObserver) scrollSpyObserver.disconnect();
  const ids = originalLinks.map(a => a.getAttribute('href')?.split('#')[1]).filter(Boolean);
  scrollSpyObserver = new IntersectionObserver(entries => {
    requestAnimationFrame(() => {
      const visible = entries.filter(e => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (!visible.length) return;
      const activeId = visible[0].target.id;
      container.querySelectorAll('a').forEach(a => {
        const h = a.getAttribute('href')?.split('#')[1];
        a.classList.toggle('av-toc-active', h === activeId);
      });
    });
  }, { rootMargin: '-15% 0px -65% 0px', threshold: 0 });

  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) scrollSpyObserver.observe(el);
  });
}

// ── Build Variants injection ────────────────────────────────────────────────────
// Mirrors Mobalytics variant tabs (role="tab", e.g. "lvl 1-14" … "Endgame", "Mageblood")
// into the sidebar so users can switch variants without scrolling to the page tabs.
function isVisibleTab(el) {
  if (!el || !el.isConnected) return false;
  if (el.closest('[aria-hidden="true"]')) return false;
  const r = el.getBoundingClientRect();
  if (!r || (r.width === 0 && r.height === 0)) return false;
  return true;
}

function findVariantTabs() {
  // Primary: ARIA tabs like the snippet in the feature request
  let tabs = Array.from(document.querySelectorAll('[role="tablist"] [role="tab"]'));
  // Fallback: any pressable tab with a data-key (Mobalytics React Aria markup)
  if (tabs.length < 2) {
    tabs = Array.from(document.querySelectorAll('[data-react-aria-pressable][data-key]'));
  }
  const seen = new Set();
  const unique = [];
  for (const t of tabs) {
    const label = (t.textContent || '').trim();
    if (!label || label.length > 40) continue;
    // Exclude unrelated site navigation tablists (games bar etc.)
    if (t.closest('nav')) continue;
    // Mobalytics renders the same tablist multiple times (responsive/hidden mirrors).
    // Keep one entry per data-key so variants are not replicated 4x.
    const key = t.getAttribute('data-key') || `label:${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(t);
  }
  // Prefer the visible copy; fall back to all unique tabs if none report visible yet.
  const visible = unique.filter(isVisibleTab);
  return visible.length >= 2 ? visible : unique;
}

function variantLabel(tab) {
  const span = tab.querySelector('span:last-child');
  const label = span ? span.textContent.trim() : tab.textContent.trim();
  return label.replace(/\s+/g, ' ').slice(0, 40);
}

function tryInjectVariants() {
  if (!IS_BUILD_PAGE()) { resetVariants(); return false; }
  const section = document.getElementById('av-variants-section');
  const list = document.getElementById('av-variants-list');
  const count = document.getElementById('av-variants-count');
  if (!section || !list) return false;

  const tabs = findVariantTabs();
  if (tabs.length < 2) { resetVariants(); return false; }

  // Signature to avoid redundant re-renders (deduped by data-key upstream)
  const sig = tabs.map(t => `${t.getAttribute('data-key') || variantLabel(t)}|${variantLabel(t)}|${t.getAttribute('aria-selected')}`).join('~');
  if (list.dataset.sig === sig) {
    section.style.display = 'flex';
    const vResizer = document.getElementById('av-variants-resizer');
    if (vResizer) vResizer.style.display = 'flex';
    return true;
  }
  list.dataset.sig = sig;
  list.innerHTML = '';

  tabs.forEach(orig => {
    const label = variantLabel(orig);
    if (!label) return;
    const btn = document.createElement('button');
    btn.className = 'av-variant-pill';
    btn.textContent = label;
    btn.title = `Switch to variant: ${label}`;
    btn.dataset.variantKey = orig.getAttribute('data-key') || label;
    const selected = orig.getAttribute('aria-selected') === 'true';
    if (selected) btn.classList.add('av-active');
    btn.addEventListener('click', () => {
      // Re-query the live tab by key at click time: the stored node may be stale
      // after React re-renders, which previously caused duplicated/stale handlers.
      const key = btn.dataset.variantKey;
      const live = findVariantTabs().find(t => (t.getAttribute('data-key') || variantLabel(t)) === key) || orig;
      if (live.isConnected) live.click();
      else orig.click();
      // Refresh active state after React updates the tabs
      setTimeout(tryInjectVariants, 350);
    });
    list.appendChild(btn);
  });

  if (count) count.textContent = `(${tabs.length})`;
  section.style.display = 'flex';
  const vResizer = document.getElementById('av-variants-resizer');
  if (vResizer) vResizer.style.display = 'flex';
  list.style.maxHeight = spec(currentVariantsHeight);
  return true;
}

function resetVariants() {
  const section = document.getElementById('av-variants-section');
  const list = document.getElementById('av-variants-list');
  const vResizer = document.getElementById('av-variants-resizer');
  if (list) { list.innerHTML = ''; delete list.dataset.sig; }
  if (section) section.style.display = 'none';
  if (vResizer) vResizer.style.display = 'none';
}

// ── SPA navigation + mutation watching ───────────────────────────────────────
function resetToC() {
  const tocEl = document.getElementById('av-toc-section');
  if (tocEl) {
    tocEl.style.display = 'none';
    const linksContainer = document.getElementById('av-toc-links-sb');
    if (linksContainer) linksContainer.innerHTML = '';
  }
  const resizer = document.getElementById('av-toc-resizer');
  if (resizer) resizer.style.display = 'none';
  if (scrollSpyObserver) { scrollSpyObserver.disconnect(); scrollSpyObserver = null; }
  tocInjected = false;
}

let lastUrl = location.href;
let lastVariantSigCheck = 0;

const navObserver = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    resetToC();
    resetVariants();
    // Wait for React to render then try ToC + Variants
    setTimeout(() => {
      if (!tryInjectToC()) {
        const retryObs = new MutationObserver(() => {
          if (tryInjectToC()) retryObs.disconnect();
        });
        retryObs.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => retryObs.disconnect(), 12000);
      }
      if (!tryInjectVariants()) {
        const vRetry = new MutationObserver(() => {
          if (tryInjectVariants()) vRetry.disconnect();
        });
        vRetry.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => vRetry.disconnect(), 12000);
      }
    }, 600);
  } else {
    // Same URL but React re-rendered tabs (variant switch) → refresh pills' active state (throttled)
    const now = Date.now();
    if (now - lastVariantSigCheck < 800) return;
    lastVariantSigCheck = now;
    const list = document.getElementById('av-variants-list');
    if (list && IS_BUILD_PAGE()) {
      const tabs = findVariantTabs();
      if (tabs.length >= 2) {
        const sig = tabs.map(t => `${t.getAttribute('data-key') || variantLabel(t)}|${variantLabel(t)}|${t.getAttribute('aria-selected')}`).join('~');
        if (list.dataset.sig !== sig) tryInjectVariants();
      }
    }
  }
});

// ── Storage change listener ───────────────────────────────────────────────────
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.folders || changes.builds || changes.settings)) {
    loadAndRender();
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
createSidebar();
navObserver.observe(document.body, { childList: true, subtree: true });

// Viewport height feeds the zoom-compensated shell height — recompute on resize.
let avResizeT = 0;
window.addEventListener('resize', () => {
  clearTimeout(avResizeT);
  avResizeT = setTimeout(applyShellGeometry, 120);
});

// Try ToC + Variants on build pages (with retry for React rendering)
if (IS_BUILD_PAGE()) {
  if (!tryInjectToC()) {
    const tocRetry = new MutationObserver(() => {
      if (tryInjectToC()) tocRetry.disconnect();
    });
    tocRetry.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => tocRetry.disconnect(), 15000);
  }
  if (!tryInjectVariants()) {
    const vRetry = new MutationObserver(() => {
      if (tryInjectVariants()) vRetry.disconnect();
    });
    vRetry.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => vRetry.disconnect(), 15000);
  }
}

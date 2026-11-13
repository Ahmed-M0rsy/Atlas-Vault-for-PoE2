// popup/popup.js — Atlas Vault, tree view, no tabs
'use strict';

// ── State ────────────────────────────────────────────────────────────────────
let state = { folders: [], builds: [], settings: {} };
let folderExpanded = {}; // { [folderId]: bool }
let searchQuery = '';
let movingBuildId = null;

// Shared helpers (see shared/common.js)
const { showToast, isSafeHttpsUrl, MOBALYTICS_HOST_RE, SORT_MODES, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP } = AV;

function currentSort() {
  const s = state.settings?.buildSort;
  return SORT_MODES.includes(s) ? s : 'newest';
}

function currentZoom() {
  const z = Number(state.settings?.uiZoom);
  return Number.isFinite(z) ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) : 1;
}

function applyZoom() {
  const z = currentZoom();
  // Grow the popup window with zoom so ratios stay fixed: the zoomed content
  // exactly fills the widened body instead of overflowing/squishing.
  document.body.style.width = `${Math.round(360 * z)}px`;
  document.getElementById('app').style.zoom = String(z);
  const label = document.getElementById('av-zoom-label');
  if (label) label.textContent = `${Math.round(z * 100)}%`;
  const sortSel = document.getElementById('av-sort');
  if (sortSel) sortSel.value = currentSort();
}

async function persistSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  applyZoom();
  await AV.store.saveSettings(patch);
}

function sortBuilds(list) {
  return AV.sortBuilds(list, currentSort());
}

// After any manual reorder the UI switches to Manual sort.
async function switchToManual() {
  if (currentSort() === 'manual') return;
  await persistSettings({ buildSort: 'manual' });
  const sel = document.getElementById('av-sort');
  if (sel) sel.value = 'manual';
}

async function moveBuild(buildId, dir) {
  const mode = currentSort();
  await AV.store.moveBuildOrder(buildId, dir, mode);
  if (mode !== 'manual') await switchToManual();
  await loadData();
  renderAll();
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  renderAll();
  bindEvents();
  // Stay reactive to storage changes from content script / background sync
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.settings || changes.folders || changes.builds) loadData().then(renderAll);
  });
});

async function loadData() {
  const data = await AV.store.getAll();
  state.folders = data.folders;
  state.builds = data.builds;
  state.settings = data.settings;
}

// ── Events ────────────────────────────────────────────────────────────────────
function bindEvents() {
  // Export & Import
  document.getElementById('av-export-btn').addEventListener('click', exportData);
  document.getElementById('av-import-btn').addEventListener('click', triggerImport);

  // Save current build
  document.getElementById('av-save-btn').addEventListener('click', handleSave);

  // Search
  document.getElementById('av-search').addEventListener('input', e => {
    searchQuery = e.target.value.toLowerCase();
    renderTree();
  });

  // Sort
  document.getElementById('av-sort').addEventListener('change', async e => {
    const v = e.target.value;
    if (!SORT_MODES.includes(v)) return;
    await persistSettings({ buildSort: v });
    renderTree();
  });

  // Zoom (resize UI elements + font)
  document.getElementById('av-zoom-in').addEventListener('click', async () => {
    const z = Math.min(ZOOM_MAX, Math.round((currentZoom() + ZOOM_STEP) * 100) / 100);
    await persistSettings({ uiZoom: z });
  });
  document.getElementById('av-zoom-out').addEventListener('click', async () => {
    const z = Math.max(ZOOM_MIN, Math.round((currentZoom() - ZOOM_STEP) * 100) / 100);
    await persistSettings({ uiZoom: z });
  });
  document.getElementById('av-zoom-label').addEventListener('dblclick', async () => {
    await persistSettings({ uiZoom: 1 });
  });

  // New folder
  document.getElementById('av-new-folder-btn').addEventListener('click', handleCreateFolder);
  document.getElementById('av-new-folder-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleCreateFolder();
  });

  // Modal
  document.getElementById('av-modal-cancel').addEventListener('click', closeModal);
  document.getElementById('av-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('av-modal')) closeModal();
  });
  document.getElementById('av-modal-confirm').addEventListener('click', async () => {
    if (!movingBuildId) return;
    const folderId = document.getElementById('av-modal-folder').value || null;
    await AV.store.moveBuildToFolder(movingBuildId, folderId);
    closeModal();
    await loadData();
    renderAll();
  });
}

async function handleSave() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.includes('mobalytics.gg/poe-2/builds/')) {
    alert('Please open a Mobalytics PoE2 build page first.');
    return;
  }
  const folderId = document.getElementById('av-save-folder').value || null;
  // Ask the page's content script for the metadata (no "scripting" permission needed).
  let meta;
  try {
    meta = await chrome.tabs.sendMessage(tab.id, { type: 'GET_BUILD_META' });
  } catch (e) { meta = null; }
  if (!meta) {
    alert('Could not read this page. Reload the Mobalytics tab and try again.');
    return;
  }
  if (folderId) meta.folderId = folderId;
  await AV.store.saveBuild(meta);
  await loadData();
  renderAll();
}

async function handleCreateFolder() {
  const input = document.getElementById('av-new-folder-input');
  const name = input.value.trim();
  if (!name) return;
  await AV.store.createFolder(name);
  input.value = '';
  await loadData();
  renderAll();
}

// ── Render all ────────────────────────────────────────────────────────────────
function renderAll() {
  applyZoom();
  populateFolderSelects();
  renderTree();
}

function populateFolderSelects() {
  const selects = ['av-save-folder', 'av-modal-folder'].map(id => document.getElementById(id));
  selects.forEach(sel => {
    if (!sel) return;
    const isModal = sel.id === 'av-modal-folder';
    const prev = sel.value;
    sel.replaceChildren(new Option(isModal ? '— No folder —' : 'No folder', ''));
    state.folders.forEach(f => {
      const o = document.createElement('option');
      o.value = f.id; o.textContent = f.name;
      sel.appendChild(o);
    });
    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
  });
}

// ── Tree view ─────────────────────────────────────────────────────────────────
function renderTree() {
  const tree = document.getElementById('av-tree');
  tree.innerHTML = '';

  const filtered = state.builds.filter(b => {
    if (!searchQuery) return true;
    return (b.title || '').toLowerCase().includes(searchQuery) ||
           (b.author || '').toLowerCase().includes(searchQuery);
  });

  const assignedIds = new Set();

  // ── Render folders ──
  state.folders.forEach(folder => {
    const folderBuilds = filtered.filter(b => b.folderId === folder.id);
    folderBuilds.forEach(b => assignedIds.add(b.id));

    const isOpen = folderExpanded[folder.id] !== false; // default expanded
    const node = document.createElement('div');
    node.className = 'av-folder-node';

    // Header
    const header = document.createElement('div');
    header.className = 'av-folder-header';
    header.setAttribute('role', 'treeitem');
    header.setAttribute('aria-expanded', String(isOpen));

    const arrow = document.createElement('span');
    arrow.className = `av-folder-arrow ${isOpen ? 'av-open' : ''}`;
    arrow.textContent = '▶';

    const emoji = document.createElement('span');
    emoji.className = 'av-folder-emoji';
    emoji.textContent = '📁';

    const nameEl = document.createElement('span');
    nameEl.className = 'av-folder-name';
    nameEl.textContent = folder.name;
    nameEl.title = folder.name;

    const countEl = document.createElement('span');
    countEl.className = 'av-folder-count';
    countEl.textContent = folderBuilds.length;

    const renameBtn = document.createElement('button');
    renameBtn.className = 'av-folder-rename-btn';
    renameBtn.title = 'Rename folder';
    renameBtn.textContent = '✏️';

    const delBtn = document.createElement('button');
    delBtn.className = 'av-folder-del-btn';
    delBtn.title = 'Delete folder';
    delBtn.textContent = '🗑️';

    header.append(arrow, emoji, nameEl, countEl, renameBtn, delBtn);

    // Children container
    const children = document.createElement('div');
    children.className = `av-folder-children ${isOpen ? 'av-open' : ''}`;
    children.dataset.folderId = folder.id;

    if (folderBuilds.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'av-folder-empty av-drop-empty';
      empty.textContent = 'Empty folder — drop builds here';
      children.appendChild(empty);
      enableDropZone(children, folder.id);
    } else {
      sortBuilds(folderBuilds).forEach(build => {
        children.appendChild(createBuildCard(build));
      });
      enableDropZone(children, folder.id);
    }

    // Toggle
    header.addEventListener('click', e => {
      if (e.target.closest('button, input')) return;
      folderExpanded[folder.id] = !children.classList.contains('av-open');
      const isNowOpen = folderExpanded[folder.id];
      children.classList.toggle('av-open', isNowOpen);
      arrow.classList.toggle('av-open', isNowOpen);
      header.setAttribute('aria-expanded', String(isNowOpen));
    });

    // Rename
    renameBtn.addEventListener('click', e => {
      e.stopPropagation();
      startInlineRename(folder, nameEl, renameBtn);
    });

    // Delete
    delBtn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm(`Delete folder "${folder.name}"?\nBuilds inside will become uncategorized.`)) return;
      await AV.store.deleteFolder(folder.id);
      await loadData();
      renderAll();
    });

    // Drop onto the header itself moves the build into this folder (appends)
    enableDropZone(header, folder.id);

    node.append(header, children);
    tree.appendChild(node);
  });

  // ── Render uncategorized builds ──
  const uncat = filtered.filter(b => !assignedIds.has(b.id));

  if (uncat.length > 0 || (state.builds.length === 0 && !searchQuery)) {
    if (state.folders.length > 0 || uncat.length > 0) {
      const label = document.createElement('div');
      label.className = 'av-uncat-label';
      label.textContent = `📂 Uncategorized (${uncat.length})`;
      tree.appendChild(label);
    }

    if (state.builds.length === 0 && !searchQuery) {
      const empty = document.createElement('div');
      empty.className = 'av-empty';
      empty.innerHTML = 'No builds saved yet.<br/>Open a Mobalytics build page and click <b>Save Current Build</b>.';
      tree.appendChild(empty);
    } else {
      const uncatWrap = document.createElement('div');
      uncatWrap.id = 'av-uncat-wrap';
      uncatWrap.dataset.folderId = '';
      sortBuilds(uncat).forEach(build => {
        uncatWrap.appendChild(createBuildCard(build));
      });
      tree.appendChild(uncatWrap);
      enableDropZone(uncatWrap, null);
    }
  }

  if (searchQuery && filtered.length === 0) {
    const noResult = document.createElement('div');
    noResult.className = 'av-empty';
    noResult.textContent = 'No builds match your search.';
    tree.appendChild(noResult);
  }
}

// ── Build card (whole card clickable + drag & drop) ─────────────────────────────
function createBuildCard(build) {
  const card = document.createElement('div');
  card.className = 'av-build-card';
  card.setAttribute('role', 'treeitem');
  card.title = `Open: ${build.title}`;
  card.dataset.buildId = build.id;
  card.draggable = !searchQuery;
  if (searchQuery) card.title = `Open: ${build.title} (reorder unavailable while searching)`;

  // Drag grip
  const grip = document.createElement('span');
  grip.className = 'av-drag-grip';
  grip.title = searchQuery ? 'Clear search to drag & reorder' : 'Drag to reorder / move across folders';
  grip.textContent = '⠿';
  grip.setAttribute('aria-hidden', 'true');

  // Thumbnail
  const thumb = document.createElement('div');
  thumb.className = 'av-build-thumb';
  if (isSafeHttpsUrl(build.thumbnail)) {
    const img = document.createElement('img');
    img.src = build.thumbnail;
    img.alt = '';
    img.loading = 'lazy';
    thumb.appendChild(img);
  } else {
    thumb.textContent = '⚗️';
  }

  // Info
  const info = document.createElement('div');
  info.className = 'av-build-info';
  const metaParts = [build.buildClass, build.author].filter(Boolean);
  const titleDiv = document.createElement('div');
  titleDiv.className = 'av-build-title';
  titleDiv.textContent = build.title || '';
  info.appendChild(titleDiv);
  if (metaParts.length) {
    const metaDiv = document.createElement('div');
    metaDiv.className = 'av-build-meta';
    metaDiv.textContent = metaParts.join(' · ');
    info.appendChild(metaDiv);
  }

  // Actions (hover-reveal)
  const actions = document.createElement('div');
  actions.className = 'av-build-actions';

  const upBtn = document.createElement('button');
  upBtn.className = 'av-order-btn';
  upBtn.title = 'Move up (switches to Manual sort)';
  upBtn.textContent = '⬆️';
  upBtn.addEventListener('click', e => {
    e.stopPropagation();
    moveBuild(build.id, -1);
  });

  const downBtn = document.createElement('button');
  downBtn.className = 'av-order-btn';
  downBtn.title = 'Move down (switches to Manual sort)';
  downBtn.textContent = '⬇️';
  downBtn.addEventListener('click', e => {
    e.stopPropagation();
    moveBuild(build.id, 1);
  });

  const renameBtn = document.createElement('button');
  renameBtn.className = 'av-rename-btn';
  renameBtn.title = 'Rename build';
  renameBtn.textContent = '✏️';
  renameBtn.addEventListener('click', e => {
    e.stopPropagation();
    startBuildRename(build, card);
  });

  const moveBtn = document.createElement('button');
  moveBtn.className = 'av-move-btn';
  moveBtn.title = 'Move to folder';
  moveBtn.textContent = '📁';
  moveBtn.addEventListener('click', e => {
    e.stopPropagation();
    openMoveModal(build.id, build.folderId);
  });

  const delBtn = document.createElement('button');
  delBtn.className = 'av-del-btn';
  delBtn.title = 'Delete build';
  delBtn.textContent = '🗑️';
  delBtn.addEventListener('click', async e => {
    e.stopPropagation();
    if (!confirm(`Delete "${build.title}"?`)) return;
    await AV.store.deleteBuild(build.id);
    await loadData();
    renderAll();
  });

  actions.append(upBtn, downBtn, renameBtn, moveBtn, delBtn);
  card.append(grip, thumb, info, actions);

  // ── Drag & drop ──
  card.addEventListener('dragstart', e => {
    if (card.querySelector('.av-build-rename-input')) { e.preventDefault(); return; }
    e.dataTransfer.setData('text/plain', build.id);
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('av-dragging');
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('av-dragging');
    document.querySelectorAll('.av-drop-target,.av-drop-before,.av-drop-after').forEach(el => {
      el.classList.remove('av-drop-target', 'av-drop-before', 'av-drop-after');
    });
  });
  card.addEventListener('dragover', e => {
    if (searchQuery) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = card.getBoundingClientRect();
    const after = (e.clientY - rect.top) > rect.height / 2;
    card.classList.toggle('av-drop-before', !after);
    card.classList.toggle('av-drop-after', after);
  });
  card.addEventListener('dragleave', () => {
    card.classList.remove('av-drop-before', 'av-drop-after');
  });
  card.addEventListener('drop', async e => {
    e.preventDefault();
    e.stopPropagation();
    const sourceId = e.dataTransfer.getData('text/plain');
    const rect = card.getBoundingClientRect();
    const after = (e.clientY - rect.top) > rect.height / 2;
    card.classList.remove('av-drop-before', 'av-drop-after');
    if (!sourceId || sourceId === build.id) return;
    const zone = card.closest('[data-folder-id]');
    const targetFolderId = zone && zone.dataset.folderId ? zone.dataset.folderId : (build.folderId || null);
    await handleBuildDrop(sourceId, targetFolderId, build.id, after);
  });

  // ── WHOLE CARD CLICK → open in new tab ──
  card.addEventListener('click', e => {
    if (e.target.closest('.av-build-actions')) return;
    if (e.target.closest('.av-build-rename-input')) return;
    if (isSafeHttpsUrl(build.url, MOBALYTICS_HOST_RE)) chrome.tabs.create({ url: build.url });
  });

  return card;
}

// ── Drag & drop: zones + persistence (single-message cross-folder move) ─────────
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
    if (e.target.closest('.av-build-card')) return;
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain');
    zoneEl.classList.remove('av-drop-target');
    if (!sourceId) return;
    await handleBuildDrop(sourceId, folderId || null, null, true);
  });
}

async function handleBuildDrop(sourceId, targetFolderId, beforeBuildId, insertAfter) {
  const mode = currentSort();
  await AV.store.dropBuild(sourceId, targetFolderId, beforeBuildId, insertAfter, mode);
  if (mode !== 'manual') await switchToManual();
  await loadData();
  renderAll();
}

// ── Inline build rename ───────────────────────────────────────────────────────
function startBuildRename(build, card) {
  const info = card.querySelector('.av-build-info');
  if (!info || card.querySelector('.av-build-rename-input')) return;
  const titleEl = info.querySelector('.av-build-title');
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'av-build-rename-input';
  input.value = build.title || '';
  input.maxLength = 120;
  input.setAttribute('aria-label', 'Rename build');
  if (titleEl) titleEl.replaceWith(input);
  else info.prepend(input);
  input.focus();
  input.select();

  let done = false;
  const commit = async (save) => {
    if (done) return;
    done = true;
    const name = input.value.trim();
    if (save && name && name !== build.title) {
      await AV.store.renameBuild(build.id, name);
      await loadData();
      renderAll();
    } else {
      renderTree();
    }
  };

  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') commit(true);
    if (e.key === 'Escape') commit(false);
  });
  input.addEventListener('blur', () => commit(true));
  input.addEventListener('click', e => e.stopPropagation());
}

// ── Inline folder rename ──────────────────────────────────────────────────────
function startInlineRename(folder, nameEl, renameBtn) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'av-folder-rename-input';
  input.value = folder.name;
  input.maxLength = 40;
  nameEl.replaceWith(input);
  renameBtn.textContent = '✅';
  input.focus();
  input.select();

  const commit = async () => {
    const name = input.value.trim();
    if (name && name !== folder.name) {
      await AV.store.renameFolder(folder.id, name);
    }
    await loadData();
    renderAll();
  };

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') { loadData().then(renderAll); }
  });
  renameBtn.addEventListener('click', commit, { once: true });
}

// ── Move modal ────────────────────────────────────────────────────────────────
function openMoveModal(buildId, currentFolderId) {
  movingBuildId = buildId;
  populateFolderSelects();
  const sel = document.getElementById('av-modal-folder');
  sel.value = currentFolderId || '';
  document.getElementById('av-modal').classList.remove('av-hidden');
}

function closeModal() {
  movingBuildId = null;
  document.getElementById('av-modal').classList.add('av-hidden');
}

// ── Export / Import (shared UI in shared/common.js) ──────────────────────────
async function exportData() {
  const { folders, builds, settings } = await AV.store.getAll();
  AV.exportBackup(folders, builds, settings);
}

function triggerImport() {
  AV.startImport(async (mode, data) => {
    await AV.store.applyImport(mode, data);
    await loadData();
    renderAll();
  });
}

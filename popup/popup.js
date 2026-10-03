// popup/popup.js — Atlas Vault, tree view, no tabs
'use strict';

// ── State ────────────────────────────────────────────────────────────────────
let state = { folders: [], builds: [] };
let folderExpanded = {}; // { [folderId]: bool }
let searchQuery = '';
let movingBuildId = null;

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  renderAll();
  bindEvents();
});

async function loadData() {
  const resp = await chrome.runtime.sendMessage({ type: 'GET_DATA' });
  if (resp?.ok) {
    state.folders = resp.data.folders || [];
    state.builds  = resp.data.builds  || [];
  }
}

// ── Events ────────────────────────────────────────────────────────────────────
function bindEvents() {
  // Save current build
  document.getElementById('av-save-btn').addEventListener('click', handleSave);

  // Search
  document.getElementById('av-search').addEventListener('input', e => {
    searchQuery = e.target.value.toLowerCase();
    renderTree();
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
    await chrome.runtime.sendMessage({ type: 'MOVE_BUILD', buildId: movingBuildId, folderId });
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
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      title: document.querySelector('meta[property="og:title"]')?.content
             || document.querySelector('h1')?.textContent?.trim()
             || document.title,
      author: document.querySelector('[class*="author"],[class*="creator"]')
                ?.textContent?.trim().replace(/^by\s*/i, '') || '',
      buildClass: '',
      url: location.href,
      thumbnail: document.querySelector('meta[property="og:image"]')?.content || ''
    })
  });
  const meta = result.result;
  if (folderId) meta.folderId = folderId;
  await chrome.runtime.sendMessage({ type: 'SAVE_BUILD', build: meta });
  await loadData();
  renderAll();
}

async function handleCreateFolder() {
  const input = document.getElementById('av-new-folder-input');
  const name = input.value.trim();
  if (!name) return;
  await chrome.runtime.sendMessage({ type: 'CREATE_FOLDER', name });
  input.value = '';
  await loadData();
  renderAll();
}

// ── Render all ────────────────────────────────────────────────────────────────
function renderAll() {
  populateFolderSelects();
  renderTree();
}

function populateFolderSelects() {
  const selects = ['av-save-folder', 'av-modal-folder'].map(id => document.getElementById(id));
  selects.forEach(sel => {
    if (!sel) return;
    const isModal = sel.id === 'av-modal-folder';
    const prev = sel.value;
    sel.innerHTML = `<option value="">${isModal ? '— No folder —' : 'No folder'}</option>`;
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

    if (folderBuilds.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'av-folder-empty';
      empty.textContent = 'Empty folder';
      children.appendChild(empty);
    } else {
      folderBuilds.sort((a, b) => b.savedAt - a.savedAt).forEach(build => {
        children.appendChild(createBuildCard(build));
      });
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
      await chrome.runtime.sendMessage({ type: 'DELETE_FOLDER', id: folder.id });
      await loadData();
      renderAll();
    });

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
      uncat.sort((a, b) => b.savedAt - a.savedAt).forEach(build => {
        tree.appendChild(createBuildCard(build));
      });
    }
  }

  if (searchQuery && filtered.length === 0) {
    const noResult = document.createElement('div');
    noResult.className = 'av-empty';
    noResult.textContent = 'No builds match your search.';
    tree.appendChild(noResult);
  }
}

// ── Build card (whole card clickable) ─────────────────────────────────────────
function createBuildCard(build) {
  const card = document.createElement('div');
  card.className = 'av-build-card';
  card.setAttribute('role', 'treeitem');
  card.title = `Open: ${build.title}`;

  // Thumbnail
  const thumb = document.createElement('div');
  thumb.className = 'av-build-thumb';
  if (build.thumbnail) {
    thumb.innerHTML = `<img src="${escHtml(build.thumbnail)}" alt="" loading="lazy" />`;
  } else {
    thumb.textContent = '⚗️';
  }

  // Info
  const info = document.createElement('div');
  info.className = 'av-build-info';
  const metaParts = [build.buildClass, build.author].filter(Boolean);
  info.innerHTML = `
    <div class="av-build-title">${escHtml(build.title)}</div>
    ${metaParts.length ? `<div class="av-build-meta">${metaParts.map(escHtml).join(' · ')}</div>` : ''}
  `;

  // Actions (hover-reveal)
  const actions = document.createElement('div');
  actions.className = 'av-build-actions';

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
    await chrome.runtime.sendMessage({ type: 'DELETE_BUILD', id: build.id });
    await loadData();
    renderAll();
  });

  actions.append(moveBtn, delBtn);
  card.append(thumb, info, actions);

  // ── WHOLE CARD CLICK → open in new tab ──
  card.addEventListener('click', e => {
    if (e.target.closest('.av-build-actions')) return;
    chrome.tabs.create({ url: build.url });
  });

  return card;
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
      await chrome.runtime.sendMessage({ type: 'RENAME_FOLDER', id: folder.id, name });
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

// ── Utility ───────────────────────────────────────────────────────────────────
function escHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

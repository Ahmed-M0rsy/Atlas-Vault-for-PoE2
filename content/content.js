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

// ── Data helpers (direct storage access in content script) ───────────────────
async function loadData() {
  const { folders = [], builds = [] } = await chrome.storage.local.get(['folders', 'builds']);
  return { folders, builds };
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

// ── Sidebar build ─────────────────────────────────────────────────────────────
let sidebar = null;
let tocOpen = true;
let searchQuery = '';
let folderStates = {}; // { [folderId]: bool expanded }

function createSidebar() {
  if (document.getElementById('av-sidebar')) return;

  sidebar = document.createElement('div');
  sidebar.id = 'av-sidebar';

  // ── Toggle tab (sticks out to the left) ──
  const toggleTab = document.createElement('div');
  toggleTab.id = 'av-toggle-tab';
  toggleTab.textContent = '⚗';
  toggleTab.title = 'Toggle Atlas Vault';
  toggleTab.setAttribute('role', 'button');
  toggleTab.setAttribute('tabindex', '0');
  toggleTab.addEventListener('click', toggleSidebar);
  toggleTab.addEventListener('keydown', e => { if (e.key === 'Enter') toggleSidebar(); });
  sidebar.appendChild(toggleTab);

  // ── Collapsed strip ──
  const collapsedStrip = document.createElement('div');
  collapsedStrip.className = 'av-collapsed-only';
  collapsedStrip.innerHTML = `<span style="font-size:18px;color:#c8a96e">⚗️</span>`;
  sidebar.appendChild(collapsedStrip);

  // ── Main expanded content ──
  const expandedWrap = document.createElement('div');
  expandedWrap.className = 'av-expanded-only';
  expandedWrap.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';

  // Header
  const header = document.createElement('div');
  header.id = 'av-sidebar-header';
  header.innerHTML = `
    <div id="av-sidebar-logo">⚗️ Atlas Vault</div>
    <div id="av-sidebar-sub">PoE2 Build Manager</div>
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

  // New folder
  const newFolder = document.createElement('div');
  newFolder.id = 'av-sb-new-folder';
  newFolder.innerHTML = `
    <input type="text" placeholder="New folder…" maxlength="40" aria-label="New folder name" />
    <button title="Create folder">＋</button>
  `;
  expandedWrap.appendChild(newFolder);

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

  // Tree view
  const tree = document.createElement('div');
  tree.id = 'av-sb-tree';
  expandedWrap.appendChild(tree);

  sidebar.appendChild(expandedWrap);
  document.body.appendChild(sidebar);

  // ── Wire up events ──

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

  // ToC toggle
  tocSection.querySelector('#av-toc-section-header').addEventListener('click', () => {
    tocOpen = !tocOpen;
    tocSection.querySelector('#av-toc-section-arrow').classList.toggle('av-open', tocOpen);
    tocSection.querySelector('#av-toc-links-sb').classList.toggle('av-open', tocOpen);
  });

  loadAndRender();
}

function toggleSidebar() {
  if (!sidebar) return;
  sidebar.classList.toggle('av-collapsed');
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
  // Also update ToC if on a build page
  if (IS_BUILD_PAGE()) tryInjectToC();
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

    if (folderBuilds.length === 0) {
      children.innerHTML = `<div style="padding:4px 8px 4px 24px;font-size:10.5px;color:#353555;">Empty folder</div>`;
    } else {
      folderBuilds.sort((a, b) => b.savedAt - a.savedAt).forEach(build => {
        children.appendChild(createBuildItem(build, folders));
      });
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
      uncat.sort((a, b) => b.savedAt - a.savedAt).forEach(build => {
        tree.appendChild(createBuildItem(build, folders));
      });
    }
  }

  if (searchQuery && filtered.length === 0) {
    const noResult = document.createElement('div');
    noResult.className = 'av-tree-empty';
    noResult.textContent = 'No builds match your search.';
    tree.appendChild(noResult);
  }
}

// ── Build item ────────────────────────────────────────────────────────────────
function createBuildItem(build, folders) {
  const item = document.createElement('div');
  item.className = 'av-build-item';
  item.title = build.title;

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

  item.appendChild(thumb);
  item.appendChild(info);
  item.appendChild(delBtn);

  // ── Whole item click → open build in new tab ──
  item.addEventListener('click', e => {
    if (e.target.closest('.av-build-del-btn')) return;
    window.open(build.url, '_blank', 'noopener');
  });

  return item;
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

// ── Open tab (content scripts can't open tabs directly — use service worker) ──
// Add a listener handler in background.js for _OPEN_TAB
// But actually, content scripts CAN use window.open for new tabs

// Override: use window.open instead of message passing for simplicity
// (Replacing the createBuildItem click handler to use window.open)

// ── SPA navigation + mutation watching ───────────────────────────────────────
function resetToC() {
  const tocEl = document.getElementById('av-toc-section');
  if (tocEl) {
    tocEl.style.display = 'none';
    const linksContainer = document.getElementById('av-toc-links-sb');
    if (linksContainer) linksContainer.innerHTML = '';
  }
  if (scrollSpyObserver) { scrollSpyObserver.disconnect(); scrollSpyObserver = null; }
  tocInjected = false;
}

let lastUrl = location.href;

const navObserver = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    resetToC();
    // Wait for React to render then try ToC
    setTimeout(() => {
      if (!tryInjectToC()) {
        const retryObs = new MutationObserver(() => {
          if (tryInjectToC()) retryObs.disconnect();
        });
        retryObs.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => retryObs.disconnect(), 12000);
      }
    }, 600);
  }
});

// ── Storage change listener ───────────────────────────────────────────────────
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.folders || changes.builds)) {
    loadAndRender();
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
createSidebar();
navObserver.observe(document.body, { childList: true, subtree: true });

// Try ToC on build pages (with retry for React rendering)
if (IS_BUILD_PAGE()) {
  if (!tryInjectToC()) {
    const tocRetry = new MutationObserver(() => {
      if (tryInjectToC()) tocRetry.disconnect();
    });
    tocRetry.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => tocRetry.disconnect(), 15000);
  }
}

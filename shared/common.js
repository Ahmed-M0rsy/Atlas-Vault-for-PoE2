// shared/common.js — logic shared by the sidebar (content script) and the popup.
// Loaded as a plain script before content.js / popup.js; exposes a single global: AV.
'use strict';

const AV = (() => {
  // ── Constants ──────────────────────────────────────────────────────────────
  const SORT_MODES = ['manual', 'newest', 'oldest', 'az', 'za'];
  const ZOOM_MIN = 0.7, ZOOM_MAX = 1.6, ZOOM_STEP = 0.1;
  const DEFAULT_SETTINGS = {
    tocHeight: 220, sidebarWidth: 272, uiZoom: 1, buildSort: 'newest',
    sidebarCollapsed: false, sidebarMinimized: false, variantsHeight: 120
  };
  const MOBALYTICS_HOST_RE = /^(www\.)?mobalytics\.gg$/;

  // ── Validation helpers ─────────────────────────────────────────────────────
  // Only allow https URLs (build links and thumbnails can come from imported files).
  function isSafeHttpsUrl(u, hostRe) {
    try {
      const p = new URL(String(u));
      return p.protocol === 'https:' && (!hostRe || hostRe.test(p.hostname));
    } catch (e) { return false; }
  }
  function cleanStr(v, max) {
    return v == null ? '' : String(v).slice(0, max);
  }
  function cleanId(v) {
    const s = String(v == null ? '' : v);
    return /^[A-Za-z0-9_-]{1,64}$/.test(s) ? s : crypto.randomUUID();
  }

  // ── Sorting ────────────────────────────────────────────────────────────────
  function sortBuilds(list, mode) {
    const arr = [...list];
    if (mode === 'az') return arr.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    if (mode === 'za') return arr.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
    if (mode === 'oldest') return arr.sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0));
    if (mode === 'manual') {
      if (!arr.some(b => typeof b.order === 'number')) return arr.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      return arr.sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
    }
    return arr.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)); // newest
  }

  // ── Toast ──────────────────────────────────────────────────────────────────
  function showToast(title, body = '') {
    let el = document.getElementById('av-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'av-toast';
      document.body.appendChild(el);
    }
    const strong = document.createElement('strong');
    strong.textContent = title == null ? '' : String(title);
    el.replaceChildren(strong);
    if (body) el.append(document.createTextNode(String(body)));
    el.classList.add('av-show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('av-show'), 3000);
  }

  // ── Import normalization + merge (pure) ────────────────────────────────────
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

    // Folders first, so build.folderId can follow any ID that had to be regenerated.
    const folderIdFix = new Map();
    folders = folders.filter(f => f && f.name).map(f => {
      const id = cleanId(f.id);
      if (f.id != null) folderIdFix.set(String(f.id), id);
      return {
        id,
        name: cleanStr(f.name, 40).trim(),
        createdAt: typeof f.createdAt === 'number' ? f.createdAt : Date.now()
      };
    }).filter(f => f.name);

    builds = builds.filter(b => b && (b.url || b.title)).map(b => ({
      id: cleanId(b.id),
      title: cleanStr(b.title, 120) || 'Untitled Build',
      author: cleanStr(b.author, 120),
      buildClass: cleanStr(b.buildClass, 120),
      url: isSafeHttpsUrl(b.url, MOBALYTICS_HOST_RE) ? String(b.url) : '',
      thumbnail: isSafeHttpsUrl(b.thumbnail) ? String(b.thumbnail) : '',
      folderId: b.folderId ? (folderIdFix.get(String(b.folderId)) || null) : null,
      savedAt: typeof b.savedAt === 'number' ? b.savedAt : Date.now(),
      ...(typeof b.order === 'number' ? { order: b.order } : {})
    }));

    return { folders, builds, settings, exportedAt };
  }

  function mergeImport(cur, imported) {
    const folderIdMap = new Map();
    const finalFolders = [...cur.folders];

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

    const finalBuilds = [...cur.builds];
    imported.builds.forEach(impBuild => {
      const targetFolderId = impBuild.folderId ? (folderIdMap.get(impBuild.folderId) || impBuild.folderId) : null;
      const validFolderId = finalFolders.some(f => f.id === targetFolderId) ? targetFolderId : null;

      const existingIdx = finalBuilds.findIndex(b => (impBuild.url && b.url === impBuild.url) || b.id === impBuild.id);
      if (existingIdx >= 0) {
        finalBuilds[existingIdx] = { ...finalBuilds[existingIdx], ...impBuild, folderId: validFolderId };
      } else {
        finalBuilds.push({ ...impBuild, id: impBuild.id || crypto.randomUUID(), folderId: validFolderId });
      }
    });

    return {
      folders: finalFolders,
      builds: finalBuilds,
      settings: { ...cur.settings, ...(imported.settings || {}) }
    };
  }

  // ── Storage layer (single write path for popup and sidebar) ───────────────
  const area = () => chrome.storage.local;
  let queue = Promise.resolve();
  // Serialize writes within one context so read-modify-write cycles don't interleave.
  function serial(fn) {
    const p = queue.then(fn);
    queue = p.catch(() => {});
    return p;
  }
  const gid = b => b.folderId || null;

  const store = {
    async getAll() {
      const { folders = [], builds = [], settings = {} } = await area().get(['folders', 'builds', 'settings']);
      return { folders, builds, settings: { ...DEFAULT_SETTINGS, ...settings } };
    },

    saveBuild(build) {
      return serial(async () => {
        const { builds = [] } = await area().get('builds');
        const idx = builds.findIndex(b => b.url === build.url);
        if (idx >= 0) builds[idx] = { ...builds[idx], ...build };
        else builds.push({ ...build, id: crypto.randomUUID(), savedAt: Date.now() });
        await area().set({ builds });
      });
    },

    deleteBuild(id) {
      return serial(async () => {
        const { builds = [] } = await area().get('builds');
        await area().set({ builds: builds.filter(b => b.id !== id) });
      });
    },

    createFolder(name) {
      return serial(async () => {
        const { folders = [] } = await area().get('folders');
        const folder = { id: crypto.randomUUID(), name, createdAt: Date.now() };
        folders.push(folder);
        await area().set({ folders });
        return folder;
      });
    },

    deleteFolder(id) {
      return serial(async () => {
        const { folders = [], builds = [] } = await area().get(['folders', 'builds']);
        await area().set({
          folders: folders.filter(f => f.id !== id),
          builds: builds.map(b => b.folderId === id ? { ...b, folderId: null } : b)
        });
      });
    },

    renameFolder(id, name) {
      return serial(async () => {
        const { folders = [] } = await area().get('folders');
        const idx = folders.findIndex(f => f.id === id);
        if (idx >= 0) { folders[idx].name = name; await area().set({ folders }); }
      });
    },

    renameBuild(id, title) {
      return serial(async () => {
        const name = String(title || '').trim().slice(0, 120);
        if (!name) return;
        const { builds = [] } = await area().get('builds');
        const idx = builds.findIndex(b => b.id === id);
        if (idx >= 0) { builds[idx].title = name; await area().set({ builds }); }
      });
    },

    moveBuildToFolder(buildId, folderId) {
      return serial(async () => {
        const { builds = [] } = await area().get('builds');
        const idx = builds.findIndex(b => b.id === buildId);
        if (idx >= 0) { builds[idx].folderId = folderId || null; await area().set({ builds }); }
      });
    },

    // Swap a build with its neighbour inside its group. Seeds a global manual order
    // from the current display order first. Caller should switch the UI sort to 'manual'.
    moveBuildOrder(buildId, dir, sortMode) {
      return serial(async () => {
        const { builds = [] } = await area().get('builds');
        const build = builds.find(b => b.id === buildId);
        if (!build) return false;
        const sameGroup = b => gid(b) === gid(build);
        if (sortMode !== 'manual' || !builds.filter(sameGroup).some(b => typeof b.order === 'number')) {
          sortBuilds(builds, sortMode).forEach((b, i) => {
            const t = builds.find(x => x.id === b.id);
            if (t) t.order = i;
          });
        }
        const sorted = sortBuilds(builds.filter(sameGroup), 'manual');
        const idx = sorted.findIndex(b => b.id === buildId);
        const swapIdx = idx + dir;
        if (idx >= 0 && swapIdx >= 0 && swapIdx < sorted.length) {
          const tmp = sorted[idx].order;
          sorted[idx].order = sorted[swapIdx].order;
          sorted[swapIdx].order = tmp;
        }
        await area().set({ builds });
        return true;
      });
    },

    // Drag & drop: cross-folder relocation + manual ordering in one write.
    // beforeBuildId null → append to the end of the target group.
    dropBuild(sourceId, targetFolderId, beforeBuildId, insertAfter, sortMode) {
      return serial(async () => {
        const { builds = [] } = await area().get('builds');
        const source = builds.find(b => b.id === sourceId);
        if (!source) return;
        const targetFid = targetFolderId || null;

        // Work from the current display order so the drop lands where the user saw it.
        const sortedGroup = sortBuilds(builds.filter(b => gid(b) === targetFid && b.id !== sourceId), sortMode);
        // Seed integer orders within the target group so fractional inserts are stable.
        sortedGroup.forEach((b, i) => {
          const t = builds.find(x => x.id === b.id);
          if (t && typeof t.order !== 'number') t.order = i;
        });
        const ordered = [...sortedGroup].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        let newOrder;
        const last = ordered[ordered.length - 1];
        if (!beforeBuildId) {
          newOrder = last ? (last.order ?? ordered.length - 1) + 1 : 0;
        } else {
          const idx = ordered.findIndex(b => b.id === beforeBuildId);
          if (idx < 0) {
            newOrder = last ? (last.order ?? 0) + 1 : 0;
          } else if (!insertAfter) {
            newOrder = idx === 0
              ? (ordered[0].order ?? 1) - 1
              : ((ordered[idx - 1].order ?? 0) + (ordered[idx].order ?? 0)) / 2;
          } else {
            newOrder = idx === ordered.length - 1
              ? (ordered[idx].order ?? 0) + 1
              : ((ordered[idx].order ?? 0) + (ordered[idx + 1].order ?? 0)) / 2;
          }
        }

        source.folderId = targetFid;
        source.order = newOrder;

        // Renormalize the target group to clean integers (avoids float drift).
        builds.filter(b => gid(b) === targetFid)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .forEach((b, i) => { b.order = i; });

        await area().set({ builds });
      });
    },

    async saveSettings(patch) {
      return serial(async () => {
        const { settings = {} } = await area().get('settings');
        const updated = { ...settings, ...patch };
        await area().set({ settings: updated });
        return updated;
      });
    },

    // mode: 'merge' | 'replace'. Returns the resulting settings object.
    applyImport(mode, imported) {
      return serial(async () => {
        let result;
        if (mode === 'replace') {
          result = { folders: imported.folders, builds: imported.builds, settings: imported.settings || {} };
        } else {
          const { folders = [], builds = [], settings = {} } = await area().get(['folders', 'builds', 'settings']);
          result = mergeImport({ folders, builds, settings }, imported);
        }
        await area().set(result);
        return result.settings;
      });
    }
  };

  // ── Export / import UI ─────────────────────────────────────────────────────
  function exportBackup(folders, builds, settings) {
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
    a.href = url;
    a.download = `atlas-vault-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
    showToast('📤 Export Complete', `Exported ${folders.length} folder(s) and ${builds.length} build(s).`);
  }

  // Opens the file picker → validates → shows the Merge/Replace modal.
  // onApply(mode, normalizedData) must perform the write and refresh the UI.
  function startImport(onApply) {
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
          const normalized = normalizeImportData(JSON.parse(ev.target.result));
          if (normalized.builds.length === 0 && normalized.folders.length === 0) {
            showToast('❌ Import Error', 'No valid builds or folders found in file.');
            return;
          }
          showImportModal(normalized, onApply);
        } catch (err) {
          showToast('❌ Import Error', 'Invalid JSON backup file.');
        }
      };
      reader.onerror = () => showToast('❌ Import Error', 'Could not read selected file.');
      reader.readAsText(file);
    };
    input.click();
  }

  function showImportModal(importedData, onApply) {
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
            <div class="av-import-stat"><strong data-stat="folders"></strong><span>Folders</span></div>
            <div class="av-import-stat"><strong data-stat="builds"></strong><span>Builds</span></div>
            <div class="av-import-stat"><strong data-stat="settings"></strong><span>Settings</span></div>
          </div>
          <div class="av-import-meta" style="display:none"></div>
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

    modal.querySelector('[data-stat="folders"]').textContent = String(importedData.folders.length);
    modal.querySelector('[data-stat="builds"]').textContent = String(importedData.builds.length);
    modal.querySelector('[data-stat="settings"]').textContent = importedData.settings ? 'Yes' : 'No';
    if (dateFormatted) {
      const meta = modal.querySelector('.av-import-meta');
      meta.textContent = `📅 Exported: ${dateFormatted}`;
      meta.style.display = '';
    }

    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('.av-modal-close').addEventListener('click', close);
    modal.querySelector('#av-btn-import-cancel').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    modal.querySelector('#av-btn-import-merge').addEventListener('click', async () => {
      close();
      await onApply('merge', importedData);
      showToast('✅ Import Complete', `Merged ${importedData.builds.length} build(s) & ${importedData.folders.length} folder(s).`);
    });

    modal.querySelector('#av-btn-import-replace').addEventListener('click', async () => {
      if (!confirm('Are you sure you want to replace ALL current builds and folders with this backup? This cannot be undone.')) return;
      close();
      await onApply('replace', importedData);
      showToast('✅ Import Complete', `Restored ${importedData.builds.length} build(s) & ${importedData.folders.length} folder(s).`);
    });
  }

  return {
    SORT_MODES, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP, DEFAULT_SETTINGS, MOBALYTICS_HOST_RE,
    isSafeHttpsUrl, sortBuilds, showToast, normalizeImportData, mergeImport,
    store, exportBackup, startImport
  };
})();

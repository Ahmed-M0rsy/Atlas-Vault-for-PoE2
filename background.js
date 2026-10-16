// background.js – service worker
// No in-memory state. All state lives in chrome.storage.local.

chrome.runtime.onInstalled.addListener(async () => {
  const { folders, builds, settings } = await chrome.storage.local.get(['folders', 'builds', 'settings']);
  if (!folders) {
    await chrome.storage.local.set({ folders: [] });
  }
  if (!builds) {
    await chrome.storage.local.set({ builds: [] });
  }
  if (!settings) {
    await chrome.storage.local.set({ settings: { tocHeight: 220, sidebarWidth: 272, uiZoom: 1, buildSort: 'newest', sidebarCollapsed: false, sidebarMinimized: false, variantsHeight: 120 } });
  } else {
    // Backfill new settings keys for existing installs
    let needsSave = false;
    if (typeof settings.uiZoom !== 'number') { settings.uiZoom = 1; needsSave = true; }
    if (typeof settings.buildSort !== 'string') { settings.buildSort = 'newest'; needsSave = true; }
    if (typeof settings.sidebarCollapsed !== 'boolean') { settings.sidebarCollapsed = false; needsSave = true; }
    if (typeof settings.sidebarMinimized !== 'boolean') { settings.sidebarMinimized = false; needsSave = true; }
    if (typeof settings.variantsHeight !== 'number') { settings.variantsHeight = 120; needsSave = true; }
    if (needsSave) await chrome.storage.local.set({ settings });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === 'GET_DATA') {
        const data = await chrome.storage.local.get(['folders', 'builds', 'settings']);
        sendResponse({ ok: true, data });

      } else if (message.type === 'SAVE_BUILD') {
        const { builds = [] } = await chrome.storage.local.get('builds');
        const existing = builds.findIndex(b => b.url === message.build.url);
        if (existing >= 0) {
          builds[existing] = { ...builds[existing], ...message.build };
        } else {
          builds.push({ ...message.build, id: crypto.randomUUID(), savedAt: Date.now() });
        }
        await chrome.storage.local.set({ builds });
        sendResponse({ ok: true });

      } else if (message.type === 'DELETE_BUILD') {
        const { builds = [] } = await chrome.storage.local.get('builds');
        await chrome.storage.local.set({ builds: builds.filter(b => b.id !== message.id) });
        sendResponse({ ok: true });

      } else if (message.type === 'CREATE_FOLDER') {
        const { folders = [] } = await chrome.storage.local.get('folders');
        const newFolder = { id: crypto.randomUUID(), name: message.name, createdAt: Date.now() };
        folders.push(newFolder);
        await chrome.storage.local.set({ folders });
        sendResponse({ ok: true, folder: newFolder });

      } else if (message.type === 'DELETE_FOLDER') {
        const { folders = [], builds = [] } = await chrome.storage.local.get(['folders', 'builds']);
        // Unassign builds from deleted folder
        const updatedBuilds = builds.map(b => b.folderId === message.id ? { ...b, folderId: null } : b);
        await chrome.storage.local.set({
          folders: folders.filter(f => f.id !== message.id),
          builds: updatedBuilds
        });
        sendResponse({ ok: true });

      } else if (message.type === 'RENAME_FOLDER') {
        const { folders = [] } = await chrome.storage.local.get('folders');
        const idx = folders.findIndex(f => f.id === message.id);
        if (idx >= 0) folders[idx].name = message.name;
        await chrome.storage.local.set({ folders });
        sendResponse({ ok: true });

      } else if (message.type === 'MOVE_BUILD') {
        const { builds = [] } = await chrome.storage.local.get('builds');
        const idx = builds.findIndex(b => b.id === message.buildId);
        if (idx >= 0) builds[idx].folderId = message.folderId;
        await chrome.storage.local.set({ builds });
        sendResponse({ ok: true });

      } else if (message.type === 'RENAME_BUILD') {
        const { builds = [] } = await chrome.storage.local.get('builds');
        const idx = builds.findIndex(b => b.id === message.id);
        if (idx >= 0) {
          const name = String(message.title || '').trim().slice(0, 120);
          if (name) builds[idx].title = name;
          await chrome.storage.local.set({ builds });
        }
        sendResponse({ ok: true });

      } else if (message.type === 'REORDER_BUILDS') {
        // message.orderedIds: array of build ids in desired global order
        // message.folders (optional): { [buildId]: folderId|null } for cross-folder drag & drop
        const { builds = [] } = await chrome.storage.local.get('builds');
        const orderMap = new Map((message.orderedIds || []).map((id, i) => [id, i]));
        const folderMap = message.folders && typeof message.folders === 'object' ? message.folders : null;
        builds.forEach(b => {
          if (orderMap.has(b.id)) b.order = orderMap.get(b.id);
          if (folderMap && Object.prototype.hasOwnProperty.call(folderMap, b.id)) {
            b.folderId = folderMap[b.id] || null;
          }
        });
        // Builds not in the list keep their relative position at the end
        await chrome.storage.local.set({ builds });
        sendResponse({ ok: true });

      } else if (message.type === 'GET_SETTINGS') {
        const { settings = {} } = await chrome.storage.local.get('settings');
        sendResponse({ ok: true, settings });

      } else if (message.type === 'SAVE_SETTINGS') {
        const { settings = {} } = await chrome.storage.local.get('settings');
        const updated = { ...settings, ...message.settings };
        await chrome.storage.local.set({ settings: updated });
        sendResponse({ ok: true, settings: updated });

      } else if (message.type === 'IMPORT_DATA') {
        const toSet = {};
        if (message.folders) toSet.folders = message.folders;
        if (message.builds) toSet.builds = message.builds;
        if (message.settings) toSet.settings = message.settings;
        await chrome.storage.local.set(toSet);
        sendResponse({ ok: true });

      } else {
        sendResponse({ ok: false, error: 'Unknown message type' });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
  })();
  return true; // keep channel open for async response
});

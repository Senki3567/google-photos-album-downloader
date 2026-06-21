// ==UserScript==
// @name         Google Photos - Album Adder Album Filename and Size on Hover
// @namespace    https://buymeacoffee.com/sircluckingtonx
// @version      1.2.0
// @description  Combined Easy Album Adder, Show Album on Hover, Show Filename and File Size on Hover, Copy Direct Download Link, and Album Size info.
// @author       SirCluckingtonX & Antigravity
// @license      MIT
// @homepageURL  https://buymeacoffee.com/sircluckingtonx
// @supportURL   https://buymeacoffee.com/sircluckingtonx
// @contributionURL https://buymeacoffee.com/sircluckingtonx
// @icon         https://www.google.com/s2/favicons?sz=64&domain=photos.google.com
// @match        https://photos.google.com/*
// @run-at       document-end
// @grant        unsafeWindow
// ==/UserScript==

/*
MIT License

Copyright (c) 2025 SirCluckingtonX

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

console.log('%c[GP-Master] Master Script successfully loaded!', 'color: #10b981; font-size: 14px; font-weight: bold; background: #064e3b; padding: 4px 8px; border-radius: 4px;');

(async function () {
  'use strict';

  /* =============================================================
   *  1. CONFIGURATION
   * ============================================================= */
  const HOTKEY_ADD    = { key: 'Q', shift: true,  alt: false, ctrl: false, meta: false };
  const HOTKEY_RECALL = { key: 'W', shift: true,   alt: false, ctrl: false, meta: false };
  const PERSIST_NOT_IN_ALBUMS = true;
  const HIGHLIGHT_UNALBUMED = true; // Adds a red border to photos not in any albums
  const CACHE_TTL = 60000;

  /* =============================================================
   *  2. SHARED STATE & HELPERS
   * ============================================================= */
  let hasApi = false;
  const albumCache = new Map();
  const filenameCache = new Map();
  const albumDetailsCache = new Map(); // mediaKey -> { count, size, isLoading }

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
  const visible = el => el && el.offsetParent !== null;
  const log = (...a) => console.log('%c[GP-Master]', 'color: #3b82f6; font-weight: bold;', ...a);

  function formatBytes(bytes) {
    if (!bytes || isNaN(bytes)) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Google Photos batchexecute RPC helper
  async function sendRpc(rpcid, data) {
    const wizData = window.WIZ_global_data || unsafeWindow.WIZ_global_data;
    if (!wizData) {
        throw new Error('Google WIZ_global_data not found. Refresh the page.');
    }

    const baseUrl = `${location.origin}${wizData['Im6cmf']}/data/batchexecute`;
    const params = new URLSearchParams({
        'rpcids': rpcid,
        'source-path': location.pathname,
        'f.sid': wizData['FdrFJe'],
        'bl': wizData['cfb2h'],
        'rt': 'c'
    });

    const payloadData = [
        rpcid,
        JSON.stringify(data),
        null,
        "1"
    ];
    const bodyParams = new URLSearchParams();
    bodyParams.set('f.req', JSON.stringify([[payloadData]]));
    bodyParams.set('at', wizData['SNlM0e']);

    const response = await fetch(`${baseUrl}?${params.toString()}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: bodyParams.toString()
    });

    if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
    }

    const text = await response.text();
    const lines = text.split('\n');
    for (const line of lines) {
        if (line.includes('wrb.fr')) {
            const parsed = JSON.parse(line);
            if (parsed[0] && parsed[0][2]) {
                return JSON.parse(parsed[0][2]);
            }
        }
    }
    return null;
  }

  // Fetch count and total file size for an album by its mediaKey
  async function fetchAlbumDetails(albumMediaKey, onProgress) {
    let mediaKeys = [];
    let nextPageId = null;
    do {
      const resData = await sendRpc('snAcKc', [albumMediaKey, nextPageId, null, null]);
      if (!resData) break;
      const pageItems = resData[1] || [];
      mediaKeys.push(...pageItems.map(item => item[0]).filter(Boolean));
      nextPageId = resData[2] || null;
    } while (nextPageId);

    const totalCount = mediaKeys.length;
    if (totalCount === 0) return { count: 0, size: 0 };

    let totalSize = 0;
    const batchSize = 100;
    for (let i = 0; i < mediaKeys.length; i += batchSize) {
      if (onProgress) {
        onProgress(i, totalCount);
      }
      const batchKeys = mediaKeys.slice(i, i + batchSize);
      
      const keysPayload = batchKeys.map(k => [k]);
      const emptyArray = Array(24).fill(null);
      const extraEmptyArray = Array(10).fill(null);
      const secondPart = [...emptyArray, [], ...extraEmptyArray, []];
      
      const batchRes = await sendRpc('EWgK9e', [[[keysPayload], [secondPart]]]);
      const itemsData = batchRes && batchRes[0] ? batchRes[0][1] : [];
      for (const itemData of itemsData) {
        if (itemData && itemData[1]) {
          const size = itemData[1][9] || 0; // Index 9 is the file size in bytes
          totalSize += size;
        }
      }
    }
    
    return { count: totalCount, size: totalSize };
  }

  function getTile(el) {
    if (!el) return null;
    if (el.classList?.contains('RY3tic')) return el;
    return el.closest('.RY3tic') || el.parentElement?.querySelector('.RY3tic');
  }

  function extractMediaKey(el) {
    if (!el) return null;
    const a = el.closest('a[href*="/photo/"]') || el.parentElement?.querySelector('a[href*="/photo/"]');
    const m = a?.getAttribute('href')?.match(/\/photo\/([A-Za-z0-9_\-]+)/);
    if (m) return m[1];
    const bg = el.style?.backgroundImage || '';
    const n = bg.match(/(AF1Qip|AP1Gcz)[A-Za-z0-9_\-]+/);
    return n ? n[0] : null;
  }

  /* =============================================================
   *  3. CSS INJECTION
   * ============================================================= */
  const style = document.createElement('style');
  style.textContent = `
    /* Unified Premium Hover Card */
    .gp-hover-card {
      position: absolute;
      left: 6px;
      right: 6px;
      bottom: 6px;
      background: rgba(20, 20, 20, 0.85);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      padding: 6px 8px;
      color: #ffffff;
      font-size: 11px;
      font-family: "Google Sans", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      gap: 4px;
      z-index: 100000;
      pointer-events: auto;
      opacity: 0;
      transform: translateY(6px);
      transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    }
    .gp-hover-card--show {
      opacity: 1;
      transform: translateY(0);
    }
    .gp-hover-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 6px;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .gp-hover-row:hover {
      background: rgba(255, 255, 255, 0.1);
    }
    .gp-hover-row .gp-icon {
      font-size: 12px;
      flex-shrink: 0;
      display: inline-block;
      width: 14px;
      text-align: center;
    }
    .gp-hover-row .gp-text {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .gp-albums-row {
      cursor: default;
    }
    .gp-albums-row:hover {
      background: none;
    }
    .gp-albums-list {
      white-space: normal;
      word-break: break-word;
      max-height: 48px;
      overflow-y: auto;
    }
    .gp-albums-list::-webkit-scrollbar {
      width: 4px;
    }
    .gp-albums-list::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 2px;
    }

    /* Un-albumed Highlight */
    .gp-not-in-album::after { content: ''; position: absolute; inset: 0; box-shadow: inset 0 0 0 4px rgba(239, 68, 68, 0.85); pointer-events: none; z-index: 50; border-radius: inherit; }
  `;
  document.head.appendChild(style);

  /* =============================================================
   *  4. EASY ALBUM ADDER
   * ============================================================= */
  const toast = (msg, { duration = 1800 } = {}) => {
    let el = document.getElementById('gp-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gp-toast';
      el.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:999999;background:rgba(30,30,30,.92);color:#fff;padding:8px 14px;border-radius:8px;font:13px/1.4 system-ui;box-shadow:0 4px 14px rgba(0,0,0,.4);pointer-events:none;transition:opacity .25s ease;';
      document.body.appendChild(el);
    }
    el.textContent = msg; el.style.opacity = '1';
    clearTimeout(el._t); el._t = setTimeout(() => (el.style.opacity = '0'), duration);
  };

  const busyTexts = [/Adding/i, /Deleting album/i, /Album deleted/i, /Waiting for Photos/i, /\d+\s+(?:item|items)\s+(?:added to album|already in album|new item added)/i];
  function isBusy() {
    return qsa('aside.zyTWof-Ng57nc,[aria-live],[role="status"]').some(el => {
      if (!visible(el)) return false;
      const text = (el.textContent || '').trim();
      return text && busyTexts.some((r) => r.test(text));
    });
  }

  async function closeBanners() {
    let closed = 0;
    qsa('.zyTWof-gIZMF').forEach(msgDiv => {
      const banner = msgDiv.closest('aside.zyTWof-Ng57nc');
      if (!banner || !visible(banner)) return;
      const closeBtn = banner.querySelector('button[aria-label="Close"].zyTWof-TolmDb');
      if (closeBtn && visible(closeBtn)) {
        ['pointerdown', 'mouseup', 'click'].forEach(t => closeBtn.dispatchEvent(new MouseEvent(t, { bubbles: true, composed: true, cancelable: true })));
        closed++;
      }
    });
    qsa('button[aria-label="Close"],button[aria-label="Dismiss"]').forEach(btn => { if (visible(btn)) { btn.click(); closed++; } });
    if (closed) { log(`Closed ${closed} banner(s)`); await sleep(300); }
  }

  const getSel = () => qsa('div[role="checkbox"][aria-checked="true"].QcpS9c');
  const getAll = () => qsa('div[role="checkbox"].QcpS9c');
  const checkboxKey = cb => {
    const parent = cb.closest('[data-id]');
    return (cb.getAttribute('aria-label') || '') + (parent ? `-${parent.getAttribute('data-id')}` : '');
  };
  const saveSel = () => localStorage.setItem('gp_last_selection_ids', JSON.stringify(getSel().map(checkboxKey)));
  const loadSel = () => JSON.parse(localStorage.getItem('gp_last_selection_ids') || '[]');
  const isInViewer = () => qsa('button[aria-label="Open info"],button[aria-label="Info"]').some(b => b.offsetParent);
  const isAddModal = () => qsa('div[jsshadow],div[role="dialog"]').some(d => /Search albums/i.test(d.textContent || ''));
  const findVisible = arr => arr.find(e => e && visible(e));

  async function addInViewer() {
    const more = findVisible(qsa('button[aria-label="More options"]'));
    if (!more) throw Error('More options not found');
    ['pointerdown', 'mouseup', 'click'].forEach(t => more.dispatchEvent(new MouseEvent(t, { bubbles: true, composed: true, cancelable: true })));
    let item = null;
    for (let i = 0; i < 10; i++) { await sleep(60); item = qsa('[role="menuitem"]').find(e => /Add to album/i.test(e.textContent || '')); if (item) break; }
    if (!item) throw Error('"Add to album" not found');
    ['pointerdown', 'mouseup', 'click'].forEach(t => item.dispatchEvent(new MouseEvent(t, { bubbles: true, composed: true, cancelable: true })));
    for (let i = 0; i < 12; i++) { await sleep(60); if (isAddModal()) break; }
    findVisible(qsa('input[placeholder="Search albums"]'))?.focus({ preventScroll: true });
  }

  async function addInGrid() {
    if (getSel().length < 1) throw Error('No photos selected');
    const btn = findVisible(qsa('button[aria-label="Create or add to album"]'));
    if (!btn) throw Error('Button not found');
    ['pointerdown', 'mouseup', 'click'].forEach(t => btn.dispatchEvent(new MouseEvent(t, { bubbles: true, composed: true, cancelable: true })));
    let albumOpt = null;
    for (let i = 0; i < 12; i++) { await sleep(60); albumOpt = qsa('[role="menuitem"],[role="option"]').find(e => /Album/i.test(e.textContent || '')); if (albumOpt) break; }
    if (!albumOpt) throw Error('"Album" entry not found');
    ['pointerdown', 'mouseup', 'click'].forEach(t => albumOpt.dispatchEvent(new MouseEvent(t, { bubbles: true, composed: true, cancelable: true })));
    for (let i = 0; i < 12; i++) { await sleep(60); if (isAddModal()) break; }
    findVisible(qsa('input[placeholder="Search albums"]'))?.focus({ preventScroll: true });
  }

  async function addAlbum() {
    await closeBanners();
    if (isBusy()) {
      toast('Waiting for Photos to finish...');
      for (let i = 0; i < 15; i++) { await sleep(200); if (!isBusy()) break; }
    }
    if (isBusy()) return toast('Photos is still busy');
    if (isInViewer()) await addInViewer(); else await addInGrid();
  }

  window.addEventListener('keydown', async (e) => {
    if (e.target.matches('input,textarea') || e.target.isContentEditable || isAddModal()) return;
    const match = hk => e.key?.toLowerCase() === hk.key && !!e.shiftKey === !!hk.shift && !!e.altKey === !!hk.alt && !!e.ctrlKey === !!hk.ctrl && !!e.metaKey === !!hk.meta;
    if (match(HOTKEY_ADD)) {
      e.preventDefault();
      try { await addAlbum(); saveSel(); } catch (err) { toast(err?.message || 'Could not open Add to album'); }
    }
    if (match(HOTKEY_RECALL)) {
      e.preventDefault();
      const ids = loadSel();
      if (!ids.length) return toast('No saved selection');
      let matched = 0;
      for (const cb of getAll()) {
        if (ids.includes(checkboxKey(cb))) {
          ['pointerdown', 'mouseup', 'click'].forEach(t => cb.dispatchEvent(new MouseEvent(t, { bubbles: true, composed: true, cancelable: true })));
          matched++;
        }
      }
      toast(`Re-selected ${matched}/${ids.length}`);
    }
  });
  document.addEventListener('click', (e) => { if (e.target.closest('div[role="checkbox"].QcpS9c')) setTimeout(saveSel, 60); }, true);

  /* =============================================================
   *  5. BACKGROUND PREFETCHING (Albums & Filenames)
   * ============================================================= */
  const albumPrefetchQueue = new Set();
  let activeAlbumPrefetches = 0;

  const filenamePrefetchQueue = new Set();
  let filenamePrefetchTimer = null;

  const activeSharedRequests = new Map();

  function updateTileVisuals(key, albumCount) {
    if (!HIGHLIGHT_UNALBUMED || !key) return;
    qsa(`.RY3tic[data-gp-media-key="${key}"]`).forEach(tile => {
      if (albumCount === 0) tile.classList.add('gp-not-in-album');
      else tile.classList.remove('gp-not-in-album');
    });
  }

  async function fetchDownloadUrl(key) {
    const cachedFn = filenameCache.get(key);
    if (cachedFn && cachedFn.downloadUrl) return cachedFn.downloadUrl;

    const pathParts = window.location.pathname.split('/');
    const shareIndex = pathParts.indexOf('share');
    const albumIndex = pathParts.indexOf('album');
    const directIndex = pathParts.indexOf('direct');
    let albumMediaKey = null;
    if (shareIndex !== -1 && shareIndex + 1 < pathParts.length) {
        albumMediaKey = pathParts[shareIndex + 1];
    } else if (albumIndex !== -1 && albumIndex + 1 < pathParts.length) {
        albumMediaKey = pathParts[albumIndex + 1];
    } else if (directIndex !== -1 && directIndex + 1 < pathParts.length) {
        albumMediaKey = pathParts[directIndex + 1];
    }
    const urlParams = new URLSearchParams(window.location.search);
    const authKey = urlParams.get('key');

    try {
      const itemDetails = await sendRpc('VrseUb', [key, null, authKey, null, albumMediaKey]);
      const downloadUrl = itemDetails ? (itemDetails[7] || itemDetails[1]) : null;
      if (downloadUrl) {
        const current = filenameCache.get(key) || { filename: '(unknown)', size: null };
        filenameCache.set(key, { ...current, downloadUrl });
      }
      return downloadUrl;
    } catch (e) {
      console.warn('[GP-Master] Failed to fetch download url for', key, e);
      return null;
    }
  }

  async function fetchSharedExtInfo(key) {
    log(`fetchSharedExtInfo initiated for: ${key}`);
    if (!hasApi || !key) return { names: [], filename: '(unknown)', size: null };
    if (activeSharedRequests.has(key)) return activeSharedRequests.get(key);

    const req = (async () => {
      try {
        const info = await unsafeWindow.gptkApi.getItemInfoExt(key);
        const fn = info?.fileName || info?.filename || info?.originalFilename || '(unknown)';
        const sz = info?.size || info?.fileSize || info?.sizeBytes || info?.bytes || info?.spaceTaken || info?.space_taken || null;
        filenameCache.set(key, { filename: fn, size: sz });

        const albums = info?.albums || info?.albumInfos || info?.collections || info?.containers || [];
        const names = Array.isArray(albums) ? albums.map(a => a?.title || a?.name || a?.displayName || '').filter(Boolean) : [];
        albumCache.set(key, { names, time: Date.now() });

        updateTileVisuals(key, names.length);

        log(`fetchSharedExtInfo SUCCESS [${key}] - file: "${fn}", size: ${sz}, albums: ${names.length}`);
        return { names, filename: fn, size: sz };
      } catch (e) {
        console.warn('[GP-Master] Shared fetch failed', e);
        if (!filenameCache.has(key)) filenameCache.set(key, { filename: '(unknown)', size: null });
        if (!albumCache.has(key)) albumCache.set(key, { names: [], time: Date.now() });
        return { names: [], filename: '(unknown)', size: null };
      } finally {
        activeSharedRequests.delete(key);
      }
    })();
    activeSharedRequests.set(key, req);
    return req;
  }

  async function processAlbumPrefetchQueue() {
    if (activeAlbumPrefetches >= 4) return;
    while (albumPrefetchQueue.size > 0 && activeAlbumPrefetches < 4) {
      const key = albumPrefetchQueue.values().next().value;
      albumPrefetchQueue.delete(key);
      const cachedAlb = albumCache.get(key);
      if (!cachedAlb || Date.now() - cachedAlb.time > CACHE_TTL) {
        activeAlbumPrefetches++;
        log(`Prefetching album info for: ${key}`);
        fetchSharedExtInfo(key).finally(() => {
          activeAlbumPrefetches--;
          processAlbumPrefetchQueue();
        });
        await sleep(40);
      }
    }
  }

  function queueFilenameForPrefetch(key) {
    if (!key || filenameCache.has(key)) return;
    filenamePrefetchQueue.add(key);
    if (filenamePrefetchTimer) clearTimeout(filenamePrefetchTimer);
    filenamePrefetchTimer = setTimeout(flushFilenamePrefetchQueue, 150);
  }

  async function flushFilenamePrefetchQueue() {
    if (filenamePrefetchQueue.size === 0 || !hasApi) return;
    const keysToFetch = Array.from(filenamePrefetchQueue);
    filenamePrefetchQueue.clear();
    log(`Flushing bulk filename prefetch for ${keysToFetch.length} items`);
    try {
      const results = await unsafeWindow.gptkApi.getBatchMediaInfo(keysToFetch);
      if (Array.isArray(results)) {
        results.forEach(info => {
          if (info && info.mediaKey) {
            const sz = info.size || info.fileSize || info.sizeBytes || info.bytes || info.spaceTaken || info.space_taken || null;
            filenameCache.set(info.mediaKey, {
              filename: info.fileName || info.filename || info.originalFilename || '(unknown)',
              size: sz
            });
          }
        });
      }
      keysToFetch.forEach(k => { if (!filenameCache.has(k)) filenameCache.set(k, { filename: '(unknown)', size: null }); });
    } catch (e) { console.warn('[GP-Master] Bulk fetch failed', e); }
  }

  const visibleObserver = new IntersectionObserver((entries) => {
    if (!hasApi) return;
    entries.forEach(entry => {
      const key = extractMediaKey(entry.target);
      if (!key) return;
      if (entry.isIntersecting) {
        const cachedAlb = albumCache.get(key);
        if (!cachedAlb || Date.now() - cachedAlb.time > CACHE_TTL) {
          albumPrefetchQueue.add(key); processAlbumPrefetchQueue();
        } else {
          updateTileVisuals(key, cachedAlb.names.length);
        }
        if (!filenameCache.has(key)) queueFilenameForPrefetch(key);
      } else {
        albumPrefetchQueue.delete(key);
      }
    });
  }, { rootMargin: '500px' });

  /* =============================================================
   *  6. HOVER UI
   * ============================================================= */
  async function showHoverUI(tile, e) {
    try {
      if (!hasApi) {
        log('Hover ignored: GPTK API has not loaded yet.');
        return;
      }
      if (!tile) return;

      const key = extractMediaKey(tile);
      if (!key) {
        log('Hover ignored: Could not extract media key from tile.');
        return;
      }

      log(`Hover triggered for: ${key}`);

      // Start prefetching download URL immediately on hover
      let downloadUrlPromise = fetchDownloadUrl(key);

      // Card Setup
      let hoverCard = tile.querySelector('.gp-hover-card');
      if (!hoverCard) {
        hoverCard = document.createElement('div');
        hoverCard.className = 'gp-hover-card';
        
        // 1. Filename row
        const fnRow = document.createElement('div');
        fnRow.className = 'gp-hover-row gp-filename-row';
        const fnIcon = document.createElement('span');
        fnIcon.className = 'gp-icon';
        fnIcon.textContent = '📄';
        const fnText = document.createElement('span');
        fnText.className = 'gp-text';
        fnText.textContent = 'Loading filename...';
        fnRow.appendChild(fnIcon);
        fnRow.appendChild(fnText);
        
        // 2. Download link row
        const dlRow = document.createElement('div');
        dlRow.className = 'gp-hover-row gp-download-row';
        const dlIcon = document.createElement('span');
        dlIcon.className = 'gp-icon';
        dlIcon.textContent = '🔗';
        const dlText = document.createElement('span');
        dlText.className = 'gp-text';
        dlText.textContent = 'Copy Download Link';
        dlRow.appendChild(dlIcon);
        dlRow.appendChild(dlText);
        
        // 3. Albums row
        const albRow = document.createElement('div');
        albRow.className = 'gp-hover-row gp-albums-row';
        const albIcon = document.createElement('span');
        albIcon.className = 'gp-icon';
        albIcon.textContent = '📁';
        const albList = document.createElement('span');
        albList.className = 'gp-text gp-albums-list';
        albList.textContent = 'Checking albums...';
        albRow.appendChild(albIcon);
        albRow.appendChild(albList);
        
        hoverCard.appendChild(fnRow);
        hoverCard.appendChild(dlRow);
        hoverCard.appendChild(albRow);
        
        tile.appendChild(hoverCard);
      }

      const fnText = hoverCard.querySelector('.gp-filename-row .gp-text');
      const dlText = hoverCard.querySelector('.gp-download-row .gp-text');
      const albList = hoverCard.querySelector('.gp-albums-list');

      // Add fade in
      setTimeout(() => hoverCard.classList.add('gp-hover-card--show'), 10);

      // Check Cache
      const cachedAlb = albumCache.get(key);
      const hasAlb = cachedAlb && (Date.now() - cachedAlb.time < CACHE_TTL);
      const hasFn = filenameCache.has(key);

      let names = hasAlb ? cachedAlb.names : [];
      let cachedFn = hasFn ? filenameCache.get(key) : { filename: '(unknown)', size: null };
      let filename = cachedFn.filename;
      let size = cachedFn.size;

      // Resolve Missing Data
      const rect = tile.getBoundingClientRect();
      const localX = e?.clientX - rect.left;
      const localY = e?.clientY - rect.top;
      const isCheckboxArea = localX < 40 && localY < 40;

      if (!isCheckboxArea && !hasAlb) {
        const res = await fetchSharedExtInfo(key);
        names = res.names;
        filename = res.filename;
        size = res.size;
      } else if (!hasFn) {
        const res = await fetchSharedExtInfo(key);
        filename = res.filename;
        size = res.size;
      }

      const sizeText = size ? ` (${formatBytes(size)})` : '';
      fnText.textContent = filename + sizeText;

      // Click to copy filename
      const fnRow = hoverCard.querySelector('.gp-filename-row');
      fnRow.onclick = (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        navigator.clipboard.writeText(filename);
        fnText.textContent = 'Copied filename!';
        fnText.style.color = '#10b981'; // Green
        setTimeout(() => {
          fnText.textContent = filename + sizeText;
          fnText.style.color = '#fff';
        }, 1200);
      };

      // Click to copy download link
      const dlRow = hoverCard.querySelector('.gp-download-row');
      dlRow.onclick = async (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        
        dlText.textContent = 'Fetching download link...';
        const dUrl = await downloadUrlPromise;
        if (dUrl) {
          navigator.clipboard.writeText(dUrl).then(() => {
            dlText.textContent = 'Copied link!';
            dlText.style.color = '#10b981'; // Green
            setTimeout(() => {
              dlText.textContent = 'Copy Download Link';
              dlText.style.color = '#fff';
            }, 1200);
          });
        } else {
          dlText.textContent = 'Failed to get link';
          dlText.style.color = '#ef4444'; // Red
          setTimeout(() => {
            dlText.textContent = 'Copy Download Link';
            dlText.style.color = '#fff';
          }, 1200);
        }
      };

      // Populate album list
      if (!isCheckboxArea) {
        if (!names.length) {
          albList.textContent = '(not in any albums)';
          albList.style.color = '#ff8a80'; // Dimmed red
        } else {
          albList.textContent = names.join(', ');
          albList.style.color = '#fff';
        }
      }
    } catch (err) {
      log('Error during showHoverUI:', err);
    }
  }

  function hideHoverUI(tile) {
    if (!tile) return;
    const hoverCard = tile.querySelector('.gp-hover-card');
    if (hoverCard) {
      hoverCard.classList.remove('gp-hover-card--show');
      setTimeout(() => {
        if (hoverCard.parentNode && !tile.matches(':hover')) {
          hoverCard.parentNode.removeChild(hoverCard);
        }
      }, 200);
    }
  }

  /* =============================================================
   *  6b. ALBUM LISTING HOVER UI (Total size info on Album Cards)
   * ============================================================= */
  function extractAlbumKey(el) {
    if (!el) return null;
    const a = el.closest('a[href*="/album/"], a[href*="/share/"], a[href*="/direct/"]');
    if (!a) return null;
    const href = a.getAttribute('href') || '';
    const m = href.match(/\/(album|share|direct)\/([A-Za-z0-9_\-]+)/);
    return m ? m[2] : null;
  }

  async function handleAlbumMouseEnter(e) {
    const card = e.currentTarget;
    const key = extractAlbumKey(card);
    if (!key) return;

    if (window.getComputedStyle(card).position === 'static') {
        card.style.position = 'relative';
    }

    let overlay = card.querySelector('.gpd-album-hover-details');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'gpd-album-hover-details';
        Object.assign(overlay.style, {
            position: 'absolute',
            top: '8px',
            right: '8px',
            zIndex: '99999',
            background: 'rgba(20, 20, 20, 0.9)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '12px',
            padding: '4px 8px',
            color: '#ffffff',
            fontSize: '11px',
            fontFamily: '"Google Sans", Roboto, sans-serif',
            fontWeight: '500',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
            transition: 'opacity 0.15s ease, transform 0.15s ease',
            opacity: '0',
            transform: 'translateY(-4px)'
        });
        card.appendChild(overlay);
    }

    setTimeout(() => {
        overlay.style.opacity = '1';
        overlay.style.transform = 'translateY(0)';
    }, 10);

    const cached = albumDetailsCache.get(key);
    if (cached) {
        if (cached.isLoading) {
            overlay.textContent = `📊 Loading...`;
        } else {
            overlay.textContent = `📊 ${cached.count} items | ${formatBytes(cached.size)}`;
        }
        return;
    }

    overlay.textContent = `📊 Loading...`;
    albumDetailsCache.set(key, { count: 0, size: 0, isLoading: true });

    try {
        const details = await fetchAlbumDetails(key, (fetched, total) => {
            if (card.matches(':hover')) {
                overlay.textContent = `📊 Loading... (${fetched}/${total})`;
            }
        });
        albumDetailsCache.set(key, { count: details.count, size: details.size, isLoading: false });
        if (card.matches(':hover')) {
            overlay.textContent = `📊 ${details.count} items | ${formatBytes(details.size)}`;
        }
    } catch (err) {
        console.error('Failed to load album details:', err);
        overlay.textContent = `📊 Error loading`;
        albumDetailsCache.delete(key);
    }
  }

  function handleAlbumMouseLeave(e) {
    const card = e.currentTarget;
    const overlay = card.querySelector('.gpd-album-hover-details');
    if (overlay) {
        overlay.style.opacity = '0';
        overlay.style.transform = 'translateY(-4px)';
        setTimeout(() => {
            if (overlay.parentNode && overlay.style.opacity === '0') {
                overlay.parentNode.removeChild(overlay);
            }
        }, 160);
    }
  }

  function attachAlbumCardListeners() {
    document.querySelectorAll('a[href*="/album/"], a[href*="/share/"]').forEach(card => {
      if (card.hasAttribute('data-gpd-album-attached')) return;
      card.setAttribute('data-gpd-album-attached', '1');
      card.addEventListener('mouseenter', handleAlbumMouseEnter);
      card.addEventListener('mouseleave', handleAlbumMouseLeave);
    });
  }

  /* =============================================================
   *  6c. ALBUM DETAIL PAGE VIEW METADATA BADGE
   * ============================================================= */
  let currentAlbumKey = null;
  let lastBadgeContainer = null;

  async function checkAlbumPageAndAddBadge() {
    const pathParts = window.location.pathname.split('/');
    const shareIndex = pathParts.indexOf('share');
    const albumIndex = pathParts.indexOf('album');
    const directIndex = pathParts.indexOf('direct');
    let albumMediaKey = null;
    if (shareIndex !== -1 && shareIndex + 1 < pathParts.length) {
        albumMediaKey = pathParts[shareIndex + 1];
    } else if (albumIndex !== -1 && albumIndex + 1 < pathParts.length) {
        albumMediaKey = pathParts[albumIndex + 1];
    } else if (directIndex !== -1 && directIndex + 1 < pathParts.length) {
        albumMediaKey = pathParts[directIndex + 1];
    }

    if (!albumMediaKey) {
      currentAlbumKey = null;
      if (lastBadgeContainer) {
        lastBadgeContainer.remove();
        lastBadgeContainer = null;
      }
      return;
    }

    if (currentAlbumKey === albumMediaKey) {
      const existing = document.getElementById('gp-album-meta-badge');
      if (!existing) {
        renderAlbumHeaderBadge(albumMediaKey);
      }
      return;
    }

    currentAlbumKey = albumMediaKey;
    renderAlbumHeaderBadge(albumMediaKey);
  }

  async function renderAlbumHeaderBadge(key) {
    if (lastBadgeContainer) {
      lastBadgeContainer.remove();
      lastBadgeContainer = null;
    }

    const h1 = document.querySelector('h1');
    if (!h1) return; // Header not loaded yet

    const badge = document.createElement('span');
    badge.id = 'gp-album-meta-badge';
    badge.className = 'gp-album-meta-badge';
    badge.textContent = '📊 Loading size...';
    
    Object.assign(badge.style, {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      marginLeft: '16px',
      padding: '4px 12px',
      background: 'rgba(128,128,128,0.15)',
      border: '1px solid rgba(128,128,128,0.2)',
      borderRadius: '16px',
      color: '#e8eaed',
      fontSize: '12px',
      fontFamily: '"Google Sans", Roboto, sans-serif',
      fontWeight: '500',
      verticalAlign: 'middle',
      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      transition: 'opacity 0.2s ease'
    });

    h1.parentElement.appendChild(badge);
    lastBadgeContainer = badge;

    const cached = albumDetailsCache.get(key);
    if (cached && !cached.isLoading) {
      badge.textContent = `📊 ${cached.count} items | ${formatBytes(cached.size)}`;
      return;
    }

    try {
      albumDetailsCache.set(key, { count: 0, size: 0, isLoading: true });
      const details = await fetchAlbumDetails(key);
      albumDetailsCache.set(key, { count: details.count, size: details.size, isLoading: false });
      badge.textContent = `📊 ${details.count} items | ${formatBytes(details.size)}`;
    } catch (err) {
      console.error('[GP-Master] Failed to load album details in album view:', err);
      badge.textContent = '📊 Error loading size';
      albumDetailsCache.delete(key);
    }
  }

  /* =============================================================
   *  7. UNIFIED DOM SCANNING
   * ============================================================= */
  function attachTile(tile) {
    if (!tile || tile.hasAttribute('data-gp-master-attached')) return;
    tile.setAttribute('data-gp-master-attached', '1');

    const key = extractMediaKey(tile);
    if (key) {
      tile.setAttribute('data-gp-media-key', key);
      const cachedAlb = albumCache.get(key);
      if (cachedAlb && (Date.now() - cachedAlb.time < CACHE_TTL)) updateTileVisuals(key, cachedAlb.names.length);
    }

    tile.addEventListener('mouseenter', e => showHoverUI(tile, e));
    tile.addEventListener('mouseleave', () => hideHoverUI(tile));
    visibleObserver.observe(tile);
  }

  function attachCheckbox(cb) {
    if (!cb || cb.hasAttribute('data-gp-master-cb-attached')) return;
    cb.setAttribute('data-gp-master-cb-attached', '1');
    cb.addEventListener('mouseenter', e => showHoverUI(getTile(cb), e));
    cb.addEventListener('mouseleave', () => hideHoverUI(getTile(cb)));
  }

  function scan() {
    document.querySelectorAll('.RY3tic').forEach(tile => {
      if (!tile.hasAttribute('data-gp-master-attached')) {
        attachTile(tile);
      } else {
        // Handle recycled DOM tiles from Google Photos virtual scrolling
        const currentKey = extractMediaKey(tile);
        const oldKey = tile.getAttribute('data-gp-media-key');
        if (currentKey && currentKey !== oldKey) {
          tile.setAttribute('data-gp-media-key', currentKey);
          tile.classList.remove('gp-not-in-album');
          const cachedAlb = albumCache.get(currentKey);
          if (cachedAlb && (Date.now() - cachedAlb.time < CACHE_TTL)) {
            updateTileVisuals(currentKey, cachedAlb.names.length);
          } else {
            visibleObserver.unobserve(tile);
            visibleObserver.observe(tile);
          }
        }
      }
    });
    document.querySelectorAll('.QcpS9c.ckGgle:not([data-gp-master-cb-attached])').forEach(attachCheckbox);
    attachAlbumCardListeners(); // Attach listeners to album cards
    checkAlbumPageAndAddBadge(); // Check and render size badge in album details page
  }

  let scanTimer = null;
  function debouncedScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(() => { scan(); scanTimer = null; }, 150);
  }

  new MutationObserver(debouncedScan).observe(document.body, { childList: true, subtree: true });
  setInterval(scan, 1500);
  scan(); // initial attach

  /* =============================================================
   *  8. INIT & GPTK DETECTION
   * ============================================================= */
  let cacheClearTimer = null;
  const triggerCacheClear = () => {
    log('Album update detected! Clearing cache...');
    albumCache.clear();
    qsa('.gp-not-in-album').forEach(el => el.classList.remove('gp-not-in-album'));
    qsa('.RY3tic[data-gp-master-attached]').forEach(tile => {
      visibleObserver.unobserve(tile);
      visibleObserver.observe(tile);
    });

    if (cacheClearTimer) clearTimeout(cacheClearTimer);
    // Google's backend has a 1-2s delay. Clear again shortly after to ensure consistency.
    cacheClearTimer = setTimeout(() => {
      log('Secondary cache clear to handle Google backend delay.');
      albumCache.clear();

      qsa('.gp-not-in-album').forEach(el => el.classList.remove('gp-not-in-album'));
      qsa('.RY3tic[data-gp-master-attached]').forEach(tile => {
        visibleObserver.unobserve(tile);
        visibleObserver.observe(tile);
      });
    }, 2500);
  };

  const bannerObserver = new MutationObserver(mutations => {
    for (const m of mutations) {
      if (m.type === 'characterData' && /added to album|already in album/i.test(m.target.textContent || '')) {
        triggerCacheClear();
        return;
      }
      for (const node of m.addedNodes) {
        if (/added to album|already in album/i.test(node.textContent || '')) {
          triggerCacheClear();
          return;
        }
      }
    }
  });
  bannerObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

  let tries = 0;
  log('Waiting for GPTK API to load...');
  while (!unsafeWindow.gptkApi && tries < 40) {
    await sleep(300);
    tries++;
  }
  hasApi = !!unsafeWindow.gptkApi;
  if (hasApi) {
    log('GPTK API detected successfully. Hover overlays are now active.');
    document.querySelectorAll('.RY3tic[data-gp-master-attached]').forEach(tile => {
      visibleObserver.unobserve(tile);
      visibleObserver.observe(tile);
    });
    scan(); // Rescan to immediately trigger prefetch for visible items
  } else {
    console.warn('[GP-Master] GPTK API not found. Album and Filename overlays disabled.');
  }
})();

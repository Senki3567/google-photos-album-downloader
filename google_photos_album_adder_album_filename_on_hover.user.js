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
  const CACHE_TTL = 600000;

  /* =============================================================
   *  2. SHARED STATE & HELPERS
   * ============================================================= */
  let hasApi = false;
  let lastThemeCheck = 0;
  // Resolve and update theme classes dynamically based on body text color
  function updateThemeClass() {
    const now = Date.now();
    if (now - lastThemeCheck < 5000) return; // Only check theme color at most once every 5 seconds
    lastThemeCheck = now;
    try {
      const bodyColor = window.getComputedStyle(document.body).color || '';
      const rgb = bodyColor.match(/\d+/g);
      if (rgb && rgb.length >= 3) {
        const isDark = (parseInt(rgb[0]) > 130 && parseInt(rgb[1]) > 130 && parseInt(rgb[2]) > 130);
        if (isDark) {
          document.body.classList.add('gp-dark-mode');
          document.body.classList.remove('gp-light-mode');
        } else {
          document.body.classList.add('gp-light-mode');
          document.body.classList.remove('gp-dark-mode');
        }
      }
    } catch (e) {
      console.warn('[GP-Theme] Failed to resolve theme color', e);
    }
  }

  const albumCache = new Map();
  const SVG_LINK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>';
  const SVG_CHECK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
  const SVG_DOWNLOAD = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';
  const SVG_ADD_ALBUM = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z"/></svg>';
  const filenameCache = new Map();
  const albumDetailsCache = new Map(); // mediaKey -> { count, size, isLoading }
  let activeHoveredTile = null;
  let activeHoveredAlbumCard = null;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function triggerSingleDownload(downloadUrl) {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = downloadUrl;
    document.body.appendChild(iframe);
    setTimeout(() => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    }, 10000);
  }
  const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
  const visible = el => el && el.offsetParent !== null;
  const log = (...a) => console.log('%c[GP-Master]', 'color: #3b82f6; font-weight: bold;', ...a);

  function formatBytes(bytes) {
    if (!bytes || isNaN(bytes)) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
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
    if (totalCount === 0) return { count: 0, size: 0, items: [] };

    let completedCount = 0;
    const batchPromises = [];
    const batchSize = 100;
    for (let i = 0; i < mediaKeys.length; i += batchSize) {
      const batchKeys = mediaKeys.slice(i, i + batchSize);
      const keysPayload = batchKeys.map(k => [k]);
      const emptyArray = Array(24).fill(null);
      const extraEmptyArray = Array(10).fill(null);
      const secondPart = [...emptyArray, [], ...extraEmptyArray, []];
      
      const p = sendRpc('EWgK9e', [[[keysPayload], [secondPart]]]).then(batchRes => {
        const batchItems = [];
        let batchTotalSize = 0;
        const itemsData = batchRes && batchRes[0] ? batchRes[0][1] : [];
        for (const itemData of itemsData) {
          if (itemData && itemData[1]) {
            const filename = itemData[1][3] || '(unknown)';
            const size = itemData[1][9] || 0; // Index 9 is the file size in bytes
            batchTotalSize += size;
            batchItems.push({ filename, size });
          }
        }
        completedCount += batchKeys.length;
        if (onProgress) {
          onProgress(completedCount, totalCount);
        }
        return { items: batchItems, size: batchTotalSize, index: i };
      }).catch(err => {
        console.error('Failed to fetch batch starting at ' + i, err);
        completedCount += batchKeys.length;
        if (onProgress) {
          onProgress(completedCount, totalCount);
        }
        return { items: [], size: 0, index: i };
      });
      batchPromises.push(p);
    }

    const results = await Promise.all(batchPromises);
    results.sort((a, b) => a.index - b.index);

    let totalSize = 0;
    const items = [];
    for (const res of results) {
      items.push(...res.items);
      totalSize += res.size;
    }
    
    return { count: totalCount, size: totalSize, items };
  }

  function getTile(el) {
    if (!el) return null;
    if (el.classList?.contains('RY3tic')) return el;
    return el.closest('.RY3tic') || el.parentElement?.querySelector('.RY3tic');
  }

  function extractMediaKey(el) {
    if (!el) return null;
    
    let a = el._gpLinkEl;
    if (!a || !el.contains(a)) {
      a = el.querySelector('a[href*="/photo/"]') || el.closest('a[href*="/photo/"]') || el.parentElement?.querySelector('a[href*="/photo/"]') || null;
      if (a) el._gpLinkEl = a;
    }
    
    if (a) {
      const href = a.getAttribute('href') || '';
      if (el._gpLastHref === href) {
        return el._gpLastKey;
      }
      const m = href.match(/\/photo\/([A-Za-z0-9_\-]+)/);
      if (m) {
        el._gpLastHref = href;
        el._gpLastKey = m[1];
        return m[1];
      }
    }
    
    const bg = el.style?.backgroundImage || '';
    if (bg) {
      if (el._gpLastBg === bg) {
        return el._gpLastBgKey;
      }
      const n = bg.match(/(AF1Qip|AP1Gcz)[A-Za-z0-9_\-]+/);
      if (n) {
        el._gpLastBg = bg;
        el._gpLastBgKey = n[0];
        return n[0];
      }
    }
    
    return null;
  }

  /* =============================================================
   *  3. CSS INJECTION
   * ============================================================= */
  const style = document.createElement('style');
  style.textContent = `

    /* Theme Variables for light/dark compatibility */
    body {
      --gp-card-bg: rgba(255, 255, 255, 0.92);
      --gp-card-text: #1f1f1f;
      --gp-card-border: rgba(0, 0, 0, 0.12);
      --gp-row-hover: rgba(0, 0, 0, 0.06);
      --gp-text-dim: #c53929;
      --gp-link-color: #0b57d0;
      --gp-link-hover: #1557b0;
    }
    
    body.gp-dark-mode {
      --gp-card-bg: rgba(30, 30, 30, 0.85) !important;
      --gp-card-text: #ffffff !important;
      --gp-card-border: rgba(255, 255, 255, 0.12) !important;
      --gp-row-hover: rgba(255, 255, 255, 0.1) !important;
      --gp-text-dim: #ff8a80 !important;
      --gp-link-color: #8ab4f8 !important;
      --gp-link-hover: #aecbfa !important;
    }
    
    body.gp-light-mode {
      --gp-card-bg: rgba(255, 255, 255, 0.92) !important;
      --gp-card-text: #1f1f1f !important;
      --gp-card-border: rgba(0, 0, 0, 0.12) !important;
      --gp-row-hover: rgba(0, 0, 0, 0.06) !important;
      --gp-text-dim: #c53929 !important;
      --gp-link-color: #0b57d0 !important;
      --gp-link-hover: #1557b0 !important;
    }

    /* Unified Premium Hover Card */
    .gp-hover-card {
      position: absolute;
      left: 6px;
      right: 6px;
      bottom: 6px;
      background: var(--gp-card-bg);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid var(--gp-card-border);
      border-radius: 8px;
      padding: 6px 8px;
      color: var(--gp-card-text);
      font-size: 11px;
      font-family: "Google Sans", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      gap: 4px;
      pointer-events: auto;
      z-index: 10;
      opacity: 0;
      transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }
    .gp-hover-card--show {
      opacity: 1;
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
      background: var(--gp-row-hover);
    }
    
    .gp-hover-row .gp-text {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .gp-albums-row--empty:hover {
      background: none !important;
    }

    /* Clickable Album Links */
    .gp-album-link {
      color: #8ab4f8;
      text-decoration: underline;
      margin-right: 8px;
      display: inline-block;
      cursor: pointer;
      transition: color 0.15s ease;
    }
    .gp-album-link:hover {
      color: #aecbfa;
    }

    /* Un-albumed Highlight */
    .gp-not-in-album::after { content: ''; position: absolute; inset: 0; box-shadow: inset 0 0 0 4px rgba(239, 68, 68, 0.85); pointer-events: none; border-radius: inherit; }

    /* Album Hover scrollable details overlay */
    .gpd-album-hover-details {
      position: absolute;
      top: 56px;
      bottom: 6px;
      left: 6px;
      right: 6px;
      background: var(--gp-card-bg);
      backdrop-filter: blur(10px) saturate(180%);
      -webkit-backdrop-filter: blur(10px) saturate(180%);
      border: 1px solid var(--gp-card-border);
      border-radius: 8px;
      padding: 8px;
      color: var(--gp-card-text);
      font-size: 11px;
      font-family: "Google Sans", Roboto, sans-serif;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      display: flex;
      flex-direction: column;
      z-index: 10;
      opacity: 0;
      transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      box-sizing: border-box;
      pointer-events: auto;
    }
    
    .gpd-album-hover-details--show {
      opacity: 1 !important;
    }

    /* Style for scrollbar in album hover list */
    .gpd-album-hover-list {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .gpd-album-hover-list::-webkit-scrollbar {
      width: 4px;
    }
    .gpd-album-hover-list::-webkit-scrollbar-track {
      background: transparent;
    }
    .gpd-album-hover-list::-webkit-scrollbar-thumb {
      background: var(--gp-card-border);
      border-radius: 2px;
    }

    /* Floating toolbar container positioned above the hover card */
    .gp-toolbar-container {
      position: absolute;
      top: -34px;
      left: 2px;
      right: 2px;
      display: flex;
      justify-content: flex-end;
      gap: 6px;
      z-index: 11;
      opacity: 0;
      transition: opacity 0.2s ease;
      pointer-events: none;
    }
    .gp-hover-card--show .gp-toolbar-container {
      opacity: 1;
    }
    
    /* Toolbar Action Buttons (Glassmorphism circular buttons) */
    .gp-toolbar-btn {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.92); /* Glassmorphism light background */
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(0, 0, 0, 0.12);
      color: #1f1f1f;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
      transition: background 0.15s ease, color 0.15s ease;
      pointer-events: auto;
    }
    .gp-album-access-btn {
      flex: 1;
      border-radius: 14px;
      padding: 0 10px;
      width: auto;
      justify-content: flex-start;
      font-size: 11px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    body.gp-dark-mode .gp-toolbar-btn {
      background: rgba(45, 45, 45, 0.9) !important; /* Glassmorphism dark background */
      border: 1px solid rgba(255, 255, 255, 0.12) !important;
      color: #ffffff;
    }
    .gp-toolbar-btn:hover {
      background: rgba(240, 240, 240, 0.95);
      border-color: rgba(0, 0, 0, 0.2);
    }
    body.gp-dark-mode .gp-toolbar-btn:hover {
      background: rgba(70, 70, 70, 0.95) !important;
      border-color: rgba(255, 255, 255, 0.25) !important;
    }
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
  const isAddModal = () => qsa('div[jsshadow],div[role="dialog"]').some(d => /Search albums|Tìm kiếm album|album/i.test(d.textContent || ''));
  const findVisible = arr => arr.find(e => e && visible(e));

  async function addInViewer() {
    const more = findVisible(qsa('button[aria-label="More options"], button[aria-label="Tùy chọn khác"], button[aria-label*="option" i]'));
    if (!more) throw Error('More options button not found');
    ['pointerdown', 'mouseup', 'click'].forEach(t => more.dispatchEvent(new MouseEvent(t, { bubbles: true, composed: true, cancelable: true })));
    
    let item = null;
    for (let i = 0; i < 20; i++) {
      await sleep(80);
      item = qsa('[role="menuitem"]').find(e => /Add to album|Thêm vào album|album/i.test(e.textContent || ''));
      if (item) break;
    }
    if (!item) throw Error('"Add to album" entry not found');
    
    ['pointerdown', 'mouseup', 'click'].forEach(t => item.dispatchEvent(new MouseEvent(t, { bubbles: true, composed: true, cancelable: true })));
    
    for (let i = 0; i < 20; i++) {
      await sleep(80);
      if (isAddModal()) break;
    }
    findVisible(qsa('input[placeholder="Search albums"], input[placeholder="Tìm kiếm album"], input[placeholder*="album" i]'))?.focus({ preventScroll: true });
  }

  async function addInGrid() {
    // Wait for at least one item to show up in selection
    let selected = getSel();
    for (let i = 0; i < 10; i++) {
      if (selected.length >= 1) break;
      await sleep(50);
      selected = getSel();
    }
    if (selected.length < 1) throw Error('No photos selected');

    // Wait up to 2 seconds for the Add to Album action button to appear
    let btn = null;
    for (let i = 0; i < 20; i++) {
      btn = findVisible(qsa('button[aria-label="Create or add to album"], button[aria-label="Tạo hoặc thêm vào album"], button[aria-label*="album" i]'));
      if (btn) break;
      await sleep(100);
    }
    if (!btn) throw Error('Create or add to album button not found');

    ['pointerdown', 'mouseup', 'click'].forEach(t => btn.dispatchEvent(new MouseEvent(t, { bubbles: true, composed: true, cancelable: true })));
    
    let albumOpt = null;
    for (let i = 0; i < 20; i++) {
      await sleep(80);
      albumOpt = qsa('[role="menuitem"],[role="option"]').find(e => /Album/i.test(e.textContent || '') || /Thêm vào/i.test(e.textContent || ''));
      if (albumOpt) break;
    }
    if (!albumOpt) throw Error('"Album" entry not found in menu');
    
    ['pointerdown', 'mouseup', 'click'].forEach(t => albumOpt.dispatchEvent(new MouseEvent(t, { bubbles: true, composed: true, cancelable: true })));
    
    for (let i = 0; i < 20; i++) {
      await sleep(80);
      if (isAddModal()) break;
    }
    findVisible(qsa('input[placeholder="Search albums"], input[placeholder="Tìm kiếm album"], input[placeholder*="album" i]'))?.focus({ preventScroll: true });
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
        const names = Array.isArray(albums) ? albums.map(a => ({
          title: a?.title || a?.name || a?.displayName || '',
          mediaKey: a?.mediaKey || a?.id || ''
        })).filter(a => a.title && a.mediaKey) : [];
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

      // Check if we are inside an album/share/direct page
      const pathParts = window.location.pathname.split('/');
      const isAlbumPage = pathParts.includes('album') || pathParts.includes('share') || pathParts.includes('direct');

      // Card Setup
      let hoverCard = tile.querySelector('.gp-hover-card');
      if (!hoverCard) {
        hoverCard = document.createElement('div');
        hoverCard.className = 'gp-hover-card';
        
        // 1. Filename row
        const fnRow = document.createElement('div');
        fnRow.className = 'gp-hover-row gp-filename-row';
        const fnText = document.createElement('span');
        fnText.className = 'gp-text';
        fnText.textContent = 'Loading filename...';
        Object.assign(fnText.style, {
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flex: '1',
            textAlign: 'left'
        });
        fnRow.appendChild(fnText);

        const fnSize = document.createElement('span');
        fnSize.className = 'gp-size-text';
        Object.assign(fnSize.style, {
            fontSize: '9px',
            opacity: '0.7',
            whiteSpace: 'nowrap',
            marginLeft: '8px'
        });
        fnRow.appendChild(fnSize);
        
        hoverCard.appendChild(fnRow);
        
        tile.appendChild(hoverCard);
      }

      // Toolbar Container Setup (inside hoverCard)
      let toolbar = hoverCard.querySelector('.gp-toolbar-container');
      if (!toolbar) {
        toolbar = document.createElement('div');
        toolbar.className = 'gp-toolbar-container';
        
        // 0. Album Button (only if NOT on album page)
        if (!isAlbumPage) {
          const albBtn = document.createElement('div');
          albBtn.className = 'gp-toolbar-btn gp-album-access-btn';
          albBtn.title = 'View Album';
          albBtn.textContent = 'Checking albums...';
          toolbar.appendChild(albBtn);
        }

        // 1. Copy Link Button
        const copyLinkBtn = document.createElement('div');
        copyLinkBtn.className = 'gp-toolbar-btn gp-copy-btn';
        copyLinkBtn.title = 'Copy Direct Download Link';
        copyLinkBtn.innerHTML = SVG_LINK;
        toolbar.appendChild(copyLinkBtn);

        // 2. Direct Download Button
        const downloadBtn = document.createElement('div');
        downloadBtn.className = 'gp-toolbar-btn gp-download-btn';
        downloadBtn.title = 'Download Original File';
        downloadBtn.innerHTML = SVG_DOWNLOAD;
        toolbar.appendChild(downloadBtn);

        hoverCard.appendChild(toolbar);
      }
      
      const copyLinkBtn = toolbar.querySelector('.gp-copy-btn');
      const downloadBtn = toolbar.querySelector('.gp-download-btn');

      // Copy Link Button Action
      copyLinkBtn.onclick = async (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        const currentKey = tile.getAttribute('data-gp-media-key');
        if (!currentKey) return;
        
        const dUrl = await fetchDownloadUrl(currentKey);
        if (dUrl) {
          navigator.clipboard.writeText(dUrl).then(() => {
            copyLinkBtn.innerHTML = SVG_CHECK;
            copyLinkBtn.style.setProperty('color', '#10b981', 'important');
            setTimeout(() => {
              copyLinkBtn.innerHTML = SVG_LINK;
              copyLinkBtn.style.removeProperty('color');
            }, 1500);
          });
        } else {
          copyLinkBtn.innerHTML = '<span style="font-size: 10px; color: #ef4444;">!</span>';
          copyLinkBtn.style.setProperty('color', '#ef4444', 'important');
          setTimeout(() => {
            copyLinkBtn.innerHTML = SVG_LINK;
            copyLinkBtn.style.removeProperty('color');
          }, 1500);
        }
      };

      // Direct Download Button Action
      downloadBtn.onclick = async (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        const currentKey = tile.getAttribute('data-gp-media-key');
        if (!currentKey) return;

        const dUrl = await fetchDownloadUrl(currentKey);
        if (dUrl) {
          triggerSingleDownload(dUrl);
          downloadBtn.innerHTML = SVG_CHECK;
          downloadBtn.style.setProperty('color', '#10b981', 'important');
          setTimeout(() => {
            downloadBtn.innerHTML = SVG_DOWNLOAD;
            downloadBtn.style.removeProperty('color');
          }, 1500);
        } else {
          downloadBtn.innerHTML = '<span style="font-size: 10px; color: #ef4444;">!</span>';
          downloadBtn.style.setProperty('color', '#ef4444', 'important');
          setTimeout(() => {
            downloadBtn.innerHTML = SVG_DOWNLOAD;
            downloadBtn.style.removeProperty('color');
          }, 1500);
        }
      };

      const fnText = hoverCard.querySelector('.gp-filename-row .gp-text');
      let fnSize = hoverCard.querySelector('.gp-filename-row .gp-size-text');
      if (!fnSize) {
        fnSize = document.createElement('span');
        fnSize.className = 'gp-size-text';
        Object.assign(fnSize.style, {
            fontSize: '9px',
            opacity: '0.7',
            whiteSpace: 'nowrap',
            marginLeft: '8px'
        });
        hoverCard.querySelector('.gp-filename-row').appendChild(fnSize);
      }

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

      fnText.textContent = filename;
      fnSize.textContent = size ? formatBytes(size) : '';

      // Click to copy filename
      const fnRow = hoverCard.querySelector('.gp-filename-row');
      fnRow.title = filename;
      fnRow.onclick = (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        // Extract clean filename without any trailing size suffix like (12.3 MiB)
        const cleanName = filename.replace(/\s*\([^)]+\)$/, '');
        navigator.clipboard.writeText(cleanName);
        fnText.textContent = 'Copied!';
        fnText.style.setProperty('color', '#10b981', 'important'); // Green
        const prevSizeText = fnSize.textContent;
        fnSize.textContent = '';
        setTimeout(() => {
          fnText.textContent = filename;
          fnText.style.removeProperty('color');
          fnSize.textContent = prevSizeText;
        }, 1200);
      };

      // Populate album list as clickable button rows
      if (!isCheckboxArea && !isAlbumPage) {
        let albBtn = toolbar.querySelector('.gp-album-access-btn');
        if (albBtn) {
          if (!names.length) {
            albBtn.textContent = '(not in any albums)';
            albBtn.style.color = '#ff8a80';
            albBtn.onclick = null;
            albBtn.style.cursor = 'default';
          } else {
            albBtn.textContent = names.map(a => a.title).join(', ');
            albBtn.style.color = 'inherit';
            albBtn.style.cursor = 'pointer';
            albBtn.onclick = (evt) => {
              evt.preventDefault();
              evt.stopPropagation();
              const uMatch = window.location.pathname.match(/^\/u\/\d+/);
              const uPrefix = uMatch ? uMatch[0] : '';
              window.location.href = `${uPrefix}/album/${names[0].mediaKey}`;
            };
          }
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
    if (href.includes('/photo/')) return null;
    const m = href.match(/\/(album|share|direct)\/([A-Za-z0-9_\-]+)/);
    return m ? m[2] : null;
  }

  function renderFileList(container, items) {
    container.innerHTML = '';
    if (!items || !items.length) {
      const empty = document.createElement('div');
      empty.textContent = '(no items found)';
      empty.style.opacity = '0.5';
      empty.style.textAlign = 'center';
      empty.style.paddingTop = '10px';
      container.appendChild(empty);
      return;
    }
    items.forEach(item => {
      const itemDiv = document.createElement('div');
      Object.assign(itemDiv.style, {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer'
      });
      itemDiv.title = item.filename;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'gp-text';
      nameSpan.textContent = item.filename;
      Object.assign(nameSpan.style, {
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          flex: '1',
          textAlign: 'left'
      });

      const sizeSpan = document.createElement('span');
      sizeSpan.textContent = formatBytes(item.size);
      Object.assign(sizeSpan.style, {
          fontSize: '9px',
          opacity: '0.7',
          whiteSpace: 'nowrap'
      });

      itemDiv.onclick = (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        const cleanName = item.filename.replace(/\s*\([^)]+\)$/, '');
        navigator.clipboard.writeText(cleanName);
        
        const originalText = nameSpan.textContent;
        nameSpan.textContent = 'Copied!';
        nameSpan.style.color = '#10b981';
        setTimeout(() => {
          nameSpan.textContent = originalText;
          nameSpan.style.color = '';
        }, 1000);
      };

      itemDiv.appendChild(nameSpan);
      itemDiv.appendChild(sizeSpan);
      container.appendChild(itemDiv);
    });
  }

  async function handleAlbumMouseEnter(e) {
    const card = e.currentTarget;
    const key = extractAlbumKey(card);
    if (!key) return;

    const imgContainer = card.querySelector('img')?.parentElement || card.firstElementChild || card;

    if (window.getComputedStyle(imgContainer).position === 'static') {
        imgContainer.style.position = 'relative';
    }
    imgContainer.style.overflow = 'hidden';

    let overlay = imgContainer.querySelector('.gpd-album-hover-details');
    let listContainer;
    let sizeText;

    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'gpd-album-hover-details';
        
        const header = document.createElement('div');
        Object.assign(header.style, {
            display: 'flex',
            justifyContent: 'center',
            fontWeight: '600',
            borderBottom: '1px solid var(--gp-card-border)',
            paddingBottom: '4px',
            marginBottom: '4px'
        });
        
        sizeText = document.createElement('span');
        sizeText.textContent = 'Loading size...';
        
        header.appendChild(sizeText);
        overlay.appendChild(header);

        listContainer = document.createElement('div');
        listContainer.className = 'gpd-album-hover-list';
        overlay.appendChild(listContainer);
        
        imgContainer.appendChild(overlay);
    } else {
        sizeText = overlay.querySelector('span');
        listContainer = overlay.querySelector('.gpd-album-hover-list');
    }

    setTimeout(() => {
        overlay.classList.add('gpd-album-hover-details--show');
    }, 10);

    const cached = albumDetailsCache.get(key);
    if (cached) {
        if (cached.isLoading) {
            sizeText.textContent = `Loading size...`;
        } else {
            sizeText.textContent = formatBytes(cached.size);
            renderFileList(listContainer, cached.items);
        }
        return;
    }

    sizeText.textContent = `Loading size...`;
    albumDetailsCache.set(key, { count: 0, size: 0, items: [], isLoading: true });

    try {
        const details = await fetchAlbumDetails(key, (fetched, total) => {
            if (card.matches(':hover')) {
                sizeText.textContent = `Loading size... (${fetched}/${total})`;
            }
        });
        albumDetailsCache.set(key, { count: details.count, size: details.size, items: details.items, isLoading: false });
        if (card.matches(':hover')) {
            sizeText.textContent = formatBytes(details.size);
            renderFileList(listContainer, details.items);
        }
    } catch (err) {
        console.error('Failed to load album details:', err);
        sizeText.textContent = `Error loading`;
        albumDetailsCache.delete(key);
    }
  }

  function handleAlbumMouseLeave(e) {
    const card = e.currentTarget;
    const imgContainer = card.querySelector('img')?.parentElement || card.firstElementChild || card;
    const overlay = imgContainer.querySelector('.gpd-album-hover-details');
    if (overlay) {
        overlay.classList.remove('gpd-album-hover-details--show');
        setTimeout(() => {
            if (overlay.parentNode && !overlay.classList.contains('gpd-album-hover-details--show')) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 200);
    }
  }

  /* =============================================================
   *  7. UNIFIED DOM SCANNING & EVENT DELEGATION
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

    visibleObserver.observe(tile);
  }

  function scan() {
    updateThemeClass();
    
    // Safety cleanup for stuck hover menus
    if (activeHoveredTile && !activeHoveredTile.matches(':hover')) {
      activeHoveredTile._gpIsHovered = false;
      hideHoverUI(activeHoveredTile);
      activeHoveredTile = null;
    }
    if (activeHoveredAlbumCard && !activeHoveredAlbumCard.matches(':hover')) {
      activeHoveredAlbumCard._gpIsHovered = false;
      handleAlbumMouseLeave({ currentTarget: activeHoveredAlbumCard });
      activeHoveredAlbumCard = null;
    }

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
  }

  let scanTimer = null;
  function debouncedScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(() => { scan(); scanTimer = null; }, 150);
  }

  // Setup Event Delegation for all Hover UI features
  document.body.addEventListener('mouseover', e => {
    if (!e.target || typeof e.target.closest !== 'function') return;
    
    // 1. Photo tiles & Checkboxes
    const targetEl = e.target.closest('.RY3tic, .QcpS9c.ckGgle');
    if (targetEl) {
      const tile = targetEl.classList.contains('RY3tic') ? targetEl : getTile(targetEl);
      if (tile && !tile._gpIsHovered) {
        // Clean up previously active tile if any
        if (activeHoveredTile && activeHoveredTile !== tile) {
          activeHoveredTile._gpIsHovered = false;
          hideHoverUI(activeHoveredTile);
        }
        tile._gpIsHovered = true;
        activeHoveredTile = tile;
        showHoverUI(tile, e);
      }
      return;
    }

    // 2. Album Cards
    const card = e.target.closest('a[href*="/album/"], a[href*="/share/"], a[href*="/direct/"]');
    if (card) {
      const href = card.getAttribute('href') || '';
      if (href.includes('/photo/')) return;
      if (!card._gpIsHovered) {
        // Clean up previously active album card if any
        if (activeHoveredAlbumCard && activeHoveredAlbumCard !== card) {
          activeHoveredAlbumCard._gpIsHovered = false;
          handleAlbumMouseLeave({ currentTarget: activeHoveredAlbumCard });
        }
        card._gpIsHovered = true;
        activeHoveredAlbumCard = card;
        handleAlbumMouseEnter({ currentTarget: card });
      }
    }
  });

  document.body.addEventListener('mouseout', e => {
    if (!e.target || typeof e.target.closest !== 'function') return;
    
    // 1. Photo tiles & Checkboxes
    const targetEl = e.target.closest('.RY3tic, .QcpS9c.ckGgle');
    if (targetEl) {
      const tile = targetEl.classList.contains('RY3tic') ? targetEl : getTile(targetEl);
      if (tile) {
        const relTile = e.relatedTarget && typeof e.relatedTarget.closest === 'function' ? e.relatedTarget.closest('.RY3tic, .QcpS9c.ckGgle') : null;
        const relTileResolved = relTile ? (relTile.classList.contains('RY3tic') ? relTile : getTile(relTile)) : null;
        if (relTileResolved === tile) return; // Still inside the same tile or its checkbox
        tile._gpIsHovered = false;
        if (activeHoveredTile === tile) activeHoveredTile = null;
        hideHoverUI(tile);
      }
      return;
    }

    // 2. Album Cards
    const card = e.target.closest('a[href*="/album/"], a[href*="/share/"], a[href*="/direct/"]');
    if (card) {
      if (e.relatedTarget && card.contains(e.relatedTarget)) return;
      if (card._gpIsHovered) {
        card._gpIsHovered = false;
        if (activeHoveredAlbumCard === card) activeHoveredAlbumCard = null;
        handleAlbumMouseLeave({ currentTarget: card });
      }
    }
  });

  // Global throttled mousemove backup to clean up stuck hover menus
  let mousemoveTimeout = null;
  document.body.addEventListener('mousemove', () => {
    if (mousemoveTimeout) return;
    mousemoveTimeout = setTimeout(() => {
      // 1. Clean up tile hover
      if (activeHoveredTile && !activeHoveredTile.matches(':hover')) {
        activeHoveredTile._gpIsHovered = false;
        hideHoverUI(activeHoveredTile);
        activeHoveredTile = null;
      }
      // 2. Clean up album card hover
      if (activeHoveredAlbumCard && !activeHoveredAlbumCard.matches(':hover')) {
        activeHoveredAlbumCard._gpIsHovered = false;
        handleAlbumMouseLeave({ currentTarget: activeHoveredAlbumCard });
        activeHoveredAlbumCard = null;
      }
      mousemoveTimeout = null;
    }, 100);
  });

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

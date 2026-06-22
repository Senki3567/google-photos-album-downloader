// ==UserScript==
// @name         Google Photos - Album Adder Album Filename and Size on Hover
// @namespace    https://buymeacoffee.com/sircluckingtonx
// @version      1.7.6
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
Metadata RPC portions Copyright (c) 2024 xob0t

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

console.log('%c[GP-Master] Master Script successfully loaded!', 'color: #a8c7fa; font-size: 14px; font-weight: bold; background: #0b57d0; padding: 4px 8px; border-radius: 4px;');

(async function () {
  'use strict';

  /* =============================================================
   *  1. CONFIGURATION
   * ============================================================= */
  const HOTKEY_ADD    = { key: 'Q', shift: true,  alt: false, ctrl: false, meta: false };
  const HOTKEY_RECALL = { key: 'W', shift: true,   alt: false, ctrl: false, meta: false };
  const PERSIST_NOT_IN_ALBUMS = true;
  const HIGHLIGHT_UNALBUMED = true; // Adds an accent border to photos not in any albums
  const CACHE_TTL = 600000;
  const RPC_TIMEOUT_MS = 15000;
  const RPC_MAX_ATTEMPTS = 2;

  /* =============================================================
   *  2. SHARED STATE & HELPERS
   * ============================================================= */
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
  const SVG_LINK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true" focusable="false"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>';
  const SVG_CHECK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true" focusable="false"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
  const SVG_DOWNLOAD = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 18v2h14v-2"/></svg>';
  const SVG_ADD_ALBUM = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true" focusable="false"><path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z"/></svg>';
  const filenameCache = new Map();
  const albumDetailsCache = new Map(); // mediaKey -> { count, size, isLoading }
  let activeHoveredTile = null;
  let activeHoveredAlbumCard = null;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function withTimeout(promise, timeoutMs, label) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
  }
  async function runWithRetry(operation, label, attempts = RPC_MAX_ATTEMPTS) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await withTimeout(Promise.resolve().then(operation), RPC_TIMEOUT_MS, label);
      } catch (error) {
        lastError = error;
        if (attempt < attempts) await sleep(350 * attempt);
      }
    }
    throw lastError || new Error(`${label} failed`);
  }
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

    let lastError = null;
    for (let attempt = 1; attempt <= RPC_MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
      try {
        const response = await fetch(`${baseUrl}?${params.toString()}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
            },
            body: bodyParams.toString(),
            signal: controller.signal
        });

        if (!response.ok) {
            const error = new Error(`HTTP Error: ${response.status}`);
            error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
            throw error;
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
        throw new Error(`RPC ${rpcid} returned no usable payload`);
      } catch (error) {
        if (error.name === 'AbortError') {
          lastError = new Error(`RPC ${rpcid} timed out after ${RPC_TIMEOUT_MS}ms`);
          lastError.retryable = true;
        } else {
          lastError = error;
        }
        if (attempt >= RPC_MAX_ATTEMPTS || lastError.retryable === false) break;
        await sleep(350 * attempt);
      } finally {
        clearTimeout(timeoutId);
      }
    }
    throw lastError || new Error(`RPC ${rpcid} failed`);
  }

  // Fetch count and total file size for an album by its mediaKey
  async function fetchAlbumDetails(albumMediaKey, onProgress) {
    let mediaKeys = [];
    let nextPageId = null;
    const seenPageIds = new Set();
    const authKey = new URLSearchParams(window.location.search).get('key');
    do {
      const resData = await sendRpc('snAcKc', [albumMediaKey, nextPageId, null, authKey]);
      const pageItems = resData[1] || [];
      mediaKeys.push(...pageItems.map(item => item[0]).filter(Boolean));
      nextPageId = resData[2] || null;
      if (nextPageId) {
        if (seenPageIds.has(nextPageId)) {
          throw new Error('Album pagination returned a repeated page token');
        }
        seenPageIds.add(nextPageId);
      }
    } while (nextPageId);

    mediaKeys = [...new Set(mediaKeys)];
    const totalCount = mediaKeys.length;
    if (totalCount === 0) return { count: 0, size: 0, items: [] };

    let completedCount = 0;
    const failedBatches = [];
    const batchSize = 100;
    const batchSpecs = [];
    for (let i = 0; i < mediaKeys.length; i += batchSize) {
      batchSpecs.push({ index: i, keys: mediaKeys.slice(i, i + batchSize) });
    }

    const results = new Array(batchSpecs.length);
    let nextBatchIndex = 0;
    async function batchWorker() {
      while (nextBatchIndex < batchSpecs.length) {
        const slot = nextBatchIndex++;
        const spec = batchSpecs[slot];
        const keysPayload = spec.keys.map(k => [k]);
        const emptyArray = Array(24).fill(null);
        const extraEmptyArray = Array(10).fill(null);
        const secondPart = [...emptyArray, [], ...extraEmptyArray, []];

        try {
          const batchRes = await sendRpc('EWgK9e', [[[keysPayload], [secondPart]]]);
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
          if (batchItems.length !== spec.keys.length) {
            throw new Error(`Batch returned ${batchItems.length}/${spec.keys.length} media records`);
          }
          results[slot] = { items: batchItems, size: batchTotalSize, index: spec.index };
        } catch (err) {
          console.error('Failed to fetch batch starting at ' + spec.index, err);
          failedBatches.push({ index: spec.index, error: err });
          results[slot] = { items: [], size: 0, index: spec.index };
        } finally {
          completedCount += spec.keys.length;
          if (onProgress) onProgress(completedCount, totalCount);
        }
      }
    }

    const workerCount = Math.min(4, batchSpecs.length);
    await Promise.all(Array.from({ length: workerCount }, () => batchWorker()));
    if (failedBatches.length > 0) {
      throw new Error(`${failedBatches.length} album metadata batch(es) failed`);
    }
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

    /* Shared hover card structure */
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
      border-radius: var(--gpd-album-card-radius, 12px);
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

    /* Google Photos-native Material 3 refinement layer */
    body {
      --gp-card-bg: rgba(248, 249, 250, 0.86);
      --gp-card-text: #202124;
      --gp-card-border: rgba(60, 64, 67, 0.24);
      --gp-row-hover: rgba(60, 64, 67, 0.1);
      --gp-text-secondary: #5f6368;
      --gp-surface-container: rgba(255, 255, 255, 0.42);
      --gp-surface-container-high: rgba(60, 64, 67, 0.14);
      --gp-primary: #3c4043;
      --gp-primary-container: rgba(60, 64, 67, 0.14);
      --gp-on-primary-container: #202124;
      --gp-link-color: #3c4043;
      --gp-link-hover: #202124;
      --gp-success: #137333;
      --gp-error: #b3261e;
      --gp-focus: #5f6368;
      --gp-card-shadow: 0 8px 24px rgba(32, 33, 36, 0.18), 0 1px 4px rgba(32, 33, 36, 0.12);
    }
    body.gp-dark-mode {
      --gp-card-bg: rgba(24, 25, 28, 0.8) !important;
      --gp-card-text: #f1f3f4 !important;
      --gp-card-border: rgba(232, 234, 237, 0.22) !important;
      --gp-row-hover: rgba(232, 234, 237, 0.12) !important;
      --gp-text-secondary: #bdc1c6 !important;
      --gp-surface-container: rgba(255, 255, 255, 0.08) !important;
      --gp-surface-container-high: rgba(255, 255, 255, 0.14) !important;
      --gp-primary: #e8eaed !important;
      --gp-primary-container: rgba(255, 255, 255, 0.14) !important;
      --gp-on-primary-container: #ffffff !important;
      --gp-link-color: #e8eaed !important;
      --gp-link-hover: #ffffff !important;
      --gp-success: #81c995 !important;
      --gp-error: #f2b8b5 !important;
      --gp-focus: #e8eaed !important;
      --gp-card-shadow: 0 10px 28px rgba(0, 0, 0, 0.38), 0 1px 5px rgba(0, 0, 0, 0.28) !important;
    }
    .gp-hover-card {
      left: 8px;
      right: 8px;
      bottom: 8px;
      padding: 0;
      gap: 0;
      border-radius: 16px;
      border-color: transparent;
      background: transparent;
      color: var(--gp-card-text);
      font-size: 12px;
      box-shadow: none;
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
    .gp-album-link {
      color: var(--gp-link-color);
    }
    .gp-album-link:hover {
      color: var(--gp-link-hover);
    }
    .gp-hover-row {
      width: 100%;
      min-height: 44px;
      box-sizing: border-box;
      padding: 0 14px;
      border: 1px solid var(--gp-card-border);
      border-radius: 22px;
      background: var(--gp-card-bg);
      color: inherit;
      font: inherit;
      text-align: left;
      box-shadow: var(--gp-card-shadow);
      backdrop-filter: blur(18px) saturate(110%);
      -webkit-backdrop-filter: blur(18px) saturate(110%);
    }
    .gp-filename-row {
      background: var(--gp-card-bg);
    }
    .gp-hover-row:hover,
    .gp-hover-row:focus-visible {
      background: color-mix(in srgb, var(--gp-card-bg) 82%, var(--gp-primary-container));
      border-color: var(--gp-primary);
    }
    .gp-hover-row:active,
    .gpd-album-file-row:active {
      background: var(--gp-surface-container-high);
    }
    .gp-hover-row:focus-visible,
    .gp-toolbar-btn:focus-visible,
    .gpd-album-file-row:focus-visible {
      outline: 3px solid color-mix(in srgb, var(--gp-focus) 55%, transparent);
      outline-offset: 2px;
    }
    .gp-size-text,
    .gpd-album-file-size {
      color: var(--gp-text-secondary);
      font-size: 11px !important;
      font-variant-numeric: tabular-nums;
      opacity: 1 !important;
    }
    .gp-toolbar-container {
      top: -50px;
      gap: 6px;
    }
    .gp-toolbar-btn {
      width: 44px;
      height: 44px;
      flex: 0 0 44px;
      padding: 0;
      border-radius: 50%;
      border: 1px solid var(--gp-card-border);
      background: var(--gp-card-bg);
      color: var(--gp-primary);
      font: 600 12px/1.2 "Google Sans", Roboto, Arial, sans-serif;
      box-shadow: var(--gp-card-shadow);
      backdrop-filter: blur(18px) saturate(110%);
      -webkit-backdrop-filter: blur(18px) saturate(110%);
      touch-action: manipulation;
    }
    .gp-toolbar-btn:hover {
      background: var(--gp-primary-container);
      border-color: var(--gp-primary);
      color: var(--gp-on-primary-container);
    }
    .gp-toolbar-btn:active {
      background: var(--gp-surface-container-high);
    }
    body.gp-dark-mode .gp-toolbar-btn,
    body.gp-dark-mode .gp-toolbar-btn:hover {
      background: var(--gp-card-bg) !important;
      border-color: var(--gp-card-border) !important;
      color: var(--gp-primary) !important;
    }
    body.gp-dark-mode .gp-toolbar-btn:hover {
      background: var(--gp-primary-container) !important;
      color: var(--gp-on-primary-container) !important;
    }
    .gp-toolbar-btn:disabled {
      opacity: 0.48;
      cursor: not-allowed;
    }
    .gp-album-access-btn {
      min-width: 0;
      width: auto;
      height: 44px;
      flex: 1 1 auto;
      display: block;
      padding: 0 14px;
      border-radius: 22px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      text-align: left;
      line-height: 42px;
    }
    .gpd-album-hover-details {
      top: 35%;
      bottom: 8px;
      left: 8px;
      right: 8px;
      padding: 10px;
      border-radius: var(--gpd-album-card-radius, 12px);
      border-color: var(--gp-card-border);
      background: var(--gp-card-bg);
      color: var(--gp-card-text);
      font-size: 12px;
      box-shadow: var(--gp-card-shadow);
      backdrop-filter: blur(18px) saturate(110%);
      -webkit-backdrop-filter: blur(18px) saturate(110%);
    }
    .gpd-album-summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 32px;
      padding: 0 4px 8px;
      margin-bottom: 6px;
      border-bottom: 1px solid var(--gp-card-border);
      color: var(--gp-card-text);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .gpd-album-hover-list {
      gap: 2px;
      scrollbar-width: thin;
      scrollbar-color: var(--gp-card-border) transparent;
    }
    .gpd-album-file-row {
      width: 100%;
      min-height: 36px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 7px 8px;
      box-sizing: border-box;
      border: 0;
      border-radius: 10px;
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
      text-align: left;
    }
    .gpd-album-file-row:hover {
      background: var(--gp-row-hover);
    }
    .gpd-album-empty {
      padding: 20px 10px;
      color: var(--gp-text-secondary);
      text-align: center;
      line-height: 1.45;
    }
    @media (prefers-reduced-motion: reduce) {
      .gp-hover-card,
      .gpd-album-hover-details,
      .gp-toolbar-container,
      .gp-toolbar-btn {
        transition-duration: 1ms !important;
      }
    }

    /* Unified Google Photos blue + translucent surface theme */
    body {
      --gp-expressive: #0b57d0;
      --gp-expressive-on-container: #041e49;
      --gp-primary: #0b57d0;
      --gp-primary-container: rgba(11, 87, 208, 0.1);
      --gp-on-primary-container: #041e49;
      --gp-link-color: #0b57d0;
      --gp-link-hover: #0842a0;
      --gp-success: #0b57d0;
      --gp-error: #0b57d0;
      --gp-text-dim: #0b57d0;
      --gp-focus: #0b57d0;
      --gp-glass: rgba(255, 255, 255, 0.72);
      --gp-glass-outline: rgba(60, 64, 67, 0.16);
      --gp-glass-shadow: rgba(32, 33, 36, 0.14);
      --gp-glass-surface: var(--gp-glass);
      --gp-glass-hover: color-mix(in srgb, var(--gp-glass) 92%, var(--gp-expressive));
      --gp-glass-primary: color-mix(in srgb, var(--gp-glass) 88%, var(--gp-expressive));
      --gp-glass-elevation: 0 6px 20px var(--gp-glass-shadow);
      --gp-spring: cubic-bezier(0.2, 0, 0, 1.35);
      --gp-shape-motion: cubic-bezier(0.2, 0, 0, 1);
    }
    body.gp-dark-mode {
      --gp-expressive: #a8c7fa !important;
      --gp-expressive-on-container: #d3e3fd !important;
      --gp-primary: #a8c7fa !important;
      --gp-primary-container: rgba(168, 199, 250, 0.12) !important;
      --gp-on-primary-container: #d3e3fd !important;
      --gp-link-color: #a8c7fa !important;
      --gp-link-hover: #d3e3fd !important;
      --gp-success: #a8c7fa !important;
      --gp-error: #a8c7fa !important;
      --gp-text-dim: #a8c7fa !important;
      --gp-focus: #a8c7fa !important;
      --gp-glass: rgba(28, 28, 30, 0.72) !important;
      --gp-glass-outline: rgba(255, 255, 255, 0.14) !important;
      --gp-glass-shadow: rgba(0, 0, 0, 0.28) !important;
    }
    body.gp-light-mode {
      --gp-primary: #0b57d0 !important;
      --gp-primary-container: rgba(11, 87, 208, 0.1) !important;
      --gp-on-primary-container: #041e49 !important;
      --gp-link-color: #0b57d0 !important;
      --gp-link-hover: #0842a0 !important;
      --gp-success: #0b57d0 !important;
      --gp-error: #0b57d0 !important;
      --gp-text-dim: #0b57d0 !important;
      --gp-focus: #0b57d0 !important;
    }
    .gp-hover-row,
    .gp-toolbar-btn,
    .gpd-album-hover-details,
    .gpd-album-file-row {
      transition:
        border-radius 180ms var(--gp-shape-motion),
        background-color 160ms ease,
        color 160ms ease,
        border-color 160ms ease,
        opacity 180ms ease;
    }
    .gp-hover-row,
    .gp-toolbar-btn,
    .gpd-album-hover-details {
      border-color: var(--gp-glass-outline);
      background: var(--gp-glass-surface);
      box-shadow: var(--gp-glass-elevation);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }
    .gp-not-in-album::after {
      box-shadow: inset 0 0 0 3px color-mix(in srgb, var(--gp-expressive) 72%, transparent);
    }
    .gp-hover-row {
      border-radius: 18px;
    }
    .gp-hover-row:hover,
    .gp-hover-row:focus-visible {
      border-radius: 18px;
      border-color: var(--gp-expressive);
      background: var(--gp-glass-hover);
      box-shadow: var(--gp-glass-elevation);
    }
    .gp-hover-row:active {
      border-radius: 999px;
      transform: none;
    }
    .gp-toolbar-btn {
      border-radius: 14px;
      color: var(--gp-card-text);
      background: var(--gp-glass-surface);
    }
    .gp-toolbar-btn:hover {
      border-radius: 14px;
      color: var(--gp-expressive-on-container);
      border-color: var(--gp-expressive);
      background: var(--gp-glass-primary);
    }
    body.gp-dark-mode .gp-toolbar-btn {
      color: var(--gp-card-text) !important;
      border-color: var(--gp-glass-outline) !important;
      background: var(--gp-glass-surface) !important;
    }
    body.gp-dark-mode .gp-toolbar-btn:hover {
      color: var(--gp-expressive-on-container) !important;
      border-color: var(--gp-expressive) !important;
      background: var(--gp-glass-primary) !important;
    }
    .gp-toolbar-btn:active {
      border-radius: 999px;
      transform: none;
    }
    .gp-album-access-btn {
      border-radius: 18px;
    }
    .gp-album-access-btn:hover {
      border-radius: 18px;
    }
    .gp-album-access-btn:active {
      border-radius: 999px;
      transform: none;
    }
    .gpd-album-hover-details {
      overflow: hidden;
      isolation: isolate;
      border-radius: var(--gpd-album-card-radius, 12px);
      background: var(--gp-glass-surface);
      box-shadow: var(--gp-glass-elevation);
    }
    body.gp-dark-mode .gpd-album-hover-details {
      box-shadow: var(--gp-glass-elevation);
    }
    .gpd-album-summary {
      border-bottom-color: color-mix(in srgb, var(--gp-expressive) 24%, var(--gp-card-border));
    }
    .gpd-album-file-row {
      border-radius: 12px;
      border: 1px solid var(--gp-glass-outline);
      background: transparent;
      box-shadow: none;
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
    .gpd-album-file-row:hover {
      border-radius: 12px;
      background: var(--gp-glass-hover);
    }
    .gpd-album-file-row:active {
      border-radius: 999px;
      transform: none;
    }
  `;
  document.head.appendChild(style);

  /* =============================================================
   *  4. EASY ALBUM ADDER
   * ============================================================= */
  // Floating corner notifications are intentionally disabled.
  const toast = () => {};

  const busyTexts = [/Adding/i, /Deleting album/i, /Album deleted/i, /Waiting for Photos/i, /\b\d+\s+(?:item|items)\s+(?:added to album|already in album|new item added)/i];
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
    if (isBusy()) return toast('Photos is still busy. Wait a moment and try again.', { tone: 'error' });
    if (isInViewer()) await addInViewer(); else await addInGrid();
  }

  window.addEventListener('keydown', async (e) => {
    if (e.target.matches('input,textarea') || e.target.isContentEditable || isAddModal()) return;
    const match = hk => e.key?.toLowerCase() === hk.key.toLowerCase() && !!e.shiftKey === !!hk.shift && !!e.altKey === !!hk.alt && !!e.ctrlKey === !!hk.ctrl && !!e.metaKey === !!hk.meta;
    if (match(HOTKEY_ADD)) {
      e.preventDefault();
      try { await addAlbum(); saveSel(); } catch (err) { toast(err?.message || 'Could not open Add to album', { tone: 'error' }); }
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
  const hasFilenameMetadata = key => {
    const cached = filenameCache.get(key);
    return !!cached && typeof cached.filename === 'string' && cached.filename !== '(unknown)';
  };

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

  // Standalone metadata helpers. RPC shapes and response indices follow the
  // Google Photos Toolkit API implementation (MIT), embedded here so this
  // userscript does not require that toolkit to be installed.
  function parseAlbumSummary(albumData) {
    const albumMeta = albumData?.at(-1)?.[72930366];
    return {
      mediaKey: albumData?.[0] || '',
      title: albumMeta?.[1] || ''
    };
  }

  function parseItemInfoExt(raw) {
    const item = raw?.[0];
    if (!item) return null;
    return {
      mediaKey: item?.[0],
      fileName: item?.[2],
      size: item?.[5],
      albums: (item?.[19] || []).map(parseAlbumSummary).filter(album => album.mediaKey && album.title)
    };
  }

  function parseBatchMediaInfo(raw) {
    const items = raw?.[0]?.[1];
    if (!Array.isArray(items)) return [];
    return items.map(item => ({
      mediaKey: item?.[0],
      fileName: item?.[1]?.[3],
      size: item?.[1]?.[9]
    })).filter(item => item.mediaKey);
  }

  async function getItemInfoExt(key) {
    const authKey = new URLSearchParams(window.location.search).get('key');
    const raw = await sendRpc('fDcn4b', [key, 1, authKey, null, 1]);
    const parsed = parseItemInfoExt(raw);
    if (!parsed) throw new Error(`No metadata returned for ${key}`);
    return parsed;
  }

  async function getBatchMediaInfo(keys) {
    const mappedKeys = keys.map(key => [key]);
    const metadataFields = Array(24).fill(null);
    const trailingFields = Array(10).fill(null);
    const requestData = [[[mappedKeys], [[...metadataFields, [], ...trailingFields, []]]]];
    return parseBatchMediaInfo(await sendRpc('EWgK9e', requestData));
  }

  async function fetchSharedExtInfo(key) {
    log(`fetchSharedExtInfo initiated for: ${key}`);
    if (!key) return { names: [], filename: '(unknown)', size: null };
    if (activeSharedRequests.has(key)) return activeSharedRequests.get(key);

    const req = (async () => {
      try {
        const info = await runWithRetry(
          () => getItemInfoExt(key),
          `getItemInfoExt(${key})`
        );
        const fn = info?.fileName || info?.filename || info?.originalFilename || '(unknown)';
        const sz = info?.size || info?.fileSize || info?.sizeBytes || info?.bytes || info?.spaceTaken || info?.space_taken || null;
        const current = filenameCache.get(key) || {};
        filenameCache.set(key, { ...current, filename: fn, size: sz });

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
        throw e;
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
      if (activeSharedRequests.has(key)) continue;
      const cachedAlb = albumCache.get(key);
      if (!cachedAlb || Date.now() - cachedAlb.time > CACHE_TTL) {
        activeAlbumPrefetches++;
        log(`Prefetching album info for: ${key}`);
        fetchSharedExtInfo(key)
          .catch(error => console.warn('[GP-Master] Album prefetch failed for', key, error))
          .finally(() => {
            activeAlbumPrefetches--;
            processAlbumPrefetchQueue();
          });
        await sleep(40);
      }
    }
  }

  function queueFilenameForPrefetch(key) {
    if (!key || hasFilenameMetadata(key)) return;
    filenamePrefetchQueue.add(key);
    if (filenamePrefetchTimer) clearTimeout(filenamePrefetchTimer);
    filenamePrefetchTimer = setTimeout(flushFilenamePrefetchQueue, 150);
  }

  async function flushFilenamePrefetchQueue() {
    if (filenamePrefetchQueue.size === 0) return;
    const keysToFetch = Array.from(filenamePrefetchQueue);
    filenamePrefetchQueue.clear();
    log(`Flushing bulk filename prefetch for ${keysToFetch.length} items`);
    try {
      const results = [];
      const chunkSize = 100;
      for (let offset = 0; offset < keysToFetch.length; offset += chunkSize) {
        const chunk = keysToFetch.slice(offset, offset + chunkSize);
        const chunkResults = await runWithRetry(
          () => getBatchMediaInfo(chunk),
          `getBatchMediaInfo(${chunk.length})`
        );
        results.push(...chunkResults);
      }
      if (Array.isArray(results)) {
        results.forEach(info => {
          if (info && info.mediaKey) {
            const sz = info.size || info.fileSize || info.sizeBytes || info.bytes || info.spaceTaken || info.space_taken || null;
            const current = filenameCache.get(info.mediaKey) || {};
            filenameCache.set(info.mediaKey, {
              ...current,
              filename: info.fileName || info.filename || info.originalFilename || '(unknown)',
              size: sz
            });
          }
        });
      }
    } catch (e) { console.warn('[GP-Master] Bulk fetch failed', e); }
  }

  const visibleObserver = new IntersectionObserver((entries) => {
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
        if (!hasFilenameMetadata(key)) queueFilenameForPrefetch(key);
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
        const fnRow = document.createElement('button');
        fnRow.type = 'button';
        fnRow.className = 'gp-hover-row gp-filename-row';
        fnRow.setAttribute('aria-label', 'Copy filename');
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
          const albBtn = document.createElement('button');
          albBtn.type = 'button';
          albBtn.className = 'gp-toolbar-btn gp-album-access-btn';
          albBtn.title = 'View Album';
          albBtn.setAttribute('aria-label', 'Open containing album');
          albBtn.textContent = 'Checking albums...';
          toolbar.appendChild(albBtn);
        }

        // 1. Copy Link Button
        const copyLinkBtn = document.createElement('button');
        copyLinkBtn.type = 'button';
        copyLinkBtn.className = 'gp-toolbar-btn gp-copy-btn';
        copyLinkBtn.title = 'Copy Direct Download Link';
        copyLinkBtn.setAttribute('aria-label', 'Copy direct download link');
        copyLinkBtn.innerHTML = SVG_LINK;
        toolbar.appendChild(copyLinkBtn);

        // 2. Direct Download Button
        const downloadBtn = document.createElement('button');
        downloadBtn.type = 'button';
        downloadBtn.className = 'gp-toolbar-btn gp-download-btn';
        downloadBtn.title = 'Download Original File';
        downloadBtn.setAttribute('aria-label', 'Download original file');
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

        copyLinkBtn.disabled = true;
        copyLinkBtn.setAttribute('aria-busy', 'true');
        try {
          const dUrl = await fetchDownloadUrl(currentKey);
          if (!dUrl) throw new Error('Download link unavailable');
          await navigator.clipboard.writeText(dUrl);
          copyLinkBtn.innerHTML = SVG_CHECK;
          copyLinkBtn.style.setProperty('color', 'var(--gp-success)', 'important');
          copyLinkBtn.setAttribute('aria-label', 'Direct download link copied');
          toast('Direct download link copied', { tone: 'success' });
          setTimeout(() => {
            copyLinkBtn.innerHTML = SVG_LINK;
            copyLinkBtn.style.removeProperty('color');
            copyLinkBtn.setAttribute('aria-label', 'Copy direct download link');
          }, 1500);
        } catch (error) {
          console.warn('[GP-Master] Copy direct link failed', error);
          toast('Could not copy the direct link. Try again.', { tone: 'error' });
        } finally {
          copyLinkBtn.disabled = false;
          copyLinkBtn.removeAttribute('aria-busy');
        }
      };

      // Direct Download Button Action
      downloadBtn.onclick = async (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        const currentKey = tile.getAttribute('data-gp-media-key');
        if (!currentKey) return;

        downloadBtn.disabled = true;
        downloadBtn.setAttribute('aria-busy', 'true');
        try {
          const dUrl = await fetchDownloadUrl(currentKey);
          if (!dUrl) throw new Error('Download link unavailable');
          triggerSingleDownload(dUrl);
          downloadBtn.innerHTML = SVG_CHECK;
          downloadBtn.style.setProperty('color', 'var(--gp-success)', 'important');
          downloadBtn.setAttribute('aria-label', 'Download started');
          toast('Original file download started', { tone: 'success' });
          setTimeout(() => {
            downloadBtn.innerHTML = SVG_DOWNLOAD;
            downloadBtn.style.removeProperty('color');
            downloadBtn.setAttribute('aria-label', 'Download original file');
          }, 1500);
        } catch (error) {
          console.warn('[GP-Master] Direct download failed', error);
          toast('Could not start the download. Try again.', { tone: 'error' });
        } finally {
          downloadBtn.disabled = false;
          downloadBtn.removeAttribute('aria-busy');
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
      const hasFn = hasFilenameMetadata(key);

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

      if (tile.getAttribute('data-gp-media-key') !== key) return;
      fnText.textContent = filename;
      fnSize.textContent = size ? formatBytes(size) : '';

      // Click to copy filename
      const fnRow = hoverCard.querySelector('.gp-filename-row');
      fnRow.title = filename;
      fnRow.setAttribute('aria-label', `Copy filename: ${filename}`);
      fnRow.onclick = async (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        // Extract clean filename without any trailing size suffix like (12.3 MiB)
        const cleanName = filename.replace(/\s*\([^)]+\)$/, '');
        try {
          await navigator.clipboard.writeText(cleanName);
          fnText.textContent = 'Filename copied';
          fnText.style.setProperty('color', 'var(--gp-success)', 'important');
          const prevSizeText = fnSize.textContent;
          fnSize.textContent = '';
          toast('Filename copied', { tone: 'success' });
          setTimeout(() => {
            fnText.textContent = filename;
            fnText.style.removeProperty('color');
            fnSize.textContent = prevSizeText;
          }, 1200);
        } catch (error) {
          console.warn('[GP-Master] Filename copy failed', error);
          toast('Could not copy the filename.', { tone: 'error' });
        }
      };

      // Populate album list as clickable button rows
      if (!isCheckboxArea && !isAlbumPage) {
        let albBtn = toolbar.querySelector('.gp-album-access-btn');
        if (albBtn) {
          if (!names.length) {
            albBtn.textContent = 'Not in an album';
            albBtn.style.color = 'var(--gp-error)';
            albBtn.onclick = null;
            albBtn.disabled = true;
            albBtn.title = 'This item is not in an album';
            albBtn.setAttribute('aria-label', 'This item is not in an album');
          } else {
            const remainingCount = Math.max(0, names.length - 1);
            albBtn.textContent = remainingCount ? `${names[0].title} +${remainingCount}` : names[0].title;
            albBtn.style.color = 'inherit';
            albBtn.style.cursor = 'pointer';
            albBtn.disabled = false;
            albBtn.title = names.map(a => a.title).join(', ');
            albBtn.setAttribute('aria-label', `Open album ${names[0].title}`);
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
      const hoverCard = tile?.querySelector('.gp-hover-card');
      const fnText = hoverCard?.querySelector('.gp-filename-row .gp-text');
      if (fnText) fnText.textContent = 'Could not load file details';
      toast('Could not load file details. Hover again to retry.', { tone: 'error' });
    }
  }

  function hideHoverUI(tile) {
    if (!tile) return;
    const hoverCard = tile.querySelector('.gp-hover-card');
    if (hoverCard) {
      hoverCard.classList.remove('gp-hover-card--show');
      setTimeout(() => {
        if (hoverCard.parentNode && !tile.matches(':hover, :focus-within')) {
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

  function syncAlbumOverlayRadius(card, imgContainer, overlay) {
    const candidates = [imgContainer, card.querySelector('img'), card].filter(Boolean);
    const radiusSource = candidates.find(candidate => {
      const style = window.getComputedStyle(candidate);
      return [
        style.borderTopLeftRadius,
        style.borderTopRightRadius,
        style.borderBottomRightRadius,
        style.borderBottomLeftRadius
      ].some(radius => Number.parseFloat(radius) > 0);
    });

    if (radiusSource) {
      overlay.style.setProperty(
        '--gpd-album-card-radius',
        window.getComputedStyle(radiusSource).borderRadius
      );
    }
  }

  function renderFileList(container, items) {
    container.innerHTML = '';
    if (!items || !items.length) {
      const empty = document.createElement('div');
      empty.className = 'gpd-album-empty';
      empty.textContent = 'No photos or videos found in this album.';
      container.appendChild(empty);
      return;
    }
    items.forEach(item => {
      const itemDiv = document.createElement('button');
      itemDiv.type = 'button';
      itemDiv.className = 'gpd-album-file-row';
      itemDiv.title = item.filename;
      itemDiv.setAttribute('aria-label', `Copy filename ${item.filename}`);

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
      sizeSpan.className = 'gpd-album-file-size';
      sizeSpan.textContent = formatBytes(item.size);
      sizeSpan.style.whiteSpace = 'nowrap';

      itemDiv.onclick = async (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        const cleanName = item.filename.replace(/\s*\([^)]+\)$/, '');
        try {
          await navigator.clipboard.writeText(cleanName);
          const originalText = nameSpan.textContent;
          nameSpan.textContent = 'Filename copied';
          nameSpan.style.color = 'var(--gp-success)';
          toast('Filename copied', { tone: 'success' });
          setTimeout(() => {
            nameSpan.textContent = originalText;
            nameSpan.style.color = '';
          }, 1000);
        } catch (error) {
          console.warn('[GP-Master] Album filename copy failed', error);
          toast('Could not copy the filename.', { tone: 'error' });
        }
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
        overlay.setAttribute('role', 'region');
        overlay.setAttribute('aria-label', 'Album file details');
        
        const header = document.createElement('div');
        header.className = 'gpd-album-summary';
        
        sizeText = document.createElement('span');
        sizeText.setAttribute('role', 'status');
        sizeText.setAttribute('aria-live', 'polite');
        sizeText.textContent = 'Loading album details…';
        
        header.appendChild(sizeText);
        overlay.appendChild(header);

        listContainer = document.createElement('div');
        listContainer.className = 'gpd-album-hover-list';
        overlay.appendChild(listContainer);
        
        imgContainer.appendChild(overlay);
        syncAlbumOverlayRadius(card, imgContainer, overlay);
    } else {
        sizeText = overlay.querySelector('span');
        listContainer = overlay.querySelector('.gpd-album-hover-list');
    }

    setTimeout(() => {
        overlay.classList.add('gpd-album-hover-details--show');
    }, 10);

    let cached = albumDetailsCache.get(key);
    if (cached && !cached.isLoading && Date.now() - cached.time > CACHE_TTL) {
        albumDetailsCache.delete(key);
        cached = null;
    }
    if (cached) {
        if (cached.isLoading) {
            sizeText.textContent = 'Loading album details…';
        } else {
            sizeText.textContent = formatBytes(cached.size);
            renderFileList(listContainer, cached.items);
        }
        return;
    }

    sizeText.textContent = 'Loading album details…';
    albumDetailsCache.set(key, { count: 0, size: 0, items: [], isLoading: true, time: Date.now() });

    try {
        const details = await fetchAlbumDetails(key, (fetched, total) => {
            if (extractAlbumKey(card) === key && card.matches(':hover, :focus-within')) {
                sizeText.textContent = `Loading album details · ${fetched}/${total}`;
            }
        });
        albumDetailsCache.set(key, {
            count: details.count,
            size: details.size,
            items: details.items,
            isLoading: false,
            time: Date.now()
        });
        if (extractAlbumKey(card) === key && card.matches(':hover, :focus-within')) {
            sizeText.textContent = formatBytes(details.size);
            renderFileList(listContainer, details.items);
        }
    } catch (err) {
        console.error('Failed to load album details:', err);
        sizeText.textContent = 'Could not load album details';
        toast('Could not load album details. Hover again to retry.', { tone: 'error' });
        albumDetailsCache.delete(key);
    }
  }

  function handleAlbumMouseLeave(e) {
    const card = e.currentTarget;
    if (card.matches(':focus-within')) return;
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
    if (document.hidden) return;
    updateThemeClass();
    
    cleanupInactiveHoverUI();

    document.querySelectorAll('.RY3tic').forEach(tile => {
      if (!tile.hasAttribute('data-gp-master-attached')) {
        attachTile(tile);
      } else {
        // Handle recycled DOM tiles from Google Photos virtual scrolling
        const currentKey = extractMediaKey(tile);
        const oldKey = tile.getAttribute('data-gp-media-key');
        if (currentKey && currentKey !== oldKey) {
          tile.querySelector('.gp-hover-card')?.remove();
          tile._gpIsHovered = false;
          if (activeHoveredTile === tile) activeHoveredTile = null;
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

  function cleanupInactiveHoverUI() {
    if (activeHoveredTile && !activeHoveredTile.matches(':hover, :focus-within')) {
      activeHoveredTile._gpIsHovered = false;
      hideHoverUI(activeHoveredTile);
      activeHoveredTile = null;
    }
    if (activeHoveredAlbumCard && !activeHoveredAlbumCard.matches(':hover, :focus-within')) {
      activeHoveredAlbumCard._gpIsHovered = false;
      handleAlbumMouseLeave({ currentTarget: activeHoveredAlbumCard });
      activeHoveredAlbumCard = null;
    }
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
        if (tile.matches(':focus-within')) return;
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
      if (card.matches(':focus-within')) return;
      if (card._gpIsHovered) {
        card._gpIsHovered = false;
        if (activeHoveredAlbumCard === card) activeHoveredAlbumCard = null;
        handleAlbumMouseLeave({ currentTarget: card });
      }
    }
  });

  // Keyboard parity: reveal the same controls when a photo or album receives focus.
  document.body.addEventListener('focusin', e => {
    if (!e.target || typeof e.target.closest !== 'function') return;

    const tileTarget = e.target.closest('.RY3tic, .QcpS9c.ckGgle');
    if (tileTarget) {
      const tile = tileTarget.classList.contains('RY3tic') ? tileTarget : getTile(tileTarget);
      if (tile && !tile._gpIsHovered) {
        tile._gpIsHovered = true;
        activeHoveredTile = tile;
        showHoverUI(tile, e);
      }
      return;
    }

    const card = e.target.closest('a[href*="/album/"], a[href*="/share/"], a[href*="/direct/"]');
    if (card && !(card.getAttribute('href') || '').includes('/photo/') && !card._gpIsHovered) {
      card._gpIsHovered = true;
      activeHoveredAlbumCard = card;
      handleAlbumMouseEnter({ currentTarget: card });
    }
  });

  document.body.addEventListener('focusout', e => {
    if (!e.target || typeof e.target.closest !== 'function') return;
    const tile = e.target.closest('.RY3tic');
    const card = e.target.closest('a[href*="/album/"], a[href*="/share/"], a[href*="/direct/"]');

    setTimeout(() => {
      if (tile && !tile.matches(':focus-within, :hover')) {
        tile._gpIsHovered = false;
        if (activeHoveredTile === tile) activeHoveredTile = null;
        hideHoverUI(tile);
      }
      if (card && !card.matches(':focus-within, :hover')) {
        card._gpIsHovered = false;
        if (activeHoveredAlbumCard === card) activeHoveredAlbumCard = null;
        handleAlbumMouseLeave({ currentTarget: card });
      }
    }, 0);
  });

  // Throttled fallback cleanup for hover states missed by recycled DOM nodes.
  let mousemoveTimeout = null;
  document.body.addEventListener('mousemove', () => {
    if (mousemoveTimeout) return;
    mousemoveTimeout = setTimeout(() => {
      cleanupInactiveHoverUI();
      mousemoveTimeout = null;
    }, 250);
  }, { passive: true });

  new MutationObserver(debouncedScan).observe(document.body, { childList: true, subtree: true });
  setInterval(scan, 1500);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) debouncedScan();
  });
  scan(); // initial attach

  /* =============================================================
   *  8. INITIALIZATION
   * ============================================================= */
  let cacheClearTimer = null;
  const triggerCacheClear = () => {
    log('Album update detected! Clearing cache...');
    albumCache.clear();
    albumDetailsCache.clear();
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
      albumDetailsCache.clear();

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

  log('Standalone metadata API ready. Hover overlays are active.');
  document.querySelectorAll('.RY3tic[data-gp-master-attached]').forEach(tile => {
    visibleObserver.unobserve(tile);
    visibleObserver.observe(tile);
  });
  scan(); // Rescan to immediately trigger prefetch for visible items
})();

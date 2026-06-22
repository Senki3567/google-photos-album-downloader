// ==UserScript==
// @name         Google Photos File Browser
// @namespace    https://github.com/Senki3567/google-photos-album-downloader
// @version      1.1.0
// @description  Browse and manage Google Photos albums as folders and media as files in an integrated file-browser interface.
// @author       Antigravity
// @license      MIT
// @match        https://photos.google.com/*
// @run-at       document-end
// @grant        none
// @noframes
// ==/UserScript==

/*
MIT License

Copyright (c) 2026 Antigravity
Google Photos RPC and parser portions Copyright (c) 2024 xob0t

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

(function () {
  'use strict';

  if (window.top !== window.self) return;

  const RPC_TIMEOUT_MS = 15000;
  const RPC_MAX_ATTEMPTS = 3;
  const PAGE_SIZE = 100;
  const META_CHUNK_SIZE = 50;
  const OPERATION_CHUNK_SIZE = 500;

  const state = {
    open: false,
    busy: false,
    view: 'albums',
    viewMode: 'grid',
    generation: 0,
    currentAlbum: null,
    albums: [],
    albumsNextPageId: null,
    albumsFullyLoaded: false,
    items: [],
    filteredItems: [],
    selected: new Set(),
    nextPageId: null,
    query: '',
    metadata: new Map()
  };

  const refs = {};

  const ICONS = {
    files: 'M4 4h6l2 2h8v14H4V4zm2 4v10h12V8H6z',
    photo: 'M21 19V5H3v14h18zm-2-2H5V7h14v10zm-1-1-4.5-6-3.5 4.5-2-2.5L6 16h12z',
    albums: 'M4 4h16v12H4V4zm2 2v8h12V6H6zm-2 12h16v2H4v-2z',
    favorite: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
    close: 'M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.41 4.29 19.71 2.88 18.3 9.17 12 2.88 5.7 4.29 4.29l6.3 6.3 6.3-6.3 1.41 1.42z',
    refresh: 'M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.09 0-7.19 3.72-6.39 7.69l-2.08.68C2.39 7.3 6.24 2 12 2c2.76 0 5.26 1.12 7.07 2.93L22 2v8h-8l3.65-3.65zM6.35 17.65C7.8 19.1 9.79 20 12 20c4.09 0 7.19-3.72 6.39-7.69l2.08-.68C21.61 16.7 17.76 22 12 22c-2.76 0-5.26-1.12-7.07-2.93L2 22v-8h8l-3.65 3.65z',
    folderAdd: 'M10 4H2v16h20V6H12l-2-2zm2 9h3v-3h2v3h3v2h-3v3h-2v-3h-3v-2z',
    copy: 'M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z',
    download: 'M5 20h14v-2H5v2zm7-17v10.17l3.59-3.58L17 11l-5 5-5-5 1.41-1.41L11 13.17V3h1z',
    move: 'M10 4H2v16h20V6H12l-2-2zm2.5 5 4 4-4 4v-3H8v-2h4.5V9z',
    remove: 'M6 7h12v2H6V7zm2 3h8v9H8v-9zm2 2v5h4v-5h-4z',
    trash: 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zm3.46-7.12 1.41-1.41L12 11.59l1.12-1.12 1.41 1.41L13.41 13l1.12 1.12-1.41 1.41L12 14.41l-1.12 1.12-1.41-1.41L10.59 13l-1.13-1.12zM15.5 4l-1-1h-5l-1 1H5v2h14V4z',
    open: 'M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3zM5 5h6V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6h-2v6H5V5z',
    check: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
    search: 'M9.5 3a6.5 6.5 0 1 0 3.98 11.64L19.85 21 21 19.85l-6.36-6.37A6.5 6.5 0 0 0 9.5 3zm0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z',
    upload: 'M5 20h14v-2H5v2zm7-17 5 5-1.41 1.41L13 6.83V16h-2V6.83L8.41 9.41 7 8l5-5z',
    grid: 'M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z',
    list: 'M4 5h3v3H4V5zm5 0h11v3H9V5zM4 10.5h3v3H4v-3zm5 0h11v3H9v-3zM4 16h3v3H4v-3zm5 0h11v3H9v-3z',
    restore: 'M7.5 5H3v4.5l1.75-1.75A8 8 0 1 1 4 14h2a6 6 0 1 0 .45-2.28L9 9.17V5H7.5z'
  };

  function svgIcon(name, size = 20) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ICONS[name]);
    svg.appendChild(path);
    return svg;
  }

  function button(label, icon, className = '') {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `gpfb-button ${className}`.trim();
    el.append(svgIcon(icon, 18), document.createTextNode(label));
    return el;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(Number(bytes)) || Number(bytes) <= 0) return '';
    const value = Number(bytes);
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    return `${(value / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
  }

  function formatDate(timestamp) {
    if (!timestamp) return '';
    return new Date(Number(timestamp)).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function thumbnailUrl(url, width = 480, height = 320) {
    if (!url) return '';
    return `${url}=w${width}-h${height}-c-k-no`;
  }

  function updateTheme() {
    const color = getComputedStyle(document.body).color.match(/\d+/g);
    const dark = color && Number(color[0]) > 130 && Number(color[1]) > 130 && Number(color[2]) > 130;
    document.body.classList.toggle('gpfb-dark', Boolean(dark));
  }

  async function sendRpc(rpcid, data) {
    const wiz = window.WIZ_global_data;
    if (!wiz) throw new Error('Google Photos is not ready. Refresh the page.');

    const path = `${wiz.Im6cmf || wiz.eptZe || '/_/PhotosUi/'}`.replace(/\/?$/, '/');
    const params = new URLSearchParams({
      rpcids: rpcid,
      'source-path': location.pathname,
      'f.sid': wiz.FdrFJe,
      bl: wiz.cfb2h,
      rt: 'c'
    });
    if (wiz.Dbw5Ud) params.set('rapt', wiz.Dbw5Ud);

    const body = new URLSearchParams();
    body.set('f.req', JSON.stringify([[[rpcid, JSON.stringify(data), null, 'generic']]]));
    body.set('at', wiz.SNlM0e);

    let lastError;
    for (let attempt = 1; attempt <= RPC_MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
      try {
        const response = await fetch(`${location.origin}${path}data/batchexecute?${params}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: body.toString(),
          signal: controller.signal
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        for (const line of text.split('\n')) {
          if (!line.includes('wrb.fr')) continue;
          const envelope = JSON.parse(line);
          if (envelope?.[0]?.[2]) return JSON.parse(envelope[0][2]);
        }
        throw new Error(`RPC ${rpcid} returned no payload`);
      } catch (error) {
        lastError = error.name === 'AbortError' ? new Error(`RPC ${rpcid} timed out`) : error;
        if (attempt < RPC_MAX_ATTEMPTS) await sleep(400 * attempt);
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError || new Error(`RPC ${rpcid} failed`);
  }

  function parseMedia(item) {
    return {
      kind: 'file',
      mediaKey: item?.[0],
      thumb: item?.[1]?.[0],
      width: item?.[1]?.[1],
      height: item?.[1]?.[2],
      timestamp: item?.[2],
      dedupKey: item?.[3],
      creationTimestamp: item?.[5],
      isFavorite: Boolean(item?.at(-1)?.[163238866]?.[0]),
      duration: item?.at(-1)?.[76647426]?.[0]
    };
  }

  function parseAlbum(item) {
    const meta = item?.at(-1)?.[72930366];
    return {
      kind: 'folder',
      mediaKey: item?.[0],
      title: meta?.[1] || 'Untitled album',
      thumb: item?.[1]?.[0],
      itemCount: meta?.[3] || 0,
      modifiedTimestamp: meta?.[2]?.[9],
      authKey: meta?.[5] || null,
      isShared: Boolean(meta?.[4])
    };
  }

  function parseAlbumPage(raw) {
    return {
      items: (raw?.[1] || []).map(parseMedia).filter(item => item.mediaKey),
      nextPageId: raw?.[2] || null,
      title: raw?.[3]?.[1] || state.currentAlbum?.title || 'Album'
    };
  }

  function parseGenericPage(raw) {
    return {
      items: (raw?.[0] || []).map(parseMedia).filter(item => item.mediaKey),
      nextPageId: raw?.[1] || null
    };
  }

  function parseTrashPage(raw) {
    return {
      items: (raw?.[0] || []).map(parseMedia).filter(item => item.mediaKey),
      nextPageId: raw?.[1] || null
    };
  }

  function parseBatchMetadata(raw) {
    const rows = raw?.[0]?.[1];
    if (!Array.isArray(rows)) return [];
    return rows.map(row => ({
      mediaKey: row?.[0],
      filename: row?.[1]?.[3] || 'Untitled',
      size: row?.[1]?.[9] || null
    })).filter(item => item.mediaKey);
  }

  async function getAlbumsPage(nextPageId = null) {
    const raw = await sendRpc('Z5xsfc', [nextPageId, null, null, null, 1, null, null, PAGE_SIZE, [2], 5]);
    return {
      items: (raw?.[0] || []).map(parseAlbum).filter(album => album.mediaKey),
      nextPageId: raw?.[1] || null
    };
  }

  async function getLibraryPage(nextPageId = null) {
    return parseGenericPage(await sendRpc('EzkLib', ['', [[4, 'ra', 0, 0]], nextPageId]));
  }

  async function getFavoritesPage(nextPageId = null) {
    return parseGenericPage(await sendRpc('EzkLib', ['Favorites', [[5, '8', 0, 9]], nextPageId]));
  }

  async function getTrashPage(nextPageId = null) {
    return parseTrashPage(await sendRpc('zy0IHe', [nextPageId]));
  }

  async function getAlbumPage(album, nextPageId = null) {
    return parseAlbumPage(await sendRpc('snAcKc', [album.mediaKey, nextPageId, null, album.authKey]));
  }

  async function getMetadata(keys) {
    if (!keys.length) return [];
    const mapped = keys.map(key => [key]);
    const fields = [...Array(24).fill(null), [], ...Array(10).fill(null), []];
    return parseBatchMetadata(await sendRpc('EWgK9e', [[[mapped], [fields]]]));
  }

  async function resolveDownloadUrl(item) {
    if (item.downloadUrl) return item.downloadUrl;
    const raw = await sendRpc('VrseUb', [
      item.mediaKey,
      null,
      state.currentAlbum?.authKey || null,
      null,
      state.currentAlbum?.mediaKey || null
    ]);
    item.downloadUrl = raw?.[7] || raw?.[1] || null;
    return item.downloadUrl;
  }

  async function createAlbum(title) {
    const raw = await sendRpc('OXvT9d', [title, null, 2]);
    return raw?.[0]?.[0];
  }

  async function addToAlbum(keys, albumKey) {
    return sendRpc('E1Cajb', [keys, albumKey]);
  }

  async function removeFromAlbum(keys) {
    return sendRpc('ycV3Nd', [keys]);
  }

  async function moveToTrash(dedupKeys) {
    return sendRpc('XwAOJf', [null, 1, dedupKeys, 3]);
  }

  async function restoreFromTrash(dedupKeys) {
    return sendRpc('XwAOJf', [null, 3, dedupKeys, 2]);
  }

  async function setFavorite(dedupKeys, favorite) {
    const mapped = dedupKeys.map(key => [null, key]);
    return sendRpc('Ftfh0', [mapped, [favorite ? 1 : 2]]);
  }

  async function runInChunks(values, operation) {
    for (let offset = 0; offset < values.length; offset += OPERATION_CHUNK_SIZE) {
      await operation(values.slice(offset, offset + OPERATION_CHUNK_SIZE));
    }
  }

  function injectStyle() {
    const style = document.createElement('style');
    style.textContent = `
      body {
        --gpfb-blue: #0b57d0;
        --gpfb-blue-soft: rgba(11, 87, 208, .10);
        --gpfb-on-blue: #041e49;
        --gpfb-glass: rgba(255,255,255,.76);
        --gpfb-surface: rgba(255,255,255,.62);
        --gpfb-outline: rgba(60,64,67,.16);
        --gpfb-text: #202124;
        --gpfb-secondary: #5f6368;
        --gpfb-shadow: 0 12px 36px rgba(32,33,36,.16);
      }
      body.gpfb-dark {
        --gpfb-blue: #a8c7fa;
        --gpfb-blue-soft: rgba(168,199,250,.12);
        --gpfb-on-blue: #d3e3fd;
        --gpfb-glass: rgba(28,28,30,.78);
        --gpfb-surface: rgba(36,36,39,.68);
        --gpfb-outline: rgba(255,255,255,.14);
        --gpfb-text: #f1f3f4;
        --gpfb-secondary: #bdc1c6;
        --gpfb-shadow: 0 14px 42px rgba(0,0,0,.34);
      }
      #gpfb-launcher {
        position: fixed;
        left: 24px;
        bottom: 84px;
        z-index: 999998;
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--gpfb-outline);
        border-radius: 18px;
        color: var(--gpfb-text);
        background: var(--gpfb-glass);
        box-shadow: var(--gpfb-shadow);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        cursor: pointer;
        transition: border-radius 220ms cubic-bezier(.2,0,0,1.25), background 160ms ease;
      }
      #gpfb-launcher:hover { border-radius: 24px; background: color-mix(in srgb, var(--gpfb-glass) 90%, var(--gpfb-blue)); }
      #gpfb-root {
        position: fixed;
        inset: 0;
        z-index: 1000000;
        display: none;
        padding: 18px;
        box-sizing: border-box;
        color: var(--gpfb-text);
        font-family: "Google Sans", Roboto, Arial, sans-serif;
        background: rgba(18,18,20,.24);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
      }
      #gpfb-root[data-open="true"] { display: flex; }
      .gpfb-shell {
        width: min(1440px, 100%);
        height: 100%;
        margin: auto;
        overflow: hidden;
        display: grid;
        grid-template-rows: auto 1fr auto;
        border: 1px solid var(--gpfb-outline);
        border-radius: 28px;
        background: var(--gpfb-glass);
        box-shadow: var(--gpfb-shadow);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
      }
      .gpfb-topbar, .gpfb-footer {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 16px;
        border-color: var(--gpfb-outline);
      }
      .gpfb-topbar { border-bottom: 1px solid var(--gpfb-outline); }
      .gpfb-footer { min-height: 34px; border-top: 1px solid var(--gpfb-outline); color: var(--gpfb-secondary); font-size: 12px; }
      .gpfb-brand { display: flex; align-items: center; gap: 10px; min-width: 220px; font-size: 17px; font-weight: 700; }
      .gpfb-brand-mark {
        width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
        border-radius: 16px; color: var(--gpfb-on-blue); background: var(--gpfb-blue-soft);
      }
      .gpfb-search {
        flex: 1;
        height: 44px;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 0 14px;
        border: 1px solid var(--gpfb-outline);
        border-radius: 18px;
        background: transparent;
      }
      .gpfb-search input {
        width: 100%; border: 0; outline: 0; color: inherit; background: transparent; font: inherit;
      }
      .gpfb-body { min-height: 0; display: grid; grid-template-columns: 230px 1fr; }
      .gpfb-sidebar { padding: 14px; border-right: 1px solid var(--gpfb-outline); overflow-y: auto; }
      .gpfb-nav {
        width: 100%; min-height: 44px; display: flex; align-items: center; gap: 12px;
        padding: 0 14px; border: 0; border-radius: 16px; color: inherit; background: transparent;
        font-family: inherit; font-size: 13px; font-weight: 600; line-height: 1; cursor: pointer; text-align: left;
      }
      .gpfb-nav:hover, .gpfb-nav[data-active="true"] { color: var(--gpfb-on-blue); background: var(--gpfb-blue-soft); }
      .gpfb-main { min-width: 0; min-height: 0; display: grid; grid-template-rows: auto auto 1fr; }
      .gpfb-path { display: flex; align-items: center; gap: 8px; padding: 14px 18px 8px; font-size: 18px; font-weight: 700; }
      .gpfb-toolbar { display: flex; align-items: center; gap: 8px; padding: 8px 18px 12px; overflow-x: auto; }
      .gpfb-button {
        min-height: 40px; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        padding: 0 13px; border: 1px solid var(--gpfb-outline); border-radius: 15px; color: inherit;
        background: transparent; font-family: inherit; font-size: 12px; font-weight: 600; line-height: 1; white-space: nowrap; cursor: pointer;
        transition: border-radius 180ms ease, background 160ms ease;
      }
      .gpfb-button:hover:not(:disabled) { border-radius: 20px; background: var(--gpfb-blue-soft); }
      .gpfb-button:disabled { opacity: .38; cursor: default; }
      .gpfb-button--icon { width: 42px; padding: 0; }
      .gpfb-button--primary { color: var(--gpfb-on-blue); border-color: color-mix(in srgb, var(--gpfb-blue) 28%, transparent); background: var(--gpfb-blue-soft); }
      .gpfb-content { min-height: 0; overflow-y: auto; padding: 6px 18px 24px; }
      .gpfb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
      .gpfb-grid[data-view="list"] { display: flex; flex-direction: column; gap: 7px; }
      .gpfb-card {
        position: relative; min-width: 0; overflow: hidden; border: 1px solid var(--gpfb-outline);
        border-radius: 20px; color: inherit; background: var(--gpfb-surface); cursor: pointer;
        transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
        content-visibility: auto; contain-intrinsic-size: 240px;
      }
      .gpfb-card:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--gpfb-blue) 48%, var(--gpfb-outline)); }
      .gpfb-card[data-selected="true"] { border-color: var(--gpfb-blue); background: var(--gpfb-blue-soft); }
      .gpfb-grid[data-view="list"] .gpfb-card {
        display: grid; grid-template-columns: 76px minmax(0, 1fr); min-height: 64px; border-radius: 16px;
      }
      .gpfb-grid[data-view="list"] .gpfb-card:hover { transform: none; }
      .gpfb-thumb { position: relative; aspect-ratio: 16/10; overflow: hidden; background: rgba(127,127,127,.1); }
      .gpfb-grid[data-view="list"] .gpfb-thumb { width: 76px; height: 64px; aspect-ratio: auto; }
      .gpfb-grid[data-view="list"] .gpfb-folder-thumb svg { width: 34px; height: 34px; }
      .gpfb-grid[data-view="list"] .gpfb-card-info { min-width: 0; display: flex; flex-direction: column; justify-content: center; padding: 9px 12px; }
      .gpfb-thumb img { width: 100%; height: 100%; display: block; object-fit: cover; }
      .gpfb-folder-thumb { display: flex; align-items: center; justify-content: center; color: var(--gpfb-blue); }
      .gpfb-folder-thumb svg { width: 64px; height: 64px; opacity: .82; }
      .gpfb-card-info { padding: 11px 12px 12px; }
      .gpfb-card-title { overflow: hidden; color: var(--gpfb-text); font-size: 13px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
      .gpfb-card-meta { margin-top: 4px; overflow: hidden; color: var(--gpfb-secondary); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
      .gpfb-select {
        position: absolute; top: 9px; right: 9px; width: 28px; height: 28px; display: flex;
        align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,.6); border-radius: 50%;
        color: white; background: rgba(32,33,36,.48); opacity: 0; transition: opacity 120ms ease;
      }
      .gpfb-card:hover .gpfb-select, .gpfb-card[data-selected="true"] .gpfb-select { opacity: 1; }
      .gpfb-card[data-selected="true"] .gpfb-select { background: var(--gpfb-blue); }
      .gpfb-empty { min-height: 260px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--gpfb-secondary); text-align: center; }
      .gpfb-empty svg { width: 52px; height: 52px; color: var(--gpfb-blue); }
      .gpfb-load { display: flex; justify-content: center; padding: 20px; }
      .gpfb-spinner { width: 20px; height: 20px; border: 2px solid var(--gpfb-outline); border-top-color: var(--gpfb-blue); border-radius: 50%; animation: gpfb-spin .8s linear infinite; }
      #gpfb-toast {
        position: fixed; right: 24px; bottom: 24px; z-index: 1000002; max-width: 360px;
        padding: 12px 16px; border: 1px solid var(--gpfb-outline); border-radius: 18px;
        color: var(--gpfb-text); background: var(--gpfb-glass); box-shadow: var(--gpfb-shadow);
        opacity: 0; transform: translateY(8px); pointer-events: none; transition: opacity 160ms ease, transform 160ms ease;
        backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
      }
      #gpfb-toast[data-visible="true"] { opacity: 1; transform: translateY(0); }
      .gpfb-dialog-backdrop {
        position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center;
        padding: 20px; background: rgba(18,18,20,.28);
      }
      .gpfb-dialog {
        width: min(460px, 100%); max-height: min(620px, 90vh); overflow: auto; padding: 18px;
        border: 1px solid var(--gpfb-outline); border-radius: 24px; background: var(--gpfb-glass);
        box-shadow: var(--gpfb-shadow); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
      }
      .gpfb-dialog h2 { margin: 0 0 6px; font-size: 18px; }
      .gpfb-dialog p { margin: 0 0 14px; color: var(--gpfb-secondary); font-size: 13px; }
      .gpfb-dialog input, .gpfb-dialog select {
        width: 100%; height: 44px; box-sizing: border-box; padding: 0 12px; border: 1px solid var(--gpfb-outline);
        border-radius: 14px; color: var(--gpfb-text); background: var(--gpfb-glass); font: inherit;
        color-scheme: light;
      }
      body.gpfb-dark .gpfb-dialog input, body.gpfb-dark .gpfb-dialog select { color-scheme: dark; }
      .gpfb-dialog select option { color: #202124; background: #fff; }
      body.gpfb-dark .gpfb-dialog select option { color: #f1f3f4; background: #202124; }
      .gpfb-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
      @keyframes gpfb-spin { to { transform: rotate(360deg); } }
      @media (max-width: 760px) {
        #gpfb-root { padding: 0; }
        .gpfb-shell { border-radius: 0; border: 0; }
        .gpfb-body { grid-template-columns: 72px 1fr; }
        .gpfb-sidebar { padding: 10px 8px; }
        .gpfb-nav { justify-content: center; padding: 0; font-size: 0; }
        .gpfb-brand { min-width: auto; }
        .gpfb-brand span:last-child { display: none; }
        .gpfb-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
      }
      @media (prefers-reduced-motion: reduce) { *[class^="gpfb"], *[class*=" gpfb"] { transition-duration: 1ms !important; animation-duration: 1ms !important; } }
    `;
    document.head.appendChild(style);
  }

  function buildUi() {
    refs.launcher = document.createElement('button');
    refs.launcher.id = 'gpfb-launcher';
    refs.launcher.type = 'button';
    refs.launcher.title = 'Open Google Photos File Browser';
    refs.launcher.setAttribute('aria-label', 'Open Google Photos File Browser');
    refs.launcher.appendChild(svgIcon('files', 22));

    refs.root = document.createElement('div');
    refs.root.id = 'gpfb-root';
    refs.root.dataset.open = 'false';

    const shell = document.createElement('section');
    shell.className = 'gpfb-shell';
    shell.setAttribute('role', 'dialog');
    shell.setAttribute('aria-label', 'Google Photos File Browser');

    const topbar = document.createElement('header');
    topbar.className = 'gpfb-topbar';
    const brand = document.createElement('div');
    brand.className = 'gpfb-brand';
    const brandMark = document.createElement('span');
    brandMark.className = 'gpfb-brand-mark';
    brandMark.appendChild(svgIcon('files', 22));
    brand.append(brandMark, Object.assign(document.createElement('span'), { textContent: 'Photos Files' }));

    const search = document.createElement('label');
    search.className = 'gpfb-search';
    search.appendChild(svgIcon('search', 18));
    refs.search = document.createElement('input');
    refs.search.type = 'search';
    refs.search.placeholder = 'Search current folder';
    search.appendChild(refs.search);

    refs.refresh = button('', 'refresh', 'gpfb-button--icon');
    refs.refresh.title = 'Refresh';
    refs.close = button('', 'close', 'gpfb-button--icon');
    refs.close.title = 'Close';
    topbar.append(brand, search, refs.refresh, refs.close);

    const body = document.createElement('div');
    body.className = 'gpfb-body';
    const sidebar = document.createElement('aside');
    sidebar.className = 'gpfb-sidebar';
    refs.navAlbums = navButton('Albums', 'albums', 'albums');
    refs.navLibrary = navButton('Library', 'photo', 'library');
    refs.navFavorites = navButton('Favorites', 'favorite', 'favorites');
    refs.navTrash = navButton('Trash', 'trash', 'trash');
    sidebar.append(refs.navAlbums, refs.navLibrary, refs.navFavorites, refs.navTrash);

    const main = document.createElement('main');
    main.className = 'gpfb-main';
    refs.path = document.createElement('div');
    refs.path.className = 'gpfb-path';
    refs.toolbar = document.createElement('div');
    refs.toolbar.className = 'gpfb-toolbar';
    refs.content = document.createElement('div');
    refs.content.className = 'gpfb-content';
    main.append(refs.path, refs.toolbar, refs.content);
    body.append(sidebar, main);

    refs.footer = document.createElement('footer');
    refs.footer.className = 'gpfb-footer';
    shell.append(topbar, body, refs.footer);
    refs.root.appendChild(shell);

    refs.toast = document.createElement('div');
    refs.toast.id = 'gpfb-toast';
    refs.toast.setAttribute('role', 'status');
    document.body.append(refs.launcher, refs.root, refs.toast);

    refs.launcher.addEventListener('click', openBrowser);
    refs.close.addEventListener('click', closeBrowser);
    refs.refresh.addEventListener('click', refreshCurrent);
    refs.search.addEventListener('input', () => {
      state.query = refs.search.value.trim().toLowerCase();
      applyFilterAndSort();
      renderContent();
    });
    refs.root.addEventListener('click', event => {
      if (event.target === refs.root) closeBrowser();
    });
    document.addEventListener('keydown', event => {
      if (!state.open) return;
      if (event.key === 'Escape' && !refs.root.querySelector('.gpfb-dialog-backdrop')) closeBrowser();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a' && !event.target.matches('input,textarea')) {
        event.preventDefault();
        selectAllVisible();
      }
    });
  }

  function navButton(label, icon, view) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'gpfb-nav';
    el.dataset.view = view;
    el.append(svgIcon(icon, 20), document.createTextNode(label));
    el.addEventListener('click', () => navigate(view));
    return el;
  }

  function toast(message) {
    refs.toast.textContent = message;
    refs.toast.dataset.visible = 'true';
    clearTimeout(refs.toast._timer);
    refs.toast._timer = setTimeout(() => {
      refs.toast.dataset.visible = 'false';
    }, 2600);
  }

  function setBusy(busy, message = '') {
    state.busy = busy;
    refs.refresh.disabled = busy;
    refs.footer.replaceChildren();
    if (busy) {
      const spinner = document.createElement('span');
      spinner.className = 'gpfb-spinner';
      refs.footer.append(spinner, document.createTextNode(message || 'Working…'));
    } else {
      updateFooter();
    }
  }

  function updateFooter() {
    const total = state.filteredItems.length;
    const selected = state.selected.size;
    const noun = state.view === 'albums' ? 'folders' : 'files';
    refs.footer.textContent = `${total} ${noun}${selected ? ` · ${selected} selected` : ''}`;
  }

  async function openBrowser() {
    state.open = true;
    refs.root.dataset.open = 'true';
    document.documentElement.style.overflow = 'hidden';
    updateTheme();
    if (!state.albums.length) await navigate('albums');
  }

  function closeBrowser() {
    state.open = false;
    refs.root.dataset.open = 'false';
    document.documentElement.style.overflow = '';
  }

  async function navigate(view, album = null) {
    if (state.busy) return;
    const generation = ++state.generation;
    state.view = view;
    state.currentAlbum = album;
    state.items = [];
    state.filteredItems = [];
    state.selected.clear();
    state.nextPageId = null;
    state.query = '';
    refs.search.value = '';
    renderChrome();
    setBusy(true, 'Loading…');
    try {
      if (view === 'albums') {
        const page = await getAlbumsPage();
        if (generation !== state.generation) return;
        state.albums = page.items;
        state.albumsNextPageId = page.nextPageId;
        state.albumsFullyLoaded = !page.nextPageId;
        state.items = state.albums;
      } else {
        const page = view === 'library'
          ? await getLibraryPage()
          : view === 'favorites'
            ? await getFavoritesPage()
            : view === 'trash'
              ? await getTrashPage()
              : await getAlbumPage(album);
        if (generation !== state.generation) return;
        state.items = page.items;
        state.nextPageId = page.nextPageId;
      }
      applyFilterAndSort();
      renderChrome();
      renderContent();
      if (view !== 'albums') void hydrateMetadata(state.items, generation);
    } catch (error) {
      console.error('[GP File Browser] Navigation failed', error);
      renderEmpty('Could not load this location', error.message);
      toast('Could not load Google Photos data.');
    } finally {
      setBusy(false);
    }
  }

  async function refreshCurrent() {
    if (state.view === 'album') await navigate('album', state.currentAlbum);
    else await navigate(state.view);
  }

  function renderChrome() {
    refs.navAlbums.dataset.active = String(state.view === 'albums' || state.view === 'album');
    refs.navLibrary.dataset.active = String(state.view === 'library');
    refs.navFavorites.dataset.active = String(state.view === 'favorites');
    refs.navTrash.dataset.active = String(state.view === 'trash');
    refs.path.textContent = state.view === 'album'
      ? `Albums / ${state.currentAlbum?.title || 'Album'}`
      : ({ albums: 'Albums', library: 'Library', favorites: 'Favorites', trash: 'Trash' }[state.view] || 'Photos');
    renderToolbar();
    updateFooter();
  }

  function renderToolbar() {
    refs.toolbar.replaceChildren();
    const gridView = button('', 'grid', 'gpfb-button--icon');
    gridView.title = 'Grid view';
    gridView.classList.toggle('gpfb-button--primary', state.viewMode === 'grid');
    const listView = button('', 'list', 'gpfb-button--icon');
    listView.title = 'List view';
    listView.classList.toggle('gpfb-button--primary', state.viewMode === 'list');
    gridView.addEventListener('click', () => setViewMode('grid'));
    listView.addEventListener('click', () => setViewMode('list'));

    if (state.view === 'albums') {
      const create = button('New folder', 'folderAdd', 'gpfb-button--primary');
      create.addEventListener('click', showCreateAlbumDialog);
      const upload = button('Upload', 'upload');
      upload.addEventListener('click', triggerNativeUpload);
      refs.toolbar.append(create, upload, gridView, listView);
      return;
    }

    if (state.view === 'trash') {
      const restore = button('Restore', 'restore', 'gpfb-button--primary');
      const allSelected = areAllVisibleSelected();
      const selectAll = button(allSelected ? 'Deselect all' : 'Select all', allSelected ? 'close' : 'check');
      restore.disabled = state.selected.size === 0;
      restore.addEventListener('click', restoreSelected);
      selectAll.addEventListener('click', selectAllVisible);
      refs.toolbar.append(restore, selectAll, gridView, listView);
      return;
    }

    if (state.view === 'album') {
      const back = button('Albums', 'albums');
      back.addEventListener('click', () => navigate('albums'));
      refs.toolbar.appendChild(back);
    }

    const open = button('Open', 'open');
    const copy = button('Copy links', 'copy');
    const download = button('Download', 'download');
    const add = button('Add to album', 'folderAdd');
    const move = button('Move', 'move');
    const remove = button('Remove from album', 'remove');
    const favorite = button(state.view === 'favorites' ? 'Unfavorite' : 'Favorite', 'favorite');
    const trash = button('Trash', 'trash');
    const allSelected = areAllVisibleSelected();
    const selectAll = button(allSelected ? 'Deselect all' : 'Select all', allSelected ? 'close' : 'check');

    open.addEventListener('click', openSelected);
    copy.addEventListener('click', copySelectedLinks);
    download.addEventListener('click', downloadSelected);
    add.addEventListener('click', () => showAlbumPicker('add'));
    move.addEventListener('click', () => showAlbumPicker('move'));
    remove.addEventListener('click', removeSelectedFromAlbum);
    favorite.addEventListener('click', toggleFavoriteSelected);
    trash.addEventListener('click', trashSelected);
    selectAll.addEventListener('click', selectAllVisible);

    const hasSelection = state.selected.size > 0;
    [open, copy, download, add, move, remove, favorite, trash].forEach(el => { el.disabled = !hasSelection; });
    move.hidden = state.view !== 'album';
    remove.hidden = state.view !== 'album';
    refs.toolbar.append(open, copy, download, add, move, remove, favorite, trash, selectAll, gridView, listView);
  }

  function setViewMode(mode) {
    if (state.viewMode === mode) return;
    state.viewMode = mode;
    renderToolbar();
    renderContent();
  }

  function applyFilterAndSort() {
    const query = state.query;
    const items = state.items.filter(item => {
      if (!query) return true;
      if (item.kind === 'folder') return item.title.toLowerCase().includes(query);
      const meta = state.metadata.get(item.mediaKey);
      return (meta?.filename || '').toLowerCase().includes(query);
    });
    items.sort((a, b) => {
      if (a.kind === 'folder') return (b.modifiedTimestamp || 0) - (a.modifiedTimestamp || 0);
      return (b.timestamp || b.creationTimestamp || 0) - (a.timestamp || a.creationTimestamp || 0);
    });
    state.filteredItems = items;
  }

  async function hydrateMetadata(items, generation = state.generation) {
    const missing = items.map(item => item.mediaKey).filter(key => !state.metadata.has(key));
    for (let offset = 0; offset < missing.length; offset += META_CHUNK_SIZE) {
      if (generation !== state.generation) return;
      const chunk = missing.slice(offset, offset + META_CHUNK_SIZE);
      try {
        const metadata = await getMetadata(chunk);
        metadata.forEach(item => state.metadata.set(item.mediaKey, item));
        if (generation !== state.generation) return;
        if (state.query) {
          applyFilterAndSort();
          renderContent();
        } else {
          updateVisibleMetadata(metadata);
        }
      } catch (error) {
        console.warn('[GP File Browser] Metadata batch failed', error);
      }
    }
  }

  function updateVisibleMetadata(metadata) {
    metadata.forEach(item => {
      const card = refs.content.querySelector(`.gpfb-card[data-key="${CSS.escape(item.mediaKey)}"]`);
      if (!card) return;
      const title = card.querySelector('.gpfb-card-title');
      const meta = card.querySelector('.gpfb-card-meta');
      const source = state.items.find(candidate => candidate.mediaKey === item.mediaKey);
      if (title) {
        title.textContent = item.filename || 'Photo or video';
        title.title = title.textContent;
      }
      if (meta) meta.textContent = [formatDate(source?.timestamp), formatBytes(item.size)].filter(Boolean).join(' · ');
    });
  }

  function renderContent() {
    refs.content.replaceChildren();
    if (!state.filteredItems.length) {
      renderEmpty(state.query ? 'No matching items' : 'This location is empty', state.query ? 'Try a different search.' : '');
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'gpfb-grid';
    grid.dataset.view = state.viewMode;
    state.filteredItems.forEach(item => grid.appendChild(item.kind === 'folder' ? folderCard(item) : fileCard(item)));
    refs.content.appendChild(grid);
    const hasNextPage = state.view === 'albums' ? state.albumsNextPageId : state.nextPageId;
    if (hasNextPage && !state.query) {
      const loadWrap = document.createElement('div');
      loadWrap.className = 'gpfb-load';
      const load = button('Load more', 'refresh');
      load.addEventListener('click', loadMore);
      loadWrap.appendChild(load);
      refs.content.appendChild(loadWrap);
    }
    updateFooter();
  }

  function renderEmpty(title, detail = '') {
    refs.content.replaceChildren();
    const empty = document.createElement('div');
    empty.className = 'gpfb-empty';
    empty.append(svgIcon(state.view === 'albums' ? 'albums' : 'photo', 52));
    const heading = document.createElement('strong');
    heading.textContent = title;
    empty.appendChild(heading);
    if (detail) empty.appendChild(Object.assign(document.createElement('span'), { textContent: detail }));
    refs.content.appendChild(empty);
  }

  function folderCard(album) {
    const card = document.createElement('article');
    card.className = 'gpfb-card';
    card.dataset.key = album.mediaKey;
    card.tabIndex = 0;
    const thumb = document.createElement('div');
    thumb.className = 'gpfb-thumb gpfb-folder-thumb';
    if (album.thumb) {
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.src = thumbnailUrl(album.thumb, state.viewMode === 'list' ? 160 : 480, state.viewMode === 'list' ? 100 : 320);
      img.alt = '';
      thumb.appendChild(img);
    } else {
      thumb.appendChild(svgIcon('files', 64));
    }
    const info = document.createElement('div');
    info.className = 'gpfb-card-info';
    const title = document.createElement('div');
    title.className = 'gpfb-card-title';
    title.textContent = album.title;
    const meta = document.createElement('div');
    meta.className = 'gpfb-card-meta';
    meta.textContent = `${album.itemCount} items${album.isShared ? ' · Shared' : ''}`;
    info.append(title, meta);
    card.append(thumb, info);
    card.addEventListener('dblclick', () => navigate('album', album));
    card.addEventListener('click', () => navigate('album', album));
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter') navigate('album', album);
    });
    return card;
  }

  function fileCard(item) {
    const card = document.createElement('article');
    card.className = 'gpfb-card';
    card.dataset.key = item.mediaKey;
    card.dataset.selected = String(state.selected.has(item.mediaKey));
    card.tabIndex = 0;

    const thumb = document.createElement('div');
    thumb.className = 'gpfb-thumb';
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = thumbnailUrl(item.thumb, state.viewMode === 'list' ? 160 : 480, state.viewMode === 'list' ? 100 : 320);
    img.alt = '';
    thumb.appendChild(img);
    const select = document.createElement('span');
    select.className = 'gpfb-select';
    select.appendChild(svgIcon('check', 17));
    thumb.appendChild(select);

    const info = document.createElement('div');
    info.className = 'gpfb-card-info';
    const metaData = state.metadata.get(item.mediaKey);
    const title = document.createElement('div');
    title.className = 'gpfb-card-title';
    title.textContent = metaData?.filename || 'Photo or video';
    title.title = title.textContent;
    const meta = document.createElement('div');
    meta.className = 'gpfb-card-meta';
    meta.textContent = [formatDate(item.timestamp), formatBytes(metaData?.size)].filter(Boolean).join(' · ');
    info.append(title, meta);
    card.append(thumb, info);

    card.addEventListener('click', event => {
      event.preventDefault();
      toggleSelection(item.mediaKey, card);
    });
    card.addEventListener('dblclick', event => {
      event.preventDefault();
      openItem(item);
    });
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter') toggleSelection(item.mediaKey);
    });
    return card;
  }

  function toggleSelection(key, card = null) {
    if (state.selected.has(key)) state.selected.delete(key);
    else state.selected.add(key);
    if (card) card.dataset.selected = String(state.selected.has(key));
    renderToolbar();
    updateFooter();
  }

  function selectAllVisible() {
    const allSelected = areAllVisibleSelected();
    state.filteredItems.forEach(item => {
      if (allSelected) state.selected.delete(item.mediaKey);
      else state.selected.add(item.mediaKey);
    });
    renderToolbar();
    renderContent();
  }

  function areAllVisibleSelected() {
    return state.filteredItems.length > 0 && state.filteredItems.every(item => state.selected.has(item.mediaKey));
  }

  function selectedItems() {
    return state.items.filter(item => state.selected.has(item.mediaKey));
  }

  async function loadMore() {
    const nextPageId = state.view === 'albums' ? state.albumsNextPageId : state.nextPageId;
    if (!nextPageId || state.busy) return;
    setBusy(true, 'Loading more…');
    try {
      if (state.view === 'albums') {
        const page = await getAlbumsPage(nextPageId);
        state.albums.push(...page.items);
        state.albumsNextPageId = page.nextPageId;
        state.albumsFullyLoaded = !page.nextPageId;
        state.items = state.albums;
        applyFilterAndSort();
        renderContent();
        return;
      }
      const page = state.view === 'library'
        ? await getLibraryPage(state.nextPageId)
        : state.view === 'favorites'
          ? await getFavoritesPage(state.nextPageId)
          : state.view === 'trash'
            ? await getTrashPage(state.nextPageId)
            : await getAlbumPage(state.currentAlbum, state.nextPageId);
      state.items.push(...page.items);
      state.nextPageId = page.nextPageId;
      applyFilterAndSort();
      renderContent();
      void hydrateMetadata(page.items, state.generation);
    } catch (error) {
      console.error('[GP File Browser] Load more failed', error);
      toast('Could not load more items.');
    } finally {
      setBusy(false);
    }
  }

  function openItem(item) {
    const prefix = location.pathname.match(/^\/u\/\d+/)?.[0] || '';
    const target = state.view === 'album'
      ? `${prefix}/album/${state.currentAlbum.mediaKey}/photo/${item.mediaKey}`
      : `${prefix}/photo/${item.mediaKey}`;
    location.href = target;
  }

  function openSelected() {
    const item = selectedItems()[0];
    if (item) openItem(item);
  }

  async function copySelectedLinks() {
    const items = selectedItems();
    if (!items.length || state.busy) return;
    setBusy(true, `Resolving 0/${items.length} links…`);
    try {
      const urls = [];
      for (let index = 0; index < items.length; index++) {
        const url = await resolveDownloadUrl(items[index]);
        if (url) urls.push(url);
        setBusy(true, `Resolving ${index + 1}/${items.length} links…`);
      }
      await navigator.clipboard.writeText(urls.join('\n'));
      toast(`${urls.length} links copied.`);
    } catch (error) {
      console.error('[GP File Browser] Copy links failed', error);
      toast('Could not copy download links.');
    } finally {
      setBusy(false);
    }
  }

  async function downloadSelected() {
    const items = selectedItems();
    if (!items.length || state.busy) return;
    setBusy(true, `Preparing 0/${items.length} downloads…`);
    try {
      for (let index = 0; index < items.length; index++) {
        const url = await resolveDownloadUrl(items[index]);
        if (url) {
          const frame = document.createElement('iframe');
          frame.hidden = true;
          frame.src = url;
          document.body.appendChild(frame);
          setTimeout(() => frame.remove(), 10000);
        }
        setBusy(true, `Preparing ${index + 1}/${items.length} downloads…`);
        await sleep(450);
      }
      toast(`${items.length} downloads started.`);
    } catch (error) {
      console.error('[GP File Browser] Download failed', error);
      toast('Some downloads could not be started.');
    } finally {
      setBusy(false);
    }
  }

  function showDialog({ title, detail, input, select, confirmLabel = 'Continue', onConfirm }) {
    const backdrop = document.createElement('div');
    backdrop.className = 'gpfb-dialog-backdrop';
    const dialog = document.createElement('div');
    dialog.className = 'gpfb-dialog';
    dialog.appendChild(Object.assign(document.createElement('h2'), { textContent: title }));
    if (detail) dialog.appendChild(Object.assign(document.createElement('p'), { textContent: detail }));
    let control;
    if (input) {
      control = document.createElement('input');
      control.type = 'text';
      control.placeholder = input;
      dialog.appendChild(control);
    }
    if (select) {
      control = document.createElement('select');
      select.forEach(option => {
        const el = document.createElement('option');
        el.value = option.value;
        el.textContent = option.label;
        control.appendChild(el);
      });
      dialog.appendChild(control);
    }
    const actions = document.createElement('div');
    actions.className = 'gpfb-dialog-actions';
    const cancel = button('Cancel', 'close');
    const confirm = button(confirmLabel, 'check', 'gpfb-button--primary');
    actions.append(cancel, confirm);
    dialog.appendChild(actions);
    backdrop.appendChild(dialog);
    refs.root.appendChild(backdrop);
    const close = () => backdrop.remove();
    cancel.addEventListener('click', close);
    backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
    confirm.addEventListener('click', async () => {
      const value = control?.value?.trim() || '';
      if (control && !value) return;
      confirm.disabled = true;
      try {
        await onConfirm(value);
        close();
      } catch (error) {
        confirm.disabled = false;
        console.error('[GP File Browser] Dialog action failed', error);
        toast(error.message || 'Action failed.');
      }
    });
    control?.focus();
  }

  function showCreateAlbumDialog() {
    showDialog({
      title: 'Create album folder',
      detail: 'This creates a normal Google Photos album.',
      input: 'Album name',
      confirmLabel: 'Create',
      onConfirm: async title => {
        const key = await createAlbum(title);
        if (!key) throw new Error('Google Photos did not create the album.');
        toast(`Created “${title}”.`);
        await navigate('albums');
      }
    });
  }

  async function showAlbumPicker(mode) {
    const items = selectedItems();
    if (!items.length) return;
    setBusy(true, 'Loading albums…');
    try {
      await ensureAllAlbumsLoaded();
    } finally {
      setBusy(false);
    }
    const choices = state.albums
      .filter(album => album.mediaKey !== state.currentAlbum?.mediaKey)
      .map(album => ({ value: album.mediaKey, label: `${album.title} (${album.itemCount})` }));
    if (!choices.length) return toast('Create another album first.');
    showDialog({
      title: mode === 'move' ? 'Move to album' : 'Add to album',
      detail: mode === 'move'
        ? 'Items are added to the destination, then removed from this album.'
        : 'Google Photos keeps the originals in your library.',
      select: choices,
      confirmLabel: mode === 'move' ? 'Move' : 'Add',
      onConfirm: async albumKey => {
        const keys = items.map(item => item.mediaKey);
        await runInChunks(keys, chunk => addToAlbum(chunk, albumKey));
        if (mode === 'move') await runInChunks(keys, removeFromAlbum);
        toast(`${items.length} item${items.length === 1 ? '' : 's'} ${mode === 'move' ? 'moved' : 'added'}.`);
        if (mode === 'move') await refreshCurrent();
      }
    });
  }

  async function ensureAllAlbumsLoaded() {
    if (state.albumsFullyLoaded) return;
    if (!state.albums.length) {
      const firstPage = await getAlbumsPage();
      state.albums = firstPage.items;
      state.albumsNextPageId = firstPage.nextPageId;
    }
    const seen = new Set();
    while (state.albumsNextPageId) {
      if (seen.has(state.albumsNextPageId)) break;
      seen.add(state.albumsNextPageId);
      const page = await getAlbumsPage(state.albumsNextPageId);
      state.albums.push(...page.items);
      state.albumsNextPageId = page.nextPageId;
    }
    state.albumsFullyLoaded = true;
  }

  function removeSelectedFromAlbum() {
    const items = selectedItems();
    if (!items.length || state.view !== 'album') return;
    showDialog({
      title: 'Remove from album?',
      detail: 'The files stay in your Google Photos library.',
      confirmLabel: 'Remove',
      onConfirm: async () => {
        await runInChunks(items.map(item => item.mediaKey), removeFromAlbum);
        toast(`${items.length} item${items.length === 1 ? '' : 's'} removed.`);
        await refreshCurrent();
      }
    });
  }

  function trashSelected() {
    const items = selectedItems().filter(item => item.dedupKey);
    if (!items.length) return toast('These items cannot be moved to trash here.');
    showDialog({
      title: 'Move to trash?',
      detail: 'This affects the original files in your Google Photos library.',
      confirmLabel: 'Move to trash',
      onConfirm: async () => {
        await runInChunks(items.map(item => item.dedupKey), moveToTrash);
        toast(`${items.length} item${items.length === 1 ? '' : 's'} moved to trash.`);
        await refreshCurrent();
      }
    });
  }

  function restoreSelected() {
    const items = selectedItems().filter(item => item.dedupKey);
    if (!items.length || state.view !== 'trash') return;
    showDialog({
      title: 'Restore selected files?',
      detail: 'The files will return to your Google Photos library.',
      confirmLabel: 'Restore',
      onConfirm: async () => {
        await runInChunks(items.map(item => item.dedupKey), restoreFromTrash);
        toast(`${items.length} item${items.length === 1 ? '' : 's'} restored.`);
        await refreshCurrent();
      }
    });
  }

  async function toggleFavoriteSelected() {
    const items = selectedItems().filter(item => item.dedupKey);
    if (!items.length || state.busy) return;
    const favorite = state.view !== 'favorites';
    let succeeded = false;
    setBusy(true, favorite ? 'Adding to Favorites…' : 'Removing from Favorites…');
    try {
      await runInChunks(items.map(item => item.dedupKey), chunk => setFavorite(chunk, favorite));
      toast(`${items.length} item${items.length === 1 ? '' : 's'} ${favorite ? 'favorited' : 'unfavorited'}.`);
      succeeded = true;
    } catch (error) {
      console.error('[GP File Browser] Favorite action failed', error);
      toast('Could not update Favorites.');
    } finally {
      setBusy(false);
    }
    if (succeeded && !favorite) await refreshCurrent();
  }

  function triggerNativeUpload() {
    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
      fileInput.click();
      closeBrowser();
      return;
    }
    const uploadButton = [...document.querySelectorAll('button,[role="button"]')].find(el =>
      !refs.root.contains(el) &&
      el !== refs.launcher &&
      /upload|tải lên/i.test(`${el.getAttribute('aria-label') || ''} ${el.textContent || ''}`)
    );
    if (uploadButton) {
      uploadButton.click();
      closeBrowser();
    } else {
      toast('Open the Google Photos Upload menu once, then retry.');
    }
  }

  function bootstrap() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
      return;
    }
    injectStyle();
    buildUi();
    updateTheme();
    window.setInterval(() => {
      if (!document.hidden) updateTheme();
    }, 5000);
    console.log('[GP File Browser] Standalone file browser ready.');
  }

  bootstrap();
})();

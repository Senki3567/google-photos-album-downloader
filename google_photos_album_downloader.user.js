// ==UserScript==
// @name         Google Photos Album Downloader
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Streamlined floating button and menu downloader with Fetch, Copy, and Download All for Google Photos Albums (Trusted Types & CSP Safe)
// @author       Antigravity
// @match        *://*.google.com/*
// @match        *://photos.google.com/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

(function() {
    'use strict';

    if (!window.location.hostname.includes('photos.google.com')) {
        return;
    }

    console.log('[GP Downloader] Userscript injected.');

    // Material Design SVG Paths
    const PATH_DOWNLOAD = "M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z";
    const PATH_CHECK = "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z";
    const PATH_CLOSE = "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z";

    // Helper to create SVG programmatically (avoids Trusted Types innerHTML issues)
    function createSvgIcon(pathD) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("width", "20");
        svg.setAttribute("height", "20");
        svg.setAttribute("fill", "currentColor");
        
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", pathD);
        svg.appendChild(path);
        
        return svg;
    }

    // Resolve and update theme classes dynamically based on body text color
    let lastThemeCheck = 0;
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

    // Inject CSS
    const style = document.createElement('style');
    style.textContent = `
        /* Theme Variables & Base Styles */
        body {
            --gpd-panel-bg: rgba(255, 255, 255, 0.92);
            --gpd-panel-border: rgba(0, 0, 0, 0.12);
            --gpd-text: #1f1f1f;
            --gpd-text-secondary: #5f6368;
            --gpd-btn-bg: rgba(0, 0, 0, 0.04);
            --gpd-btn-hover: rgba(0, 0, 0, 0.08);
            --gpd-btn-trigger-hover: rgba(240, 240, 240, 0.95);
            --gpd-btn-text: #1f1f1f;
            --gpd-btn-primary-bg: #1f1f1f;
            --gpd-btn-primary-text: #ffffff;
            --gpd-btn-primary-hover: #333333;
            --gpd-progress-bg: rgba(0, 0, 0, 0.06);
            --gpd-accent: #1f1f1f;
            --gpd-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        body.gp-dark-mode {
            --gpd-panel-bg: rgba(30, 30, 30, 0.85) !important;
            --gpd-panel-border: rgba(255, 255, 255, 0.12) !important;
            --gpd-text: #ffffff !important;
            --gpd-text-secondary: #aaaaaa !important;
            --gpd-btn-bg: rgba(255, 255, 255, 0.08) !important;
            --gpd-btn-hover: rgba(255, 255, 255, 0.15) !important;
            --gpd-btn-trigger-hover: rgba(70, 70, 70, 0.95) !important;
            --gpd-btn-text: #ffffff !important;
            --gpd-btn-primary-bg: #ffffff !important;
            --gpd-btn-primary-text: #1f1f1f !important;
            --gpd-btn-primary-hover: #e0e0e0 !important;
            --gpd-progress-bg: rgba(255, 255, 255, 0.08) !important;
            --gpd-accent: #ffffff !important;
            --gpd-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
        }

        #gpd-trigger-btn {
            position: fixed;
            bottom: 24px;
            left: 24px;
            z-index: 999999;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            border: 1px solid var(--gpd-panel-border);
            box-shadow: var(--gpd-shadow);
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            display: none;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            background: var(--gpd-panel-bg);
            color: var(--gpd-btn-text);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
        }
        #gpd-trigger-btn:hover {
            transform: scale(1.08);
            background: var(--gpd-btn-trigger-hover);
        }
        #gpd-trigger-btn:active {
            transform: scale(0.95);
        }

        #gpd-panel {
            position: fixed;
            bottom: 24px;
            left: 24px;
            z-index: 999999;
            background: var(--gpd-panel-bg);
            border: 1px solid var(--gpd-panel-border);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border-radius: 8px;
            box-shadow: var(--gpd-shadow);
            padding: 12px;
            color: var(--gpd-text);
            font-family: "Google Sans", Roboto, Inter, sans-serif;
            width: 260px;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            gap: 8px;
            opacity: 0;
            transform: translateY(6px) scale(0.98);
            pointer-events: none;
            transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        #gpd-panel.gpd-visible {
            opacity: 1;
            transform: translateY(0) scale(1);
            pointer-events: auto;
        }

        .gpd-action-btn {
            width: 100%;
            background: var(--gpd-btn-bg);
            border: 1px solid var(--gpd-panel-border);
            border-radius: 8px;
            color: var(--gpd-btn-text);
            padding: 10px 16px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
        .gpd-action-btn:hover:not(:disabled) {
            background: var(--gpd-btn-hover);
        }
        .gpd-action-btn:disabled {
            opacity: 0.5;
            cursor: default;
        }
        .gpd-action-btn-primary {
            background: var(--gpd-btn-primary-bg);
            color: var(--gpd-btn-primary-text) !important;
            border: none;
        }
        .gpd-action-btn-primary:hover:not(:disabled) {
            background: var(--gpd-btn-primary-hover) !important;
        }

        .gpd-progress-bar {
            width: 100%;
            height: 3px;
            background: var(--gpd-progress-bg);
            border-radius: 1.5px;
            overflow: hidden;
            margin-bottom: 4px;
        }
        .gpd-progress-fill {
            height: 100%;
            width: 0%;
            background: var(--gpd-accent);
            border-radius: 1.5px;
            transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.3s ease;
        }
    `;
    document.head.appendChild(style);

    let panel, panelTrigger, progressBar, progressFill, scanBtn, copyBtn, downloadAllBtn;
    let albumMediaKey = null;
    let authKey = null;
    let fetchedItems = [];
    let isWorking = false;
    let lastAlbumKey = null;

    function init() {
        if (document.getElementById('gpd-trigger-btn')) return;

        // 1. Create Floating Trigger Button
        panelTrigger = document.createElement('button');
        panelTrigger.id = 'gpd-trigger-btn';
        panelTrigger.title = 'GP Downloader';
        panelTrigger.replaceChildren(createSvgIcon(PATH_DOWNLOAD));
        document.body.appendChild(panelTrigger);

        // 2. Create Panel
        panel = document.createElement('div');
        panel.id = 'gpd-panel';

        // Progress bar
        progressBar = document.createElement('div');
        progressBar.className = 'gpd-progress-bar';

        progressFill = document.createElement('div');
        progressFill.className = 'gpd-progress-fill';
        progressBar.appendChild(progressFill);
        panel.appendChild(progressBar);

        // 3 Buttons
        scanBtn = document.createElement('button');
        scanBtn.className = 'gpd-action-btn gpd-action-btn-primary';
        scanBtn.textContent = 'Fetch Download Links';
        panel.appendChild(scanBtn);

        copyBtn = document.createElement('button');
        copyBtn.className = 'gpd-action-btn';
        copyBtn.textContent = 'Copy All Links';
        copyBtn.disabled = true;
        panel.appendChild(copyBtn);

        downloadAllBtn = document.createElement('button');
        downloadAllBtn.className = 'gpd-action-btn';
        downloadAllBtn.textContent = 'Download All';
        downloadAllBtn.disabled = true;
        panel.appendChild(downloadAllBtn);

        document.body.appendChild(panel);

        // Event Listeners for Hover-triggered Menu
        let closeTimeout = null;
        function openPanel() {
            if (closeTimeout) {
                clearTimeout(closeTimeout);
                closeTimeout = null;
            }
            panel.classList.add('gpd-visible');
            panelTrigger.style.opacity = '0';
            panelTrigger.style.pointerEvents = 'none';
        }
        function closePanel() {
            if (closeTimeout) return;
            closeTimeout = setTimeout(() => {
                panel.classList.remove('gpd-visible');
                panelTrigger.style.opacity = '1';
                panelTrigger.style.pointerEvents = 'auto';
                closeTimeout = null;
            }, 300); // 300ms delay to slide mouse smoothly between trigger and panel
        }

        panelTrigger.addEventListener('mouseenter', openPanel);
        panelTrigger.addEventListener('mouseleave', closePanel);
        panel.addEventListener('mouseenter', openPanel);
        panel.addEventListener('mouseleave', closePanel);

        // Click toggle fallback
        panelTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (panel.classList.contains('gpd-visible')) {
                panel.classList.remove('gpd-visible');
                panelTrigger.style.opacity = '1';
                panelTrigger.style.pointerEvents = 'auto';
            } else {
                openPanel();
            }
        });

        // Backup close on clicking outside
        document.addEventListener('click', (e) => {
            if (panel.classList.contains('gpd-visible') && 
                !panel.contains(e.target) && 
                !panelTrigger.contains(e.target)) {
                panel.classList.remove('gpd-visible');
                panelTrigger.style.opacity = '1';
                panelTrigger.style.pointerEvents = 'auto';
            }
        });

        scanBtn.addEventListener('click', startScanningWorkflow);
        copyBtn.addEventListener('click', startCopyWorkflow);
        downloadAllBtn.addEventListener('click', startDownloadAllWorkflow);

        startUrlListener();
    }

    function startUrlListener() {
        let lastUrl = '';
        updateThemeClass();
        handleUrlChange();
        setInterval(() => {
            updateThemeClass();
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                handleUrlChange();
            }
        }, 1000);
    }

    function handleUrlChange() {
        if (isWorking) return;

        const pathParts = window.location.pathname.split('/');
        const shareIndex = pathParts.indexOf('share');
        const albumIndex = pathParts.indexOf('album');
        const directIndex = pathParts.indexOf('direct');

        albumMediaKey = null;
        authKey = null;

        if (shareIndex !== -1 && shareIndex + 1 < pathParts.length) {
            albumMediaKey = pathParts[shareIndex + 1];
        } else if (albumIndex !== -1 && albumIndex + 1 < pathParts.length) {
            albumMediaKey = pathParts[albumIndex + 1];
        } else if (directIndex !== -1 && directIndex + 1 < pathParts.length) {
            albumMediaKey = pathParts[directIndex + 1];
        }

        const isPhotoView = pathParts.includes('photo');

        const urlParams = new URLSearchParams(window.location.search);
        authKey = urlParams.get('key');

        if (albumMediaKey && !isPhotoView) {
            if (panelTrigger) {
                panelTrigger.style.display = 'flex';
            }
            
            // Only reset if we transitioned to a different album
            if (lastAlbumKey !== albumMediaKey) {
                lastAlbumKey = albumMediaKey;
                fetchedItems = [];
                if (progressFill) progressFill.style.width = '0%';
                if (scanBtn) {
                    scanBtn.disabled = false;
                    scanBtn.textContent = 'Fetch Download Links';
                }
                if (copyBtn) {
                    copyBtn.disabled = true;
                    copyBtn.textContent = 'Copy All Links';
                }
                if (downloadAllBtn) {
                    downloadAllBtn.disabled = true;
                    downloadAllBtn.textContent = 'Download All';
                }
            }
        } else {
            if (panelTrigger) panelTrigger.style.display = 'none';
            if (panel) panel.classList.remove('gpd-visible');
        }
    }

    async function sendRpc(rpcid, data) {
        const wizData = window.WIZ_global_data;
        if (!wizData) {
            throw new Error('WIZ_global_data not found. Refresh page.');
        }

        const baseUrl = `${location.origin}${wizData['Im6cmf']}/data/batchexecute`;
        const params = new URLSearchParams({
            'rpcids': rpcid,
            'source-path': location.pathname,
            'f.sid': wizData['FdrFJe'],
            'bl': wizData['cfb2h'],
            'rt': 'c'
        });

        const payloadData = [rpcid, JSON.stringify(data), null, "1"];
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

    async function resolveAllDownloadUrls() {
        const total = fetchedItems.length;
        scanBtn.textContent = `Fetching... (0/${total})`;
        progressFill.style.width = '0%';
        progressFill.style.background = 'var(--gpd-accent)';

        let completed = 0;
        const concurrencyLimit = 10;
        let index = 0;

        await new Promise((resolve) => {
            async function next() {
                if (index >= fetchedItems.length) {
                    if (completed === fetchedItems.length) resolve();
                    return;
                }

                while (index < fetchedItems.length && (index - completed) < concurrencyLimit) {
                    const curIdx = index++;
                    const item = fetchedItems[curIdx];

                    if (item.downloadUrl) {
                        completed++;
                        const percent = Math.round((completed / total) * 100);
                        progressFill.style.width = `${percent}%`;
                        scanBtn.textContent = `Fetching... (${completed}/${total})`;
                        if (completed === total) resolve();
                        continue;
                    }

                    (async () => {
                        try {
                            const details = await sendRpc('VrseUb', [item.mediaKey, null, authKey, null, albumMediaKey]);
                            item.downloadUrl = details ? (details[7] || details[1]) : null;
                        } catch (e) {
                            console.error('Failed to resolve URL for item:', item.mediaKey, e);
                        } finally {
                            completed++;
                            const percent = Math.round((completed / total) * 100);
                            progressFill.style.width = `${percent}%`;
                            scanBtn.textContent = `Fetching... (${completed}/${total})`;
                            if (completed === total) {
                                resolve();
                            } else {
                                next();
                            }
                        }
                    })();
                }
            }
            next();
        });
    }

    async function startScanningWorkflow() {
        if (!albumMediaKey || isWorking) return;

        isWorking = true;
        scanBtn.disabled = true;
        copyBtn.disabled = true;
        downloadAllBtn.disabled = true;
        
        scanBtn.textContent = 'Scanning...';
        progressFill.style.width = '0%';
        progressFill.style.background = 'var(--gpd-accent)';

        try {
            let albumItems = [];
            let nextPageId = null;

            do {
                const resData = await sendRpc('snAcKc', [albumMediaKey, nextPageId, null, authKey]);
                if (!resData) break;
                const pageItems = resData[1] || [];
                albumItems.push(...pageItems.map(item => item[0]).filter(Boolean));
                nextPageId = resData[2] || null;
            } while (nextPageId);

            const total = albumItems.length;
            if (total === 0) {
                scanBtn.textContent = 'No items found!';
                progressFill.style.background = '#ef4444';
                isWorking = false;
                scanBtn.disabled = false;
                return;
            }

            fetchedItems = albumItems.map(k => ({ mediaKey: k, downloadUrl: null }));
            
            // Immediately resolve all download URLs
            await resolveAllDownloadUrls();

            const urls = fetchedItems.map(item => item.downloadUrl).filter(Boolean);
            if (urls.length === 0) {
                scanBtn.textContent = 'Fetch failed';
                progressFill.style.background = '#ef4444';
                copyBtn.disabled = true;
                downloadAllBtn.disabled = true;
            } else {
                scanBtn.textContent = `Fetched ${urls.length} links ✓`;
                progressFill.style.background = '#10b981'; // Success green
                copyBtn.disabled = false;
                downloadAllBtn.disabled = false;
            }
        } catch (error) {
            console.error('Fetch error:', error);
            scanBtn.textContent = 'Fetch error';
            progressFill.style.background = '#ef4444'; // Error red
        } finally {
            isWorking = false;
            scanBtn.disabled = false;
        }
    }

    async function startCopyWorkflow() {
        if (fetchedItems.length === 0 || isWorking) return;

        const urls = fetchedItems.map(item => item.downloadUrl).filter(Boolean);
        if (urls.length === 0) {
            return;
        }

        try {
            await navigator.clipboard.writeText(urls.join('\n'));
            const prevText = copyBtn.textContent;
            copyBtn.textContent = 'Copied to Clipboard! ✓';
            
            setTimeout(() => {
                copyBtn.textContent = prevText;
            }, 3000);

        } catch (error) {
            console.error('Copy error:', error);
            copyBtn.textContent = 'Copy failed';
        }
    }

    async function startDownloadAllWorkflow() {
        if (fetchedItems.length === 0 || isWorking) return;

        const urls = fetchedItems.map(item => item.downloadUrl).filter(Boolean);
        if (urls.length === 0) {
            return;
        }

        isWorking = true;
        scanBtn.disabled = true;
        copyBtn.disabled = true;
        downloadAllBtn.disabled = true;

        downloadAllBtn.textContent = `Downloading... (0/${urls.length})`;
        progressFill.style.width = '0%';
        progressFill.style.background = 'var(--gpd-accent)';

        try {
            for (let i = 0; i < urls.length; i++) {
                downloadAllBtn.textContent = `Downloading... (${i + 1}/${urls.length})`;
                const percent = Math.round(((i + 1) / urls.length) * 100);
                progressFill.style.width = `${percent}%`;
                
                await triggerSingleDownload(urls[i]);
                await new Promise(r => setTimeout(r, 500));
            }

            downloadAllBtn.textContent = `Downloaded ${urls.length} items ✓`;
            progressFill.style.background = '#10b981';
            
            setTimeout(() => {
                downloadAllBtn.textContent = 'Download All';
                progressFill.style.width = '0%';
            }, 4000);

        } catch (error) {
            console.error('Download all error:', error);
            downloadAllBtn.textContent = 'Download error';
            progressFill.style.background = '#ef4444';
        } finally {
            isWorking = false;
            scanBtn.disabled = false;
            copyBtn.disabled = false;
            downloadAllBtn.disabled = false;
        }
    }


    function bootstrap() {
        if (document.body) {
            init();
        } else {
            document.addEventListener('DOMContentLoaded', init);
            setTimeout(bootstrap, 100);
        }
    }

    bootstrap();
})();

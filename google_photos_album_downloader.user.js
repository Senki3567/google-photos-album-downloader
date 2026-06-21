// ==UserScript==
// @name         Google Photos Album Downloader
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  Streamlined circular button downloader with Material Design icons for Google Photos Albums (Trusted Types & CSP Safe)
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
    const PATH_ERROR = "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z";

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

    // Inject CSS
    const style = document.createElement('style');
    style.textContent = `
        /* Theme Variables */
        body {
            --gp-btn-bg: #e3e3e3;
            --gp-btn-hover: #c7c7c7;
            --gp-btn-text: #1f1f1f;
            --gp-card-border: rgba(0, 0, 0, 0.12);
        }
        body.gp-dark-mode {
            --gp-btn-bg: #3c4043 !important;
            --gp-btn-hover: #5f6368 !important;
            --gp-btn-text: #ffffff !important;
            --gp-card-border: rgba(255, 255, 255, 0.12) !important;
        }
        body.gp-light-mode {
            --gp-btn-bg: #e3e3e3 !important;
            --gp-btn-hover: #c7c7c7 !important;
            --gp-btn-text: #1f1f1f !important;
            --gp-card-border: rgba(0, 0, 0, 0.12) !important;
        }

        #gpd-download-btn {
            position: fixed;
            bottom: 24px;
            left: 24px;
            z-index: 999999;
            width: 42px;
            height: 42px;
            border-radius: 50%;
            font-family: "Google Sans", Roboto, sans-serif;
            font-size: 11px;
            font-weight: 500;
            border: 1px solid var(--gp-card-border);
            box-shadow: 0 4px 16px rgba(0,0,0,0.3);
            transition: all 0.2s ease;
            display: none;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            background: var(--gp-btn-bg); /* Always neutral theme gray during idle, scan, download */
            color: var(--gp-btn-text);
        }
        #gpd-download-btn:hover:not(:disabled) {
            background: var(--gp-btn-hover);
            transform: translateY(-1px);
        }
        #gpd-download-btn:active:not(:disabled) {
            transform: translateY(0);
        }
        #gpd-download-btn:disabled {
            cursor: default;
        }
        #gpd-download-btn.gpd-completed {
            background: #137333 !important; /* Green success fill on completion */
            border-color: #137333 !important;
            color: #ffffff !important;
        }
        #gpd-download-btn.gpd-error {
            background: #ea4335 !important; /* Red error fill */
            border-color: #ea4335 !important;
            color: #ffffff !important;
        }
    `;
    document.head.appendChild(style);

    // Resolve and update theme classes dynamically based on body text color
    function updateThemeClass() {
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

    let downloadBtn;
    let albumMediaKey = null;
    let authKey = null;
    let isDownloading = false;

    function init() {
        if (document.getElementById('gpd-download-btn')) return;

        downloadBtn = document.createElement('button');
        downloadBtn.id = 'gpd-download-btn';
        downloadBtn.replaceChildren(createSvgIcon(PATH_DOWNLOAD));
        document.body.appendChild(downloadBtn);

        downloadBtn.addEventListener('click', startDownloadWorkflow);

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
        if (isDownloading) return;

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

        const urlParams = new URLSearchParams(window.location.search);
        authKey = urlParams.get('key');

        if (albumMediaKey) {
            if (downloadBtn) {
                downloadBtn.style.display = 'flex';
                downloadBtn.disabled = false;
                downloadBtn.classList.remove('gpd-completed', 'gpd-error');
                downloadBtn.replaceChildren(createSvgIcon(PATH_DOWNLOAD));
            }
        } else {
            if (downloadBtn) {
                downloadBtn.style.display = 'none';
                downloadBtn.disabled = true;
            }
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

    async function startDownloadWorkflow() {
        if (!albumMediaKey || isDownloading) return;

        isDownloading = true;
        downloadBtn.disabled = true;
        downloadBtn.textContent = '...';

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
                downloadBtn.textContent = '0';
                setTimeout(resetState, 2000);
                return;
            }

            downloadBtn.textContent = '0%';

            let completed = 0;
            const concurrencyLimit = 3;
            let index = 0;

            await new Promise((resolve) => {
                async function next() {
                    if (index >= albumItems.length) {
                        if (completed === albumItems.length) resolve();
                        return;
                    }

                    while (index < albumItems.length && (index - completed) < concurrencyLimit) {
                        const curIdx = index++;
                        const mediaKey = albumItems[curIdx];

                        (async () => {
                            try {
                                const details = await sendRpc('VrseUb', [mediaKey, null, authKey, null, albumMediaKey]);
                                const downloadUrl = details ? (details[7] || details[1]) : null;
                                if (downloadUrl) {
                                    await triggerSingleDownload(downloadUrl);
                                }
                            } catch (e) {
                                console.error('Failed to download item:', mediaKey, e);
                            } finally {
                                completed++;
                                const percent = Math.round((completed / total) * 100);
                                downloadBtn.textContent = `${percent}%`;
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

            downloadBtn.classList.add('gpd-completed');
            downloadBtn.replaceChildren(createSvgIcon(PATH_CHECK));
            setTimeout(resetState, 3000);

        } catch (error) {
            console.error('Download error:', error);
            downloadBtn.classList.add('gpd-error');
            downloadBtn.replaceChildren(createSvgIcon(PATH_ERROR));
            setTimeout(resetState, 4000);
        }
    }

    function resetState() {
        isDownloading = false;
        downloadBtn.classList.remove('gpd-completed', 'gpd-error');
        handleUrlChange();
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

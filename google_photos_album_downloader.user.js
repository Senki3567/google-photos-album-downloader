// ==UserScript==
// @name         Google Photos Album Downloader
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Streamlined one-click downloader for Google Photos Albums (Trusted Types & CSP Safe)
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

    // Helper to apply styles inline to avoid CSP style-src blocking
    function applyStyles(element, styles) {
        if (element) {
            Object.assign(element.style, styles);
        }
    }

    // Helper to create element programmatically (avoids Trusted Types innerHTML issues)
    function createElement(tag, styles = {}, attrs = {}) {
        const el = document.createElement(tag);
        applyStyles(el, styles);
        for (const [key, val] of Object.entries(attrs)) {
            if (key === 'textContent') {
                el.textContent = val;
            } else if (key === 'id') {
                el.id = val;
            } else {
                el.setAttribute(key, val);
            }
        }
        return el;
    }

    let panel, panelTrigger, statusText, albumInfo, progressBar, progressFill, downloadBtn, closeBtn;
    let albumMediaKey = null;
    let authKey = null;
    let albumTitle = '';
    let isDownloading = false;

    function init() {
        if (document.getElementById('gpd-panel')) return;

        // 1. Create main panel
        panel = createElement('div', {
            position: 'fixed',
            bottom: '24px',
            left: '24px',
            zIndex: '999999',
            background: '#202124',
            border: '1px solid #3c4043',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
            padding: '20px',
            color: '#e8eaed',
            fontFamily: '"Google Sans", Roboto, Inter, sans-serif',
            width: '320px',
            boxSizing: 'border-box',
            display: 'block'
        }, { id: 'gpd-panel' });

        // 2. Header
        const header = createElement('div', {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            paddingBottom: '12px'
        });

        const headerLeft = createElement('div');
        const headerTitle = createElement('h3', {
            fontSize: '15px',
            fontWeight: '600',
            color: '#ffffff',
            margin: '0',
            padding: '0'
        }, { textContent: 'GP Downloader' });

        albumInfo = createElement('div', {
            fontSize: '12px',
            color: '#9aa0a6',
            marginTop: '4px',
            wordBreak: 'break-all'
        }, { id: 'gpd-album-info', textContent: 'Detecting album...' });

        headerLeft.appendChild(headerTitle);
        headerLeft.appendChild(albumInfo);

        closeBtn = createElement('button', {
            background: 'none',
            border: 'none',
            color: '#9aa0a6',
            cursor: 'pointer',
            fontSize: '22px',
            padding: '4px',
            lineHeight: '1',
            transition: 'color 0.2s'
        }, { id: 'gpd-close-btn', textContent: '×' });

        header.appendChild(headerLeft);
        header.appendChild(closeBtn);
        panel.appendChild(header);

        // 3. Status text
        statusText = createElement('div', {
            fontSize: '13px',
            marginBottom: '16px',
            color: '#e8eaed',
            minHeight: '20px'
        }, { id: 'gpd-status-text', textContent: 'Please open an album.' });
        panel.appendChild(statusText);

        // 4. Progress bar
        progressBar = createElement('div', {
            width: '100%',
            height: '6px',
            background: 'rgba(255, 255, 255, 0.08)',
            borderRadius: '3px',
            overflow: 'hidden',
            marginBottom: '16px',
            display: 'none'
        }, { id: 'gpd-progress-bar' });

        progressFill = createElement('div', {
            height: '100%',
            width: '0%',
            background: '#1a73e8',
            transition: 'width 0.2s ease-out'
        }, { id: 'gpd-progress-fill' });

        progressBar.appendChild(progressFill);
        panel.appendChild(progressBar);

        // 5. Download Button
        downloadBtn = createElement('button', {
            width: '100%',
            background: 'rgba(255, 255, 255, 0.04)',
            border: 'none',
            borderRadius: '8px',
            color: '#80868b',
            padding: '10px 16px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'default',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
        }, { id: 'gpd-download-btn', textContent: 'Download Album' });

        panel.appendChild(downloadBtn);

        // 6. Floating Trigger Launcher
        panelTrigger = createElement('div', {
            position: 'fixed',
            bottom: '24px',
            left: '24px',
            zIndex: '999999',
            background: '#202124',
            border: '1px solid #3c4043',
            borderRadius: '50%',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
            width: '48px',
            height: '48px',
            cursor: 'pointer',
            display: 'none',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#e8eaed',
            fontWeight: 'bold',
            fontSize: '20px',
            fontFamily: 'sans-serif',
            transition: 'transform 0.2s ease'
        }, { id: 'gpd-trigger', textContent: '⬇' });

        document.body.appendChild(panel);
        document.body.appendChild(panelTrigger);

        // Close/Open toggle events
        closeBtn.addEventListener('click', () => {
            panel.style.display = 'none';
            panelTrigger.style.display = 'flex';
        });

        panelTrigger.addEventListener('click', () => {
            panel.style.display = 'block';
            panelTrigger.style.display = 'none';
        });

        // Hover effects on active button
        downloadBtn.addEventListener('mouseenter', () => {
            if (!downloadBtn.disabled && !isDownloading && albumMediaKey) {
                applyStyles(downloadBtn, { background: '#1557b0', transform: 'translateY(-1px)' });
            }
        });
        downloadBtn.addEventListener('mouseleave', () => {
            if (!downloadBtn.disabled && !isDownloading && albumMediaKey) {
                applyStyles(downloadBtn, { background: '#1a73e8', transform: 'none' });
            }
        });

        downloadBtn.addEventListener('click', startDownloadWorkflow);

        startUrlListener();
    }

    function startUrlListener() {
        let lastUrl = '';
        handleUrlChange();
        setInterval(() => {
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
        albumTitle = '';

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
            const titleEl = document.querySelector('h1') || document.querySelector('[role="heading"]');
            albumTitle = titleEl ? titleEl.textContent.trim() : 'Google Photos Album';
            if (albumInfo) albumInfo.textContent = `Album: ${albumTitle}`;
            if (statusText) statusText.textContent = 'Ready to download.';
            if (progressBar) progressBar.style.display = 'none';

            if (downloadBtn) {
                downloadBtn.disabled = false;
                downloadBtn.textContent = 'Download Album';
                applyStyles(downloadBtn, {
                    background: '#1a73e8',
                    color: '#ffffff',
                    cursor: 'pointer'
                });
            }
        } else {
            if (albumInfo) albumInfo.textContent = 'No Album Detected';
            if (statusText) statusText.textContent = 'Please open an album to download.';
            if (progressBar) progressBar.style.display = 'none';

            if (downloadBtn) {
                downloadBtn.disabled = true;
                downloadBtn.textContent = 'Download Album';
                applyStyles(downloadBtn, {
                    background: 'rgba(255, 255, 255, 0.04)',
                    color: '#80868b',
                    cursor: 'default'
                });
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
        applyStyles(downloadBtn, { background: 'rgba(255, 255, 255, 0.04)', color: '#80868b', cursor: 'default' });
        downloadBtn.textContent = 'Scanning...';
        progressBar.style.display = 'block';
        progressFill.style.width = '0%';

        try {
            statusText.textContent = 'Scanning album items...';
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
                statusText.textContent = 'No items found in this album.';
                resetState();
                return;
            }

            statusText.textContent = `Found ${total} items. Fetching links & downloading...`;

            // Process downloads concurrently (limit of 3)
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
                                progressFill.style.width = `${percent}%`;
                                statusText.textContent = `Downloading... (${completed}/${total})`;
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

            statusText.textContent = `Successfully triggered download for ${total} items!`;
            downloadBtn.textContent = 'Completed';
            setTimeout(resetState, 3000);

        } catch (error) {
            console.error('Download error:', error);
            statusText.textContent = `Error: ${error.message}`;
            setTimeout(resetState, 4000);
        }
    }

    function resetState() {
        isDownloading = false;
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

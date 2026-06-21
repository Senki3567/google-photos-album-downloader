// ==UserScript==
// @name         Google Photos Album Downloader
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  Get direct download links for all files in a Google Photos shared or private album (Trusted Types & CSP Safe, Always Visible)
// @author       Antigravity
// @match        *://*.google.com/*
// @match        *://photos.google.com/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

(function() {
    'use strict';

    // Guard to prevent execution on other Google domains
    if (!window.location.hostname.includes('photos.google.com')) {
        return;
    }

    console.log('[GP Downloader] Userscript injected into the main Google Photos window.');

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

    let panel, panelTrigger, statusText, albumInfo, progressBar, progressFill, scanBtn, copyBtn, downloadAllBtn, resultsBox, closeBtn;
    let albumMediaKey = null;
    let authKey = null;
    let albumTitle = '';
    let fetchedLinks = [];

    const mediaKeyToDownloadUrl = new Map();

    function extractMediaKey(el) {
        if (!el) return null;
        const a = el.closest('a[href*="/photo/"]') || el.parentElement?.querySelector('a[href*="/photo/"]');
        const m = a?.getAttribute('href')?.match(/\/photo\/([A-Za-z0-9_\-]+)/);
        if (m) return m[1];
        const bg = el.style?.backgroundImage || '';
        const n = bg.match(/(AF1Qip|AP1Gcz)[A-Za-z0-9_\-]+/);
        return n ? n[0] : null;
    }

    function handleTileMouseEnter(e) {
        const tile = e.currentTarget;
        const key = extractMediaKey(tile);
        if (!key || !mediaKeyToDownloadUrl.has(key)) return;

        const downloadUrl = mediaKeyToDownloadUrl.get(key);
        
        let label = tile.querySelector('.gpd-tile-hover-link');
        if (label && label.id !== `gpd-hl-${key}`) {
            label.parentNode.removeChild(label);
            label = null;
        }

        if (!label) {
            label = createElement('div', {
                position: 'absolute',
                top: '10px',
                right: '10px',
                zIndex: '99999',
                background: 'rgba(30, 31, 34, 0.95)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '16px',
                padding: '4px 10px',
                color: '#e8eaed',
                fontSize: '11px',
                fontFamily: '"Google Sans", Roboto, sans-serif',
                fontWeight: '500',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                opacity: '0',
                transform: 'translateY(-4px)'
            }, { id: `gpd-hl-${key}`, textContent: '🔗 Copy Link' });

            label.className = 'gpd-tile-hover-link';

            label.addEventListener('click', (evt) => {
                evt.preventDefault();
                evt.stopPropagation();
                navigator.clipboard.writeText(downloadUrl).then(() => {
                    label.textContent = 'Copied!';
                    applyStyles(label, { background: '#137333', color: '#ffffff' });
                    setTimeout(() => {
                        label.textContent = '🔗 Copy Link';
                        applyStyles(label, { background: 'rgba(30, 31, 34, 0.95)', color: '#e8eaed' });
                    }, 1500);
                });
            });

            label.addEventListener('mouseenter', () => {
                applyStyles(label, { transform: 'scale(1.05)' });
            });
            label.addEventListener('mouseleave', () => {
                applyStyles(label, { transform: 'scale(1)' });
            });

            tile.appendChild(label);
        }

        setTimeout(() => {
            applyStyles(label, { opacity: '1', transform: 'translateY(0)' });
        }, 10);
    }

    function handleTileMouseLeave(e) {
        const tile = e.currentTarget;
        const label = tile.querySelector('.gpd-tile-hover-link');
        if (label) {
            applyStyles(label, { opacity: '0', transform: 'translateY(-4px)' });
            setTimeout(() => {
                if (label.parentNode && label.style.opacity === '0') {
                    label.parentNode.removeChild(label);
                }
            }, 160);
        }
    }

    function attachTileListeners() {
        document.querySelectorAll('.RY3tic').forEach(tile => {
            if (tile.hasAttribute('data-gpd-hover-attached')) return;
            tile.setAttribute('data-gpd-hover-attached', '1');
            tile.addEventListener('mouseenter', handleTileMouseEnter);
            tile.addEventListener('mouseleave', handleTileMouseLeave);
        });
    }

    function init() {
        console.log('[GP Downloader] DOM bootstrap complete. Creating UI...');
        
        if (document.getElementById('gpd-panel')) {
            console.log('[GP Downloader] Panel already exists. Skipping init.');
            return;
        }

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
            width: '340px',
            boxSizing: 'border-box',
            display: 'block'
        }, { id: 'gpd-panel' });

        // 2. Create Header
        const header = createElement('div', {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            paddingBottom: '12px'
        });

        const headerLeft = createElement('div');
        const headerTitle = createElement('h3', {}, { textContent: 'GP Downloader' });
        applyStyles(headerTitle, {
            fontSize: '16px',
            fontWeight: '600',
            color: '#ffffff',
            margin: '0',
            padding: '0'
        });

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
        }, { id: 'gpd-status-text', textContent: 'Ready to scan.' });
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
            background: '#e8eaed',
            transition: 'width 0.2s ease-out'
        }, { id: 'gpd-progress-fill' });

        progressBar.appendChild(progressFill);
        panel.appendChild(progressBar);

        // 5. Actions container & buttons
        const actions = createElement('div', {
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
        });

        scanBtn = createElement('button', {
            background: '#3c4043',
            border: '1px solid #5f6368',
            borderRadius: '8px',
            color: '#ffffff',
            padding: '10px 16px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
        }, { id: 'gpd-scan-btn', textContent: 'Fetch Download Links' });

        copyBtn = createElement('button', {
            background: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '8px',
            color: '#80868b',
            padding: '10px 16px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
        }, { id: 'gpd-copy-btn', disabled: 'true', textContent: 'Copy All Links' });

        downloadAllBtn = createElement('button', {
            background: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '8px',
            color: '#80868b',
            padding: '10px 16px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
        }, { id: 'gpd-download-all-btn', disabled: 'true', textContent: 'Download All' });

        actions.appendChild(scanBtn);
        actions.appendChild(copyBtn);
        actions.appendChild(downloadAllBtn);
        panel.appendChild(actions);

        // 6. Results box
        resultsBox = createElement('div', {
            marginTop: '16px',
            maxHeight: '160px',
            overflowY: 'auto',
            borderRadius: '8px',
            background: 'rgba(0, 0, 0, 0.3)',
            padding: '10px',
            fontSize: '11px',
            fontFamily: 'monospace',
            border: '1px solid rgba(255, 255, 255, 0.04)',
            display: 'none'
        }, { id: 'gpd-results-box' });
        panel.appendChild(resultsBox);

        // 7. Create mini-trigger icon (floating launcher when panel is closed)
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
        console.log('[GP Downloader] Panel and Trigger appended to document.');

        // Close/Open toggles
        closeBtn.addEventListener('click', () => {
            panel.style.display = 'none';
            panelTrigger.style.display = 'flex';
        });

        panelTrigger.addEventListener('click', () => {
            panel.style.display = 'block';
            panelTrigger.style.display = 'none';
        });

        panelTrigger.addEventListener('mouseenter', () => {
            panelTrigger.style.transform = 'scale(1.1)';
        });
        panelTrigger.addEventListener('mouseleave', () => {
            panelTrigger.style.transform = 'scale(1)';
        });

        // Button hover effects via JS
        const buttons = [scanBtn, copyBtn, downloadAllBtn];
        buttons.forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                if (!btn.disabled) {
                    btn.style.filter = 'brightness(1.15)';
                    btn.style.transform = 'translateY(-1px)';
                }
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.filter = 'none';
                btn.style.transform = 'none';
            });
        });

        // Main Scan logic
        scanBtn.addEventListener('click', startScanning);

        // Copy Links Event
        copyBtn.addEventListener('click', () => {
            const textToCopy = fetchedLinks.map(item => item.url).join('\n');
            navigator.clipboard.writeText(textToCopy).then(() => {
                const originalText = copyBtn.textContent;
                copyBtn.textContent = 'Copied!';
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                }, 2000);
            }).catch(err => {
                alert('Failed to copy to clipboard: ' + err);
            });
        });

        // Download All Files Event (Sequential staggered download via hidden iframe)
        downloadAllBtn.addEventListener('click', async () => {
            if (fetchedLinks.length === 0) return;
            
            const originalText = downloadAllBtn.textContent;
            downloadAllBtn.disabled = true;
            
            for (let i = 0; i < fetchedLinks.length; i++) {
                const item = fetchedLinks[i];
                downloadAllBtn.textContent = `Downloading ${i + 1}/${fetchedLinks.length}...`;
                
                // Trigger download using hidden iframe
                const iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                iframe.src = item.url;
                document.body.appendChild(iframe);
                
                // Clean up iframe after 10 seconds
                setTimeout(() => {
                    if (iframe.parentNode) {
                        iframe.parentNode.removeChild(iframe);
                    }
                }, 10000);
                
                // Stagger downloads by 500ms to avoid browser throttling and allow queuing
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            downloadAllBtn.textContent = 'Downloaded!';
            downloadAllBtn.disabled = false;
            setTimeout(() => {
                downloadAllBtn.textContent = originalText;
            }, 2000);
        });

        // Start URL listener
        startUrlListener();

        // Listen for scroll to dynamically attach hover links to recycled grid cards
        window.addEventListener('scroll', attachTileListeners, { passive: true });
        setInterval(attachTileListeners, 500);
    }

    // Detect SPA Navigation Changes
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
        console.log('[GP Downloader] handleUrlChange called. Current URL:', location.href);
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

        console.log('[GP Downloader] Resolved Keys -> albumMediaKey:', albumMediaKey, 'authKey:', authKey);

        if (albumMediaKey) {
            // Find album title
            const titleEl = document.querySelector('h1') || document.querySelector('[role="heading"]');
            albumTitle = titleEl ? titleEl.textContent.trim() : 'Google Photos Album';
            if (albumInfo) albumInfo.textContent = `Album: ${albumTitle}`;
            
            // Reset state
            if (statusText) statusText.textContent = 'Ready to scan.';
            if (progressBar) progressBar.style.display = 'none';
            if (progressFill) progressFill.style.width = '0%';
            
            if (scanBtn) {
                scanBtn.disabled = false;
                applyStyles(scanBtn, { background: '#3c4043', border: '1px solid #5f6368', color: '#ffffff' });
            }
        } else {
            // Display instructions instead of hiding the panel completely
            if (albumInfo) albumInfo.textContent = 'No Album Page Detected';
            if (statusText) statusText.textContent = 'Please open a shared or private album to fetch download links.';
            if (progressBar) progressBar.style.display = 'none';
            
            if (scanBtn) {
                scanBtn.disabled = true;
                applyStyles(scanBtn, { background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.04)', color: '#80868b' });
            }
            if (copyBtn) {
                copyBtn.disabled = true;
                applyStyles(copyBtn, { background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.04)', color: '#80868b' });
            }
            if (downloadAllBtn) {
                downloadAllBtn.disabled = true;
                applyStyles(downloadAllBtn, { background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.04)', color: '#80868b' });
            }
            if (resultsBox) {
                resultsBox.style.display = 'none';
                resultsBox.innerHTML = '';
            }
            fetchedLinks = [];
            mediaKeyToDownloadUrl.clear();
        }
    }

    // RPC Helper
    async function sendRpc(rpcid, data) {
        const wizData = window.WIZ_global_data;
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

    async function startScanning() {
        if (!albumMediaKey) return;
        
        scanBtn.disabled = true;
        applyStyles(scanBtn, { background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.04)', color: '#80868b' });
        progressBar.style.display = 'block';
        resultsBox.style.display = 'none';
        resultsBox.innerHTML = '';
        fetchedLinks = [];
        mediaKeyToDownloadUrl.clear();

        try {
            statusText.textContent = 'Fetching album items...';
            let albumItems = [];
            let nextPageId = null;

            do {
                const resData = await sendRpc('snAcKc', [albumMediaKey, nextPageId, null, authKey]);
                if (!resData) break;
                
                const pageItems = resData[1] || [];
                albumItems.push(...pageItems.map(item => ({
                    mediaKey: item[0],
                    timestamp: item[2]
                })));
                nextPageId = resData[2] || null;
            } while (nextPageId);

            const total = albumItems.length;
            if (total === 0) {
                statusText.textContent = 'No files found in this album.';
                scanBtn.disabled = false;
                applyStyles(scanBtn, { background: '#3c4043', border: '1px solid #5f6368', color: '#ffffff' });
                return;
            }

            statusText.textContent = `Found ${total} items. Fetching filenames...`;
            
            // Batch retrieve filenames (100 at a time)
            const mediaKeys = albumItems.map(item => item.mediaKey).filter(Boolean);
            const mediaInfoByKey = {};
            const batchSize = 100;
            
            for (let i = 0; i < mediaKeys.length; i += batchSize) {
                const batchKeys = mediaKeys.slice(i, i + batchSize);
                const keysPayload = batchKeys.map(k => [k]);
                const emptyArray = Array(24).fill(null);
                const extraEmptyArray = Array(10).fill(null);
                const secondPart = [...emptyArray, [], ...extraEmptyArray, []];
                
                const batchRes = await sendRpc('EWgK9e', [[[keysPayload], [secondPart]]]);
                const itemsData = batchRes && batchRes[0] ? batchRes[0][1] : [];
                for (const itemData of itemsData) {
                    if (itemData && itemData[0]) {
                        mediaInfoByKey[itemData[0]] = itemData[1] ? itemData[1][3] : '';
                    }
                }
            }

            statusText.textContent = `Retrieving download links... (0/${total})`;
            resultsBox.style.display = 'block';

            // Fetch download links with concurrency limit of 3 to avoid throttling
            const concurrencyLimit = 3;
            let currentActive = 0;
            let currentCompleted = 0;
            let taskIndex = 0;

            const tasks = albumItems.map(item => async () => {
                const fileName = mediaInfoByKey[item.mediaKey] || `unknown_${item.mediaKey}`;
                try {
                    const itemDetails = await sendRpc('VrseUb', [item.mediaKey, null, authKey, null, albumMediaKey]);
                    const downloadUrl = itemDetails[7] || itemDetails[1]; // download_original_url or download_url
                    if (downloadUrl) {
                        mediaKeyToDownloadUrl.set(item.mediaKey, downloadUrl);
                        return { fileName, url: downloadUrl };
                    }
                } catch (e) {
                    console.error(`Failed to fetch link for ${fileName}:`, e);
                }
                return null;
            });

            await new Promise((resolve) => {
                function runNext() {
                    if (taskIndex >= tasks.length && currentActive === 0) {
                        resolve();
                        return;
                    }
                    while (currentActive < concurrencyLimit && taskIndex < tasks.length) {
                        const curIdx = taskIndex++;
                        currentActive++;
                        
                        tasks[curIdx]()
                            .then(res => {
                                if (res) {
                                    fetchedLinks.push(res);
                                    // Add to visible results box programmatically
                                    const resDiv = createElement('div', {
                                        padding: '4px 0',
                                        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                    }, { textContent: `${fetchedLinks.length}. ${res.fileName}` });
                                    resultsBox.appendChild(resDiv);
                                    resultsBox.scrollTop = resultsBox.scrollHeight;
                                }
                            })
                            .finally(() => {
                                currentActive--;
                                currentCompleted++;
                                // Update progress UI
                                const percent = Math.round((currentCompleted / total) * 100);
                                progressFill.style.width = `${percent}%`;
                                statusText.textContent = `Retrieving download links... (${currentCompleted}/${total})`;
                                runNext();
                            });
                    }
                }
                runNext();
            });

            statusText.textContent = `Completed! Successfully fetched ${fetchedLinks.length}/${total} links.`;
            
            if (fetchedLinks.length > 0) {
                copyBtn.disabled = false;
                applyStyles(copyBtn, { background: '#3c4043', border: '1px solid #5f6368', color: '#e8eaed' });
                downloadAllBtn.disabled = false;
                applyStyles(downloadAllBtn, { background: '#3c4043', border: '1px solid #5f6368', color: '#e8eaed' });
            }
            
            scanBtn.disabled = false;
            applyStyles(scanBtn, { background: '#3c4043', border: '1px solid #5f6368', color: '#ffffff' });

        } catch (error) {
            console.error('Scan error:', error);
            statusText.textContent = `Error: ${error.message}`;
            scanBtn.disabled = false;
            applyStyles(scanBtn, { background: '#3c4043', border: '1px solid #5f6368', color: '#ffffff' });
        }
    }

    // Safely bootstrap the initialization
    function bootstrap() {
        if (document.body) {
            init();
        } else {
            console.log('[GP Downloader] document.body not ready. Waiting...');
            document.addEventListener('DOMContentLoaded', init);
            // Fallback timeout just in case DOMContentLoaded was already fired
            setTimeout(bootstrap, 100);
        }
    }

    bootstrap();

})();

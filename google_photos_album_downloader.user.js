// ==UserScript==
// @name         Google Photos Album Downloader
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Streamlined one-click button downloader for Google Photos Albums (Trusted Types & CSP Safe)
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

    // Inject CSS
    const style = document.createElement('style');
    style.textContent = `
        #gpd-download-btn {
            position: fixed;
            bottom: 24px;
            left: 24px;
            z-index: 999999;
            padding: 10px 20px;
            border-radius: 20px;
            font-family: "Google Sans", Roboto, sans-serif;
            font-size: 13px;
            font-weight: 500;
            border: none;
            box-shadow: 0 4px 16px rgba(0,0,0,0.3);
            transition: all 0.2s ease;
            display: none;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            background: #1a73e8;
            color: #ffffff;
        }
        #gpd-download-btn:hover:not(:disabled) {
            background: #1557b0;
            transform: translateY(-1px);
        }
        #gpd-download-btn:active:not(:disabled) {
            transform: translateY(0);
        }
        #gpd-download-btn:disabled {
            background: #3c4043;
            color: #9aa0a6;
            cursor: default;
        }
    `;
    document.head.appendChild(style);

    let downloadBtn;
    let albumMediaKey = null;
    let authKey = null;
    let isDownloading = false;

    function init() {
        if (document.getElementById('gpd-download-btn')) return;

        downloadBtn = document.createElement('button');
        downloadBtn.id = 'gpd-download-btn';
        downloadBtn.textContent = 'Download Album';
        document.body.appendChild(downloadBtn);

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
                downloadBtn.textContent = 'Download Album';
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
        downloadBtn.textContent = 'Scanning...';

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
                downloadBtn.textContent = 'Empty Album';
                setTimeout(resetState, 2000);
                return;
            }

            downloadBtn.textContent = `Downloading (0/${total})`;

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
                                downloadBtn.textContent = `Downloading (${completed}/${total})`;
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

            downloadBtn.textContent = 'Completed!';
            setTimeout(resetState, 3000);

        } catch (error) {
            console.error('Download error:', error);
            downloadBtn.textContent = 'Error!';
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

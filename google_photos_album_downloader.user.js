// ==UserScript==
// @name         Google Photos Album Downloader
// @namespace    http://tampermonkey.net/
// @version      3.7
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
    const PATH_DOWNLOAD_OUTLINE = "M12 3v12m0 0 4-4m-4 4-4-4M5 18v2h14v-2";
    const PATH_LINK = "M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7a5 5 0 0 0 0 10h4v-1.9H7A3.1 3.1 0 0 1 3.9 12zM8 13h8v-2H8v2zm9-6h-4v1.9h4a3.1 3.1 0 1 1 0 6.2h-4V17h4a5 5 0 0 0 0-10z";
    const PATH_COPY = "M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z";
    const PATH_CHECK = "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z";
    const PATH_CLOSE = "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z";

    // Helper to create SVG programmatically (avoids Trusted Types innerHTML issues)
    function createSvgIcon(pathD, size = 20) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("width", String(size));
        svg.setAttribute("height", String(size));
        svg.setAttribute("fill", "currentColor");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");
        
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", pathD);
        svg.appendChild(path);
        
        return svg;
    }

    function createDownloadIcon(size = 20) {
        const svg = createSvgIcon(PATH_DOWNLOAD_OUTLINE, size);
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
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

        /* Material 3 refinement layer */
        body {
            --gpd-panel-bg: rgba(248, 249, 250, 0.86);
            --gpd-panel-border: rgba(60, 64, 67, 0.24);
            --gpd-text: #202124;
            --gpd-text-secondary: #5f6368;
            --gpd-btn-bg: transparent;
            --gpd-btn-hover: rgba(60, 64, 67, 0.1);
            --gpd-btn-trigger-hover: rgba(60, 64, 67, 0.12);
            --gpd-btn-text: #3c4043;
            --gpd-btn-primary-bg: #3c4043;
            --gpd-btn-primary-text: #ffffff;
            --gpd-btn-primary-hover: #202124;
            --gpd-progress-bg: rgba(60, 64, 67, 0.14);
            --gpd-accent: #5f6368;
            --gpd-primary-container: rgba(60, 64, 67, 0.14);
            --gpd-on-primary-container: #202124;
            --gpd-surface-container: rgba(255, 255, 255, 0.42);
            --gpd-surface-container-high: rgba(60, 64, 67, 0.14);
            --gpd-success: #137333;
            --gpd-error: #b3261e;
            --gpd-focus: #5f6368;
            --gpd-shadow: 0 8px 24px rgba(32, 33, 36, 0.18), 0 1px 4px rgba(32, 33, 36, 0.12);
        }
        body.gp-dark-mode {
            --gpd-panel-bg: rgba(24, 25, 28, 0.8) !important;
            --gpd-panel-border: rgba(232, 234, 237, 0.22) !important;
            --gpd-text: #f1f3f4 !important;
            --gpd-text-secondary: #bdc1c6 !important;
            --gpd-btn-bg: transparent !important;
            --gpd-btn-hover: rgba(232, 234, 237, 0.12) !important;
            --gpd-btn-trigger-hover: rgba(232, 234, 237, 0.14) !important;
            --gpd-btn-text: #e8eaed !important;
            --gpd-btn-primary-bg: #e8eaed !important;
            --gpd-btn-primary-text: #202124 !important;
            --gpd-btn-primary-hover: #ffffff !important;
            --gpd-progress-bg: rgba(255, 255, 255, 0.14) !important;
            --gpd-accent: #bdc1c6 !important;
            --gpd-primary-container: rgba(255, 255, 255, 0.14) !important;
            --gpd-on-primary-container: #ffffff !important;
            --gpd-surface-container: rgba(255, 255, 255, 0.08) !important;
            --gpd-surface-container-high: rgba(255, 255, 255, 0.14) !important;
            --gpd-success: #81c995 !important;
            --gpd-error: #f2b8b5 !important;
            --gpd-focus: #e8eaed !important;
            --gpd-shadow: 0 10px 28px rgba(0, 0, 0, 0.38), 0 1px 5px rgba(0, 0, 0, 0.28) !important;
        }
        #gpd-trigger-btn {
            width: 48px;
            height: 48px;
            border-radius: 16px;
            color: var(--gpd-btn-text);
            border-color: var(--gpd-panel-border);
            background: var(--gpd-panel-bg);
            backdrop-filter: blur(18px) saturate(110%);
            -webkit-backdrop-filter: blur(18px) saturate(110%);
            transition: background-color 180ms ease, box-shadow 180ms ease, opacity 160ms ease;
            touch-action: manipulation;
        }
        #gpd-trigger-btn:hover {
            transform: none;
            background: var(--gpd-btn-trigger-hover);
            box-shadow: 0 10px 30px rgba(60, 64, 67, 0.28);
        }
        #gpd-trigger-btn:active {
            transform: none;
            background: var(--gpd-surface-container-high);
        }
        #gpd-trigger-btn:focus-visible,
        #gpd-panel button:focus-visible {
            outline: 3px solid color-mix(in srgb, var(--gpd-focus) 55%, transparent);
            outline-offset: 2px;
        }
        #gpd-panel {
            width: 320px;
            max-width: calc(100vw - 32px);
            padding: 16px;
            gap: 14px;
            border-radius: 20px;
            border-color: var(--gpd-panel-border);
            background: var(--gpd-panel-bg);
            backdrop-filter: blur(20px) saturate(110%);
            -webkit-backdrop-filter: blur(20px) saturate(110%);
            transform: translateY(10px);
            visibility: hidden;
            transition: opacity 180ms ease, transform 220ms cubic-bezier(0.2, 0, 0, 1), visibility 0s linear 220ms;
        }
        #gpd-panel.gpd-visible {
            transform: translateY(0);
            visibility: visible;
            transition-delay: 0s;
        }
        .gpd-panel-header {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .gpd-brand-mark {
            width: 40px;
            height: 40px;
            flex: 0 0 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 14px;
            color: var(--gpd-on-primary-container);
            background: var(--gpd-primary-container);
        }
        .gpd-heading-group {
            min-width: 0;
            flex: 1;
        }
        .gpd-title {
            margin: 0;
            color: var(--gpd-text);
            font-size: 16px;
            font-weight: 600;
            line-height: 1.35;
        }
        .gpd-subtitle {
            margin: 2px 0 0;
            color: var(--gpd-text-secondary);
            font-size: 12px;
            line-height: 1.4;
        }
        .gpd-close-btn {
            width: 40px;
            height: 40px;
            flex: 0 0 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 0;
            border-radius: 50%;
            background: transparent;
            color: var(--gpd-text-secondary);
            cursor: pointer;
        }
        .gpd-close-btn:hover {
            background: var(--gpd-surface-container);
            color: var(--gpd-text);
        }
        .gpd-status-card {
            display: flex;
            flex-direction: column;
            gap: 4px;
            padding: 11px 12px;
            border-radius: 16px;
            border: 1px solid color-mix(in srgb, var(--gpd-panel-border) 70%, transparent);
            background: var(--gpd-surface-container);
        }
        .gpd-status-text {
            color: var(--gpd-text);
            font-size: 13px;
            font-weight: 600;
            line-height: 1.4;
        }
        .gpd-status-text[data-tone="success"] {
            color: var(--gpd-success);
        }
        .gpd-status-text[data-tone="error"] {
            color: var(--gpd-error);
        }
        .gpd-summary-text {
            color: var(--gpd-text-secondary);
            font-size: 12px;
            line-height: 1.45;
        }
        .gpd-actions {
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
            gap: 8px;
        }
        .gpd-action-btn {
            min-height: 44px;
            padding: 9px 14px;
            border-radius: 14px;
            border-color: var(--gpd-panel-border);
            color: var(--gpd-btn-text);
            font-family: inherit;
            font-weight: 600;
            transition: background-color 160ms ease, color 160ms ease, border-color 160ms ease;
            touch-action: manipulation;
        }
        .gpd-action-btn--wide {
            grid-column: 1 / -1;
        }
        .gpd-action-btn:hover:not(:disabled) {
            border-color: var(--gpd-btn-text);
        }
        .gpd-action-btn:active:not(:disabled) {
            background: var(--gpd-surface-container-high);
        }
        .gpd-action-btn:disabled {
            opacity: 0.42;
            cursor: not-allowed;
        }
        .gpd-action-btn-primary {
            border: 1px solid var(--gpd-btn-primary-bg);
        }
        .gpd-action-label {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .gpd-progress-bar {
            height: 4px;
            margin: 0;
            border-radius: 999px;
        }
        .gpd-progress-fill {
            border-radius: inherit;
            transition: width 200ms cubic-bezier(0.2, 0, 0, 1), background-color 160ms ease;
        }
        .gpd-progress-fill[data-tone="success"] {
            background: var(--gpd-success);
        }
        .gpd-progress-fill[data-tone="error"] {
            background: var(--gpd-error);
        }
        @media (max-width: 420px) {
            #gpd-trigger-btn,
            #gpd-panel {
                left: 16px;
                bottom: 16px;
            }
            #gpd-panel {
                padding: 14px;
            }
        }
        @media (prefers-reduced-motion: reduce) {
            #gpd-trigger-btn,
            #gpd-panel,
            .gpd-action-btn,
            .gpd-progress-fill {
                transition-duration: 1ms !important;
            }
        }

        /* Unified Google Photos blue + translucent surface theme */
        body {
            --gpd-expressive: #0b57d0;
            --gpd-expressive-on-container: #041e49;
            --gpd-success: #0b57d0;
            --gpd-error: #0b57d0;
            --gpd-focus: #0b57d0;
            --gpd-accent: #0b57d0;
            --gpd-glass: rgba(255, 255, 255, 0.72);
            --gpd-glass-outline: rgba(60, 64, 67, 0.16);
            --gpd-glass-shadow: rgba(32, 33, 36, 0.14);
            --gpd-glass-surface: var(--gpd-glass);
            --gpd-glass-hover: color-mix(in srgb, var(--gpd-glass) 92%, var(--gpd-expressive));
            --gpd-glass-primary: color-mix(in srgb, var(--gpd-glass) 88%, var(--gpd-expressive));
            --gpd-glass-elevation: 0 6px 20px var(--gpd-glass-shadow);
            --gpd-spring: cubic-bezier(0.2, 0, 0, 1.35);
        }
        body.gp-dark-mode {
            --gpd-expressive: #a8c7fa !important;
            --gpd-expressive-on-container: #d3e3fd !important;
            --gpd-success: #a8c7fa !important;
            --gpd-error: #a8c7fa !important;
            --gpd-focus: #a8c7fa !important;
            --gpd-accent: #a8c7fa !important;
            --gpd-glass: rgba(28, 28, 30, 0.72) !important;
            --gpd-glass-outline: rgba(255, 255, 255, 0.14) !important;
            --gpd-glass-shadow: rgba(0, 0, 0, 0.28) !important;
        }
        #gpd-trigger-btn {
            border-radius: 18px;
            border-color: var(--gpd-glass-outline);
            background: var(--gpd-glass-surface);
            box-shadow: var(--gpd-glass-elevation);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            transition:
                border-radius 260ms var(--gpd-spring),
                transform 260ms var(--gpd-spring),
                background-color 180ms ease,
                box-shadow 180ms ease,
                opacity 160ms ease;
        }
        #gpd-trigger-btn:hover {
            border-radius: 24px;
            color: var(--gpd-expressive-on-container);
            background: var(--gpd-glass-primary);
            box-shadow: var(--gpd-glass-elevation);
        }
        #gpd-trigger-btn:active {
            border-radius: 14px;
            transform: scale(0.94);
        }
        #gpd-panel {
            overflow: hidden;
            isolation: isolate;
            border-radius: 28px;
            border-color: var(--gpd-glass-outline);
            background: var(--gpd-glass-surface);
            box-shadow: var(--gpd-glass-elevation);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
        }
        .gpd-brand-mark {
            border-radius: 18px;
            color: var(--gpd-expressive-on-container);
            background: var(--gpd-glass-primary);
            box-shadow: none;
        }
        .gpd-close-btn {
            border: 1px solid var(--gpd-glass-outline);
            background: transparent;
            box-shadow: none;
        }
        .gpd-close-btn:hover {
            color: var(--gpd-expressive-on-container);
            background: var(--gpd-glass-hover);
        }
        .gpd-status-card {
            border-radius: 20px;
            border-color: var(--gpd-glass-outline);
            background: rgba(127, 127, 127, 0.06);
            box-shadow: none;
        }
        .gpd-action-btn {
            border-radius: 16px;
            border-color: var(--gpd-glass-outline);
            background: transparent;
            box-shadow: none;
            transition:
                border-radius 260ms var(--gpd-spring),
                transform 260ms var(--gpd-spring),
                background-color 160ms ease,
                color 160ms ease,
                border-color 160ms ease;
        }
        .gpd-action-btn:hover:not(:disabled) {
            border-radius: 22px;
            background: var(--gpd-glass-hover);
        }
        .gpd-action-btn:active:not(:disabled) {
            border-radius: 12px;
            transform: scale(0.97);
        }
        .gpd-action-btn-primary {
            color: var(--gpd-expressive-on-container) !important;
            border-color: color-mix(in srgb, var(--gpd-expressive) 22%, transparent);
            background: var(--gpd-glass-primary) !important;
            box-shadow: none;
        }
        .gpd-action-btn-primary:hover:not(:disabled) {
            color: var(--gpd-expressive-on-container) !important;
            border-color: color-mix(in srgb, var(--gpd-expressive) 36%, transparent);
            background: var(--gpd-glass-hover) !important;
        }
        .gpd-action-btn-primary:active:not(:disabled) {
            color: var(--gpd-expressive-on-container) !important;
            background: var(--gpd-glass-primary) !important;
        }
        .gpd-progress-fill {
            background: var(--gpd-expressive);
            box-shadow: none;
        }
        .gpd-progress-bar {
            border: 1px solid var(--gpd-glass-outline);
            background: rgba(127, 127, 127, 0.08);
            box-shadow: none;
        }
    `;
    document.head.appendChild(style);

    let panel, panelTrigger, panelClose, progressBar, progressFill, statusText, summaryText;
    let scanBtn, copyBtn, downloadAllBtn;
    let albumMediaKey = null;
    let authKey = null;
    let fetchedItems = [];
    let isWorking = false;
    let lastAlbumKey = null;
    const RPC_TIMEOUT_MS = 15000;
    const RPC_MAX_ATTEMPTS = 2;

    function setButtonContent(button, iconPath, label) {
        const labelNode = document.createElement('span');
        labelNode.className = 'gpd-action-label';
        labelNode.textContent = label;
        const icon = iconPath === PATH_DOWNLOAD ? createDownloadIcon(18) : createSvgIcon(iconPath, 18);
        button.replaceChildren(icon, labelNode);
    }

    function setButtonLabel(button, label) {
        const labelNode = button?.querySelector('.gpd-action-label');
        if (labelNode) labelNode.textContent = label;
    }

    function setPanelStatus(message, detail, tone = 'neutral') {
        if (statusText) {
            statusText.textContent = message;
            statusText.dataset.tone = tone;
        }
        if (summaryText) {
            const hasDetail = Boolean(detail);
            summaryText.textContent = hasDetail ? detail : '';
            summaryText.style.display = hasDetail ? 'block' : 'none';
        }
    }

    function setProgress(value, tone = 'primary') {
        const boundedValue = Math.max(0, Math.min(100, Number(value) || 0));
        if (progressFill) {
            progressFill.style.width = `${boundedValue}%`;
            progressFill.dataset.tone = tone;
        }
        if (progressBar) progressBar.setAttribute('aria-valuenow', String(boundedValue));
    }

    function init() {
        if (document.getElementById('gpd-trigger-btn')) return;

        // 1. Create Floating Trigger Button
        panelTrigger = document.createElement('button');
        panelTrigger.id = 'gpd-trigger-btn';
        panelTrigger.type = 'button';
        panelTrigger.title = 'Open album download tools';
        panelTrigger.setAttribute('aria-label', 'Open album download tools');
        panelTrigger.setAttribute('aria-controls', 'gpd-panel');
        panelTrigger.setAttribute('aria-expanded', 'false');
        panelTrigger.replaceChildren(createDownloadIcon());
        document.body.appendChild(panelTrigger);

        // 2. Create Panel
        panel = document.createElement('div');
        panel.id = 'gpd-panel';
        panel.setAttribute('role', 'region');
        panel.setAttribute('aria-label', 'Album download tools');
        panel.setAttribute('aria-hidden', 'true');

        const panelHeader = document.createElement('div');
        panelHeader.className = 'gpd-panel-header';

        const brandMark = document.createElement('div');
        brandMark.className = 'gpd-brand-mark';
        brandMark.appendChild(createDownloadIcon(21));

        const headingGroup = document.createElement('div');
        headingGroup.className = 'gpd-heading-group';

        const title = document.createElement('h2');
        title.className = 'gpd-title';
        title.textContent = 'Album downloader';

        headingGroup.appendChild(title);

        panelClose = document.createElement('button');
        panelClose.type = 'button';
        panelClose.className = 'gpd-close-btn';
        panelClose.title = 'Close';
        panelClose.setAttribute('aria-label', 'Close album download tools');
        panelClose.appendChild(createSvgIcon(PATH_CLOSE, 19));

        panelHeader.append(brandMark, headingGroup, panelClose);
        panel.appendChild(panelHeader);

        const statusCard = document.createElement('div');
        statusCard.className = 'gpd-status-card';

        statusText = document.createElement('div');
        statusText.className = 'gpd-status-text';
        statusText.setAttribute('role', 'status');
        statusText.setAttribute('aria-live', 'polite');
        statusText.textContent = 'Ready';

        summaryText = document.createElement('div');
        summaryText.className = 'gpd-summary-text';
        summaryText.textContent = '';
        summaryText.style.display = 'none';

        statusCard.append(statusText, summaryText);
        panel.appendChild(statusCard);

        // Progress bar
        progressBar = document.createElement('div');
        progressBar.className = 'gpd-progress-bar';
        progressBar.setAttribute('role', 'progressbar');
        progressBar.setAttribute('aria-label', 'Album processing progress');
        progressBar.setAttribute('aria-valuemin', '0');
        progressBar.setAttribute('aria-valuemax', '100');
        progressBar.setAttribute('aria-valuenow', '0');

        progressFill = document.createElement('div');
        progressFill.className = 'gpd-progress-fill';
        progressBar.appendChild(progressFill);
        panel.appendChild(progressBar);

        const actions = document.createElement('div');
        actions.className = 'gpd-actions';

        // 3 Buttons
        scanBtn = document.createElement('button');
        scanBtn.type = 'button';
        scanBtn.className = 'gpd-action-btn gpd-action-btn-primary gpd-action-btn--wide';
        setButtonContent(scanBtn, PATH_LINK, 'Fetch links');
        actions.appendChild(scanBtn);

        copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'gpd-action-btn';
        setButtonContent(copyBtn, PATH_COPY, 'Copy');
        copyBtn.disabled = true;
        actions.appendChild(copyBtn);

        downloadAllBtn = document.createElement('button');
        downloadAllBtn.type = 'button';
        downloadAllBtn.className = 'gpd-action-btn';
        setButtonContent(downloadAllBtn, PATH_DOWNLOAD, 'Download');
        downloadAllBtn.disabled = true;
        actions.appendChild(downloadAllBtn);

        panel.appendChild(actions);
        document.body.appendChild(panel);

        // Event Listeners for Hover-triggered Menu
        let closeTimeout = null;
        function openPanel() {
            if (closeTimeout) {
                clearTimeout(closeTimeout);
                closeTimeout = null;
            }
            panel.classList.add('gpd-visible');
            panel.setAttribute('aria-hidden', 'false');
            panelTrigger.setAttribute('aria-expanded', 'true');
            panelTrigger.style.opacity = '0';
            panelTrigger.style.pointerEvents = 'none';
        }
        function closePanel(immediate = false) {
            if (closeTimeout) {
                if (!immediate) return;
                clearTimeout(closeTimeout);
                closeTimeout = null;
            }
            const finishClose = () => {
                if (!immediate && panel.matches(':hover, :focus-within')) {
                    closeTimeout = null;
                    return;
                }
                panel.classList.remove('gpd-visible');
                panel.setAttribute('aria-hidden', 'true');
                panelTrigger.setAttribute('aria-expanded', 'false');
                panelTrigger.style.opacity = '1';
                panelTrigger.style.pointerEvents = 'auto';
                closeTimeout = null;
            };
            if (immediate) finishClose();
            else closeTimeout = setTimeout(finishClose, 260);
        }

        panelTrigger.addEventListener('mouseenter', openPanel);
        panelTrigger.addEventListener('mouseleave', closePanel);
        panel.addEventListener('mouseenter', openPanel);
        panel.addEventListener('mouseleave', closePanel);
        panelClose.addEventListener('click', () => {
            closePanel(true);
            panelTrigger.focus({ preventScroll: true });
        });

        // Click toggle fallback
        panelTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (panel.classList.contains('gpd-visible')) {
                closePanel(true);
            } else {
                openPanel();
            }
        });

        // Backup close on clicking outside
        document.addEventListener('click', (e) => {
            if (panel.classList.contains('gpd-visible') && 
                !panel.contains(e.target) && 
                !panelTrigger.contains(e.target)) {
                closePanel(true);
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && panel.classList.contains('gpd-visible')) {
                closePanel(true);
                panelTrigger.focus({ preventScroll: true });
            }
        });

        scanBtn.addEventListener('click', startScanningWorkflow);
        copyBtn.addEventListener('click', startCopyWorkflow);
        downloadAllBtn.addEventListener('click', startDownloadAllWorkflow);

        startUrlListener();
    }

    function startUrlListener() {
        let lastUrl = location.href;
        updateThemeClass();
        handleUrlChange();
        setInterval(() => {
            if (document.hidden) return;
            updateThemeClass();
            if (location.href !== lastUrl) {
                if (isWorking) return;
                lastUrl = location.href;
                handleUrlChange();
            }
        }, 1000);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                updateThemeClass();
                if (location.href !== lastUrl && !isWorking) {
                    lastUrl = location.href;
                    handleUrlChange();
                }
            }
        });
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
                setProgress(0);
                setPanelStatus('Ready', '');
                if (scanBtn) {
                    scanBtn.disabled = false;
                    setButtonContent(scanBtn, PATH_LINK, 'Fetch links');
                }
                if (copyBtn) {
                    copyBtn.disabled = true;
                    setButtonContent(copyBtn, PATH_COPY, 'Copy');
                }
                if (downloadAllBtn) {
                    downloadAllBtn.disabled = true;
                    setButtonContent(downloadAllBtn, PATH_DOWNLOAD, 'Download');
                }
            }
        } else {
            if (panelTrigger) panelTrigger.style.display = 'none';
            if (panel) {
                panel.classList.remove('gpd-visible');
                panel.setAttribute('aria-hidden', 'true');
            }
            if (panelTrigger) {
                panelTrigger.setAttribute('aria-expanded', 'false');
                panelTrigger.style.opacity = '1';
                panelTrigger.style.pointerEvents = 'auto';
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
                await new Promise(resolve => setTimeout(resolve, 350 * attempt));
            } finally {
                clearTimeout(timeoutId);
            }
        }
        throw lastError || new Error(`RPC ${rpcid} failed`);
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
        setButtonLabel(scanBtn, `Resolving 0/${total}`);
        setPanelStatus(`Resolving links · 0/${total}`, '');
        setProgress(0);

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
                        setProgress(percent);
                        setButtonLabel(scanBtn, `Resolving ${completed}/${total}`);
                        setPanelStatus(`Resolving links · ${completed}/${total}`, '');
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
                            setProgress(percent);
                            setButtonLabel(scanBtn, `Resolving ${completed}/${total}`);
                            setPanelStatus(`Resolving links · ${completed}/${total}`, '');
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
        
        scanBtn.setAttribute('aria-busy', 'true');
        setButtonLabel(scanBtn, 'Scanning album');
        setPanelStatus('Scanning album…', '');
        setProgress(0);

        try {
            let albumItems = [];
            let nextPageId = null;
            const seenPageIds = new Set();

            do {
                const resData = await sendRpc('snAcKc', [albumMediaKey, nextPageId, null, authKey]);
                const pageItems = resData[1] || [];
                albumItems.push(...pageItems.map(item => item[0]).filter(Boolean));
                nextPageId = resData[2] || null;
                if (nextPageId) {
                    if (seenPageIds.has(nextPageId)) {
                        throw new Error('Album pagination returned a repeated page token');
                    }
                    seenPageIds.add(nextPageId);
                }
            } while (nextPageId);

            albumItems = [...new Set(albumItems)];
            const total = albumItems.length;
            if (total === 0) {
                setButtonLabel(scanBtn, 'Try again');
                setPanelStatus('No items found', 'Open the album again and retry.', 'error');
                setProgress(100, 'error');
                isWorking = false;
                scanBtn.disabled = false;
                return;
            }

            const previousUrls = new Map(fetchedItems.map(item => [item.mediaKey, item.downloadUrl]));
            fetchedItems = albumItems.map(mediaKey => ({
                mediaKey,
                downloadUrl: previousUrls.get(mediaKey) || null
            }));
            
            // Immediately resolve all download URLs
            await resolveAllDownloadUrls();

            const urls = fetchedItems.map(item => item.downloadUrl).filter(Boolean);
            const failedCount = total - urls.length;
            if (urls.length === 0) {
                setButtonLabel(scanBtn, 'Try again');
                setPanelStatus('Could not fetch links', 'Refresh Google Photos and retry.', 'error');
                setProgress(100, 'error');
                copyBtn.disabled = true;
                downloadAllBtn.disabled = true;
            } else if (failedCount > 0) {
                setButtonLabel(scanBtn, `Retry ${failedCount} missing`);
                setButtonLabel(copyBtn, `Copy ${urls.length}`);
                setButtonLabel(downloadAllBtn, `Download ${urls.length}`);
                setPanelStatus(
                    `${urls.length}/${total} links ready`,
                    `Retry ${failedCount} missing link${failedCount === 1 ? '' : 's'}.`,
                    'error'
                );
                setProgress(Math.round((urls.length / total) * 100), 'error');
                copyBtn.disabled = false;
                downloadAllBtn.disabled = false;
            } else {
                setButtonLabel(scanBtn, 'Refresh links');
                setButtonLabel(copyBtn, 'Copy');
                setButtonLabel(downloadAllBtn, 'Download');
                setPanelStatus(`${urls.length} links ready`, '', 'success');
                setProgress(100, 'success');
                copyBtn.disabled = false;
                downloadAllBtn.disabled = false;
            }
        } catch (error) {
            console.error('Fetch error:', error);
            setButtonLabel(scanBtn, 'Try again');
            setPanelStatus('Scan failed', 'Refresh Google Photos and retry.', 'error');
            setProgress(100, 'error');
        } finally {
            isWorking = false;
            scanBtn.disabled = false;
            scanBtn.removeAttribute('aria-busy');
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
            setButtonContent(copyBtn, PATH_CHECK, 'Copied');
            setPanelStatus(`${urls.length} links copied`, '', 'success');
            
            setTimeout(() => {
                setButtonContent(copyBtn, PATH_COPY, 'Copy');
            }, 3000);

        } catch (error) {
            console.error('Copy error:', error);
            setButtonLabel(copyBtn, 'Copy failed');
            setPanelStatus('Copy failed', 'Allow clipboard access and retry.', 'error');
            setTimeout(() => setButtonContent(copyBtn, PATH_COPY, 'Copy'), 2500);
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

        downloadAllBtn.setAttribute('aria-busy', 'true');
        setButtonLabel(downloadAllBtn, `Downloading 0/${urls.length}`);
        setPanelStatus(`Downloading · 0/${urls.length}`, '');
        setProgress(0);

        try {
            for (let i = 0; i < urls.length; i++) {
                setButtonLabel(downloadAllBtn, `Downloading ${i + 1}/${urls.length}`);
                const percent = Math.round(((i + 1) / urls.length) * 100);
                setProgress(percent);
                setPanelStatus(`Downloading · ${i + 1}/${urls.length}`, '');
                
                await triggerSingleDownload(urls[i]);
                await new Promise(r => setTimeout(r, 500));
            }

            setButtonContent(downloadAllBtn, PATH_CHECK, 'Started');
            setPanelStatus(`${urls.length} downloads started`, '', 'success');
            setProgress(100, 'success');
            
            setTimeout(() => {
                setButtonContent(downloadAllBtn, PATH_DOWNLOAD, 'Download');
            }, 4000);

        } catch (error) {
            console.error('Download all error:', error);
            setButtonLabel(downloadAllBtn, 'Download failed');
            setPanelStatus('Download interrupted', 'Allow multiple downloads and retry.', 'error');
            setProgress(100, 'error');
        } finally {
            isWorking = false;
            scanBtn.disabled = false;
            copyBtn.disabled = false;
            downloadAllBtn.disabled = false;
            downloadAllBtn.removeAttribute('aria-busy');
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

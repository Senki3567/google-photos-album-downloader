# Google Photos Album Downloader

A lightweight, premium, and secure Tampermonkey userscript to retrieve and download original quality direct download links for all files (photos and videos) in any Google Photos shared or private album.

🌐 **[Tiếng Việt (Vietnamese)](./README.vi.md)**
<p align="center">
  <img src="./assets/preview_light.png" width="48%" alt="GP Downloader Light Mode" />
  <img src="./assets/preview_dark.png" width="48%" alt="GP Downloader Dark Mode" />
</p>

---

## Key Features

- **Sequential Download All**: Automatically triggers sequential file downloads for the entire album using hidden iframes with a 500ms stagger delay, preventing browser throttling and navigation crashes.
- **Copy All Links**: Easily copy all resolved direct download URLs to clipboard in one click.
- **Individual File List**: Displays a beautiful, scrollable list of all scanned items inside the panel. Copy direct links or download files individually with dedicated action buttons.
- **Original Quality Priority**: Fetches original quality links by default (falls back gracefully to high quality when original is not direct, like on certain video transcodes).
- **Unified Light/Dark Glassmorphism UI**: High-end translucent panel with a blur effect and Google Photos Blue accents that auto-detects and adapts to Google Photos' active theme.
- **Strict Security & CSP Safe**: Fully compliant with Google Photos' strict CSP (Content Security Policy) and Trusted Types policy. Employs programmatic DOM node creation instead of unsafe `innerHTML`.
- **Top Window execution**: Works safely under `@noframes` to run only once in the main tab context.

---

## Installation

### Direct Install (Fastest)

1. Make sure you have a Userscript Manager installed (e.g., [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/)).
2. Click the badge below to install directly:

[![Install directly](https://img.shields.io/badge/Install-Tampermonkey-green?style=for-the-badge&logo=tampermonkey)](https://github.com/Senki3567/google-photos-album-downloader/raw/main/google_photos_album_downloader.user.js)

### Manual Install

1. Install a Userscript Manager extension in your browser.
2. Copy the code from [google_photos_album_downloader.user.js](./google_photos_album_downloader.user.js).
3. Open your Userscript Manager Dashboard and create a new script.
4. Paste the copied code and save it (Ctrl + S).

---

## How to Use

1. Open any shared or private album on Google Photos (`https://photos.google.com/share/...` or `https://photos.google.com/album/...`).
2. Click **Fetch Download Links** to start scanning and retrieving filenames and direct download URLs.
3. Once completed:
   - Click **Copy All Links** to copy all download URLs.
   - Click **Download All** to start downloading all files sequentially.
4. **Note for first-time use**: The browser might prompt you to allow multiple file downloads. Click **Allow** (Cho phép) to let the downloader proceed automatically.

---

## License

This project is open-source and free to use. Feel free to copy, modify, and share it.

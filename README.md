# Google Photos Album Downloader

A lightweight, premium, and secure Tampermonkey userscript to retrieve and download original quality direct download links for all files (photos and videos) in any Google Photos shared or private album.

---

## Key Features

- **Sequential Download All**: Automatically triggers sequential file downloads for the entire album using hidden iframes with a 500ms stagger delay, preventing browser throttling and navigation crashes.
- **Copy All Links**: Easily copy all resolved direct download URLs to clipboard.
- **Original Quality Priority**: Fetches original quality links by default (falls back gracefully to high quality when original is not direct, like on certain video transcodes).
- **Premium Grayscale Dark UI**: Sleek, modern, and non-intrusive floating panel in the bottom-left corner that blends beautifully with the Google Photos layout.
- **Strict Security Safe**: Fully compliant with Google Photos' strict CSP (Content Security Policy) and Trusted Types policy. Employs programmatic DOM node creation instead of unsafe `innerHTML`.
- **Top Window execution**: Works safely under `@noframes` to run only once in the main tab context.

---

## Installation

1. Install a Userscript Manager extension in your browser:
   - [Tampermonkey](https://www.tampermonkey.net/) (Recommended)
   - [Violentmonkey](https://violentmonkey.github.io/)
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

# Trình Tải Album Google Photos (Tiếng Việt)

Userscript Tampermonkey siêu nhẹ, mượt mà và bảo mật giúp lấy link tải trực tiếp chất lượng gốc của tất cả ảnh và video trong bất kỳ album chia sẻ hoặc album cá nhân nào trên Google Photos.

## Các Tính Năng Nổi Bật

- **Tải Xuống Tất Cả (Download All)**: Tự động kích hoạt tải xuống hàng loạt, tuần tự (cách nhau 500ms) bằng iframe ẩn. Giúp tránh việc trình duyệt bị nghẽn hoặc chặn tải hàng loạt.
- **Sao Chép Toàn Bộ Link (Copy All Links)**: Sao chép toàn bộ đường dẫn tải trực tiếp vào clipboard chỉ với 1 cú click.
- **Ưu Tiên Chất Lượng Gốc**: Mặc định tải file ở chất lượng gốc (hoặc chất lượng tốt nhất đối với các tệp video nén).
- **Giao Diện Trực Quan Tối Giản**: Panel điều khiển nằm ở góc dưới bên trái, thiết kế tông màu xám/tối sạch sẽ, chuyên nghiệp, không làm ảnh hưởng đến trải nghiệm xem ảnh của bạn.
- **Bảo Mật An Toàn**: Bỏ qua các kiểm tra bảo mật ngặt nghèo (Trusted Types và Content Security Policy) của Google bằng cách khởi tạo các thành phần DOM lập trình thay vì dùng `innerHTML` không an toàn.

## Hướng Dẫn Cài Đặt

1. Cài đặt tiện ích quản lý Userscript cho trình duyệt của bạn:
   - [Tampermonkey](https://www.tampermonkey.net/) (Khuyên dùng)
   - [Violentmonkey](https://violentmonkey.github.io/)
2. Sao chép toàn bộ mã nguồn của file [google_photos_album_downloader.user.js](./google_photos_album_downloader.user.js).
3. Mở Bảng điều khiển (Dashboard) của Tampermonkey/Violentmonkey, chọn tạo script mới.
4. Dán mã nguồn đã copy vào và nhấn **Lưu** (Ctrl + S).

## Cách Sử Dụng

1. Truy cập vào bất kỳ Album chia sẻ hoặc Album cá nhân nào trên Google Photos (`https://photos.google.com/share/...` hoặc `https://photos.google.com/album/...`).
2. Nhấn nút **Fetch Download Links** để bắt đầu quét các file trong album.
3. Sau khi quét xong:
   - Chọn **Copy All Links** để lưu toàn bộ link tải.
   - Chọn **Download All** để bắt đầu tự động tải toàn bộ ảnh/video về máy.
4. **Lưu ý trong lần tải đầu tiên**: Trình duyệt có thể hiển thị cảnh báo cho phép tải nhiều tệp. Bạn chọn **Allow (Cho phép)** để trình duyệt tự động tải xuống hàng loạt.

---

## License

This project is open-source and free to use. Feel free to copy, modify, and share it.

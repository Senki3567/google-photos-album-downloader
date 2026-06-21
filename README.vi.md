# Trình Tải Album Google Photos

Userscript Tampermonkey siêu nhẹ, mượt mà và bảo mật giúp lấy link tải trực tiếp chất lượng gốc của tất cả ảnh và video trong bất kỳ album chia sẻ hoặc album cá nhân nào trên Google Photos.

🌐 **[English (Tiếng Anh)](./README.md)**

![GP Downloader Preview](./preview.png)

---

## Các Tính Năng Nổi Bật

- **Tải Xuống Tất Cả (Download All)**: Tự động kích hoạt tải xuống hàng loạt, tuần tự (cách nhau 500ms) bằng iframe ẩn. Giúp tránh việc trình duyệt bị nghẽn hoặc chặn tải hàng loạt.
- **Sao Chép Toàn Bộ Link (Copy All Links)**: Sao chép toàn bộ đường dẫn tải trực tiếp vào clipboard chỉ với 1 cú click.
- **Hover để Sao chép Link**: Sau khi quét xong album, di chuột vào bất kỳ tệp nào trên lưới và click nút `🔗 Copy Link` nổi ở góc trên bên phải của tệp để sao chép nhanh link tải trực tiếp của tệp đó.
- **Ưu Tiên Chất Lượng Gốc**: Mặc định tải file ở chất lượng gốc (hoặc chất lượng tốt nhất đối với các tệp video nén).
- **Giao Diện Trực Quan Tối Giản**: Panel điều khiển nằm ở góc dưới bên trái, thiết kế tông màu xám/tối sạch sẽ, chuyên nghiệp, không làm ảnh hưởng đến trải nghiệm xem ảnh của bạn.
- **Bảo Mật An Toàn**: Bỏ qua các kiểm tra bảo mật ngặt nghèo (Trusted Types và Content Security Policy) của Google bằng cách khởi tạo các thành phần DOM lập trình thay vì dùng `innerHTML` không an toàn.

---

## Hướng Dẫn Cài Đặt

### Cài Đặt Trực Tiếp (Nhanh Nhất)

1. Đảm bảo bạn đã cài đặt tiện ích quản lý Userscript (ví dụ: [Tampermonkey](https://www.tampermonkey.net/) hoặc [Violentmonkey](https://violentmonkey.github.io/)).
2. Nhấp vào nút dưới đây để cài đặt trực tiếp:

[![Cài đặt trực tiếp](https://img.shields.io/badge/Cài_Đặt-Tampermonkey-green?style=for-the-badge&logo=tampermonkey)](https://github.com/Senki3567/google-photos-album-downloader/raw/main/google_photos_album_downloader.user.js)

### Cài Đặt Thủ Công

1. Cài đặt tiện ích quản lý Userscript cho trình duyệt của bạn.
2. Sao chép toàn bộ mã nguồn của file [google_photos_album_downloader.user.js](./google_photos_album_downloader.user.js).
3. Mở Bảng điều khiển (Dashboard) của Tampermonkey/Violentmonkey, chọn tạo script mới.
4. Dán mã nguồn đã copy vào và nhấn **Lưu** (Ctrl + S).

---

## Cách Sử Dụng

1. Truy cập vào bất kỳ Album chia sẻ hoặc Album cá nhân nào trên Google Photos (`https://photos.google.com/share/...` hoặc `https://photos.google.com/album/...`).
2. Nhấn nút **Fetch Download Links** để bắt đầu quét các file trong album.
3. Sau khi quét xong:
   - Chọn **Copy All Links** để lưu toàn bộ link tải.
   - Chọn **Download All** để bắt đầu tự động tải toàn bộ ảnh/video về máy.
4. **Lưu ý trong lần tải đầu tiên**: Trình duyệt có thể hiển thị cảnh báo cho phép tải nhiều tệp. Bạn chọn **Allow (Cho phép)** để trình duyệt tự động tải xuống hàng loạt.

---

## Bản Quyền

Dự án này là mã nguồn mở và sử dụng hoàn toàn miễn phí. Bạn có thể sao chép, chỉnh sửa và chia sẻ tự do.

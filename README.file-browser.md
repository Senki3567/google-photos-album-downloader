# Google Photos File Browser

Userscript độc lập bổ sung giao diện duyệt tệp ngay trong Google Photos.

## Chức năng

- Xem album như thư mục và ảnh/video như tệp.
- Duyệt Library, Favorites và toàn bộ album.
- Duyệt và khôi phục tệp trong Trash.
- Chuyển đổi giữa Grid view và List view.
- Hiển thị thumbnail, tên tệp, ngày và dung lượng.
- Chọn một hoặc nhiều tệp, hỗ trợ `Ctrl/Cmd + A`.
- Nút Select all tự đổi thành Deselect all khi mọi mục đang hiển thị đã được chọn.
- Mở ảnh, sao chép link tải và tải nhiều tệp.
- Tạo album mới.
- Thêm tệp vào album hoặc chuyển giữa các album.
- Xóa tệp khỏi album nhưng vẫn giữ trong thư viện.
- Thêm hoặc xóa trạng thái Favorites.
- Chuyển tệp gốc vào thùng rác sau bước xác nhận.
- Gọi giao diện Upload gốc của Google Photos.

## Cài đặt

1. Cài Tampermonkey hoặc Violentmonkey.
2. Tạo userscript mới.
3. Dán nội dung của `google_photos_file_browser.user.js` và lưu.
4. Mở Google Photos, sau đó nhấn nút thư mục ở góc trái.

Script không yêu cầu Google Photos Toolkit hay userscript nào khác.

## Lưu ý

Google Photos không có cấu trúc thư mục thật. Thao tác **Move** được thực hiện bằng cách thêm tệp vào album đích rồi xóa tệp khỏi album nguồn. Tệp gốc vẫn nằm trong Library.

Các thao tác sử dụng API web nội bộ của Google Photos nên có thể cần cập nhật nếu Google thay đổi giao thức.

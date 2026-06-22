# Engineering Handoff: Google Photos Userscripts

## 1. Mục tiêu dự án

Repository chứa ba userscript độc lập cho Google Photos:

1. `google_photos_album_downloader.user.js`
   - Panel tải toàn bộ album.
   - Lấy direct download links, copy links và tải hàng loạt.

2. `google_photos_album_adder_album_filename_on_hover.user.js`
   - Hiển thị filename, size và album membership khi hover.
   - Thêm ảnh vào album, copy filename/direct link, tải file.
   - Hiển thị tổng dung lượng và danh sách file khi hover album.

3. `google_photos_file_browser.user.js`
   - Giao diện file browser tích hợp vào Google Photos.
   - Album được biểu diễn như folder; media được biểu diễn như file.
   - Đây là phần đang được phát triển tích cực và là trọng tâm của handoff.

Mọi script phải:

- Chạy độc lập, không yêu cầu Google Photos Toolkit hoặc userscript khác.
- Không dùng `@require`.
- Hoạt động với Tampermonkey/Violentmonkey.
- Giữ phong cách UI thống nhất: Google Photos Blue, nền trung tính bán trong suốt, blur nhẹ, dark/light mode.

## 2. Trạng thái Git tại thời điểm handoff

Commit tính năng gần nhất:

```text
c722bba Add trash and list view support to file browser
```

Các commit liên quan ngay trước đó:

```text
65d7888 Decouple Google Photos scripts from GPTK API
92c49d3 Refine Google Photos theme and button states
```

Tại thời điểm tạo tài liệu, code File Browser `1.1.0` đã được commit. Working
tree chỉ có `HANDOFF.md` chưa commit.

## 3. Phiên bản hiện tại

| File | Version | Trạng thái |
|---|---:|---|
| `google_photos_album_downloader.user.js` | `3.7` | Ổn định, độc lập |
| `google_photos_album_adder_album_filename_on_hover.user.js` | `1.7.0` | Ổn định, độc lập |
| `google_photos_file_browser.user.js` | `1.1.0` | Đang phát triển |

## 4. Nguồn tham khảo

RPC payload và parser được tham khảo từ:

- <https://github.com/xob0t/Google-Photos-Toolkit>
- License: MIT
- Attribution đã được thêm vào userscript.

Không copy toàn bộ Toolkit. Chỉ nhúng các RPC/parser tối thiểu mà script cần.

Google Photos dùng API web nội bộ không được công bố. Các index trong response có thể thay đổi bất cứ lúc nào.

## 5. Kiến trúc File Browser

File:

```text
google_photos_file_browser.user.js
```

Script là một IIFE duy nhất và không có build step.

### 5.1 State chính

Khai báo gần đầu file:

```js
const state = {
  open: false,
  busy: false,
  view: 'albums',
  viewMode: 'grid',
  generation: 0,
  currentAlbum: null,
  albums: [],
  albumsNextPageId: null,
  albumsFullyLoaded: false,
  items: [],
  filteredItems: [],
  selected: new Set(),
  nextPageId: null,
  query: '',
  metadata: new Map()
};
```

Ý nghĩa:

- `view`: `albums`, `album`, `library`, `favorites`, hoặc `trash`.
- `viewMode`: `grid` hoặc `list`.
- `generation`: dùng để bỏ qua metadata response thuộc navigation cũ.
- `albumsNextPageId`: pagination riêng cho album listing.
- `nextPageId`: pagination cho Library/Favorites/Trash/album contents.
- `metadata`: cache `mediaKey -> { filename, size }`.
- `selected`: tập media keys đang được chọn.

### 5.2 Luồng render

Các hàm chính:

- `buildUi()`: tạo launcher và workspace.
- `navigate(view, album)`: tải trang đầu và đổi location logic.
- `renderChrome()`: cập nhật sidebar, breadcrumb, toolbar, footer.
- `renderToolbar()`: tạo action buttons theo context.
- `renderContent()`: tạo Grid/List cards.
- `folderCard(album)`: card album.
- `fileCard(item)`: card media.
- `loadMore()`: tải trang tiếp theo.

DOM được tạo programmatically, không dùng `innerHTML`.

### 5.3 Theme

CSS được inject trong `injectStyle()`.

Token chính:

```css
--gpfb-blue
--gpfb-blue-soft
--gpfb-on-blue
--gpfb-glass
--gpfb-surface
--gpfb-outline
--gpfb-text
--gpfb-secondary
--gpfb-shadow
```

Dark mode được nhận diện bằng màu chữ của `document.body`, sau đó toggle class:

```text
body.gpfb-dark
```

Yêu cầu thiết kế:

- Chỉ xanh biển là màu nhấn.
- Không thêm gradient nhiều màu hoặc glow.
- Nền bán trong suốt và blur nhẹ.
- Hover chỉ đổi tint nhẹ.

## 6. RPC hiện đang dùng

`sendRpc(rpcid, data)` sử dụng `window.WIZ_global_data`.

Các RPC trong File Browser:

| RPC | Chức năng |
|---|---|
| `Z5xsfc` | Danh sách album |
| `EzkLib` | Library và Favorites |
| `snAcKc` | Nội dung album |
| `zy0IHe` | Trash |
| `EWgK9e` | Batch filename và file size |
| `VrseUb` | Direct/original download URL |
| `OXvT9d` | Tạo album |
| `E1Cajb` | Thêm media vào album |
| `ycV3Nd` | Xóa media khỏi album |
| `XwAOJf` | Move to Trash / Restore |
| `Ftfh0` | Favorite / Unfavorite |

### 6.1 Parser

Các parser:

- `parseMedia`
- `parseAlbum`
- `parseAlbumPage`
- `parseGenericPage`
- `parseTrashPage`
- `parseBatchMetadata`

Không thay index parser nếu chưa kiểm tra bằng fixture hoặc response thực tế.

### 6.2 Semantics của Move

Google Photos không có folder thật.

Move giữa album được thực hiện:

1. `E1Cajb`: thêm media vào album đích.
2. `ycV3Nd`: xóa media khỏi album nguồn.

File gốc vẫn ở Library.

Chỉ hiện nút Move khi `state.view === 'album'`.

### 6.3 Chunking

Operations được chia bằng:

```js
OPERATION_CHUNK_SIZE = 500
runInChunks(values, operation)
```

Metadata:

```js
META_CHUNK_SIZE = 50
```

Không tăng các giá trị này nếu chưa test rate limit.

## 7. Các cải tiến hiệu suất đã thực hiện trong 1.1.0

### 7.1 Album pagination

Trước đây mở Albums sẽ tải toàn bộ album rồi mới render.

Hiện tại:

- `getAlbumsPage()` chỉ tải một trang.
- `albumsNextPageId` lưu token.
- `Load more` tải trang tiếp.
- Chỉ `ensureAllAlbumsLoaded()` tải toàn bộ album khi người dùng mở Add/Move picker.

### 7.2 Metadata không chặn UI

Trước đây `navigate()` chờ `hydrateMetadata()` xong mới render.

Hiện tại:

1. Render media ngay từ page response.
2. Gọi `hydrateMetadata()` ở background.
3. `updateVisibleMetadata()` cập nhật filename/size trực tiếp trên card.

`generation` ngăn metadata từ view cũ ghi vào UI view mới.

### 7.3 Render và ảnh

- `img.loading = 'lazy'`
- `img.decoding = 'async'`
- List view dùng thumbnail `160x100`.
- Grid view dùng thumbnail `480x320`.
- Card dùng:

```css
content-visibility: auto;
contain-intrinsic-size: 240px;
```

## 8. Tính năng File Browser hiện có

### Navigation

- Albums
- Library
- Favorites
- Trash
- Album contents

### View

- Grid view
- List view
- Search trong location hiện tại
- Load more

### Selection

- Click card để select/unselect.
- `Ctrl/Cmd + A`.
- Nút `Select all` đổi thành `Deselect all` khi toàn bộ item đang hiển thị đã được chọn.

### File actions

- Open
- Copy direct download links
- Download
- Add to album
- Move giữa album
- Remove from album
- Favorite / Unfavorite
- Move to Trash
- Restore from Trash

### Folder actions

- Create album
- Open album

### Upload

`triggerNativeUpload()` tìm file input hoặc native Upload button của Google Photos.

Đây là heuristic DOM và có thể hỏng nếu Google đổi UI.

## 9. Bug đã sửa trong 1.1.0

### Dropdown trắng chữ trắng

Native `select` trong Add/Move dialog từng bị:

- nền trắng;
- chữ trắng ở dark mode;
- chỉ đọc được khi hover.

CSS hiện tại:

```css
.gpfb-dialog input,
.gpfb-dialog select {
  color: var(--gpfb-text);
  background: var(--gpfb-glass);
  color-scheme: light;
}

body.gpfb-dark .gpfb-dialog input,
body.gpfb-dark .gpfb-dialog select {
  color-scheme: dark;
}

.gpfb-dialog select option {
  color: #202124;
  background: #fff;
}

body.gpfb-dark .gpfb-dialog select option {
  color: #f1f3f4;
  background: #202124;
}
```

Phải test thực tế trên Chromium/Firefox vì native select rendering khác nhau.

## 10. Kiểm thử đã chạy

### Static checks

```powershell
node --check google_photos_album_downloader.user.js
node --check google_photos_album_adder_album_filename_on_hover.user.js
node --check google_photos_file_browser.user.js
git diff --check
```

Tất cả đã pass tại thời điểm handoff.

### Parser fixture tests

Fixture lấy từ clone tạm của Google Photos Toolkit:

```text
%TEMP%\google-photos-toolkit-source\tests\fixtures\parser
```

Đã test:

- `Z5xsfc`: 57 albums parse thành công.
- `EzkLib`: 100 library items parse thành công.
- `snAcKc`: album items parse thành công.
- `EWgK9e`: 16 metadata records parse thành công.
- `zy0IHe`: 17 trash items parse thành công.

Đã xác nhận payload `EWgK9e` khớp implementation Toolkit.

### Chưa có automated browser test

Chưa chạy Playwright/E2E với account Google Photos thật.

Các mutation RPC chưa được tự động test vì chúng thay đổi dữ liệu người dùng:

- Create album
- Add/Move/Remove
- Favorite
- Trash
- Restore
- Download

Phải test thủ công với album test và ảnh test.

## 11. Những điểm cần agent tiếp theo kiểm tra ngay

### P0: Manual smoke test trên Google Photos

Thứ tự khuyến nghị:

1. Cài riêng `google_photos_file_browser.user.js`.
2. Mở Albums.
3. Chuyển Grid/List.
4. Mở album.
5. Select một file, select all, deselect all.
6. Mở Add/Move picker ở cả light/dark mode.
7. Test Add vào album test.
8. Test Move giữa hai album test.
9. Test Remove from album.
10. Test Favorite/Unfavorite.
11. Trash một file test và Restore.
12. Test Copy links và Download.

### P0: Kiểm tra Restore payload

Implementation hiện tại:

```js
sendRpc('XwAOJf', [null, 3, dedupKeys, 2])
```

Payload này theo Google Photos Toolkit. Vẫn cần test thực tế.

### P1: Tối ưu `updateVisibleMetadata`

Hiện tại mỗi metadata item gọi:

```js
state.items.find(candidate => candidate.mediaKey === item.mediaKey)
```

Độ phức tạp có thể thành `O(metadata × items)`.

Nên thêm:

```js
state.itemByKey = new Map()
```

và rebuild map mỗi lần thay `state.items`.

### P1: Virtualization thật

`content-visibility: auto` giúp giảm paint/layout nhưng toàn bộ card DOM vẫn được tạo.

Nếu Library có hàng nghìn item sau nhiều lần Load more:

- triển khai windowed rendering;
- hoặc chỉ giữ số trang gần viewport;
- hoặc dùng IntersectionObserver append theo batch.

### P1: Search toàn thư viện

Search hiện chỉ lọc item đã load trong view hiện tại.

Filename chỉ searchable sau khi metadata batch trả về.

Không nên gọi đây là global search nếu chưa dùng `EzkLib` search RPC.

### P1: Album picker lớn

`ensureAllAlbumsLoaded()` tải tất cả album rồi dùng native `<select>`.

Với account có hàng nghìn album:

- dialog vẫn có thể chậm;
- native select khó tìm kiếm.

Nên thay bằng custom searchable album picker:

- input search;
- virtualized list;
- load page theo nhu cầu;
- tránh đợi tải toàn bộ trước khi mở dialog.

Đây là tối ưu quan trọng tiếp theo.

### P1: Navigation trong khi busy

`navigate()` hiện trả về ngay nếu `state.busy === true`.

Do đó người dùng không thể đổi location trong lúc request đầu đang chạy.

`generation` đã có nhưng chưa tận dụng hết vì busy lock chặn navigation.

Hướng cải tiến:

- tách `navigationBusy` và `mutationBusy`;
- cho phép navigation mới tăng generation;
- AbortController request cũ nếu phù hợp;
- mutation vẫn phải khóa để tránh double action.

### P2: Persist view mode

`viewMode` hiện reset về Grid sau reload.

Có thể lưu vào:

```js
localStorage
```

Không lưu dữ liệu nhạy cảm.

### P2: Sort controls

Hiện mặc định:

- album sort theo modified time giảm dần;
- media sort theo timestamp giảm dần.

Chưa có UI sort theo:

- name;
- date;
- size;
- item count.

### P2: Folder selection

Album cards hiện click là mở folder ngay, không có folder multi-select.

Nếu cần quản lý album như file manager thật:

- thêm single-click selection;
- double-click open;
- context actions cho album;
- rename/delete album chỉ sau khi xác định RPC đúng.

Không tự đoán RPC rename/delete.

## 12. Known constraints

1. Google Photos không có folder hierarchy thật.
2. Album không chứa album con.
3. Một media có thể thuộc nhiều album.
4. Remove from album không xóa file khỏi Library.
5. Trash tác động file gốc.
6. Shared album có thể có quyền hạn khác album cá nhân.
7. RPC có thể thay đổi mà không báo trước.
8. Direct download có thể bị browser chặn multiple downloads.
9. Native Upload trigger phụ thuộc DOM hiện tại của Google Photos.

## 13. Coding conventions

- Không dùng `innerHTML` cho UI.
- Dùng DOM APIs và `textContent`.
- Không thêm dependency ngoài.
- Giữ script single-file.
- Mọi mutation nguy hiểm phải có confirmation dialog.
- Không dùng đỏ/xanh lá làm accent chính; dùng Google Photos Blue.
- Không thêm gradient màu mè.
- Light/dark mode phải cùng độ trong suốt và blur.
- Tăng userscript version khi thay đổi hành vi.
- Giữ attribution MIT cho xob0t.

## 14. Cách tiếp tục an toàn

Trước khi sửa:

```powershell
git status --short
node --check google_photos_file_browser.user.js
```

Sau khi sửa:

```powershell
node --check google_photos_file_browser.user.js
git diff --check
git diff -- google_photos_file_browser.user.js README.file-browser.md
```

Nếu thay parser:

1. So sánh với source Google Photos Toolkit.
2. Test bằng fixture.
3. Test response thực tế.
4. Không thay mutation payload chỉ dựa trên phỏng đoán.

## 15. Definition of done cho vòng tiếp theo

Một vòng phát triển nên được coi là hoàn tất khi:

- Script vẫn chạy độc lập.
- Syntax check pass.
- Không có control character ẩn.
- Grid và List đều render đúng.
- Light/dark dropdown đọc được.
- Select/Deselect all phản ánh đúng state.
- Trash và Restore hoạt động với file test.
- Add/Move không làm mất file khỏi Library.
- Không có request metadata thừa khi đổi view.
- README và version được cập nhật.

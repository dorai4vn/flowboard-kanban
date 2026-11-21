# Báo cáo kiểm thử — FlowBoard MVP

- Ngày chạy: 2026-11-21
- Nhánh: `claude/flowboard-mvp`
- Môi trường: Linux (Claude Code cloud session), Node v22.23.5, Chromium của Playwright 1.63.0
- Kết quả cuối cùng: **`npm run check` PASS** (lint + typecheck + 87/87 unit/component test + build) và
  **E2E 11/11 PASS** (desktop + mobile).

Mọi con số dưới đây là kết quả thật của lần chạy cuối, không phải ước lượng.

## 1. Unit test và component test (Vitest + Testing Library)

Lệnh: `npm run check` → `Test Files 12 passed (12)`, `Tests 87 passed (87)`, thời gian khoảng 4,4 giây.

| File | Số test | Nội dung chính |
|---|---:|---|
| `src/domain/task.test.ts` | 16 | Tạo/sửa/xóa/di chuyển công việc; tiêu đề rỗng/khoảng trắng/>200 ký tự; mô tả >2000; `completedAt` khi vào/ra cột Hoàn thành; kẹp chỉ số; id lạ; không mutate dữ liệu |
| `src/domain/filters.test.ts` | 15 | Tìm kiếm không dấu; lọc ưu tiên, nhãn, hạn chót (quá hạn, hôm nay, 7 ngày, không hạn); chế độ Hôm nay; tóm tắt; `toFullIndex` khi kéo thả lúc đang lọc |
| `src/store/storage.test.ts` | 9 | Dữ liệu mẫu lần đầu; lưu/đọc; JSON hỏng hoặc sai schema thì backup + tạo mới (chỉ một lần); cột tham chiếu task không tồn tại; storage bị chặn; lỗi quota |
| `src/store/useBoardStore.test.ts` | 8 | Lưu bền qua các store; lỗi validate; tạo/đổi tên/đổi màu/xóa bảng; xóa bảng cuối; thêm nhãn; thông báo |
| `src/components/TaskDialog.test.tsx` | 8 | Tạo công việc có ưu tiên/hạn/nhãn; tạo theo cột; lỗi tiêu đề rỗng; tạo nhãn mới; sửa; Esc/Hủy; xóa có xác nhận; mở thẻ bằng Enter |
| `src/components/BoardView.test.tsx` | 7 | 3 cột; đánh dấu quá hạn/hôm nay; đổi màu nhấn; tạo bảng; lỗi tên bảng; đổi tên + xóa bảng; thông báo dữ liệu hỏng |
| `src/components/FilterBar.test.tsx` | 7 | Tìm kiếm; phím tắt `/`; lọc + xóa lọc; chế độ Hôm nay + tóm tắt; menu “Chuyển sang…”; tab cột mobile |
| `src/components/ReviewFixes.test.tsx` | 5 | Test hồi quy cho các lỗi tìm thấy khi review (xem `review-report.md`) |
| `src/domain/board.test.ts` | 6 | Tạo bảng với nhãn mặc định; tên rỗng/quá dài; đổi tên; đổi màu; thêm/xóa nhãn |
| `src/domain/dates.test.ts` | 4 | Ngày theo giờ địa phương lúc 23:59; cộng ngày qua cuối tháng/năm; so sánh; định dạng `dd/MM` |
| `src/domain/text.test.ts` | 1 | Bỏ dấu tiếng Việt, `đ → d` |
| `src/App.test.tsx` | 1 | App hiển thị tiêu đề FlowBoard |

## 2. E2E (Playwright)

Lệnh: `npm run test:e2e` (tự build và chạy `vite preview`) → **11 passed (5,6 giây)**. Đã chạy lặp nhiều lần, không có test chập chờn (flaky).

| # | Project | Luồng | Kết quả |
|---|---|---|---|
| 1 | desktop | Tạo → sửa → **kéo chuột** sang Hoàn thành → tải lại trang vẫn còn | ✓ |
| 2 | desktop | Kéo đổi thứ tự trong cùng cột | ✓ |
| 3 | desktop | **Kéo bằng bàn phím** (Space, →, Space) sang Đang làm | ✓ |
| 4 | desktop | Tìm “bao cao” (không dấu), lọc ưu tiên Thấp, xóa bộ lọc | ✓ |
| 5 | desktop | Chế độ Hôm nay: tóm tắt “2 việc cần làm · 1 quá hạn · 1 đã xong”, ẩn việc không đến hạn | ✓ |
| 6 | desktop | Tạo bảng “Đồ án”, đổi màu Hồng, tải lại vẫn giữ; bảng cũ vẫn màu Indigo | ✓ |
| 7 | desktop | Xóa công việc có xác nhận, tải lại vẫn mất | ✓ |
| 8 | desktop | Dữ liệu localStorage hỏng: hiện cảnh báo, app vẫn mở, có đúng 1 bản backup | ✓ |
| 9 | mobile (Pixel 7) | Tab cột chỉ hiện một cột mỗi lần | ✓ |
| 10 | mobile (Pixel 7) | Đổi cột bằng menu “Chuyển sang…” | ✓ |
| 11 | mobile (Pixel 7) | Không có cuộn ngang; hộp thoại nằm trọn màn hình | ✓ |

## 3. Lỗi phát hiện nhờ kiểm thử trong quá trình làm

| Lỗi | Phát hiện bởi | Xử lý |
|---|---|---|
| Selector Zustand trả mảng mới mỗi lần nên React render vô hạn | Component test (Task 6) | Chọn các giá trị ổn định rồi mới ghép mảng |
| Nhấn Enter để mở thẻ làm form trong hộp thoại tự submit | Component test (Task 7) | `preventDefault()` trên keydown |
| ←/→ khi kéo bằng bàn phím chỉ đổi thứ tự trong cùng cột | E2E (Task 9) | Viết `columnKeyboardCoordinates` để nhảy sang cột bên cạnh |
| Hai vùng `role="status"` (Toast và live region của dnd-kit) | Component test (Task 8) | Toast dùng `role="alert"` |
| 5 lỗi từ review cuối | Reviewer, sau đó có test tái hiện | Xem `review-report.md` |

## 4. Kiểm tra trực quan

Ảnh chụp màn hình (deviceScaleFactor 2) trong `docs/screenshots/`:
`desktop-board.png`, `desktop-today.png`, `desktop-dialog.png`, `desktop-filter.png`, `desktop-accent.png`,
`mobile-board.png`, `mobile-dialog.png`, `mobile-new-board.png`.

## 5. Chưa kiểm thử / giới hạn

- **Chưa chạy E2E trên URL Vercel thật**, vì repo chưa được kết nối với Vercel. Sau khi deploy, chạy
  `BASE_URL=<url> npm run test:e2e`.
- E2E chỉ chạy trên Chromium. Chưa chạy Firefox/Safari.
- Kéo thả bằng cảm ứng thật (nhấn giữ 200ms) chưa thử trên điện thoại thật. Trên mobile, E2E kiểm tra đường đổi cột bằng menu.

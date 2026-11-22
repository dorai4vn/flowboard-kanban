# Báo cáo review — FlowBoard Buổi 9

- Ngày: 2026-11-22 · Phạm vi: `main (8209732)..claude/m9-supabase`
- Người review: subagent reviewer mới (context độc lập), gộp **code review + security review**, đối chiếu Spec,
  Plan (*Review Focus*), các *Ruling* trong ledger; đã chạy vitest, tsc, pgTAP, integration và một probe SQL
  (trong transaction rollback) trên Supabase Local.
- Kết luận reviewer: **không có Critical; không thấy lỗ hổng cô lập user, RLS hay rò rỉ secret** — “With fixes”.

## Điểm reviewer xác nhận tốt

- Cô lập phiên: `switchUser` tăng epoch/generation, abort, reset hàng đợi và state trong cùng tick; mọi `await` có kiểm tra stale; AuthGate không để `getUser` cũ ghi đè sự kiện auth mới; an toàn với StrictMode.
- Hàng đợi tuần tự: tạo rồi kéo ngay trước khi tạo xong vẫn đúng thứ tự; tạo lỗi thì lệnh kéo sau bị hủy.
- DB: RLS + force; ACL anon/public trống, `authenticated` chỉ `SELECT/INSERT/UPDATE/DELETE` + `EXECUTE` 3 RPC; khóa ngoại kép; RPC `security invoker` + `search_path=''`.
- Secrets: chỉ publishable key ở frontend; key local chỉ đọc lúc chạy test; `.env*` bị ignore; `signOut({scope:'local'})` xóa phiên local trước khi gọi mạng.

## Phát hiện và xử lý

Mỗi lỗi được sửa theo TDD (test tái hiện FAIL → sửa → PASS → chạy lại toàn bộ suite).

| # | Mức (reviewer → chốt) | Phát hiện | Test hồi quy | Xử lý |
|---|---|---|---|---|
| 1 | Important | Xóa bảng cuối: `deleteBoard` lưu được nhưng `createBoard` thay thế lỗi → 0 bảng, màn hình trắng không thoát được | `deleting the last board when its replacement fails…` | Sau hoàn tác, store **đồng bộ lại** với server; server rỗng → trạng thái lỗi có nút “Thử lại” (tạo lại bảng mẫu) |
| 2 | Minor → **Important** | Ghi đã commit nhưng mất phản hồi → UI hoàn tác sai, lệch server tới khi tải lại | `after a rollback the store re-syncs…`, `the re-sync does not overwrite a change made while it was loading` | Đồng bộ lại sau hoàn tác, không ghi đè thay đổi mới của người dùng |
| 3 | Minor → **Important** | Không timeout: một request treo khóa cả hàng đợi, “Đang lưu…” mãi | `withTimeout` (3 test) | Timeout 15s cho mọi request, vẫn hủy ngay khi đăng xuất/đổi user |
| 4 | Minor | `move_task` với `p_ordered_ids = NULL` bỏ qua kiểm tra | pgTAP `move_task rejects a NULL order` | Từ chối NULL (`22023`) |
| 5 | Minor | Gắn được nhãn của bảng khác (cùng user) vào task | pgTAP 3 test | `save_task`/`create_board` kiểm tra nhãn thuộc đúng bảng |
| 6 | Minor | `completed_at` không ràng buộc với cột | pgTAP 2 test | CHECK `(status = 'done') = (completed_at is not null)` |
| 7 | Minor | Đổi code OAuth lỗi → về đăng nhập không có thông báo | `a failed OAuth code exchange…` | Hiện “Không đăng nhập được, vui lòng thử lại.” |
| 8 | Minor | E2E không từ chối `BASE_URL` ngoài máy | `playwright test --list` với URL Vercel → bị từ chối | Chặn hostname khác `localhost`/`127.0.0.1` |

Lý do nâng mức #2, #3: đánh giá theo tác động thật — mạng chập chờn là tình huống thường gặp; người dùng sẽ thấy
dữ liệu sai hoặc app “đứng” ở trạng thái đang lưu.

Sau khi sửa: `npm run check` 118/118 · pgTAP 58/58 · integration 8/8 · E2E 16/16 · `check:secrets` OK.

## Hoãn lại (Minor)

- Không giới hạn kích thước payload `create_board`/`save_task` (chỉ ảnh hưởng quota của chính user).

## Reviewer không đánh giá

Đồng bộ nhiều tab (ngoài phạm vi); Google redirect thật (không có tài khoản Google trong phiên cloud);
giao diện thật trên trình duyệt (đã có 16 E2E + ảnh chụp `docs/screenshots/m9-*.png`).

## Các quyết định (Ruling) trong quá trình triển khai

| Quyết định | Lý do | Rủi ro nếu sai |
|---|---|---|
| Không trigger `updated_at`; RPC tự đặt | Chỉ ghi qua RPC hoặc bảng `boards` (không có cột này) | Thấp |
| Nhãn sắp theo `created_at = clock_timestamp()` | Đơn giản hơn cột position | Thứ tự có thể trùng nếu cùng micro giây |
| Không validate dòng DB bằng zod | Dữ liệu từ bảng có kiểu + CHECK | Thấp |
| Chuyển test component sớm (Task 4 thay vì 8) | Giữ suite xanh ở mỗi commit | Không |
| Ghi nhớ bảng đang mở theo user trong localStorage | Giữ hành vi Buổi 8 khi tải lại | Chỉ lộ id bảng trên máy đó |
| Sửa migration init (3 lần) thay vì thêm migration | Migration chưa từng được áp ngoài Supabase Local | Không |
| `signOut({ scope: 'local' })` | “Đăng xuất” trên một thiết bị | Thiết bị khác vẫn đăng nhập |
| Hoãn callback `onAuthStateChange` bằng `setTimeout` | Khuyến nghị của Supabase tránh deadlock | Không |
| Thiếu env → màn hình “Thiếu cấu hình Supabase.” | Không crash trắng trang | Không |
| Khóa cả nút “Tùy chỉnh bảng” khi offline | Nhất quán chế độ chỉ đọc | Không |
| Thêm “Đang lưu…” + cảnh báo rời trang | Tải lại khi đang ghi sẽ mất thay đổi | Không |
| E2E nạp phiên Supabase Local thay vì qua Google | Không tự động hóa được Google | Luồng Google thật cần kiểm thủ công |

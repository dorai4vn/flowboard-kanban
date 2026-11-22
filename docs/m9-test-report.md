# Báo cáo kiểm thử — FlowBoard Buổi 9 (Supabase + Google Login)

- Ngày chạy: 2026-11-22 · Nhánh `claude/m9-supabase`
- Môi trường: Claude Code cloud (Linux), Node v22, Docker + **Supabase Local** (CLI 2.122.1, Postgres 17),
  Chromium của Playwright 1.63.0. Không dùng Supabase hosted nào, không dùng database của ContentPilot AI.
- Mọi số liệu là kết quả thật của lần chạy cuối (sau khi sửa lỗi review).

## Tổng hợp

| Tầng | Lệnh | Kết quả |
|---|---|---|
| Lint + typecheck + unit/component + build | `npm run check` | **PASS — 118/118** (17 file) |
| DB / RLS / RPC (pgTAP) | `npm run test:db` | **PASS — 58/58** (4 file) |
| Integration (supabase-js thật, 2 user local) | `npm run test:integration` | **PASS — 8/8** |
| E2E (Playwright, desktop + mobile, Supabase Local) | `npm run test:e2e` | **PASS — 16/16** (chạy 3 lần, không flaky) |
| Quét secret (file đã track + `dist/`) | `npm run check:secrets` | **PASS** — đã chứng minh bắt được secret key và service_role JWT thật của local khi cố ý đặt vào `dist/` |
| Kiểm thử thủ công 2 tài khoản Google thật | checklist trong `docs/m9-setup-guide.md` | **CHƯA CHẠY** — cần chủ dự án (xem mục 6) |

## 1. DB / RLS (pgTAP — `supabase/tests/`)

| File | Số test | Nội dung |
|---|---:|---|
| `rls.test.sql` | 31 | 2 user A/B + anon × 4 bảng: B không đọc/sửa/xóa được dữ liệu A (0 dòng); B không gắn task/nhãn/task_label vào bảng của A (khóa ngoại kép `23503`); B không chèn dòng mang `user_id` của A (`42501`); A không “tặng” task cho B; anon không đọc/ghi/gọi RPC (`42501`); CHECK tiêu đề rỗng, ưu tiên/cột lạ |
| `rpc.test.sql` | 19 | `create_board` tạo bảng mẫu đúng **một lần** (gọi 2 lần → 1 bảng); `save_task` thêm/sửa/thay nhãn, sửa task đã bị xóa thì lỗi (không tạo lại); `move_task` sắp xếp nguyên tử, từ chối id cột khác; B không sửa/di chuyển task của A qua RPC |
| `review_fixes.test.sql` | 7 | Hồi quy cho review: `move_task` với thứ tự NULL; nhãn của bảng khác (save_task, create_board); `completed_at` phải khớp cột Hoàn thành |
| `00_setup.sql` | 1 | pgTAP sẵn sàng |

## 2. Integration (`tests/integration/supabaseRepository.test.ts`)

Hai user email/password tạo trên **Supabase Local** (email auth chỉ bật ở local), đăng nhập bằng publishable key.
Kiểm tra: tài khoản mới rỗng + bảng mẫu một lần; create → update → move → delete rồi load lại khớp state lạc quan;
đổi tên/màu/nhãn/bảng mới/xóa bảng; sửa task đã bị xóa → lỗi; **B không thấy gì của A và 8 kiểu ghi của B lên dữ liệu A đều lỗi, dữ liệu A giữ nguyên**;
request bị hủy → `RepositoryError`; client anon không đọc được.

## 3. Unit / component (Vitest)

| File | Số test | Trọng tâm |
|---|---:|---|
| `src/store/useBoardStore.test.ts` | 19 | Tải theo user, bảng mẫu, lỗi tải + Thử lại; **đổi user giữa chừng: dữ liệu cũ xóa ngay, kết quả muộn bị bỏ, request bị abort**; đăng xuất hủy ghi đang chờ; ghi lỗi sau khi đổi user không hoàn tác vào phiên mới; **3 lần kéo liên tiếp khi mạng chậm → ghi tuần tự đúng thứ tự (tối đa 1 request cùng lúc)**; lỗi giữa hàng đợi → về state đã xác nhận + hủy lệnh sau; đồng bộ lại sau hoàn tác; xóa bảng cuối lỗi giữa chừng → lỗi có thể khôi phục; offline chặn mọi ghi |
| `src/auth/AuthGate.test.tsx` | 9 | Kiểm tra phiên, nút Google, lỗi chuyển hướng, lỗi đổi code OAuth, hiển thị tài khoản, **đổi tài khoản xóa dữ liệu trước khi dữ liệu mới về**, đăng xuất, làm mới token không tải lại, lỗi tải |
| `src/data/*.test.ts` | 16 | `applyMutation`, `planMove`, mapper dòng DB ↔ domain (round-trip), timeout 15s |
| `src/components/Offline.test.tsx`, `SaveIndicator.test.tsx` | 4 | Banner chỉ đọc, nút bị khóa, “Đang lưu…”, cảnh báo khi rời trang lúc đang lưu |
| Test Buổi 8 (domain + component) | 70 | Giữ nguyên hành vi: CRUD, lọc, Hôm nay, bảng + màu, dialog, a11y |

Các bảo vệ quan trọng của store đã được kiểm chứng bằng **mutation testing**: gỡ từng cơ chế (kiểm tra stale, hủy hàng đợi, abort, chặn offline…) thì có test fail.

## 4. E2E (Playwright, `tests/e2e/`)

Mỗi test dùng một tài khoản **mới** trên Supabase Local; phiên được nạp vào trình duyệt (màn hình Google không tự động hóa được).

| # | Luồng | Kết quả |
|---|---|---|
| 1 | Chưa đăng nhập → màn hình Google; bấm nút gửi request `/auth/v1/authorize?provider=google` với `redirect_to` đúng và PKCE `s256` | ✓ |
| 2 | Dữ liệu nằm trên Supabase: trình duyệt thứ hai của cùng user thấy công việc vừa tạo | ✓ |
| 3 | Đăng xuất xóa bảng + phiên; tài khoản khác đăng nhập trên cùng trình duyệt **không thấy** dữ liệu của tài khoản trước | ✓ |
| 4 | Mạng chậm (700ms/request): 3 lần chuyển cột liên tiếp, “Đang lưu…”, tải lại đúng thứ tự | ✓ |
| 5 | Server trả 500 → thẻ quay lại chỗ cũ + “Không lưu được thay đổi, đã hoàn tác.”, tải lại vẫn đúng | ✓ |
| 6 | Offline → banner, nút thêm bị khóa; online lại → sửa và lưu được | ✓ |
| 7–13 | 7 luồng Buổi 8 (tạo/sửa/kéo chuột/tải lại; đổi thứ tự; kéo bàn phím; tìm/lọc; Hôm nay; bảng mới + màu sau tải lại; xóa có xác nhận) | ✓ |
| 14–16 | Mobile Pixel 7: tab cột, menu “Chuyển sang…”, không cuộn ngang | ✓ |

## 5. Bảo mật đã kiểm

- Frontend chỉ có URL + publishable key; `service_role`/secret key/Google secret không có trong `src/`, Git, `dist/`, log.
- RLS bật + `force` trên 4 bảng; anon bị thu hồi quyền bảng và RPC (reviewer đối chiếu ACL trong `pg_class`/`pg_proc`).
- RPC `security invoker` + `search_path = ''`, không SQL động.
- Integration/E2E từ chối chạy nếu URL không phải local.

## 6. Chưa kiểm thử / giới hạn

- **Google OAuth thật và checklist 2 tài khoản Google**: cần project Supabase + OAuth client của chủ dự án
  (`docs/m9-setup-guide.md` mục 7). Luồng đổi code PKCE thật với Google chưa chạy trong phiên cloud.
- Chưa deploy (đúng yêu cầu Buổi 9); production Vercel vẫn là bản Buổi 8.
- Đồng bộ nhiều tab/realtime nằm ngoài phạm vi.

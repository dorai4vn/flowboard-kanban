# Báo cáo kiểm thử — FlowBoard Buổi 9 (Supabase + Google Login)

- Ngày chạy: 2026-11-22 · Nhánh `claude/m9-supabase`
- Môi trường: Claude Code cloud (Linux), Node v22, Docker + **Supabase Local** (CLI 2.122.1, Postgres 17),
  Chromium của Playwright 1.63.0. Không dùng Supabase hosted nào, không dùng database của ContentPilot AI.
- Mọi số liệu là kết quả thật của lần chạy cuối (sau khi sửa lỗi review).

## Tổng hợp

| Tầng | Lệnh | Kết quả |
|---|---|---|
| Lint + typecheck + unit/component + build | `npm run check` | **PASS — 123/123** (19 file) |
| DB / RLS / RPC (pgTAP) | `npm run test:db` | **PASS — 58/58** (4 file) |
| Integration (supabase-js thật, 2 user local) | `npm run test:integration` | **PASS — 8/8** |
| E2E (Playwright, desktop + mobile, Supabase Local) | `npm run test:e2e` | **PASS — 16/16** (2 lượt cuối; xem mục 8 về test từng chập chờn) |
| Quét secret (file đã track + `dist/`) | `npm run check:secrets` | **PASS** — đã chứng minh bắt được secret key và service_role JWT thật của local khi cố ý đặt vào `dist/` |
| Kiểm thử thủ công 2 tài khoản Google thật (Vercel Preview + Supabase Cloud) | do chủ dự án thực hiện | **6 mục chủ dự án xác nhận PASS; các bước khác chưa có kết quả** (mục 6) |

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

## 6. Nghiệm thu thủ công (chủ dự án, Vercel Preview + Supabase Cloud + Google OAuth thật)

Kết quả do chủ dự án báo lại; Claude không truy cập được Vercel/Supabase Cloud nên chỉ ghi nhận, không tự kiểm.

| # | Bước | Kết quả |
|---|---|---|
| M1 | Tài khoản Google A đăng nhập | **PASS** |
| M2 | Tài khoản Google B đăng nhập | **PASS** |
| M3 | A tạo bảng và công việc | **PASS** |
| M4 | B không nhìn thấy dữ liệu của A | **PASS** |
| M5 | B tạo dữ liệu riêng | **PASS** |
| M6 | A đăng nhập lại không thấy dữ liệu của B | **PASS** |

Các bước trong checklist `docs/m9-setup-guide.md` §7 **chưa được báo kết quả** (không đánh dấu PASS):
màn hình đăng nhập khi chưa đăng nhập (#1); URL không còn `?code=` và bảng mẫu xuất hiện (#2, phần chi tiết);
tải lại 2 lần vẫn đúng một bảng mẫu (#3); kéo thả, đổi màu, dữ liệu còn sau khi tải lại (#4, phần còn lại);
kiểm tra `user_id` trong Table Editor (#6); đăng xuất xóa bảng ngay (#7); đổi tài khoản trên cùng trình duyệt (#8);
offline chỉ đọc (#9); hủy đăng nhập ở trang Google (#10); dữ liệu localStorage Buổi 8 còn nguyên (#11).
Các hành vi này đã có kiểm thử tự động trên Supabase Local (mục 3–4) nhưng chưa được xác nhận trên Cloud.

## 7. Chưa kiểm thử / giới hạn

- Các bước thủ công liệt kê ở mục 6 chưa có kết quả trên môi trường Cloud.
- **Production chưa được kiểm**: biến môi trường Production trên Vercel, Site URL/Redirect URLs của Supabase cho
  domain Production và trạng thái OAuth consent của Google chưa được xác nhận (Claude không có quyền xem).
- Chưa deploy Production (chờ phê duyệt); production Vercel vẫn là bản Buổi 8 từ `main`.
- Đồng bộ nhiều tab/realtime nằm ngoài phạm vi.

## 8. Lần chạy kiểm thử cuối (trước khi mở PR)

- Môi trường: `npm ci` sạch, Supabase Local reset từ migration.
- `npm run check` 123/123 · `npm run test:db` 58/58 · `npm run test:integration` 8/8 ·
  `npm run test:e2e` 16/16 (hai lượt liên tiếp) · `check:secrets` OK · `npm audit` 0 lỗ hổng.
- Test E2E “kéo bằng bàn phím” từng chập chờn (3/12 lượt lỗi). Nguyên nhân gốc (đã đo bằng log tạm):
  `KeyboardSensor` của dnd-kit gắn bộ nghe phím trong `setTimeout(0)` sau khi nhấc thẻ, Chromium xử lý phím
  trước timer nên phím → tới quá sớm. Đây là lỗi đồng bộ của test, không phải của app. Test giờ chờ hết timer đó;
  chạy lặp 25/25 PASS.

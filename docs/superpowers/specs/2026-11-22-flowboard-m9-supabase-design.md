# FlowBoard Buổi 9 — Supabase + Google Login (Design Spec)

- Ngày: 2026-11-22 · Trạng thái: **Đã duyệt** (người dùng chốt 8 quyết định + yêu cầu bổ sung ngày 2026-11-22)
- Nhánh: `claude/m9-supabase` (không merge `main`, không deploy Vercel Production)
- Nền: Spec Buổi 8 `2026-11-21-flowboard-design.md` — mọi tính năng/giao diện Buổi 8 giữ nguyên.

## 1. Mục đích

Chuyển nguồn dữ liệu chính của FlowBoard từ localStorage sang **Supabase PostgreSQL**, đăng nhập bằng
**Google OAuth (Supabase Auth)**, mỗi tài khoản chỉ thấy và sửa được dữ liệu của chính mình (RLS).

## 2. Quyết định đã chốt

| # | Quyết định |
|---|---|
| 1 | Supabase project riêng `flowboard-kanban` (Free, Singapore). Không dùng DB của ContentPilot AI |
| 2 | Google OAuth bắt buộc; người dùng tự tạo OAuth client và nhập secret trong Dashboard |
| 3 | Không chuyển dữ liệu localStorage cũ lên cloud; không xóa nó. User mới nhận bảng mẫu |
| 4 | Bắt buộc đăng nhập; không có guest mode |
| 5 | Offline = chỉ đọc + banner + chặn sửa |
| 6 | Email/password chỉ bật trong Supabase **Local** (`supabase/config.toml`) cho test tự động; app không có UI email |
| 7 | Làm trên `claude/m9-supabase`; không merge, không deploy |
| 8 | Phát triển và test bằng Docker + Supabase Local |

## 3. Mục tiêu / Ngoài phạm vi / Chống mục tiêu

**Mục tiêu**: đăng nhập Google; dữ liệu lưu Postgres; RLS + khóa ngoại kép; giữ CRUD, kéo thả, tìm kiếm,
lọc, Hôm nay, nhiều bảng + màu nhấn, responsive; trạng thái đang tải/lỗi/offline; cập nhật lạc quan có
hoàn tác; cô lập dữ liệu khi đổi tài khoản.

**Ngoài phạm vi**: realtime/đồng bộ nhiều tab, hàng đợi offline, nhập dữ liệu cũ, xóa tài khoản,
chia sẻ bảng, deploy backend.

**Chống mục tiêu**: user A thấy/sửa được dữ liệu B dù chỉ một lần; `service_role` hoặc Google Client Secret
xuất hiện trong frontend/Git/log; dữ liệu user cũ còn hiển thị sau khi đổi tài khoản; mất thay đổi mà
không báo; production Buổi 8 bị ảnh hưởng.

## 4. Kiến trúc

```
React UI (giữ nguyên) ─► Zustand store ─► domain/* (hàm thuần, giữ nguyên)
                              │ mutation (mô tả thay đổi cụ thể)
                              ▼
                     BoardRepository ── SupabaseRepository (supabase-js, publishable key)
                                    └── FakeRepository (chỉ trong unit test)
AuthGate ─ supabase.auth (PKCE, onAuthStateChange) ─► store.switchUser(userId | null)
```

- **Mutation**: mỗi hành động tạo một mô tả cụ thể đã tính sẵn (vd. `{type:'moveTask', id, to, orderedIds, completedAt, updatedAt}`).
  Hàm thuần `applyMutation(state, m)` dùng cho cả state hiển thị (lạc quan) lẫn state **đã xác nhận**.
- **Hàng đợi ghi** tuần tự: mutation được áp vào UI ngay, đẩy vào hàng đợi; ghi thành công → áp vào
  state đã xác nhận; ghi lỗi → UI về state đã xác nhận, **hủy mọi mutation còn chờ**, thông báo
  “Không lưu được thay đổi, đã hoàn tác.”
- **Phiên (epoch)**: store giữ `userId` + `epoch`. `switchUser` (đăng xuất, đổi tài khoản, hết hạn) →
  tăng `epoch`, `AbortController.abort()` mọi request, xóa hàng đợi, xóa sạch dữ liệu trong store
  **ngay lập tức**. Mọi kết quả async kiểm tra `epoch` trước khi ghi vào store; khác `epoch` → bỏ qua.
- **Offline**: `navigator.onLine` + sự kiện `online/offline`. Offline → banner
  “Mất kết nối – đang ở chế độ chỉ đọc”, mọi action ghi trả lỗi, tắt kéo thả và nút thêm.

## 5. Auth flow

1. `LoginScreen` → `signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })`.
2. Google → `https://<ref>.supabase.co/auth/v1/callback` → app `?code=…`; supabase-js (`flowType: 'pkce'`,
   `detectSessionInUrl: true`) đổi code lấy session và xóa `code` khỏi URL.
3. `onAuthStateChange`: user khác user hiện tại → `switchUser`. `SIGNED_OUT` → `switchUser(null)` → màn hình đăng nhập.
4. Client `storageKey: 'flowboard-auth'`. Allowlist redirect: `http://localhost:5173` (+ production URL sau này).
5. Header hiển thị avatar/tên từ `user_metadata`, nút **Đăng xuất**.

## 6. Database

Bảng `boards`, `labels`, `tasks`, `task_labels`; mỗi bảng có `user_id default auth.uid()`; `unique (id, user_id)`
ở bảng cha và **khóa ngoại kép** `(parent_id, user_id)` ở bảng con. Ràng buộc CHECK lặp lại luật domain
(độ dài, enum ưu tiên/cột/màu). RLS bật + `force`; một policy `for all to authenticated using/with check
(user_id = (select auth.uid()))`; `revoke all from anon, public`.

RPC (`security invoker`, `set search_path = ''`, chỉ `authenticated` được execute):
- `create_board(p_board jsonb, p_labels jsonb, p_tasks jsonb, p_only_if_empty boolean) returns boolean` —
  tạo bảng + nhãn + công việc trong một transaction; `p_only_if_empty` + advisory lock theo user để tạo
  bảng mẫu đúng một lần.
- `save_task(p_task jsonb, p_label_ids uuid[])` — upsert công việc + thay nhãn trong một transaction.
- `move_task(p_task_id uuid, p_status text, p_ordered_ids uuid[], p_completed_at timestamptz)` — đổi cột và
  thứ tự toàn cột đích; lỗi nếu có id không thuộc cùng bảng/user.

## 7. Bảo mật

- Frontend chỉ có `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` (công khai theo thiết kế).
  Không `service_role`/secret key trong `src/`, Git hay log. `.env*` bị ignore, chỉ commit `.env.example`.
- Key bí mật của Supabase Local chỉ được test đọc lúc chạy từ `supabase status`, không ghi ra file/log.
- Lỗi DB không hiển thị nguyên văn; UI dùng thông báo chung tiếng Việt.
- Kiểm tra tự động: grep chặn `service_role`/`sb_secret_` trong `src/` và `dist/`.

## 8. Kiểm thử

| Tầng | Lệnh | Nội dung |
|---|---|---|
| Unit/component | `npm test` | domain (giữ nguyên), mapper, applyMutation, store: hàng đợi, kéo thả liên tiếp, lỗi + hoàn tác, mạng chậm, đổi user khi request đang chờ, offline; AuthGate |
| DB/RLS (pgTAP) | `npm run test:db` | anon/A/B × select/insert/update/delete × 4 bảng; khóa ngoại kép; RPC không tác động dữ liệu người khác |
| Integration | `npm run test:integration` | SupabaseRepository thật với 2 user local: CRUD, move, cô lập chéo |
| E2E | `npm run test:e2e` | 11 luồng Buổi 8 + đăng xuất/đổi tài khoản + mạng chậm + lưu lỗi → hoàn tác |
| Thủ công | người dùng | 2 tài khoản Google thật trên `localhost:5173` (checklist trong báo cáo) |

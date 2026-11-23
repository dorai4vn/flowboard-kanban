# Buổi 11 — Hướng dẫn cấu hình Trợ lý AI (Vercel Preview)

Trợ lý AI chạy hoàn toàn phía server trong hai Vercel Function: `api/agent/chat.ts` và `api/agent/approval.ts`.
Trình duyệt chỉ gửi access token Supabase của người dùng; khóa OpenAI không bao giờ rời server.

## 1. Biến môi trường trên Vercel (chỉ môi trường **Preview**)

Vercel Dashboard → Project `flowboard-kanban` → Settings → Environment Variables → chọn **chỉ Preview**
(bỏ chọn Production và Development).

| Biến | Bắt buộc | Ghi chú |
|---|---|---|
| `OPENAI_API_KEY` | Có | Khóa OpenAI của bạn. **Không** đặt tiền tố `VITE_`. |
| `AGENT_STATE_SECRET` | Có | Chuỗi ngẫu nhiên ≥ 32 ký tự (ví dụ `openssl rand -base64 48`). Dùng để ký HMAC trạng thái chờ duyệt xóa (gắn với user + thao tác + mục bị xóa). Thiếu hoặc ngắn hơn 32 ký tự thì trên Vercel Trợ lý AI trả 503 “chưa được cấu hình”. |
| `OPENAI_MODEL` | Không | Mặc định `gpt-5.4-mini`. |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Đã có từ Buổi 9 | Server dùng lại hai biến này (hoặc `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` nếu bạn muốn tách riêng). Chỉ là khóa công khai; **không** dùng service-role/secret key. |

Sau khi lưu biến: Deployments → bản Preview mới nhất của nhánh `claude/m11-ai-agent` → **Redeploy**
(biến môi trường chỉ áp dụng cho bản build mới).

Không thay đổi biến của Production. Production vẫn chạy `main` và không có code Trợ lý AI.

## 1b. Supabase Auth — cho phép đăng nhập quay về URL Preview (bắt buộc)

Đăng nhập Google dùng `redirectTo = window.location.origin`. Nếu URL Preview **không** có trong danh sách Redirect URLs,
Supabase âm thầm chuyển người dùng về **Site URL (Production M10)** sau khi đăng nhập → thấy giao diện M10, không có Trợ lý AI.

Supabase → project FlowBoard → **Authentication → URL Configuration → Redirect URLs → Add URL**:
`https://flowboard-kanban-git-claude-m11-ai-agent-dorai4vn.vercel.app/**` → Save.
Chỉ thêm vào danh sách cho phép; không đổi Site URL, không ảnh hưởng người dùng Production. Google Console không cần đổi.

## 2. Migration Supabase — ĐÃ ÁP DỤNG

Trạng thái: chủ dự án đã chạy `supabase/apply/20261123000000_agent_approvals.oneshot.sql` (v2) trên Supabase FlowBoard
→ `M11 OK`, 2 bảng, 7 hàm; hồi quy M10 PASS. **Không chạy lại.** Kiểm tra trạng thái bất cứ lúc nào (chỉ đọc):
`supabase/checks/m11/status.sql`. Lịch sử sự cố v1 và cách v2 xử lý: `docs/m11-apply-runbook.md`.

**Ảnh hưởng (đã kiểm tra):**

- Chỉ **thêm**: 2 bảng mới (`agent_requests`, `agent_approvals`), RLS + policy cho 2 bảng đó, 7 hàm
  `agent_*`. Không sửa/xóa bảng, cột, policy hay hàm hiện có → bản Production đang chạy không bị ảnh hưởng.
- Hàm SECURITY DEFINER kiểm tra `auth.uid()` tường minh, `search_path` cố định, thu hồi quyền `anon`/`public`.
- Giới hạn chống lạm dụng nằm trong DB: 30 yêu cầu/10 phút/người, 30 yêu cầu xóa/giờ, tối đa 10 đang chờ,
  run state ≤ 128 KB; run state bị xóa trắng khi hết hạn và bản ghi > 1 ngày bị dọn cho mọi tài khoản → bảng không phình trên DB dùng chung.
- Đã chạy trên Supabase Local: pgTAP 126/126, integration 15/15.

**Cách áp dụng (khi bạn đồng ý):** Supabase Dashboard → SQL Editor → dán toàn bộ nội dung file migration → Run.
Hoặc `npx supabase db push` với project đã link (sẽ chỉ đẩy migration chưa có).

**Rollback:** chạy file `supabase/rollbacks/20261123000000_agent_approvals.down.sql` (drop 7 hàm `agent_*` rồi drop 2 bảng; chi tiết `docs/m11-migration-review.md` §8). Không đụng dữ
liệu bảng/công việc của người dùng.

## 3. Kiểm tra trên Preview

1. Mở URL Preview, đăng nhập Google.
2. Bấm nút **Trợ lý AI** trên thanh trên cùng.
3. Thử: “Việc nào đang quá hạn?”, “Tạo công việc Ôn tập chương 4 hạn ngày mai”, “Đánh dấu hoàn thành Ôn tập
   chương 4”, “Xóa Ôn tập chương 4” → phải hiện thẻ **Xác nhận xóa**; bấm **Không xóa** thì công việc còn nguyên;
   lặp lại và bấm **Xóa** thì công việc biến mất khỏi bảng.

## 4. Chạy cục bộ

```bash
npm run db:start
cp .env.example .env.local      # điền VITE_SUPABASE_* (từ `npx supabase status`) và OPENAI_API_KEY
npm run dev                     # Vite dev server phục vụ luôn /api/agent/* (plugin chỉ dùng khi dev)
```

Kiểm thử với mô hình thật (tốn token, không chạy trong CI): `npm run test:agent-live`.

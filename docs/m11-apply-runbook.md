# M11 — Runbook áp migration lên Supabase FlowBoard (phương án A2: dùng chung với M10 Production)

> **Cách ngắn nhất (khuyến nghị) — v2:** dán `supabase/apply/20261123000000_agent_approvals.oneshot.sql` vào SQL Editor → Run.
> Toàn bộ kiểm tra trước, migration và kiểm tra sau nằm trong **một câu lệnh `DO`** → nguyên tử trong mọi trình chạy SQL.
> Xem trạng thái bất cứ lúc nào (chỉ đọc): `supabase/checks/m11/status.sql`.
>
> **Sự cố v1 (commit c9c6dcd):** v1 dùng `begin; … create temp table m11_before … on commit drop; … commit;` qua nhiều câu
> lệnh. SQL Editor của Cloud đã thực thi các câu lệnh không trong cùng một phiên/transaction, nên bảng tạm không còn khi
> post-check (câu lệnh #42) tham chiếu tới → `42P01`. Tái hiện được bằng chế độ "mỗi câu lệnh một kết nối autocommit":
> khi đó migration M11 **đã được commit** (2 bảng, 7 hàm, chưa ghi lịch sử), chỉ post-check không chạy. v2 xử lý được trạng
> thái này (dọn đối tượng M11 rỗng rồi áp lại sạch trong cùng câu lệnh).

> **CHƯA THỰC HIỆN.** Chỉ chạy sau khi chủ dự án phê duyệt riêng. Không áp dụng cho ContentPilot AI.
> Mọi lệnh SQL chạy trong Supabase Dashboard của project **FlowBoard** → SQL Editor.
> Không dán mật khẩu/khóa vào chat, repo hay tài liệu.

File (commit cuối của nhánh `claude/m11-ai-agent`):

| File | Vai trò | Ghi dữ liệu? |
|---|---|---|
| `supabase/checks/m11/preflight.sql` | kiểm tra trước | Không (chỉ đọc) |
| `supabase/checks/m11/snapshot.sql` | dấu vân tay md5 dữ liệu + schema M10 | Không (chỉ đọc) |
| `supabase/apply/20261123000000_agent_approvals.apply.sql` | áp migration trong **1 transaction**, `lock_timeout 5s`, ghi lịch sử CLI nếu có | **Có** |
| `supabase/checks/m11/postcheck.sql` | kiểm tra quyền/RLS sau khi áp | Không (chỉ đọc) |
| `supabase/rollbacks/20261123000000_agent_approvals.down.sql` | gỡ M11 trong 1 transaction | **Có** (chỉ đối tượng M11) |

Đã chạy thử toàn bộ quy trình trên Postgres `supabase/postgres:17.11.0.006` dùng một lần, ở 2 trường hợp
(có / không có bảng lịch sử `supabase_migrations.schema_migrations`): preflight → snapshot → apply → postcheck (9/9 `t`)
→ snapshot giống hệt → chạy lại apply bị từ chối an toàn → rollback → trạng thái trùng khớp trước khi apply → apply lại OK.

## Bước 1 — Kiểm tra lịch sử migration (chỉ đọc)
Chạy `supabase/checks/m11/preflight.sql`. Kết quả mong đợi:
- `m10_tables = 4`
- `agent_objects = 0`
- `history = 20261122000000` **hoặc** `no CLI history table (...)`

Nếu khác (ví dụ đã có `agent_*`, hoặc có migration lạ) → **dừng**, gửi kết quả cho Claude.

## Bước 2 — Backup (bắt buộc trước khi áp)
Không dựa vào backup tự động của gói Free. Chọn một cách:
- **A. pg_dump trên máy bạn** (Postgres client ≥ 17). Lấy connection string: Dashboard → **Connect** → *Session pooler*;
  mật khẩu DB nhập tại máy bạn:
  ```bash
  pg_dump "<SESSION_POOLER_CONNECTION_STRING>" --schema=public --no-owner --format=custom --file=flowboard-before-m11.dump
  ```
- **B. Supabase CLI** (cần Docker):
  ```bash
  npx supabase db dump --db-url "<SESSION_POOLER_CONNECTION_STRING>" -f flowboard-schema-before-m11.sql
  ```
  ```bash
  npx supabase db dump --db-url "<SESSION_POOLER_CONNECTION_STRING>" --data-only -f flowboard-data-before-m11.sql
  ```
- **C. Tối thiểu:** Table Editor → `boards`, `labels`, `tasks`, `task_labels` → Export CSV.

Giữ file backup trên máy bạn, không commit.

## Bước 3 — Dấu vân tay trước (chỉ đọc)
Chạy `supabase/checks/m11/snapshot.sql`, lưu kết quả (12 dòng).

## Bước 4 — Áp migration ⚠️ CẦN PHÊ DUYỆT
Mở `supabase/apply/20261123000000_agent_approvals.apply.sql`, kiểm tra dòng đầu là
`-- APPLY FILE for supabase/migrations/20261123000000_agent_approvals.sql`, dán **toàn bộ** vào SQL Editor → Run.
- Lỗi bất kỳ → transaction bị hủy, **không có gì thay đổi**; gửi thông báo lỗi cho Claude.
- Lỗi `lock_timeout` → chạy lại lúc ít người dùng.

## Bước 5 — Kiểm tra sau (chỉ đọc)
1. `supabase/checks/m11/postcheck.sql` → 9 dòng, tất cả `ok = true`.
2. `supabase/checks/m11/snapshot.sql` → 11 dòng đầu **giống hệt** Bước 3 (chỉ dòng `m11.objects` đổi thành
   `2 tables, 7 functions`). *Lưu ý:* nếu trong lúc đó có người dùng M10 sửa bảng thì dòng `data.*` sẽ khác vì lý do đó,
   các dòng `schema.*` vẫn phải giống.
3. Mở M10 Production (`main`), đăng nhập, kéo thả / tạo / sửa / xóa một công việc thử → bình thường.

## Rollback (nếu cần)
1. Vercel → xóa `OPENAI_API_KEY` khỏi Preview → Redeploy (Trợ lý ngừng, trả 503).
2. SQL Editor → chạy `supabase/rollbacks/20261123000000_agent_approvals.down.sql`.
3. `preflight.sql` → `agent_objects = 0`. Dữ liệu M10 không bị ảnh hưởng; chỉ mất yêu cầu duyệt + nhật ký số lần gọi.

## Bước 6 — Cấu hình Vercel Preview (chủ dự án tự nhập)
Vercel → Project → Settings → Environment Variables:
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`: đã có từ M9 cho Preview (cùng project FlowBoard) — chỉ kiểm tra,
  không sửa biến Production.
- **Add** `OPENAI_API_KEY` — Environment: **chỉ Preview** (khuyến nghị giới hạn nhánh `claude/m11-ai-agent`), bật **Sensitive**.
- **Add** `AGENT_STATE_SECRET` — tạo trên máy bạn: `openssl rand -base64 48`; chỉ Preview, Sensitive.
- Không chọn Production/Development cho hai biến trên.
- Supabase → Authentication → URL Configuration: Redirect URLs phải cho phép
  `https://flowboard-kanban-git-claude-m11-ai-agent-dorai4vn.vercel.app/**` (kiểm tra, M9 có thể đã thêm wildcard).
- Deployments → bản Preview mới nhất của nhánh → **Redeploy**.

## Bước 7 — Kiểm thử trên Preview
Dữ liệu trên Preview là **dữ liệu thật** của project FlowBoard → chỉ thao tác trên bảng/công việc thử (ví dụ bảng
“M11 thử nghiệm”). Checklist: `docs/m11-report.md` §8 (Agent thật, duyệt/từ chối xóa, hai tài khoản, regression M10).

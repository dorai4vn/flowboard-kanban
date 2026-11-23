# Backup FlowBoard (Supabase) bằng GitHub Actions — hướng dẫn qua trình duyệt

> **Chưa chạy backup Production.** Chỉ chạy bước 9 sau khi bạn xem xong workflow và tự quyết định.
> Chỉ dùng cho project Supabase **FlowBoard**. Không dùng cho ContentPilot AI.
> Không dán mật khẩu, connection string hay khóa riêng vào chat, file trong repo hay issue/PR.

File workflow: [`ops/backup/flowboard-db-backup.yml`](flowboard-db-backup.yml) — đặt ở đây (thư mục `ops/`) để **không bao
giờ chạy** trong repo `flowboard-kanban` (repo này public). Bạn sẽ sao chép nó sang một repo **Private** riêng.

## Cách workflow bảo vệ dữ liệu

| Yêu cầu | Cách làm |
|---|---|
| Công cụ chính thức | `supabase db dump` (roles / schema / data, đúng lệnh trong tài liệu “Backup and Restore using the CLI”), khôi phục bằng `psql --single-transaction` |
| Production chỉ đọc | pg_dump chạy mọi phiên trong `REPEATABLE READ, READ ONLY`; truy vấn kiểm tra chạy trong `begin transaction read only`. Đã kiểm chứng bằng log Postgres: 2 378 câu lệnh, **0** câu ghi/DDL/GRANT; chỉ khóa `ACCESS SHARE` (không chặn đọc/ghi của người dùng, chỉ chặn đổi cấu trúc bảng trong vài giây dump) |
| Khôi phục được đầy đủ | Trên runner, dựng một Supabase stack tạm, khôi phục, rồi so **dấu vân tay**: cột, ràng buộc, index, trigger, cờ RLS, policies (cả điều kiện), quyền bảng, hàm (định nghĩa + quyền), và md5 của **từng dòng** `boards, labels, tasks, task_labels, auth.users, auth.identities`. Khác một chút là workflow dừng, không tạo artifact |
| Quyền chính xác sau khôi phục | Kèm `privileges.sql` (sinh từ catalog, chỉ đọc). Lý do: khôi phục theo tài liệu vào project mới sẽ **cấp lại cho `anon` toàn quyền 4 bảng + 3 hàm** (default privileges của project mới) — phát hiện khi chạy thử |
| Mã hóa trước khi upload | AES-256-CBC với khóa ngẫu nhiên dùng một lần + HMAC-SHA256 chống sửa file; khóa đó được bọc bằng **khóa công khai RSA** của bạn (OAEP). Khóa riêng **không bao giờ** lên GitHub |
| Không lộ secret | Secret chỉ qua biến môi trường; không `set -x`; mật khẩu được mask riêng (cả dạng mã hóa URL); không in connection string |
| Không commit backup | Không `checkout`, không ghi repo; file tạm ở `$RUNNER_TEMP`, xóa ở bước cuối (kể cả khi lỗi) |
| Quyền workflow tối thiểu | `permissions: {}` (GITHUB_TOKEN không có quyền gì); chỉ chạy thủ công; action ghim theo commit SHA |
| Chặn nhầm lẫn | Từ chối nếu repo public, sai chữ xác nhận, thiếu secret, khóa công khai < 3072 bit, hoặc connection string không chứa đúng project ref FlowBoard |
| Dữ liệu nhạy cảm bỏ ra | Không sao lưu `auth.sessions`, `auth.refresh_tokens`, `auth.mfa_*`, `auth.one_time_tokens`, `auth.flow_state`, `auth.audit_log_entries` (sau khi khôi phục người dùng chỉ cần đăng nhập lại) |

## Đánh giá riêng tư (đã kiểm tra trước khi triển khai)

- `dorai4vn/flowboard-kanban` đang **public**: log và artifact của Actions trong repo public **ai đăng nhập GitHub cũng tải được** → tuyệt đối không chạy backup ở đây (workflow tự từ chối nếu repo public).
- Repo **Private** riêng: log + artifact chỉ người có quyền đọc repo xem/tải được (kiểm tra Settings → Collaborators: chỉ có bạn).
- Secret GitHub: chỉ ghi, không ai đọc lại được qua giao diện/API; không gửi cho workflow từ fork.
- Artifact được GitHub lưu trữ (mã hóa phía GitHub) **và** đã được mã hóa bằng khóa của bạn → kể cả người tải được artifact cũng không đọc được nếu không có khóa riêng.
- Giới hạn: artifact tự xóa sau 1 hoặc 3 ngày (bạn chọn khi chạy); có thể xóa tay sớm hơn. Gói Free cho repo private: 2 000 phút Actions/tháng, 500 MB lưu trữ artifact. Mỗi lần chạy ước tính 5–10 phút (chưa đo trên GitHub).
- Ai có quyền **ghi/admin** repo backup có thể sửa workflow để lấy secret → đừng thêm cộng tác viên vào repo này.

## Các bước trên trình duyệt (và 2 lệnh có sẵn trên macOS)

### 1. Tạo repository Private
github.com → **+** → **New repository** → Owner: tài khoản của bạn → Name: `flowboard-db-backups` →
chọn **Private** → tick **Add a README file** → **Create repository**.

### 2. Cài đặt Actions cho repo đó
Repo mới → **Settings** → **Actions** → **General**:
- *Actions permissions*: **Allow dorai4vn, and select non-dorai4vn, actions and reusable workflows** → tick
  **Allow actions created by GitHub** → ô *Allow specified actions*: `supabase/setup-cli@*` → **Save**.
- *Artifact and log retention*: **3** days → **Save**.
- *Workflow permissions*: **Read repository contents and packages permissions**; bỏ tick *Allow GitHub Actions to create and approve pull requests* → **Save**.

Settings → **Collaborators**: đảm bảo không có ai khác.

### 3. Tạo cặp khóa mã hóa (một lần, trên Mac — dùng `openssl` có sẵn của macOS, không cài gì)
Mở ứng dụng **Terminal** (có sẵn) và chạy lần lượt:
```bash
cd ~/Documents
```
```bash
openssl genrsa -aes256 -out flowboard-backup-private.pem 4096
```
(nhập một passphrase mạnh hai lần — ghi vào trình quản lý mật khẩu)
```bash
openssl rsa -in flowboard-backup-private.pem -pubout -out flowboard-backup-public.pem
```
```bash
cat flowboard-backup-public.pem
```
- `flowboard-backup-private.pem` + passphrase: **giữ riêng** (ổ USB / trình quản lý mật khẩu). Mất khóa này = không giải mã được backup.
- Không tải khóa riêng lên GitHub, không gửi qua chat.

### 4. Lấy thông tin FlowBoard trên Supabase (chỉ đọc)
supabase.com/dashboard → mở project **FlowBoard** (kiểm tra kỹ tên, không phải ContentPilot AI):
- **Project Settings → General → Project ID** (20 ký tự) → đây là `FLOWBOARD_PROJECT_REF`.
- Nút **Connect** → tab **Session pooler** → copy chuỗi **URI** dạng
  `postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-…pooler.supabase.com:5432/postgres`.
  Thay `[YOUR-PASSWORD]` bằng mật khẩu database. Nếu mật khẩu có ký tự đặc biệt (`@ : / ? # %` …), phải mã hóa URL
  (ví dụ `@` → `%40`). Nếu không nhớ mật khẩu: **dừng lại và hỏi tôi trước** — đặt lại mật khẩu là một thay đổi trên Production.

### 5. Nhập biến và secret vào repo backup
Repo `flowboard-db-backups` → **Settings → Secrets and variables → Actions**:
- Tab **Variables** → **New repository variable**:
  - `FLOWBOARD_PROJECT_REF` = Project ID ở bước 4
  - `BACKUP_PUBLIC_KEY_PEM` = toàn bộ nội dung `flowboard-backup-public.pem` (cả dòng BEGIN/END)
- Tab **Secrets** → **New repository secret**:
  - `SUPABASE_DB_URL` = connection string đầy đủ ở bước 4

### 6. Thêm workflow
Mở file workflow ở nhánh `claude/flowboard-backup-workflow` của `flowboard-kanban` → nút **Raw** → chọn tất cả → copy.
Repo `flowboard-db-backups` → **Add file → Create new file** → tên: `.github/workflows/flowboard-db-backup.yml` → dán →
**Commit changes** (vào `main`).

### 7. Xem lại trước khi chạy
Đọc workflow trong repo backup; tab **Actions** phải thấy “Backup FlowBoard database” và **chưa có lần chạy nào**.

### 8. Báo cho Claude rằng bạn đã làm xong bước 1–7 (không gửi secret)
Tôi sẽ kiểm tra lại nội dung workflow nếu bạn cho xem (không có secret trong file).

### 9. Chạy backup ⚠️ chỉ khi bạn phê duyệt
Tab **Actions** → **Backup FlowBoard database** → **Run workflow** → `confirm`: `BACKUP-FLOWBOARD` →
`retention_days`: `1` → **Run workflow**. Chờ dấu ✓ xanh. Bước *Restore … and compare* phải có dòng
`Test restore OK: schema, RLS flags, policies, grants, functions and every row are identical.`

### 10. Tải về và giải mã thử ngay (Mac, lệnh có sẵn)
Trang của lần chạy → mục **Artifacts** → tải `flowboard-db-backup-<số>-encrypted` (file .zip) → nhấp đúp để giải nén
vào một thư mục, ví dụ `~/Documents/fb-backup`. Chép `flowboard-backup-private.pem` vào cùng thư mục, rồi trong Terminal:
```bash
cd ~/Documents/fb-backup
```
```bash
openssl rsautl -decrypt -oaep -inkey flowboard-backup-private.pem -in session.key.enc -out session.key
```
```bash
KEY=$(head -c 32 session.key | od -An -v -tx1 | tr -d ' \n'); IV=$(tail -c +33 session.key | head -c 16 | od -An -v -tx1 | tr -d ' \n'); MAC=$(tail -c 32 session.key | od -An -v -tx1 | tr -d ' \n')
```
```bash
[ "$(openssl dgst -sha256 -hmac "$MAC" -r backup.tar.gz.enc | cut -d' ' -f1)" = "$(cat backup.tar.gz.enc.hmac)" ] && echo "HMAC OK" || echo "HMAC SAI - KHONG DUNG FILE NAY"
```
```bash
openssl enc -d -aes-256-cbc -K "$KEY" -iv "$IV" -in backup.tar.gz.enc -out flowboard-backup.tar.gz && rm session.key
```
Nhấp đúp `flowboard-backup.tar.gz` để giải nén → có `MANIFEST.txt, roles.sql, schema.sql, data.sql, privileges.sql, auth-schema.sql`.
Sau đó: xóa `flowboard-backup-private.pem` khỏi thư mục này, và trên GitHub xóa artifact (biểu tượng thùng rác) nếu không cần giữ.

> Các lệnh giải mã đã được kiểm chứng với OpenSSL 3 trên Linux. Chúng chỉ dùng tính năng có từ lâu trong LibreSSL của
> macOS, nhưng **chưa chạy thử trên Mac** — vì vậy hãy giải mã thử ngay sau lần backup đầu tiên.

## Khôi phục (khi cần, vào một project Supabase mới)
Theo tài liệu chính thức, thứ tự: `roles.sql` → `schema.sql` → `SET session_replication_role = replica` → `data.sql`,
rồi **thêm** `privileges.sql` (để `anon` không có lại quyền đã bị thu hồi). Khôi phục là thao tác ghi → làm cùng Claude, có phê duyệt riêng.

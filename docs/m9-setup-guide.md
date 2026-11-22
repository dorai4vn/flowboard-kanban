# Hướng dẫn cài đặt Buổi 9 — Supabase + Google Login

Tài liệu này dành cho **chủ dự án** tự làm các bước cần tài khoản thật. Claude không cần và không được
nhận bất kỳ secret nào. Thời gian ước tính: 20–30 phút. Chi phí: 0 đ (Supabase Free + Google Cloud miễn phí).

> ⚠️ Không merge nhánh `claude/m9-supabase` vào `main` trước bước 8: Vercel tự build `main`, thiếu biến
> môi trường Supabase thì trang production sẽ chỉ hiện “Thiếu cấu hình Supabase.”

## 1. Tạo Supabase project riêng

1. Vào https://supabase.com/dashboard → **New project**.
2. Tên: `flowboard-kanban` · Region: **Southeast Asia (Singapore)** · gói **Free**. Đặt mật khẩu DB mạnh và tự lưu.
3. **Không** dùng project của ContentPilot AI. (Gói Free cho tối đa 2 project đang chạy mỗi tổ chức.)

## 2. Tạo bảng + RLS (chọn một cách)

- **SQL Editor (dễ nhất):** mở file `supabase/migrations/20261122000000_init.sql` trong repo, dán toàn bộ vào
  Dashboard → SQL Editor → **Run**.
- **CLI:** `npx supabase login` → `npx supabase link --project-ref <project-ref>` → `npx supabase db push`.

Kiểm tra: Table Editor có `boards`, `labels`, `tasks`, `task_labels`, mỗi bảng ghi **RLS enabled**.

## 3. Tạo Google OAuth client (Google Cloud Console)

1. https://console.cloud.google.com → tạo project (vd. `flowboard`).
2. **APIs & Services → OAuth consent screen**: User type **External**, điền tên app “FlowBoard”, email hỗ trợ;
   Publishing status để **Testing** và thêm **2 tài khoản Google** dùng để kiểm thử vào *Test users*.
3. **Credentials → Create credentials → OAuth client ID** → *Web application*:
   - Authorized JavaScript origins: `http://localhost:5173`
   - Authorized redirect URIs: `https://<project-ref>.supabase.co/auth/v1/callback`
     (copy chính xác từ Supabase → Authentication → Sign In / Providers → Google → *Callback URL*).
4. Lưu **Client ID** và **Client Secret** (secret chỉ dán vào Supabase Dashboard ở bước 4, không dán vào code, chat hay Git).

## 4. Bật Google trong Supabase

1. Dashboard → **Authentication → Sign In / Providers → Google** → Enable, dán Client ID + Client Secret → Save.
2. **Email provider**: tắt (hoặc tắt *Allow new users to sign up*). Email/password chỉ dùng trên Supabase Local cho test tự động.

## 5. Cấu hình URL chuyển hướng

Dashboard → **Authentication → URL Configuration**:
- Site URL: `http://localhost:5173`
- Redirect URLs: `http://localhost:5173` (đúng chính xác, không dùng `*`).

## 6. Chạy app trên máy của bạn

```bash
git fetch origin && git checkout claude/m9-supabase
npm install
cp .env.example .env.local
```

Mở `.env.local`, điền từ Dashboard → **Project Settings → API Keys** (hoặc Data API):

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key, dạng sb_publishable_… (hoặc anon key)>
```

> Chỉ dùng **publishable/anon** key. Tuyệt đối không dùng `secret`/`service_role` key trong `.env.local`.

```bash
npm run dev    # mở http://localhost:5173
```

## 7. Checklist kiểm thử bằng 2 tài khoản Google thật

Dùng 2 trình duyệt (hoặc 1 cửa sổ thường + 1 cửa sổ ẩn danh), tài khoản A và B.

| # | Bước | Kết quả mong đợi | Đạt? |
|---|---|---|---|
| 1 | Mở app chưa đăng nhập | Màn hình “Đăng nhập bằng Google”, không thấy bảng | ☐ |
| 2 | A đăng nhập Google | Về lại app, URL không còn `?code=`, thấy bảng mẫu 5 công việc, avatar A | ☐ |
| 3 | A tải lại trang 2 lần | Vẫn đúng **một** bảng mẫu | ☐ |
| 4 | A tạo “Việc riêng của A”, kéo sang Đang làm, đổi màu bảng, tạo bảng “Đồ án” | Tất cả còn nguyên sau khi tải lại | ☐ |
| 5 | B đăng nhập ở trình duyệt thứ hai | B chỉ thấy bảng mẫu của B, **không** thấy “Việc riêng của A” hay bảng “Đồ án” | ☐ |
| 6 | Supabase → Table Editor → `tasks` | Mỗi dòng có `user_id` của đúng người tạo | ☐ |
| 7 | A bấm avatar → Đăng xuất | Về màn hình đăng nhập ngay, bảng biến mất | ☐ |
| 8 | Ở trình duyệt của A, đăng nhập bằng B | Không còn dữ liệu của A trên màn hình | ☐ |
| 9 | DevTools → Network → Offline | Banner “Mất kết nối – đang ở chế độ chỉ đọc.”, không thêm/kéo được; bật mạng lại thì sửa được | ☐ |
| 10 | Bấm Đăng nhập rồi **Cancel** ở trang Google | Quay lại app với thông báo “Không đăng nhập được, vui lòng thử lại.” | ☐ |
| 11 | DevTools → Application → Local Storage | Có `flowboard-auth` (phiên), dữ liệu Buổi 8 cũ `flowboard:state` vẫn còn nguyên, không bị xóa | ☐ |

## 8. Khi muốn đưa lên Vercel (chưa làm trong Buổi 9)

1. Vercel → Project → Settings → Environment Variables: thêm `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
2. Supabase Redirect URLs + Google *Authorized JavaScript origins*: thêm `https://flowboard-kanban-iota.vercel.app`.
3. Sau đó mới tạo PR và merge vào `main`.

## Chạy test trên máy (tùy chọn, cần Docker)

```bash
npm run db:start          # Supabase Local (Docker)
npm run test:db           # pgTAP: RLS + RPC
npm run test:integration  # repository thật với 2 user local
npm run test:e2e          # Playwright trên Supabase Local
npm run check             # lint + typecheck + unit + build
npm run check:secrets     # quét secret trong repo và dist/
```

## Xử lý sự cố: Vercel Preview báo “Thiếu cấu hình Supabase.”

Biến `VITE_*` được **gắn vào bundle lúc build**: thêm/sửa biến xong phải có **deployment mới được build sau đó**.

1. Mở Build Logs của deployment, tìm dòng `[check-build-env]`:
   - `VERCEL_ENV=preview branch=claude/m9-supabase` + hai dòng `present` → build đã nhận đủ biến.
   - Có `missing` → build **dừng** với thông báo nêu đúng tên biến và môi trường.
2. Nếu thiếu, vào Vercel → đúng project `flowboard-kanban` → Settings → Environment Variables, kiểm tra:
   - Tên chính xác `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (có tiền tố `VITE_`, không khoảng trắng).
   - Cột **Environments** có **Preview**; nếu Preview bị giới hạn theo nhánh thì nhánh phải là `claude/m9-supabase` (hoặc để trống = mọi nhánh).
   - Giá trị không rỗng.
3. Tạo deployment mới: push một commit lên `claude/m9-supabase`, hoặc Deployments → deployment mới nhất của nhánh đó → ⋯ → Redeploy (bỏ chọn “Use existing Build Cache”).
4. Mở **URL của deployment mới** (hoặc alias nhánh `…-git-claude-m9-supabase-…vercel.app`), không mở lại URL cũ.
5. Màn hình thiếu cấu hình giờ liệt kê từng biến `có/thiếu` (không hiện giá trị) để đối chiếu nhanh.

# FlowBoard M11 — Hướng dẫn demo cho giảng viên (khoảng 5 phút)

**Link demo (Production):** https://flowboard-kanban-iota.vercel.app/
Mã nguồn: https://github.com/dorai4vn/flowboard-kanban (nhánh `main`, merge PR #4) · Báo cáo: `docs/m11-report.md`

> Đăng nhập bằng tài khoản Google của bạn: mỗi tài khoản chỉ thấy dữ liệu của chính mình (Row Level Security); tài khoản mới
> được tạo sẵn một bảng mẫu. Nên thao tác trên bảng mẫu hoặc một bảng mới.

## Checklist nhanh cho giảng viên (khoảng 3 phút)

- [ ] **Đăng nhập** — mở link → *Đăng nhập với Google* → thấy bảng Kanban.
- [ ] **Mở Agent** — bấm **✨ Trợ lý AI** (góc phải trên, cạnh avatar).
- [ ] **Đọc** — gõ `Việc nào đang quá hạn?` → danh sách khớp với bảng.
- [ ] **Tạo** — gõ `Tạo công việc "Demo AI" hạn ngày mai` → thẻ mới xuất hiện ở cột *Cần làm*.
- [ ] **Sửa** — gõ `Đánh dấu hoàn thành "Demo AI"` → thẻ chuyển sang *Hoàn thành*.
- [ ] **Yêu cầu phê duyệt xóa** — gõ `Xóa "Demo AI"` → hiện **thẻ xác nhận đỏ**, chưa xóa gì →
      bấm **Không xóa** (thẻ còn) → yêu cầu lại → bấm **Xóa** (thẻ biến mất).

## Kịch bản demo chi tiết

| # | Thao tác | Kết quả mong đợi | Điều được chứng minh |
|---|---|---|---|
| 1 | Mở link → **Đăng nhập với Google** | Bảng Kanban của tài khoản | Đăng nhập thật (Supabase Auth) |
| 2 | Bấm **✨ Trợ lý AI** (góc phải trên, cạnh avatar) | Panel chat mở bên phải | Giao diện Agent |
| 3 | Gõ: `Tạo công việc "Ôn tập chương 4" hạn ngày mai` | Trợ lý báo đã tạo; thẻ xuất hiện ở cột Cần làm, kèm dòng “Đã tạo …” | **CREATE** thật vào Postgres |
| 4 | Gõ: `Việc nào đang quá hạn?` hoặc `Tóm tắt việc hôm nay` | Danh sách đúng với dữ liệu trên bảng | **READ** |
| 5 | Gõ: `Dời hạn "Ôn tập chương 4" sang thứ Sáu và đánh dấu hoàn thành` | Thẻ đổi hạn, chuyển sang cột Hoàn thành | **UPDATE** |
| 6 | Gõ: `Xóa "Ôn tập chương 4"` | **Thẻ xác nhận đỏ** ghi rõ tên công việc và bảng; **chưa** xóa gì | Hành động rủi ro cần duyệt (M4) |
| 7 | Bấm **Không xóa** | Công việc vẫn còn | Từ chối được tôn trọng |
| 8 | Lặp lại bước 6 → bấm **Xóa** | Công việc biến mất; bấm lại không xóa thêm | Duyệt được cưỡng chế ở **backend** (Postgres), chỉ một lần |
| 9 | (Tùy chọn) Đăng nhập tài khoản Google thứ hai | Không thấy dữ liệu của tài khoản thứ nhất, kể cả khi hỏi Trợ lý | Cách ly bằng RLS |

## Điểm kỹ thuật chính (nếu được hỏi)

- Agent: OpenAI Agents SDK chạy **phía server** (Vercel Functions `api/agent/*`); khóa OpenAI không bao giờ tới trình duyệt.
- Mọi thao tác dữ liệu dùng **JWT của chính người dùng** → RLS của Postgres áp dụng; không dùng service-role, không có SQL tùy ý.
- Xóa: tool có `needsApproval`; yêu cầu được lưu trong bảng `agent_approvals` (gắn user + thao tác + mục bị xóa, hết hạn
  10 phút); bấm “Xóa” mới cấp mã dùng một lần; xóa và tiêu mã trong cùng một transaction → chống replay, giả mạo, bấm song song.
- Kiểm thử: 220 unit/component, 126 pgTAP (RLS/RPC), 15 integration (2 user thật), 27 E2E, 5 kịch bản với model thật;
  review bảo mật độc lập 3 vòng. Chi tiết: `docs/m11-report.md`.

## Chạy trên máy (không bắt buộc, cần Node 20+ và Docker)

```bash
npm install
```
```bash
npm run db:start
```
```bash
cp .env.example .env.local   # điền VITE_SUPABASE_* từ `npx supabase status` và OPENAI_API_KEY
```
```bash
npm run dev                  # http://localhost:5173 — Vite phục vụ luôn /api/agent/*
```

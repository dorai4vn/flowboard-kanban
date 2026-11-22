# FlowBoard Buổi 10 — Giao diện mới + chế độ xem Hôm nay / Quá hạn (Design Spec)

- Ngày: 2026-11-22 · Nhánh: `claude/m10-ui-polish` (từ `main` sau khi merge Buổi 9)
- Không đổi kiến trúc: vẫn Vite SPA + Zustand + Supabase (RLS) + Google OAuth. **Không đổi schema.**

## Mục tiêu
1. FlowBoard trông và dùng như một công cụ năng suất cá nhân: bố cục có sidebar, phân cấp rõ, thẻ/cột/hộp thoại tinh gọn.
2. Tính năng mới: hai chế độ xem **Hôm nay** (việc đến hạn hôm nay, chưa xong) và **Quá hạn** (hạn trước hôm nay, chưa xong),
   gom từ **mọi bảng** của tài khoản, truy cập một chạm từ thanh điều hướng, có bộ đếm.
3. Không hồi quy: đăng nhập Google, cô lập dữ liệu, CRUD, kéo thả, lưu trữ, offline, a11y.

## Ngoài phạm vi
Thay đổi DB/RLS, light mode, nhắc việc/thông báo, realtime.

## Hướng thiết kế
| Token | Giá trị | Vai trò |
|---|---|---|
| Ink | `#0E1221` | nền chính (navy mực, thay near-black) |
| Rail | `#0A0D18` | sidebar |
| Surface / Card | `#141A2C` / `#1A2136` | cột / thẻ |
| Today | `#F5B544` | đến hạn hôm nay |
| Late | `#F07167` | quá hạn |
| Done | `#5DD3A5` | hoàn thành |
| Accent | theo bảng (indigo mặc định) | thương hiệu, tiêu điểm, nút chính |

- Font **Be Vietnam Pro** (thiết kế cho dấu tiếng Việt), số dạng tabular cho ngày/bộ đếm.
- Bán kính phân cấp: khung 20px · cột 16px · thẻ 12px · ô nhập 10px.
- Điểm nhấn duy nhất: tiêu đề ngày lớn ở view Hôm nay/Quá hạn và nhãn “Trễ N ngày”. Bảng Kanban giữ tĩnh lặng.

```
Desktop                                         Mobile
┌──────────┬──────────────────────────────┐     ┌──────────────────────┐
│ FlowBoard│ [Bảng ▾][+][⚙]  🔍 Tìm  Lọc (A)│     │ FlowBoard        (A) │
│ Bảng     │──────────────────────────────│     │ [Bảng ▾][+][⚙]  🔍 Lọc│
│ Hôm nay 2│  Cần làm   Đang làm  Hoàn thành│     │ [tab cột]            │
│ Quá hạn 1│  [thẻ]     [thẻ]     [thẻ]     │     │ [thẻ]                │
│ Bảng của │                              │     ├──────────────────────┤
│  bạn …   │                              │     │ Bảng | Hôm nay | Quá hạn │
└──────────┴──────────────────────────────┘     └──────────────────────┘
```

## Hành vi
- `view ∈ {board, today, overdue}` là trạng thái UI (không lưu DB). Thanh điều hướng: “Bảng”, “Hôm nay (n)”, “Quá hạn (n)”.
- **Hôm nay**: `dueDate === hôm nay` và không ở cột Hoàn thành. **Quá hạn**: `dueDate < hôm nay` và không ở cột Hoàn thành.
  Ngày theo giờ địa phương (dùng lại `dates.ts`).
- Sắp xếp: Quá hạn theo hạn cũ nhất trước, rồi ưu tiên cao trước; Hôm nay theo ưu tiên cao trước, rồi thứ tự bảng/cột.
- Mỗi dòng: nút tròn “Đánh dấu hoàn thành <tên>” (chuyển task về cuối cột Hoàn thành của **bảng chứa nó**, qua hàng đợi ghi hiện có),
  tiêu đề bấm để mở hộp thoại sửa (chuyển bảng đang mở sang bảng của task), chip bảng, cột hiện tại, badge ưu tiên, badge hạn.
- Trạng thái rỗng có lời hướng dẫn hành động. Offline: nút hoàn thành bị khóa.
- Nút “Hôm nay” cũ trong thanh lọc của bảng được **thay bằng view Hôm nay** (tránh hai khái niệm trùng tên).

## Kiểm thử
Unit: `focusTasks`, `daysBetween`, store `completeTask`. Component: điều hướng, hai view, hoàn thành, mở task, rỗng, offline.
E2E: thêm luồng Hôm nay/Quá hạn (desktop + mobile); toàn bộ E2E Buổi 8–9 vẫn PASS.

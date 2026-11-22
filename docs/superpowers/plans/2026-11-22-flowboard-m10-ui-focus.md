# FlowBoard M10 (UI polish + Today/Overdue) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Giao diện năng suất cá nhân + view Hôm nay/Quá hạn, không đổi backend.
**Spec:** `docs/superpowers/specs/2026-11-22-flowboard-m10-ui-focus-design.md`

## Global Constraints
- Không đổi `supabase/`, không đổi auth flow. Copy tiếng Việt. Giữ nhãn a11y mà test hiện có dùng
  (`Chọn bảng`, `Bảng mới`, `Tùy chỉnh bảng`, `Tài khoản …`, `Thêm công việc vào cột …`, `Chuyển công việc …`, `Tìm kiếm công việc`, `Lọc`).
- Mỗi phần tử tương tác chỉ render **một lần** (responsive bằng CSS, không nhân đôi DOM).

## Review Focus
1. Hoàn thành từ view khi task thuộc bảng **không** đang mở → phải chuyển đúng task đúng bảng.
2. Task trong cột Hoàn thành có hạn quá khứ → không xuất hiện ở Quá hạn.
3. Mở task từ view → hộp thoại sửa đúng task (bảng đang mở đổi theo).
4. Offline → không hoàn thành được từ view.
5. Đổi tài khoản khi đang ở view → không còn task của tài khoản cũ.

### Task 1: Domain — `daysBetween`, `focusTasks` (TDD)
`daysBetween(from: string, to: string): number` trong `dates.ts`.
`type FocusItem = { task: Task; boardId: string; boardName: string; column: ColumnId; daysLate: number }`;
`focusTasks(s: BoardsState, kind: 'today' | 'overdue', today: string): FocusItem[]` trong `filters.ts`.
Test: định nghĩa, loại trừ cột done, nhiều bảng, sắp xếp, `daysLate`.

### Task 2: Store — `completeTask(boardId, taskId)` (TDD)
Dùng `planMove` trên bảng chỉ định, cuối cột done; chặn offline; bảng/task lạ → không làm gì.

### Task 3: Shell + điều hướng + view (TDD component)
`Sidebar` (logo, `nav[aria-label="Chế độ xem"]`: Bảng / Hôm nay n / Quá hạn n, danh sách bảng “Mở bảng X”), `TopBar`
(công cụ bảng + tìm/lọc + tài khoản), `FocusView` (tiêu đề ngày, danh sách, rỗng). Bỏ nút “Hôm nay” trong `FilterBar` và `TodaySummary`.

### Task 4: Làm mới giao diện
Tokens, font Be Vietnam Pro, cột, thẻ (badge ưu tiên/hạn: “Hôm nay”, “Ngày mai”, “Trễ N ngày”, giữ `aria-label` “Hạn chót dd/MM…”),
trạng thái rỗng, hộp thoại.

### Task 5: Test + E2E + ảnh chụp + push
Cập nhật test Buổi 8 liên quan “Hôm nay”; E2E Today/Overdue desktop + mobile; chạy check/db/integration/e2e/secrets; push nhánh.

---

## Phần 2 (yêu cầu bổ sung 2026-11-22): chất lượng giao diện + UX

### Task 6: Domain cho dashboard và view (TDD)
- `boardStats(board, today) → { todo, doing, done, total, percentDone, dueToday, overdue }` (đếm việc chưa xong cho hạn).
- `todayPlan(state, today) → { pending: FocusItem[]; done: FocusItem[] }` — việc có hạn hôm nay; `done` = đang ở cột Hoàn thành.
- `overdueBuckets(items) → { id: 'week' | 'days' | 'day'; title; items }[]` — “Trễ hơn 1 tuần” (> 7), “Trễ 2–7 ngày”, “Trễ 1 ngày”, bỏ nhóm rỗng.

### Task 7: Store — `rescheduleTask(boardId, taskId, dueDate)` (TDD)
Cập nhật hạn chót trên đúng bảng (kể cả khi bảng khác đang mở), qua hàng đợi ghi; chặn offline; task/bảng lạ → lỗi, không ghi.

### Task 8: Giao diện
- **Tổng quan bảng** (trên các cột): thanh tiến độ 3 đoạn theo cột + chú thích + % hoàn thành + số việc đến hạn hôm nay / quá hạn của bảng.
- **Hôm nay**: tiêu đề ngày, thanh tiến độ “Đã xong x/y”, danh sách cần làm, nhóm “Đã xong hôm nay”, lối tắt khi còn việc quá hạn.
- **Quá hạn**: nhóm theo mức trễ, mỗi dòng có “Dời sang hôm nay” và “Đánh dấu hoàn thành”.
- **Sidebar**: nút “Thêm bảng”, bảng đang mở nổi bật, bộ đếm rõ ràng; mobile tab bar giữ nguyên.

### Task 9: Visual QC + kiểm thử + review + Preview
Ảnh desktop/mobile cho Bảng, Hôm nay, Quá hạn, hộp thoại tạo/sửa (kể cả tiêu đề rất dài); sửa lỗi; chụp lại.
Chạy check/db/integration/E2E desktop+mobile; reviewer độc lập; push; tạo Preview qua PR nháp (không merge).

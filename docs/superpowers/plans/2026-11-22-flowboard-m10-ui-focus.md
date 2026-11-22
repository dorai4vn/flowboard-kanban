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

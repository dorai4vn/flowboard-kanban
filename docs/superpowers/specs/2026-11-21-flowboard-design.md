# FlowBoard — Bản đặc tả thiết kế (Design Spec)

- Ngày: 2026-11-21
- Trạng thái: **Đã duyệt** (người dùng chốt phạm vi MVP ngày 2026-11-21)
- Bối cảnh: Bài tập buổi 8 khóa học AI Agent — xây dựng ứng dụng theo phương pháp Agentic Engineering
  (Brainstorm → Spec → Plan → Code theo plan + TDD → Review → Bàn giao có bằng chứng).

## 1. Mục đích và lý do

FlowBoard là ứng dụng Kanban cá nhân chạy hoàn toàn trên trình duyệt, giúp một người quản lý công việc
theo ba trạng thái *Cần làm → Đang làm → Hoàn thành*, nhìn nhanh việc nào sắp đến hạn và tập trung vào
việc của hôm nay. Ưu tiên: **đơn giản, đẹp, ổn định, có kiểm thử**.

## 2. Mục tiêu / Ngoài phạm vi / Chống mục tiêu

**Mục tiêu (MVP)**
1. Kanban ba cột cố định: *Cần làm*, *Đang làm*, *Hoàn thành*.
2. Tạo, sửa, xóa công việc (card); kéo thả trong cột và giữa các cột (chuột, cảm ứng, bàn phím).
3. Mỗi công việc có: tiêu đề, mô tả (tùy chọn), hạn chót (deadline), độ ưu tiên, nhãn màu.
4. Tìm kiếm theo từ khóa (không phân biệt hoa thường và dấu tiếng Việt) và lọc theo ưu tiên, nhãn, hạn chót.
5. Chế độ tập trung **"Hôm nay"**.
6. Nhiều bảng; mỗi bảng có **màu nhấn riêng** (cá nhân hóa).
7. Dữ liệu lưu trong trình duyệt (localStorage), không backend, không đăng nhập.
8. Giao diện tiếng Việt, dark mode hiện đại tông tím-indigo, responsive (desktop + mobile ≥ 360px).

**Ngoài phạm vi (tạm bỏ)**: WIP limit, cú pháp tạo nhanh, nhập/xuất JSON, checklist, đồng bộ nhiều máy,
cộng tác, backend, đăng nhập, light mode, Pomodoro, thống kê.

**Chống mục tiêu** (coi là thất bại dù “chạy được”):
- Mất dữ liệu người dùng sau khi tải lại trang hoặc khi dữ liệu lưu bị hỏng.
- Kéo thả giật/lỗi, hoặc không dùng được trên điện thoại.
- Giao diện lẫn tiếng Anh với người dùng cuối.
- Kiểm thử “cho có” – test giả lập luồng không tồn tại.

## 3. Ràng buộc

- Repo riêng `dorai4vn/flowboard-kanban`; không đụng tới ContentPilot AI.
- Ứng dụng tĩnh (static SPA), deploy lên **Vercel**.
- Không có secret; không gửi dữ liệu ra ngoài.
- Phát triển trên phiên cloud tạm thời → mọi thay đổi phải commit + push.

## 4. Các hướng tiếp cận đã cân nhắc

| Hướng | Ưu | Nhược | Kết luận |
|---|---|---|---|
| **A. Vite + React + TypeScript + Zustand + dnd-kit** | Hệ sinh thái lớn, dnd-kit hỗ trợ bàn phím/cảm ứng, test dễ với Vitest/RTL | Nhiều phụ thuộc hơn vanilla | **Chọn** |
| B. Vanilla JS + HTML5 Drag & Drop | Không phụ thuộc | HTML5 DnD không chạy trên mobile, không hỗ trợ bàn phím; tự quản lý render dễ lỗi | Loại |
| C. Next.js | Quen thuộc | Thừa cho app không backend; build/SSR không cần | Loại |

Lưu trữ: **localStorage** (dữ liệu nhỏ, API đồng bộ, đơn giản) thay vì IndexedDB (phức tạp không cần thiết).

## 5. Công nghệ (đã chốt)

| Lớp | Lựa chọn |
|---|---|
| Build | Vite, React 19, TypeScript strict |
| Style | Tailwind CSS v4 + CSS variables (design tokens) |
| State | Zustand + middleware `persist` (localStorage) |
| Kiểm tra dữ liệu | zod (khi đọc dữ liệu đã lưu) |
| Kéo thả | @dnd-kit/core + @dnd-kit/sortable |
| Icon | lucide-react |
| Unit/Component test | Vitest + React Testing Library + jsdom |
| E2E | Playwright (Chromium, viewport desktop + mobile) |
| Chất lượng | ESLint + `tsc --noEmit`; script `npm run check` = lint + typecheck + unit test + build |
| Deploy | Vercel (static, output `dist/`) |

## 6. Kiến trúc

```
src/
  domain/        # Hàm thuần, KHÔNG phụ thuộc React — trọng tâm unit test
    types.ts     # Kiểu dữ liệu
    schema.ts    # zod schema cho AppState
    board.ts     # create/rename/delete board, đổi màu
    task.ts      # create/update/delete/move task
    filters.ts   # tìm kiếm, lọc, chế độ Hôm nay
    dates.ts     # tiện ích ngày (theo giờ địa phương)
    text.ts      # chuẩn hóa tiếng Việt (bỏ dấu) cho tìm kiếm
    seed.ts      # dữ liệu mẫu lần đầu
  store/         # Zustand store gọi domain + persist + khôi phục dữ liệu hỏng
  components/    # UI: Header, BoardSwitcher, FilterBar, Column, TaskCard, TaskDialog, ConfirmDialog…
  App.tsx, main.tsx, index.css
tests/e2e/       # Playwright
```

Nguyên tắc: UI chỉ hiển thị và phát sự kiện; mọi biến đổi dữ liệu là hàm thuần trong `domain/`,
store chỉ gọi các hàm này rồi lưu.

## 7. Mô hình dữ liệu (schema version 1)

```ts
type ColumnId = 'todo' | 'doing' | 'done';
type Priority = 'low' | 'medium' | 'high' | 'urgent';
type AccentColor = 'indigo' | 'violet' | 'blue' | 'emerald' | 'amber' | 'rose';
type LabelColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'gray';

interface Label { id: string; name: string; color: LabelColor }

interface Task {
  id: string;
  title: string;             // 1–200 ký tự sau trim
  description: string;       // 0–2000 ký tự
  priority: Priority;        // mặc định 'medium'
  dueDate: string | null;    // 'YYYY-MM-DD' (ngày địa phương) hoặc null
  labelIds: string[];        // tham chiếu Label của bảng
  createdAt: string;         // ISO
  updatedAt: string;         // ISO
  completedAt: string | null;// set khi vào cột 'done', xóa khi rời 'done'
}

interface Board {
  id: string;
  name: string;              // 1–60 ký tự
  accent: AccentColor;       // mặc định 'indigo'
  labels: Label[];           // nhãn của bảng (mặc định: Học tập, Công việc, Cá nhân, Gấp)
  columns: Record<ColumnId, string[]>; // thứ tự task id trong từng cột
  tasks: Record<string, Task>;
  createdAt: string;
}

interface AppState {
  version: 1;
  boards: Record<string, Board>;
  boardOrder: string[];
  activeBoardId: string;
}
```

Bộ lọc (search, priority, label, due, chế độ Hôm nay) là **trạng thái UI tạm thời**, không lưu.

## 8. Quy tắc nghiệp vụ

**Công việc**
- Tạo: tiêu đề bắt buộc (trim, 1–200 ký tự); mặc định thêm vào **cuối** cột *Cần làm* (hoặc cột được
  bấm “+ Thêm”). Tiêu đề rỗng → báo lỗi “Vui lòng nhập tiêu đề”, không lưu.
- Sửa: mọi trường; cập nhật `updatedAt`.
- Xóa: hộp xác nhận “Xóa công việc này?” → xóa khỏi `tasks` và khỏi cột.
- Di chuyển (`moveTask(board, taskId, toColumn, toIndex)`): chèn vào vị trí `toIndex` (kẹp trong
  `[0, len]`); vào `done` → `completedAt = now`; rời `done` → `completedAt = null`; di chuyển trong cùng
  cột không đổi `completedAt`. Task id không tồn tại → trả lại board nguyên vẹn.

**Bảng**
- Tạo (tên 1–60 ký tự), đổi tên, đổi màu nhấn, xóa (có xác nhận). Xóa bảng đang mở → chuyển sang bảng
  đầu tiên còn lại; xóa bảng cuối cùng → tự tạo bảng mới “Bảng của tôi”.
- Nhãn: bảng có 4 nhãn mặc định; người dùng thêm nhãn mới (tên + màu) trong hộp thoại công việc.

**Tìm kiếm và lọc** (kết hợp AND giữa các nhóm)
- Từ khóa: khớp tiêu đề hoặc mô tả, không phân biệt hoa/thường và dấu (“bao cao” khớp “Báo cáo”).
- Ưu tiên: chọn nhiều; nhãn: chọn nhiều (task có ít nhất một nhãn đã chọn).
- Hạn chót: `all` | `overdue` (trước hôm nay, chưa xong) | `today` | `week` (hôm nay → +6 ngày) | `none`.
- Chế độ **Hôm nay**: chỉ hiện task có `dueDate <= hôm nay` và chưa ở cột *Hoàn thành*, **cộng** các task
  đã hoàn thành trong hôm nay (`completedAt` là hôm nay) để thấy tiến độ. Có dòng tóm tắt
  “Hôm nay: X việc cần làm · Y quá hạn · Z đã xong”.
- Khi có lọc, kéo thả vẫn hoạt động trên danh sách đang hiển thị; vị trí chèn được quy đổi về chỉ số
  trong cột đầy đủ (chèn ngay trước task hiển thị đích, hoặc ngay sau task hiển thị cuối).
- Ngày được tính theo **giờ địa phương** của trình duyệt.

**Lưu trữ**
- Key `flowboard:state`. Mọi thay đổi được lưu ngay.
- Lần đầu (chưa có dữ liệu): tạo bảng mẫu “Bảng của tôi” với vài công việc minh họa.
- Dữ liệu hỏng (JSON lỗi hoặc không qua zod): sao chép chuỗi gốc sang `flowboard:backup-<timestamp>`,
  khởi tạo trạng thái mới và hiện thông báo “Dữ liệu cũ bị lỗi, đã sao lưu và tạo bảng mới.”
- localStorage không khả dụng (chế độ riêng tư chặn): app vẫn chạy trong bộ nhớ, hiện cảnh báo.

## 9. Giao diện

- Dark mode mặc định: nền `#0B0D12`, cột `#13161D`, thẻ `#1A1E27`, viền `rgba(255,255,255,0.06)`,
  chữ chính `#E6E8EE`, chữ phụ `#9AA1B2`. Màu nhấn mặc định indigo `#7C83FF`; đổi theo bảng qua CSS var
  `--accent`.
- Font Inter (Google Fonts, fallback system-ui).
- Bố cục desktop:
  ```
  ┌──────────────────────────────────────────────────────────────┐
  │ ◆ FlowBoard  [Bảng của tôi ▾]  🔍 Tìm kiếm…  [Lọc] [☀ Hôm nay] ⚙ │
  ├──────────────────────────────────────────────────────────────┤
  │ Cần làm (3)     │ Đang làm (1)     │ Hoàn thành (2)            │
  │ ┌────────────┐  │ ┌────────────┐   │ ┌────────────┐            │
  │ │▮Cao  #Học  │  │ │ …          │   │ │ ✓ …        │            │
  │ │Nộp bài tập │  │ └────────────┘   │ └────────────┘            │
  │ │📅 21/11    │  │                  │                           │
  │ └────────────┘  │                  │                           │
  │ + Thêm công việc│ + Thêm công việc │ + Thêm công việc          │
  └──────────────────────────────────────────────────────────────┘
  ```
- Thẻ: tiêu đề, chip ưu tiên (màu: Thấp xám, Trung bình xanh, Cao cam, Khẩn đỏ), nhãn màu, hạn chót
  (đỏ nếu quá hạn, vàng nếu hôm nay).
- Hộp thoại công việc (modal) để tạo/sửa: tiêu đề, mô tả, ưu tiên, hạn chót, nhãn, nút Xóa.
- Mobile (< 768px): các cột xếp dọc thành tab chuyển cột (Cần làm | Đang làm | Hoàn thành), mỗi thẻ có
  menu “Chuyển sang…” để đổi cột không cần kéo xa.
- Chuyển động 150–200ms; tôn trọng `prefers-reduced-motion`.
- A11y: mọi nút có nhãn tiếng Việt (`aria-label`), focus ring rõ, kéo thả bằng bàn phím (Space để nhấc,
  mũi tên để di chuyển, Space để thả) với thông báo tiếng Việt cho trình đọc màn hình.

## 10. Kiểm thử và bằng chứng

- **Unit test** (Vitest) cho toàn bộ `src/domain/*` và logic tải/khôi phục dữ liệu của store.
- **Component test** (RTL) cho các luồng UI chính: tạo, sửa, xóa công việc, lọc.
- **E2E** (Playwright) cho luồng quan trọng: tạo → sửa → kéo thả sang cột khác → tải lại vẫn còn;
  tìm kiếm/lọc; chế độ Hôm nay; đổi màu bảng và tạo bảng mới; xóa công việc; giao diện mobile.
- `npm run check` phải xanh trước mỗi commit.
- Bằng chứng nộp bài trong repo: spec (file này), plan (`docs/superpowers/plans/`), báo cáo kiểm thử
  (`docs/test-report.md`), báo cáo review (`docs/review-report.md`).

## 11. Phần để người triển khai tự quyết

Tên component cụ thể, cấu trúc CSS chi tiết, nội dung dữ liệu mẫu, thông điệp phụ — miễn là tuân thủ
spec. Các quyết định do agent tự đưa ra (người dùng có thể sửa):
- Cột cố định, không cho đổi tên cột (đúng yêu cầu “ba cột”).
- Xóa dùng hộp xác nhận thay vì Undo (đơn giản hơn).
- Chỉ dark mode cho MVP.

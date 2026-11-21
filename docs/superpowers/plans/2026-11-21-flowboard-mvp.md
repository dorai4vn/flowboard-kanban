# FlowBoard MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng FlowBoard — ứng dụng Kanban cá nhân 3 cột, chạy trên trình duyệt, lưu localStorage, dark mode tím-indigo, tiếng Việt, deploy Vercel.

**Architecture:** SPA tĩnh Vite + React. Toàn bộ biến đổi dữ liệu là hàm thuần trong `src/domain/` (được unit test). Zustand store gọi domain và persist vào localStorage, có zod để khôi phục dữ liệu hỏng. UI React + Tailwind v4 + dnd-kit chỉ hiển thị và phát sự kiện.

**Tech Stack:** Vite, React 19, TypeScript strict, Tailwind CSS v4 (`@tailwindcss/vite`), Zustand, zod, @dnd-kit/core + @dnd-kit/sortable, lucide-react, Vitest + @testing-library/react + jsdom, @playwright/test 1.63.0 (khớp Chromium cài sẵn), ESLint.

**Spec:** `docs/superpowers/specs/2026-11-21-flowboard-design.md`

## Global Constraints

- Mọi chữ hiển thị cho người dùng bằng **tiếng Việt**; code, tên biến, tên file bằng tiếng Anh.
- Ba cột cố định `todo` | `doing` | `done`, nhãn hiển thị: “Cần làm”, “Đang làm”, “Hoàn thành”.
- Tiêu đề công việc 1–200 ký tự (sau trim); mô tả ≤ 2000; tên bảng 1–60.
- Ưu tiên: `low` Thấp, `medium` Trung bình (mặc định), `high` Cao, `urgent` Khẩn.
- Màu nhấn: `indigo` (mặc định `#7C83FF`), `violet`, `blue`, `emerald`, `amber`, `rose`.
- Màu nhãn: `red | orange | yellow | green | blue | purple | pink | gray`. Nhãn mặc định: Học tập (blue), Công việc (purple), Cá nhân (green), Gấp (red).
- `dueDate` dạng `YYYY-MM-DD` theo **giờ địa phương**; “hôm nay” luôn lấy từ tham số `today` để test được.
- localStorage key `flowboard:state`; backup `flowboard:backup-<timestamp>`.
- Không backend, không secret, không gửi dữ liệu ra ngoài.
- `npm run check` (lint + typecheck + unit test + build) xanh trước mỗi commit.

## Review Focus

1. **Tiêu đề toàn khoảng trắng / quá dài** → không lưu, hiện “Vui lòng nhập tiêu đề” / cắt ở 200 (Task 3 + Task 7).
2. **Kéo thả khi đang lọc** → chỉ số hiển thị phải quy đổi đúng về chỉ số cột đầy đủ, không làm lẫn thứ tự task ẩn (Task 4 `toFullIndex` + test).
3. **localStorage hỏng hoặc bị chặn** → không trắng màn hình; backup + tạo mới / chạy trong bộ nhớ (Task 5).
4. **Ranh giới ngày** (task hạn hôm nay lúc 23:59, tuần = hôm nay..+6, cuối tháng/năm) → tính theo ngày địa phương (Task 2 + Task 4).
5. **Xóa nhãn/bảng còn tham chiếu** → task không giữ `labelIds` mồ côi; xóa bảng cuối tự tạo bảng mới (Task 3).

---

## File Structure

```
index.html, vite.config.ts, tsconfig*.json, eslint.config.js, playwright.config.ts, vercel.json, package.json
src/main.tsx, src/App.tsx, src/index.css
src/domain/{types,ids,dates,text,board,task,filters,schema,seed}.ts   (+ *.test.ts cạnh file)
src/store/{storage,useBoardStore}.ts                                  (+ *.test.ts)
src/components/{Header,BoardMenu,FilterBar,TodaySummary,BoardView,Column,TaskCard,TaskDialog,ConfirmDialog,Toast,labels}.tsx
src/components/*.test.tsx (component test)
src/test/setup.ts
tests/e2e/*.spec.ts
docs/test-report.md, docs/review-report.md, README.md
```

---

### Task 1: Scaffold dự án + pipeline kiểm tra

**Files:** Create các file cấu hình ở trên, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/test/setup.ts`, `src/App.test.tsx`.

**Produces:** scripts `dev`, `build`, `preview`, `lint`, `typecheck`, `test` (vitest run), `test:e2e` (playwright), `check` (= lint && typecheck && test && build).

- [ ] **Step 1:** Khởi tạo Vite React-TS, cài phụ thuộc trong Tech Stack; Tailwind v4 qua `@tailwindcss/vite`, `@import "tailwindcss"` trong `index.css`; `<html lang="vi">`, title “FlowBoard”, font Inter.
- [ ] **Step 2: Test thất bại** `src/App.test.tsx`: `render(<App/>)` → `getByRole('heading', { name: 'FlowBoard' })` tồn tại.
- [ ] **Step 3:** App tối thiểu hiển thị heading “FlowBoard”. Vitest env `jsdom`, setup `@testing-library/jest-dom/vitest`.
- [ ] **Step 4:** `npm run check` → PASS. `vercel.json`: `{ "framework": "vite", "outputDirectory": "dist" }`. Playwright config: `webServer` chạy `npm run build && npm run preview -- --port 4173`, `baseURL` = `process.env.BASE_URL ?? 'http://localhost:4173'`, projects `desktop` (Desktop Chrome) và `mobile` (Pixel 7), `trace: 'off'`.
- [ ] **Step 5:** Commit `chore: scaffold FlowBoard (Vite, React, Tailwind, Vitest, Playwright)`.

### Task 2: Domain cơ bản — types, ids, dates, text

**Files:** `src/domain/types.ts`, `ids.ts`, `dates.ts`, `text.ts` + `dates.test.ts`, `text.test.ts`.

**Produces:**
- Types đúng spec §7 (`ColumnId`, `Priority`, `AccentColor`, `LabelColor`, `Label`, `Task`, `Board`, `AppState`) và hằng `COLUMN_IDS`, `COLUMN_TITLES`, `PRIORITIES`, `PRIORITY_LABELS`, `ACCENTS`, `LABEL_COLORS`.
- `newId(): string` (dùng `crypto.randomUUID`).
- `toLocalDateKey(d: Date): string` → `YYYY-MM-DD` theo giờ địa phương.
- `addDays(key: string, n: number): string`; `compareDateKeys(a, b): number`.
- `formatDueDate(key: string): string` → `dd/MM` (ví dụ `21/11`).
- `normalizeText(s: string): string` → lowercase, bỏ dấu (NFD + bỏ combining marks, `đ→d`), trim.

- [ ] **Step 1: Test thất bại:**
  - `toLocalDateKey(new Date(2026, 10, 21, 23, 59))` === `'2026-11-21'`.
  - `addDays('2026-12-30', 3)` === `'2027-01-02'`; `addDays('2026-02-28', 1)` === `'2026-03-01'`.
  - `formatDueDate('2026-11-05')` === `'05/11'`.
  - `normalizeText('  Báo Cáo Đồ Án ')` === `'bao cao do an'`.
- [ ] **Step 2:** `npx vitest run src/domain` → FAIL.
- [ ] **Step 3:** Cài đặt. `addDays` dựng `new Date(y, m-1, d + n)` (không dùng UTC).
- [ ] **Step 4:** Test PASS. **Step 5:** Commit `feat(domain): types, dates, text helpers`.

### Task 3: Domain — bảng và công việc

**Files:** `src/domain/board.ts`, `task.ts` + `board.test.ts`, `task.test.ts`.

**Consumes:** Task 2. **Produces:**
- `type Result<T> = { ok: true; value: T } | { ok: false; error: string }` (trong `types.ts`).
- `createBoard(name: string, now: string): Result<Board>` — 4 nhãn mặc định, accent `indigo`, cột rỗng.
- `renameBoard(b: Board, name: string): Result<Board>`; `setAccent(b: Board, accent: AccentColor): Board`.
- `addLabel(b: Board, name: string, color: LabelColor): Result<{ board: Board; label: Label }>`; `removeLabel(b: Board, labelId: string): Board` (gỡ khỏi mọi task).
- `type TaskInput = { title: string; description?: string; priority?: Priority; dueDate?: string | null; labelIds?: string[] }`.
- `createTask(b: Board, input: TaskInput, column: ColumnId, now: string): Result<{ board: Board; task: Task }>` — thêm cuối cột; nếu `column === 'done'` set `completedAt = now`.
- `updateTask(b: Board, id: string, patch: Partial<TaskInput>, now: string): Result<Board>`.
- `deleteTask(b: Board, id: string): Board`.
- `findColumn(b: Board, id: string): ColumnId | null`.
- `moveTask(b: Board, id: string, to: ColumnId, toIndex: number, now: string): Board`.
- Lỗi (copy cố định): `'Vui lòng nhập tiêu đề'`, `'Tiêu đề tối đa 200 ký tự'`, `'Mô tả tối đa 2000 ký tự'`, `'Vui lòng nhập tên bảng'`, `'Tên bảng tối đa 60 ký tự'`, `'Vui lòng nhập tên nhãn'`.

- [ ] **Step 1: Test thất bại** (now = `'2026-11-21T08:00:00.000Z'`):
  - `createTask(b, { title: '   ' }, 'todo', now)` → `{ ok: false, error: 'Vui lòng nhập tiêu đề' }`; tiêu đề 201 ký tự → lỗi 200.
  - Tạo `'  Nộp bài  '` → title `'Nộp bài'`, priority `'medium'`, nằm cuối `columns.todo`, `completedAt` null.
  - `moveTask` todo→done index 0 → đứng đầu `done`, `completedAt === now`; done→doing → `completedAt === null`; trong cùng cột đổi thứ tự `[a,b,c]` move `a` tới 2 → `[b,c,a]` (index tính trên mảng sau khi gỡ); `toIndex` 99 kẹp về cuối, -1 về 0; id không tồn tại → board giữ nguyên (`toBe` cùng tham chiếu).
  - `deleteTask` gỡ khỏi `tasks` và cột.
  - `removeLabel` gỡ labelId khỏi mọi task.
  - `updateTask` đổi `updatedAt`, tiêu đề rỗng → lỗi; `labelIds` lạ (không thuộc bảng) bị lọc bỏ.
  - Hàm không mutate input (so sánh `structuredClone` trước/sau).
- [ ] **Step 2:** FAIL. **Step 3:** Cài đặt bất biến (immutable). **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(domain): board and task operations`.

### Task 4: Domain — tìm kiếm, lọc, Hôm nay

**Files:** `src/domain/filters.ts` + `filters.test.ts`.

**Produces:**
- `type DueFilter = 'all' | 'overdue' | 'today' | 'week' | 'none'`.
- `type TaskFilter = { query: string; priorities: Priority[]; labelIds: string[]; due: DueFilter; todayMode: boolean }`; `EMPTY_FILTER`.
- `isFilterActive(f: TaskFilter): boolean`.
- `matchesFilter(task: Task, column: ColumnId, f: TaskFilter, today: string): boolean`.
- `visibleColumn(b: Board, column: ColumnId, f: TaskFilter, today: string): Task[]` — giữ thứ tự cột.
- `todaySummary(b: Board, today: string): { pending: number; overdue: number; doneToday: number }`.
- `toFullIndex(full: string[], visible: string[], visibleIndex: number, movingId: string): number` — quy đổi vị trí thả trên danh sách đã lọc sang chỉ số trong mảng cột đầy đủ **sau khi đã gỡ `movingId`**.
- `isOverdue(task, column, today)`, `isDueToday(task, today)` dùng cho TaskCard.

- [ ] **Step 1: Test thất bại** (today = `'2026-11-21'`):
  - query `'bao cao'` khớp title `'Báo cáo tuần'` và description `'viết BÁO CÁO'`; không khớp `'Bài tập'`.
  - priorities `['high','urgent']` chỉ giữ task cao/khẩn; labelIds `[L1]` giữ task có L1.
  - due `overdue`: hạn `2026-11-20` ở todo → có; ở done → không. `week`: `2026-11-27` có, `2026-11-28` không. `none`: chỉ task `dueDate === null`.
  - todayMode: todo hạn `2026-11-21` có; todo hạn `2026-11-22` không; done có `completedAt` hôm nay (giờ địa phương) có; done hạn hôm qua hoàn thành hôm qua không.
  - Kết hợp AND query + priority.
  - `todaySummary` đếm đúng cho bộ dữ liệu trên.
  - `toFullIndex(['a','x','b','y','c'], ['a','b','c'], 1, 'z')` === 2 (chèn trước `b`); visibleIndex = visible.length → sau `c` (=5); `movingId` nằm trong `full` được loại trước khi tính.
- [ ] **Step 2–4:** FAIL → cài đặt → PASS.
- [ ] **Step 5:** Commit `feat(domain): search, filters and today mode`.

### Task 5: Schema, dữ liệu mẫu, store + lưu trữ

**Files:** `src/domain/schema.ts`, `seed.ts`, `src/store/storage.ts`, `src/store/useBoardStore.ts` + `storage.test.ts`, `useBoardStore.test.ts`.

**Produces:**
- `appStateSchema` (zod) khớp §7; `STORAGE_KEY = 'flowboard:state'`.
- `createSeedState(now: Date): AppState` — bảng “Bảng của tôi” với 5 công việc minh họa trải 3 cột (có hạn hôm nay, quá hạn, nhãn).
- `loadState(storage: Storage | null, now: Date): { state: AppState; notice: string | null }`:
  - không có dữ liệu → seed, notice null;
  - JSON lỗi / zod lỗi → ghi bản gốc vào `flowboard:backup-<now.getTime()>`, trả seed, notice `'Dữ liệu cũ bị lỗi, đã sao lưu và tạo bảng mới.'`;
  - storage null hoặc ném lỗi → seed, notice `'Trình duyệt chặn lưu trữ, dữ liệu sẽ mất khi đóng trang.'`;
  - `activeBoardId` không tồn tại → bảng đầu tiên.
- `saveState(storage: Storage | null, state: AppState): void` — nuốt lỗi quota.
- Store Zustand `useBoardStore` với state `{ app: AppState; notice: string | null; filter: TaskFilter }` và actions trả `string | null` (thông báo lỗi) khi có validation: `createBoard(name)`, `renameBoard(id, name)`, `deleteBoard(id)`, `setActiveBoard(id)`, `setAccent(id, accent)`, `addLabel(name, color)`, `createTask(input, column)`, `updateTask(id, patch)`, `deleteTask(id)`, `moveTask(id, to, toIndex)`, `setFilter(patch)`, `resetFilter()`, `dismissNotice()`. Mỗi thay đổi `app` gọi `saveState`. `deleteBoard` bảng cuối → tạo “Bảng của tôi”. Đổi bảng → reset filter.
- Factory `createBoardStore(storage: Storage | null, now: () => Date)` để test; `useBoardStore` = factory với `window.localStorage`.

- [ ] **Step 1: Test thất bại** (dùng `Storage` giả trong memory):
  - Storage rỗng → seed có 1 bảng, 3 cột, `version: 1`.
  - `'{bad json'` → notice đúng chuỗi, key backup chứa chuỗi gốc.
  - JSON hợp lệ nhưng sai schema (`{version: 2}`) → như trên.
  - Storage ném lỗi trên `getItem` → notice chặn lưu trữ, app vẫn có state.
  - Store: `createTask` rồi tạo store mới từ cùng storage → task còn đó (persist).
  - `deleteBoard` bảng duy nhất → vẫn còn 1 bảng tên “Bảng của tôi”.
  - `createTask({title:''})` trả `'Vui lòng nhập tiêu đề'`, state không đổi.
- [ ] **Step 2–4:** FAIL → cài đặt (persist thủ công qua `subscribe`, không dùng middleware nếu cần kiểm soát backup) → PASS.
- [ ] **Step 5:** Commit `feat(store): persisted board store with corruption recovery`.

### Task 6: Giao diện bảng, header, quản lý bảng, màu nhấn

**Files:** `src/index.css` (tokens), `App.tsx`, `components/Header.tsx`, `BoardMenu.tsx`, `BoardView.tsx`, `Column.tsx`, `TaskCard.tsx`, `ConfirmDialog.tsx`, `Toast.tsx`, `labels.tsx` (map màu) + `BoardView.test.tsx`.

**Consumes:** store Task 5, filters Task 4.

- Tokens CSS đúng spec §9; chuyển động 150–200ms, tắt khi `prefers-reduced-motion: reduce`; focus ring dùng `--accent`; `--accent` set trên phần tử gốc theo `board.accent` (attribute `data-accent`).
- Header: logo “FlowBoard” (h1), BoardMenu (chọn/tạo/đổi tên/xóa bảng, 6 ô màu nhấn với `aria-label` “Màu Indigo”…), slot FilterBar (Task 8).
- Column: tiêu đề + số lượng, nút “+ Thêm công việc” (`aria-label="Thêm công việc vào cột Cần làm"`), trạng thái trống “Chưa có công việc”.
- TaskCard: tiêu đề, chip ưu tiên, nhãn, hạn (`formatDueDate`, class quá hạn/hôm nay), click hoặc Enter mở dialog.
- Toast hiển thị `notice` với nút “Đóng”.

- [ ] **Step 1: Test thất bại:** render App với store seed → thấy 3 heading cột “Cần làm”, “Đang làm”, “Hoàn thành”; chọn màu “Màu Ngọc lục bảo” → root có `data-accent="emerald"`; tạo bảng “Đồ án” → được chọn và hiển thị.
- [ ] **Step 2–4:** FAIL → cài đặt → PASS; `npm run check` xanh.
- [ ] **Step 5:** Commit `feat(ui): board layout, board menu and accent colors`.

### Task 7: Hộp thoại tạo/sửa/xóa công việc

**Files:** `components/TaskDialog.tsx` + `TaskDialog.test.tsx`.

- Modal (`role="dialog"`, tiêu đề “Công việc mới” / “Sửa công việc”), trường: Tiêu đề, Mô tả, Ưu tiên (select), Hạn chót (`input type=date`), Nhãn (toggle chip + tạo nhãn mới: tên + màu). Nút “Lưu”, “Hủy”, “Xóa” (chỉ khi sửa → ConfirmDialog “Xóa công việc này?” với “Xóa” / “Hủy”). Esc đóng; focus vào ô Tiêu đề khi mở.
- Lỗi từ store hiển thị dưới ô Tiêu đề (`role="alert"`).

- [ ] **Step 1: Test thất bại:** mở “+ Thêm công việc” cột Cần làm, gõ “Nộp bài tập”, chọn Cao, hạn `2026-11-21`, nhãn Học tập, Lưu → thẻ xuất hiện trong cột Cần làm với chip “Cao”; Lưu với tiêu đề “   ” → alert “Vui lòng nhập tiêu đề”, dialog còn mở; sửa tiêu đề → thẻ đổi; Xóa + xác nhận → thẻ biến mất.
- [ ] **Step 2–4:** FAIL → cài đặt → PASS. **Step 5:** Commit `feat(ui): task create/edit/delete dialog`.

### Task 8: Kéo thả, giao diện mobile, Tìm kiếm/Lọc, Hôm nay

**Files:** `BoardView.tsx`, `Column.tsx`, `TaskCard.tsx`, `components/FilterBar.tsx`, `TodaySummary.tsx` + `FilterBar.test.tsx`.

- dnd-kit: `DndContext` với `PointerSensor` (activation distance 5px), `TouchSensor` (delay 150ms), `KeyboardSensor` + `sortableKeyboardCoordinates`; mỗi cột `SortableContext` + droppable (để thả vào cột rỗng); `DragOverlay`; `onDragEnd` → `toFullIndex` → `store.moveTask`. Announcements tiếng Việt (“Đã nhấc công việc …”, “Đã thả vào cột …”).
- TaskCard có menu “Chuyển sang…” (`aria-label="Chuyển công việc"`) liệt kê 2 cột còn lại → moveTask tới cuối cột.
- Mobile < 768px: tablist “Cần làm | Đang làm | Hoàn thành” (`role="tab"`), chỉ hiện cột đang chọn; desktop hiện 3 cột.
- FilterBar: ô tìm kiếm (`placeholder="Tìm công việc…"`, phím `/` focus), nút “Lọc” mở panel: ưu tiên (checkbox), nhãn (checkbox), hạn chót (radio: Tất cả, Quá hạn, Hôm nay, 7 ngày tới, Không có hạn), “Xóa bộ lọc”. Nút toggle “Hôm nay” (`aria-pressed`). Khi todayMode bật hiện TodaySummary “Hôm nay: X việc cần làm · Y quá hạn · Z đã xong”.
- Khi lọc không còn kết quả: “Không tìm thấy công việc phù hợp”.

- [ ] **Step 1: Test thất bại (RTL):** gõ “bao cao” → chỉ thẻ “Báo cáo…” còn; bật Hôm nay → chỉ thẻ hạn ≤ hôm nay + đã xong hôm nay, summary đúng; “Chuyển sang Đang làm” → thẻ nằm trong cột Đang làm.
- [ ] **Step 2–4:** FAIL → cài đặt → PASS (kéo thả chuột được kiểm bằng E2E ở Task 9).
- [ ] **Step 5:** Commit `feat(ui): drag and drop, mobile tabs, search, filters and today mode`.

### Task 9: E2E Playwright cho luồng quan trọng

**Files:** `tests/e2e/flows.spec.ts`, `tests/e2e/mobile.spec.ts`. Mỗi test bắt đầu bằng `localStorage.clear()` qua `page.addInitScript` chỉ ở lần nạp đầu (dùng cờ `sessionStorage`) để test reload vẫn giữ dữ liệu.

- [ ] **Step 1:** Viết test (project desktop):
  1. Tạo công việc “E2E nộp bài” (ưu tiên Khẩn, nhãn Gấp) → hiển thị trong Cần làm → sửa tiêu đề “E2E nộp bài (sửa)” → **kéo bằng chuột** sang Hoàn thành → `page.reload()` → vẫn ở Hoàn thành.
  2. Kéo bằng bàn phím (focus thẻ, Space, ArrowRight, Space) sang Đang làm.
  3. Tìm “e2e” không dấu khớp; lọc ưu tiên Khẩn; Xóa bộ lọc.
  4. Bật Hôm nay → summary hiện; thẻ không hạn bị ẩn.
  5. Tạo bảng “Đồ án”, đổi màu Hồng → `data-accent="rose"`; reload → còn bảng và màu.
  6. Xóa công việc có xác nhận → biến mất sau reload.
  7. Dữ liệu hỏng: set `flowboard:state = '{bad'` → reload → thấy toast “Dữ liệu cũ bị lỗi…”.
- [ ] **Step 2 (mobile project, Pixel 7):** tab cột hoạt động; “Chuyển sang…” chuyển thẻ; không có cuộn ngang (`scrollWidth <= clientWidth`).
- [ ] **Step 3:** `npx playwright test --trace off` → tất cả PASS (sửa code nếu fail, dùng superpowers:systematic-debugging).
- [ ] **Step 4:** Commit `test(e2e): critical user flows on desktop and mobile`.

### Task 10: Review, sửa lỗi, tài liệu bàn giao

**Files:** `docs/review-report.md`, `docs/test-report.md`, `README.md`.

- [ ] **Step 1:** Review toàn nhánh (superpowers:requesting-code-review) theo spec + Review Focus; ghi phát hiện và cách xử lý vào `docs/review-report.md`.
- [ ] **Step 2:** Sửa các lỗi được xác nhận, mỗi lỗi kèm test tái hiện.
- [ ] **Step 3:** Chạy `npm run check` và `npm run test:e2e`; ghi kết quả thật (số test, thời gian, môi trường, ảnh chụp màn hình desktop/mobile trong `docs/screenshots/`) vào `docs/test-report.md`.
- [ ] **Step 4:** README tiếng Việt: giới thiệu, tính năng, cách chạy, cách test, hướng dẫn deploy Vercel, liên kết spec/plan/báo cáo.
- [ ] **Step 5:** Commit `docs: review report, test report and README`; push nhánh. Deploy Vercel khi người dùng kết nối repo với Vercel; chỉ ghi “đã deploy” sau khi chạy E2E với `BASE_URL` trỏ URL thật.

# FlowBoard M9 (Supabase + Google Login) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay localStorage bằng Supabase Postgres + Google OAuth, dữ liệu cô lập theo user bằng RLS, giữ nguyên tính năng Buổi 8.

**Architecture:** Store Zustand phát *mutation* cụ thể → `applyMutation` (thuần) cập nhật UI lạc quan → hàng đợi ghi tuần tự qua `BoardRepository`; lỗi → trở về state đã xác nhận. `epoch` + `AbortController` cô lập phiên khi đổi user.

**Tech Stack:** Vite, React 19, TS, Zustand, zod, dnd-kit, `@supabase/supabase-js` v2, Supabase CLI v2 (local Docker, pgTAP), Vitest, Playwright 1.63.0.

**Spec:** `docs/superpowers/specs/2026-11-22-flowboard-m9-supabase-design.md`

## Global Constraints

- Không sửa `main`, không PR, không deploy. Chỉ push `claude/m9-supabase`.
- Không `service_role`/`sb_secret_`/Google secret trong `src/`, Git, log. `.env*` ignore trừ `.env.example`.
- Chữ hiển thị tiếng Việt; giữ nguyên giao diện và copy Buổi 8.
- Supabase Local: `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io npx supabase start -x studio,imgproxy,storage-api,edge-runtime,logflare,vector,realtime,postgres-meta,supavisor,mailpit` (cần `dockerd`).
- Thông báo cố định: lưu lỗi `'Không lưu được thay đổi, đã hoàn tác.'`; offline banner `'Mất kết nối – đang ở chế độ chỉ đọc.'`, action khi offline trả `'Đang offline, không thể chỉnh sửa.'`; tải lỗi `'Không tải được dữ liệu.'` + nút “Thử lại”.

## Review Focus

1. Kết quả request của user cũ về sau khi đã đổi user → không được ghi vào store (Task 4 test `ignores stale results after switchUser`).
2. Kéo thả liên tiếp nhanh khi mạng chậm, một lần giữa chừng lỗi → UI về đúng state đã xác nhận, các lần sau bị hủy (Task 4).
3. `move_task` với `p_ordered_ids` chứa id của user khác hoặc bảng khác → lỗi, không đổi gì (Task 2 pgTAP).
4. Chèn task/nhãn với `board_id` của user khác → bị khóa ngoại kép chặn (Task 2).
5. Đăng nhập lần đầu tải lại nhiều lần → chỉ một bảng mẫu (Task 2 `create_board p_only_if_empty`).

---

### Task 1: Supabase Local + cấu hình

**Files:** `supabase/config.toml`, `.env.example`, `.gitignore`, `package.json` scripts `db:start`, `db:stop`, `db:reset`, `test:db`, `test:integration`.
- [ ] `supabase init`; `project_id = "flowboard-kanban"`; `site_url = "http://localhost:5173"`, `additional_redirect_urls = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173"]`; `[auth.email] enable_signup = true, enable_confirmations = false` (chỉ local); `[auth.external.google] enabled = true`, `client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"`, `secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"`, `skip_nonce_check = false`.
- [ ] Verify: `npx supabase start …` chạy, `git status` không có `.env.local`/`supabase/.temp`.
- [ ] Commit `chore(db): supabase local project`.

### Task 2: Migration + RLS + RPC + pgTAP (TDD)

**Files:** `supabase/migrations/20261122000000_init.sql`, `supabase/tests/rls.test.sql`, `supabase/tests/rpc.test.sql`, `src/types/database.ts` (từ `supabase gen types typescript --local`).

**Produces:** bảng/RPC đúng Spec §6.
- [ ] **RED:** pgTAP (`supabase/tests/*.sql`) với 2 user tạo trong `auth.users`, giả lập bằng `set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}'`:
  - anon: `select count(*)` = 0 hoặc permission denied trên cả 4 bảng; không execute được RPC.
  - B không select/update/delete được dữ liệu A (0 dòng); B insert task với `board_id` của A → lỗi FK/RLS; B insert với `user_id` = A → lỗi RLS.
  - `save_task` của B với id task của A → không sửa task A (lỗi); `move_task` của B lên task A → lỗi; `move_task` của A với `p_ordered_ids` lẫn id bảng khác → lỗi.
  - `create_board(..., p_only_if_empty => true)` gọi 2 lần → 1 bảng.
  - CHECK: title `'   '` → lỗi; priority `'x'` → lỗi.
- [ ] `npx supabase test db` → FAIL (chưa có bảng). Viết migration → PASS. Sinh `src/types/database.ts`.
- [ ] Commit `feat(db): schema, RLS, RPC with pgTAP tests`.

### Task 3: Mutation + mapper (thuần)

**Files:** `src/data/mutations.ts`, `src/data/mappers.ts` + tests.

**Produces:**
- `type Mutation = | {type:'createBoard'; board: Board} | {type:'renameBoard'; boardId; name} | {type:'setAccent'; boardId; accent} | {type:'deleteBoard'; boardId} | {type:'addLabel'; boardId; label: Label} | {type:'createTask'; boardId; task: Task; column: ColumnId} | {type:'updateTask'; boardId; task: Task} | {type:'deleteTask'; boardId; taskId} | {type:'moveTask'; boardId; taskId; to: ColumnId; orderedIds: string[]; completedAt: string|null; updatedAt: string}`.
- `type BoardsState = { boards: Record<string, Board>; boardOrder: string[] }`.
- `applyMutation(s: BoardsState, m: Mutation): BoardsState` (thuần; deleteBoard cập nhật boardOrder).
- `rowsToState(rows: {boards, labels, tasks, taskLabels}): BoardsState` (sắp theo `position`, rồi `created_at`), `taskToRow(task, boardId, column)`, `boardToRpc(board)`.
- [ ] Test: mỗi mutation áp đúng; `moveTask` đặt đúng `orderedIds` cho cột đích và gỡ khỏi cột nguồn; `rowsToState` sắp đúng thứ tự, ghép nhãn; round-trip `createSeedState` → rpc payload → rows → state bằng nhau.
- [ ] Commit `feat(data): mutations and row mappers`.

### Task 4: Store bất đồng bộ (TDD — trọng tâm)

**Files:** `src/data/repository.ts` (interface), `src/data/fakeRepository.ts` (chỉ test), `src/store/useBoardStore.ts` (viết lại), tests.

**Interfaces:**
- `interface BoardRepository { load(signal: AbortSignal): Promise<BoardsState>; ensureStarter(seed: Board, signal: AbortSignal): Promise<void>; persist(m: Mutation, signal: AbortSignal): Promise<void> }`.
- Store state thêm: `status: 'signedOut' | 'loading' | 'ready' | 'error'`, `userId: string | null`, `online: boolean`, `saving: boolean`; actions mới `switchUser(userId: string | null): Promise<void>`, `reload()`, `setOnline(v)`. Action cũ giữ chữ ký (trả `string | null`).
- `createBoardStore({ repo, now, initialOnline })`.

- [ ] **RED** (FakeRepository với promise điều khiển được):
  - `switchUser('A')` → loading → ready với dữ liệu A; repo rỗng → gọi `ensureStarter` rồi load lại.
  - `ignores stale results after switchUser`: load A treo, `switchUser('B')` → state rỗng ngay, khi load A resolve không ghi vào store; signal của A đã `aborted`.
  - `switchUser(null)` xóa boards/filter/notice và hàng đợi; persist đang chờ của A khi resolve không làm gì.
  - Ba `moveTask` liên tiếp với repo chậm → UI cập nhật ngay cả 3, repo nhận đúng thứ tự tuần tự (không chồng chéo).
  - Lần 2 trong 3 lỗi → state = sau lần 1, lần 3 không được gửi, `notice = 'Không lưu được thay đổi, đã hoàn tác.'`.
  - Offline: action trả `'Đang offline, không thể chỉnh sửa.'`, không gọi repo.
  - Load lỗi → `status = 'error'`; `reload()` thành công → ready.
  - Validation lỗi (tiêu đề rỗng) → không gọi repo.
- [ ] GREEN, rồi xóa `src/store/storage.ts`, `memoryStorage.ts` và test của chúng (localStorage cũ không còn được đọc/ghi — dữ liệu cũ để nguyên). Commit `feat(store): async store with write queue, rollback and session isolation`.

### Task 5: SupabaseRepository + integration test

**Files:** `src/lib/supabase.ts`, `src/data/supabaseRepository.ts`, `tests/integration/*.test.ts`, `vitest.integration.config.ts`, `tests/support/localSupabase.ts`.
- `createSupabaseClient(url, key)` với `auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, storageKey: 'flowboard-auth' }`. `getSupabase()` đọc `import.meta.env.VITE_SUPABASE_URL/…PUBLISHABLE_KEY`; thiếu → lỗi cấu hình rõ ràng.
- Mọi query `.abortSignal(signal)`; lỗi → `throw new RepositoryError()` (không chứa thông tin DB).
- `tests/support/localSupabase.ts`: đọc URL/keys bằng `npx supabase status -o json` lúc chạy (không ghi file), tạo user test qua admin API.
- [ ] **RED** integration: A tạo bảng mẫu (2 lần → 1 bảng), CRUD task, move, label; B `load()` không thấy gì của A; B `persist(updateTask của A)` → lỗi và task A không đổi; B `persist(deleteTask A)` → task A còn.
- [ ] Commit `feat(data): Supabase repository with integration tests`.

### Task 6: Auth UI

**Files:** `src/auth/AuthGate.tsx`, `src/auth/authClient.ts` (interface `AuthClient { getSession(); onChange(cb); signInWithGoogle(); signOut() }` + bản Supabase), `src/components/LoginScreen.tsx`, `UserMenu` trong `Header.tsx`, `App.tsx`, `main.tsx`.
- [ ] **RED** (AuthClient giả trong test): chưa đăng nhập → “Đăng nhập bằng Google”, bấm → `signInWithGoogle` được gọi; có session → `switchUser(id)` và hiện bảng; sự kiện đổi user → dữ liệu cũ biến mất trước khi dữ liệu mới về; “Đăng xuất” → `signOut` + về màn hình đăng nhập; đang kiểm tra session → màn hình chờ; `status='error'` → “Không tải được dữ liệu.” + “Thử lại”.
- [ ] Commit `feat(auth): Google login gate, user menu and sign out`.

### Task 7: Offline read-only

**Files:** `src/components/OfflineBanner.tsx`, `BoardView`/`Column`/`TaskCard` nhận `readOnly`.
- [ ] **RED:** `setOnline(false)` → banner, nút “Thêm công việc” disabled, thẻ không kéo được, mở dialog bấm Lưu → lỗi offline; online lại → banner mất.
- [ ] Commit `feat(ui): offline read-only mode`.

### Task 8: Chuyển test Buổi 8 + E2E

**Files:** `src/test/renderApp.tsx` (FakeRepository seed + AuthClient giả), test component cũ (`findBy` sau khi load), `tests/e2e/*`, `tests/e2e/global-setup.ts`, `playwright.config.ts` (webServer dev với env local).
- E2E đăng nhập: global setup tạo user A/B bằng admin API local; test đăng nhập bằng supabase-js (password) và ghi session vào `localStorage['flowboard-auth']` qua `addInitScript`.
- [ ] Mọi test Buổi 8 PASS lại (đổi chỗ “Dữ liệu cũ bị lỗi” → test lỗi tải).
- [ ] E2E mới: đổi tài khoản không thấy dữ liệu cũ; reload vẫn còn; mạng chậm (route delay 800ms) kéo 3 lần liên tiếp → kết quả đúng sau reload; route trả 500 cho RPC → thẻ quay lại + thông báo hoàn tác; offline (`context.setOffline(true)`) → banner + không sửa được; chưa đăng nhập → màn hình đăng nhập.
- [ ] Commit `test: migrate unit tests and E2E to Supabase-backed app`.

### Task 9: Review + security review + báo cáo

- [ ] Reviewer độc lập toàn nhánh + security review (secrets, RLS, redirect, log). Sửa Critical/Important bằng TDD.
- [ ] `scripts/check-secrets.sh`: không có `service_role|sb_secret_|SERVICE_ROLE` trong `src/`, `dist/`, file đã track.
- [ ] `docs/m9-test-report.md`, `docs/m9-review-report.md`, `docs/m9-setup-guide.md` (Supabase Dashboard, Google Cloud, checklist 2 tài khoản), cập nhật README.
- [ ] Push `claude/m9-supabase`. Không PR.

# FlowBoard M11 — Trợ lý AI (AI Workspace Assistant) · Product & Technical Spec

- Ngày: 2026-11-23 · Nhánh `claude/m11-ai-agent` (từ `main` `7630d87`, M10 đã merge) · Trạng thái: chờ duyệt PR (Draft)
- Mục tiêu: trợ lý AI trong FlowBoard thao tác **thật** trên dữ liệu Kanban của chính người dùng đăng nhập bằng tiếng Việt tự nhiên;
  xóa luôn cần người dùng phê duyệt và được **backend** cưỡng chế.

## 1. Nguồn kiểm chứng (không dựa vào trí nhớ)
Trang tài liệu `openai.github.io` và `vercel.com` không truy cập được từ phiên (DNS bị chặn). API được kiểm chứng từ gói chính thức:
- `@openai/agents` **0.22.0** (`.d.ts`): `tool({ parameters: z.object, needsApproval, execute })`, `Runner({ tracingDisabled })`,
  `run(agent, input, { maxTurns, context, signal })`, `result.interruptions` (`RunToolApprovalItem.name/arguments`),
  `RunState.toString()` / `RunState.fromString(agent, s)` / `state.approve()|reject()`, interface `Model`, lỗi `MaxTurnsExceededError`.
  Đã **chạy thật** với `gpt-5.4-mini`: tool `needsApproval` → run dừng với interruption, không thực thi; khôi phục RunState + approve → mới thực thi.
- `@vercel/node` **32.0.0** (mã runtime): file trong `api/` export `POST(request: Request)` (Web handler) được hỗ trợ; `export const config = { maxDuration }`;
  TypeScript được biên dịch **từng file** (không bundle) + `@vercel/nft` → với `"type": "module"` mọi import tương đối trên đường server phải có đuôi `.js`.

## 2. Kiến trúc
```
Trình duyệt (React, M10 giữ nguyên)                    Vercel Function (Node, server-only)
 AssistantPanel ──POST /api/agent/chat────────────────▶ handleChat
   Bearer <Supabase access token>                         ├─ xác thực token (supabase.auth.getUser) → user_id
                                                          ├─ giới hạn: độ dài, lịch sử, 30 yêu cầu/10 phút/người
 ApprovalCard ──POST /api/agent/approval─────────────▶   ├─ Agent (OpenAI Agents SDK, gpt-5.4-mini, maxTurns 8, timeout)
                                                          │    tools → WorkspaceService (domain M8–M10 + SupabaseRepository)
                                                          │    Supabase client với JWT người dùng ⇒ RLS áp dụng, KHÔNG service-role
                                                          └─ delete_* (needsApproval) → agent_approvals (Postgres, RPC)
```
- Không SQL tự do: tool chỉ gọi các hàm domain/repository có sẵn (đã có RLS + khóa ngoại kép + RPC `security invoker`).
- `OPENAI_API_KEY` chỉ ở server (`process.env`), không có `VITE_`. Tracing của SDK tắt (`tracingDisabled`) để dữ liệu không rời khỏi luồng yêu cầu.
- Vite dev/E2E: plugin middleware chuyển `/api/agent/*` tới cùng handler (không ảnh hưởng build/Production).

## 3. Tool của Agent (zod, strict)
| Nhóm | Tool | Ghi chú |
|---|---|---|
| Đọc | `list_boards`, `get_board`, `search_tasks`, `get_focus` (today/overdue) | trả id để thao tác tiếp; dùng `focusTasks`/`boardStats` của M10 |
| Tạo | `create_board`, `create_task` | validate bằng domain (`createBoard`/`createTask`) |
| Sửa | `update_task` (tiêu đề, mô tả, ưu tiên, hạn), `move_task` (cột/hoàn thành) | `updateTask` / `planMove` |
| Xóa | `delete_task`, `delete_board` | `needsApproval: true` + cưỡng chế ở DB (mục 4) |
Không tool nào khác có khả năng xóa. Kết quả mutation chỉ được báo khi repository xác nhận thành công.

## 4. Phê duyệt (Human-in-the-loop) — cưỡng chế ở backend
1. Run bị SDK ngắt ở `delete_*` → server validate tham số → RPC `agent_create_approval(action, target)` (SECURITY DEFINER, kiểm `auth.uid()`
   sở hữu mục tiêu) tạo bản ghi `pending` với nhãn mục tiêu, hệ quả (số việc của bảng), `expires_at = now()+10 phút`,
   kèm RunState đã serialize + HMAC (khóa dẫn xuất từ secret server) để chỉ server tạo/khôi phục được.
2. UI hiện thẻ xác nhận (mục tiêu chính xác, hệ quả, thời hạn). Người dùng bấm Xóa/Hủy → `POST /api/agent/approval {approvalId, action, targetId, decision}`.
3. Duyệt: RPC `agent_claim_approval` một câu `UPDATE … WHERE status='pending' AND user_id=auth.uid() AND expires_at>now() AND action/target khớp RETURNING`
   ⇒ chỉ **một** yêu cầu đồng thời thắng; người khác/hết hạn/đã dùng/sai tham số ⇒ mã lỗi. Server kiểm HMAC, khôi phục RunState,
   đối chiếu interruption = đúng action/target, `approve`, chạy tiếp. Tool `delete_*` chỉ thực thi khi context có claim hợp lệ và gọi
   RPC `agent_execute_approval(id, claim, action, target)` (INVOKER: tiêu thụ claim qua hàm DEFINER rồi `DELETE` dưới RLS trong **một transaction**).
4. Bảng `agent_approvals`: người dùng chỉ `SELECT` bản ghi của mình; mọi chuyển trạng thái qua RPC có kiểm tra tường minh.
5. Từ chối: RPC `agent_reject_approval` → `rejected`; không xóa gì.

## 5. Giới hạn & lỗi
Tin nhắn ≤ 1 000 ký tự; lịch sử ≤ 12 lượt × 1 500 ký tự (chỉ text user/assistant); `maxTurns` 8; timeout 45 s (`maxDuration` 60);
30 yêu cầu/10 phút/người (bảng `agent_requests`, chỉ insert/select của chính mình); ≤ 10 phê duyệt đang chờ/người.
Lỗi nhà cung cấp/mạng/timeout → thông báo tiếng Việt chung, không lộ chi tiết; mutation đã xác nhận trước lỗi vẫn được báo đúng.

## 6. Giao diện (giữ thiết kế M10)
Nút “Trợ lý AI” ở thanh trên; desktop: panel phải 400px; mobile: màn hình chat toàn màn. Lịch sử trong phiên, gợi ý câu lệnh,
trạng thái đang xử lý/lỗi, phản hồi thao tác (“Đã tạo công việc …”), thẻ phê duyệt Xóa/Hủy. Sau mutation, bảng tự làm mới (không nháy màn hình).

## 7. Dữ liệu & triển khai
Migration **chỉ thêm** (`agent_approvals`, `agent_requests`, 4 RPC) — không đổi bảng cũ; Production (M10) không dùng tới.
Dự án Supabase Cloud dùng chung Production/Preview ⇒ **không tự áp migration**; chuẩn bị kế hoạch + rollback, chờ chủ dự án duyệt.

## 8. Kiểm thử
Unit/component (model giả lập `Model` cho tool-call có kịch bản), pgTAP (RLS + vòng đời phê duyệt: người khác, hết hạn, replay, sai tham số),
integration trên Supabase Local (R/C/U thật, A vs B, phê duyệt đồng thời), E2E (UI + model giả lập), kiểm thử **model thật** opt-in
(`npm run test:agent-live`, chạy cục bộ qua proxy). Bằng chứng giả lập không được dùng để khẳng định Preview hoạt động.

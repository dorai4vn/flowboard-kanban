# FlowBoard M11 (AI Workspace Assistant) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Spec:** `docs/superpowers/specs/2026-11-23-flowboard-m11-ai-agent-design.md`
**Stack thêm:** `@openai/agents` 0.22.0 (zod 4), Vercel Web handler `api/agent/*.ts`.

## Global Constraints
- Không đổi bảng/policy cũ; migration chỉ thêm. Không service-role. Không `VITE_OPENAI*`. Không in secret.
- Đường server (`api/`, `server/`, các file `src/**` được server import) dùng import tương đối có đuôi `.js`; `tsconfig.server.json` (NodeNext) cưỡng chế.
- Copy tiếng Việt; giữ giao diện M10.

## Review Focus
1. Bypass phê duyệt: tool xóa chạy không có claim; claim của user khác; replay; sai action/target; hết hạn; 2 yêu cầu đồng thời.
2. RunState giả mạo (sửa chuỗi/HMAC) → bị từ chối trước khi khôi phục.
3. Token giả/hết hạn/thiếu → 401, không chạm DB.
4. Lỗi provider/timeout/maxTurns → thông báo chung, không báo thành công sai.
5. Làm mới bảng sau mutation không làm mất panel/chat và không đè ghi đang chờ.

### Task 1: Hạ tầng server — import `.js`, `tsconfig.server.json`, cấu trúc `server/agent/*`, `api/agent/*`.
### Task 2: Migration `agent_approvals` + `agent_requests` + RPC; pgTAP (RLS, vòng đời, tamper/replay/expire/other-user).
### Task 3: `WorkspaceService` (đọc/tạo/sửa dựa trên domain + repository) — unit test với FakeRepository.
### Task 4: Tool zod + Agent + `ScriptedModel` (test) — tool R/C/U, tool xóa cần claim.
### Task 5: `handleChat` / `handleApproval` (auth, giới hạn, lỗi, phê duyệt + HMAC RunState) — unit test bảo mật.
### Task 6: Integration Supabase Local: R/C/U thật, A vs B, phê duyệt end-to-end, đồng thời; live test model thật (opt-in).
### Task 7: Frontend — store `refresh()`, `AssistantPanel`, `ApprovalCard`, nút mở; component test.
### Task 8: Vite middleware dev, E2E (model giả lập), Visual QC, báo cáo, review độc lập, PR Draft, Preview.

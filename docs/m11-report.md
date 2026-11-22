# Buổi 11 — Báo cáo Trợ lý AI (kiểm thử, bảo mật, nghiệm thu)

Nhánh `claude/m11-ai-agent` · Draft PR https://github.com/dorai4vn/flowboard-kanban/pull/4 ·
Preview https://flowboard-kanban-git-claude-m11-ai-agent-dorai4vn.vercel.app

Ký hiệu trạng thái: **[Local]** đã kiểm chứng cục bộ · **[Preview]** đã kiểm chứng trên Preview ·
**[Chưa test]** · **[Bị chặn]** do thiếu credential/mạng.

## 1. Công cụ thật của Agent (`server/agent/tools.ts`)

| Nhóm | Công cụ | Việc làm (qua `SupabaseRepository`, JWT người dùng, RLS) |
|---|---|---|
| Đọc | `list_boards`, `get_board`, `search_tasks`, `get_focus` (today/overdue) | đọc bảng/công việc của chính người dùng |
| Tạo | `create_board`, `create_task` | RPC `create_board`, `save_task` |
| Sửa | `update_task` (tiêu đề, mô tả, ưu tiên, hạn chót, xóa hạn), `move_task` (trạng thái/hoàn thành) | RPC `save_task`, `move_task` |
| Xóa | `delete_task`, `delete_board` | `needsApproval: true` + chỉ chạy với claim hợp lệ từ `agent_execute_approval` |

Không có công cụ SQL tùy ý; không dùng service-role key.

## 2. Bằng chứng R/C/U trên Postgres

- **[Local]** `tests/integration/agent.test.ts` (Supabase Local, JWT thật, RLS thật; chỉ model là kịch bản):
  CREATE (task xuất hiện trong DB với đúng cột/ưu tiên/hạn), READ + UPDATE (tìm → đổi tiêu đề, hạn, chuyển
  sang Hoàn thành), ISOLATION (B không thấy và không ghi được dữ liệu A).
- **[Local]** Model thật `gpt-5.4-mini` qua `npm run test:agent-live` 5/5: tạo, đổi hạn/trạng thái, đọc
  việc quá hạn, xóa có duyệt, từ chối prompt injection. Bản ghi: `docs/m11-live-transcript.md`.
- **[Local]** E2E `tests/e2e/ai.spec.ts`: tạo + sửa qua panel, kiểm tra bảng Kanban cập nhật.

## 3. Bằng chứng duyệt xóa do backend cưỡng chế

Ba lớp độc lập: (1) SDK dừng run trước khi gọi tool xóa (`needsApproval`) và server lưu bản ghi
`agent_approvals` (user, action, target bất biến, nhãn lấy từ DB, hết hạn 10 phút); (2) chỉ hàm
`agent_claim_approval` (khóa hàng `FOR UPDATE`) mới chuyển sang `approved` và cấp `claim_token` dùng một lần;
RunState ký HMAC gắn user + action + target; (3) tool xóa từ chối nếu không có claim khớp, và việc xóa diễn ra
trong `agent_execute_approval` (SECURITY INVOKER, RLS vẫn áp dụng) cùng transaction với việc tiêu claim.

| Kịch bản | Kết quả | Test |
|---|---|---|
| Yêu cầu xóa chỉ tạo bản ghi chờ, không xóa | [Local] | unit, integration, E2E, pgTAP |
| Bấm “Không xóa” → không xóa, sau đó không duyệt lại được | [Local] | unit, E2E, pgTAP |
| Duyệt → xóa đúng mục; gửi lại (replay) → 409 | [Local] | unit, integration, pgTAP |
| Tài khoản khác duyệt → 404 | [Local] | unit, integration, pgTAP |
| Sửa action/target → 422, bản ghi vẫn chờ | [Local] | unit, integration, pgTAP |
| Sửa RunState trong DB → 422 trước khi chạy | [Local] | unit, integration |
| Hết hạn → 410 | [Local] | unit, pgTAP |
| 5 lần duyệt song song → đúng 1 lần xóa `[200,409,409,409,409]` | [Local] | integration (Postgres thật), unit |
| Gọi tool xóa không có claim → từ chối | [Local] | unit |
| Run sau khi duyệt cố xóa mục thứ hai → chỉ tạo yêu cầu duyệt mới | [Local] | unit |
| Bảng thay đổi (thêm/bớt việc) sau khi hiện thẻ → không xóa, 409 | [Local] | pgTAP, unit |

## 4. Kết quả kiểm thử (chạy thật, commit `d15c809`)

| Lớp | Lệnh | Kết quả |
|---|---|---|
| Lint + typecheck + unit/component + build | `npm run check` | **216/216 pass**, build OK [Local] |
| DB RLS + RPC (pgTAP) | `npm run test:db` | **114/114 pass** [Local] |
| Integration (Supabase Local, 2 user) | `npm run test:integration` | **15/15 pass** [Local] |
| E2E desktop + mobile + AI | `npm run test:e2e` | **25 pass**, 4 skip (ảnh QC chạy riêng) [Local] |
| Model thật | `npm run test:agent-live` | **5/5 pass** [Local] |
| Quét secret | `npm run check:secrets` | OK; `dist/` không chứa `OPENAI_API_KEY` [Local] |
| Lỗi nhà cung cấp / timeout / max turns / DB sập | unit `handlers.test.ts` | pass [Local] |
| Preview | — | **[Bị chặn]**: thiếu migration trên Supabase Cloud + `OPENAI_API_KEY`/`AGENT_STATE_SECRET` trên Preview; container không truy cập được `*.vercel.app` |

## 5. Review bảo mật độc lập

Reviewer độc lập (subagent riêng, chỉ đọc) trên `git diff 7630d87..HEAD`: **0 Critical, 2 Important, 9 Minor**.

| Mục | Vấn đề | Xử lý |
|---|---|---|
| I-1 | Gọi RPC trực tiếp có thể làm phình DB dùng chung (insert log, tạo/hủy duyệt lặp lại, run state 500 KB, không dọn dẹp) | Đã sửa: `agent_rate_limit_hit()` là đường ghi log duy nhất (30/10 phút); ≤ 30 yêu cầu duyệt/giờ; run state ≤ 200 000; bản ghi đã xử lý bỏ run state, xóa sau 1 ngày; advisory lock |
| I-2 | Xóa bảng không cố định phạm vi (task thêm sau khi hiện thẻ cũng bị xóa) | Đã sửa: lưu đúng tập `task_ids`; khi thực thi khóa bảng và so sánh, khác → `target_changed`, không xóa |
| M-2 | MAC chỉ gắn user; khóa có thể suy ra | Đã sửa: MAC gắn user + action + target; bắt buộc `AGENT_STATE_SECRET` ≥ 32 ký tự khi deploy |
| M-3 | Claim kẹt khi request chết | Đã sửa: claim > 2 phút được duyệt lại (token mới vô hiệu token cũ) |
| M-4 | Timeout có thể báo sai khi đang xóa | Đã sửa: chờ RPC xóa xong rồi mới trả lời |
| M-5 | Lộ tên biến môi trường thiếu | Đã sửa: chỉ ghi log server |
| M-6 | Body không giới hạn; reject không rate limit | Đã sửa: giới hạn 64 KB (đọc stream có cap), reject cũng bị rate limit |
| M-7 | Race giới hạn 10 yêu cầu chờ | Đã sửa: advisory lock theo user |
| M-8 | Run state quá lớn → báo lỗi sai | Đã sửa: trả lời rõ “cuộc trò chuyện quá dài” |
| M-9 | Thiếu test | Đã bổ sung (pgTAP `agent_hardening.test.sql`, unit “review hardening”, `config.test.ts`) |
| M-1 | `agent_claim_approval` trả run state cho chính chủ | Giữ nguyên (không leo thang quyền: dữ liệu của chính user, MAC + kiểm tra tham số + claim); sửa comment |

Điểm reviewer xác nhận đạt: khóa OpenAI chỉ ở server, mọi truy cập DB bằng JWT người dùng (RLS), SECURITY
DEFINER có `search_path = ''` + kiểm tra `auth.uid()` + thu hồi `anon`, không vượt được duyệt, không IDOR, không
XSS (không `dangerouslySetInnerHTML`), model kịch bản không thể bật trên Vercel, migration chỉ thêm.

## 6. Ảnh chụp (Visual QC) — `docs/screenshots/m11/`

`ai-desktop-empty.png`, `ai-desktop-create-update.png`, `ai-desktop-approval.png`, `ai-desktop-error.png`,
`ai-desktop-loading.png`, `ai-mobile-*.png` (cùng các trạng thái). Lỗi tìm thấy và đã sửa: panel che header/avatar
trên desktop (nay đẩy layout sang trái), viền focus kép ở ô nhập.

## 7. Rủi ro còn lại

- Migration chưa áp dụng lên Supabase Cloud (chờ chủ dự án duyệt) → Trợ lý AI trên Preview chưa chạy được.
- Chưa kiểm thử trên Preview thật (đăng nhập Google + model thật + DB Cloud).
- Model có thể hiểu sai yêu cầu mơ hồ (ví dụ hai việc trùng tên) — đã hướng dẫn model hỏi lại, nhưng các
  thao tác tạo/sửa không cần duyệt; chỉ xóa mới cần.
- Chi phí OpenAI: giới hạn 30 yêu cầu/10 phút/người, tối đa 8 lượt tool/yêu cầu; chưa có hạn mức theo ngày.
- Lịch sử chat chỉ lưu trong bộ nhớ trình duyệt (mất khi tải lại trang) — theo thiết kế.
- Dữ liệu bị gửi tới OpenAI: tiêu đề/mô tả công việc mà tool trả về trong cuộc trò chuyện.

## 8. Checklist nghiệm thu thủ công (trên Preview, sau khi cấu hình)

- [ ] Đăng nhập Google; Kanban vẫn kéo thả, tạo/sửa/xóa thủ công bình thường.
- [ ] Nút “Trợ lý AI” mở panel bên phải (desktop) / toàn màn hình (mobile); Esc hoặc X đóng được.
- [ ] “Việc nào đang quá hạn?” trả đúng danh sách của tài khoản mình.
- [ ] “Tạo công việc Ôn tập chương 4 hạn ngày mai” → thẻ mới xuất hiện trên bảng không cần tải lại.
- [ ] “Đổi hạn Ôn tập chương 4 sang thứ Sáu” và “Đánh dấu hoàn thành Ôn tập chương 4” → bảng cập nhật.
- [ ] “Xóa Ôn tập chương 4” → hiện thẻ xác nhận đúng tên + bảng; “Không xóa” giữ nguyên công việc.
- [ ] Lặp lại và bấm “Xóa” → công việc biến mất; bấm lại không xóa thêm gì.
- [ ] Đăng nhập tài khoản thứ hai: không thấy dữ liệu tài khoản thứ nhất qua Trợ lý.
- [ ] Mất mạng: panel báo tạm dừng, không gửi được.
- [ ] Production (`main`) không thay đổi.

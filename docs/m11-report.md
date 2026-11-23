# Buổi 11 — Báo cáo Trợ lý AI (kiểm thử, bảo mật, nghiệm thu)

Nhánh `claude/m11-ai-agent` · Draft PR https://github.com/dorai4vn/flowboard-kanban/pull/4 ·
Preview https://flowboard-kanban-git-claude-m11-ai-agent-dorai4vn.vercel.app ·
Review migration: `docs/m11-migration-review.md`

Ký hiệu trạng thái: **[Local]** kiểm thử tự động trên môi trường cục bộ (Claude chạy) ·
**[Preview – chủ dự án xác nhận]** nghiệm thu thủ công trên Vercel Preview do chủ dự án thực hiện và báo kết quả ·
**[Chưa test]** · **[Bị chặn]**. Claude không truy cập được `*.vercel.app` (proxy chặn), nên mọi kết quả
**[Preview]** là do chủ dự án xác nhận, không phải do Claude tự quan sát.

## 0. Tóm tắt nghiệm thu

| Hạng mục | Tự động [Local] | Thủ công [Preview – chủ dự án xác nhận] |
|---|---|---|
| Đăng nhập Google | E2E (Supabase Local) | **PASS** |
| Giao diện Trợ lý AI | E2E `ai-entry`, `ai`, `ai-mobile`; ảnh QC | **PASS** |
| READ (đọc bảng/việc, quá hạn, hôm nay) | unit, integration, model thật | **PASS** |
| CREATE | unit, integration, E2E, model thật | **PASS** |
| UPDATE (tiêu đề, hạn, trạng thái, hoàn thành) | unit, integration, E2E, model thật | **PASS** |
| DELETE sau khi phê duyệt | pgTAP, unit, integration (Postgres thật), E2E | **PASS** |
| REJECT (không xóa) | pgTAP, unit, E2E | **PASS** |
| Cách ly giữa hai tài khoản | pgTAP, integration (2 user, JWT + RLS thật) | **PASS** (2 tài khoản Google) |
| Hồi quy M10 Production | E2E desktop + mobile (25 test Kanban) | **PASS** |
| Migration M11 trên Supabase FlowBoard | Postgres dùng một lần: v2 trên trạng thái v1 để lại = migration sạch (210 thuộc tính); M10 giữ nguyên | **M11 OK, 2 bảng, 7 hàm** (chủ dự án chạy v2) |
| Replay / sửa tham số / hết hạn / tài khoản khác / song song | pgTAP, unit, integration | Chưa thử thủ công (không bắt buộc) |


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

## 4. Kết quả kiểm thử tự động (lần chạy cuối, commit `8b4a889`) [Local]

| Lớp | Lệnh | Kết quả |
|---|---|---|
| Lint + typecheck + unit/component + build | `npm run check` | **220/220 pass**, build OK |
| DB RLS + RPC (pgTAP, 7 file) | `npm run test:db` | **126/126 pass** |
| Integration (Supabase Local, 2 user, JWT + RLS thật) | `npm run test:integration` | **15/15 pass** (lần chạy ngay sau `db reset` lỗi ở bước khởi tạo — 8 pass/7 skip — do dịch vụ Auth local chưa sẵn sàng; chạy lại: 15/15) |
| E2E desktop + mobile + AI | `npm run test:e2e` | **27 pass**, 4 skip (ảnh QC chạy riêng) |
| Model thật `gpt-5.4-mini` | `npm run test:agent-live` | **5/5 pass** (lần chạy gần nhất ở commit `5bffd83`; các commit sau không đổi code agent) |
| Tác động migration + rollback (Postgres dùng một lần) | `bash scripts/check-migration-impact.sh` | **PASS** |
| File áp dụng v2 trên trạng thái giống Production (5/20/20/18) | xem `docs/m11-apply-runbook.md` | **PASS**: postcheck 9/9, M10 giống hệt |
| Quét secret | `npm run check:secrets` | OK; bundle không chứa `OPENAI_API_KEY` |

## 5. Review bảo mật độc lập

Reviewer độc lập (subagent riêng, chỉ đọc) trên `git diff 7630d87..HEAD`: **0 Critical, 2 Important, 9 Minor**.
Vòng 2 (kiểm tra bản sửa `d15c809`): I-1, I-2 và các Minor đã xử lý; **không có Critical/Important mới**; 3 Minor mới (N-1..N-3).

Vòng 3 — reviewer **mới, độc lập** rà toàn bộ diff `7630d87..46984aa`: **0 Critical, 2 Important** (R3-I1: lấp DB qua RPC
trực tiếp vì bản ghi `approved`/hết hạn còn giữ run state và chỉ dọn khi chính user quay lại; R3-I2: chat hỏng sau một
câu trả lời dài > 1 500 ký tự), 6 Minor. Đã sửa (commit `5bffd83`): hàm nội bộ `agent_housekeeping()` dọn cho mọi tài
khoản, giới hạn 128 KB theo byte, server rút gọn lịch sử thay vì từ chối + client giới hạn byte, `target_missing` → 410,
timeout → làm mới bảng, cấu hình không cho model kịch bản thay khóa khi deploy. Reviewer kiểm tra lại: **APPROVE**, không
có Critical/Important mới; 2 Minor mới (housekeeping sát giờ hết hạn, housekeeping kích hoạt quá nhiều) — đã sửa luôn kèm
pgTAP. Minor còn lại không sửa: lost update khi người dùng sửa cùng lúc (last-write-wins như UI), MAC không gắn approval id
(tác động thấp), không có giới hạn theo IP trước bước xác thực (nên bật Vercel Firewall).

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
| N-1 (vòng 2) | Bản ghi `approved` không tính vào giới hạn 10 | Đã sửa: tính cả `approved`; pgTAP bổ sung |
| N-2 (vòng 2) | RPC xóa không có timeout riêng (Postgres treo → Vercel 504) | Chưa sửa — vẫn không xóa sai; ghi nhận rủi ro |
| N-3 (vòng 2) | Duyệt lại claim sau 2 phút dựa vào `maxDuration: 60` | Đã sửa: ghim `maxDuration: 60` trong `vercel.json` |
| M-1 | `agent_claim_approval` trả run state cho chính chủ | Giữ nguyên (không leo thang quyền: dữ liệu của chính user, MAC + kiểm tra tham số + claim); sửa comment |

Điểm reviewer xác nhận đạt: khóa OpenAI chỉ ở server, mọi truy cập DB bằng JWT người dùng (RLS), SECURITY
DEFINER có `search_path = ''` + kiểm tra `auth.uid()` + thu hồi `anon`, không vượt được duyệt, không IDOR, không
XSS (không `dangerouslySetInnerHTML`), model kịch bản không thể bật trên Vercel, migration chỉ thêm.

## 6. Ảnh chụp (Visual QC) — `docs/screenshots/m11/`

`ai-desktop-entry.png` (vị trí nút, panel đóng), `ai-desktop-empty.png`, `ai-desktop-create-update.png`, `ai-desktop-approval.png`, `ai-desktop-error.png`,
`ai-desktop-loading.png`, `ai-mobile-*.png` (cùng các trạng thái). Lỗi tìm thấy và đã sửa: panel che header/avatar
trên desktop (nay đẩy layout sang trái), viền focus kép ở ô nhập.

## 7. Rủi ro còn lại và blocker trước khi merge

**Blocker trước khi merge vào `main` (merge = deploy Production):**
- Production chưa có `OPENAI_API_KEY` và `AGENT_STATE_SECRET` (chỉ đặt cho Preview). Merge mà chưa thêm → nút
  Trợ lý AI vẫn hiện trên Production nhưng mọi yêu cầu trả 503 “Trợ lý AI chưa được cấu hình”. Cần chủ dự án quyết định:
  thêm biến cho Production (dùng `AGENT_STATE_SECRET` khác với Preview) trước khi merge.
- Lịch sử migration: v2 ghi `20261123000000` vào `supabase_migrations.schema_migrations` **nếu bảng này tồn tại**.
  Nên chạy `supabase/checks/m11/status.sql` (chỉ đọc) để xác nhận; nếu không ghi nhận, sau này `supabase db push`
  có thể cố áp lại M11 (sẽ lỗi vì đối tượng đã có — không mất dữ liệu).

**Rủi ro đã biết (không chặn merge):**
- Backup: chỉ có 4 file CSV (`boards, labels, tasks, task_labels`); không có `auth.users` → nếu mất tài khoản,
  khôi phục cần gán lại `user_id`. Schema/RLS/hàm dựng lại được từ `supabase/migrations`.
- Preview và Production dùng chung một DB: thao tác Trợ lý trên Preview ghi vào dữ liệu thật.
- Tạo/sửa không cần phê duyệt (chỉ xóa cần); model có thể hiểu sai yêu cầu mơ hồ.
- Chi phí OpenAI: 30 yêu cầu/10 phút/người, tối đa 8 lượt tool/yêu cầu; chưa có hạn mức theo ngày.
- RPC xóa không có timeout riêng (Postgres treo → 504; không xóa sai). Không giới hạn theo IP trước bước xác thực.
- Hai người sửa cùng lúc: bản lưu sau thắng (giống giao diện hiện tại).
- Dữ liệu gửi tới OpenAI: tiêu đề/mô tả công việc mà tool trả về trong cuộc trò chuyện.
- Lịch sử chat chỉ trong bộ nhớ trình duyệt (mất khi tải lại) — theo thiết kế.
- Repo `dorai4vn/flowboard-db-backups` và nhánh `claude/flowboard-backup-workflow` không còn dùng; nếu repo đó có secret
  `SUPABASE_DB_URL` thì nên xóa secret.

## 8. Checklist nghiệm thu thủ công — kết quả [Preview – chủ dự án xác nhận]

- [x] Đăng nhập Google (sau khi thêm URL Preview vào Supabase Redirect URLs).
- [x] Nút “✨ Trợ lý AI” (góc phải header, cạnh avatar) mở panel.
- [x] READ — hỏi việc quá hạn / tóm tắt hôm nay.
- [x] CREATE — tạo công việc qua Trợ lý, thẻ xuất hiện trên bảng.
- [x] UPDATE — đổi hạn / tiêu đề / hoàn thành.
- [x] REJECT — thẻ xác nhận xóa → “Không xóa” → công việc còn nguyên.
- [x] DELETE sau khi bấm “Xóa” → công việc bị xóa.
- [x] Cách ly giữa hai tài khoản Google.
- [x] Hồi quy M10 Production.
- [x] Migration v2 trên Supabase FlowBoard: `M11 OK`, 2 bảng, 7 hàm.

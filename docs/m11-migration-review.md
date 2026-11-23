# Buổi 11 — Báo cáo review migration `20261123000000_agent_approvals.sql`

Trạng thái: **CHƯA áp dụng lên Supabase Cloud** (chờ chủ dự án phê duyệt). Chỉ đã chạy trên Supabase Local và
trên container Postgres dùng một lần. Commit được review: nhánh `claude/m11-ai-agent`.

> Lưu ý số lượng hàm: bản đầu có 5 hàm; sau review bảo mật (I-1) có thêm `agent_rate_limit_hit()`, nên
> migration hiện có **6 hàm**.

## 1. Tóm tắt cho người phê duyệt

| Câu hỏi | Trả lời | Bằng chứng |
|---|---|---|
| Có sửa/xóa bảng, cột, policy, hàm, index hay dữ liệu hiện có? | **Không** — chỉ `create` đối tượng mới tên `agent_*` | Mục 7: dấu vân tay md5 trước/sau giống hệt |
| Bảng mới | 2: `agent_requests`, `agent_approvals` | Mục 3 |
| Hàm mới | 6 (5 SECURITY DEFINER, 1 SECURITY INVOKER) | Mục 4 |
| `anon` có quyền gì không? | Không (bảng: revoke all; hàm: revoke from `public, anon`) | Mục 3–4, truy vấn quyền thực tế |
| Khóa bảng hiện có khi áp dụng? | Không khóa `boards/labels/tasks/task_labels`. Chỉ tạo FK tới `auth.users` (khóa ngắn `SHARE ROW EXCLUSIVE` trên `auth.users` lúc tạo bảng) | SQL mục 2 |
| Rollback | File riêng `supabase/rollbacks/20261123000000_agent_approvals.down.sql`, đã chạy thử: gỡ sạch, dữ liệu M10 giữ nguyên, áp lại được | Mục 8 |
| Dữ liệu người dùng gửi đi đâu? | Không đổi so với M10; bảng mới chỉ lưu yêu cầu duyệt + nhật ký số lần gọi | — |

## 2. Nội dung SQL đầy đủ

```sql
-- FlowBoard M11: AI assistant support. ADDITIVE ONLY — no existing table, policy or function is changed.
--
-- * agent_requests: per-user request log for rate limiting. Rows are only written by agent_rate_limit_hit(),
--   which caps the log at 30 rows per 10 minutes per user and purges rows older than a day.
-- * agent_approvals: server-side human approvals for destructive agent actions (delete task / delete board).
--   Clients may only SELECT their own rows (without the serialized run state; the server receives it from
--   agent_claim_approval and the MAC binds it to user + action + target). Every state change goes
--   through the functions below, which check auth.uid() explicitly. The SECURITY DEFINER functions are
--   narrowly scoped: they only read/write agent_approvals and read the caller's own boards/tasks to build
--   the approval label. The actual DELETE runs in agent_execute_approval as SECURITY INVOKER, so RLS on
--   boards/tasks still applies to the deletion itself.
--
-- Rollback (if ever needed): drop function public.agent_rate_limit_hit(), public.agent_execute_approval(uuid, uuid, text, uuid),
--   public.agent_consume_claim(uuid, uuid, text, uuid), public.agent_reject_approval(uuid, text, uuid),
--   public.agent_claim_approval(uuid, text, uuid), public.agent_create_approval(text, uuid, text, text, integer);
--   drop table public.agent_approvals, public.agent_requests;

-- ============================================================== request log
create table public.agent_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index agent_requests_user_time_idx on public.agent_requests (user_id, created_at desc);

alter table public.agent_requests enable row level security;
alter table public.agent_requests force row level security;
revoke all on table public.agent_requests from anon, authenticated, public;
grant select on table public.agent_requests to authenticated;
create policy agent_requests_select_own on public.agent_requests for select to authenticated
  using (user_id = (select auth.uid()));

-- The only way to write the log: one capped, locked check per request (rate limit hard-coded server-side).
create function public.agent_rate_limit_hit()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('agent_requests:' || v_uid::text, 0));
  delete from public.agent_requests r where r.user_id = v_uid and r.created_at < now() - interval '1 day';
  if (select count(*) from public.agent_requests r where r.user_id = v_uid and r.created_at > now() - interval '10 minutes') >= 30 then
    return false;
  end if;
  insert into public.agent_requests (user_id) values (v_uid);
  return true;
end;
$$;
revoke all on function public.agent_rate_limit_hit() from public, anon;
grant execute on function public.agent_rate_limit_hit() to authenticated;

-- ============================================================== approvals
create table public.agent_approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null check (action in ('delete_task', 'delete_board')),
  target_id uuid not null,
  target_label text not null,
  detail jsonb not null default '{}'::jsonb,
  run_state text not null check (char_length(run_state) <= 200000),
  run_state_mac text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'executed', 'rejected', 'expired')),
  claim_token uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_at timestamptz
);
create index agent_approvals_user_status_idx on public.agent_approvals (user_id, status);

alter table public.agent_approvals enable row level security;
alter table public.agent_approvals force row level security;
revoke all on table public.agent_approvals from anon, authenticated, public;
-- column-level: clients never read the serialized run state, its MAC or the claim token
grant select (id, user_id, action, target_id, target_label, detail, status, created_at, expires_at, decided_at)
  on table public.agent_approvals to authenticated;
create policy agent_approvals_select_own on public.agent_approvals for select to authenticated
  using (user_id = (select auth.uid()));

-- -------------------------------------------------------------- create
create function public.agent_create_approval(p_action text, p_target uuid, p_run_state text, p_run_state_mac text, p_ttl_seconds integer default 600)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_label text;
  v_detail jsonb;
  v_row public.agent_approvals;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('delete_task', 'delete_board') or p_target is null then
    raise exception 'invalid action' using errcode = '22023';
  end if;
  if p_run_state is null or p_run_state_mac is null then
    raise exception 'missing run state' using errcode = '22023';
  end if;
  if char_length(p_run_state) > 200000 or char_length(p_run_state_mac) > 200 then
    raise exception 'run state too large' using errcode = '54000';
  end if;
  -- serialise this user's creations so the budgets below cannot be raced
  perform pg_advisory_xact_lock(hashtextextended('agent_approvals:' || v_uid::text, 0));
  -- retention: close expired requests (dropping their run state) and purge old decided ones
  update public.agent_approvals a set status = 'expired', run_state = '', decided_at = now()
   where a.user_id = v_uid and a.status = 'pending' and a.expires_at <= now();
  delete from public.agent_approvals a where a.user_id = v_uid and a.status <> 'pending' and a.created_at < now() - interval '1 day';

  -- the target must belong to the caller (explicit check: this function bypasses RLS)
  if p_action = 'delete_task' then
    select t.title, jsonb_build_object('board_id', b.id, 'board_name', b.name, 'status', t.status)
      into v_label, v_detail
      from public.tasks t join public.boards b on b.id = t.board_id
     where t.id = p_target and t.user_id = v_uid;
  else
    -- the exact task set is stored: execution refuses if the board's tasks changed after the card was shown
    select b.name, jsonb_build_object(
             'task_count', (select count(*) from public.tasks t where t.board_id = b.id and t.user_id = v_uid),
             'task_ids', (select coalesce(jsonb_agg(t.id order by t.id), '[]'::jsonb) from public.tasks t where t.board_id = b.id and t.user_id = v_uid))
      into v_label, v_detail
      from public.boards b
     where b.id = p_target and b.user_id = v_uid;
  end if;
  if v_label is null then
    raise exception 'target not found' using errcode = 'P0002';
  end if;

  if (select count(*) from public.agent_approvals a where a.user_id = v_uid and a.status in ('pending', 'approved') and a.expires_at > now()) >= 10 then
    raise exception 'too many pending approvals' using errcode = '53400';
  end if;
  if (select count(*) from public.agent_approvals a where a.user_id = v_uid and a.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'too many approvals this hour' using errcode = '53400';
  end if;

  insert into public.agent_approvals (user_id, action, target_id, target_label, detail, run_state, run_state_mac, expires_at)
  values (v_uid, p_action, p_target, v_label, v_detail, p_run_state, p_run_state_mac,
          now() + make_interval(secs => greatest(60, least(coalesce(p_ttl_seconds, 600), 900))))
  returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'action', v_row.action, 'target_id', v_row.target_id, 'target_label', v_row.target_label,
                            'detail', v_row.detail, 'status', v_row.status, 'expires_at', v_row.expires_at);
end;
$$;

-- -------------------------------------------------------------- claim (approve): exactly one caller can win
create function public.agent_claim_approval(p_id uuid, p_action text, p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.agent_approvals;
  v_token uuid := gen_random_uuid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- row lock serialises concurrent approvals of the same id
  select * into v_row from public.agent_approvals a where a.id = p_id and a.user_id = v_uid for update;
  if not found then
    return jsonb_build_object('code', 'not_found');
  end if;
  -- 'approved' older than 2 minutes = the request holding the claim died (functions time out after 60 s):
  -- the claim may be taken again; a fresh token invalidates the abandoned one.
  if v_row.status <> 'pending' and not (v_row.status = 'approved' and v_row.decided_at < now() - interval '2 minutes') then
    return jsonb_build_object('code', 'already_decided');
  end if;
  if v_row.expires_at <= now() then
    update public.agent_approvals set status = 'expired', run_state = '', decided_at = now() where id = p_id;
    return jsonb_build_object('code', 'expired');
  end if;
  if v_row.action is distinct from p_action or v_row.target_id is distinct from p_target then
    return jsonb_build_object('code', 'mismatch');
  end if;
  update public.agent_approvals set status = 'approved', claim_token = v_token, decided_at = now() where id = p_id;
  return jsonb_build_object('code', 'ok', 'claim_token', v_token, 'action', v_row.action, 'target_id', v_row.target_id,
                            'target_label', v_row.target_label, 'run_state', v_row.run_state, 'run_state_mac', v_row.run_state_mac);
end;
$$;

-- -------------------------------------------------------------- reject
create function public.agent_reject_approval(p_id uuid, p_action text, p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.agent_approvals;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into v_row from public.agent_approvals a where a.id = p_id and a.user_id = v_uid for update;
  if not found then
    return jsonb_build_object('code', 'not_found');
  end if;
  if v_row.status <> 'pending' then
    return jsonb_build_object('code', 'already_decided');
  end if;
  if v_row.action is distinct from p_action or v_row.target_id is distinct from p_target then
    return jsonb_build_object('code', 'mismatch');
  end if;
  update public.agent_approvals set status = 'rejected', run_state = '', decided_at = now() where id = p_id;
  return jsonb_build_object('code', 'ok', 'target_label', v_row.target_label);
end;
$$;

-- -------------------------------------------------------------- consume claim (internal step of execute)
create function public.agent_consume_claim(p_id uuid, p_claim uuid, p_action text, p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_label text;
  v_row public.agent_approvals;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_action = 'delete_board' then
    select * into v_row from public.agent_approvals a
     where a.id = p_id and a.user_id = v_uid and a.status = 'approved' and a.claim_token = p_claim
       and a.action = p_action and a.target_id = p_target
       for update;
    if found then
      -- lock the board (blocks concurrent task inserts via the FK) and compare with the approved task set
      perform 1 from public.boards b where b.id = p_target and b.user_id = v_uid for update;
      if (select coalesce(jsonb_agg(t.id order by t.id), '[]'::jsonb) from public.tasks t where t.board_id = p_target and t.user_id = v_uid)
         is distinct from coalesce(v_row.detail->'task_ids', '[]'::jsonb) then
        update public.agent_approvals set status = 'expired', run_state = '', decided_at = now() where id = p_id;
        return jsonb_build_object('code', 'target_changed');
      end if;
    end if;
  end if;
  update public.agent_approvals a
     set status = 'executed', run_state = ''
   where a.id = p_id and a.user_id = v_uid and a.status = 'approved'
     and a.claim_token = p_claim and a.action = p_action and a.target_id = p_target
  returning a.target_label into v_label;
  if v_label is null then
    return jsonb_build_object('code', 'invalid_claim');
  end if;
  return jsonb_build_object('code', 'ok', 'target_label', v_label);
end;
$$;

-- -------------------------------------------------------------- execute: consume + delete in ONE transaction, deletion under RLS
create function public.agent_execute_approval(p_id uuid, p_claim uuid, p_action text, p_target uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
  v_count integer;
begin
  v_result := public.agent_consume_claim(p_id, p_claim, p_action, p_target);
  if v_result->>'code' <> 'ok' then
    return v_result;
  end if;
  if p_action = 'delete_task' then
    delete from public.tasks where id = p_target;
  else
    delete from public.boards where id = p_target;
  end if;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    -- rolls back the consumed claim as well
    raise exception 'target not found' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;

revoke all on function public.agent_create_approval(text, uuid, text, text, integer) from public, anon;
revoke all on function public.agent_claim_approval(uuid, text, uuid) from public, anon;
revoke all on function public.agent_reject_approval(uuid, text, uuid) from public, anon;
revoke all on function public.agent_consume_claim(uuid, uuid, text, uuid) from public, anon;
revoke all on function public.agent_execute_approval(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.agent_create_approval(text, uuid, text, text, integer) to authenticated;
grant execute on function public.agent_claim_approval(uuid, text, uuid) to authenticated;
grant execute on function public.agent_reject_approval(uuid, text, uuid) to authenticated;
grant execute on function public.agent_consume_claim(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.agent_execute_approval(uuid, uuid, text, uuid) to authenticated;
```

## 3. Hai bảng mới

### `agent_requests` — nhật ký để giới hạn tần suất
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid not null | mặc định `auth.uid()`, FK `auth.users` `on delete cascade` |
| `created_at` | timestamptz | `now()` |

- RLS **enable + force**. Quyền: `revoke all` từ `anon, authenticated, public`; chỉ `grant select` cho `authenticated`.
- Policy `agent_requests_select_own` (SELECT, `authenticated`): `user_id = (select auth.uid())`.
- Không có policy INSERT/UPDATE/DELETE và không có quyền bảng tương ứng → người dùng **không thể** tự ghi,
  sửa hay xóa nhật ký. Chỉ hàm `agent_rate_limit_hit()` ghi được (tối đa 30 dòng / 10 phút / người; tự xóa dòng > 1 ngày).

### `agent_approvals` — yêu cầu xóa chờ người dùng duyệt
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid not null | FK `auth.users` `on delete cascade` |
| `action` | text | `check in ('delete_task','delete_board')` |
| `target_id` | uuid | mục cần xóa (bất biến sau khi tạo) |
| `target_label` | text | tên lấy **từ DB**, không từ model |
| `detail` | jsonb | bảng chứa việc; với xóa bảng: `task_count` + `task_ids` chính xác |
| `run_state` | text | trạng thái hội thoại của SDK, `≤ 200 000` ký tự; bị xóa trắng khi đã xử lý |
| `run_state_mac` | text | HMAC-SHA256 (xem mục 10) |
| `status` | text | `pending → approved → executed`, hoặc `rejected` / `expired` |
| `claim_token` | uuid | mã dùng một lần, cấp khi duyệt |
| `created_at`, `expires_at`, `decided_at` | timestamptz | hết hạn 60–900 s (mặc định 600 s) |

- RLS **enable + force**; `revoke all` từ `anon, authenticated, public`.
- Quyền **theo cột**: `authenticated` chỉ được SELECT `id, user_id, action, target_id, target_label, detail,
  status, created_at, expires_at, decided_at` — **không** đọc được `run_state`, `run_state_mac`, `claim_token`.
- Policy `agent_approvals_select_own` (SELECT, `authenticated`): `user_id = (select auth.uid())`.
- Không có quyền INSERT/UPDATE/DELETE trực tiếp; mọi thay đổi trạng thái đi qua hàm.

Quyền thực tế đọc từ catalog sau khi áp dụng (container thử):

```
agent_approvals | postgres, service_role | (chủ sở hữu / quản trị)
agent_requests  | authenticated          | SELECT
agent_approvals | authenticated (cột)    | action,created_at,decided_at,detail,expires_at,id,status,target_id,target_label,user_id
anon            | (không có quyền nào)
RLS: agent_approvals force=t, agent_requests force=t
```

## 4. Sáu hàm mới

| Hàm | Loại | EXECUTE | Việc làm |
|---|---|---|---|
| `agent_rate_limit_hit()` | DEFINER, `search_path=''` | `authenticated` | ghi 1 lượt nếu < 30 trong 10 phút, trả true/false |
| `agent_create_approval(action, target, run_state, mac, ttl)` | DEFINER, `search_path=''` | `authenticated` | kiểm tra mục thuộc người gọi, giới hạn, tạo bản ghi `pending` |
| `agent_claim_approval(id, action, target)` | DEFINER, `search_path=''` | `authenticated` | khóa hàng, kiểm tra, chuyển `approved`, cấp `claim_token` |
| `agent_reject_approval(id, action, target)` | DEFINER, `search_path=''` | `authenticated` | chuyển `rejected`, xóa trắng `run_state` |
| `agent_consume_claim(id, claim, action, target)` | DEFINER, `search_path=''` | `authenticated` | tiêu claim → `executed` (xóa bảng: so tập công việc) |
| `agent_execute_approval(id, claim, action, target)` | **INVOKER**, `search_path=''` | `authenticated` | gọi consume + `DELETE` trong **một transaction**, DELETE chịu RLS |

- Tất cả: `revoke all ... from public, anon`, `grant execute ... to authenticated` (catalog: `authenticated=X`,
  `service_role=X`, `postgres=X`; không có `anon`).
- DEFINER chạy với quyền chủ sở hữu (`postgres`, có `BYPASSRLS` trên Supabase — đã kiểm tra `rolbypassrls = t`,
  `rolsuper = f`). Vì vậy **mỗi hàm DEFINER tự lọc** `user_id = auth.uid()` ở mọi câu lệnh (mục 5).
- `search_path = ''` + tên đầy đủ `public.` / `auth.` → không thể chèn hàm/bảng giả qua search_path.
- Không có SQL động (`execute format(...)`), không nhận tên bảng/cột từ bên ngoài.

## 5. Kiểm tra danh tính và quyền sở hữu

1. **Danh tính** lấy từ JWT do Supabase xác thực: `auth.uid()`. Mọi hàm: `if v_uid is null then raise 42501`.
   Server (`server/agent/supabaseServer.ts`) gọi Supabase Auth `getUser(token)` trước, rồi dùng client mang
   chính JWT đó (publishable key, không service-role).
2. **Sở hữu mục cần xóa** (`agent_create_approval`): chỉ tìm `tasks`/`boards` có `user_id = v_uid`; không thấy →
   `P0002` (không phân biệt "không tồn tại" với "của người khác" → không lộ thông tin).
3. **Sở hữu bản ghi duyệt** (claim/reject/consume): `where a.id = p_id and a.user_id = v_uid` → tài khoản khác nhận `not_found`.
4. **Lệnh DELETE** chạy trong hàm INVOKER → policy RLS hiện có của `tasks`/`boards` áp dụng thêm một lần nữa.
5. **Gọi thẳng RPC (bỏ qua server)**: người dùng chỉ có thể tạo/duyệt/xóa **dữ liệu của chính mình** — tương
   đương quyền xóa họ vốn có trong giao diện Kanban. Approval tồn tại để ngăn **Agent** xóa khi người dùng chưa
   bấm "Xóa"; nó không phải lớp phân quyền giữa người dùng với dữ liệu của họ. Các giới hạn số lượng chặn lạm dụng.

## 6. Chống replay, tampering và chạy đồng thời

| Mối đe dọa | Cơ chế | Test |
|---|---|---|
| **Replay** (gửi lại lần duyệt cũ) | claim chỉ thành công từ `pending`; sau đó `approved/executed` → `already_decided` (409). `claim_token` chỉ tiêu được một lần (`status='approved' and claim_token=...` → `executed`) | pgTAP, unit, integration |
| **Tampering tham số** (đổi action/target) | claim/reject/consume so `action` và `target_id` với hàng DB → `mismatch` (422), bản ghi vẫn `pending` | pgTAP, unit, integration |
| **Tampering RunState** (sửa hội thoại lưu trong DB) | HMAC-SHA256 gắn `user + action + target + run_state`, so sánh thời gian hằng; server còn kiểm tra lời gọi tool trong RunState trùng action/target | unit, integration |
| **Tài khoản khác** | lọc `user_id = auth.uid()` → `not_found` (404) | pgTAP, unit, integration |
| **Hết hạn** | `expires_at <= now()` → `expired` (410), xóa trắng `run_state` | pgTAP, unit |
| **Chạy đồng thời** | `select ... for update` trên hàng duyệt → chỉ một request đổi `pending → approved`; consume + delete cùng transaction; `row_count <> 1` → rollback | integration Postgres thật: 5 request song song → `[200,409,409,409,409]`, đúng 1 lần xóa |
| **Bảng thay đổi sau khi hiện thẻ** | lưu `task_ids`; khi thực thi khóa `boards ... for update` (chặn insert task qua FK) rồi so sánh → `target_changed`, không xóa | pgTAP, unit |
| **Model tự gọi tool xóa** | tool `needsApproval` (SDK dừng) + tool từ chối nếu không có claim khớp từ server | unit |
| **Request chết giữa chừng** | claim `approved` > 2 phút được duyệt lại với token mới; token cũ vô hiệu | pgTAP |
| **Lạm dụng dung lượng** | ≤ 30 lượt/10 phút, ≤ 30 yêu cầu duyệt/giờ, ≤ 10 đang mở, run state ≤ 200 000, dọn sau 1 ngày, advisory lock | pgTAP |

## 7. Tác động đến bảng và dữ liệu M10 hiện có — đã đo

`bash scripts/check-migration-impact.sh` chạy trên container `supabase/postgres:17.11.0.006` dùng một lần:
áp `20261122000000_init.sql`, nạp dữ liệu kiểu M10 (2 người dùng, bảng, nhãn, việc quá hạn / hôm nay / đã xong),
rồi lấy dấu vân tay md5 ở 5 thời điểm. Kết quả thật:

```
check                    before        migrated      used          rolled-back   reapplied
data.boards              132d68cc5e81  132d68cc5e81  132d68cc5e81  132d68cc5e81  132d68cc5e81
data.labels              04fb09594362  04fb09594362  04fb09594362  04fb09594362  04fb09594362
data.tasks               053c1edbfee8  053c1edbfee8  053c1edbfee8  053c1edbfee8  053c1edbfee8
data.task_labels         cc3adb4ed989  cc3adb4ed989  cc3adb4ed989  cc3adb4ed989  cc3adb4ed989
rows                     2/4/1/1       2/4/1/1       2/4/1/1       2/4/1/1       2/4/1/1
schema.columns           1a6250ca5757  1a6250ca5757  1a6250ca5757  1a6250ca5757  1a6250ca5757
schema.policies          b4152ad77f35  b4152ad77f35  b4152ad77f35  b4152ad77f35  b4152ad77f35
schema.grants            da4e3b494de9  da4e3b494de9  da4e3b494de9  da4e3b494de9  da4e3b494de9
schema.functions         ec05130bf872  ec05130bf872  ec05130bf872  ec05130bf872  ec05130bf872
schema.constraints       ade6acc558cb  ade6acc558cb  ade6acc558cb  ade6acc558cb  ade6acc558cb
schema.triggers_indexes  8dd4e526a070  8dd4e526a070  8dd4e526a070  8dd4e526a070  8dd4e526a070
m11.objects              0 tables, 0   2 tables, 6   2 tables, 6   0 tables, 0   2 tables, 6
PASS: M10 data and schema unchanged at every step; rollback removes all M11 objects
```

Ý nghĩa: dữ liệu (`boards, labels, tasks, task_labels`), cột, ràng buộc, index, trigger, policy, quyền và mọi hàm
hiện có **giống hệt** trước/sau migration, sau khi Agent dùng, sau rollback và sau khi áp lại.

Giả định cần chủ dự án xác nhận trên Cloud: Supabase Dashboard → Database → Migrations chỉ có
`20261122000000` (M9; M10 không có migration). Nếu khác, báo lại để tôi kiểm tra trước khi áp dụng.

Ảnh hưởng vận hành khác: bản Production (`main`) không gọi các bảng/hàm mới → không đổi hành vi. Xóa một tài
khoản trong `auth.users` sẽ xóa luôn bản ghi `agent_*` của họ (cascade) — đúng mong muốn.

## 8. Kế hoạch rollback an toàn

File: `supabase/rollbacks/20261123000000_agent_approvals.down.sql` (đặt **ngoài** `supabase/migrations` để không
bao giờ tự chạy):

```sql
-- Rollback for supabase/migrations/20261123000000_agent_approvals.sql (M11 AI assistant).
-- NOT a migration: kept outside supabase/migrations so it is never applied automatically.
-- Removes ONLY the M11 objects. boards / labels / tasks / task_labels and their policies, grants and
-- functions are not touched (verified: docs/m11-migration-review.md, section 7).
-- Data loss: pending/decided agent approvals and the agent request log (no user board/task data).
-- Run the whole file in one transaction (SQL Editor or psql -1).
begin;
drop function if exists public.agent_execute_approval(uuid, uuid, text, uuid);
drop function if exists public.agent_consume_claim(uuid, uuid, text, uuid);
drop function if exists public.agent_reject_approval(uuid, text, uuid);
drop function if exists public.agent_claim_approval(uuid, text, uuid);
drop function if exists public.agent_create_approval(text, uuid, text, text, integer);
drop function if exists public.agent_rate_limit_hit();
drop table if exists public.agent_approvals;
drop table if exists public.agent_requests;
-- the CLI records applied migrations here; remove the entry so the migration can be re-applied later
delete from supabase_migrations.schema_migrations where version = '20261123000000';
commit;
```

Quy trình đề xuất:
1. Trước khi áp dụng: Supabase Dashboard → Database → Backups, ghi lại thời điểm bản sao lưu gần nhất (hoặc
   `pg_dump` schema `public`).
2. Nếu cần gỡ: Vercel → tắt Trợ lý (xóa `OPENAI_API_KEY` khỏi Preview → API trả 503) rồi chạy file rollback
   trong SQL Editor (một transaction). Thứ tự an toàn: tắt API trước, gỡ DB sau.
3. Kiểm tra: `select count(*) from pg_proc where proname like 'agent\_%'` = 0 và
   `select to_regclass('public.agent_approvals')` là null.
4. Dữ liệu mất khi rollback: chỉ các yêu cầu duyệt + nhật ký số lần gọi. **Không** mất bảng/công việc.
5. Đã chạy thử đầy đủ (mục 7): rollback gỡ sạch, áp lại thành công.

## 9. Phương án Supabase project riêng cho M11 Preview

| | Dùng chung project Production | Project riêng cho Preview (**khuyến nghị**) |
|---|---|---|
| Rủi ro với dữ liệu thật | Có (dù migration chỉ thêm) | **Không** |
| Cần phê duyệt migration Production ngay | Có | **Không** — chỉ khi merge M11 |
| Kiểm thử phá hủy / rollback trên Cloud | Không nên | Thoải mái |
| Dữ liệu trên Preview | Dữ liệu thật của bạn | Dữ liệu thử (đăng nhập lại, bảng mẫu) |
| Cấu hình thêm | Không | Project mới, Google OAuth, biến Vercel cho Preview |
| Chi phí / giới hạn | Không đổi | Gói Free cho 2 project active; project Free tự tạm dừng sau ~7 ngày không dùng |
| Lệch schema | Không | Phải áp đủ cả `20261122000000_init.sql` và M11 |
| Diễn tập trước khi lên Production | Không | **Có** — đúng các bước sẽ làm khi merge |

Thay đổi cấu hình cần làm (bạn tự làm trên dashboard; tôi không cần và không xin secret):
1. **Supabase**: tạo project mới (ví dụ `flowboard-preview`, cùng region). Database → SQL Editor: chạy lần lượt
   `supabase/migrations/20261122000000_init.sql` rồi `20261123000000_agent_approvals.sql`
   (hoặc `npx supabase link --project-ref <ref-mới>` + `npx supabase db push`).
2. **Supabase Auth** (project mới): Providers → Google: nhập Client ID/Secret (có thể dùng OAuth client hiện có).
   URL Configuration: Site URL = URL Preview; Redirect URLs thêm
   `https://flowboard-kanban-git-claude-m11-ai-agent-dorai4vn.vercel.app/**`.
3. **Google Cloud Console** → OAuth client → Authorized redirect URIs: **thêm**
   `https://<ref-mới>.supabase.co/auth/v1/callback` (chỉ thêm, không xóa URI của Production).
4. **Vercel** → Settings → Environment Variables: thêm biến **chỉ cho Preview, giới hạn nhánh
   `claude/m11-ai-agent`** (Vercel cho phép biến theo nhánh, ưu tiên hơn biến Preview chung, **không sửa** biến
   hiện có của Production):
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (của project mới), `OPENAI_API_KEY`, `AGENT_STATE_SECRET`.
   Rồi Redeploy bản Preview (biến `VITE_` được nhúng lúc build).
5. Không cần đổi code: server đọc `SUPABASE_URL`/`VITE_SUPABASE_URL` từ môi trường.

## 10. `AGENT_STATE_SECRET`

**Mục đích.** Khóa HMAC-SHA256 ký trạng thái hội thoại (RunState của SDK) được lưu trong
`agent_approvals.run_state` giữa hai request (chat → duyệt). Chữ ký phủ `user_id + action + target_id +
run_state` (`server/agent/runStateMac.ts`). Trước khi chạy tiếp sau khi duyệt, server kiểm tra chữ ký bằng so sánh
thời gian hằng; sai → 422, không xóa gì. Nó chống việc ai đó sửa hội thoại đã lưu (qua quyền quản trị DB, SQL
Editor, service-role hay một lỗi trong tương lai) để biến lời gọi tool thành thao tác khác, hoặc chuyển nó sang
người dùng khác. Không dùng cho đăng nhập, không gửi về trình duyệt, không lưu trong DB.

**Định dạng và độ dài.** Chuỗi bất kỳ, sau khi bỏ khoảng trắng đầu/cuối phải **≥ 32 ký tự** (kiểm tra trong
`server/agent/config.ts`; có test). Khuyến nghị 48 byte ngẫu nhiên dạng base64 (64 ký tự), tạo trên máy bạn:
`openssl rand -base64 48`. Không dấu nháy, không xuống dòng. Mỗi môi trường một giá trị riêng (Preview ≠ Production);
không dùng lại khóa OpenAI hay khóa Supabase.

**Thiếu hoặc quá ngắn.** Khi chạy trên Vercel (`VERCEL` hoặc `NODE_ENV=production`) server coi là chưa cấu
hình → mọi lời gọi trả 503 "Trợ lý AI chưa được cấu hình" (từ chối an toàn). Chỉ khi chạy cục bộ mới được suy ra tạm.

**Thay đổi (xoay khóa).** Có hiệu lực sau Redeploy. Các yêu cầu xóa đang chờ (tối đa 10 phút tuổi) ký bằng khóa cũ
sẽ không còn hợp lệ: bấm "Xóa" nhận 422 "Thông tin xác nhận không khớp… Không có gì bị xóa", người dùng chỉ cần nhờ
Trợ lý tạo yêu cầu mới. Không mất dữ liệu, không có thao tác nào chạy sai. Đọc/tạo/sửa không bị ảnh hưởng.

**Mất khóa.** Không cần khôi phục: tạo khóa mới và Redeploy — hậu quả giống xoay khóa.

**Lộ khóa.** Một mình khóa không đủ để tấn công: kẻ tấn công còn phải ghi được cột `run_state` (người dùng thường
không có quyền ghi; chỉ quản trị DB/service-role). Dù vậy hãy xoay khóa ngay.

**Cấu hình an toàn trên Vercel Preview.**
1. Tạo giá trị trên máy bạn (`openssl rand -base64 48`), không lưu vào repo, không gửi qua chat.
2. Vercel → Project → Settings → Environment Variables → Add: Key `AGENT_STATE_SECRET`, Value dán trực tiếp,
   Environments **chỉ Preview** (có thể giới hạn nhánh `claude/m11-ai-agent`), bật **Sensitive** để giá trị
   không đọc lại được sau khi lưu.
3. Không chọn Production / Development. Deployments → bản Preview mới nhất → Redeploy.
4. Kiểm tra: không có log nào in giá trị (code không bao giờ log secret; `npm run check:secrets` chặn commit khóa).

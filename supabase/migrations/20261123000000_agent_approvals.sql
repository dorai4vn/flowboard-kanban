-- FlowBoard M11: AI assistant support. ADDITIVE ONLY — no existing table, policy or function is changed.
--
-- * agent_requests: per-user request log for rate limiting (insert/select own rows only, never update/delete).
-- * agent_approvals: server-side human approvals for destructive agent actions (delete task / delete board).
--   Clients may only SELECT their own rows (without the serialized run state). Every state change goes
--   through the functions below, which check auth.uid() explicitly. The SECURITY DEFINER functions are
--   narrowly scoped: they only read/write agent_approvals and read the caller's own boards/tasks to build
--   the approval label. The actual DELETE runs in agent_execute_approval as SECURITY INVOKER, so RLS on
--   boards/tasks still applies to the deletion itself.
--
-- Rollback (if ever needed): drop function public.agent_execute_approval(uuid, uuid, text, uuid),
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
grant select, insert on table public.agent_requests to authenticated;
create policy agent_requests_select_own on public.agent_requests for select to authenticated
  using (user_id = (select auth.uid()));
create policy agent_requests_insert_own on public.agent_requests for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ============================================================== approvals
create table public.agent_approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null check (action in ('delete_task', 'delete_board')),
  target_id uuid not null,
  target_label text not null,
  detail jsonb not null default '{}'::jsonb,
  run_state text not null check (char_length(run_state) <= 500000),
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

  -- the target must belong to the caller (explicit check: this function bypasses RLS)
  if p_action = 'delete_task' then
    select t.title, jsonb_build_object('board_id', b.id, 'board_name', b.name, 'status', t.status)
      into v_label, v_detail
      from public.tasks t join public.boards b on b.id = t.board_id
     where t.id = p_target and t.user_id = v_uid;
  else
    select b.name, jsonb_build_object('task_count', (select count(*) from public.tasks t where t.board_id = b.id and t.user_id = v_uid))
      into v_label, v_detail
      from public.boards b
     where b.id = p_target and b.user_id = v_uid;
  end if;
  if v_label is null then
    raise exception 'target not found' using errcode = 'P0002';
  end if;

  if (select count(*) from public.agent_approvals a where a.user_id = v_uid and a.status = 'pending' and a.expires_at > now()) >= 10 then
    raise exception 'too many pending approvals' using errcode = '53400';
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
  if v_row.status <> 'pending' then
    return jsonb_build_object('code', 'already_decided');
  end if;
  if v_row.expires_at <= now() then
    update public.agent_approvals set status = 'expired', decided_at = now() where id = p_id;
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
  update public.agent_approvals set status = 'rejected', decided_at = now() where id = p_id;
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
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  update public.agent_approvals a
     set status = 'executed'
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

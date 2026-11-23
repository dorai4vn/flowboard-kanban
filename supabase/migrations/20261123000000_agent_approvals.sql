-- FlowBoard M11: AI assistant support. ADDITIVE ONLY — no existing table, policy or function is changed.
--
-- * agent_requests: per-user request log for rate limiting. Rows are only written by agent_rate_limit_hit(),
--   which caps the log at 30 rows per 10 minutes per user.
-- * Housekeeping (agent_housekeeping, internal): every agent call clears expired run states and deletes rows
--   older than a day FOR ALL ACCOUNTS (bounded batches), so abandoned accounts cannot keep data around.
-- * agent_approvals: server-side human approvals for destructive agent actions (delete task / delete board).
--   Clients may only SELECT their own rows (without the serialized run state; the server receives it from
--   agent_claim_approval and the MAC binds it to user + action + target). Every state change goes
--   through the functions below, which check auth.uid() explicitly. The SECURITY DEFINER functions are
--   narrowly scoped: they only read/write agent_approvals and read the caller's own boards/tasks to build
--   the approval label. The actual DELETE runs in agent_execute_approval as SECURITY INVOKER, so RLS on
--   boards/tasks still applies to the deletion itself.
--
-- Rollback: supabase/rollbacks/20261123000000_agent_approvals.down.sql. Drops public.agent_rate_limit_hit(), public.agent_housekeeping(), public.agent_execute_approval(uuid, uuid, text, uuid),
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


-- ============================================================== approvals
create table public.agent_approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null check (action in ('delete_task', 'delete_board')),
  target_id uuid not null,
  target_label text not null,
  detail jsonb not null default '{}'::jsonb,
  run_state text not null check (octet_length(run_state) <= 131072),
  run_state_mac text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'executed', 'rejected', 'expired')),
  claim_token uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_at timestamptz
);
create index agent_approvals_user_status_idx on public.agent_approvals (user_id, status);
create index agent_approvals_expires_idx on public.agent_approvals (expires_at);
create index agent_requests_time_idx on public.agent_requests (created_at);

alter table public.agent_approvals enable row level security;
alter table public.agent_approvals force row level security;
revoke all on table public.agent_approvals from anon, authenticated, public;
-- column-level: clients never read the serialized run state, its MAC or the claim token
grant select (id, user_id, action, target_id, target_label, detail, status, created_at, expires_at, decided_at)
  on table public.agent_approvals to authenticated;
create policy agent_approvals_select_own on public.agent_approvals for select to authenticated
  using (user_id = (select auth.uid()));


-- -------------------------------------------------------------- housekeeping (internal, all accounts, bounded)
create function public.agent_housekeeping()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- expired requests keep no conversation, whatever their status; open ones are closed
  update public.agent_approvals a
     set run_state = '',
         status = case when a.status in ('pending', 'approved') then 'expired' else a.status end,
         decided_at = coalesce(a.decided_at, now())
   where a.id in (select x.id from public.agent_approvals x
                   where x.expires_at <= now() and (x.run_state <> '' or x.status in ('pending', 'approved'))
                   limit 200 for update skip locked);
  delete from public.agent_approvals a
   where a.id in (select x.id from public.agent_approvals x
                   where x.expires_at < now() - interval '1 day'
                      or (x.status <> 'pending' and x.created_at < now() - interval '1 day')
                   limit 500 for update skip locked);
  delete from public.agent_requests r
   where r.id in (select x.id from public.agent_requests x where x.created_at < now() - interval '1 day' limit 500 for update skip locked);
end;
$$;
revoke all on function public.agent_housekeeping() from public, anon, authenticated;

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
  perform public.agent_housekeeping();
  perform pg_advisory_xact_lock(hashtextextended('agent_requests:' || v_uid::text, 0));
  if (select count(*) from public.agent_requests r where r.user_id = v_uid and r.created_at > now() - interval '10 minutes') >= 30 then
    return false;
  end if;
  insert into public.agent_requests (user_id) values (v_uid);
  return true;
end;
$$;
revoke all on function public.agent_rate_limit_hit() from public, anon;
grant execute on function public.agent_rate_limit_hit() to authenticated;

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
  if octet_length(p_run_state) > 131072 or octet_length(p_run_state_mac) > 200 then
    raise exception 'run state too large' using errcode = '54000';
  end if;
  -- serialise this user's creations so the budgets below cannot be raced
  perform pg_advisory_xact_lock(hashtextextended('agent_approvals:' || v_uid::text, 0));
  perform public.agent_housekeeping();

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
  select * into v_row from public.agent_approvals a
   where a.id = p_id and a.user_id = v_uid and a.status = 'approved' and a.claim_token = p_claim
     and a.action = p_action and a.target_id = p_target
     for update;
  if not found then
    return jsonb_build_object('code', 'invalid_claim');
  end if;
  -- the target may have been deleted elsewhere since the card was shown: close the approval cleanly
  if (p_action = 'delete_task' and not exists (select 1 from public.tasks t where t.id = p_target and t.user_id = v_uid))
     or (p_action = 'delete_board' and not exists (select 1 from public.boards b where b.id = p_target and b.user_id = v_uid)) then
    update public.agent_approvals set status = 'expired', run_state = '', decided_at = now() where id = p_id;
    return jsonb_build_object('code', 'target_missing');
  end if;
  if p_action = 'delete_board' then
    -- lock the board (blocks concurrent task inserts via the FK) and compare with the approved task set
    perform 1 from public.boards b where b.id = p_target and b.user_id = v_uid for update;
    if (select coalesce(jsonb_agg(t.id order by t.id), '[]'::jsonb) from public.tasks t where t.board_id = p_target and t.user_id = v_uid)
       is distinct from coalesce(v_row.detail->'task_ids', '[]'::jsonb) then
      update public.agent_approvals set status = 'expired', run_state = '', decided_at = now() where id = p_id;
      return jsonb_build_object('code', 'target_changed');
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

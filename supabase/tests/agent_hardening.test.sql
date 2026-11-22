-- M11 review fixes: storage/rate abuse through direct RPC calls, fixed cascade scope for board deletion,
-- run state retention, stale claims.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into auth.users (id, email, aud, role, instance_id) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

create function pg_temp.as_user(uid text) returns void language plpgsql as $f$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $f$;

select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');
select public.create_board('{"id":"a0000000-0000-4000-8000-0000000000b1","name":"Bảng A"}'::jsonb, '[]'::jsonb,
  '[{"id":"a0000000-0000-4000-8000-0000000000d1","title":"Việc A1","status":"todo","position":0}]'::jsonb, false);
select public.create_board('{"id":"a0000000-0000-4000-8000-0000000000b2","name":"Bảng hai"}'::jsonb, '[]'::jsonb,
  '[{"id":"a0000000-0000-4000-8000-0000000000d2","title":"Việc hai","status":"todo","position":0}]'::jsonb, false);
create temp table ids (k text primary key, v jsonb) on commit drop;
grant all on ids to authenticated;

-- ---------- request log: only through the capped function ----------
select throws_ok($$ insert into public.agent_requests default values $$, '42501', null, 'direct inserts into the request log are closed');
select is((select count(*) filter (where public.agent_rate_limit_hit()) from generate_series(1, 31)), 30::bigint, '30 requests per window are allowed');
select is(public.agent_rate_limit_hit(), false, 'the 31st request is refused');
select is((select count(*) from public.agent_requests), 30::bigint, 'refused requests are not logged (log cannot grow without bound)');

-- ---------- run state size ----------
select throws_ok($$ select public.agent_create_approval('delete_task', 'a0000000-0000-4000-8000-0000000000d1', repeat('x', 200001), 'M') $$, '54000', null, 'oversized run state refused');

-- ---------- board deletion is bound to the tasks shown on the card ----------
insert into ids select 'b1', public.agent_create_approval('delete_board', 'a0000000-0000-4000-8000-0000000000b1', 'STATE', 'MAC');
select public.save_task('{"id":"a0000000-0000-4000-8000-0000000000d9","board_id":"a0000000-0000-4000-8000-0000000000b1","title":"Việc mới","status":"todo"}'::jsonb, '{}'::uuid[]);
insert into ids select 'c1', public.agent_claim_approval((select (v->>'id')::uuid from ids where k='b1'), 'delete_board', 'a0000000-0000-4000-8000-0000000000b1');
select is(public.agent_execute_approval((select (v->>'id')::uuid from ids where k='b1'), (select (v->>'claim_token')::uuid from ids where k='c1'), 'delete_board', 'a0000000-0000-4000-8000-0000000000b1')->>'code',
  'target_changed', 'a board that gained tasks after the card was shown is not deleted');
select is((select count(*) from public.boards where id = 'a0000000-0000-4000-8000-0000000000b1'), 1::bigint, 'board kept');
select is((select count(*) from public.tasks where board_id = 'a0000000-0000-4000-8000-0000000000b1'), 2::bigint, 'its tasks kept');
select is((select status from public.agent_approvals where id = (select (v->>'id')::uuid from ids where k='b1')), 'expired', 'the stale approval is closed');

insert into ids select 'b2', public.agent_create_approval('delete_board', 'a0000000-0000-4000-8000-0000000000b2', 'STATE', 'MAC');
insert into ids select 'c2', public.agent_claim_approval((select (v->>'id')::uuid from ids where k='b2'), 'delete_board', 'a0000000-0000-4000-8000-0000000000b2');
select is(public.agent_execute_approval((select (v->>'id')::uuid from ids where k='b2'), (select (v->>'claim_token')::uuid from ids where k='c2'), 'delete_board', 'a0000000-0000-4000-8000-0000000000b2')->>'code',
  'ok', 'an unchanged board is deleted');

-- ---------- decided approvals keep no run state ----------
insert into ids select 'r1', public.agent_create_approval('delete_task', 'a0000000-0000-4000-8000-0000000000d1', 'STATE', 'MAC');
select public.agent_reject_approval((select (v->>'id')::uuid from ids where k='r1'), 'delete_task', 'a0000000-0000-4000-8000-0000000000d1');
reset role;
select is((select string_agg(distinct run_state, ',') from public.agent_approvals where status <> 'pending'), '', 'executed, rejected and expired approvals no longer store the run state');

-- ---------- stale claim (server died mid-request) can be claimed again; a fresh one cannot ----------
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');
insert into ids select 's1', public.agent_create_approval('delete_task', 'a0000000-0000-4000-8000-0000000000d1', 'STATE', 'MAC');
select is(public.agent_claim_approval((select (v->>'id')::uuid from ids where k='s1'), 'delete_task', 'a0000000-0000-4000-8000-0000000000d1')->>'code', 'ok', 'first claim');
select is(public.agent_claim_approval((select (v->>'id')::uuid from ids where k='s1'), 'delete_task', 'a0000000-0000-4000-8000-0000000000d1')->>'code', 'already_decided', 'an in-flight claim cannot be taken over');
reset role;
update public.agent_approvals set decided_at = now() - interval '3 minutes' where id = (select (v->>'id')::uuid from ids where k='s1');
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');
select is(public.agent_claim_approval((select (v->>'id')::uuid from ids where k='s1'), 'delete_task', 'a0000000-0000-4000-8000-0000000000d1')->>'code', 'ok', 'an abandoned claim can be approved again');

-- ---------- claimed-but-unfinished approvals also count toward the 10 open requests ----------
select lives_ok($$ select public.agent_claim_approval((public.agent_create_approval('delete_task', 'a0000000-0000-4000-8000-0000000000d1', 'S', 'M')->>'id')::uuid, 'delete_task', 'a0000000-0000-4000-8000-0000000000d1') from generate_series(1, 9) $$, 'nine claimed approvals (plus the re-claimed one above)');
select throws_ok($$ select public.agent_create_approval('delete_task', 'a0000000-0000-4000-8000-0000000000d1', 'S', 'M') $$, '53400', null, 'claimed approvals count toward the open limit');
reset role;
update public.agent_approvals set status = 'rejected', run_state = '' where status = 'approved';
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');

-- ---------- creation budget counts every status (create + reject cannot loop forever) ----------
select lives_ok($$
  select public.agent_reject_approval((public.agent_create_approval('delete_task', 'a0000000-0000-4000-8000-0000000000d1', 'S', 'M')->>'id')::uuid, 'delete_task', 'a0000000-0000-4000-8000-0000000000d1')
    from generate_series(1, 17) $$, 'create + reject within the hourly budget');
select throws_ok($$ select public.agent_create_approval('delete_task', 'a0000000-0000-4000-8000-0000000000d1', 'S', 'M') $$, '53400', null, 'more than 30 approvals per hour refused even if all were rejected');

-- ---------- retention ----------
reset role;
update public.agent_approvals set created_at = now() - interval '2 days' where status <> 'pending';
update public.agent_requests set created_at = now() - interval '2 days';
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');
select lives_ok($$ select public.agent_create_approval('delete_task', 'a0000000-0000-4000-8000-0000000000d1', 'S', 'M') $$, 'budget frees up after an hour');
select is((select count(*) from public.agent_approvals where status <> 'pending'), 0::bigint, 'decided approvals older than a day are purged');
select public.agent_rate_limit_hit();
select is((select count(*) from public.agent_requests), 1::bigint, 'request log keeps only the last day');

select * from finish();
rollback;

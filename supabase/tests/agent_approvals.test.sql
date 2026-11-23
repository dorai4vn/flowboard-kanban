-- M11: backend-enforced approval gate for AI agent deletions + per-user request log.
begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

insert into auth.users (id, email, aud, role, instance_id) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'b@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

create function pg_temp.as_user(uid text) returns void language plpgsql as $f$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $f$;

-- A owns a board with two tasks; B owns one board
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');
select public.create_board('{"id":"a0000000-0000-4000-8000-0000000000b1","name":"Bảng A"}'::jsonb, '[]'::jsonb,
  '[{"id":"a0000000-0000-4000-8000-0000000000d1","title":"Việc A1","status":"todo","position":0},
    {"id":"a0000000-0000-4000-8000-0000000000d2","title":"Việc A2","status":"todo","position":1}]'::jsonb, false);
select pg_temp.as_user('bbbbbbbb-0000-4000-8000-000000000002');
select public.create_board('{"id":"b0000000-0000-4000-8000-0000000000b9","name":"Bảng B"}'::jsonb, '[]'::jsonb,
  '[{"id":"b0000000-0000-4000-8000-0000000000e1","title":"Việc B1","status":"todo","position":0}]'::jsonb, false);

-- ---------- create ----------
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');
create temp table ids (k text primary key, v jsonb) on commit drop;
grant all on ids to authenticated;
insert into ids select 't1', public.agent_create_approval('delete_task', 'a0000000-0000-4000-8000-0000000000d1', 'STATE', 'MAC');
select is((select v->>'target_label' from ids where k='t1'), 'Việc A1', 'approval stores the exact target label');
select is((select v->>'status' from ids where k='t1'), 'pending', 'new approval is pending');
select ok((select (v->>'expires_at')::timestamptz > now() + interval '9 minutes' from ids where k='t1'), 'approval expires in about 10 minutes');
select is((select count(*) from public.agent_approvals), 1::bigint, 'A sees own approval');
select throws_ok($$ select public.agent_create_approval('delete_task', 'b0000000-0000-4000-8000-0000000000e1', 'S', 'M') $$, 'P0002', null, 'A cannot request deletion of B task');
select throws_ok($$ select public.agent_create_approval('drop_table', 'a0000000-0000-4000-8000-0000000000d1', 'S', 'M') $$, '22023', null, 'unknown action rejected');
insert into ids select 'b1', public.agent_create_approval('delete_board', 'a0000000-0000-4000-8000-0000000000b1', 'STATE', 'MAC');
select is((select (v->'detail'->>'task_count')::int from ids where k='b1'), 2, 'board approval shows how many tasks would be deleted');

-- ---------- direct table access is closed ----------
select throws_ok($$ insert into public.agent_approvals (user_id, action, target_id, target_label, run_state, run_state_mac, expires_at)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'delete_task', 'a0000000-0000-4000-8000-0000000000d2', 'x', 's', 'm', now() + interval '1 day') $$, '42501', null, 'no direct insert');
select throws_ok($$ update public.agent_approvals set status = 'approved' $$, '42501', null, 'no direct status update');
select throws_ok($$ delete from public.agent_approvals $$, '42501', null, 'no direct delete');
select throws_ok($$ select run_state from public.agent_approvals $$, '42501', null, 'serialized run state is not readable by clients');

-- ---------- other account ----------
select pg_temp.as_user('bbbbbbbb-0000-4000-8000-000000000002');
select is((select count(*) from public.agent_approvals), 0::bigint, 'B sees none of A approvals');
select is(public.agent_claim_approval((select (v->>'id')::uuid from ids where k='t1'), 'delete_task', 'a0000000-0000-4000-8000-0000000000d1')->>'code', 'not_found', 'B cannot approve A approval');
select is(public.agent_reject_approval((select (v->>'id')::uuid from ids where k='t1'), 'delete_task', 'a0000000-0000-4000-8000-0000000000d1')->>'code', 'not_found', 'B cannot reject A approval');

-- ---------- tamper, claim, replay, execute ----------
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');
select is(public.agent_claim_approval((select (v->>'id')::uuid from ids where k='t1'), 'delete_task', 'a0000000-0000-4000-8000-0000000000d2')->>'code', 'mismatch', 'altered target rejected');
select is(public.agent_claim_approval((select (v->>'id')::uuid from ids where k='t1'), 'delete_board', 'a0000000-0000-4000-8000-0000000000d1')->>'code', 'mismatch', 'altered action rejected');
select is((select status from public.agent_approvals where id = (select (v->>'id')::uuid from ids where k='t1')), 'pending', 'tampering does not consume the approval');
insert into ids select 'c1', public.agent_claim_approval((select (v->>'id')::uuid from ids where k='t1'), 'delete_task', 'a0000000-0000-4000-8000-0000000000d1');
select is((select v->>'code' from ids where k='c1'), 'ok', 'owner claims with exact parameters');
select is((select v->>'run_state' from ids where k='c1'), 'STATE', 'claim returns the stored run state for the server');
select is(public.agent_claim_approval((select (v->>'id')::uuid from ids where k='t1'), 'delete_task', 'a0000000-0000-4000-8000-0000000000d1')->>'code', 'already_decided', 'replayed approval rejected');
select is(public.agent_execute_approval((select (v->>'id')::uuid from ids where k='t1'), gen_random_uuid(), 'delete_task', 'a0000000-0000-4000-8000-0000000000d1')->>'code', 'invalid_claim', 'execution needs the claim token');
select is((select count(*) from public.tasks where id = 'a0000000-0000-4000-8000-0000000000d1'), 1::bigint, 'nothing deleted without a valid claim');
select is(public.agent_execute_approval((select (v->>'id')::uuid from ids where k='t1'), (select (v->>'claim_token')::uuid from ids where k='c1'), 'delete_task', 'a0000000-0000-4000-8000-0000000000d2')->>'code', 'invalid_claim', 'execution with a different target is rejected');
select is(public.agent_execute_approval((select (v->>'id')::uuid from ids where k='t1'), (select (v->>'claim_token')::uuid from ids where k='c1'), 'delete_task', 'a0000000-0000-4000-8000-0000000000d1')->>'code', 'ok', 'approved deletion executes');
select is((select count(*) from public.tasks where id = 'a0000000-0000-4000-8000-0000000000d1'), 0::bigint, 'task really deleted');
select is((select status from public.agent_approvals where id = (select (v->>'id')::uuid from ids where k='t1')), 'executed', 'approval marked executed');
select is(public.agent_execute_approval((select (v->>'id')::uuid from ids where k='t1'), (select (v->>'claim_token')::uuid from ids where k='c1'), 'delete_task', 'a0000000-0000-4000-8000-0000000000d1')->>'code', 'invalid_claim', 'an executed approval cannot run twice');

-- ---------- reject ----------
select is(public.agent_reject_approval((select (v->>'id')::uuid from ids where k='b1'), 'delete_board', 'a0000000-0000-4000-8000-0000000000b1')->>'code', 'ok', 'owner rejects');
select is(public.agent_claim_approval((select (v->>'id')::uuid from ids where k='b1'), 'delete_board', 'a0000000-0000-4000-8000-0000000000b1')->>'code', 'already_decided', 'rejected approval cannot be approved later');
select is((select count(*) from public.boards where id = 'a0000000-0000-4000-8000-0000000000b1'), 1::bigint, 'rejected board still exists');

-- ---------- expiry ----------
insert into ids select 'x1', public.agent_create_approval('delete_task', 'a0000000-0000-4000-8000-0000000000d2', 'S', 'M');
reset role;
update public.agent_approvals set expires_at = now() - interval '1 second' where id = (select (v->>'id')::uuid from ids where k='x1');
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');
select is(public.agent_claim_approval((select (v->>'id')::uuid from ids where k='x1'), 'delete_task', 'a0000000-0000-4000-8000-0000000000d2')->>'code', 'expired', 'expired approval rejected');
select is((select status from public.agent_approvals where id = (select (v->>'id')::uuid from ids where k='x1')), 'expired', 'expired approval is closed');

-- ---------- pending limit ----------
select lives_ok($$ select public.agent_create_approval('delete_task', 'a0000000-0000-4000-8000-0000000000d2', 'S', 'M') from generate_series(1, 10) $$, 'up to 10 pending approvals');
select throws_ok($$ select public.agent_create_approval('delete_task', 'a0000000-0000-4000-8000-0000000000d2', 'S', 'M') $$, '53400', null, 'more than 10 pending approvals refused');

-- ---------- request log (rate limit) ----------
select is(public.agent_rate_limit_hit(), true, 'user logs own request through the capped function');
select throws_ok($$ insert into public.agent_requests (user_id) values ('bbbbbbbb-0000-4000-8000-000000000002') $$, '42501', null, 'cannot log for someone else');
select throws_ok($$ delete from public.agent_requests $$, '42501', null, 'cannot erase own request log');

select * from finish();
rollback;

-- M11 review round 3: storage bounded by bytes, expired run states cleared for every status and for every
-- account (not only when the same user comes back), approvals for already-deleted targets closed cleanly.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email, aud, role, instance_id) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'b@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

create function pg_temp.as_user(uid text) returns void language plpgsql as $f$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $f$;

select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');
select public.create_board('{"id":"a0000000-0000-4000-8000-0000000000b1","name":"Bảng A"}'::jsonb, '[]'::jsonb,
  '[{"id":"a0000000-0000-4000-8000-0000000000d1","title":"Việc A1","status":"todo","position":0},
    {"id":"a0000000-0000-4000-8000-0000000000d2","title":"Việc A2","status":"todo","position":1}]'::jsonb, false);
select pg_temp.as_user('bbbbbbbb-0000-4000-8000-000000000002');
select public.create_board('{"id":"b0000000-0000-4000-8000-0000000000b9","name":"Bảng B"}'::jsonb, '[]'::jsonb,
  '[{"id":"b0000000-0000-4000-8000-0000000000e1","title":"Việc B1","status":"todo","position":0}]'::jsonb, false);
create temp table ids (k text primary key, v jsonb) on commit drop;
grant all on ids to authenticated;

-- ---------- size is limited in bytes, not characters ----------
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');
select throws_ok($$ select public.agent_create_approval('delete_task', 'a0000000-0000-4000-8000-0000000000d1', repeat(chr(128512), 40000), 'M') $$,
  '54000', null, '40 000 four-byte characters (160 KB) are refused');
select lives_ok($$ select public.agent_create_approval('delete_task', 'a0000000-0000-4000-8000-0000000000d1', repeat('x', 100000), 'M') $$, '100 KB is accepted');

-- ---------- A abandons claimed and pending approvals that then expire ----------
insert into ids select 'p1', public.agent_create_approval('delete_task', 'a0000000-0000-4000-8000-0000000000d1', repeat('x', 1000), 'M');
insert into ids select 'c1', public.agent_create_approval('delete_task', 'a0000000-0000-4000-8000-0000000000d2', repeat('x', 1000), 'M');
select public.agent_claim_approval((select (v->>'id')::uuid from ids where k='c1'), 'delete_task', 'a0000000-0000-4000-8000-0000000000d2');
reset role;
update public.agent_approvals set expires_at = now() - interval '1 minute', decided_at = case when status = 'approved' then now() - interval '3 minutes' end
 where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'; -- the claim was abandoned 3 minutes ago

-- B uses the assistant: housekeeping runs for everyone
select pg_temp.as_user('bbbbbbbb-0000-4000-8000-000000000002');
select public.agent_create_approval('delete_task', 'b0000000-0000-4000-8000-0000000000e1', 'S', 'M');
reset role;
select is((select count(*) from public.agent_approvals where user_id = 'aaaaaaaa-0000-4000-8000-000000000001' and run_state <> ''), 0::bigint,
  'expired run states of another account are cleared, whatever their status (pending or approved)');
select is((select status from public.agent_approvals where id = (select (v->>'id')::uuid from ids where k='c1')), 'expired', 'an expired claimed approval is closed');

-- rows expired for more than a day are deleted, also for accounts that never come back
update public.agent_approvals set expires_at = now() - interval '2 days' where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
update public.agent_requests set created_at = now() - interval '2 days';
insert into public.agent_requests (user_id, created_at) values ('aaaaaaaa-0000-4000-8000-000000000001', now() - interval '2 days');
select pg_temp.as_user('bbbbbbbb-0000-4000-8000-000000000002');
select public.agent_rate_limit_hit();
select public.agent_create_approval('delete_task', 'b0000000-0000-4000-8000-0000000000e1', 'S', 'M');
reset role;
select is((select count(*) from public.agent_approvals where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 0::bigint, 'old approvals of an inactive account are purged');
select is((select count(*) from public.agent_requests where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 0::bigint, 'old request log rows of an inactive account are purged');

-- ---------- a claim being executed at the moment of expiry is not closed under it ----------
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');
insert into ids select 'e1', public.agent_create_approval('delete_task', 'a0000000-0000-4000-8000-0000000000d1', 'S', 'M');
insert into ids select 'e2', public.agent_claim_approval((select (v->>'id')::uuid from ids where k='e1'), 'delete_task', 'a0000000-0000-4000-8000-0000000000d1');
reset role;
update public.agent_approvals set expires_at = now() - interval '1 second' where id = (select (v->>'id')::uuid from ids where k='e1');
select pg_temp.as_user('bbbbbbbb-0000-4000-8000-000000000002');
select public.agent_rate_limit_hit();
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');
select is(public.agent_execute_approval((select (v->>'id')::uuid from ids where k='e1'), (select (v->>'claim_token')::uuid from ids where k='e2'), 'delete_task', 'a0000000-0000-4000-8000-0000000000d1')->>'code',
  'ok', 'housekeeping by another request does not break an in-flight approved deletion');

-- ---------- target deleted elsewhere before approval ----------
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');
insert into ids select 'g1', public.agent_create_approval('delete_task', 'a0000000-0000-4000-8000-0000000000d2', 'S', 'M');
insert into ids select 'g2', public.agent_claim_approval((select (v->>'id')::uuid from ids where k='g1'), 'delete_task', 'a0000000-0000-4000-8000-0000000000d2');
delete from public.tasks where id = 'a0000000-0000-4000-8000-0000000000d2';
select is(public.agent_execute_approval((select (v->>'id')::uuid from ids where k='g1'), (select (v->>'claim_token')::uuid from ids where k='g2'), 'delete_task', 'a0000000-0000-4000-8000-0000000000d2')->>'code',
  'target_missing', 'approving a target that no longer exists reports target_missing');
select is((select status from public.agent_approvals where id = (select (v->>'id')::uuid from ids where k='g1')), 'expired', 'and closes the approval');
select is((select count(*) from public.tasks where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'), 0::bigint, 'only the two targeted tasks are gone');

select * from finish();
rollback;

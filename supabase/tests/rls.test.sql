-- Row Level Security: two users A and B plus anon. Every table, every operation.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- test helper: run a statement as the current role and return how many rows it touched
create function pg_temp.affected(sql text) returns bigint language plpgsql as $f$
declare n bigint; begin execute sql; get diagnostics n = row_count; return n; end $f$;

insert into auth.users (id, email, aud, role, instance_id) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'b@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

-- ---------- user A creates data with plain inserts (insert policy) ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok($$ insert into public.boards (id, name) values ('a0000000-0000-4000-8000-0000000000b1', 'Bảng A') $$, 'A inserts own board');
select lives_ok($$ insert into public.labels (id, board_id, name, color) values ('a0000000-0000-4000-8000-0000000000c1', 'a0000000-0000-4000-8000-0000000000b1', 'Học tập', 'blue') $$, 'A inserts own label');
select lives_ok($$ insert into public.labels (id, board_id, name, color) values ('a0000000-0000-4000-8000-0000000000c2', 'a0000000-0000-4000-8000-0000000000b1', 'Gấp', 'red') $$, 'A inserts a second, unlinked label');
select lives_ok($$ insert into public.tasks (id, board_id, title, status, position) values ('a0000000-0000-4000-8000-0000000000d1', 'a0000000-0000-4000-8000-0000000000b1', 'Việc của A', 'todo', 0) $$, 'A inserts own task');
select lives_ok($$ insert into public.task_labels (task_id, label_id) values ('a0000000-0000-4000-8000-0000000000d1', 'a0000000-0000-4000-8000-0000000000c1') $$, 'A links own label');
select is((select user_id from public.boards where id = 'a0000000-0000-4000-8000-0000000000b1'), 'aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'user_id defaults to auth.uid()');

select throws_ok($$ insert into public.tasks (id, board_id, title, status) values (gen_random_uuid(), 'a0000000-0000-4000-8000-0000000000b1', '   ', 'todo') $$, '23514', null, 'blank title rejected by CHECK');
select throws_ok($$ insert into public.tasks (id, board_id, title, status, priority) values (gen_random_uuid(), 'a0000000-0000-4000-8000-0000000000b1', 'x', 'todo', 'x') $$, '23514', null, 'unknown priority rejected');
select throws_ok($$ insert into public.tasks (id, board_id, title, status) values (gen_random_uuid(), 'a0000000-0000-4000-8000-0000000000b1', 'x', 'later') $$, '23514', null, 'unknown status rejected');
select throws_ok($$ update public.tasks set user_id = 'bbbbbbbb-0000-4000-8000-000000000002' where id = 'a0000000-0000-4000-8000-0000000000d1' $$, '42501', null, 'A cannot hand a task over to B');

-- ---------- user B ----------
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok($$ insert into public.boards (id, name) values ('b0000000-0000-4000-8000-0000000000b2', 'Bảng B') $$, 'B inserts own board');

select is((select count(*) from public.boards), 1::bigint, 'B sees only its own board');
select is((select count(*) from public.labels), 0::bigint, 'B sees no labels of A');
select is((select count(*) from public.tasks), 0::bigint, 'B sees no tasks of A');
select is((select count(*) from public.task_labels), 0::bigint, 'B sees no task_labels of A');

select is(pg_temp.affected($$ update public.boards set name = 'hack' where id = 'a0000000-0000-4000-8000-0000000000b1' $$), 0::bigint, 'B cannot update A board');
select is(pg_temp.affected($$ update public.tasks set title = 'hack' where id = 'a0000000-0000-4000-8000-0000000000d1' $$), 0::bigint, 'B cannot update A task');
select is(pg_temp.affected($$ update public.labels set name = 'hack' where id = 'a0000000-0000-4000-8000-0000000000c1' $$), 0::bigint, 'B cannot update A label');
select is(pg_temp.affected($$ delete from public.tasks where id = 'a0000000-0000-4000-8000-0000000000d1' $$), 0::bigint, 'B cannot delete A task');
select is(pg_temp.affected($$ delete from public.boards where id = 'a0000000-0000-4000-8000-0000000000b1' $$), 0::bigint, 'B cannot delete A board');
select is(pg_temp.affected($$ delete from public.task_labels $$), 0::bigint, 'B cannot delete A task_labels');

select throws_ok($$ insert into public.tasks (id, board_id, title, status) values (gen_random_uuid(), 'a0000000-0000-4000-8000-0000000000b1', 'chen ngang', 'todo') $$, '23503', null, 'B cannot add a task to A board (composite FK)');
select throws_ok($$ insert into public.labels (id, board_id, name, color) values (gen_random_uuid(), 'a0000000-0000-4000-8000-0000000000b1', 'x', 'red') $$, '23503', null, 'B cannot add a label to A board (composite FK)');
select throws_ok($$ insert into public.task_labels (task_id, label_id) values ('a0000000-0000-4000-8000-0000000000d1', 'a0000000-0000-4000-8000-0000000000c2') $$, '23503', null, 'B cannot link A task and label');
select throws_ok($$ insert into public.boards (id, name, user_id) values (gen_random_uuid(), 'gia mao', 'aaaaaaaa-0000-4000-8000-000000000001') $$, '42501', null, 'B cannot insert a row owned by A');

-- ---------- back to A: data intact ----------
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select title from public.tasks where id = 'a0000000-0000-4000-8000-0000000000d1'), 'Việc của A', 'A task unchanged after B attempts');
select is((select name from public.boards where id = 'a0000000-0000-4000-8000-0000000000b1'), 'Bảng A', 'A board unchanged after B attempts');

-- ---------- anon ----------
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$ select count(*) from public.boards $$, '42501', null, 'anon cannot read boards');
select throws_ok($$ select count(*) from public.tasks $$, '42501', null, 'anon cannot read tasks');
select throws_ok($$ insert into public.boards (id, name) values (gen_random_uuid(), 'x') $$, '42501', null, 'anon cannot insert boards');
select throws_ok($$ select public.move_task('a0000000-0000-4000-8000-0000000000d1', 'done', array['a0000000-0000-4000-8000-0000000000d1']::uuid[], now()) $$, '42501', null, 'anon cannot call RPCs');

select * from finish();
rollback;

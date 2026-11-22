-- RPCs run as SECURITY INVOKER: RLS still applies, and they must never touch another user's rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, email, aud, role, instance_id) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'b@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';

-- create_board with only_if_empty: starter board exactly once
select is(public.create_board(
  '{"id":"a0000000-0000-4000-8000-0000000000b1","name":"Bảng của tôi","accent":"indigo"}'::jsonb,
  '[{"id":"a0000000-0000-4000-8000-0000000000c1","name":"Học tập","color":"blue"},{"id":"a0000000-0000-4000-8000-0000000000c2","name":"Gấp","color":"red"}]'::jsonb,
  '[{"id":"a0000000-0000-4000-8000-0000000000d1","title":"Một","status":"todo","position":0,"label_ids":["a0000000-0000-4000-8000-0000000000c1"]},
    {"id":"a0000000-0000-4000-8000-0000000000d2","title":"Hai","status":"todo","position":1},
    {"id":"a0000000-0000-4000-8000-0000000000d3","title":"Ba","status":"done","position":0,"completed_at":"2026-11-22T01:00:00Z"}]'::jsonb,
  true), true, 'starter board created for an empty account');
select is(public.create_board('{"id":"a0000000-0000-4000-8000-0000000000b9","name":"Trùng"}'::jsonb, '[]'::jsonb, '[]'::jsonb, true), false, 'starter board not created twice');
select is((select count(*) from public.boards), 1::bigint, 'still exactly one board');
select is((select count(*) from public.tasks), 3::bigint, 'starter tasks inserted');
select is((select count(*) from public.task_labels), 1::bigint, 'starter task labels inserted');
select is(public.create_board('{"id":"a0000000-0000-4000-8000-0000000000b2","name":"Đồ án","accent":"rose"}'::jsonb, '[]'::jsonb, '[]'::jsonb, false), true, 'a second board can be created on demand');
select is((select position from public.boards where id = 'a0000000-0000-4000-8000-0000000000b2'), 1, 'new board is appended after existing ones');

-- save_task: insert then update with label replacement
select lives_ok($$ select public.save_task('{"id":"a0000000-0000-4000-8000-0000000000d4","board_id":"a0000000-0000-4000-8000-0000000000b1","title":"Bốn","description":"","priority":"high","status":"todo","due_date":"2026-11-30","created_at":"2026-11-22T02:00:00Z","updated_at":"2026-11-22T02:00:00Z"}'::jsonb, array['a0000000-0000-4000-8000-0000000000c2']::uuid[]) $$, 'save_task inserts');
select is((select position from public.tasks where id = 'a0000000-0000-4000-8000-0000000000d4'), 2, 'inserted task goes to the end of its column');
select lives_ok($$ select public.save_task('{"id":"a0000000-0000-4000-8000-0000000000d4","board_id":"a0000000-0000-4000-8000-0000000000b1","title":"Bốn (sửa)","description":"mô tả","priority":"urgent","status":"todo","due_date":null,"updated_at":"2026-11-22T03:00:00Z"}'::jsonb, array['a0000000-0000-4000-8000-0000000000c1']::uuid[]) $$, 'save_task updates');
select results_eq($$ select title, priority, due_date, (select array_agg(label_id) from public.task_labels where task_id = t.id) from public.tasks t where id = 'a0000000-0000-4000-8000-0000000000d4' $$,
  $$ values ('Bốn (sửa)'::text, 'urgent'::text, null::date, array['a0000000-0000-4000-8000-0000000000c1'::uuid]) $$, 'update replaced fields and labels');

-- move_task: reorder target column atomically
select lives_ok($$ select public.move_task('a0000000-0000-4000-8000-0000000000d1', 'done', array['a0000000-0000-4000-8000-0000000000d3','a0000000-0000-4000-8000-0000000000d1']::uuid[], '2026-11-22T04:00:00Z') $$, 'move_task moves into done');
select results_eq($$ select id::text, status, position from public.tasks where status = 'done' order by position $$,
  $$ values ('a0000000-0000-4000-8000-0000000000d3', 'done', 0), ('a0000000-0000-4000-8000-0000000000d1', 'done', 1) $$, 'done column ordered as requested');
select throws_ok($$ select public.move_task('a0000000-0000-4000-8000-0000000000d2', 'doing', array['a0000000-0000-4000-8000-0000000000d2','a0000000-0000-4000-8000-0000000000d4']::uuid[], null) $$, '22023', null, 'ordered ids from another column are rejected');

-- user B must not affect A through RPCs
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$ select public.move_task('a0000000-0000-4000-8000-0000000000d2', 'done', array['a0000000-0000-4000-8000-0000000000d2']::uuid[], now()) $$, 'P0002', null, 'B cannot move A task');
select throws_ok($$ select public.save_task('{"id":"a0000000-0000-4000-8000-0000000000d2","board_id":"a0000000-0000-4000-8000-0000000000b1","title":"hack","status":"todo"}'::jsonb, array[]::uuid[]) $$, null, null, 'B cannot overwrite A task via save_task');

set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select title || '/' || status from public.tasks where id = 'a0000000-0000-4000-8000-0000000000d2'), 'Hai/todo', 'A task unchanged after B attempts');

select * from finish();
rollback;

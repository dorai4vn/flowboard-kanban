-- Regression tests for the M9 final review findings.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email, aud, role, instance_id) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';

select public.create_board('{"id":"a0000000-0000-4000-8000-0000000000b1","name":"Một"}'::jsonb,
  '[{"id":"a0000000-0000-4000-8000-0000000000c1","name":"Nhãn 1","color":"blue"}]'::jsonb,
  '[{"id":"a0000000-0000-4000-8000-0000000000d1","title":"Việc","status":"todo","position":0}]'::jsonb, false);
select public.create_board('{"id":"a0000000-0000-4000-8000-0000000000b2","name":"Hai"}'::jsonb,
  '[{"id":"a0000000-0000-4000-8000-0000000000c2","name":"Nhãn 2","color":"red"}]'::jsonb, '[]'::jsonb, false);

select throws_ok($$ select public.move_task('a0000000-0000-4000-8000-0000000000d1', 'done', null, now()) $$, '22023', null, 'move_task rejects a NULL order');
select throws_ok($$ select public.save_task('{"id":"a0000000-0000-4000-8000-0000000000d1","board_id":"a0000000-0000-4000-8000-0000000000b1","title":"Việc"}'::jsonb, array['a0000000-0000-4000-8000-0000000000c2']::uuid[], true) $$, '22023', null, 'save_task rejects a label of another board');
select throws_ok($$ select public.create_board('{"id":"a0000000-0000-4000-8000-0000000000b3","name":"Ba"}'::jsonb, '[]'::jsonb,
  '[{"id":"a0000000-0000-4000-8000-0000000000d3","title":"x","status":"todo","position":0,"label_ids":["a0000000-0000-4000-8000-0000000000c1"]}]'::jsonb, false) $$, '22023', null, 'create_board rejects labels that are not part of the new board');
select is((select count(*) from public.task_labels), 0::bigint, 'no cross-board label links were stored');
select throws_ok($$ select public.move_task('a0000000-0000-4000-8000-0000000000d1', 'todo', array['a0000000-0000-4000-8000-0000000000d1']::uuid[], '2020-01-01') $$, '23514', null, 'a task outside done cannot carry completed_at');
select throws_ok($$ select public.move_task('a0000000-0000-4000-8000-0000000000d1', 'done', array['a0000000-0000-4000-8000-0000000000d1']::uuid[], null) $$, '23514', null, 'a done task must have completed_at');
select lives_ok($$ select public.move_task('a0000000-0000-4000-8000-0000000000d1', 'done', array['a0000000-0000-4000-8000-0000000000d1']::uuid[], now()) $$, 'a consistent move still works');

select * from finish();
rollback;

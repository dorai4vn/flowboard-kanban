insert into auth.users (id, email, aud, role, instance_id) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'b@test.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
select set_config('role','authenticated',false), set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}',false);
select public.create_board('{"id":"a0000000-0000-4000-8000-0000000000b1","name":"Bảng M10 của A","accent":"violet"}'::jsonb,
  '[{"id":"a0000000-0000-4000-8000-0000000000c1","name":"Học tập","color":"blue"}]'::jsonb,
  '[{"id":"a0000000-0000-4000-8000-0000000000d1","title":"Việc quá hạn","status":"todo","position":0,"due_date":"2026-11-01","priority":"high","label_ids":["a0000000-0000-4000-8000-0000000000c1"]},
    {"id":"a0000000-0000-4000-8000-0000000000d2","title":"Việc hôm nay","status":"doing","position":0,"due_date":"2026-11-23"},
    {"id":"a0000000-0000-4000-8000-0000000000d3","title":"Việc xong","status":"done","position":0,"completed_at":"2026-11-20T10:00:00Z"}]'::jsonb, false);
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}',false);
select public.create_board('{"id":"b0000000-0000-4000-8000-0000000000b9","name":"Bảng của B"}'::jsonb, '[]'::jsonb,
  '[{"id":"b0000000-0000-4000-8000-0000000000e1","title":"Việc B","status":"todo","position":0}]'::jsonb, false);
reset role;

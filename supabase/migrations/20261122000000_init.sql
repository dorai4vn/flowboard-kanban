-- FlowBoard M9: per-user Kanban data protected by Row Level Security.
-- Every table carries user_id (default auth.uid()); children reference (parent_id, user_id) so a row
-- can never be attached to another user's parent, even with a guessed id.

-- ===================================================================== tables
create table public.boards (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  accent text not null default 'indigo' check (accent in ('indigo', 'violet', 'blue', 'emerald', 'amber', 'rose')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.labels (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  board_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 30),
  color text not null check (color in ('red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'gray')),
  created_at timestamptz not null default clock_timestamp(),
  unique (id, user_id),
  foreign key (board_id, user_id) references public.boards (id, user_id) on delete cascade
);

create table public.tasks (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  board_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  position integer not null default 0,
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- a task is completed exactly when it sits in the done column
  check ((status = 'done') = (completed_at is not null)),
  unique (id, user_id),
  foreign key (board_id, user_id) references public.boards (id, user_id) on delete cascade
);

create table public.task_labels (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  task_id uuid not null,
  label_id uuid not null,
  primary key (task_id, label_id),
  foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade,
  foreign key (label_id, user_id) references public.labels (id, user_id) on delete cascade
);

create index boards_user_idx on public.boards (user_id, position);
create index labels_board_idx on public.labels (board_id);
create index labels_user_idx on public.labels (user_id);
create index tasks_board_status_idx on public.tasks (board_id, status, position);
create index tasks_user_idx on public.tasks (user_id);
create index task_labels_label_idx on public.task_labels (label_id);
create index task_labels_user_idx on public.task_labels (user_id);

-- ================================================================ privileges + RLS
do $$
declare t text;
begin
  foreach t in array array['boards', 'labels', 'tasks', 'task_labels'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated, public', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_owner_only', t);
  end loop;
end $$;

-- ======================================================================== RPCs
-- All SECURITY INVOKER: they run with the caller's rights, so RLS applies inside.

create function public.create_board(p_board jsonb, p_labels jsonb, p_tasks jsonb, p_only_if_empty boolean default false)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_board uuid := (p_board ->> 'id')::uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_only_if_empty then
    -- serialise concurrent first logins of the same user (two tabs) so the starter board is created once
    perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
    if exists (select 1 from public.boards) then
      return false;
    end if;
  end if;

  insert into public.boards (id, name, accent, position)
  values (
    v_board,
    p_board ->> 'name',
    coalesce(p_board ->> 'accent', 'indigo'),
    (select coalesce(max(b.position) + 1, 0) from public.boards b)
  );

  insert into public.labels (id, board_id, name, color)
  select (l ->> 'id')::uuid, v_board, l ->> 'name', l ->> 'color'
  from jsonb_array_elements(coalesce(p_labels, '[]'::jsonb)) with ordinality as x(l, ord)
  order by ord;

  insert into public.tasks (id, board_id, title, description, priority, status, position, due_date, completed_at, created_at, updated_at)
  select (t ->> 'id')::uuid, v_board, t ->> 'title', coalesce(t ->> 'description', ''),
         coalesce(t ->> 'priority', 'medium'), t ->> 'status', coalesce((t ->> 'position')::integer, 0),
         (t ->> 'due_date')::date, (t ->> 'completed_at')::timestamptz,
         coalesce((t ->> 'created_at')::timestamptz, now()), coalesce((t ->> 'updated_at')::timestamptz, now())
  from jsonb_array_elements(coalesce(p_tasks, '[]'::jsonb)) as t;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_tasks, '[]'::jsonb)) as t,
         jsonb_array_elements_text(coalesce(t -> 'label_ids', '[]'::jsonb)) as lid
    where not exists (select 1 from public.labels l where l.id = lid::uuid and l.board_id = v_board)
  ) then
    raise exception 'label of another board' using errcode = '22023';
  end if;

  insert into public.task_labels (task_id, label_id)
  select (t ->> 'id')::uuid, lid::uuid
  from jsonb_array_elements(coalesce(p_tasks, '[]'::jsonb)) as t,
       jsonb_array_elements_text(coalesce(t -> 'label_ids', '[]'::jsonb)) as lid;

  return true;
end;
$$;

create function public.save_task(p_task jsonb, p_label_ids uuid[], p_must_exist boolean default false)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := (p_task ->> 'id')::uuid;
  v_board uuid := (p_task ->> 'board_id')::uuid;
  v_status text := coalesce(p_task ->> 'status', 'todo');
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if exists (select 1 from public.tasks where id = v_id) then
    -- status/position change only through move_task
    update public.tasks set
      title = p_task ->> 'title',
      description = coalesce(p_task ->> 'description', ''),
      priority = coalesce(p_task ->> 'priority', 'medium'),
      due_date = (p_task ->> 'due_date')::date,
      updated_at = coalesce((p_task ->> 'updated_at')::timestamptz, now())
    where id = v_id;
  elsif p_must_exist then
    -- an edit of a task deleted elsewhere must not bring it back
    raise exception 'task not found' using errcode = 'P0002';
  else
    -- a task id owned by someone else is invisible here, so this insert fails on the primary key
    insert into public.tasks (id, board_id, title, description, priority, status, position, due_date, completed_at, created_at, updated_at)
    values (
      v_id, v_board, p_task ->> 'title', coalesce(p_task ->> 'description', ''),
      coalesce(p_task ->> 'priority', 'medium'), v_status,
      (select coalesce(max(t.position) + 1, 0) from public.tasks t where t.board_id = v_board and t.status = v_status),
      (p_task ->> 'due_date')::date, (p_task ->> 'completed_at')::timestamptz,
      coalesce((p_task ->> 'created_at')::timestamptz, now()), coalesce((p_task ->> 'updated_at')::timestamptz, now())
    );
  end if;

  select t.board_id into v_board from public.tasks t where t.id = v_id;
  if exists (
    select 1 from unnest(coalesce(p_label_ids, '{}'::uuid[])) as lid
    where not exists (select 1 from public.labels l where l.id = lid and l.board_id = v_board)
  ) then
    raise exception 'label of another board' using errcode = '22023';
  end if;

  delete from public.task_labels where task_id = v_id;
  insert into public.task_labels (task_id, label_id)
  select v_id, lid from unnest(coalesce(p_label_ids, '{}'::uuid[])) as lid;
end;
$$;

create function public.move_task(p_task_id uuid, p_status text, p_ordered_ids uuid[], p_completed_at timestamptz)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_board uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select board_id into v_board from public.tasks where id = p_task_id;
  if v_board is null then
    raise exception 'task not found' using errcode = 'P0002';
  end if;
  if p_ordered_ids is null or p_status is null then
    raise exception 'invalid order' using errcode = '22023';
  end if;

  if not (p_task_id = any (p_ordered_ids))
     or cardinality(p_ordered_ids) <> (select count(distinct x) from unnest(p_ordered_ids) as x)
     or cardinality(p_ordered_ids) <> (
       select count(*) from public.tasks t
       where t.id = any (p_ordered_ids) and t.board_id = v_board and (t.id = p_task_id or t.status = p_status)
     ) then
    raise exception 'invalid order' using errcode = '22023';
  end if;

  update public.tasks
  set status = p_status, completed_at = p_completed_at, updated_at = now()
  where id = p_task_id;

  update public.tasks t
  set position = o.ord - 1
  from unnest(p_ordered_ids) with ordinality as o(id, ord)
  where t.id = o.id;
end;
$$;

revoke all on function public.create_board(jsonb, jsonb, jsonb, boolean) from public, anon;
revoke all on function public.save_task(jsonb, uuid[], boolean) from public, anon;
revoke all on function public.move_task(uuid, text, uuid[], timestamptz) from public, anon;
grant execute on function public.create_board(jsonb, jsonb, jsonb, boolean) to authenticated;
grant execute on function public.save_task(jsonb, uuid[], boolean) to authenticated;
grant execute on function public.move_task(uuid, text, uuid[], timestamptz) to authenticated;

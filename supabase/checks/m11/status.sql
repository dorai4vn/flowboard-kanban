-- M11 STATUS (read-only, one SELECT statement). Safe to run any time in the FlowBoard SQL Editor.
-- Tells whether M11 objects exist (fully, partially or not at all), whether they hold data, whether the CLI
-- history records M11, and the state of the M10 tables.
select
  (select count(*) from pg_tables where schemaname = 'public' and tablename in ('boards', 'labels', 'tasks', 'task_labels')) as m10_tables,
  (select count(*) from public.boards) as m10_boards,
  (select count(*) from public.tasks) as m10_tasks,
  (select count(*) from public.labels) as m10_labels,
  (select count(*) from public.task_labels) as m10_task_labels,
  (select string_agg(relname || '=' || relrowsecurity, ' ' order by relname) from pg_class
    where relnamespace = 'public'::regnamespace and relname in ('boards', 'labels', 'tasks', 'task_labels')) as m10_rls,
  (select count(*) from pg_tables where schemaname = 'public' and tablename like 'agent\_%') as agent_tables,
  (select coalesce(string_agg(tablename, ', ' order by tablename), '-') from pg_tables where schemaname = 'public' and tablename like 'agent\_%') as agent_table_names,
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname like 'agent\_%') as agent_functions,
  (select coalesce(string_agg(proname, ', ' order by proname), '-') from pg_proc where pronamespace = 'public'::regnamespace and proname like 'agent\_%') as agent_function_names,
  (case when to_regclass('public.agent_approvals') is null then 0
        else (xpath('/row/n/text()', query_to_xml('select count(*) as n from public.agent_approvals', false, true, '')))[1]::text::int end)
  + (case when to_regclass('public.agent_requests') is null then 0
        else (xpath('/row/n/text()', query_to_xml('select count(*) as n from public.agent_requests', false, true, '')))[1]::text::int end)
    as agent_rows,
  case when to_regclass('supabase_migrations.schema_migrations') is null then 'no CLI history table'
       else coalesce((xpath('/row/v/text()', query_to_xml(
         'select string_agg(version, '', '' order by version) as v from supabase_migrations.schema_migrations', false, true, '')))[1]::text, '(empty)')
  end as migration_history;

-- M11 PRE-FLIGHT (read-only). Run in Supabase Dashboard → SQL Editor on the FlowBoard project BEFORE applying.
-- Expected: m10_tables = 4, agent_objects = 0, history shows only 20261122000000 (or "no CLI history table").
select 'm10_tables' as check, count(*)::text as value from pg_tables
 where schemaname = 'public' and tablename in ('boards', 'labels', 'tasks', 'task_labels')
union all
select 'agent_objects', ((select count(*) from pg_tables where schemaname = 'public' and tablename like 'agent\_%')
                       + (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname like 'agent\_%'))::text
union all
select 'history', case
  when to_regclass('supabase_migrations.schema_migrations') is null then 'no CLI history table (migrations were applied in SQL Editor)'
  else coalesce((xpath('/row/v/text()', query_to_xml(
         'select string_agg(version, '', '' order by version) as v from supabase_migrations.schema_migrations', false, true, '')))[1]::text, '(empty)')
end;

-- Rollback for supabase/migrations/20261123000000_agent_approvals.sql (M11 AI assistant).
-- NOT a migration: kept outside supabase/migrations so it is never applied automatically.
-- One DO statement = atomic in any SQL client (SQL Editor, psql). Removes ONLY the M11 objects;
-- boards / labels / tasks / task_labels and their policies, grants and functions are not touched.
-- Data lost: agent approvals and the agent request log only (no board/task data).
do $rb$
begin
  perform set_config('lock_timeout', '5s', true);
  drop function if exists public.agent_execute_approval(uuid, uuid, text, uuid);
  drop function if exists public.agent_consume_claim(uuid, uuid, text, uuid);
  drop function if exists public.agent_reject_approval(uuid, text, uuid);
  drop function if exists public.agent_claim_approval(uuid, text, uuid);
  drop function if exists public.agent_create_approval(text, uuid, text, text, integer);
  drop function if exists public.agent_rate_limit_hit();
  drop function if exists public.agent_housekeeping();
  drop table if exists public.agent_approvals;
  drop table if exists public.agent_requests;
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute $q$delete from supabase_migrations.schema_migrations where version = '20261123000000'$q$;
  end if;
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename like 'agent\_%')
     or exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname like 'agent\_%') then
    raise exception 'ROLLBACK INCOMPLETE: unexpected agent_* objects remain. Nothing changed.';
  end if;
end
$rb$;

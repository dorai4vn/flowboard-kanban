-- M11 POST-CHECK (read-only). Run right after applying. Every row must show ok = true.
with
fn as (select p.proname, p.prosecdef, p.proconfig, p.proacl from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'agent\_%'),
tb as (select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname like 'agent\_%' and c.relkind = 'r')
select 'two new tables' as check, (select count(*) from tb) = 2 as ok
union all select 'seven new functions', (select count(*) from fn) = 7
union all select 'RLS enabled + forced on new tables', (select bool_and(relrowsecurity and relforcerowsecurity) from tb)
union all select 'search_path pinned on all functions', (select bool_and('search_path=""' = any(proconfig)) from fn)
union all select 'anon has no table privilege on new tables', not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name like 'agent\_%' and grantee in ('anon', 'PUBLIC'))
union all select 'anon cannot execute any agent function', (select bool_and(not has_function_privilege('anon', p.oid, 'execute')) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'agent\_%')
union all select 'authenticated cannot execute housekeeping', not has_function_privilege('authenticated', 'public.agent_housekeeping()', 'execute')
union all select 'authenticated cannot read run_state', not has_column_privilege('authenticated', 'public.agent_approvals', 'run_state', 'select')
union all select 'authenticated cannot insert/update/delete new tables', not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name like 'agent\_%' and grantee = 'authenticated' and privilege_type <> 'SELECT');

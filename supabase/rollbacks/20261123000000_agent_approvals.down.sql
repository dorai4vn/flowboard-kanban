-- Rollback for supabase/migrations/20261123000000_agent_approvals.sql (M11 AI assistant).
-- NOT a migration: kept outside supabase/migrations so it is never applied automatically.
-- Removes ONLY the M11 objects. boards / labels / tasks / task_labels and their policies, grants and
-- functions are not touched (verified: docs/m11-migration-review.md, section 7).
-- Data loss: pending/decided agent approvals and the agent request log (no user board/task data).
-- Run the whole file in one transaction (SQL Editor or psql -1).
begin;
drop function if exists public.agent_execute_approval(uuid, uuid, text, uuid);
drop function if exists public.agent_consume_claim(uuid, uuid, text, uuid);
drop function if exists public.agent_reject_approval(uuid, text, uuid);
drop function if exists public.agent_claim_approval(uuid, text, uuid);
drop function if exists public.agent_create_approval(text, uuid, text, text, integer);
drop function if exists public.agent_rate_limit_hit();
drop function if exists public.agent_housekeeping();
drop table if exists public.agent_approvals;
drop table if exists public.agent_requests;
-- the CLI records applied migrations here; remove the entry so the migration can be re-applied later
delete from supabase_migrations.schema_migrations where version = '20261123000000';
commit;

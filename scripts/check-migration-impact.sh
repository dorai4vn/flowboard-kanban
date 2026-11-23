#!/usr/bin/env bash
# M11 migration impact + rollback check on a THROWAWAY Postgres container (never a real project).
# Seeds M10-style data, then fingerprints data + schema of the existing tables (boards, labels, tasks,
# task_labels) before the migration, after it, after using it, after the rollback and after re-applying.
# Requires Docker and psql. Usage: bash scripts/check-migration-impact.sh
set -euo pipefail
cd "$(dirname "$0")/.."
IMG=${IMG:-supabase/postgres:17.11.0.006}
NAME=m11-migcheck-$$
PORT=${PORT:-54399}
export PGPASSWORD=postgres
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=postgres -p "$PORT:5432" "$IMG" >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
for _ in $(seq 1 60); do psql -h 127.0.0.1 -p "$PORT" -U postgres -Atc 'select 1' >/dev/null 2>&1 && break; sleep 2; done
ADMIN="psql -h 127.0.0.1 -p $PORT -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q"
P="psql -h 127.0.0.1 -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
# auth.uid() as on current Supabase Cloud (reads request.jwt.claims)
$ADMIN -c "create or replace function auth.uid() returns uuid language sql stable as \$\$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid \$\$;"
$P -c "create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations(version text primary key)"
$P -f supabase/migrations/20261122000000_init.sql
$P -f supabase/checks/m11/seed.sql >/dev/null
snap() { $P -Atf supabase/checks/m11/snapshot.sql > "$1"; }
T=$(mktemp -d)
snap "$T/1"
$P -1 -f supabase/migrations/20261123000000_agent_approvals.sql
$P -c "insert into supabase_migrations.schema_migrations values ('20261123000000')"
snap "$T/2"
$P -c "select set_config('role','authenticated',false), set_config('request.jwt.claims','{\"sub\":\"aaaaaaaa-0000-4000-8000-000000000001\",\"role\":\"authenticated\"}',false); select public.agent_rate_limit_hit(); select public.agent_create_approval('delete_task','a0000000-0000-4000-8000-0000000000d1','S','M');" >/dev/null
snap "$T/3"
$P -f supabase/rollbacks/20261123000000_agent_approvals.down.sql
snap "$T/4"
$P -1 -f supabase/migrations/20261123000000_agent_approvals.sql
snap "$T/5"
printf '%-24s %-13s %-13s %-13s %-13s %-13s\n' check before migrated used rolled-back reapplied
paste -d'|' "$T/1" <(cut -d'|' -f2- "$T/2") <(cut -d'|' -f2- "$T/3") <(cut -d'|' -f2- "$T/4") <(cut -d'|' -f2- "$T/5") |
  awk -F'|' '{printf "%-24s %-13.12s %-13.12s %-13.12s %-13.12s %-13.12s\n",$1,$2,$3,$4,$5,$6}'
# every line except the M11 object count must be identical in all five snapshots
for i in 2 3 4 5; do
  if ! diff <(grep -v '^m11.objects' "$T/1") <(grep -v '^m11.objects' "$T/$i") >/dev/null; then echo "FAIL: existing data/schema changed (snapshot $i)"; exit 1; fi
done
grep -q '^m11.objects|0 tables, 0 functions$' "$T/4" || { echo 'FAIL: rollback left M11 objects'; exit 1; }
echo 'PASS: M10 data and schema unchanged at every step; rollback removes all M11 objects'

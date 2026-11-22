-- Shared fixtures are created inside each test file's transaction; this file only checks pgTAP works.
begin;
create extension if not exists pgtap with schema extensions;
select plan(1);
select ok(true, 'pgTAP is available');
select * from finish();
rollback;

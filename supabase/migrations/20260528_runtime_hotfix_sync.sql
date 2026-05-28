-- Sync repository schema state with production hotfixes (2026-05-28)
-- Non-destructive and fresh-DB safe.

-- 1) Runtime tally view in public schema
create or replace view public.v_enforcement_record_tallies as
select
  jurisdiction,
  count(*) as total_records,
  count(distinct statutory_authority) as authority_count,
  max(created_at) as latest_record
from public.legal_enforcement_records
group by jurisdiction;

-- 2) Compat passthrough for runtime tally view
create schema if not exists compat;
create or replace view compat.v_enforcement_record_tallies as
select * from public.v_enforcement_record_tallies;

-- 3) Compatibility projections.
-- Do not rewrite public.entities or public.detected_signals_base here.
-- PostgreSQL cannot safely change an existing view's column list with
-- CREATE OR REPLACE VIEW when adding/removing/reordering columns, and
-- wrapping arbitrary pg_views.definition text is brittle.
-- These compat views provide stable aliases without mutating the source views.

do $$
begin
  if to_regclass('public.entities') is not null then
    execute 'create or replace view compat.entities as select e.*, null::text as legacy_relation_id from public.entities e';
  end if;

  if to_regclass('public.detected_signals_base') is not null then
    execute 'create or replace view compat.detected_signals_base as select d.*, d.created_at as "createdAt" from public.detected_signals_base d';
  end if;
end $$;

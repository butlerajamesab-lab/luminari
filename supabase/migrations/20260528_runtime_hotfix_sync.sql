-- Sync repository schema state with production hotfixes (2026-05-28)
-- Non-destructive, idempotent where possible.

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

-- 3) Add compatibility columns to existing views while preserving behavior/order
--    by wrapping current definitions only when missing.
do $$
declare
  entities_def text;
  detected_def text;
begin
  -- public.entities -> append nullable legacy_relation_id if missing
  if exists (
    select 1 from pg_views where schemaname = 'public' and viewname = 'entities'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'entities' and column_name = 'legacy_relation_id'
  ) then
    select definition into entities_def
    from pg_views
    where schemaname = 'public' and viewname = 'entities';

    execute format(
      'create or replace view public.entities as select v.*, null::text as legacy_relation_id from (%s) v',
      entities_def
    );
  end if;

  -- public.detected_signals_base -> append "createdAt" alias if missing
  if exists (
    select 1 from pg_views where schemaname = 'public' and viewname = 'detected_signals_base'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'detected_signals_base' and column_name = 'createdAt'
  ) then
    select definition into detected_def
    from pg_views
    where schemaname = 'public' and viewname = 'detected_signals_base';

    execute format(
      'create or replace view public.detected_signals_base as select v.*, v.created_at as "createdAt" from (%s) v',
      detected_def
    );
  end if;
end $$;

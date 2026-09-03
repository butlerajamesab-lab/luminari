-- Contract checks for 20260802090000_civic_powers_foundation.sql
-- Run after applying the migration in a disposable or preview database.

begin;

create temporary table civic_power_contract_results (
  check_name text primary key,
  passed boolean not null,
  detail text not null
) on commit drop;

insert into civic_power_contract_results
select
  'required_tables_exist',
  count(*) = 13,
  format('observed=%s expected=13', count(*))
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'civic_power_actor',
    'civic_power_source',
    'civic_power_clause',
    'civic_power_interpretation',
    'civic_power_interpretation_clause',
    'civic_power_interpretation_source',
    'civic_power_edge',
    'civic_power_edge_source',
    'civic_power_application',
    'civic_power_application_authority',
    'civic_power_application_source',
    'civic_power_status_receipt',
    'civic_power_status_receipt_source'
  );

insert into civic_power_contract_results
select
  'rls_enabled',
  count(*) = 13 and bool_and(c.relrowsecurity),
  format('observed=%s expected=13 all_rls=%s', count(*), coalesce(bool_and(c.relrowsecurity), false))
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'civic_power_actor',
    'civic_power_source',
    'civic_power_clause',
    'civic_power_interpretation',
    'civic_power_interpretation_clause',
    'civic_power_interpretation_source',
    'civic_power_edge',
    'civic_power_edge_source',
    'civic_power_application',
    'civic_power_application_authority',
    'civic_power_application_source',
    'civic_power_status_receipt',
    'civic_power_status_receipt_source'
  );

insert into civic_power_contract_results
select
  'canonical_triggers_exist',
  count(*) = 7,
  format('observed=%s expected=7', count(*))
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal
  and n.nspname = 'public'
  and t.tgname in (
    'civic_power_actor_immutable',
    'civic_power_source_immutable',
    'civic_power_clause_immutable',
    'civic_power_interpretation_immutable',
    'civic_power_edge_immutable',
    'civic_power_application_immutable',
    'civic_power_status_receipt_immutable'
  );

insert into civic_power_contract_results
select
  'foundation_is_unseeded',
  (
    select count(*) from public.civic_power_source
  ) = 0
  and (
    select count(*) from public.civic_power_interpretation
  ) = 0
  and (
    select count(*) from public.civic_power_application
  ) = 0,
  format(
    'sources=%s interpretations=%s applications=%s',
    (select count(*) from public.civic_power_source),
    (select count(*) from public.civic_power_interpretation),
    (select count(*) from public.civic_power_application)
  );

insert into civic_power_contract_results
select
  'legacy_constitutional_registry_untouched',
  to_regclass('public.constitutional_registry') is not null,
  'The existing Luminari runtime-doctrine registry remains separate and present.';

insert into civic_power_contract_results
select
  'anon_authenticated_have_no_table_privileges',
  not exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name like 'civic_power_%'
      and grantee in ('anon','authenticated')
  ),
  'No direct browser table grants are permitted in the foundation pass.';

select *
from civic_power_contract_results
order by check_name;

select count(*) = 0 as contract_passed
from civic_power_contract_results
where not passed;

rollback;

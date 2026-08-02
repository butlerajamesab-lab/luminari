-- Contract checks for 20260802090100_civic_powers_application_chain.sql
-- Run after both Civic Powers migrations in a disposable or preview database.

begin;

create temporary table civic_power_application_chain_results (
  check_name text primary key,
  passed boolean not null,
  detail text not null
) on commit drop;

insert into civic_power_application_chain_results
select
  'required_chain_tables_exist',
  count(*) = 3,
  format('observed=%s expected=3', count(*))
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'civic_power_application_actor',
    'civic_power_application_edge',
    'civic_power_application_edge_source'
  );

insert into civic_power_application_chain_results
select
  'chain_rls_enabled',
  count(*) = 3 and bool_and(c.relrowsecurity),
  format('observed=%s expected=3 all_rls=%s', count(*), coalesce(bool_and(c.relrowsecurity), false))
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'civic_power_application_actor',
    'civic_power_application_edge',
    'civic_power_application_edge_source'
  );

insert into civic_power_application_chain_results
select
  'chain_immutable_triggers_exist',
  count(*) = 3,
  format('observed=%s expected=3', count(*))
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal
  and n.nspname = 'public'
  and t.tgname in (
    'civic_power_application_actor_immutable',
    'civic_power_application_edge_immutable',
    'civic_power_application_edge_source_immutable'
  );

insert into civic_power_application_chain_results
select
  'chain_foundation_is_unseeded',
  (select count(*) from public.civic_power_application_actor) = 0
  and (select count(*) from public.civic_power_application_edge) = 0
  and (select count(*) from public.civic_power_application_edge_source) = 0,
  format(
    'actors=%s edges=%s edge_sources=%s',
    (select count(*) from public.civic_power_application_actor),
    (select count(*) from public.civic_power_application_edge),
    (select count(*) from public.civic_power_application_edge_source)
  );

insert into civic_power_application_chain_results
select
  'chain_has_no_browser_privileges',
  not exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (
        'civic_power_application_actor',
        'civic_power_application_edge',
        'civic_power_application_edge_source'
      )
      and grantee in ('anon','authenticated')
  ),
  'No direct anon or authenticated table grants are permitted.';

insert into civic_power_application_chain_results
select
  'noncausal_similar_effect_relation_exists',
  pg_get_constraintdef(oid) like '%produces_similar_effect%',
  'The chain taxonomy can preserve a similar practical effect without asserting implementation or causation.'
from pg_constraint
where conrelid = 'public.civic_power_application_edge'::regclass
  and contype = 'c'
  and pg_get_constraintdef(oid) like '%relation_type%'
limit 1;

select *
from civic_power_application_chain_results
order by check_name;

select count(*) = 0 as contract_passed
from civic_power_application_chain_results
where not passed;

rollback;

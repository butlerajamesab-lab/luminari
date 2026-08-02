-- Contract checks for 20260803000200_civicmap_security_invoker_views.sql.

begin;

create temporary table civicmap_security_results (
  check_name text primary key,
  passed boolean not null,
  detail text not null
) on commit drop;

insert into civicmap_security_results
select
  'map_views_use_invoker_security',
  count(*) = 2 and bool_and('security_invoker=true' = any(coalesce(c.reloptions, array[]::text[]))),
  format(
    'observed=%s expected=2 all_invoker=%s',
    count(*),
    coalesce(bool_and('security_invoker=true' = any(coalesce(c.reloptions, array[]::text[]))), false)
  )
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('v_map_layer1_light', 'v_map_layer2_detail')
  and c.relkind = 'v';

insert into civicmap_security_results
select
  'underlying_tables_have_public_read_rls',
  count(*) = 2 and bool_and(c.relrowsecurity),
  format('observed=%s expected=2 all_rls=%s', count(*), coalesce(bool_and(c.relrowsecurity), false))
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('normalized_civic_resource', 'api_source_registry')
  and c.relkind = 'r';

insert into civicmap_security_results
select
  'public_read_policies_exist',
  count(*) = 2,
  format('observed=%s expected=2', count(*))
from pg_policies
where schemaname = 'public'
  and (
    (tablename = 'normalized_civic_resource' and policyname = 'normalized_civic_resource_public_read')
    or
    (tablename = 'api_source_registry' and policyname = 'api_source_registry_public_read')
  )
  and cmd = 'SELECT'
  and roles @> array['anon'::name, 'authenticated'::name];

insert into civicmap_security_results
select
  'map_rpcs_are_invoker_scoped',
  count(*) = 2
    and bool_and(not p.prosecdef)
    and bool_and(p.proconfig @> array['search_path=public, pg_temp']),
  format(
    'observed=%s expected=2 all_security_invoker=%s all_fixed_search_path=%s',
    count(*),
    coalesce(bool_and(not p.prosecdef), false),
    coalesce(bool_and(p.proconfig @> array['search_path=public, pg_temp']), false)
  )
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('map_layer1_points', 'map_layer2_detail');

select *
from civicmap_security_results
order by check_name;

select count(*) = 0 as contract_passed
from civicmap_security_results
where not passed;

rollback;

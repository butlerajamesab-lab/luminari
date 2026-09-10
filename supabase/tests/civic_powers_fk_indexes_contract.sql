-- Contract checks for 20260802173000_civic_powers_fk_indexes.sql.
-- Run after all Civic Powers migrations in a disposable or preview database.

begin;

create temporary table civic_power_fk_index_results (
  check_name text primary key,
  passed boolean not null,
  detail text not null
) on commit drop;

insert into civic_power_fk_index_results
select
  'required_fk_indexes_exist',
  count(*) = 13,
  format('observed=%s expected=13', count(*))
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'civic_power_actor_parent_actor_id_idx',
    'civic_power_actor_supersedes_actor_id_idx',
    'civic_power_source_issuing_actor_id_idx',
    'civic_power_interpretation_supersedes_id_idx',
    'civic_power_interpretation_clause_clause_id_idx',
    'civic_power_interpretation_source_source_id_idx',
    'civic_power_edge_supersedes_edge_id_idx',
    'civic_power_edge_source_source_id_idx',
    'civic_power_application_instrument_source_id_idx',
    'civic_power_application_supersedes_id_idx',
    'civic_power_application_source_source_id_idx',
    'civic_power_status_receipt_source_source_id_idx',
    'civic_power_application_edge_source_source_id_idx'
  );

insert into civic_power_fk_index_results
select
  'all_civic_power_foreign_keys_have_covering_index',
  count(*) = 0,
  format('uncovered_foreign_keys=%s', count(*))
from pg_constraint fk
join pg_class tbl on tbl.oid = fk.conrelid
join pg_namespace ns on ns.oid = tbl.relnamespace
where fk.contype = 'f'
  and ns.nspname = 'public'
  and tbl.relname like 'civic_power_%'
  and not exists (
    select 1
    from pg_index idx
    where idx.indrelid = fk.conrelid
      and idx.indisvalid
      and idx.indisready
      and fk.conkey <@ (idx.indkey::smallint[])
  );

select *
from civic_power_fk_index_results
order by check_name;

select count(*) = 0 as contract_passed
from civic_power_fk_index_results
where not passed;

rollback;

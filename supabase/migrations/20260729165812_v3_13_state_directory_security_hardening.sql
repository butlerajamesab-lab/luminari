begin;

alter function public.state_directory_document_family(text)
  set search_path = pg_catalog, public;
alter function public.state_directory_jurisdiction_key(text)
  set search_path = pg_catalog, public;
alter function public.state_directory_row_class(jsonb)
  set search_path = pg_catalog, public;
alter function public.state_directory_route_lane(text)
  set search_path = pg_catalog, public;
alter function public.luminari_stable_uuid_v1(text)
  set search_path = pg_catalog, public;
alter function public.state_directory_resource_category(text)
  set search_path = pg_catalog, public;

create or replace view public.v_state_directory_reassembly_summary
with (security_invoker = true)
as
select
  l.run_id,
  l.route_lane,
  l.row_class,
  l.candidate_status,
  count(*)::bigint as logical_records,
  sum(l.raw_source_row_count)::bigint as raw_source_rows,
  sum(l.deduped_source_row_count)::bigint as deduped_source_rows,
  sum(l.raw_source_row_count - l.deduped_source_row_count)::bigint as exact_duplicate_rows_removed,
  count(*) filter (where l.normalized_name is not null)::bigint as records_with_identity,
  count(distinct l.jurisdiction_key)::integer as jurisdictions
from public.state_directory_logical_record l
group by l.run_id, l.route_lane, l.row_class, l.candidate_status;

create or replace view public.v_state_directory_reassembly_status
with (security_invoker = true)
as
select
  r.*,
  coalesce((
    select jsonb_object_agg(route_lane, logical_records)
    from (
      select route_lane, sum(logical_records)::bigint as logical_records
      from public.v_state_directory_reassembly_summary s
      where s.run_id = r.run_id
      group by route_lane
      order by route_lane
    ) lane_totals
  ), '{}'::jsonb) as logical_records_by_lane
from public.state_directory_reassembly_run r;

create or replace view public.v_state_directory_resource_promotion_summary
with (security_invoker = true)
as
select
  run_id,
  disposition,
  count(*)::bigint as identity_groups,
  sum(source_record_count)::bigint as source_logical_records,
  count(distinct jurisdiction_code)::integer as jurisdictions
from public.state_directory_resource_promotion
group by run_id, disposition;

grant select on public.v_state_directory_reassembly_summary to authenticated, service_role;
grant select on public.v_state_directory_reassembly_status to authenticated, service_role;
grant select on public.v_state_directory_resource_promotion_summary to authenticated, service_role;

commit;

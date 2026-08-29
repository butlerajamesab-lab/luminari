create index if not exists idx_luminari_resource_locations_current_resolution
  on public.luminari_resource_locations (resource_entity_id, source_table, source_pk);

create or replace view public.v_luminari_resource_locations_current_v3_13 as
with current_resolution as (
  select distinct on (r.resource_entity_id)
    r.resolution_id,
    r.resource_entity_id,
    r.review_version,
    r.jurisdiction_state,
    r.resource_name,
    r.live_resource_name_at_review,
    r.disposition,
    r.reviewed_address,
    r.location_kind,
    r.map_eligible,
    r.source_type,
    r.source_reference,
    r.review_note,
    r.malformed_location_ids,
    r.metadata,
    r.reviewed_at,
    r.updated_at
  from public.luminari_resource_location_resolutions r
  order by
    r.resource_entity_id,
    case
      when r.review_version ~ '^v3_13_manual_location_reconciliation_v[0-9]+$'
        then substring(r.review_version, '_v([0-9]+)$')::integer
      else -1
    end desc,
    r.updated_at desc,
    r.resolution_id desc
), resolved_rows as (
  select
    l.location_id,
    l.resource_entity_id,
    l.address_line1,
    l.address_line2,
    l.city,
    l.county,
    l.state,
    l.postal_code,
    l.country,
    l.latitude,
    l.longitude,
    l.coordinate_quality,
    l.geocode_source,
    l.source_table,
    l.source_pk,
    l.metadata,
    l.created_at,
    r.disposition as manual_disposition,
    r.location_kind as manual_location_kind,
    r.map_eligible as manual_map_eligible,
    r.source_reference as manual_source_reference,
    r.review_note as manual_review_note,
    r.review_version as manual_review_version
  from public.luminari_resource_locations l
  join current_resolution r
    on r.resource_entity_id = l.resource_entity_id
   and l.source_table = 'luminari_resource_location_resolutions'
   and l.source_pk = r.resolution_id::text
), unresolved_rows as (
  select
    l.location_id,
    l.resource_entity_id,
    l.address_line1,
    l.address_line2,
    l.city,
    l.county,
    l.state,
    l.postal_code,
    l.country,
    l.latitude,
    l.longitude,
    l.coordinate_quality,
    l.geocode_source,
    l.source_table,
    l.source_pk,
    l.metadata,
    l.created_at,
    null::text as manual_disposition,
    null::text as manual_location_kind,
    null::boolean as manual_map_eligible,
    null::text as manual_source_reference,
    null::text as manual_review_note,
    null::text as manual_review_version
  from public.luminari_resource_locations l
  where not exists (
    select 1
    from current_resolution r
    where r.resource_entity_id = l.resource_entity_id
  )
)
select * from resolved_rows
union all
select * from unresolved_rows;

analyze public.luminari_resource_locations;
analyze public.luminari_resource_location_resolutions;

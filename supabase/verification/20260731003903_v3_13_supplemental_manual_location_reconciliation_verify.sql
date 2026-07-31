-- Post-migration acceptance for both manual v3.13 review passes.
with v2_resolutions as (
  select *
  from public.luminari_resource_location_resolutions
  where review_version = 'v3_13_manual_location_reconciliation_v2'
),
all_resolutions as (
  select *
  from public.luminari_resource_location_resolutions
  where review_version in ('v3_13_manual_location_reconciliation_v1', 'v3_13_manual_location_reconciliation_v2')
),
v2_locations as (
  select *
  from public.luminari_resource_locations
  where source_table = 'luminari_resource_location_resolutions'
    and metadata->>'review_version' = 'v3_13_manual_location_reconciliation_v2'
),
all_reviewed_locations as (
  select *
  from public.luminari_resource_locations
  where source_table = 'luminari_resource_location_resolutions'
    and metadata->>'review_version'
      in ('v3_13_manual_location_reconciliation_v1', 'v3_13_manual_location_reconciliation_v2')
)
select jsonb_build_object(
  'v2_resolution_count', (select count(*) from v2_resolutions),
  'v2_resource_count', (
    select count(distinct resource_entity_id) from v2_resolutions
  ),
  'v2_dispositions', (
    select jsonb_object_agg(disposition, row_count)
    from (
      select disposition, count(*) as row_count
      from v2_resolutions
      group by disposition
    ) grouped
  ),
  'v2_reviewed_locations', (select count(*) from v2_locations),
  'v2_exact_pending', (
    select count(*)
    from v2_locations
    where coordinate_quality = 'manual_reviewed_exact_ungeocoded'
  ),
  'all_resolution_count', (select count(*) from all_resolutions),
  'all_resolved_resources', (
    select count(distinct resource_entity_id) from all_resolutions
  ),
  'all_reviewed_locations', (select count(*) from all_reviewed_locations),
  'all_exact_pending', (
    select count(*)
    from all_reviewed_locations
    where coordinate_quality = 'manual_reviewed_exact_ungeocoded'
  ),
  'asserted_coordinates', (
    select count(*)
    from all_reviewed_locations
    where latitude is not null or longitude is not null
  ),
  'legacy_rows_preserved', (
    select count(*)
    from all_resolutions r
    cross join lateral unnest(r.malformed_location_ids) source_location_id
    join public.luminari_resource_locations l
      on l.location_id = source_location_id
  ),
  'legacy_rows_leaking_into_current_view', (
    select count(*)
    from public.v_luminari_resource_locations_current_v3_13 v
    join all_resolutions r using (resource_entity_id)
    where v.source_table <> 'luminari_resource_location_resolutions'
       or v.source_pk <> r.resolution_id::text
  ),
  'addressed_resources_without_current_row', (
    select count(*)
    from all_resolutions r
    where r.reviewed_address is not null
      and not exists (
        select 1
        from public.v_luminari_resource_locations_current_v3_13 v
        where v.resource_entity_id = r.resource_entity_id
      )
  ),
  'nonpoint_resources_with_current_row', (
    select count(*)
    from all_resolutions r
    join public.v_luminari_resource_locations_current_v3_13 v
      using (resource_entity_id)
    where r.reviewed_address is null
  ),
  'state_directory_corpus_count', (
    select count(*)
    from public.luminari_resource_entities
    where source_table = 'state_directory_logical_record'
  ),
  'uncovered_corpus_resources', (
    select count(*)
    from public.luminari_resource_entities e
    where e.source_table = 'state_directory_logical_record'
      and not exists (
        select 1
        from public.v_luminari_resource_locations_current_v3_13 v
        where v.resource_entity_id = e.resource_entity_id
      )
      and not exists (
        select 1
        from all_resolutions r
        where r.resource_entity_id = e.resource_entity_id
      )
  )
) as supplemental_manual_location_verification;

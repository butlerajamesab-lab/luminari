-- Post-migration acceptance for the v3.13 manual location review.
with resolutions as (
  select *
  from public.luminari_resource_location_resolutions
  where review_version = 'v3_13_manual_location_reconciliation_v1'
),
reviewed_locations as (
  select *
  from public.luminari_resource_locations
  where source_table = 'luminari_resource_location_resolutions'
    and metadata->>'review_version' = 'v3_13_manual_location_reconciliation_v1'
)
select jsonb_build_object(
  'resolution_count', (select count(*) from resolutions),
  'resolved_resource_count', (
    select count(distinct resource_entity_id) from resolutions
  ),
  'dispositions', (
    select jsonb_object_agg(disposition, row_count)
    from (
      select disposition, count(*) as row_count
      from resolutions
      group by disposition
    ) grouped
  ),
  'reviewed_location_count', (select count(*) from reviewed_locations),
  'reviewed_location_resource_count', (
    select count(distinct resource_entity_id) from reviewed_locations
  ),
  'map_eligible_exact_pending', (
    select count(*)
    from reviewed_locations
    where metadata->>'map_eligible' = 'true'
      and coordinate_quality = 'manual_reviewed_exact_ungeocoded'
  ),
  'mailing_locations', (
    select count(*)
    from reviewed_locations
    where coordinate_quality = 'manual_reviewed_mailing'
  ),
  'administrative_locations', (
    select count(*)
    from reviewed_locations
    where coordinate_quality = 'manual_reviewed_administrative'
  ),
  'asserted_coordinates', (
    select count(*)
    from reviewed_locations
    where latitude is not null or longitude is not null
  ),
  'legacy_rows_preserved', (
    select count(*)
    from public.luminari_resource_locations l
    join resolutions r using (resource_entity_id)
    where l.location_id = any(r.malformed_location_ids)
  ),
  'legacy_rows_leaking_into_current_view', (
    select count(*)
    from public.v_luminari_resource_locations_current_v3_13 v
    join resolutions r using (resource_entity_id)
    where v.source_table <> 'luminari_resource_location_resolutions'
       or v.source_pk <> r.resolution_id::text
  ),
  'reviewed_resources_without_circulation_row', (
    select count(*)
    from resolutions r
    where r.reviewed_address is not null
      and not exists (
        select 1
        from public.v_luminari_resource_locations_current_v3_13 v
        where v.resource_entity_id = r.resource_entity_id
      )
  ),
  'nonpoint_resources_with_circulation_row', (
    select count(*)
    from resolutions r
    join public.v_luminari_resource_locations_current_v3_13 v
      using (resource_entity_id)
    where r.reviewed_address is null
  )
) as manual_location_reconciliation_verification;

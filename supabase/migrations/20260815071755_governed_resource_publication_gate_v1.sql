create or replace view public.v_unified_civic_circulation
with (security_invoker = true)
as
with preferred_contacts as (
  select
    cp.resource_entity_id,
    (
      array_agg(
        cp.contact_value
        order by cp.is_primary desc nulls last,cp.manually_reviewed desc,
          cp.created_at desc,cp.contact_point_id
      ) filter(where cp.contact_type='phone')
    )[1] as phone,
    (
      array_agg(
        cp.contact_value
        order by case when cp.contact_type='website' then 0 else 1 end,
          cp.is_primary desc nulls last,cp.manually_reviewed desc,
          cp.created_at desc,cp.contact_point_id
      ) filter(where cp.contact_type in ('website','portal'))
    )[1] as website
  from public.v_luminari_resource_contact_points_current_v3_13 cp
  group by cp.resource_entity_id
)
select
  rp.id as canonical_id,
  rp.name as display_name,
  rp.category as resource_category,
  rp.agency as organization,
  rp.jurisdiction_id,
  rp.contact_website_norm as website,
  rp.contact_phone_norm as contact,
  case
    when rp.created_at is null then null::timestamptz
    when rp.created_at>9999999999 then to_timestamp(rp.created_at::double precision/1000.0)
    else to_timestamp(rp.created_at::double precision)
  end as created_at,
  'registry_program'::text as source_layer
from public.registry_programs rp
union all
select
  e.canonical_id,
  coalesce(nullif(p.display_name_override,''),e.resource_name) as display_name,
  e.resource_category,
  coalesce(
    nullif(e.metadata->>'organization_name',''),
    nullif(e.metadata->>'agency_name','')
  ) as organization,
  coalesce(e.state,e.jurisdiction) as jurisdiction_id,
  c.website,
  c.phone as contact,
  e.created_at,
  'luminari_resource_entity_v3_13'::text as source_layer
from public.luminari_resource_entities e
left join public.luminari_resource_publication_resolutions p
  on p.resource_entity_id=e.resource_entity_id
left join preferred_contacts c
  on c.resource_entity_id=e.resource_entity_id
where coalesce(p.publication_status,'active')='active'
  and (
    (
      e.source_table in ('state_directory_logical_record','registry_entity_staging_programs')
      and e.provenance_status='staging_provenance_attached'
      and e.promotion_status='review_ready'
      and e.verification_status='source_attached'
    )
    or (
      e.source_table='domain_deep_dive_v3_13_stage'
      and e.provenance_status='verified'
      and e.promotion_status='promoted'
      and e.verification_status='verified'
    )
    or (
      e.source_table='substrate_candidate_disposition'
      and e.provenance_status='source_preserved'
      and e.promotion_status='promoted'
      and e.verification_status='verified'
    )
  );

comment on view public.v_unified_civic_circulation is
  'Public resource circulation. Includes registry programs and only active entities admitted by the exact four-lane governed publication contract; raw candidates and staged/unverified entities remain excluded.';

begin;

do $guard$
declare
  canonical_resource_count integer;
  active_resource_count integer;
  legacy_map_count integer;
  fanout_missing_target_count integer;
  fanout_held_count integer;
begin
  select
    count(*)::int,
    count(*) filter (
      where coalesce(p.publication_status, 'active') = 'active'
    )::int
  into canonical_resource_count, active_resource_count
  from public.luminari_resource_entities e
  left join public.luminari_resource_publication_resolutions p
    on p.resource_entity_id = e.resource_entity_id
  where e.source_table = 'state_directory_logical_record';

  -- Fresh/preview replay has schema but no imported v3.13 corpus. Once any
  -- canonical source rows exist, require the exact reviewed production set.
  if canonical_resource_count > 0 and canonical_resource_count <> 4178 then
    raise exception
      'Canonical directory guard failed: expected 4178 resources, found %',
      canonical_resource_count;
  end if;

  if canonical_resource_count > 0 and active_resource_count <> 4177 then
    raise exception
      'Canonical directory publication guard failed: expected 4177 active resources, found %',
      active_resource_count;
  end if;

  if to_regclass('public.v_ui_civic_map_v2') is null then
    legacy_map_count := 0;
  else
    execute 'select count(*)::int from public.v_ui_civic_map_v2'
      into legacy_map_count;
  end if;

  if canonical_resource_count > 0 and legacy_map_count < 1 then
    raise exception
      'Legacy map guard failed: expected the legacy projection to contain rows before replacement';
  end if;

  if canonical_resource_count = 0 then
    fanout_missing_target_count := 0;
    fanout_held_count := 0;
  else
    with lane_status as (
    select
      count(*)::int as ledger_rows,
      count(*) filter (
        where (
          p.target_table = 'luminari_resource_entities'
          and exists (
            select 1
            from public.luminari_resource_entities e
            where e.resource_entity_id::text = p.target_record_id
          )
        ) or (
          p.target_table = 'registry_programs'
          and exists (
            select 1
            from public.registry_programs r
            where r.id = p.target_record_id
          )
        )
      )::int as resolved_rows,
      0::int as held_rows
    from public.state_directory_resource_promotion p
    where p.run_id = 'state_directory_reassembly_v1_20260729'

    union all

    select
      count(*)::int,
      count(*) filter (
        where (
          p.target_table = 'luminari_resource_entities'
          and exists (
            select 1
            from public.luminari_resource_entities e
            where e.resource_entity_id::text = p.target_record_id
          )
        ) or (
          p.target_table = 'registry_programs'
          and exists (
            select 1
            from public.registry_programs r
            where r.id = p.target_record_id
          )
        )
      )::int,
      0::int
    from public.state_directory_organization_resource_promotion p
    where p.run_id = 'state_directory_reassembly_v1_20260729'

    union all

    select
      count(*) filter (where p.disposition <> 'held_ambiguous')::int,
      count(*) filter (
        where p.disposition <> 'held_ambiguous'
          and exists (
            select 1
            from public.luminari_resource_entities e
            where e.resource_entity_id = p.target_resource_entity_id
          )
      )::int,
      count(*) filter (where p.disposition = 'held_ambiguous')::int
    from public.state_directory_field_resource_promotion p
    where p.run_id = 'state_directory_reassembly_v1_20260729'

    union all

    select
      count(*)::int,
      count(*) filter (
        where exists (
          select 1
          from public.oversight_registry o
          where o.uuid::text = p.target_uuid
        )
      )::int,
      0::int
    from public.state_directory_oversight_promotion p
    where p.run_id = 'state_directory_reassembly_v1_20260729'

    union all

    select
      count(*)::int,
      count(*) filter (
        where exists (
          select 1
          from public.legal_statutes s
          where s.id = p.target_id
        )
      )::int,
      0::int
    from public.state_directory_legal_promotion p
    where p.run_id = 'state_directory_reassembly_v1_20260729'

    union all

    select
      count(*)::int,
      count(*) filter (
        where exists (
          select 1
          from public.workflow_registry w
          where w.uuid::text = p.target_uuid
        )
      )::int,
      0::int
    from public.state_directory_workflow_promotion p
    where p.run_id = 'state_directory_reassembly_v1_20260729'

    union all

    select
      count(*)::int,
      count(*) filter (
        where exists (
          select 1
          from public.jurisdiction_assertions j
          where j.id = p.target_id
        )
      )::int,
      0::int
    from public.state_directory_profile_promotion p
    where p.run_id = 'state_directory_reassembly_v1_20260729'

    union all

    select
      count(*) filter (where p.disposition = 'enriched')::int,
      count(*) filter (
        where p.disposition = 'enriched'
          and exists (
            select 1
            from public.jurisdiction_claim_matrix m
            where m.id = p.target_id
          )
      )::int,
      count(*) filter (where p.disposition = 'held')::int
    from public.state_directory_portability_promotion p
    where p.run_id = 'state_directory_reassembly_v1_20260729'

    union all

    select
      0::int,
      0::int,
      count(*)::int
    from public.state_directory_review_hold h
    where h.run_id = 'state_directory_reassembly_v1_20260729'
  )
  select
    coalesce(sum(ledger_rows - resolved_rows), 0)::int,
    coalesce(sum(held_rows), 0)::int
  into fanout_missing_target_count, fanout_held_count
    from lane_status;
  end if;

  if fanout_missing_target_count <> 0 then
    raise exception
      'Canonical fan-out guard failed: % targetable promotion rows are missing from their destination tables',
      fanout_missing_target_count;
  end if;

  if canonical_resource_count > 0 and fanout_held_count <> 174 then
    raise exception
      'Canonical hold guard failed: expected 174 intentionally held rows, found %',
      fanout_held_count;
  end if;

  if canonical_resource_count = 0
     and (active_resource_count <> 0
       or fanout_missing_target_count <> 0
       or fanout_held_count <> 0) then
    raise exception
      'Fresh replay has canonical fan-out state without source resources';
  end if;
end
$guard$;

create or replace view public.v_ui_civic_map_v2
with (security_invoker = true)
as
with preferred_contacts as (
  select
    cp.resource_entity_id,
    (
      array_agg(
        cp.contact_value
        order by
          cp.is_primary desc nulls last,
          cp.manually_reviewed desc,
          cp.created_at desc,
          cp.contact_point_id
      ) filter (where cp.contact_type = 'phone')
    )[1] as phone,
    (
      array_agg(
        cp.contact_value
        order by
          cp.is_primary desc nulls last,
          cp.manually_reviewed desc,
          cp.created_at desc,
          cp.contact_point_id
      ) filter (where cp.contact_type = 'email')
    )[1] as email,
    (
      array_agg(
        cp.contact_value
        order by
          case when cp.contact_type = 'website' then 0 else 1 end,
          cp.is_primary desc nulls last,
          cp.manually_reviewed desc,
          cp.created_at desc,
          cp.contact_point_id
      ) filter (where cp.contact_type in ('website', 'portal'))
    )[1] as website
  from public.v_luminari_resource_contact_points_current_v3_13 cp
  group by cp.resource_entity_id
)
select
  e.resource_entity_id as id,
  e.resource_type,
  coalesce(
    nullif(p.display_name_override, ''),
    e.resource_name
  ) as name,
  e.description,
  nullif(e.metadata ->> 'organization_name', '') as organization_name,
  nullif(e.metadata ->> 'agency_name', '') as agency_name,
  coalesce(l.city, e.city) as city,
  coalesce(l.county, e.county) as county,
  coalesce(l.state, e.state) as state,
  l.postal_code,
  coalesce(l.country, 'US') as country,
  l.latitude,
  l.longitude,
  l.coordinate_quality as geocode_precision,
  c.phone,
  c.email,
  c.website as website_url,
  coalesce(
    e.service_categories,
    array[e.resource_category]::text[]
  ) as service_categories,
  array[]::text[] as languages,
  array[]::text[] as accessibility_features,
  e.created_at,
  e.updated_at
from public.luminari_resource_entities e
join public.v_luminari_resource_locations_current_v3_13 l
  on l.resource_entity_id = e.resource_entity_id
left join public.luminari_resource_publication_resolutions p
  on p.resource_entity_id = e.resource_entity_id
left join preferred_contacts c
  on c.resource_entity_id = e.resource_entity_id
where e.source_table = 'state_directory_logical_record'
  and coalesce(p.publication_status, 'active') = 'active'
  and l.manual_map_eligible is true
  and l.latitude is not null
  and l.longitude is not null;

comment on view public.v_ui_civic_map_v2 is
  'Compatibility projection for exact, manually reviewed v3.13 public sites. Legacy normalized_civic_resource rows are intentionally excluded.';

create or replace view public.v_unified_civic_circulation
with (security_invoker = true)
as
with preferred_contacts as (
  select
    cp.resource_entity_id,
    (
      array_agg(
        cp.contact_value
        order by
          cp.is_primary desc nulls last,
          cp.manually_reviewed desc,
          cp.created_at desc,
          cp.contact_point_id
      ) filter (where cp.contact_type = 'phone')
    )[1] as phone,
    (
      array_agg(
        cp.contact_value
        order by
          case when cp.contact_type = 'website' then 0 else 1 end,
          cp.is_primary desc nulls last,
          cp.manually_reviewed desc,
          cp.created_at desc,
          cp.contact_point_id
      ) filter (where cp.contact_type in ('website', 'portal'))
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
  to_timestamp(rp.created_at::double precision) as created_at,
  'registry_program'::text as source_layer
from public.registry_programs rp
union all
select
  e.canonical_id,
  coalesce(
    nullif(p.display_name_override, ''),
    e.resource_name
  ) as display_name,
  e.resource_category,
  coalesce(
    nullif(e.metadata ->> 'organization_name', ''),
    nullif(e.metadata ->> 'agency_name', '')
  ) as organization,
  coalesce(e.state, e.jurisdiction) as jurisdiction_id,
  c.website,
  c.phone as contact,
  e.created_at,
  'luminari_resource_entity_v3_13'::text as source_layer
from public.luminari_resource_entities e
left join public.luminari_resource_publication_resolutions p
  on p.resource_entity_id = e.resource_entity_id
left join preferred_contacts c
  on c.resource_entity_id = e.resource_entity_id
where e.source_table = 'state_directory_logical_record'
  and coalesce(p.publication_status, 'active') = 'active';

comment on view public.v_unified_civic_circulation is
  'Public resource circulation. Includes registry programs and active canonical v3.13 directory resources; excludes the quarantined normalized_civic_resource feed.';

create or replace view public.v_civic_map_signals_production
with (security_invoker = true)
as
select
  null::uuid as id,
  null::text as title,
  null::text as resource_type,
  null::text as state,
  null::text as county,
  null::text as city,
  null::numeric as latitude,
  null::numeric as longitude,
  null::numeric as normalization_confidence,
  null::text as source_key
where false;

comment on view public.v_civic_map_signals_production is
  'Deprecated zero-row compatibility view. Signals are intentionally excluded from Civic Map and remain in their signal-specific tables and views.';

commit;

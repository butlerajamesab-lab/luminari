select
  count(*)::int as total_directory_resources,
  count(*) filter (
    where coalesce(p.publication_status, 'active') = 'active'
  )::int as active_directory_resources,
  count(*) filter (
    where coalesce(p.publication_status, 'active') = 'inactive'
  )::int as inactive_directory_resources,
  count(distinct e.state)::int as directory_jurisdictions,
  count(distinct e.resource_category)::int as directory_categories
from public.luminari_resource_entities e
left join public.luminari_resource_publication_resolutions p
  on p.resource_entity_id = e.resource_entity_id
where e.source_table = 'state_directory_logical_record';

select
  count(*)::int as compatibility_exact_map_rows,
  count(*) filter (
    where id in (
      select resource_entity_id
      from public.luminari_resource_entities
      where source_table = 'state_directory_logical_record'
    )
  )::int as canonical_exact_map_rows
from public.v_ui_civic_map_v2;

select
  source_layer,
  count(*)::int as circulated_rows
from public.v_unified_civic_circulation
group by source_layer
order by source_layer;

select count(*)::int as civic_map_signal_rows
from public.v_civic_map_signals_production;

select
  count(*) filter (
    where view_definition ilike '%normalized_civic_resource%'
  )::int as compatibility_views_still_using_legacy_resources,
  count(*) filter (
    where view_definition ilike '%luminari_resource_entities%'
  )::int as compatibility_views_using_canonical_resources
from information_schema.views
where table_schema = 'public'
  and table_name in (
    'v_ui_civic_map_v2',
    'v_unified_civic_circulation'
  );

with lane_status as (
  select
    'resource_entity'::text as lane,
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
    'organization_resource',
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
    'field_resource',
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
    'oversight',
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
    'legal_authority',
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
    'workflow',
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
    'jurisdiction_profile',
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
    'portability',
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
    'review_hold',
    0::int,
    0::int,
    count(*)::int
  from public.state_directory_review_hold h
  where h.run_id = 'state_directory_reassembly_v1_20260729'
)
select
  lane,
  ledger_rows,
  resolved_rows,
  held_rows,
  (ledger_rows - resolved_rows)::int as missing_target_rows,
  (ledger_rows = resolved_rows) as targetable_lane_complete
from lane_status
order by lane;

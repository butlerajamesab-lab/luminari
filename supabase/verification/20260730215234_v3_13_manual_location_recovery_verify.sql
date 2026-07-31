-- Acceptance verification for:
-- 20260730215234_v3_13_manual_location_recovery.sql

with v3_13_resources as (
  select e.resource_entity_id
  from public.luminari_resource_entities e
  where e.source_table = 'state_directory_logical_record'
),
coverage as (
  select
    count(*)::bigint as v3_13_resources,
    count(*) filter (where exists (
      select 1
      from public.luminari_resource_locations l
      where l.resource_entity_id = r.resource_entity_id
        and nullif(btrim(l.address_line1), '') is not null
    ))::bigint as resources_with_address,
    count(*) filter (where not exists (
      select 1
      from public.luminari_resource_locations l
      where l.resource_entity_id = r.resource_entity_id
        and nullif(btrim(l.address_line1), '') is not null
    ))::bigint as resources_without_address
  from v3_13_resources r
),
recovery as (
  select
    count(*)::bigint as recovered_locations,
    count(distinct resource_entity_id)::bigint as recovered_resources,
    count(*) filter (
      where nullif(btrim(address_line1), '') is null
    )::bigint as recovered_blank_addresses,
    count(*) filter (
      where latitude is not null or longitude is not null
    )::bigint as recovery_coordinates_asserted
  from public.luminari_resource_locations
  where metadata->>'recovery_engine' =
    'state_directory_manual_location_recovery'
    and metadata->>'recovery_version' = '1.0.0'
)
select
  c.v3_13_resources,
  c.resources_with_address,
  c.resources_without_address,
  r.recovered_locations,
  r.recovered_resources,
  r.recovered_blank_addresses,
  r.recovery_coordinates_asserted,
  (
    c.v3_13_resources = 4178
    and c.resources_with_address = 4178
    and c.resources_without_address = 0
    and r.recovered_locations = 195
    and r.recovered_resources = 64
    and r.recovered_blank_addresses = 0
    and r.recovery_coordinates_asserted = 0
  ) as accepted
from coverage c
cross join recovery r;

select
  e.state as jurisdiction,
  count(distinct l.resource_entity_id)::bigint as recovered_resources,
  count(*)::bigint as recovered_locations,
  count(*) filter (
    where l.metadata->>'location_kind' = 'mailing'
  )::bigint as mailing_locations,
  count(*) filter (
    where l.metadata->>'location_kind' =
      'combined_physical_and_mailing_source'
  )::bigint as combined_source_locations
from public.luminari_resource_locations l
join public.luminari_resource_entities e
  on e.resource_entity_id = l.resource_entity_id
where l.metadata->>'recovery_engine' =
  'state_directory_manual_location_recovery'
  and l.metadata->>'recovery_version' = '1.0.0'
group by e.state
order by e.state;

select
  e.resource_entity_id,
  e.resource_name,
  e.state as jurisdiction,
  count(l.location_id)::bigint as recovered_locations,
  array_agg(l.address_line1 order by l.address_line1) as recovered_addresses
from public.luminari_resource_entities e
join public.luminari_resource_locations l
  on l.resource_entity_id = e.resource_entity_id
where l.metadata->>'recovery_engine' =
  'state_directory_manual_location_recovery'
  and l.metadata->>'recovery_version' = '1.0.0'
group by
  e.resource_entity_id,
  e.resource_name,
  e.state
order by e.state, e.resource_name;

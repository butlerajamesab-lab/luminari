drop view if exists public.v_civic_map_runtime_v2 cascade;

drop view if exists public.v_unified_civic_circulation cascade;

create view public.v_unified_civic_circulation as
select
  rp.id::text as canonical_id,
  coalesce(rp.name_rp, 'Unnamed Program') as display_name,
  coalesce(rp.category_rp, 'resource') as resource_category,
  rp.agency_rp as organization,
  rp.jurisdiction_id_rp as jurisdiction_id,
  rp.website_rp as source_url,
  rp.contact_rp as contact,
  to_timestamp(rp.created_at_rp) as created_at,
  'registry_programs' as source_layer,
  null::numeric as latitude,
  null::numeric as longitude,
  null::text as state_code
from public.registry_programs rp

union all

select
  ncr.id::text as canonical_id,
  coalesce(ncr.name, ncr.organization_name, 'Unnamed Resource') as display_name,
  coalesce(ncr.resource_type, 'resource') as resource_category,
  coalesce(ncr.organization_name, ncr.agency_name) as organization,
  ncr.state as jurisdiction_id,
  ncr.website_url as source_url,
  ncr.phone as contact,
  ncr.created_at,
  'normalized_civic_resource' as source_layer,
  ncr.latitude,
  ncr.longitude,
  ncr.state as state_code
from public.normalized_civic_resource ncr;

create view public.v_civic_map_runtime_v2 as
select
  canonical_id,
  display_name,
  resource_category,
  organization,
  jurisdiction_id,
  source_url,
  contact,
  created_at,
  source_layer,
  latitude,
  longitude,
  state_code
from public.v_unified_civic_circulation;

grant select on public.v_unified_civic_circulation to anon, authenticated, service_role;
grant select on public.v_civic_map_runtime_v2 to anon, authenticated, service_role;

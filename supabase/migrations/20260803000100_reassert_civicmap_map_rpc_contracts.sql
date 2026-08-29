-- Source-controlled CivicMap map view and RPC contracts.
-- Required by server/routes/civic-map-router.ts.
-- The dependent views are defined before the SQL functions because PostgreSQL
-- validates SQL-function bodies at create time.

create or replace view public.v_map_layer1_light as
select
  ncr.id,
  coalesce(nullif(ncr.name, ''), nullif(ncr.organization_name, ''), nullif(ncr.agency_name, ''), 'Unnamed civic resource')::text as title,
  ncr.resource_type,
  ncr.state,
  ncr.county,
  ncr.city,
  ncr.latitude,
  ncr.longitude,
  ncr.normalization_confidence,
  asr.source_key
from public.normalized_civic_resource ncr
left join public.api_source_registry asr on asr.id = ncr.source_id
where ncr.latitude is not null
  and ncr.longitude is not null
create or replace view public.v_map_layer2_detail as
select
  ncr.id,
  asr.source_key,
  ncr.resource_type,
  ncr.name,
  ncr.description,
  ncr.organization_name,
  ncr.agency_name,
  ncr.address_line1,
  ncr.address_line2,
  ncr.city,
  ncr.county,
  ncr.state,
  ncr.postal_code,
  ncr.country,
  ncr.latitude,
  ncr.longitude,
  ncr.geocode_precision,
  ncr.phone,
  ncr.email,
  ncr.website_url,
  ncr.service_categories,
  ncr.eligibility_summary,
  ncr.hours,
  ncr.languages,
  ncr.accessibility_features,
  ncr.normalization_confidence,
  null::text as program_owner_final,
  ncr.updated_at
from public.normalized_civic_resource ncr
left join public.api_source_registry asr on asr.id = ncr.source_id
create or replace function public.map_layer1_points(
  p_min_lat double precision,
  p_max_lat double precision,
  p_min_lng double precision,
  p_max_lng double precision,
  p_limit integer default 2000
)
returns table(
  id uuid,
  title text,
  resource_type text,
  state text,
  county text,
  city text,
  latitude numeric,
  longitude numeric,
  normalization_confidence numeric,
  source_key text
)
language sql
stable
set search_path to public, pg_temp
as $$
  select
    v.id,
    v.title,
    v.resource_type,
    v.state,
    v.county,
    v.city,
    v.latitude,
    v.longitude,
    v.normalization_confidence,
    v.source_key
  from public.v_map_layer1_light v
  where v.latitude::double precision between p_min_lat and p_max_lat
    and v.longitude::double precision between p_min_lng and p_max_lng
  order by v.normalization_confidence desc nulls last, v.id
  limit greatest(1, least(coalesce(p_limit, 2000), 5000));
$$
create or replace function public.map_layer2_detail(p_id uuid)
returns table(
  id uuid,
  source_key text,
  resource_type text,
  name text,
  description text,
  organization_name text,
  agency_name text,
  address_line1 text,
  address_line2 text,
  city text,
  county text,
  state text,
  postal_code text,
  country text,
  latitude numeric,
  longitude numeric,
  geocode_precision text,
  phone text,
  email text,
  website_url text,
  service_categories text[],
  eligibility_summary text,
  hours jsonb,
  languages text[],
  accessibility_features text[],
  normalization_confidence numeric,
  program_owner_final text,
  updated_at timestamp with time zone
)
language sql
stable
set search_path to public, pg_temp
as $$
  select
    d.id,
    d.source_key,
    d.resource_type,
    d.name,
    d.description,
    d.organization_name,
    d.agency_name,
    d.address_line1,
    d.address_line2,
    d.city,
    d.county,
    d.state,
    d.postal_code,
    d.country,
    d.latitude,
    d.longitude,
    d.geocode_precision,
    d.phone,
    d.email,
    d.website_url,
    d.service_categories,
    d.eligibility_summary,
    d.hours,
    d.languages,
    d.accessibility_features,
    d.normalization_confidence,
    d.program_owner_final,
    d.updated_at
  from public.v_map_layer2_detail d
  where d.id = p_id;
$$
grant execute on function public.map_layer1_points(double precision, double precision, double precision, double precision, integer) to anon, authenticated
grant execute on function public.map_layer2_detail(uuid) to anon, authenticated

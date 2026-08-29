create or replace function public.search_lighthouse_resource_catalog_v1(
  p_query text default null,
  p_jurisdiction text default null,
  p_category text default null,
  p_source_lane text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table(
  resource_uid text,
  source_lane text,
  source_id text,
  name text,
  category text,
  jurisdiction_raw text,
  jurisdiction_code text,
  organization text,
  phone text,
  email text,
  website text,
  address text,
  description text,
  eligibility text,
  notes text,
  created_at timestamptz,
  verification_status text,
  metadata jsonb,
  total_count bigint
)
language sql
stable
set search_path to 'public','pg_catalog'
as $function$
with params as (
  select public.normalize_state_code(p_jurisdiction) as j
), filtered as (
  select v.*
  from public.v_lighthouse_resource_catalog_v1 v
  cross join params p
  where (p_source_lane is null or v.source_lane=p_source_lane)
    and (p_category is null or coalesce(v.category,'') ilike '%'||p_category||'%')
    and (p_jurisdiction is null or v.jurisdiction_code=p.j or coalesce(v.jurisdiction_raw,'') ilike '%'||p_jurisdiction||'%')
    and (p_query is null or coalesce(v.name,'') ilike '%'||p_query||'%' or coalesce(v.organization,'') ilike '%'||p_query||'%' or coalesce(v.description,'') ilike '%'||p_query||'%' or coalesce(v.eligibility,'') ilike '%'||p_query||'%')
), counted as (select count(*)::bigint c from filtered)
select f.*,c.c
from filtered f cross join counted c
order by f.name nulls last,f.resource_uid
limit greatest(1,least(p_limit,1000))
offset greatest(p_offset,0);
$function$;

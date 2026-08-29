create or replace function public.search_registry_resources(p_query text default null::text, p_realm text default null::text, p_jurisdiction text default null::text, p_limit integer default 200, p_offset integer default 0)
returns table(resource_uid text, realm text, source_id text, name text, category text, jurisdiction text, organization text, phone text, website text, eligibility text, notes text, coverage text, created_at timestamp with time zone, metadata jsonb, total_count bigint)
language sql
stable
set search_path to 'public','pg_catalog'
as $function$
with params as (
  select public.normalize_state_code(p_jurisdiction) as state_code
), filtered as (
  select v.*
  from public.v_lighthouse_resource_catalog_v1 v
  cross join params p
  where (p_realm is null or v.source_lane = p_realm)
    and (
      p_jurisdiction is null
      or v.jurisdiction_code = p.state_code
      or coalesce(v.jurisdiction_raw,'') ilike ('%' || p_jurisdiction || '%')
    )
    and (
      p_query is null
      or coalesce(v.name,'') ilike ('%' || p_query || '%')
      or coalesce(v.organization,'') ilike ('%' || p_query || '%')
      or coalesce(v.category,'') ilike ('%' || p_query || '%')
      or coalesce(v.description,'') ilike ('%' || p_query || '%')
      or coalesce(v.eligibility,'') ilike ('%' || p_query || '%')
    )
), counted as (
  select count(*)::bigint as c from filtered
)
select
  f.resource_uid,
  f.source_lane as realm,
  f.source_id,
  f.name,
  f.category,
  coalesce(f.jurisdiction_code,f.jurisdiction_raw) as jurisdiction,
  f.organization,
  f.phone,
  f.website,
  f.eligibility,
  f.notes,
  coalesce(f.metadata->>'coverage',f.address) as coverage,
  f.created_at,
  f.metadata,
  c.c
from filtered f cross join counted c
order by f.name asc nulls last,f.resource_uid
limit greatest(1,least(p_limit,1000))
offset greatest(p_offset,0);
$function$;

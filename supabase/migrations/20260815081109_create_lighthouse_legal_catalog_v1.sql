create or replace view public.v_lighthouse_legal_catalog_v1 as
select
  md5(record_type||'|'||coalesce(display_title,'')||'|'||coalesce(citation,'')) as legal_uid,
  record_type,
  display_title,
  citation,
  summary,
  source_url,
  created_at,
  null::text as jurisdiction,
  null::text as verification_status,
  '{}'::jsonb as metadata
from public.v_runtime_legal_library
union all
select
  'sais:'||resource_uuid::text,
  'sais_authority'::text,
  organization_name,
  statute_reference,
  description,
  website,
  null::timestamptz,
  coalesce(jurisdiction_code,jurisdiction_scope),
  verification_status,
  jsonb_build_object('resource_id',resource_id,'service_type',service_type,'promotion_status',promotion_status,'source_document_id',source_document_id,'source_sha256',source_sha256,'urgency_flags',urgency_flags,'deadline_count',deadline_count)
from public.v_sais_unified_resources_v1
where nullif(trim(coalesce(statute_reference,'')),'') is not null;

create or replace function public.search_lighthouse_legal_catalog_v1(
  p_query text default null,
  p_record_type text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table(
  legal_uid text,
  record_type text,
  display_title text,
  citation text,
  summary text,
  source_url text,
  created_at timestamptz,
  jurisdiction text,
  verification_status text,
  metadata jsonb,
  total_count bigint
)
language sql
stable
set search_path to 'public','pg_catalog'
as $function$
with filtered as (
  select v.* from public.v_lighthouse_legal_catalog_v1 v
  where (p_record_type is null or v.record_type=p_record_type)
    and (p_query is null or coalesce(v.display_title,'') ilike '%'||p_query||'%' or coalesce(v.citation,'') ilike '%'||p_query||'%' or coalesce(v.summary,'') ilike '%'||p_query||'%')
), counted as (select count(*)::bigint c from filtered)
select f.*,c.c from filtered f cross join counted c
order by f.created_at desc nulls last,f.display_title
limit greatest(1,least(p_limit,1000)) offset greatest(p_offset,0);
$function$;

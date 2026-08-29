drop view if exists public.v_civic_map_runtime cascade;
drop view if exists public.v_unified_civic_circulation cascade;

create view public.v_unified_civic_circulation as
select
  id::text as canonical_id,
  name_rp::text as display_name,
  category_rp::text as resource_category,
  agency_rp::text as organization,
  jurisdiction_id_rp::text as jurisdiction_id,
  website_rp::text as website,
  contact_rp::text as contact,
  to_timestamp(created_at_rp) as created_at,
  'registry_program'::text as source_layer
from public.registry_programs

union all

select
  id::text as canonical_id,
  name::text as display_name,
  resource_type::text as resource_category,
  organization_name::text as organization,
  state::text as jurisdiction_id,
  website_url::text as website,
  phone::text as contact,
  created_at,
  'normalized_civic_resource'::text as source_layer
from public.normalized_civic_resource;

create view public.v_civic_map_runtime as
select
  canonical_id,
  display_name,
  resource_category,
  organization,
  jurisdiction_id,
  website,
  contact,
  created_at,
  source_layer
from public.v_unified_civic_circulation;

create or replace view public.v_runtime_legal_library as
select
  'statute'::text as record_type,
  coalesce(short_title, citation)::text as display_title,
  citation::text as citation,
  summary::text as summary,
  source_url::text as source_url,
  created_at
from public.legal_statutes

union all

select
  'case_law'::text as record_type,
  coalesce(case_name, citation)::text as display_title,
  citation::text as citation,
  summary::text as summary,
  source_url::text as source_url,
  created_at
from public.v_runtime_case_law

union all

select
  'enforcement'::text as record_type,
  agency_name::text as display_title,
  statutory_authority::text as citation,
  process_summary::text as summary,
  complaint_url::text as source_url,
  created_at
from public.v_runtime_enforcement;

create or replace view public.v_lighthouse_filing_catalog_v1 as
with generator_dedup as (
  select distinct on (claim_type,coalesce(agency_short,agency),form_name)
    ('filing_generator:'||id::text) as template_uid,
    'filing_generator'::text as source_lane,
    claim_type as template_type,
    form_name as template_name,
    coalesce(agency_short,agency) as agency,
    jurisdiction,
    form_number,
    filing_link as source_url,
    filing_deadline,
    required_fields,
    required_evidence,
    recommended_attachments,
    submission_methods,
    expected_timeline,
    intake_warnings,
    priority_flags,
    next_steps,
    notes,
    to_timestamp(nullif(created_at,0)::double precision/1000.0) as created_at
  from public.filing_generator
  order by claim_type,coalesce(agency_short,agency),form_name,id
)
select * from generator_dedup
union all
select
  'filing_templates:'||id::text,
  'filing_templates',
  template_type,
  template_name,
  issuing_agency,
  jurisdiction,
  null::text,
  source_url,
  metadata->>'filing_deadline',
  coalesce(metadata->>'required_fields',template_text),
  metadata->>'required_evidence',
  metadata->>'recommended_attachments',
  metadata->>'submission_methods',
  metadata->>'expected_timeline',
  metadata->>'intake_warnings',
  metadata->>'priority_flags',
  metadata->>'next_steps',
  template_text,
  created_at
from public.filing_templates
union all
select
  'paperwork_templates:'||id::text,
  'paperwork_templates',
  template_type,
  title,
  null::text,
  jurisdiction,
  null::text,
  null::text,
  null::text,
  required_fields,
  null::text,
  null::text,
  null::text,
  null::text,
  null::text,
  null::text,
  null::text,
  description || E'\n\n' || coalesce(template_body,''),
  to_timestamp(nullif(created_at,0)::double precision/1000.0)
from public.paperwork_templates;

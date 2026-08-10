-- Fix registry resource projection timestamp normalization.
--
-- registry_programs.created_at is stored as a bigint epoch millisecond value for
-- v3.13-derived rows. The previous v_registry_resources_unified projection treated
-- that bigint as epoch seconds, producing impossible future timestamps such as
-- year 58544. This view-level repair preserves the source value and normalizes the
-- projection without mutating registry_programs.

create or replace view public.v_registry_resources_unified as
select
  'registry_programs:'::text || rp.id as resource_uid,
  'registry_programs'::text as realm,
  rp.id as source_id,
  coalesce(nullif(rp.name, ''::text), '[unnamed]'::text) as name,
  rp.category,
  rp.jurisdiction_id as jurisdiction,
  rp.agency as organization,
  rp.contact as phone,
  rp.website,
  rp.eligibility,
  rp.apply_notes as notes,
  null::text as coverage,
  case
    when rp.created_at is null then null::timestamp with time zone
    when rp.created_at > 9999999999 then to_timestamp((rp.created_at::double precision / 1000.0))
    else to_timestamp(rp.created_at::double precision)
  end as created_at,
  null::jsonb as metadata
from public.registry_programs rp
union all
select
  'nonprofit_registry:'::text || n.uuid as resource_uid,
  'nonprofit_registry'::text as realm,
  n.uuid as source_id,
  coalesce(nullif(n.full_entity_name, ''::text), '[unnamed]'::text) as name,
  n.entity_type as category,
  n.jurisdiction,
  n.full_entity_name as organization,
  coalesce(n.contact ->> 'phone'::text, n.contact ->> 'telephone'::text) as phone,
  coalesce(n.contact ->> 'website'::text, n.domains ->> 0) as website,
  null::text as eligibility,
  null::text as notes,
  null::text as coverage,
  n.created_at,
  jsonb_build_object(
    'aliases', n.aliases,
    'verification_status', n.verification_status,
    'application_methods', n.application_methods,
    'provenance', n.provenance
  ) as metadata
from public.nonprofit_registry n
union all
select
  'government_benefits_registry:'::text || g.uuid as resource_uid,
  'government_benefits_registry'::text as realm,
  g.uuid as source_id,
  coalesce(nullif(g.full_entity_name, ''::text), '[unnamed]'::text) as name,
  g.entity_type as category,
  g.jurisdiction,
  g.administering_agency as organization,
  g.contact_phone as phone,
  g.website,
  null::text as eligibility,
  null::text as notes,
  null::text as coverage,
  g.created_at,
  jsonb_build_object(
    'benefit_categories', g.benefit_categories,
    'application_methods', g.application_methods,
    'eligibility_requirements', g.eligibility_requirements,
    'provenance', g.provenance
  ) as metadata
from public.government_benefits_registry g
union all
select
  'legal_aid_organizations:'::text || lao.org_id as resource_uid,
  'legal_aid_organizations'::text as realm,
  lao.org_id as source_id,
  coalesce(nullif(lao.organization, ''::text), '[unnamed]'::text) as name,
  lao.org_type as category,
  lao.jurisdiction_name as jurisdiction,
  lao.organization,
  lao.phone,
  lao.website,
  null::text as eligibility,
  lao.notes,
  lao.coverage,
  lao.created_at,
  jsonb_build_object(
    'claim_types', lao.claim_types,
    'intake_method', lao.intake_method,
    'capacity_status', lao.capacity_status,
    'specialties', lao.specialties
  ) as metadata
from public.legal_aid_organizations lao;

comment on view public.v_registry_resources_unified is
  'Unified registry resource projection. registry_programs.created_at bigint values are normalized from epoch milliseconds when necessary; source rows are not mutated.';

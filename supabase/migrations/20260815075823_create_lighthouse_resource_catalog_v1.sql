create or replace view public.v_lighthouse_resource_catalog_v1 as
with luminari_contacts as (
  select resource_entity_id,
    max(contact_value) filter (where lower(contact_type) in ('phone','telephone')) as phone,
    max(contact_value) filter (where lower(contact_type)='email') as email,
    max(contact_value) filter (where lower(contact_type) in ('website','url','portal')) as website
  from public.luminari_resource_contact_points
  group by resource_entity_id
), luminari_locations as (
  select resource_entity_id,
    max(concat_ws(', ',nullif(address_line1,''),nullif(address_line2,''),nullif(city,''),nullif(state,''),nullif(postal_code,''))) as address
  from public.luminari_resource_locations
  group by resource_entity_id
)
select
  'luminari:' || e.resource_entity_id::text as resource_uid,
  'luminari_resource_entities'::text as source_lane,
  e.resource_entity_id::text as source_id,
  e.resource_name as name,
  coalesce(e.resource_category,e.resource_type) as category,
  coalesce(nullif(e.jurisdiction,''),nullif(e.state,'')) as jurisdiction_raw,
  public.normalize_state_code(coalesce(nullif(e.state,''),nullif(e.jurisdiction,''))) as jurisdiction_code,
  coalesce(e.metadata->>'organization',e.metadata->>'agency',e.resource_name) as organization,
  c.phone,
  c.email,
  c.website,
  l.address,
  e.description,
  e.eligibility_summary as eligibility,
  e.apply_notes as notes,
  e.created_at,
  e.verification_status,
  jsonb_build_object('canonical_id',e.canonical_id,'source_table',e.source_table,'source_pk',e.source_pk,'source_hash',e.source_hash,'promotion_status',e.promotion_status,'provenance_status',e.provenance_status,'domains',e.domains,'service_categories',e.service_categories) || coalesce(e.metadata,'{}'::jsonb) as metadata
from public.luminari_resource_entities e
left join luminari_contacts c using (resource_entity_id)
left join luminari_locations l using (resource_entity_id)
union all
select
  'registry:' || r.resource_uid,
  r.realm,
  r.source_id,
  r.name,
  r.category,
  r.jurisdiction,
  public.normalize_state_code(r.jurisdiction),
  r.organization,
  r.phone,
  null::text,
  r.website,
  null::text,
  null::text,
  r.eligibility,
  r.notes,
  r.created_at,
  coalesce(r.metadata->>'verification_status','canonical'),
  coalesce(r.metadata,'{}'::jsonb) || jsonb_build_object('coverage',r.coverage,'realm',r.realm)
from public.v_registry_resources_unified r
union all
select
  'sais:' || s.resource_uuid::text,
  'sais_import'::text,
  s.resource_id,
  s.organization_name,
  coalesce(s.category_tags[1],s.service_type),
  coalesce(s.jurisdiction_code,s.jurisdiction_scope),
  public.normalize_state_code(coalesce(s.jurisdiction_code,s.jurisdiction_scope)),
  s.organization_name,
  case when cardinality(s.phone_numbers)>0 then s.phone_numbers[1] else s.official_contact end,
  case when cardinality(s.emails)>0 then s.emails[1] else null end,
  s.website,
  null::text,
  s.description,
  null::text,
  s.verification_note,
  null::timestamptz,
  s.verification_status,
  jsonb_build_object('resource_id',s.resource_id,'jurisdiction_scope',s.jurisdiction_scope,'source_document_id',s.source_document_id,'source_sha256',s.source_sha256,'candidate_fingerprint',s.candidate_fingerprint,'deadline_count',s.deadline_count,'urgency_flags',s.urgency_flags,'match_status',s.match_status,'promotion_status',s.promotion_status,'source_lanes',s.source_lanes)
from public.v_sais_unified_resources_v1 s;

-- Preserve the existing Lighthouse resource catalog contract while preventing
-- SAIS legal authorities, doctrine, courts, and accountability objects from
-- being published as person-facing resources.

CREATE OR REPLACE VIEW public.v_lighthouse_resource_catalog_v1 AS
WITH luminari_contacts AS (
  SELECT resource_entity_id,
    max(contact_value) FILTER (WHERE lower(contact_type) = ANY (ARRAY['phone','telephone'])) AS phone,
    max(contact_value) FILTER (WHERE lower(contact_type) = 'email') AS email,
    max(contact_value) FILTER (WHERE lower(contact_type) = ANY (ARRAY['website','url','portal'])) AS website
  FROM public.luminari_resource_contact_points GROUP BY resource_entity_id
), luminari_locations AS (
  SELECT resource_entity_id,
    max(concat_ws(', ',NULLIF(address_line1,''),NULLIF(address_line2,''),NULLIF(city,''),NULLIF(state,''),NULLIF(postal_code,''))) AS address
  FROM public.luminari_resource_locations GROUP BY resource_entity_id
)
SELECT 'luminari:'||e.resource_entity_id::text AS resource_uid,
  'luminari_resource_entities'::text AS source_lane,e.resource_entity_id::text AS source_id,e.resource_name AS name,
  COALESCE(e.resource_category,e.resource_type) AS category,COALESCE(NULLIF(e.jurisdiction,''),NULLIF(e.state,'')) AS jurisdiction_raw,
  public.normalize_state_code(COALESCE(NULLIF(e.state,''),NULLIF(e.jurisdiction,''))) AS jurisdiction_code,
  COALESCE(e.metadata->>'organization',e.metadata->>'agency',e.resource_name) AS organization,c.phone,c.email,c.website,l.address,
  e.description,e.eligibility_summary AS eligibility,e.apply_notes AS notes,e.created_at,e.verification_status,
  jsonb_build_object('canonical_id',e.canonical_id,'source_table',e.source_table,'source_pk',e.source_pk,'source_hash',e.source_hash,'promotion_status',e.promotion_status,'provenance_status',e.provenance_status,'domains',e.domains,'service_categories',e.service_categories)||COALESCE(e.metadata,'{}'::jsonb) AS metadata
FROM public.luminari_resource_entities e
LEFT JOIN luminari_contacts c USING(resource_entity_id)
LEFT JOIN luminari_locations l USING(resource_entity_id)
UNION ALL
SELECT 'registry:'||r.resource_uid,r.realm,r.source_id,r.name,r.category,r.jurisdiction,
  public.normalize_state_code(r.jurisdiction),r.organization,r.phone,NULL::text,r.website,NULL::text,NULL::text,r.eligibility,r.notes,r.created_at,
  COALESCE(r.metadata->>'verification_status','canonical'),COALESCE(r.metadata,'{}'::jsonb)||jsonb_build_object('coverage',r.coverage,'realm',r.realm)
FROM public.v_registry_resources_unified r
UNION ALL
SELECT 'sais:'||s.civic_object_id::text,'sais_import'::text,s.source_object_id,s.title,
  COALESCE(s.category_tags[1],s.service_type),COALESCE(s.jurisdiction_code,s.jurisdiction_scope),
  public.normalize_state_code(COALESCE(s.jurisdiction_code,s.jurisdiction_scope)),s.title,
  CASE WHEN cardinality(s.phone_numbers)>0 THEN s.phone_numbers[1] ELSE s.official_contact END,
  CASE WHEN cardinality(s.emails)>0 THEN s.emails[1] ELSE NULL::text END,
  s.official_url,NULL::text,s.description,NULL::text,s.notes,s.created_at,s.verification_status,
  jsonb_build_object('source_object_id',s.source_object_id,'object_class',s.object_class,'organization_type',s.organization_type,'target_surface',s.target_surface,'document_number',s.document_number,'document_domain',s.document_domain,'jurisdiction_scope',s.jurisdiction_scope,'source_file',s.source_file,'source_sha256',s.source_sha256,'candidate_fingerprint',s.candidate_fingerprint,'deadline_count',s.deadline_count,'urgency_flags',s.urgency_flags,'match_status',s.match_status,'promotion_status',s.promotion_status)
FROM public.v_sais_resource_directory_candidates_v2 s;

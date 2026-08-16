-- Typed SAIS civic object projection and Doc 27 supplemental capacity.
-- Additive. The original 26-document SAIS manifest remains immutable.

ALTER TABLE sais_import.source_document DROP CONSTRAINT IF EXISTS source_document_document_number_check;
ALTER TABLE sais_import.source_document ADD CONSTRAINT source_document_document_number_check CHECK (document_number BETWEEN 1 AND 27);

CREATE OR REPLACE VIEW public.v_sais_civic_objects_v1 WITH (security_invoker=true) AS
SELECT
 c.candidate_id AS civic_object_id,
 c.run_id,
 c.document_id,
 c.document_number,
 c.resource_id AS source_object_id,
 c.title,
 c.service_type,
 c.organization_type,
 CASE
   WHEN c.organization_type IN ('federal_law','state_law') THEN 'legal_authority'
   WHEN c.organization_type = 'federal_legal_mechanism' THEN 'legal_mechanism'
   WHEN c.organization_type IN ('legal_doctrine_guidance','federal_and_legal') THEN 'legal_guidance'
   WHEN c.organization_type IN ('federal_agency','state_agency','federal_law_enforcement','government_specialized_unit') THEN 'government_agency'
   WHEN c.organization_type IN ('state_court','federal_court','federal_military_board') THEN 'court_or_board'
   WHEN c.organization_type IN ('federal_accountability_mechanism','state_accountability_mechanism','national_nonprofit_watchdog') THEN 'accountability_channel'
   WHEN c.organization_type IN ('research_organization','federal_research_center') THEN 'research_evidence_source'
   WHEN c.organization_type IN ('federal_program','federal_state_program','state_program','state_federal_program') THEN 'public_program'
   WHEN c.organization_type IN ('national_nonprofit_legal','national_nonprofit') THEN 'service_organization'
   WHEN c.organization_type IN ('national_network','nonprofit_network','nonprofit_and_commercial','manufacturer_and_nonprofit') THEN 'service_network'
   WHEN c.organization_type = 'national_professional_association' THEN 'professional_association'
   WHEN c.organization_type IN ('federal_state_local','state_federal_program') THEN 'multi_level_routing'
   ELSE 'unresolved_object_type'
 END AS object_class,
 CASE
   WHEN c.organization_type IN ('federal_program','federal_state_program','state_program','state_federal_program') THEN 'resource_directory'
   WHEN c.organization_type IN ('national_nonprofit_legal','national_nonprofit','national_network','nonprofit_network','nonprofit_and_commercial','manufacturer_and_nonprofit') THEN 'resource_directory'
   WHEN c.organization_type IN ('federal_law','state_law','federal_legal_mechanism','legal_doctrine_guidance','federal_and_legal') THEN 'legal_library'
   WHEN c.organization_type IN ('federal_agency','state_agency','federal_law_enforcement','government_specialized_unit','federal_accountability_mechanism','state_accountability_mechanism','national_nonprofit_watchdog','state_court','federal_court','federal_military_board') THEN 'workflow_and_accountability'
   WHEN c.organization_type IN ('research_organization','federal_research_center') THEN 'evidence_reference'
   ELSE 'typed_corpus'
 END AS target_surface,
 (c.organization_type IN ('federal_program','federal_state_program','state_program','state_federal_program','national_nonprofit_legal','national_nonprofit','national_network','nonprofit_network','nonprofit_and_commercial','manufacturer_and_nonprofit')) AS resource_directory_eligible,
 c.document_domain,
 c.category_tags,
 c.jurisdiction_raw,
 c.jurisdiction_scope,
 c.jurisdiction_code,
 c.official_url,
 c.official_contact,
 c.phone_numbers,
 c.emails,
 c.description,
 c.statutory_authority,
 c.statutory_source_urls,
 c.verification_status,
 c.last_verified,
 c.notes,
 c.urgency_flags,
 c.deadline_count,
 c.source_file,
 c.source_sha256,
 c.candidate_fingerprint,
 c.source_record_hash,
 c.match_status,
 c.promotion_status,
 c.created_at,
 c.updated_at
FROM sais_import.resource_candidate c;

CREATE OR REPLACE VIEW public.v_sais_resource_directory_candidates_v2 WITH (security_invoker=true) AS
SELECT * FROM public.v_sais_civic_objects_v1 WHERE resource_directory_eligible;

REVOKE ALL ON public.v_sais_civic_objects_v1, public.v_sais_resource_directory_candidates_v2 FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_sais_civic_objects_v1, public.v_sais_resource_directory_candidates_v2 TO service_role;

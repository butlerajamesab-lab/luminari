begin;

insert into public.domain_deep_dive_v3_13_stage (
    source_file, source_hash_raw, source_kind, source_key, table_idx, row_idx, payload
) values
('luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx','5932ceaf','domain_deep_dive','disability-services',27,0,'{"resource_id":"DIS-FED-001","lighthouse_existing_ids":"dis-bazelon-001","resource_category":"disability_services","subcategory":"FEDERAL","jurisdiction_level":"national","jurisdiction":"ALL","organization_name":"ADA National Network -- Federal Disability Rights Technical Assistance","organization_type":"federal_technical_assistance_center","service_type":"ada_rights_technical_assistance","official_url":"https://adata.org","official_contact":"800-949-4232","statutory_authority":"ADA (42 U.S.C. sec. 12101 et seq.)","verification_status":"VERIFIED","last_verified":"2026-07-07","notes":"Free, anonymous, 10 regional centers. Best first call for any ADA question.","revision":"v1.0"}'::jsonb),
('luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx','5932ceaf','domain_deep_dive','disability-services',27,1,'{"resource_id":"DIS-FED-002","lighthouse_existing_ids":"","resource_category":"disability_services","subcategory":"FEDERAL","jurisdiction_level":"national","jurisdiction":"ALL","organization_name":"Job Accommodation Network (JAN) -- Workplace Disability Accommodations","organization_type":"federal_technical_assistance","service_type":"employment_disability_accommodations","official_url":"https://askjan.org","official_contact":"800-526-7234 | TTY 877-781-9403","statutory_authority":"ADA Title I (42 U.S.C. sec. 12112)","verification_status":"VERIFIED","last_verified":"2026-07-07","notes":"Most practical disability accommodation resource. Free, confidential, covers all conditions and industries.","revision":"v1.0"}'::jsonb),
('luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx','5932ceaf','domain_deep_dive','disability-services',27,2,'{"resource_id":"DIS-FED-003","lighthouse_existing_ids":"","resource_category":"disability_services","subcategory":"FEDERAL","jurisdiction_level":"national","jurisdiction":"ALL","organization_name":"Social Security Disability -- SSDI and SSI","organization_type":"federal_benefit_program","service_type":"disability_benefits_ssdi_ssi","official_url":"https://www.ssa.gov/disability","official_contact":"800-772-1213 | TTY 800-325-0778","statutory_authority":"42 U.S.C. sec. 423 (SSDI) | 42 U.S.C. sec. 1382 (SSI)","verification_status":"VERIFIED","last_verified":"2026-07-07","notes":"60-day appeal SOL is critical and fatal if missed. ABLE accounts protect SSI eligibility while saving.","revision":"v1.0"}'::jsonb),
('luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx','5932ceaf','domain_deep_dive','disability-services',27,3,'{"resource_id":"DIS-FED-004","lighthouse_existing_ids":"","resource_category":"disability_services","subcategory":"FEDERAL","jurisdiction_level":"state","jurisdiction":"ALL_STATES","organization_name":"Medicaid HCBS Waivers -- Home and Community Based Services","organization_type":"federal_state_medicaid_program","service_type":"medicaid_hcbs_disability_services","official_url":"https://www.medicaid.gov/medicaid/home-community-based-services/index.html","official_contact":"Contact state Medicaid or developmental disabilities agency","statutory_authority":"42 U.S.C. sec. 1396n(c) (HCBS waiver authority)","verification_status":"VERIFIED","last_verified":"2026-07-07","notes":"Waiting lists are long. Olmstead requires community placement. Apply immediately.","revision":"v1.0"}'::jsonb),
('luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx','5932ceaf','domain_deep_dive','disability-services',27,4,'{"resource_id":"DIS-FED-005","lighthouse_existing_ids":"","resource_category":"disability_services","subcategory":"FEDERAL","jurisdiction_level":"national","jurisdiction":"ALL","organization_name":"Section 504 and ADA in Schools and Programs","organization_type":"federal_law_enforcement","service_type":"disability_education_civil_rights","official_url":"https://www2.ed.gov/about/offices/list/ocr/504faq.html","official_contact":"DOE OCR: 800-421-3481 | DOJ: 800-514-0301","statutory_authority":"Section 504 (29 U.S.C. sec. 794) | ADA Title II (42 U.S.C. sec. 12132)","verification_status":"VERIFIED","last_verified":"2026-07-07","notes":"Section 504 is broader than IDEA -- covers all federally funded programs. OCR 180-day SOL.","revision":"v1.0"}'::jsonb)
on conflict (source_row_key) do nothing;

insert into public.substrate_candidate_disposition (
    artifact_id, source_file, source_sha256, source_table_idx, source_row_idx,
    source_row_key, candidate_kind, target_table, target_identity, disposition, reason
)
select
    a.artifact_id,
    s.source_file,
    s.source_hash_raw,
    s.table_idx,
    s.row_idx,
    s.source_row_key,
    'normalized_resource',
    'registry_programs',
    jsonb_build_object(
        'resource_id', s.payload ->> 'resource_id',
        'organization_name', s.payload ->> 'organization_name',
        'official_url', s.payload ->> 'official_url',
        'jurisdiction', s.payload ->> 'jurisdiction'
    ),
    'unresolved',
    'Normalized disability resource staged; awaiting identity and entity-type comparison against canonical resource/program tables.'
from public.domain_deep_dive_v3_13_stage s
cross join public.substrate_source_artifact a
where a.source_sha256='9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be'
  and s.source_file='luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx'
  and s.table_idx=27
  and s.row_idx between 0 and 4
on conflict (source_sha256, source_row_key) do update set
    candidate_kind=excluded.candidate_kind,
    target_table=excluded.target_table,
    target_identity=excluded.target_identity,
    disposition=excluded.disposition,
    reason=excluded.reason,
    updated_at=now();

commit;

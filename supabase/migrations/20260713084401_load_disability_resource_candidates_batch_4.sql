begin;

insert into public.domain_deep_dive_v3_13_stage (
    source_file, source_hash_raw, source_kind, source_key, table_idx, row_idx, payload
) values
('luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx','5932ceaf','domain_deep_dive','disability-services',27,15,'{"resource_id":"DIS-HOU-001","lighthouse_existing_ids":"","resource_category":"disability_services","subcategory":"HOUSING","jurisdiction_level":"national","jurisdiction":"ALL","organization_name":"Fair Housing Act -- Disability Housing Rights","organization_type":"federal_law_enforcement","service_type":"disability_housing_fha_rights","official_url":"https://www.hud.gov/program_offices/fair_housing_equal_opp","official_contact":"HUD FHEO: 800-669-9777","statutory_authority":"Fair Housing Act (42 U.S.C. sec. 3604(f))","verification_status":"VERIFIED","last_verified":"2026-07-07","notes":"Emotional support animals and reserved parking are the most common reasonable accommodation issues.","revision":"v1.0"}'::jsonb),
('luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx','5932ceaf','domain_deep_dive','disability-services',27,16,'{"resource_id":"DIS-HOU-002","lighthouse_existing_ids":"","resource_category":"disability_services","subcategory":"HOUSING","jurisdiction_level":"national","jurisdiction":"ALL","organization_name":"Olmstead Implementation -- Community Integration Mandate","organization_type":"federal_law_enforcement","service_type":"disability_olmstead_community_integration","official_url":"https://www.ada.gov/olmstead/","official_contact":"DOJ Disability Rights: 800-514-0301","statutory_authority":"ADA Title II (42 U.S.C. sec. 12132) | Olmstead v. L.C. 527 U.S. 581 (1999)","verification_status":"VERIFIED","last_verified":"2026-07-07","notes":"Olmstead applies to all disability types -- not just mental health. Active DOJ enforcement via consent decrees.","revision":"v1.0"}'::jsonb),
('luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx','5932ceaf','domain_deep_dive','disability-services',27,17,'{"resource_id":"DIS-HOU-003","lighthouse_existing_ids":"","resource_category":"disability_services","subcategory":"HOUSING","jurisdiction_level":"state","jurisdiction":"ALL_STATES","organization_name":"HUD Housing Choice Voucher (Section 8) -- Disability Priority","organization_type":"federal_program","service_type":"disability_housing_voucher_section8","official_url":"https://www.hud.gov/topics/housing_choice_voucher_program_section_8","official_contact":"Contact local Public Housing Authority (PHA)","statutory_authority":"42 U.S.C. sec. 1437f (Section 8 authority)","verification_status":"VERIFIED","last_verified":"2026-07-07","notes":"NED vouchers set aside specifically for non-elderly people with disabilities. Apply immediately at local PHA.","revision":"v1.0"}'::jsonb),
('luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx','5932ceaf','domain_deep_dive','disability-services',27,18,'{"resource_id":"DIS-AST-001","lighthouse_existing_ids":"","resource_category":"disability_services","subcategory":"ASSISTIVE_TECH","jurisdiction_level":"state","jurisdiction":"ALL_STATES","organization_name":"RESNA -- Assistive Technology Act Programs","organization_type":"federal_state_program","service_type":"assistive_technology_access_programs","official_url":"https://www.resna.org | https://ataporg.org","official_contact":"RESNA: 571-589-3300 | Contact state AT program","statutory_authority":"Assistive Technology Act of 1998 (29 U.S.C. sec. 3001)","verification_status":"VERIFIED","last_verified":"2026-07-07","notes":"Every state has an AT program. Demos, loans, and financing available. ataporg.org to find your state.","revision":"v1.0"}'::jsonb),
('luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx','5932ceaf','domain_deep_dive','disability-services',27,19,'{"resource_id":"DIS-LEG-001","lighthouse_existing_ids":"dis-bazelon-001","resource_category":"disability_services","subcategory":"LEGAL","jurisdiction_level":"national","jurisdiction":"ALL","organization_name":"Bazelon Center for Mental Health Law","organization_type":"national_nonprofit_legal","service_type":"disability_mental_health_legal_advocacy","official_url":"https://www.bazelon.org","official_contact":"202-467-5730","statutory_authority":"ADA | FHA | Olmstead | MHPAEA | CRIPA","verification_status":"VERIFIED","last_verified":"2026-07-07","notes":"Lighthouse: dis-bazelon-001. Systemic focus. Individual cases go to state P&A.","revision":"v1.0"}'::jsonb)
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
  and s.row_idx between 15 and 19
on conflict (source_sha256, source_row_key) do update set
    candidate_kind=excluded.candidate_kind,
    target_table=excluded.target_table,
    target_identity=excluded.target_identity,
    disposition=excluded.disposition,
    reason=excluded.reason,
    updated_at=now();

commit;

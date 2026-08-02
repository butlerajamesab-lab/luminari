begin;

insert into public.domain_deep_dive_v3_13_stage (
    source_file, source_hash_raw, source_kind, source_key, table_idx, row_idx, payload
) values
('luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx','5932ceaf','domain_deep_dive','disability-services',27,5,'{"resource_id":"DIS-FED-006","lighthouse_existing_ids":"","resource_category":"disability_services","subcategory":"FEDERAL","jurisdiction_level":"state","jurisdiction":"ALL_STATES","organization_name":"Vocational Rehabilitation (VR) -- State-Federal Employment Programs","organization_type":"federal_state_program","service_type":"disability_employment_vocational_rehabilitation","official_url":"https://rsa.ed.gov/about/states","official_contact":"Contact state VR agency (varies by state)","statutory_authority":"Rehabilitation Act sec. 100 (29 U.S.C. sec. 720)","verification_status":"VERIFIED","last_verified":"2026-07-07","notes":"Order of Selection may limit access in some states. Supported Employment is gold standard for significant disabilities.","revision":"v1.0"}'::jsonb),
('luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx','5932ceaf','domain_deep_dive','disability-services',27,6,'{"resource_id":"DIS-FED-007","lighthouse_existing_ids":"","resource_category":"disability_services","subcategory":"FEDERAL","jurisdiction_level":"state","jurisdiction":"ALL_STATES","organization_name":"Protection and Advocacy (P&A) Organizations -- Every State","organization_type":"federal_designated_pa_network","service_type":"disability_legal_advocacy_pa","official_url":"https://www.ndrn.org/find-your-pa/","official_contact":"NDRN (National Disability Rights Network): 202-408-9514","statutory_authority":"42 U.S.C. sec. 15043 (P&A authority) | 42 U.S.C. sec. 10801 (PAIMI)","verification_status":"VERIFIED","last_verified":"2026-07-07","notes":"Every state has one. Find at ndrn.org/find-your-pa. Has investigative authority others do not.","revision":"v1.0"}'::jsonb),
('luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx','5932ceaf','domain_deep_dive','disability-services',27,7,'{"resource_id":"DIS-PHY-001","lighthouse_existing_ids":"","resource_category":"disability_services","subcategory":"PHYSICAL","jurisdiction_level":"national","jurisdiction":"ALL","organization_name":"United Spinal Association","organization_type":"national_nonprofit","service_type":"spinal_cord_disability_advocacy_peer","official_url":"https://unitedspinal.org","official_contact":"800-962-9629","statutory_authority":"ADA | Rehabilitation Act","verification_status":"VERIFIED","last_verified":"2026-07-07","notes":"Primary SCI/D resource. New Mobility magazine is excellent practical resource.","revision":"v1.0"}'::jsonb),
('luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx','5932ceaf','domain_deep_dive','disability-services',27,8,'{"resource_id":"DIS-PHY-002","lighthouse_existing_ids":"","resource_category":"disability_services","subcategory":"PHYSICAL","jurisdiction_level":"national","jurisdiction":"ALL","organization_name":"National Council on Disability (NCD)","organization_type":"federal_independent_agency","service_type":"disability_policy_research_advisory","official_url":"https://ncd.gov","official_contact":"202-272-2004","statutory_authority":"Rehabilitation Act sec. 400 (29 U.S.C. sec. 780)","verification_status":"VERIFIED","last_verified":"2026-07-07","notes":"Policy and research -- not individual complaints. NCD reports are authoritative for policy advocacy.","revision":"v1.0"}'::jsonb),
('luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx','5932ceaf','domain_deep_dive','disability-services',27,9,'{"resource_id":"DIS-PHY-003","lighthouse_existing_ids":"","resource_category":"disability_services","subcategory":"PHYSICAL","jurisdiction_level":"national","jurisdiction":"ALL","organization_name":"Christopher and Dana Reeve Foundation -- Paralysis Resource Center","organization_type":"national_nonprofit","service_type":"paralysis_disability_resource_peer_support","official_url":"https://www.christopherreeve.org","official_contact":"800-539-7309 (Paralysis Resource Center)","statutory_authority":"Not statutory -- private foundation","verification_status":"VERIFIED","last_verified":"2026-07-07","notes":"Paralysis Resource Center (800-539-7309) is a standout free navigation service.","revision":"v1.0"}'::jsonb)
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
  and s.row_idx between 5 and 9
on conflict (source_sha256, source_row_key) do update set
    candidate_kind=excluded.candidate_kind,
    target_table=excluded.target_table,
    target_identity=excluded.target_identity,
    disposition=excluded.disposition,
    reason=excluded.reason,
    updated_at=now();

commit;

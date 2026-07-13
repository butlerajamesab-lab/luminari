begin;

insert into public.domain_deep_dive_v3_13_stage (
    source_file, source_hash_raw, source_kind, source_key, table_idx, row_idx, payload
) values
('luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx','5932ceaf','domain_deep_dive','disability-services',27,20,'{"resource_id":"DIS-LEG-002","lighthouse_existing_ids":"","resource_category":"disability_services","subcategory":"LEGAL","jurisdiction_level":"national","jurisdiction":"ALL","organization_name":"Disability Rights Advocates (DRA) -- National Litigation","organization_type":"nonprofit_legal_org","service_type":"disability_rights_systemic_litigation","official_url":"https://dralegal.org","official_contact":"510-665-8644","statutory_authority":"ADA | Section 504 | FHA | Rehabilitation Act","verification_status":"VERIFIED","last_verified":"2026-07-07","notes":"Systemic class action focus. For individual cases: ADA National Network or state P&A.","revision":"v1.0"}'::jsonb),
('luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx','5932ceaf','domain_deep_dive','disability-services',27,21,'{"resource_id":"DIS-LEG-003","lighthouse_existing_ids":"","resource_category":"disability_services","subcategory":"LEGAL","jurisdiction_level":"national","jurisdiction":"ALL","organization_name":"National Disability Rights Network (NDRN) -- P&A Directory","organization_type":"national_network","service_type":"disability_pa_network_directory","official_url":"https://www.ndrn.org/find-your-pa/","official_contact":"202-408-9514","statutory_authority":"42 U.S.C. sec. 15043 (P&A authority)","verification_status":"VERIFIED","last_verified":"2026-07-07","notes":"ndrn.org/find-your-pa is the most important first stop for individual disability legal help.","revision":"v1.0"}'::jsonb),
('luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx','5932ceaf','domain_deep_dive','disability-services',27,22,'{"resource_id":"DIS-COM-001","lighthouse_existing_ids":"","resource_category":"disability_services","subcategory":"COMMUNITY","jurisdiction_level":"national","jurisdiction":"ALL","organization_name":"APSE -- Employment First and Supported Employment","organization_type":"national_nonprofit_professional","service_type":"disability_employment_first_supported_employment","official_url":"https://apse.org","official_contact":"404-975-6048","statutory_authority":"Rehabilitation Act sec. 603 (29 U.S.C. sec. 763) | WIOA Employment First | Section 14(c) of FLSA","verification_status":"VERIFIED","last_verified":"2026-07-07","notes":"Section 14(c) subminimum wage certificates are being eliminated in many states. Employment First is the policy direction.","revision":"v1.0"}'::jsonb),
('luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx','5932ceaf','domain_deep_dive','disability-services',27,23,'{"resource_id":"DIS-COM-002","lighthouse_existing_ids":"","resource_category":"disability_services","subcategory":"COMMUNITY","jurisdiction_level":"national","jurisdiction":"ALL","organization_name":"ADAPT -- Disability Rights Activism and Community Integration","organization_type":"national_advocacy_org","service_type":"disability_grassroots_advocacy","official_url":"https://adapt.org","official_contact":"Not published","statutory_authority":"Not statutory -- community advocacy organization","verification_status":"VERIFIED","last_verified":"2026-07-07","notes":"Grassroots advocacy. No direct services. Key historical actor in ADA and Olmstead.","revision":"v1.0"}'::jsonb),
('luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx','5932ceaf','domain_deep_dive','disability-services',27,24,'{"resource_id":"DIS-COM-003","lighthouse_existing_ids":"","resource_category":"disability_services","subcategory":"COMMUNITY","jurisdiction_level":"state","jurisdiction":"ALL_STATES","organization_name":"Independent Living Centers (ILCs) -- Consumer-Controlled Disability Services","organization_type":"federal_state_program","service_type":"disability_independent_living_services","official_url":"https://www.ncil.org/find-an-il-center/","official_contact":"NCIL (National Council on Independent Living): 202-207-0334","statutory_authority":"Rehabilitation Act Title VII (29 U.S.C. sec. 796)","verification_status":"VERIFIED","last_verified":"2026-07-07","notes":"Over 400 ILCs nationwide. Consumer-controlled. Find at ncil.org/find-an-il-center.","revision":"v1.0"}'::jsonb)
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
  and s.row_idx between 20 and 24
on conflict (source_sha256, source_row_key) do update set
    candidate_kind=excluded.candidate_kind,
    target_table=excluded.target_table,
    target_identity=excluded.target_identity,
    disposition=excluded.disposition,
    reason=excluded.reason,
    updated_at=now();

update public.substrate_promotion_batch
set candidate_count = (
        select count(*)
        from public.domain_deep_dive_v3_13_stage
        where source_file='luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx'
          and promotion_status='candidate'
    ),
    notes='All 25 normalized Disability Services resources and 10 statute summaries are staged. State and territory directory entries remain pending.',
    updated_at=now()
where batch_name='v3_13_disability_deep_dive_001';

commit;

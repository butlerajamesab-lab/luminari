begin;

insert into public.domain_deep_dive_v3_13_stage (
    source_file, source_hash_raw, source_kind, source_key, table_idx, row_idx, payload
) values
('luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx','5932ceaf','domain_deep_dive','disability-services',27,10,'{"resource_id":"DIS-INT-001","lighthouse_existing_ids":"","resource_category":"disability_services","subcategory":"INTELLECTUAL","jurisdiction_level":"national","jurisdiction":"ALL","organization_name":"The Arc -- Intellectual and Developmental Disabilities","organization_type":"national_nonprofit_with_chapters","service_type":"idd_advocacy_services_peer","official_url":"https://thearc.org","official_contact":"800-433-5255","statutory_authority":"ADA | IDEA | Medicaid HCBS | Rehabilitation Act","verification_status":"VERIFIED","last_verified":"2026-07-07","notes":"600+ local chapters. Best IDD resource for families. Special Needs Trust and guardianship alternatives are key.","revision":"v1.0"}'::jsonb),
('luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx','5932ceaf','domain_deep_dive','disability-services',27,11,'{"resource_id":"DIS-INT-002","lighthouse_existing_ids":"","resource_category":"disability_services","subcategory":"INTELLECTUAL","jurisdiction_level":"national","jurisdiction":"ALL","organization_name":"AAIDD -- American Association on Intellectual and Developmental Disabilities","organization_type":"professional_association","service_type":"idd_professional_standards_research","official_url":"https://www.aaidd.org","official_contact":"202-387-1968","statutory_authority":"Not statutory -- professional standards body","verification_status":"VERIFIED","last_verified":"2026-07-07","notes":"AAIDD definition is the legal/clinical standard for intellectual disability. Critical in SSA and criminal justice contexts.","revision":"v1.0"}'::jsonb),
('luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx','5932ceaf','domain_deep_dive','disability-services',27,12,'{"resource_id":"DIS-INT-003","lighthouse_existing_ids":"","resource_category":"disability_services","subcategory":"INTELLECTUAL","jurisdiction_level":"national","jurisdiction":"ALL","organization_name":"Supported Decision-Making -- Alternatives to Guardianship","organization_type":"advocacy_and_legal_resource","service_type":"idd_supported_decision_making_guardianship_alternative","official_url":"https://supporteddecisionmaking.org","official_contact":"Quality Trust for Individuals with Disabilities: 202-448-1448","statutory_authority":"Not statutory federally -- state SDM statutes vary","verification_status":"VERIFIED","last_verified":"2026-07-07","notes":"Guardianship removes all legal rights. SDM preserves autonomy. Consider before pursuing guardianship.","revision":"v1.0"}'::jsonb),
('luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx','5932ceaf','domain_deep_dive','disability-services',27,13,'{"resource_id":"DIS-SEN-001","lighthouse_existing_ids":"","resource_category":"disability_services","subcategory":"SENSORY","jurisdiction_level":"national","jurisdiction":"ALL","organization_name":"National Association of the Deaf (NAD)","organization_type":"national_nonprofit","service_type":"deaf_hard_of_hearing_advocacy_legal","official_url":"https://www.nad.org","official_contact":"301-587-1788 | VP: 571-434-4861","statutory_authority":"ADA (42 U.S.C. sec. 12102) | Section 504","verification_status":"VERIFIED","last_verified":"2026-07-07","notes":"Healthcare right to interpreter at no cost is frequently violated. File DOJ ADA complaint.","revision":"v1.0"}'::jsonb),
('luminari-DISABILITY-SERVICES-DEEP-DIVE-2026.docx','5932ceaf','domain_deep_dive','disability-services',27,14,'{"resource_id":"DIS-SEN-002","lighthouse_existing_ids":"","resource_category":"disability_services","subcategory":"SENSORY","jurisdiction_level":"national","jurisdiction":"ALL","organization_name":"American Foundation for the Blind (AFB)","organization_type":"national_nonprofit","service_type":"blind_low_vision_advocacy_resources","official_url":"https://www.afb.org","official_contact":"212-502-7600","statutory_authority":"ADA | Rehabilitation Act | Blind Persons Act","verification_status":"VERIFIED","last_verified":"2026-07-07","notes":"State Services for the Blind is a separate VR program in most states.","revision":"v1.0"}'::jsonb)
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
  and s.row_idx between 10 and 14
on conflict (source_sha256, source_row_key) do update set
    candidate_kind=excluded.candidate_kind,
    target_table=excluded.target_table,
    target_identity=excluded.target_identity,
    disposition=excluded.disposition,
    reason=excluded.reason,
    updated_at=now();

commit;

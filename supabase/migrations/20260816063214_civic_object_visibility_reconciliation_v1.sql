CREATE OR REPLACE VIEW public.v_civic_object_visibility_v1 WITH (security_invoker=true) AS
SELECT c.candidate_key AS object_ref,c.candidate_type AS source_object_type,
CASE WHEN c.candidate_type <> 'workbook_record' THEN c.candidate_type
WHEN lower(coalesce(c.section_name,'')) IN ('program_master','benefits_program_master','national_benefits_program','wa_registry_program','pass3_program_card','master_template_program') THEN 'program'
WHEN lower(coalesce(c.section_name,'')) IN ('resource_master','bucket_resource','resource','deep_dive_resource','mh_resource','wa_resource_directory','federal_resource_directory','national_hotline') THEN 'resource'
WHEN lower(coalesce(c.section_name,'')) IN ('resource_phone','resource_address','resource_email','bucket_resource_phone','bucket_resource_address','bucket_resource_email','address_audit_org') THEN 'contact_record'
WHEN lower(coalesce(c.section_name,''))='entity_master' THEN 'organization'
WHEN lower(coalesce(c.section_name,'')) IN ('verified_enforcement_agency','state_agency_crosswalk') THEN 'agency'
WHEN lower(coalesce(c.section_name,''))='pass3_entity_escalation' THEN 'enforcement_pathway'
WHEN lower(coalesce(c.section_name,'')) IN ('statute_master','verified_statute','legal_statutes_csv_import','statute_key_text','case_law_master','verified_case_law','case_statute_link') THEN 'legal_authority'
WHEN lower(coalesce(c.section_name,'')) IN ('workflow_deadline_master','verified_workflow_deadline','pass3_workflow_step','pass3_workflow_summary','master_template_workflow','strategy_path_step') THEN 'workflow'
WHEN lower(coalesce(c.section_name,'')) IN ('sol_scenario_deadline','sol_master') THEN 'deadline'
WHEN lower(coalesce(c.section_name,'')) IN ('signal_master','pass3_policy_alert') THEN 'policy_alert'
WHEN lower(coalesce(c.section_name,''))='weak_joint_master' THEN 'policy_pattern'
WHEN lower(coalesce(c.section_name,''))='case_instance_master' THEN 'case_instance'
WHEN lower(coalesce(c.section_name,'')) IN ('case_evidence','case_friction_source') THEN 'case_evidence'
WHEN lower(coalesce(c.section_name,''))='case_finding' THEN 'case_finding'
WHEN lower(coalesce(c.section_name,''))='case_resolution_pathway' THEN 'case_resolution_pathway'
WHEN lower(coalesce(c.section_name,'')) IN ('jurisdiction_fact_master','state_registry_variant_note','state_registry_variant_row','federal_note','national_benefits_research_note','bucket_jurisdiction_narrative','pnw_jurisdiction') THEN 'jurisdiction_fact'
WHEN lower(coalesce(c.section_name,'')) IN ('tribal_note','tribal_national_framework','unrecognized_tribes_row','unrecognized_tribes_note','unrecognized_tribes_framework_v') THEN 'tribal_governance_record'
WHEN lower(coalesce(c.section_name,'')) IN ('legislator_contact','federal_legislator_provenance','federal_legislator_committee') THEN 'legislator'
WHEN lower(coalesce(c.section_name,'')) IN ('_schema_manifest','_schema_tables','_master_index','_route_binding','_next_moves','_promotion_map','_platform_synthesis','readme','source_document','corpus_import_queue') THEN 'workbook_context'
WHEN lower(coalesce(c.section_name,''))='unresolved_citation' THEN 'unresolved_legal_reference'
ELSE 'unresolved_source_record' END AS object_class,
CASE WHEN c.candidate_type='resource' OR (c.candidate_type='workbook_record' AND lower(coalesce(c.section_name,'')) IN ('resource_master','bucket_resource','resource','deep_dive_resource','mh_resource','wa_resource_directory','federal_resource_directory','national_hotline')) THEN 'resource_directory'
WHEN c.candidate_type='legal_authority' OR lower(coalesce(c.section_name,'')) IN ('statute_master','verified_statute','legal_statutes_csv_import','statute_key_text','case_law_master','verified_case_law','case_statute_link') THEN 'legal_library'
WHEN c.candidate_type IN ('workflow','oversight_route','enforcement_pathway','oversight_body') OR lower(coalesce(c.section_name,'')) IN ('workflow_deadline_master','verified_workflow_deadline','pass3_workflow_step','pass3_workflow_summary','master_template_workflow','strategy_path_step','verified_enforcement_agency','pass3_entity_escalation') THEN 'workflow_and_accountability'
WHEN lower(coalesce(c.section_name,'')) LIKE 'case_%' THEN 'case_workspace'
WHEN lower(coalesce(c.section_name,'')) IN ('signal_master','pass3_policy_alert','weak_joint_master') THEN 'signal_context'
WHEN lower(coalesce(c.section_name,'')) IN ('_schema_manifest','_schema_tables','_master_index','_route_binding','_next_moves','_promotion_map','_platform_synthesis','readme','source_document','corpus_import_queue') THEN 'operator_context'
ELSE 'typed_corpus' END AS target_surface,
c.run_id,c.artifact_key,c.source_locator,c.source_content_sha256,c.candidate_hash,c.parser_version,c.jurisdiction,c.state_code,c.jurisdiction_resolution_state,c.section_name,c.name,c.organization_name,c.category,c.layer,c.phone,c.email,c.website_url,c.address,c.eligibility_summary,c.apply_notes,c.description,c.candidate_state,c.created_at,c.payload
FROM public.luminari_corpus_candidate_v1 c;

CREATE OR REPLACE VIEW public.v_civic_resource_directory_candidates_v1 WITH (security_invoker=true) AS
SELECT v.*,
CASE WHEN lower(concat_ws(' ',v.category,v.section_name,v.name,v.description)) ~ '(food|nutrition|snap|wic|pantr|meal)' THEN 'food_nutrition'
WHEN lower(concat_ws(' ',v.category,v.section_name,v.name,v.description)) ~ '(utilit|energy|liheap|weatherization)' THEN 'utilities_energy'
WHEN lower(concat_ws(' ',v.category,v.section_name,v.name,v.description)) ~ '(housing|rent|tenant|eviction|homeless|shelter)' THEN 'housing_shelter'
WHEN lower(concat_ws(' ',v.category,v.section_name,v.name,v.description)) ~ '(health|medical|medicaid|medicare|clinic|hospital|pharmacy|mental health|behavioral|substance)' THEN 'health_behavioral_health'
WHEN lower(concat_ws(' ',v.category,v.section_name,v.name,v.description)) ~ '(legal aid|legal services|pro bono|lawhelp)' THEN 'legal_assistance'
WHEN lower(concat_ws(' ',v.category,v.section_name,v.name,v.description)) ~ '(domestic violence|sexual assault|safety|crisis|hotline|helpline|211|988)' THEN 'safety_crisis_routing'
WHEN lower(concat_ws(' ',v.category,v.section_name,v.name,v.description)) ~ '(cash assistance|tanf|income support|unemployment|benefit|ssi|ssdi|wic)' THEN 'benefits_income'
WHEN lower(concat_ws(' ',v.category,v.section_name,v.name,v.description)) ~ '(childcare|child care|youth|foster|runaway)' THEN 'child_youth_family'
WHEN lower(concat_ws(' ',v.category,v.section_name,v.name,v.description)) ~ '(elder|aging|senior|long[- ]term care)' THEN 'elder_aging'
WHEN lower(concat_ws(' ',v.category,v.section_name,v.name,v.description)) ~ '(disability|accessibility|protection.*advocacy)' THEN 'disability_services'
WHEN lower(concat_ws(' ',v.category,v.section_name,v.name,v.description)) ~ '(immigration|refugee|asylum|uscis|eoir)' THEN 'immigration_support'
WHEN lower(concat_ws(' ',v.category,v.section_name,v.name,v.description)) ~ '(employment|labor|job|workforce|worker|wage)' THEN 'employment_workforce'
WHEN lower(concat_ws(' ',v.category,v.section_name,v.name,v.description)) ~ '(tribal|indigenous|native american|alaska native)' THEN 'tribal_indigenous'
WHEN lower(concat_ws(' ',v.category,v.section_name,v.name,v.description)) ~ '(veteran|military|servicemember|service member)' THEN 'military_veterans'
ELSE 'general_unresolved' END AS service_domain,
(coalesce(nullif(v.phone,''),nullif(v.email,''),nullif(v.website_url,''),nullif(v.address,'')) is not null) AS has_access_point
FROM public.v_civic_object_visibility_v1 v WHERE v.object_class='resource';

CREATE OR REPLACE VIEW public.v_civic_object_visibility_summary_v1 WITH (security_invoker=true) AS
SELECT object_class,target_surface,count(*)::bigint AS record_count,
count(*) FILTER (WHERE candidate_state='identity_bound')::bigint AS identity_bound_count,
count(*) FILTER (WHERE candidate_state='unresolved')::bigint AS unresolved_count,
count(*) FILTER (WHERE candidate_state='identity_conflict')::bigint AS identity_conflict_count,
count(*) FILTER (WHERE jurisdiction_resolution_state NOT IN ('unresolved','conflict'))::bigint AS jurisdiction_resolved_count,
max(created_at) AS latest_at
FROM public.v_civic_object_visibility_v1 GROUP BY object_class,target_surface;

CREATE OR REPLACE VIEW public.v_civic_object_stranded_v1 WITH (security_invoker=true) AS
SELECT v.*,
CASE WHEN object_class='unresolved_source_record' THEN 'untyped_source_record'
WHEN object_class='unresolved_legal_reference' THEN 'unresolved_legal_reference'
WHEN candidate_state='identity_conflict' THEN 'identity_conflict'
WHEN candidate_state='unresolved' THEN 'candidate_unresolved'
WHEN jurisdiction_resolution_state IN ('unresolved','conflict') THEN 'jurisdiction_unresolved'
ELSE 'other' END AS stranded_reason
FROM public.v_civic_object_visibility_v1 v
WHERE object_class IN ('unresolved_source_record','unresolved_legal_reference') OR candidate_state IN ('unresolved','identity_conflict') OR jurisdiction_resolution_state IN ('unresolved','conflict');

CREATE OR REPLACE VIEW public.v_lighthouse_data_visibility_v1 WITH (security_invoker=true) AS
SELECT * FROM (VALUES
('fresh_corpus','source_artifacts',(SELECT count(*)::bigint FROM public.luminari_corpus_source_artifact_v1),(SELECT count(*)::bigint FROM public.luminari_corpus_source_artifact_v1 WHERE storage_state IS DISTINCT FROM 'active' OR extraction_status NOT IN ('fresh_parsed','fresh_duplicate_preserved','fresh_derivative_preserved')),'lighthouse_corpus','source_inventory'),
('fresh_corpus','typed_candidates',(SELECT count(*)::bigint FROM public.luminari_corpus_candidate_v1),(SELECT count(*)::bigint FROM public.luminari_corpus_candidate_v1 WHERE candidate_state IN ('unresolved','identity_conflict')),'lighthouse_corpus','typed_mixed'),
('fresh_corpus','stranded_candidates',(SELECT count(*)::bigint FROM public.v_civic_object_stranded_v1),(SELECT count(*)::bigint FROM public.v_civic_object_stranded_v1),'lighthouse_corpus','requires_resolution'),
('resources','canonical_entities',(SELECT count(*)::bigint FROM public.luminari_resource_entities),(SELECT count(*)::bigint FROM public.luminari_resource_entities WHERE verification_status='unverified'),'lighthouse_resource_substrate','canonical_coarse'),
('resources','legacy_normalized_civic_resource',(SELECT count(*)::bigint FROM public.normalized_civic_resource),0::bigint,'legacy_resource_pipeline','legacy_mixed'),
('resources','legacy_unified_resources',(SELECT count(*)::bigint FROM public.unified_resources),0::bigint,'legacy_resource_pipeline','legacy_mixed_union'),
('legal_library','statutes',(SELECT count(*)::bigint FROM public.legal_statutes),0::bigint,'lighthouse_legal_library','canonical'),
('legal_library','case_law',(SELECT count(*)::bigint FROM public.legal_case_law),0::bigint,'lighthouse_legal_library','canonical'),
('legal_library','enforcement',(SELECT count(*)::bigint FROM public.legal_enforcement_records),0::bigint,'lighthouse_legal_library','canonical'),
('civil_gideon','directory',(SELECT count(*)::bigint FROM public.civil_gideon_directory),0::bigint,'civil_gideon','canonical'),
('docket','source_documents',(SELECT count(*)::bigint FROM public.docket_bill_source_document),0::bigint,'docket_room','canonical_source'),
('sais','source_documents',(SELECT count(*)::bigint FROM sais_import.source_document),0::bigint,'sais','staged_source'),
('sais','resource_candidates',(SELECT count(*)::bigint FROM sais_import.resource_candidate),GREATEST((SELECT resource_count::bigint FROM sais_import.import_run ORDER BY created_at DESC LIMIT 1)-(SELECT count(*)::bigint FROM sais_import.resource_candidate),0),'sais','staged_gap'),
('sais','routing_items',(SELECT count(*)::bigint FROM sais_import.routing_item),GREATEST((SELECT routing_item_count::bigint FROM sais_import.import_run ORDER BY created_at DESC LIMIT 1)-(SELECT count(*)::bigint FROM sais_import.routing_item),0),'sais','staged_gap'),
('sais','deadline_fields',(SELECT count(*)::bigint FROM sais_import.deadline_field),GREATEST((SELECT deadline_field_count::bigint FROM sais_import.import_run ORDER BY created_at DESC LIMIT 1)-(SELECT count(*)::bigint FROM sais_import.deadline_field),0),'sais','staged_gap'),
('signals','domain1_intake_current',(SELECT count(*)::bigint FROM public.intake_signals WHERE is_current),0::bigint,'lighthouse_intake','canonical_current'),
('signals','domain1_intake_history',(SELECT count(*)::bigint FROM public.intake_signals WHERE NOT is_current),0::bigint,'lighthouse_intake','history'),
('signals','domain2_legal_current',(SELECT count(*)::bigint FROM public.legal_patterns WHERE is_current),0::bigint,'lighthouse_legal_analysis','canonical_current'),
('signals','domain2_legal_history',(SELECT count(*)::bigint FROM public.legal_patterns WHERE NOT is_current),0::bigint,'lighthouse_legal_analysis','history'),
('signals','domain3_live_current',(SELECT count(*)::bigint FROM public.live_data_signals WHERE is_current),0::bigint,'atlas','canonical_current'),
('signals','domain3_live_history',(SELECT count(*)::bigint FROM public.live_data_signals WHERE NOT is_current),0::bigint,'atlas','history'),
('signals','convergence_current',(SELECT count(*)::bigint FROM public.signal_convergences WHERE is_current),0::bigint,'prism','canonical_current'),
('signals','convergence_history',(SELECT count(*)::bigint FROM public.signal_convergences WHERE NOT is_current),0::bigint,'prism','history')
) AS x(source_family,object_kind,record_count,unresolved_or_gap_count,canonical_owner,visibility_state);

CREATE OR REPLACE FUNCTION public.fetch_lighthouse_data_visibility_v1() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER STABLE SET search_path TO pg_catalog,public,sais_import AS $function$
SELECT jsonb_build_object(
'sources',COALESCE((SELECT jsonb_agg(to_jsonb(v) ORDER BY source_family,object_kind) FROM public.v_lighthouse_data_visibility_v1 v),'[]'::jsonb),
'objects',COALESCE((SELECT jsonb_agg(to_jsonb(v) ORDER BY record_count DESC,object_class) FROM public.v_civic_object_visibility_summary_v1 v),'[]'::jsonb),
'resource_domains',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY record_count DESC,service_domain) FROM (SELECT service_domain,count(*)::bigint record_count,count(*) FILTER(WHERE has_access_point)::bigint accessible_count FROM public.v_civic_resource_directory_candidates_v1 GROUP BY service_domain)x),'[]'::jsonb),
'generated_at',now());
$function$;

REVOKE ALL ON public.v_civic_object_visibility_v1,public.v_civic_resource_directory_candidates_v1,public.v_civic_object_visibility_summary_v1,public.v_civic_object_stranded_v1,public.v_lighthouse_data_visibility_v1 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fetch_lighthouse_data_visibility_v1() FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.v_civic_object_visibility_v1,public.v_civic_resource_directory_candidates_v1,public.v_civic_object_visibility_summary_v1,public.v_civic_object_stranded_v1,public.v_lighthouse_data_visibility_v1 TO service_role;
GRANT EXECUTE ON FUNCTION public.fetch_lighthouse_data_visibility_v1() TO service_role;

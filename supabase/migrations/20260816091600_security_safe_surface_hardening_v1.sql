-- Safe immediate hardening: close mutation/control surfaces without removing reads.

-- 1) RLS-disabled public tables: preserve SELECT for now, remove mutation/admin-style privileges from API roles.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.governance_snapshots,
  public.state_enriched_directory_v3_13,
  public.coalition_advocacy_orgs_v3_13_stage,
  public.ingest_staging_v3_13,
  public.registry_programs_v3_13_stage,
  public.domain_deep_dive_records_v3_13,
  public.policy_layer_docs_v3_13,
  public.sol_collision_analysis_v3_13,
  public.specification_extraction_v3_13,
  public.tribal_jurisdictions_addendum_v3_13,
  public.address_audit_v3_13,
  public.advocacy_targets_v3_13,
  public.benefits_cascade_stages,
  public.legal_aid_wa_v3_13,
  public.legal_statutes_v3_13_stage,
  public.legislator_contacts_v3_13_stage,
  public.luminari_batch_exports_v3_13,
  public.luminari_uuid_exports_v3_13,
  public.master_template_docs_v3_13,
  public.programs_v3_13_stage
FROM anon, authenticated;

-- 2) Flagged views are read surfaces. Remove meaningless/dangerous non-SELECT grants while preserving reads.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.v_lighthouse_resource_catalog_v1,
  public.v_lighthouse_did_you_know_candidates_v1,
  public.v_lighthouse_findings_case_coverage_v1,
  public.v_lighthouse_filing_catalog_v1,
  public.v_lighthouse_signal_catalog_v1,
  public.v_lighthouse_legal_catalog_v1,
  public.v_lighthouse_case_surface_status_v1,
  public.v_luminari_resource_locations_current_v3_13,
  public.v_domain_deep_dive_v3_13_stage_summary,
  public.v_registry_resources_unified,
  public.v_corpus_artifact_coverage,
  public.v_generated_sql_source_coverage,
  public.v_generated_sql_bundle_audit,
  public.v_substrate_promotion_readiness,
  public.v_operational_core_namespace_status,
  public.v_operational_core_governance_summary,
  public.v_operational_core_legal_summary,
  public.v_operational_core_bridge_summary,
  public.registry_record_provenance
FROM anon, authenticated;

-- 3) Worker/control/trigger RPCs are not public API. Service role retains its existing execute access.
REVOKE EXECUTE ON FUNCTION public.claim_corpus_import_queue_row(text,text,integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_extract_docx_success(bigint,text,text,jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_normalize_docx_success(bigint,text,text,jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_route_dry_run_success(bigint,text,jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_sql_substrate_handoff_success(bigint,text,integer,integer,jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.omnidirectional_compute_node_hash() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.omnidirectional_compute_edge_hash() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.omnidirectional_enforce_edge_shape() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.omnidirectional_materialize_paths(uuid[],text,text,timestamptz) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.omnidirectional_capture_health(text,timestamptz) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_docket_bill_detail_cache_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_civic_genome_updated_at() FROM anon, authenticated;

-- 4) Pin search_path on all currently flagged functions. Include extensions for pgcrypto helpers.
ALTER FUNCTION public.mark_extract_docx_success(bigint,text,text,jsonb) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.mark_normalize_docx_success(bigint,text,text,jsonb) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.mark_route_dry_run_success(bigint,text,jsonb) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.corpus_import_target_hint_for_storage_object(text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.corpus_import_domain_tags_for_storage_object(text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.claim_corpus_import_queue_row(text,text,integer) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.mark_sql_substrate_handoff_success(bigint,text,integer,integer,jsonb) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.set_docket_bill_detail_cache_updated_at() SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.touch_civic_genome_updated_at() SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.omnidirectional_compute_node_hash() SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.omnidirectional_compute_edge_hash() SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.omnidirectional_enforce_edge_shape() SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.omnidirectional_path_score(numeric,integer,integer,integer,integer,uuid) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.omnidirectional_resolve(uuid[],text,text,timestamptz) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.omnidirectional_materialize_paths(uuid[],text,text,timestamptz) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.omnidirectional_capture_health(text,timestamptz) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.luminari_clean_resource_name_v1(text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.luminari_resource_name_invalid_v1(text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.luminari_harden_resource_display_name_v1(text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.luminari_resource_identity_uuid_v1(text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.luminari_phone_key_v4(text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.luminari_source_address_publishable_v2(text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.luminari_source_address_preserved_v3(text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.luminari_source_address_shape_v3(text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.luminari_first_nonempty_v2(text[]) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.luminari_extract_urlish_v2(text) SET search_path = pg_catalog, public, extensions, pg_temp;
ALTER FUNCTION public.luminari_extract_email_v2(text) SET search_path = pg_catalog, public, extensions, pg_temp;

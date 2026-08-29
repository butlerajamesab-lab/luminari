-- Roll back read-affecting hardening after confirmed runtime use.
-- Preserve the prior safe grant/RPC/search_path hardening migration.

ALTER TABLE public.governance_snapshots DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.state_enriched_directory_v3_13 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.coalition_advocacy_orgs_v3_13_stage DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingest_staging_v3_13 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.registry_programs_v3_13_stage DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_deep_dive_records_v3_13 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_layer_docs_v3_13 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sol_collision_analysis_v3_13 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.specification_extraction_v3_13 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tribal_jurisdictions_addendum_v3_13 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.address_audit_v3_13 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.advocacy_targets_v3_13 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.benefits_cascade_stages DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_aid_wa_v3_13 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_statutes_v3_13_stage DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.legislator_contacts_v3_13_stage DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.luminari_batch_exports_v3_13 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.luminari_uuid_exports_v3_13 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_template_docs_v3_13 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.programs_v3_13_stage DISABLE ROW LEVEL SECURITY;

ALTER VIEW public.v_lighthouse_resource_catalog_v1 SET (security_invoker = false);
ALTER VIEW public.v_lighthouse_did_you_know_candidates_v1 SET (security_invoker = false);
ALTER VIEW public.v_lighthouse_findings_case_coverage_v1 SET (security_invoker = false);
ALTER VIEW public.v_lighthouse_filing_catalog_v1 SET (security_invoker = false);
ALTER VIEW public.v_lighthouse_signal_catalog_v1 SET (security_invoker = false);
ALTER VIEW public.v_lighthouse_legal_catalog_v1 SET (security_invoker = false);
ALTER VIEW public.v_lighthouse_case_surface_status_v1 SET (security_invoker = false);
ALTER VIEW public.v_luminari_resource_locations_current_v3_13 SET (security_invoker = false);
ALTER VIEW public.v_domain_deep_dive_v3_13_stage_summary SET (security_invoker = false);
ALTER VIEW public.v_registry_resources_unified SET (security_invoker = false);
ALTER VIEW public.v_corpus_artifact_coverage SET (security_invoker = false);
ALTER VIEW public.v_generated_sql_source_coverage SET (security_invoker = false);
ALTER VIEW public.v_generated_sql_bundle_audit SET (security_invoker = false);
ALTER VIEW public.v_substrate_promotion_readiness SET (security_invoker = false);
ALTER VIEW public.v_operational_core_namespace_status SET (security_invoker = false);
ALTER VIEW public.v_operational_core_governance_summary SET (security_invoker = false);
ALTER VIEW public.v_operational_core_legal_summary SET (security_invoker = false);
ALTER VIEW public.v_operational_core_bridge_summary SET (security_invoker = false);
ALTER VIEW public.registry_record_provenance SET (security_invoker = false);

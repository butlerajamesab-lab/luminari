-- Safe immediate hardening: close mutation/control surfaces without removing reads.

-- 1) RLS-disabled public tables: preserve SELECT for now, remove mutation/admin-style privileges from API roles.
-- Optional legacy staging relations are absent on a clean ledger; absence is
-- already fail-closed and must not prevent the rest of the hardening pass.
do $tables$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'governance_snapshots',
    'state_enriched_directory_v3_13',
    'coalition_advocacy_orgs_v3_13_stage',
    'ingest_staging_v3_13',
    'registry_programs_v3_13_stage',
    'domain_deep_dive_records_v3_13',
    'policy_layer_docs_v3_13',
    'sol_collision_analysis_v3_13',
    'specification_extraction_v3_13',
    'tribal_jurisdictions_addendum_v3_13',
    'address_audit_v3_13',
    'advocacy_targets_v3_13',
    'benefits_cascade_stages',
    'legal_aid_wa_v3_13',
    'legal_statutes_v3_13_stage',
    'legislator_contacts_v3_13_stage',
    'luminari_batch_exports_v3_13',
    'luminari_uuid_exports_v3_13',
    'master_template_docs_v3_13',
    'programs_v3_13_stage'
  ]
  loop
    if to_regclass(format('public.%I', relation_name)) is not null then
      execute format(
        'revoke insert, update, delete, truncate, references, trigger on table public.%I from anon, authenticated',
        relation_name
      );
    end if;
  end loop;
end
$tables$;

-- 2) Flagged views are read surfaces. Remove meaningless/dangerous non-SELECT grants while preserving reads.
do $views$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'v_lighthouse_resource_catalog_v1',
    'v_lighthouse_did_you_know_candidates_v1',
    'v_lighthouse_findings_case_coverage_v1',
    'v_lighthouse_filing_catalog_v1',
    'v_lighthouse_signal_catalog_v1',
    'v_lighthouse_legal_catalog_v1',
    'v_lighthouse_case_surface_status_v1',
    'v_luminari_resource_locations_current_v3_13',
    'v_domain_deep_dive_v3_13_stage_summary',
    'v_registry_resources_unified',
    'v_corpus_artifact_coverage',
    'v_generated_sql_source_coverage',
    'v_generated_sql_bundle_audit',
    'v_substrate_promotion_readiness',
    'v_operational_core_namespace_status',
    'v_operational_core_governance_summary',
    'v_operational_core_legal_summary',
    'v_operational_core_bridge_summary',
    'registry_record_provenance'
  ]
  loop
    if to_regclass(format('public.%I', relation_name)) is not null then
      execute format(
        'revoke insert, update, delete, truncate, references, trigger on table public.%I from anon, authenticated',
        relation_name
      );
    end if;
  end loop;
end
$views$;

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

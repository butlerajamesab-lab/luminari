-- Close public-table exposure while preserving backend/service-role operation.
-- Optional legacy staging relations are capability-gated: their absence on a
-- clean ledger is already fail-closed and cannot block hardening elsewhere.

do $tables$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'governance_snapshots','state_enriched_directory_v3_13',
    'coalition_advocacy_orgs_v3_13_stage','ingest_staging_v3_13',
    'registry_programs_v3_13_stage','domain_deep_dive_records_v3_13',
    'policy_layer_docs_v3_13','sol_collision_analysis_v3_13',
    'specification_extraction_v3_13','tribal_jurisdictions_addendum_v3_13',
    'address_audit_v3_13','advocacy_targets_v3_13','benefits_cascade_stages',
    'legal_aid_wa_v3_13','legal_statutes_v3_13_stage',
    'legislator_contacts_v3_13_stage','luminari_batch_exports_v3_13',
    'luminari_uuid_exports_v3_13','master_template_docs_v3_13',
    'programs_v3_13_stage'
  ]
  loop
    if to_regclass(format('public.%I', relation_name)) is not null then
      execute format('alter table public.%I enable row level security', relation_name);
    end if;
  end loop;
end
$tables$;

-- Make existing flagged views honor the invoking role's grants/RLS instead of
-- the owner's privileges. Missing optional views are already inaccessible.
do $views$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'v_lighthouse_resource_catalog_v1','v_lighthouse_did_you_know_candidates_v1',
    'v_lighthouse_findings_case_coverage_v1','v_lighthouse_filing_catalog_v1',
    'v_lighthouse_signal_catalog_v1','v_lighthouse_legal_catalog_v1',
    'v_lighthouse_case_surface_status_v1','v_luminari_resource_locations_current_v3_13',
    'v_domain_deep_dive_v3_13_stage_summary','v_registry_resources_unified',
    'v_corpus_artifact_coverage','v_generated_sql_source_coverage',
    'v_generated_sql_bundle_audit','v_substrate_promotion_readiness',
    'v_operational_core_namespace_status','v_operational_core_governance_summary',
    'v_operational_core_legal_summary','v_operational_core_bridge_summary',
    'registry_record_provenance'
  ]
  loop
    if exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = relation_name and c.relkind = 'v'
    ) then
      execute format('alter view public.%I set (security_invoker = true)', relation_name);
    end if;
  end loop;
end
$views$;

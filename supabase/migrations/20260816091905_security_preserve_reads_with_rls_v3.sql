-- Preserve existing anon/authenticated read behavior on legacy public-read
-- tables while enabling RLS so future write grants cannot expose mutations.
-- Optional absent staging relations stay fail-closed and are skipped.

do $public_reads$
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
      execute format('drop policy if exists luminari_public_read_v1 on public.%I', relation_name);
      execute format(
        'create policy luminari_public_read_v1 on public.%I for select to anon, authenticated using (true)',
        relation_name
      );
    end if;
  end loop;
end
$public_reads$;

-- These tables already have RLS enabled and no client policies. Remove broad
-- direct grants where the optional relation actually exists.
do $private_tables$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'contacts','docket_bill_state_cache','omnidirectional_contradiction_clusters',
    'omnidirectional_domain_packs','omnidirectional_edge_constraints',
    'omnidirectional_edge_types','omnidirectional_graph_edges',
    'omnidirectional_graph_health_snapshots','omnidirectional_graph_nodes',
    'omnidirectional_graph_paths','omnidirectional_graph_snapshots',
    'omnidirectional_node_types','omnidirectional_traversal_rulesets'
  ]
  loop
    if to_regclass(format('public.%I', relation_name)) is not null then
      execute format(
        'revoke all privileges on table public.%I from anon, authenticated',
        relation_name
      );
    end if;
  end loop;
end
$private_tables$;

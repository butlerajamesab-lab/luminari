begin;

-- Fill estimated row counts from Postgres statistics. This is intentionally non-destructive.
update public.luminari_table_classification ltc
set current_row_count = s.n_live_tup
from pg_stat_user_tables s
where s.schemaname = 'public'
  and s.relname = ltc.table_name;

-- Assign obvious merge groups / canonical targets for high-value overlapping clusters.
update public.luminari_table_classification
set merge_group = 'claim_catalog_cluster',
    canonical_target = case when table_name = 'canonical_claim_catalog' then 'self_canonical_candidate' else 'canonical_claim_catalog' end,
    lifecycle_status = case when table_name = 'canonical_claim_catalog' then 'canonical_candidate' else lifecycle_status end,
    notes = coalesce(notes || ' | ', '') || 'Claim catalog overlap cluster; reconcile into canonical claim catalog.'
where table_name in ('claim_catalog','canonical_claim_catalog','strategy_claim_catalog');

update public.luminari_table_classification
set merge_group = 'workflow_cluster',
    canonical_target = case when table_name in ('canonical_workflows','workflow_registry','workflow_steps') then 'canonical_workflows_and_workflow_steps' else 'canonical_workflows_and_workflow_steps' end,
    lifecycle_status = case when table_name in ('canonical_workflows','workflow_steps') then 'canonical_candidate' else lifecycle_status end,
    notes = coalesce(notes || ' | ', '') || 'Workflow overlap cluster; do not invent workflows; reconcile definitions/routes/steps.'
where table_name in ('canonical_workflows','workflow_definitions','workflow_master','workflow_registry','workflow_routes','workflow_steps','registry_workflows');

update public.luminari_table_classification
set merge_group = 'resource_registry_cluster',
    canonical_target = 'canonical_resource_entity_model_pending',
    notes = coalesce(notes || ' | ', '') || 'Resource/entity registry overlap; classify source-of-truth before promotion.'
where table_name in ('registry_programs','government_benefits_registry','nonprofit_registry','national_resources','normalized_civic_resource','registry_entities_food_banks','registry_entities_government_agencies','registry_entities_hospitals','registry_entities_legal_aid','registry_entities_mental_health','registry_entities_nonprofits','registry_entities_shelters','unified_resources','v_registry_resources_unified','v_unified_civic_infrastructure');

update public.luminari_table_classification
set merge_group = 'legal_aid_cluster',
    canonical_target = 'legal_aid_organizations',
    lifecycle_status = case when table_name = 'legal_aid_organizations' then 'canonical_candidate' else lifecycle_status end,
    notes = coalesce(notes || ' | ', '') || 'Legal aid duplicate naming cluster.'
where table_name in ('legal_aid_organizations','legal_aid_orgs');

update public.luminari_table_classification
set merge_group = 'legal_library_cluster',
    canonical_target = 'legal_library_canonical_pending',
    notes = coalesce(notes || ' | ', '') || 'Legal/statute/case/enforcement library cluster.'
where table_name in ('legal_statutes','legal_statute_clauses','legal_case_law','legal_enforcement_records','legal_enforcement','enforcement_penalties','legal_workflow_deadlines','doctrine_registry','legal_definitions');

update public.luminari_table_classification
set merge_group = 'agency_authority_cluster',
    canonical_target = case when table_name = 'agency_authority_map' then 'self_canonical_candidate' else 'agency_authority_map' end,
    lifecycle_status = case when table_name = 'agency_authority_map' then 'canonical_candidate' else lifecycle_status end,
    notes = coalesce(notes || ' | ', '') || 'Agency/authority/intake/oversight routing cluster.'
where table_name in ('agency_authority_map','agencies_registry','agency_forms','oversight_registry','registry_oversight_bodies','enforcement_action_paths','enforcement_pathway_models','enforcement_viability_rules','interagency_referrals');

update public.luminari_table_classification
set merge_group = 'deadline_sol_cluster',
    canonical_target = case when table_name = 'deadline_rules' then 'self_canonical_candidate' else 'deadline_rules' end,
    lifecycle_status = case when table_name = 'deadline_rules' then 'canonical_candidate' else lifecycle_status end,
    notes = coalesce(notes || ' | ', '') || 'Deadline/SOL/collision target cluster.'
where table_name in ('deadline_rules','deadlines','statute_of_limitations','legal_workflow_deadlines','v_runtime_deadlines');

update public.luminari_table_classification
set merge_group = 'pattern_engine_cluster',
    canonical_target = 'pattern_registry_pattern_history_pattern_trends_pending',
    lifecycle_status = case when table_name in ('pattern_registry','pattern_decay_rules','pattern_occurrences','pattern_signal_links') then 'canonical_candidate' else lifecycle_status end,
    notes = coalesce(notes || ' | ', '') || 'Pattern engine cluster; compare with Three Multiplier contract.'
where table_name like 'pattern_%' or table_name in ('pattern_registry','patterns','prime_patterns','canonical_pattern_registry','v_pattern_runtime');

update public.luminari_table_classification
set merge_group = 'trend_pressure_cluster',
    canonical_target = 'trend_registry_and_trend_pressure_metrics_pending',
    lifecycle_status = case when table_name in ('trend_registry','trend_pressure_metrics','trend_snapshots') then 'canonical_candidate' else lifecycle_status end,
    notes = coalesce(notes || ' | ', '') || 'Trend/pressure cluster; compare with Three Multiplier trend tables.'
where table_name like 'trend_%' or table_name in ('v_active_trends');

update public.luminari_table_classification
set merge_group = 'strategy_path_cluster',
    canonical_target = case when table_name = 'strategy_paths' then 'self_canonical_candidate' else 'strategy_paths' end,
    lifecycle_status = case when table_name = 'strategy_paths' then 'canonical_candidate' else lifecycle_status end,
    notes = coalesce(notes || ' | ', '') || 'Strategy/pathfinding/friction/routing cluster.'
where table_name like 'strategy_%' or table_name in ('strategy_paths','sys_strategy_paths','remedy_paths','remedy_feasibility_rules','remedy_feasibility_rules_v2','routing_registry','escalation_routes');

update public.luminari_table_classification
set merge_group = 'policy_impact_cluster',
    canonical_target = 'policy_event_registry_pending',
    lifecycle_status = case when table_name in ('policy_change_registry','policy_pattern_impacts') then 'canonical_candidate' else lifecycle_status end,
    notes = coalesce(notes || ' | ', '') || 'Policy impact/signal interpretation cluster.'
where table_name in ('policy_change_registry','policy_pattern_impacts','registry_policy_alerts');

update public.luminari_table_classification
set merge_group = 'raw_archive_cluster',
    canonical_target = 'raw_material_archive_registry_raw_archive_preserve',
    lifecycle_status = 'preserve_read_only_candidate',
    write_policy = 'read_only_candidate',
    notes = coalesce(notes || ' | ', '') || 'Raw/archive preservation cluster; no destructive cleanup.'
where table_name in ('raw_material_archive','registry_raw_archive','raw_table_cells','raw_tables_meta','raw_sections','raw_registries','field_dictionary');

update public.luminari_table_classification
set merge_group = 'civic_map_runtime_cluster',
    canonical_target = case when table_name = 'v_ui_civic_map_v2' then 'self_runtime_candidate' else 'v_ui_civic_map_v2' end,
    lifecycle_status = case when table_name = 'v_ui_civic_map_v2' then 'runtime_canonical_candidate' else 'runtime_or_compatibility_view' end,
    write_policy = 'view_no_direct_write',
    notes = coalesce(notes || ' | ', '') || 'CivicMap runtime view cluster; current frontend may still read legacy view.'
where table_name in ('v_ui_civic_map_v1','v_ui_civic_map_v2','v_civic_map_runtime','v_civic_map_runtime_v2','v_civic_map_runtime_v3','v_civic_map_runtime_v4','v_civic_map_layers_unified','v_civic_map_layers_v2','v_civic_map_layers_v3','v_map_points_with_state_fallback','v_unified_civic_infrastructure');

-- Review views for next human/agent pass.
create or replace view public.v_luminari_merge_group_review as
select
  merge_group,
  count(*) as object_count,
  count(*) filter (where lifecycle_status like '%canonical%') as canonical_candidates,
  sum(coalesce(current_row_count,0)) as estimated_rows,
  array_agg(table_name order by table_name) as objects
from public.luminari_table_classification
where merge_group is not null
group by merge_group
order by merge_group;

create or replace view public.v_luminari_unknown_table_review as
select
  table_name,
  table_type,
  current_row_count,
  lifecycle_status,
  write_policy,
  notes
from public.luminari_table_classification
where domain_family = 'unknown'
order by coalesce(current_row_count,0) desc, table_name;

create or replace view public.v_luminari_canonical_candidates as
select
  table_name,
  table_type,
  current_row_count,
  domain_family,
  merge_group,
  canonical_target,
  lifecycle_status,
  notes
from public.luminari_table_classification
where lifecycle_status like '%canonical%'
order by domain_family, merge_group, table_name;

create or replace view public.v_luminari_projection_shells_review as
select
  table_name,
  table_type,
  current_row_count,
  domain_family,
  lifecycle_status,
  canonical_target,
  write_policy,
  notes
from public.luminari_table_classification
where lifecycle_status = 'shell_or_projection_review'
   or table_name like 'registry_entities_%'
order by table_name;

create or replace view public.v_luminari_runtime_contract_review as
select
  table_name,
  table_type,
  domain_family,
  lifecycle_status,
  canonical_target,
  runtime_consumer,
  notes
from public.luminari_table_classification
where domain_family = 'runtime_ui_contract'
   or table_name like 'v_ui_%'
   or table_name like 'v_runtime_%'
   or table_name like 'v_civic_map%'
   or table_name = 'v_unified_civic_infrastructure'
order by table_name;

commit;

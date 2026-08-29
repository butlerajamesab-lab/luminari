begin;

create table if not exists public.luminari_table_classification (
  table_name text primary key,
  table_type text not null,
  current_row_count bigint,
  domain_family text not null default 'unknown',
  lifecycle_status text not null default 'needs_review',
  canonical_target text,
  write_policy text not null default 'review_required',
  runtime_consumer text,
  source_of_truth_rank integer,
  merge_group text,
  notes text,
  review_status text not null default 'unreviewed',
  classified_at timestamptz not null default now(),
  classified_by text not null default 'luminari_governance_foundation'
);

create table if not exists public.luminari_document_family_contracts (
  family_key text primary key,
  family_name text not null,
  scope_description text not null,
  required_object_classes text[] not null,
  expected_runtime_consumers text[] not null default '{}',
  canonical_destination_notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.luminari_canonical_id_registry (
  canonical_id text primary key,
  object_class text not null,
  display_name text,
  jurisdiction_scope text,
  owning_family_key text references public.luminari_document_family_contracts(family_key),
  source_document_key text,
  source_table text,
  source_pk text,
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.luminari_source_precedence_rules (
  rule_id uuid primary key default gen_random_uuid(),
  object_class text not null,
  jurisdiction_scope text,
  preferred_family_key text references public.luminari_document_family_contracts(family_key),
  fallback_family_keys text[] not null default '{}',
  rule_description text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.luminari_extraction_completeness_reports (
  report_id uuid primary key default gen_random_uuid(),
  extraction_run_id text,
  source_document_key text,
  family_key text references public.luminari_document_family_contracts(family_key),
  object_class text not null,
  expected_present boolean not null default true,
  extracted_count integer not null default 0,
  validation_status text not null default 'pending',
  failure_reason text,
  checked_at timestamptz not null default now()
);

create table if not exists public.luminari_extraction_validation_failures (
  failure_id uuid primary key default gen_random_uuid(),
  extraction_run_id text,
  source_document_key text,
  family_key text references public.luminari_document_family_contracts(family_key),
  object_class text,
  severity text not null default 'error',
  failure_code text not null,
  failure_message text not null,
  source_location text,
  created_at timestamptz not null default now()
);

create table if not exists public.luminari_extraction_provenance_spans (
  provenance_span_id uuid primary key default gen_random_uuid(),
  source_document_key text not null,
  extracted_object_class text not null,
  extracted_object_id text,
  source_section text,
  source_page integer,
  source_heading text,
  source_text text,
  source_hash text,
  extraction_run_id text,
  parser_version text,
  confidence_score numeric(4,3),
  created_at timestamptz not null default now()
);

insert into public.luminari_document_family_contracts (
  family_key,
  family_name,
  scope_description,
  required_object_classes,
  expected_runtime_consumers,
  canonical_destination_notes
)
values
('general_state_registry','General State Registry','State-specific benefits, labor, accountability, resource, workflow, oversight, tribal/context, and deadline operating manual.',array['state_metadata','layer0_policy_flags','resource_cards','contact_points','eligibility_rules','apply_notes','jurisdiction_overlays','tribal_context','workflow_bindings','deadline_rules','legal_authorities','oversight_bodies','provenance_spans'],array['v_ui_civic_map_v2','v_ui_intake_routing_v1','v_ui_workflow_router_v1','v_ui_benefits_navigator_v1','v_ui_registry_quality_v1'],'Extract to state registry, contact, workflow, deadline, legal authority, and oversight canonical objects.'),
('state_labor_accountability_registry','State Labor / Industry / Accountability Registry','State-specific labor, wage, civil rights, oversight, enforcement, complaint-routing, and agency accountability depth.',array['labor_agencies','civil_rights_agencies','labor_claim_routes','wage_rules','employer_thresholds','complaint_portals','deadline_rules','oversight_bodies','enforcement_paths','provenance_spans'],array['v_ui_intake_routing_v1','v_ui_workflow_router_v1','v_ui_legal_library_v1','v_ui_registry_quality_v1'],'Extract to agency authority, labor pathway, claim routing, deadline, and oversight canonical objects.'),
('regional_knowledge_backbone','Regional Knowledge Backbone','Multi-state knowledge graph population data including agencies, statutes, federal regional offices, tribal nations, state distinctions, and claim variations.',array['regional_federal_offices','state_agency_nodes','state_statute_nodes','tribal_nation_nodes','claim_variation_nodes','jurisdiction_overlays','graph_edges','provenance_spans'],array['v_ui_legal_library_v1','v_ui_intake_routing_v1','v_ui_registry_quality_v1'],'Extract as graph nodes and edges, not duplicate state resource cards.'),
('federal_master_registry','Federal Master / Agency Authority Registry','Federal agency authority, claim routing, SOL, intake, offices, and enforcement-capacity overlay.',array['federal_agencies','agency_authorities','agency_intake_rules','claim_to_agency_routes','statute_of_limitations','federal_office_regions','enforcement_capacity_modifiers','provenance_spans'],array['v_ui_intake_routing_v1','v_ui_legal_library_v1','v_ui_workflow_router_v1'],'Extract to agency_authority_map, agency_intake_rules, claim route, SOL, and capacity modifier objects.'),
('universal_benefits_registry','Universal / Global Benefits Registry','Global benefits and assistance programs that should not be duplicated into each state except as state implementation variants.',array['benefit_categories','benefit_programs','benefit_layers','benefit_agencies','eligibility_signals','application_routes','contact_points','provenance_spans'],array['v_ui_benefits_navigator_v1','v_ui_civic_map_v2'],'Extract as global benefit seed registry with state implementation crosswalks.'),
('gap_playbook','No-Remedy / Gap Playbook','Fallback routing strategies where ordinary civil-rights or agency remedies fail because of employer size, state law gaps, or enforcement collapse.',array['gap_state_profiles','gap_populations','fallback_routes','no_size_minimum_routes','emergency_protocol_steps','private_bar_referral_rules','friction_flags','provenance_spans'],array['v_ui_intake_routing_v1','v_ui_workflow_router_v1'],'Extract as fallback routing logic and gap-state strategy objects.'),
('sol_collision_reference','SOL Collision Reference','Multi-forum deadline interaction, tolling, preclusion, parallel filing, and protective filing strategy logic.',array['collision_scenarios','forum_deadlines','trigger_dates','tolling_rules','preclusion_rules','preservation_strategies','common_pitfalls','provenance_spans'],array['v_ui_workflow_router_v1','v_runtime_deadlines','v_ui_intake_routing_v1'],'Extract to deadline engine and preclusion/collision logic.'),
('policy_impact_layer','Policy Impact Interpretation Layer','Policy events, signal rules, lag profiles, comparison pairs, templates, and language guardrails for correlation-only policy signals.',array['policy_events','policy_signal_rules','signal_templates','lag_profiles','comparison_pairs','language_guardrails','causal_firewall_rules','provenance_spans'],array['v_pattern_runtime','v_active_trends','v_ui_registry_quality_v1'],'Extract to policy signal tables and template guardrails.'),
('benefits_cascade_map','Benefits Cascade Map','Cascade-stage routing where one presenting problem implies concurrent rights, agencies, deadlines, and intervention points across pipelines.',array['cascade_scenarios','cascade_stages','stage_rights','stage_agencies','intervention_points','pipeline_routes','deadline_rules','overlay_rules','provenance_spans'],array['v_ui_intake_routing_v1','v_ui_workflow_router_v1','v_ui_benefits_navigator_v1'],'Extract as cascade routing graph, not resource cards.'),
('three_multiplier_layers','Three Multiplier Layers / System Diagnostics / Strategy Pathfinding','Pattern registry, trend and pressure layer, strategy paths, friction scoring, decay logic, and routing rules.',array['patterns','pattern_trigger_rules','pattern_history_schema','pattern_trends_schema','trend_templates','pressure_indicators','strategy_paths','strategy_path_steps','friction_scoring_rules','strategy_routing_rules','provenance_spans'],array['v_pattern_runtime','v_active_trends','v_strategy_engine_status','v_ui_intake_routing_v1'],'Extract to pattern/trend/pressure/strategy canonical runtime objects.'),
('contributor_governance','Contributor / Researcher Governance Docs','Rules for canonical IDs, required fields, merge discipline, source URLs, and anti-duplication.',array['canonical_id_rules','required_field_rules','merge_rules','anti_duplication_rules','source_requirements','workflow_reference_rules','provenance_spans'],array['v_ui_registry_quality_v1'],'Extract as machine validation rules and contributor governance, not runtime resources.')
on conflict (family_key) do update set
  family_name = excluded.family_name,
  scope_description = excluded.scope_description,
  required_object_classes = excluded.required_object_classes,
  expected_runtime_consumers = excluded.expected_runtime_consumers,
  canonical_destination_notes = excluded.canonical_destination_notes,
  is_active = true,
  updated_at = now();

insert into public.luminari_table_classification (table_name, table_type)
select t.table_name, t.table_type
from information_schema.tables t
where t.table_schema = 'public'
  and t.table_name not in ('luminari_table_classification')
on conflict (table_name) do update set
  table_type = excluded.table_type,
  classified_at = now();

update public.luminari_table_classification
set domain_family = case
  when table_name like 'v_ui_%' or table_name like 'v_runtime_%' or table_name like 'v_civic_%' or table_name in ('ui_contract_registry','v_unified_civic_infrastructure') then 'runtime_ui_contract'
  when table_name like '%archive%' or table_name like 'raw_%' or table_name in ('field_dictionary') then 'raw_archive'
  when table_name like '%staging%' or table_name like '%extraction%' or table_name like '%promotion%' then 'extraction_staging_promotion'
  when table_name like '%registry%' and table_name like '%program%' then 'registry_resources'
  when table_name like '%contact%' then 'contacts'
  when table_name like '%workflow%' or table_name like '%procedure%' or table_name like '%pathway%' then 'workflow_pathway'
  when table_name like '%deadline%' or table_name like '%statute_of_limitations%' then 'deadline_sol'
  when table_name like '%legal%' or table_name like '%statute%' or table_name like '%case_law%' or table_name like '%doctrine%' then 'legal_library'
  when table_name like '%agency%' or table_name like '%authority%' or table_name like '%oversight%' or table_name like '%enforcement%' then 'agency_oversight_enforcement'
  when table_name like '%signal%' then 'signals'
  when table_name like '%pattern%' then 'patterns'
  when table_name like '%trend%' or table_name like '%pressure%' then 'trends_pressure'
  when table_name like '%strategy%' or table_name like '%remedy%' or table_name like '%route%' or table_name like '%routing%' then 'strategy_routing'
  when table_name like '%policy%' then 'policy_impact'
  when table_name like '%benefit%' or table_name like '%medicaid%' or table_name like '%snap%' then 'benefits'
  when table_name like '%jurisdiction%' or table_name like '%state_%' then 'jurisdiction_geo'
  when table_name like '%provenance%' or table_name like '%audit%' or table_name like '%verification%' then 'provenance_audit_quality'
  else domain_family
end,
lifecycle_status = case
  when table_name like 'v_%' then 'runtime_or_compatibility_view'
  when table_name like '%archive%' or table_name like 'raw_%' then 'preserve_read_only_candidate'
  when table_name like '%staging%' then 'staging_review_required'
  when table_name like 'registry_entities_%' then 'shell_or_projection_review'
  else lifecycle_status
end,
write_policy = case
  when table_name like '%archive%' or table_name like 'raw_%' then 'read_only_candidate'
  when table_name like 'v_%' then 'view_no_direct_write'
  when table_name like 'registry_entities_%' then 'freeze_until_rebuilt'
  else write_policy
end;

create or replace view public.v_luminari_table_inventory_review as
select
  ltc.table_name,
  ltc.table_type,
  ltc.current_row_count,
  ltc.domain_family,
  ltc.lifecycle_status,
  ltc.canonical_target,
  ltc.write_policy,
  ltc.runtime_consumer,
  ltc.source_of_truth_rank,
  ltc.merge_group,
  ltc.review_status,
  ltc.notes
from public.luminari_table_classification ltc
order by ltc.domain_family, ltc.table_name;

create or replace view public.v_luminari_document_family_contracts as
select
  family_key,
  family_name,
  scope_description,
  required_object_classes,
  expected_runtime_consumers,
  canonical_destination_notes,
  is_active,
  updated_at
from public.luminari_document_family_contracts
order by family_key;

create or replace view public.v_luminari_extraction_failures_open as
select *
from public.luminari_extraction_validation_failures
where severity in ('error','critical')
order by created_at desc;

create or replace view public.v_luminari_extraction_completeness_summary as
select
  source_document_key,
  family_key,
  count(*) as object_classes_checked,
  count(*) filter (where validation_status = 'pass') as passed_classes,
  count(*) filter (where validation_status = 'fail') as failed_classes,
  count(*) filter (where extracted_count = 0 and expected_present) as expected_but_zero_classes,
  max(checked_at) as last_checked_at
from public.luminari_extraction_completeness_reports
group by source_document_key, family_key;

insert into public.luminari_source_precedence_rules (object_class, jurisdiction_scope, preferred_family_key, fallback_family_keys, rule_description)
values
('global_benefit_program','global','universal_benefits_registry',array['general_state_registry'],'Global benefit programs belong to the universal benefits registry. State registries may add implementation variants, not duplicate global program identity.'),
('state_specific_resource','state','general_state_registry',array['regional_knowledge_backbone','universal_benefits_registry'],'State-specific resources and implementation details are owned by the state registry family.'),
('regional_agency_node','region','regional_knowledge_backbone',array['general_state_registry','federal_master_registry'],'Regional backbone owns multi-state graph nodes, federal regional offices, and state-by-state graph population references.'),
('federal_agency_authority','federal','federal_master_registry',array['regional_knowledge_backbone'],'Federal Master owns agency authority, SOL, intake, offices, and federal routing metadata.'),
('fallback_route','mixed','gap_playbook',array['federal_master_registry','sol_collision_reference'],'Gap Playbook owns no-remedy fallback routing where ordinary agency routes fail.'),
('deadline_collision','mixed','sol_collision_reference',array['federal_master_registry','general_state_registry'],'SOL Collision owns multi-forum deadline and preclusion logic.'),
('policy_signal_rule','mixed','policy_impact_layer',array['three_multiplier_layers'],'Policy Impact Layer owns correlation-only policy signal rules and language guardrails.'),
('cascade_route','mixed','benefits_cascade_map',array['three_multiplier_layers','universal_benefits_registry'],'Benefits Cascade Map owns cross-pipeline cascade scenarios, stages, intervention points, and overlay routes.'),
('pattern_strategy_logic','mixed','three_multiplier_layers',array['policy_impact_layer','benefits_cascade_map'],'Three Multiplier Layers owns pattern, trend, pressure, strategy, friction, and decay logic.')
on conflict do nothing;

commit;

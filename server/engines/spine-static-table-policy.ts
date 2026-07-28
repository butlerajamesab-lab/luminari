import {
  restore_spine_table_data,
  type spine_restore_data_result,
  type spine_table_data,
} from "./spine-postgres";

/**
 * Full Spine carries only public/static civic configuration and knowledge.
 * Case artifacts, user queries, generated strategy/remedy instances,
 * calculations, procedural outputs, and outcome runtime are excluded.
 */
export const SPINE_STATIC_CIVIC_TABLES = [
  "engine_registry", "data_stream_registry",
  "signal_registry", "pattern_registry", "pattern_types",
  "pattern_creation_thresholds", "pattern_decay_rules", "pattern_confidence_factors",
  "trend_alert_rules",

  "doctrine_registry", "foia_statutes", "foia_agencies",
  "foia_record_types", "foia_agency_records",

  "interp_signal_templates", "interp_harm_mappings",
  "interp_jurisdiction_guidance", "interp_category_interpretations",
  "interp_status_interpretations", "interp_timeline_expectations",
  "interp_entity_signal_rules", "interp_geographic_signal_rules",
  "interpreter_evidence_guidance", "interpreter_question_flow",

  "jurisdiction_rules", "jurisdiction_hierarchy", "registry_jurisdictions",

  "legal_statutes", "legal_statute_clauses", "legal_case_law",
  "legal_weak_joints", "legal_enforcement_records", "legal_contradictions",
  "regulatory_guidance",

  "knowledge_entries", "knowledge_modules", "knowledge_cross_refs",
  "claim_validation_rules_v2", "remedy_feasibility_rules_v2",
  "remedy_feasibility_full", "remedy_matrix",
  "remedy_templates", "remedy_steps", "settlement_formulas",
  "proof_frameworks", "evidence_profiles", "weak_joint_triggers",

  "strategy_selection_rules", "strategy_registry", "strategy_steps",
  "strategy_claim_catalog", "strategy_forum_rules",
  "node_timeline", "timeline_rules",
  "workflow_definitions", "workflow_steps", "workflow_master", "world_nodes",

  "escalation_thresholds", "escalation_routes",
  "enforcement_viability_rules", "intervention_escalation_rules",
  "intervention_endpoints", "investigation_guidance",

  "registry_programs", "registry_workflows", "registry_signals",
  "registry_oversight_bodies", "registry_contacts",
  "registry_policy_alerts", "registry_source_traceability",
  "institution_registry", "legislator_contacts", "advocacy_organizations",

  "narrative_templates", "lumensend_templates",
  "intake_document_templates", "paperwork_templates",
  "harm_map_nodes", "harm_map_edges", "populations_affected",
  "litigation_registry", "litigation_barriers",
  "unified_resources", "mental_health_resources",
] as const;

export const SPINE_STATIC_CIVIC_TABLE_SET = new Set<string>(
  SPINE_STATIC_CIVIC_TABLES,
);

export const SPINE_EXCLUDED_RUNTIME_TABLES = [
  "interpreter_claim_matches",
  "investigative_queries",
  "remedy_paths",
  "settlement_calculations",
  "strategy_paths",
  "strategy_success_rates",
  "strategy_deadline_engine",
  "strategy_viability_assessment",
  "sys_strategy_paths",
  "procedural_timelines",
  "procedural_outputs",
  "timeline_edges",
  "timeline_events",
  "outcome_registry",
  "outcome_metrics",
] as const;

export function assert_static_spine_table(tableName: string): string {
  if (!SPINE_STATIC_CIVIC_TABLE_SET.has(tableName)) {
    throw new Error(
      `Table ${tableName} is outside the static civic Spine policy`,
    );
  }
  return tableName;
}

export async function restore_static_spine_table_data(
  data: spine_table_data,
): Promise<spine_restore_data_result> {
  assert_static_spine_table(data.tableName);
  return restore_spine_table_data(data);
}

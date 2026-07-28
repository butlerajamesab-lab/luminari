from pathlib import Path
import re

safe_list = '''export const SPINE_CONFIG_TABLES = [
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
] as const;'''

path = Path("server/engines/spine-postgres.ts")
text = path.read_text()
updated, count = re.subn(
    r"export const SPINE_CONFIG_TABLES = \[.*?\] as const;",
    safe_list,
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise RuntimeError(f"expected one legacy allowlist, found {count}")
for forbidden in (
    '"procedural_outputs"',
    '"settlement_calculations"',
    '"strategy_paths"',
    '"remedy_paths"',
    '"investigative_queries"',
    '"outcome_registry"',
):
    if forbidden in updated.split("export const SPINE_CONFIG_TABLE_SET", 1)[0]:
        raise RuntimeError(f"runtime table remains in allowlist: {forbidden}")
path.write_text(updated)

restore = Path("server/engines/sovereign-restore-spine-engine.ts")
restore_text = restore.read_text().replace("  SPINE_CONFIG_TABLE_SET,\n", "")
restore.write_text(restore_text)

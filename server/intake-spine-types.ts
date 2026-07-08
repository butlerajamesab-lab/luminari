/**
 * Intake Spine — Layer Type Definitions
 *
 * Defines the twelve owned layers of the Lighthouse intake spine in order.
 * All owned field names are snake_case. No owned camelCase fields are permitted.
 *
 * Ordering rule: Lighthouse begins with chronology, not conclusions.
 *
 * Layer sequence:
 *  1.  raw_intake_capture
 *  2.  evidence_preservation
 *  3.  chronology_reconstruction
 *  4.  entity_registry
 *  5.  relationship_graph
 *  6.  power_dynamics_registry
 *  7.  state_timeline
 *  8.  pattern_registry
 *  9.  cascade_registry
 *  10. rights_and_duties_matrix
 *  11. translation_layer
 *  12. action_paths
 */

// ─── L1: raw_intake_capture ───────────────────────────────────────────────────

export interface RawIntakeCapture {
  raw_intake_id: string;
  case_id: string;
  source_channel: "guided_intake" | "system_ingested" | "upload" | "api" | "map";
  session_id: string | null;
  narrative: string | null;
  uploads: string[];
  metadata: Record<string, unknown>;
  captured_at: string;
}

// ─── L2: evidence_preservation ───────────────────────────────────────────────

export interface EvidencePreservationArtifact {
  artifact_id: string;
  case_id: string;
  provenance: string;
  source_reference: string;
  artifact_type: "sms" | "email" | "pdf" | "care_plan" | "medical_record" | "contract" | "notice" | "agency_correspondence" | "inspection_record" | "grievance_response" | "other";
  immutable_hash: string;
  storage_path: string;
  preserved_at: string;
}

// ─── L3: chronology_reconstruction ───────────────────────────────────────────

export interface ChronologyEventRecord {
  chronology_event_id: string;
  case_id: string;
  event_date: string | null;
  source_date: string | null;
  observed_event: string;
  people_involved: string[];
  evidence_source: string | null;
  immediate_consequence: string | null;
  outstanding_follow_up: string | null;
  source_references: string[];
  event_confidence_level: "confirmed" | "probable" | "reported" | "unverified";
  created_from_path: string | null;
  normalization_version: string | null;
  status: "active" | "superseded" | "disputed";
}

// ─── L4: entity_registry ─────────────────────────────────────────────────────

export interface IntakeEntityRecord {
  entity_id: string;
  case_id: string;
  entity_name: string;
  entity_type: "person" | "organization" | "facility" | "agency" | "document" | "address" | "contact_point";
  aliases: string[];
  role_in_case: string | null;
  source_references: string[];
}

// ─── L5: relationship_graph ───────────────────────────────────────────────────

export interface RelationshipGraphEdge {
  edge_id: string;
  case_id: string;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: "reporting_line" | "authority_chain" | "dependency" | "communication_path" | "access_control" | "representation" | "caregiving" | "provider";
  description: string | null;
  source_references: string[];
}

// ─── L6: power_dynamics_registry ─────────────────────────────────────────────

export interface PowerDynamicsRecord {
  power_dynamics_id: string;
  case_id: string;
  authority_holder: string | null;
  resident_representative: string | null;
  alternate_representative: string | null;
  decision_maker: string | null;
  access_controller: string | null;
  gatekeeper: string | null;
  dependency_path: string | null;
  procedural_barrier: string | null;
  exclusion_event: string | null;
  retaliation_concern: string | null;
  documentation_holder: string | null;
  communication_bottleneck: string | null;
  burden_shift: string | null;
  user_capacity_limit: string | null;
  disputed_authority: string | null;
  informal_power_actor: string | null;
  power_imbalance_summary: string | null;
  source_event_ids: string[];
  evidence_source_ids: string[];
  confidence_level: "low" | "medium" | "high";
  created_from_path: "guided_intake" | "system_ingested" | null;
  normalization_version: string | null;
  status: "active" | "superseded" | "disputed";
}

// ─── L7: state_timeline ──────────────────────────────────────────────────────

export interface StateTimelineEntry {
  state_entry_id: string;
  case_id: string;
  subject_id: string;
  state_domain: "health" | "housing" | "finances" | "caregiving_capacity" | "documentation_burden" | "capacity" | "other";
  state_description: string;
  changed_at: string;
  source_references: string[];
}

// ─── L8: pattern_registry (intake reference) ─────────────────────────────────

export interface IntakePatternRef {
  pattern_ref_id: string;
  case_id: string;
  pattern_id: string;
  pattern_type: string;
  chronology_event_ids: string[];
  confidence_level: "low" | "medium" | "high";
  detected_at: string;
}

// ─── L9: cascade_registry ────────────────────────────────────────────────────

export interface CascadeRecord {
  cascade_id: string;
  case_id: string;
  trigger_event_id: string | null;
  trigger_summary: string | null;
  immediate_effect: string | null;
  secondary_effect: string | null;
  affected_people: string[];
  affected_entities: string[];
  related_chronology_ids: string[];
  related_pattern_ids: string[];
  related_power_dynamics_ids: string[];
  related_rights_duties_ids: string[];
  evidence_source_ids: string[];
  confidence_level: "low" | "medium" | "high";
  open_questions: string | null;
  created_from_path: "guided_intake" | "system_ingested" | null;
  normalization_version: string | null;
  status: "active" | "superseded" | "disputed";
}

// ─── L10: rights_and_duties_matrix ───────────────────────────────────────────

export interface RightsAndDutiesEntry {
  rights_duties_id: string;
  case_id: string;
  obligation_type: "right" | "duty" | "procedural_protection" | "remedy_pathway";
  description: string;
  activated_by_chronology_ids: string[];
  activated_by_pattern_ids: string[];
  activated_by_power_dynamics_ids: string[];
  activated_by_cascade_ids: string[];
  statutory_basis: string | null;
  confidence_level: "low" | "medium" | "high";
  status: "pending_activation" | "activated" | "inapplicable";
}

// ─── L11: translation_layer ───────────────────────────────────────────────────

export interface TranslationLayerOutput {
  translation_id: string;
  case_id: string;
  reusable_pathway_ref: string | null;
  generalized_intake_logic: string | null;
  cross_domain_doctrine_refs: string[];
  produced_at: string;
}

// ─── L12: action_paths ────────────────────────────────────────────────────────

export interface ActionPathEntry {
  action_path_id: string;
  case_id: string;
  pathway_label: string;
  description: string;
  user_capacity_required: "low" | "medium" | "high";
  burden_level: "low" | "medium" | "high";
  prerequisite_rights_duties_ids: string[];
  next_steps: string[];
  status: "available" | "blocked" | "completed";
}

// ─── Guided Intake: Power Dynamics Prompt Map ─────────────────────────────────

/**
 * Maps guided intake questions to power_dynamics_registry and cascade_registry
 * target fields. Questions are neutral and descriptive — they collect structure,
 * not accusations or legal framing.
 */
export const GUIDED_INTAKE_POWER_DYNAMICS_QUESTIONS = [
  {
    question_id: "pd_decision_maker",
    text: "Who makes decisions about care, housing, or services in this situation?",
    primary_target_fields: ["decision_maker", "authority_holder"],
    secondary_target_fields: ["disputed_authority", "informal_power_actor"],
  },
  {
    question_id: "pd_access_controller",
    text: "Who controls access to the place, person, or services involved?",
    primary_target_fields: ["access_controller", "gatekeeper"],
    secondary_target_fields: ["communication_bottleneck"],
  },
  {
    question_id: "pd_documentation_holder",
    text: "Who has or controls the documents related to this situation?",
    primary_target_fields: ["documentation_holder"],
    secondary_target_fields: ["evidence_source_ids"],
  },
  {
    question_id: "pd_gatekeeper",
    text: "Who has the ability to delay, deny, or limit help or access?",
    primary_target_fields: ["gatekeeper", "procedural_barrier"],
    secondary_target_fields: ["burden_shift"],
  },
  {
    question_id: "pd_dependency_path",
    text: "Who depends on whom in this situation — financially, for care, or for information?",
    primary_target_fields: ["dependency_path"],
    secondary_target_fields: ["user_capacity_limit"],
  },
  {
    question_id: "pd_exclusion_event",
    text: "Has anyone been left out of conversations, meetings, or communications about this situation?",
    primary_target_fields: ["exclusion_event"],
    secondary_target_fields: ["communication_bottleneck"],
  },
  {
    question_id: "pd_bypass_concern",
    text: "Has anyone tried to go around the person who is supposed to be in charge or represent this person?",
    primary_target_fields: ["alternate_representative", "disputed_authority"],
    secondary_target_fields: ["power_imbalance_summary"],
  },
  {
    question_id: "cascade_trigger",
    text: "What changed after this event happened — in care, finances, housing, health, or daily life?",
    primary_target_fields: ["immediate_effect", "secondary_effect"],
    secondary_target_fields: ["related_chronology_ids", "related_pattern_ids"],
  },
] as const;

// ─── System Ingestion: Extraction Target Map ──────────────────────────────────

/**
 * Maps evidence source types to their primary extraction targets for
 * power_dynamics_registry and cascade_registry fields.
 * Legacy input may be read at the boundary but owned structures must be
 * normalized immediately into snake_case fields.
 */
export const SYSTEM_INGESTION_EXTRACTION_MAP = {
  sms: {
    description: "Text messages",
    extraction_focus: ["authority disputes", "exclusion language", "scheduling control", "burden shifts", "downstream effects", "documented asks", "unanswered requests"],
    primary_targets: ["exclusion_event", "communication_bottleneck", "burden_shift", "gatekeeper", "immediate_effect"],
  },
  email: {
    description: "Email communications",
    extraction_focus: ["approvals", "denials", "cc/bypass patterns", "document possession", "official responses", "escalation paths"],
    primary_targets: ["decision_maker", "documentation_holder", "procedural_barrier", "exclusion_event", "authority_holder"],
  },
  pdf: {
    description: "PDF documents",
    extraction_focus: ["notices", "care plans", "care conference materials", "discharge conditions", "bed-hold terms", "role definitions", "obligations"],
    primary_targets: ["authority_holder", "gatekeeper", "procedural_barrier", "dependency_path", "documentation_holder"],
  },
  care_plan: {
    description: "Care plans",
    extraction_focus: ["care goals", "responsible parties", "service limitations", "authorization requirements"],
    primary_targets: ["decision_maker", "access_controller", "dependency_path", "burden_shift"],
  },
  medical_record: {
    description: "Medical records",
    extraction_focus: ["care events", "hospitalization links", "provider observations", "discharge triggers", "state changes"],
    primary_targets: ["immediate_effect", "secondary_effect", "trigger_event_id", "trigger_summary"],
  },
  contract: {
    description: "Contracts and agreements",
    extraction_focus: ["authority terms", "payment control", "documentation requirements", "role allocation"],
    primary_targets: ["authority_holder", "access_controller", "documentation_holder", "dependency_path"],
  },
  notice: {
    description: "Official notices",
    extraction_focus: ["deadlines", "procedural barriers", "jurisdiction", "response bottlenecks", "official authority statements"],
    primary_targets: ["procedural_barrier", "gatekeeper", "authority_holder", "burden_shift"],
  },
  agency_correspondence: {
    description: "Agency letters and communications",
    extraction_focus: ["deadlines", "procedural barriers", "jurisdiction", "response bottlenecks", "official authority statements"],
    primary_targets: ["procedural_barrier", "authority_holder", "communication_bottleneck", "burden_shift"],
  },
  inspection_record: {
    description: "Inspection and survey records",
    extraction_focus: ["observed deficiencies", "corrective requirements", "institutional presentation changes", "corroboration anchors"],
    primary_targets: ["procedural_barrier", "gatekeeper", "power_imbalance_summary", "trigger_summary"],
  },
  grievance_response: {
    description: "Grievance and complaint responses",
    extraction_focus: ["acknowledgment", "reframing", "delay", "closure language", "unresolved issue markers"],
    primary_targets: ["procedural_barrier", "communication_bottleneck", "power_imbalance_summary", "open_questions"],
  },
} as const;

export type IntakeSourceType = keyof typeof SYSTEM_INGESTION_EXTRACTION_MAP;

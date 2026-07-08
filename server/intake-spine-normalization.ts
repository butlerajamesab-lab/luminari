/**
 * Intake Spine Normalization
 *
 * Extends the existing Lighthouse intake spine so both human-guided and
 * system-ingested paths write into the same owned snake_case structures for:
 *   - chronology_reconstruction
 *   - power_dynamics_registry
 *   - cascade_registry
 *
 * Normalization rules enforced here:
 * - No owned camelCase fields.
 * - Chronology contains no legal conclusions.
 * - Pattern detection cannot occur before chronology exists.
 * - Rights and duties cannot activate before factual grounding exists.
 * - Power dynamics are stored neutrally as structure, not accusation.
 * - Cascade entries describe evidence-supported trajectory, not theory.
 * - Legacy input may be read only at the boundary and normalized immediately.
 */

import { randomUUID } from "crypto";
import type {
  ChronologyEventRecord,
  PowerDynamicsRecord,
  CascadeRecord,
  IntakeSourceType,
} from "./intake-spine-types";
import { GUIDED_INTAKE_POWER_DYNAMICS_QUESTIONS, SYSTEM_INGESTION_EXTRACTION_MAP } from "./intake-spine-types";

// ─── Normalization version ────────────────────────────────────────────────────

export const INTAKE_SPINE_NORMALIZATION_VERSION = "1.0.0";

// ─── Chronology normalization ─────────────────────────────────────────────────

/**
 * Normalize a raw chronology entry from either intake path into a
 * ChronologyEventRecord.
 *
 * Chronology must be earned from the record. Observed events may contain
 * reported speech but must not silently convert those into conclusions.
 */
export function normalizeChronologyEvent(input: {
  case_id: string;
  event_date?: string | null;
  source_date?: string | null;
  observed_event: string;
  people_involved?: string[];
  evidence_source?: string | null;
  immediate_consequence?: string | null;
  outstanding_follow_up?: string | null;
  source_references?: string[];
  event_confidence_level?: ChronologyEventRecord["event_confidence_level"];
  created_from_path?: string | null;
}): ChronologyEventRecord {
  return {
    chronology_event_id: `chron_${randomUUID()}`,
    case_id: input.case_id,
    event_date: input.event_date ?? null,
    source_date: input.source_date ?? null,
    observed_event: input.observed_event,
    people_involved: input.people_involved ?? [],
    evidence_source: input.evidence_source ?? null,
    immediate_consequence: input.immediate_consequence ?? null,
    outstanding_follow_up: input.outstanding_follow_up ?? null,
    source_references: input.source_references ?? [],
    event_confidence_level: input.event_confidence_level ?? "unverified",
    created_from_path: input.created_from_path ?? null,
    normalization_version: INTAKE_SPINE_NORMALIZATION_VERSION,
    status: "active",
  };
}

// ─── Power dynamics normalization ────────────────────────────────────────────

/**
 * Normalize guided intake question answers into a PowerDynamicsRecord.
 *
 * Answers are mapped through the GUIDED_INTAKE_POWER_DYNAMICS_QUESTIONS map.
 * Power dynamics must be stored neutrally as structure, not accusation.
 */
export function normalizeGuidedIntakeToPowerDynamics(input: {
  case_id: string;
  answers: Record<string, string>;
  source_event_ids?: string[];
  evidence_source_ids?: string[];
}): PowerDynamicsRecord {
  const answers = input.answers;

  return {
    power_dynamics_id: `pd_${randomUUID()}`,
    case_id: input.case_id,
    authority_holder: answers["pd_decision_maker"] ?? null,
    resident_representative: null,
    alternate_representative: answers["pd_bypass_concern"] ?? null,
    decision_maker: answers["pd_decision_maker"] ?? null,
    access_controller: answers["pd_access_controller"] ?? null,
    gatekeeper: answers["pd_gatekeeper"] ?? null,
    dependency_path: answers["pd_dependency_path"] ?? null,
    procedural_barrier: null,
    exclusion_event: answers["pd_exclusion_event"] ?? null,
    retaliation_concern: null,
    documentation_holder: answers["pd_documentation_holder"] ?? null,
    communication_bottleneck: answers["pd_exclusion_event"] ?? null,
    burden_shift: null,
    user_capacity_limit: null,
    disputed_authority: answers["pd_bypass_concern"] ?? null,
    informal_power_actor: null,
    power_imbalance_summary: null,
    source_event_ids: input.source_event_ids ?? [],
    evidence_source_ids: input.evidence_source_ids ?? [],
    confidence_level: "low",
    created_from_path: "guided_intake",
    normalization_version: INTAKE_SPINE_NORMALIZATION_VERSION,
    status: "active",
  };
}

/**
 * Normalize system-ingested evidence boundary data into a PowerDynamicsRecord.
 *
 * Legacy input may be read at the boundary but owned structures must be
 * normalized immediately into snake_case fields.
 */
export function normalizeSystemIngestedToPowerDynamics(input: {
  case_id: string;
  source_type: IntakeSourceType;
  extracted_fields: Partial<Omit<PowerDynamicsRecord, "power_dynamics_id" | "case_id" | "created_from_path" | "normalization_version" | "status">>;
  evidence_source_ids?: string[];
}): PowerDynamicsRecord {
  const ef = input.extracted_fields;

  return {
    power_dynamics_id: `pd_${randomUUID()}`,
    case_id: input.case_id,
    authority_holder: ef.authority_holder ?? null,
    resident_representative: ef.resident_representative ?? null,
    alternate_representative: ef.alternate_representative ?? null,
    decision_maker: ef.decision_maker ?? null,
    access_controller: ef.access_controller ?? null,
    gatekeeper: ef.gatekeeper ?? null,
    dependency_path: ef.dependency_path ?? null,
    procedural_barrier: ef.procedural_barrier ?? null,
    exclusion_event: ef.exclusion_event ?? null,
    retaliation_concern: ef.retaliation_concern ?? null,
    documentation_holder: ef.documentation_holder ?? null,
    communication_bottleneck: ef.communication_bottleneck ?? null,
    burden_shift: ef.burden_shift ?? null,
    user_capacity_limit: ef.user_capacity_limit ?? null,
    disputed_authority: ef.disputed_authority ?? null,
    informal_power_actor: ef.informal_power_actor ?? null,
    power_imbalance_summary: ef.power_imbalance_summary ?? null,
    source_event_ids: ef.source_event_ids ?? [],
    evidence_source_ids: input.evidence_source_ids ?? ef.evidence_source_ids ?? [],
    confidence_level: ef.confidence_level ?? "low",
    created_from_path: "system_ingested",
    normalization_version: INTAKE_SPINE_NORMALIZATION_VERSION,
    status: "active",
  };
}

// ─── Cascade normalization ────────────────────────────────────────────────────

/**
 * Normalize cascade trigger data from guided intake answers into a CascadeRecord.
 *
 * Cascade entries must describe evidence-supported trajectory, not theory.
 * Cascades can only be created after chronology exists.
 */
export function normalizeGuidedIntakeToCascade(input: {
  case_id: string;
  trigger_event_id: string;
  trigger_summary: string;
  immediate_effect: string;
  secondary_effect?: string | null;
  affected_people?: string[];
  affected_entities?: string[];
  related_chronology_ids: string[];
  evidence_source_ids?: string[];
}): CascadeRecord {
  // Enforce: cascade must reference at least one chronology event.
  if (input.related_chronology_ids.length === 0) {
    throw new Error(
      "cascade_registry: cannot create cascade entry without related_chronology_ids. " +
      "Chronology must exist before cascades are derived."
    );
  }

  return {
    cascade_id: `casc_${randomUUID()}`,
    case_id: input.case_id,
    trigger_event_id: input.trigger_event_id,
    trigger_summary: input.trigger_summary,
    immediate_effect: input.immediate_effect,
    secondary_effect: input.secondary_effect ?? null,
    affected_people: input.affected_people ?? [],
    affected_entities: input.affected_entities ?? [],
    related_chronology_ids: input.related_chronology_ids,
    related_pattern_ids: [],
    related_power_dynamics_ids: [],
    related_rights_duties_ids: [],
    evidence_source_ids: input.evidence_source_ids ?? [],
    confidence_level: "low",
    open_questions: null,
    created_from_path: "guided_intake",
    normalization_version: INTAKE_SPINE_NORMALIZATION_VERSION,
    status: "active",
  };
}

/**
 * Normalize system-ingested cascade data into a CascadeRecord.
 *
 * Cascade entries must describe evidence-supported trajectory, not theory.
 * Cascades can only be created after chronology exists.
 */
export function normalizeSystemIngestedToCascade(input: {
  case_id: string;
  source_type: IntakeSourceType;
  extracted_fields: Partial<Omit<CascadeRecord, "cascade_id" | "case_id" | "created_from_path" | "normalization_version" | "status">>;
  related_chronology_ids: string[];
}): CascadeRecord {
  // Enforce: cascade must reference at least one chronology event.
  if (input.related_chronology_ids.length === 0) {
    throw new Error(
      "cascade_registry: cannot create cascade entry without related_chronology_ids. " +
      "Chronology must exist before cascades are derived."
    );
  }

  const ef = input.extracted_fields;

  return {
    cascade_id: `casc_${randomUUID()}`,
    case_id: input.case_id,
    trigger_event_id: ef.trigger_event_id ?? null,
    trigger_summary: ef.trigger_summary ?? null,
    immediate_effect: ef.immediate_effect ?? null,
    secondary_effect: ef.secondary_effect ?? null,
    affected_people: ef.affected_people ?? [],
    affected_entities: ef.affected_entities ?? [],
    related_chronology_ids: input.related_chronology_ids,
    related_pattern_ids: ef.related_pattern_ids ?? [],
    related_power_dynamics_ids: ef.related_power_dynamics_ids ?? [],
    related_rights_duties_ids: ef.related_rights_duties_ids ?? [],
    evidence_source_ids: ef.evidence_source_ids ?? [],
    confidence_level: ef.confidence_level ?? "low",
    open_questions: ef.open_questions ?? null,
    created_from_path: "system_ingested",
    normalization_version: INTAKE_SPINE_NORMALIZATION_VERSION,
    status: "active",
  };
}

// ─── Re-exports for downstream consumers ─────────────────────────────────────

export { GUIDED_INTAKE_POWER_DYNAMICS_QUESTIONS, SYSTEM_INGESTION_EXTRACTION_MAP };

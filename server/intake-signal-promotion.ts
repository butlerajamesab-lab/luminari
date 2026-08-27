/**
 * Domain 1 (case intake) signal promotion.
 *
 * The Universal Intake Spine already produces sealed, receipt-bound layer
 * outputs. Until now nothing promoted those outputs into public.intake_signals,
 * which left Domain 1 permanently empty and made three-domain convergence
 * impossible. This module is that writer.
 *
 * Contract:
 * - Every signal is registered through the governed database function
 *   public.register_intake_signal_v1. This module never writes the table
 *   directly. The function computes input_hash and signal_hash itself and is
 *   idempotent on signal_hash (on conflict do nothing), so re-running
 *   promotion can never duplicate a signal.
 * - Zero judgment: records are promoted exactly as the sealed layer emitted
 *   them. Nothing is resolved, merged, or dropped here. Verification states
 *   come from the layer outputs, not from this module.
 * - Full provenance: every signal carries its source session, source sealed
 *   layer run, source record identity, and evidence references so a signal can
 *   always be traced back to the exact deterministic execution that produced
 *   it.
 */

import { getPool } from "./db";
import { read_canonical_case_layer_outputs } from "./intake-case-layer-reader";
import type { ChronologyEvent } from "./engines/intake-spine/layer-4-chronology_reconstruction";
import type { DetectedPattern } from "./engines/intake-spine/layer-10-pattern_registry";
import type { CascadeChain } from "./engines/intake-spine/layer-11-cascade_registry";

const PROMOTED_LAYERS = [
  "chronology_reconstruction",
  "pattern_registry",
  "cascade_registry",
] as const;

export type IntakeSignalPromotionResult = {
  caseId: number;
  registered_signal_ids: string[];
  new_signal_count: number;
  existing_signal_count: number;
  candidate_count: number;
  promoted_layers: string[];
};

type SignalRecord = {
  source_intake_session_id: string;
  source_layer_run_id: string;
  source_record_refs: Array<Record<string, unknown>>;
  case_reference: string;
  breakpoint_type: string;
  title: string;
  description: string;
  jurisdiction_id?: string;
  verification_state: string;
  evidence_refs: Array<Record<string, unknown>>;
  rule_id: string;
  rule_version: string;
};

function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max - 1).trimEnd() + "…";
}

function chronologySignal(
  output: { intake_session_id: string; layer_run_id: string; rule_version: string },
  event: ChronologyEvent,
  caseReference: string,
  jurisdiction?: string,
): SignalRecord {
  return {
    source_intake_session_id: output.intake_session_id,
    source_layer_run_id: output.layer_run_id,
    source_record_refs: [
      {
        type: "chronology_event",
        event_id: event.event_id,
        source_artifact_key: event.source_artifact_key,
        source_span_offset: event.source_span_offset,
      },
    ],
    case_reference: caseReference,
    breakpoint_type: "chronology_event",
    title: truncate(
      `Chronology event${event.date ? ` on ${event.date}` : " (undated)"}: ${event.event_text}`,
      200,
    ),
    description: truncate(
      `Date precision: ${event.date_precision}. Actor: ${event.actor ?? "unresolved"}. Source: ${event.source_artifact_key} at span offset ${event.source_span_offset}. Event text: ${event.event_text}`,
      2000,
    ),
    jurisdiction_id: jurisdiction,
    verification_state: event.verification_status,
    evidence_refs: [
      {
        type: "source_span",
        artifact_key: event.source_artifact_key,
        span_offset: event.source_span_offset,
      },
    ],
    rule_id: "chronology_reconstruction",
    rule_version: output.rule_version,
  };
}

function multiSourceState(sourceArtifactCount: number): string {
  return sourceArtifactCount >= 2
    ? "supported_multiple_sources"
    : "supported_one_source";
}

function patternSignal(
  output: { intake_session_id: string; layer_run_id: string; rule_version: string },
  pattern: DetectedPattern,
  caseReference: string,
  jurisdiction?: string,
): SignalRecord {
  return {
    source_intake_session_id: output.intake_session_id,
    source_layer_run_id: output.layer_run_id,
    source_record_refs: [
      {
        type: "structural_pattern",
        pattern_id: pattern.pattern_id,
        rule_id: pattern.rule_id,
        transition_ids: pattern.matching_transitions.map(t => t.transition_id),
      },
    ],
    case_reference: caseReference,
    breakpoint_type: pattern.pattern_type,
    title: truncate(
      `Structural pattern ${pattern.rule_id} (${pattern.time_span_days} day span)`,
      200,
    ),
    description: truncate(pattern.match_basis, 2000),
    jurisdiction_id: jurisdiction,
    verification_state: multiSourceState(pattern.source_artifacts.length),
    evidence_refs: pattern.source_artifacts.map(artifact_key => ({
      type: "source_artifact",
      artifact_key,
    })),
    rule_id: pattern.rule_id,
    rule_version: output.rule_version,
  };
}

function cascadeSignal(
  output: { intake_session_id: string; layer_run_id: string; rule_version: string },
  cascade: CascadeChain,
  caseReference: string,
  jurisdiction?: string,
): SignalRecord {
  return {
    source_intake_session_id: output.intake_session_id,
    source_layer_run_id: output.layer_run_id,
    source_record_refs: [
      {
        type: "cascade_chain",
        cascade_id: cascade.cascade_id,
        cascade_rule_id: cascade.cascade_rule_id,
        transition_ids: cascade.transitions_in_chain.map(s => s.transition_id),
      },
    ],
    case_reference: caseReference,
    breakpoint_type: cascade.cascade_match_type,
    title: truncate(
      `Cascade ${cascade.cascade_rule_id} (${cascade.total_time_span_days} day span)`,
      200,
    ),
    description: truncate(
      `Cascade chain of ${cascade.transitions_in_chain.length} state transitions for one entity across ${cascade.source_artifacts.length} independent source artifact(s). ` +
        `Causal language explicitly present in source: ${cascade.causal_stated_in_source ? "yes" : "no"}. ` +
        `A temporal sequence is structural evidence only and is not a finding of causation.`,
      2000,
    ),
    jurisdiction_id: jurisdiction,
    verification_state: multiSourceState(cascade.source_artifacts.length),
    evidence_refs: cascade.source_artifacts.map(artifact_key => ({
      type: "source_artifact",
      artifact_key,
    })),
    rule_id: cascade.cascade_rule_id,
    rule_version: output.rule_version,
  };
}

async function registerSignal(record: SignalRecord): Promise<string> {
  const result = await getPool().query<{ signal_id: string }>(
    `select public.register_intake_signal_v1($1::jsonb) as signal_id`,
    [JSON.stringify(record)],
  );
  const signalId = result.rows[0]?.signal_id;
  if (!signalId) throw new Error("intake_signal_promotion_registration_returned_no_id");
  return signalId;
}

async function existingSignalIdsForCase(caseReference: string): Promise<Set<string>> {
  const result = await getPool().query<{ signal_id: string }>(
    `select signal_id::text from public.intake_signals where case_reference = $1`,
    [caseReference],
  );
  return new Set(result.rows.map(row => row.signal_id));
}

/**
 * Promote the sealed chronology, pattern, and cascade outputs of every
 * completed live upload session for one case into Domain 1 intake signals.
 * Idempotent by signal_hash; safe to call after every governed execution and
 * safe to call repeatedly for backfill.
 */
export async function promoteCaseIntakeSignals(
  caseId: number,
  jurisdiction?: string,
): Promise<IntakeSignalPromotionResult> {
  const caseReference = String(caseId);
  const before = await existingSignalIdsForCase(caseReference);

  const [chronology, patterns, cascades] = await Promise.all([
    read_canonical_case_layer_outputs<ChronologyEvent[]>(caseId, "chronology_reconstruction"),
    read_canonical_case_layer_outputs<DetectedPattern[]>(caseId, "pattern_registry"),
    read_canonical_case_layer_outputs<CascadeChain[]>(caseId, "cascade_registry"),
  ]);

  const records: SignalRecord[] = [];
  const promotedLayers: string[] = [];

  for (const output of chronology.outputs) {
    for (const event of output.data ?? []) {
      records.push(chronologySignal(output, event, caseReference, jurisdiction));
    }
  }
  if (chronology.outputs.length > 0) promotedLayers.push("chronology_reconstruction");

  for (const output of patterns.outputs) {
    for (const pattern of output.data ?? []) {
      records.push(patternSignal(output, pattern, caseReference, jurisdiction));
    }
  }
  if (patterns.outputs.length > 0) promotedLayers.push("pattern_registry");

  for (const output of cascades.outputs) {
    for (const cascade of output.data ?? []) {
      records.push(cascadeSignal(output, cascade, caseReference, jurisdiction));
    }
  }
  if (cascades.outputs.length > 0) promotedLayers.push("cascade_registry");

  const registered: string[] = [];
  for (const record of records) {
    registered.push(await registerSignal(record));
  }

  const newCount = registered.filter(id => !before.has(id)).length;
  return {
    caseId,
    registered_signal_ids: registered,
    new_signal_count: newCount,
    existing_signal_count: registered.length - newCount,
    candidate_count: records.length,
    promoted_layers: promotedLayers,
  };
}

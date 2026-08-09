import { listEvents } from "./case-runtime-chronology-compat";
import { read_case_intake_integrity_projection } from "./intake-case-integrity-projection";
import { read_canonical_case_layer_outputs } from "./intake-case-layer-reader";
import { project_case_entities, project_case_relationships } from "./intake-case-runtime-projection";
import type { VerificationRecord } from "./engines/intake-spine/layer-5-verification_gate";
import type { DetectedPattern } from "./engines/intake-spine/layer-10-pattern_registry";
import type { CascadeChain } from "./engines/intake-spine/layer-11-cascade_registry";
import type { ClaimCandidate } from "./engines/intake-spine/layer-12-rights_and_duties_matrix";

function output_item_count<T>(outputs: Array<{ data: T[] }>): number {
  return outputs.reduce((total, output) => total + (Array.isArray(output.data) ? output.data.length : 0), 0);
}

/**
 * One receipt-bound statistics projection for every case summary surface.
 * Legacy analyzer tables are intentionally excluded: an absent governed layer
 * is zero/not-projected, never permission to read a retired parallel runtime.
 */
export async function getCaseStats(caseId: number) {
  const [
    integrity,
    entities,
    relationships,
    events,
    verification,
    claims,
    patterns,
    cascades,
  ] = await Promise.all([
    read_case_intake_integrity_projection(caseId),
    project_case_entities(caseId),
    project_case_relationships(caseId),
    listEvents(caseId),
    read_canonical_case_layer_outputs<VerificationRecord[]>(caseId, "verification_gate"),
    read_canonical_case_layer_outputs<ClaimCandidate[]>(caseId, "rights_and_duties_matrix"),
    read_canonical_case_layer_outputs<DetectedPattern[]>(caseId, "pattern_registry"),
    read_canonical_case_layer_outputs<CascadeChain[]>(caseId, "cascade_registry"),
  ]);

  const documentStatus: Record<string, number> = {};
  for (const artifact of integrity.artifacts) {
    const status = artifact.integrity_status ?? artifact.source_artifact_status ?? "registered";
    documentStatus[status] = (documentStatus[status] ?? 0) + 1;
  }

  return {
    documents: integrity.source_artifact_count,
    entities: entities.state === "canonical_projection" ? entities.entities.length : 0,
    quotes: 0,
    claims: claims.state === "canonical_projection" ? output_item_count(claims.outputs) : 0,
    findings: verification.state === "canonical_projection" ? output_item_count(verification.outputs) : 0,
    events: events.length,
    relationships: relationships.state === "canonical_projection" ? relationships.relationships.length : 0,
    signalFlags:
      (patterns.state === "canonical_projection" ? output_item_count(patterns.outputs) : 0)
      + (cascades.state === "canonical_projection" ? output_item_count(cascades.outputs) : 0),
    documentStatus,
    projectionState: {
      integrity: integrity.projection_state,
      entities: entities.state,
      relationships: relationships.state,
      verification: verification.state,
      claims: claims.state,
      patterns: patterns.state,
      cascades: cascades.state,
    },
  };
}

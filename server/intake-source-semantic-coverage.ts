import { read_case_intake_integrity_projection, type IntakeIntegrityArtifactRecord, type IntakeIntegrityProjection } from "./intake-case-integrity-projection";
import { read_canonical_case_layer_outputs } from "./intake-case-layer-reader";
import type { ChronologyEvent } from "./engines/intake-spine/layer-4-chronology_reconstruction";
import type { Entity } from "./engines/intake-spine/layer-6-entity_registry";
import type { Relationship } from "./engines/intake-spine/layer-7-relationship_graph";
import type { StateTransition } from "./engines/intake-spine/layer-9-state_timeline";

export const SOURCE_SEMANTIC_COVERAGE_CONTRACT_VERSION =
  "luminari.intake.source-semantic-coverage.v1";

export type SourceSemanticContributionCounts = {
  chronology_events: number;
  entity_mentions: number;
  distinct_entities: number;
  relationship_refs: number;
  distinct_relationships: number;
  state_transitions: number;
  total_semantic_references: number;
};

export type SourceInterpretationState =
  | "not_evaluated"
  | "preservation_blocked"
  | "some_semantic_use"
  | "image_interpretation_unproven"
  | "source_interpretation_unproven";

export type SourceSemanticCoverageArtifact = {
  artifact_id: string;
  intake_session_id: string;
  legacy_document_id: number | null;
  artifact_key: string;
  filename: string | null;
  mime_type: string | null;
  source_sha256: string | null;
  preservation_state: string;
  is_image: boolean;
  contribution_counts: SourceSemanticContributionCounts;
  interpretation_state: SourceInterpretationState;
  requires_interpretation_review: boolean;
};

export type SourceSemanticCoverageProjection = {
  contract_version: typeof SOURCE_SEMANTIC_COVERAGE_CONTRACT_VERSION;
  projection_state: "not_projected" | "canonical_projection";
  minimum_semantic_usage_only: true;
  some_semantic_use_does_not_prove_complete_interpretation: true;
  zero_semantic_use_requires_explicit_review: true;
  source_artifact_count: number;
  sources_with_some_semantic_use: number;
  sources_requiring_interpretation_review: number;
  image_sources: number;
  image_sources_requiring_interpretation_review: number;
  non_image_sources_requiring_interpretation_review: number;
  artifacts: SourceSemanticCoverageArtifact[];
  layer_receipts: Array<{
    layer_name: string;
    intake_session_id: string;
    layer_run_id: string;
    output_hash: string;
    receipt_hash: string;
  }>;
};

type SourceSemanticInputs = {
  integrity: IntakeIntegrityProjection;
  chronology: ChronologyEvent[];
  entities: Entity[];
  relationships: Relationship[];
  transitions: StateTransition[];
  semantic_projection_available: boolean;
};

function empty_counts(): SourceSemanticContributionCounts {
  return {
    chronology_events: 0,
    entity_mentions: 0,
    distinct_entities: 0,
    relationship_refs: 0,
    distinct_relationships: 0,
    state_transitions: 0,
    total_semantic_references: 0,
  };
}

function is_image_artifact(artifact: IntakeIntegrityArtifactRecord): boolean {
  return Boolean(artifact.mime_type?.toLowerCase().startsWith("image/"));
}

function preservation_blocked(artifact: IntakeIntegrityArtifactRecord): boolean {
  return artifact.integrity_status === "quarantined"
    || artifact.integrity_status === "referenced_missing";
}

export function project_source_semantic_coverage(
  input: SourceSemanticInputs,
): Omit<SourceSemanticCoverageProjection, "contract_version" | "layer_receipts"> {
  const chronology_by_source = new Map<string, number>();
  const entity_mentions_by_source = new Map<string, number>();
  const entity_ids_by_source = new Map<string, Set<string>>();
  const relationship_refs_by_source = new Map<string, number>();
  const relationship_ids_by_source = new Map<string, Set<string>>();
  const transitions_by_source = new Map<string, number>();

  for (const event of input.chronology) {
    chronology_by_source.set(
      event.source_artifact_key,
      (chronology_by_source.get(event.source_artifact_key) ?? 0) + 1,
    );
  }

  for (const entity of input.entities) {
    for (const mention of entity.raw_mentions) {
      entity_mentions_by_source.set(
        mention.artifact_key,
        (entity_mentions_by_source.get(mention.artifact_key) ?? 0) + 1,
      );
      const ids = entity_ids_by_source.get(mention.artifact_key) ?? new Set<string>();
      ids.add(entity.entity_id);
      entity_ids_by_source.set(mention.artifact_key, ids);
    }
  }

  for (const relationship of input.relationships) {
    for (const ref of relationship.source_refs) {
      relationship_refs_by_source.set(
        ref.artifact_key,
        (relationship_refs_by_source.get(ref.artifact_key) ?? 0) + 1,
      );
      const ids = relationship_ids_by_source.get(ref.artifact_key) ?? new Set<string>();
      ids.add(relationship.relationship_id);
      relationship_ids_by_source.set(ref.artifact_key, ids);
    }
  }

  for (const transition of input.transitions) {
    transitions_by_source.set(
      transition.source_artifact_key,
      (transitions_by_source.get(transition.source_artifact_key) ?? 0) + 1,
    );
  }

  const artifacts = input.integrity.artifacts.map((artifact): SourceSemanticCoverageArtifact => {
    const key = artifact.artifact_key;
    const counts: SourceSemanticContributionCounts = {
      chronology_events: chronology_by_source.get(key) ?? 0,
      entity_mentions: entity_mentions_by_source.get(key) ?? 0,
      distinct_entities: entity_ids_by_source.get(key)?.size ?? 0,
      relationship_refs: relationship_refs_by_source.get(key) ?? 0,
      distinct_relationships: relationship_ids_by_source.get(key)?.size ?? 0,
      state_transitions: transitions_by_source.get(key) ?? 0,
      total_semantic_references:
        (chronology_by_source.get(key) ?? 0)
        + (entity_mentions_by_source.get(key) ?? 0)
        + (relationship_refs_by_source.get(key) ?? 0)
        + (transitions_by_source.get(key) ?? 0),
    };
    const image = is_image_artifact(artifact);
    let interpretation_state: SourceInterpretationState;
    if (!input.semantic_projection_available) {
      interpretation_state = "not_evaluated";
    } else if (preservation_blocked(artifact)) {
      interpretation_state = "preservation_blocked";
    } else if (counts.total_semantic_references > 0) {
      interpretation_state = "some_semantic_use";
    } else if (image) {
      interpretation_state = "image_interpretation_unproven";
    } else {
      interpretation_state = "source_interpretation_unproven";
    }

    return {
      artifact_id: artifact.artifact_id,
      intake_session_id: artifact.intake_session_id,
      legacy_document_id: artifact.legacy_document_id,
      artifact_key: key,
      filename: artifact.filename,
      mime_type: artifact.mime_type,
      source_sha256: artifact.source_sha256,
      preservation_state: artifact.integrity_status ?? artifact.source_artifact_status,
      is_image: image,
      contribution_counts: counts,
      interpretation_state,
      requires_interpretation_review:
        interpretation_state === "image_interpretation_unproven"
        || interpretation_state === "source_interpretation_unproven",
    };
  });

  return {
    projection_state: input.semantic_projection_available
      ? "canonical_projection"
      : "not_projected",
    minimum_semantic_usage_only: true,
    some_semantic_use_does_not_prove_complete_interpretation: true,
    zero_semantic_use_requires_explicit_review: true,
    source_artifact_count: artifacts.length,
    sources_with_some_semantic_use: artifacts.filter(
      artifact => artifact.interpretation_state === "some_semantic_use",
    ).length,
    sources_requiring_interpretation_review: artifacts.filter(
      artifact => artifact.requires_interpretation_review,
    ).length,
    image_sources: artifacts.filter(artifact => artifact.is_image).length,
    image_sources_requiring_interpretation_review: artifacts.filter(
      artifact => artifact.is_image && artifact.requires_interpretation_review,
    ).length,
    non_image_sources_requiring_interpretation_review: artifacts.filter(
      artifact => !artifact.is_image && artifact.requires_interpretation_review,
    ).length,
    artifacts,
  };
}

function receipt_rows(
  reads: Array<{ layer_name: string; outputs: Array<{
    intake_session_id: string;
    layer_run_id: string;
    output_hash: string;
    receipt_hash: string;
  }> }>,
): SourceSemanticCoverageProjection["layer_receipts"] {
  return reads.flatMap(read => read.outputs.map(output => ({
    layer_name: read.layer_name,
    intake_session_id: output.intake_session_id,
    layer_run_id: output.layer_run_id,
    output_hash: output.output_hash,
    receipt_hash: output.receipt_hash,
  })));
}

export async function read_case_source_semantic_coverage(
  case_id: number,
): Promise<SourceSemanticCoverageProjection> {
  const [integrity, chronology_read, entity_read, relationship_read, transition_read] =
    await Promise.all([
      read_case_intake_integrity_projection(case_id),
      read_canonical_case_layer_outputs<ChronologyEvent[]>(case_id, "chronology_reconstruction"),
      read_canonical_case_layer_outputs<Entity[]>(case_id, "entity_registry"),
      read_canonical_case_layer_outputs<Relationship[]>(case_id, "relationship_graph"),
      read_canonical_case_layer_outputs<StateTransition[]>(case_id, "state_timeline"),
    ]);

  const reads = [
    { layer_name: "chronology_reconstruction", ...chronology_read },
    { layer_name: "entity_registry", ...entity_read },
    { layer_name: "relationship_graph", ...relationship_read },
    { layer_name: "state_timeline", ...transition_read },
  ];
  const semantic_projection_available = reads.every(
    read => read.state === "canonical_projection",
  );

  const projected = project_source_semantic_coverage({
    integrity,
    chronology: chronology_read.outputs.flatMap(output => output.data),
    entities: entity_read.outputs.flatMap(output => output.data),
    relationships: relationship_read.outputs.flatMap(output => output.data),
    transitions: transition_read.outputs.flatMap(output => output.data),
    semantic_projection_available,
  });

  return {
    contract_version: SOURCE_SEMANTIC_COVERAGE_CONTRACT_VERSION,
    ...projected,
    layer_receipts: receipt_rows(reads),
  };
}

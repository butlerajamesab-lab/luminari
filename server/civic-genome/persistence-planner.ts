import type { VerifiedGenomeAssemblyResult } from "./assembly-contract";

export type GenomeSubstrateTable =
  | "civic_genome_family"
  | "civic_genome_bill"
  | "civic_genome_event"
  | "bill_lineage_edge"
  | "family_momentum_snapshot";

export type PersistenceBlockerCode =
  | "UNRESOLVED_FAMILY_NOT_REPRESENTABLE"
  | "TRAIT_DESTINATION_MISSING"
  | "RELATIONSHIP_DESTINATION_INCOMPLETE"
  | "EVENT_REQUIRES_FAMILY"
  | "MOMENTUM_INPUTS_NOT_SNAPSHOT";

export interface PersistenceBlocker {
  code: PersistenceBlockerCode;
  message: string;
  affectedCount: number;
  requiredSchemaCapability: string;
}

export interface PersistenceProjection {
  table: GenomeSubstrateTable;
  operation: "upsert" | "insert";
  rows: Record<string, unknown>[];
  lossy: boolean;
  omittedFields: string[];
}

export type GenomePersistencePlan =
  | {
      canPersistLosslessly: true;
      projections: PersistenceProjection[];
      blockers: [];
    }
  | {
      canPersistLosslessly: false;
      projections: PersistenceProjection[];
      blockers: PersistenceBlocker[];
    };

/**
 * Produces a dry-run compatibility plan only. It performs no SQL and accepts
 * only verified assembly output, so invalid derived data cannot reach storage.
 */
export function planGenomePersistence(
  result: VerifiedGenomeAssemblyResult,
  context: {
    billId: string;
    stateCode: string;
    sessionKey: string;
    sourceBillNumber: string;
    sourceBillTitle?: string | null;
    sourceBillUrl?: string | null;
    billStatus?: string | null;
    introducedAt?: string | null;
    lastActionAt?: string | null;
    rosettaExtractionRunId?: string | null;
  }
): GenomePersistencePlan {
  const blockers: PersistenceBlocker[] = [];
  const projections: PersistenceProjection[] = [];
  const familyId = result.data.familyResolution.state === "assigned"
    ? result.data.familyResolution.familyId
    : null;

  if (!familyId) {
    blockers.push({
      code: "UNRESOLVED_FAMILY_NOT_REPRESENTABLE",
      message: "civic_genome_bill.family_id is NOT NULL, but the assembly is explicitly unresolved.",
      affectedCount: 1,
      requiredSchemaCapability: "Nullable family assignment or a separate unresolved-family state table.",
    });
  }

  if (result.data.traits.length > 0) {
    blockers.push({
      code: "TRAIT_DESTINATION_MISSING",
      message: "The five-table substrate has no normalized trait destination preserving Rosetta object and source-block provenance.",
      affectedCount: result.data.traits.length,
      requiredSchemaCapability: "A civic_genome_trait table keyed by trait_fingerprint with source-object provenance columns.",
    });
  }

  const nonLineageRelationships = result.data.relationships.filter(
    (relationship) => !["inherits", "modifies", "duplicates", "diverges_from", "preempts", "references"].includes(relationship.relationshipType)
  );
  if (nonLineageRelationships.length > 0) {
    blockers.push({
      code: "RELATIONSHIP_DESTINATION_INCOMPLETE",
      message: "bill_lineage_edge cannot represent general trait, actor, family, or jurisdiction relationships.",
      affectedCount: nonLineageRelationships.length,
      requiredSchemaCapability: "A generic civic_genome_relationship table with typed endpoints and evidence references.",
    });
  }

  if (!familyId && result.data.events.length > 0) {
    blockers.push({
      code: "EVENT_REQUIRES_FAMILY",
      message: "civic_genome_event.family_id is NOT NULL, so events for unresolved bills cannot be preserved.",
      affectedCount: result.data.events.length,
      requiredSchemaCapability: "Nullable event family_id while retaining genome_bill_id as the canonical event owner.",
    });
  }

  if (result.data.momentumInputs.length > 0) {
    blockers.push({
      code: "MOMENTUM_INPUTS_NOT_SNAPSHOT",
      message: "Inspectable momentum inputs cannot be stored in family_momentum_snapshot without first applying a versioned methodology.",
      affectedCount: result.data.momentumInputs.length,
      requiredSchemaCapability: "Versioned momentum component storage or a deterministic snapshot calculator with component JSON.",
    });
  }

  if (familyId) {
    projections.push({
      table: "civic_genome_bill",
      operation: "upsert",
      rows: [{
        genome_bill_id: result.data.traits[0]?.genomeBillId,
        family_id: familyId,
        bill_id: context.billId,
        state_code: context.stateCode,
        session_key: context.sessionKey,
        source_bill_number: context.sourceBillNumber,
        source_bill_title: context.sourceBillTitle ?? null,
        source_bill_url: context.sourceBillUrl ?? null,
        bill_status: context.billStatus ?? null,
        introduced_at: context.introducedAt ?? null,
        last_action_at: context.lastActionAt ?? null,
        rosetta_extraction_run_id: context.rosettaExtractionRunId ?? null,
        structural_dna_hash: result.verification.outputHash,
        structural_dna_json: {
          methodology_version: result.verification.methodologyVersion,
          verification: result.verification,
          family_resolution: result.data.familyResolution,
          absences: result.data.absences,
        },
      }],
      lossy: true,
      omittedFields: ["traits", "general_relationships", "event_state_objects", "momentum_components"],
    });

    if (result.data.lineageEdges.length > 0) {
      projections.push({
        table: "bill_lineage_edge",
        operation: "upsert",
        rows: result.data.lineageEdges.map((edge) => ({
          family_id: familyId,
          from_bill_id: edge.fromGenomeBillId,
          to_bill_id: edge.toGenomeBillId,
          relationship_type: edge.relationshipType,
          confidence_score: edge.confidence,
          evidence_json: {
            strength: edge.strength,
            evidence_refs: edge.evidenceRefs,
            lineage_fingerprint: edge.lineageFingerprint,
          },
        })),
        lossy: false,
        omittedFields: [],
      });
    }
  }

  return blockers.length === 0
    ? { canPersistLosslessly: true, projections, blockers: [] }
    : { canPersistLosslessly: false, projections, blockers };
}

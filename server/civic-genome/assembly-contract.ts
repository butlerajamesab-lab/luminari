export type GenomeBillStatus = "observed" | "decomposed" | "verified" | "superseded";
export type ProvenanceState = "complete" | "partial" | "failed";

export interface GenomeBillIdentity {
  genomeBillId: string;
  canonicalBillId: string;
  jurisdictionId: string;
  legislativeSessionId: string | null;
  sourceDocumentId: string;
  sourceVersionHash: string;
  latestExtractionRunId: string | null;
  status: GenomeBillStatus;
  firstObservedAt: string;
  lastObservedAt: string;
  provenanceState: ProvenanceState;
}

export type RosettaLayer = "help" | "workflow" | "accountability" | "override" | "definition";

export interface RosettaSourceRef {
  sourceObjectType: string;
  sourceObjectId: string;
  sourceBlockId: string | null;
  extractionRunId: string;
}

export interface RosettaLawObject extends RosettaSourceRef {
  layer: RosettaLayer;
  key: string;
  normalizedValue: unknown;
  confidence: number;
  confirmed?: boolean;
  metadata?: Record<string, unknown>;
}

export interface RosettaLawView {
  objects: RosettaLawObject[];
  coverage: Partial<Record<RosettaLayer, number>>;
  provenanceState: ProvenanceState;
  inputHash?: string;
}

export type CivicGenomeTraitClass =
  | RosettaLayer
  | "actor"
  | "deadline"
  | "funding"
  | "eligibility"
  | "enforcement"
  | "right"
  | "restriction";

export type TraitSignalStatus = "confirmed" | "tentative" | "human_review_required";

export interface CivicGenomeTrait extends RosettaSourceRef {
  traitId: string;
  genomeBillId: string;
  traitClass: CivicGenomeTraitClass;
  traitKey: string;
  normalizedValue: unknown;
  confidence: number;
  signalStatus: TraitSignalStatus;
  traitFingerprint: string;
}

export type GenomeEntityType = "bill" | "trait" | "family" | "actor" | "jurisdiction";
export type GenomeRelationshipType =
  | "dependency"
  | "conflict"
  | "amplification"
  | "suppression"
  | "inherits"
  | "modifies"
  | "duplicates"
  | "diverges_from"
  | "preempts"
  | "references";

export interface EvidenceRef {
  sourceType: string;
  sourceId: string;
  sourceBlockId?: string;
}

export interface CivicGenomeRelationship {
  relationshipId: string;
  sourceEntityType: GenomeEntityType;
  sourceEntityId: string;
  targetEntityType: GenomeEntityType;
  targetEntityId: string;
  relationshipType: GenomeRelationshipType;
  direction: "uni" | "bi" | "conditional";
  supportCount: number;
  confidence: number;
  strength: number;
  validationState: "possible" | "observed" | "validated" | "systemic";
  evidenceRefs: EvidenceRef[];
  relationshipFingerprint: string;
}

export interface CivicGenomeFamily {
  familyId: string;
  familyKey: string;
  policyDomain: string;
  confirmedTraits: CivicGenomeTrait[];
  hardContradictionKeys?: string[];
}

export interface GenomeBillCandidate {
  genomeBillId: string;
  canonicalBillId: string;
  jurisdictionId: string;
  introducedAt: string | null;
  traits: CivicGenomeTrait[];
  familyId?: string | null;
}

export interface FamilySimilarityBreakdown {
  policyDomainSimilarity: number;
  actorSimilarity: number;
  workflowSimilarity: number;
  accountabilitySimilarity: number;
  eligibilitySimilarity: number;
  definitionSimilarity: number;
  weightedScore: number;
  sharedConfirmedTraitCount: number;
}

export type FamilyResolution =
  | {
      state: "assigned";
      familyId: string;
      score: number;
      breakdown: FamilySimilarityBreakdown;
      competingFamilyIds: string[];
    }
  | {
      state: "unresolved_family_candidate";
      reason: "below_threshold" | "insufficient_confirmed_traits" | "hard_contradiction" | "no_candidates";
      bestCandidateFamilyId: string | null;
      score: number;
      breakdown: FamilySimilarityBreakdown | null;
    };

export interface BillLineageEdge {
  lineageEdgeId: string;
  fromGenomeBillId: string;
  toGenomeBillId: string;
  relationshipType: Extract<GenomeRelationshipType, "inherits" | "modifies" | "duplicates" | "diverges_from" | "preempts" | "references">;
  confidence: number;
  strength: number;
  evidenceRefs: EvidenceRef[];
  lineageFingerprint: string;
}

export type CivicGenomeEventType =
  | "bill_observed"
  | "source_changed"
  | "status_changed"
  | "extraction_completed"
  | "trait_added"
  | "trait_removed"
  | "trait_modified"
  | "family_assigned"
  | "family_reassigned"
  | "lineage_edge_added"
  | "lineage_edge_removed"
  | "contradiction_detected"
  | "deadline_approaching"
  | "bill_enacted"
  | "bill_failed"
  | "bill_carried_over";

export interface CivicGenomeEvent {
  eventId: string;
  genomeBillId: string;
  familyId: string | null;
  eventType: CivicGenomeEventType;
  occurredAt: string;
  priorState: unknown;
  nextState: unknown;
  evidenceRefs: EvidenceRef[];
  eventFingerprint: string;
}

export interface CanonicalBillSnapshot {
  genomeBill: GenomeBillIdentity;
  policyDomain: string;
  status: string | null;
  introducedAt: string | null;
  lastActionAt: string | null;
  sourceHash: string;
}

export interface PriorGenomeState {
  traits: CivicGenomeTrait[];
  relationships: CivicGenomeRelationship[];
  familyResolution: FamilyResolution | null;
  lineageEdges: BillLineageEdge[];
  canonicalBill?: CanonicalBillSnapshot;
}

export interface MomentumInput {
  familyId: string;
  dimension:
    | "introduction_velocity"
    | "committee_progress"
    | "chamber_progress"
    | "jurisdiction_spread"
    | "family_growth"
    | "enactment_rate"
    | "sponsor_growth"
    | "inactivity_decay"
    | "failure_weight";
  value: number;
  evidenceRefs: EvidenceRef[];
}

export interface MissingDimension {
  dimension: string;
  reason: string;
  requiredForValidity: boolean;
}

export interface GenomeAssemblyInput {
  genomeBillId: string;
  canonicalBill: CanonicalBillSnapshot;
  rosettaLawView: RosettaLawView;
  priorGenomeState?: PriorGenomeState;
  candidateFamilies: CivicGenomeFamily[];
  candidateRelatedBills: GenomeBillCandidate[];
  methodologyVersion: string;
  observedAt?: string;
  familyThreshold?: number;
  minimumSharedConfirmedTraits?: number;
}

export interface VerifiedGenomeAssemblyResult {
  isValid: true;
  data: {
    traits: CivicGenomeTrait[];
    relationships: CivicGenomeRelationship[];
    familyResolution: FamilyResolution;
    lineageEdges: BillLineageEdge[];
    events: CivicGenomeEvent[];
    momentumInputs: MomentumInput[];
    absences: MissingDimension[];
  };
  verification: {
    status: "valid" | "partial";
    inputHash: string;
    outputHash: string;
    checks: Record<string, boolean>;
    failedChecks: string[];
    coverage: number;
    methodologyVersion: string;
  };
}

export interface InvalidGenomeAssemblyResult {
  isValid: false;
  error: "GENOME_ASSEMBLY_VERIFICATION_FAILED";
  failedChecks: string[];
  inputHash: string;
}

export type GenomeAssemblyResult = VerifiedGenomeAssemblyResult | InvalidGenomeAssemblyResult;

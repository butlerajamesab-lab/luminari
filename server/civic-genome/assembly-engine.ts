import { createHash } from "node:crypto";
import type {
  BillLineageEdge,
  CivicGenomeEvent,
  CivicGenomeFamily,
  CivicGenomeRelationship,
  CivicGenomeTrait,
  FamilyResolution,
  FamilySimilarityBreakdown,
  GenomeAssemblyInput,
  GenomeAssemblyResult,
  GenomeBillCandidate,
  MissingDimension,
  MomentumInput,
  RosettaLawObject,
  TraitSignalStatus,
} from "./assembly-contract";

const FAMILY_WEIGHTS = {
  policyDomainSimilarity: 0.25,
  actorSimilarity: 0.2,
  workflowSimilarity: 0.2,
  accountabilitySimilarity: 0.15,
  eligibilitySimilarity: 0.1,
  definitionSimilarity: 0.1,
} as const;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)])
    );
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function hashValue(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function signalStatus(object: RosettaLawObject): TraitSignalStatus {
  if (object.confirmed === true && object.confidence >= 0.75) return "confirmed";
  if (object.confidence >= 0.5) return "tentative";
  return "human_review_required";
}

export function adaptRosettaToGenomeTraits(
  genomeBillId: string,
  objects: RosettaLawObject[]
): CivicGenomeTrait[] {
  const traits = objects.map((object) => {
    const traitClass = object.layer;
    const fingerprintPayload = {
      genomeBillId,
      traitClass,
      traitKey: object.key,
      normalizedValue: object.normalizedValue,
      sourceObjectType: object.sourceObjectType,
      sourceObjectId: object.sourceObjectId,
      sourceBlockId: object.sourceBlockId,
      extractionRunId: object.extractionRunId,
    };
    const traitFingerprint = hashValue(fingerprintPayload);
    return {
      traitId: `trait_${traitFingerprint.slice(0, 24)}`,
      genomeBillId,
      traitClass,
      traitKey: object.key,
      normalizedValue: canonicalize(object.normalizedValue),
      sourceObjectType: object.sourceObjectType,
      sourceObjectId: object.sourceObjectId,
      sourceBlockId: object.sourceBlockId,
      extractionRunId: object.extractionRunId,
      confidence: clamp(object.confidence),
      signalStatus: signalStatus(object),
      traitFingerprint,
    } satisfies CivicGenomeTrait;
  });

  return deduplicateTraits(traits);
}

export function deduplicateTraits(traits: CivicGenomeTrait[]): CivicGenomeTrait[] {
  const byFingerprint = new Map<string, CivicGenomeTrait>();
  for (const trait of traits) {
    const existing = byFingerprint.get(trait.traitFingerprint);
    if (!existing || trait.confidence > existing.confidence) byFingerprint.set(trait.traitFingerprint, trait);
  }
  return [...byFingerprint.values()].sort((a, b) => a.traitFingerprint.localeCompare(b.traitFingerprint));
}

type normalized_trait_index = {
  all: Set<string>;
  by_class: Map<string, Set<string>>;
};

function indexConfirmedTraits(traits: CivicGenomeTrait[]): normalized_trait_index {
  const all = new Set<string>();
  const by_class = new Map<string, Set<string>>();

  for (const trait of traits) {
    if (trait.signalStatus !== "confirmed") continue;
    const normalized = `${trait.traitKey}:${stableStringify(trait.normalizedValue)}`;
    all.add(normalized);
    const class_traits = by_class.get(trait.traitClass) ?? new Set<string>();
    class_traits.add(normalized);
    by_class.set(trait.traitClass, class_traits);
  }

  return { all, by_class };
}

function normalizedSet(index: normalized_trait_index, classes: readonly string[]): Set<string> {
  const normalized = new Set<string>();
  for (const trait_class of classes) {
    for (const value of index.by_class.get(trait_class) ?? []) normalized.add(value);
  }
  return normalized;
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) return 0;
  const intersection = [...left].filter((value) => right.has(value)).length;
  return intersection / (left.size + right.size - intersection);
}

function sharedCount(left: normalized_trait_index, right: normalized_trait_index): number {
  const [smaller, larger] = left.all.size <= right.all.size
    ? [left.all, right.all]
    : [right.all, left.all];
  let shared = 0;
  for (const value of smaller) {
    if (larger.has(value)) shared += 1;
  }
  return shared;
}

function scoreFamilyCandidateFromIndex(
  policyDomain: string,
  billTraits: normalized_trait_index,
  family: CivicGenomeFamily,
): FamilySimilarityBreakdown {
  const family_traits = indexConfirmedTraits(family.confirmedTraits);
  const scoreFor = (classes: readonly string[]) => {
    const family_set = normalizedSet(family_traits, classes);
    if (family_set.size === 0) return 0;
    return jaccard(normalizedSet(billTraits, classes), family_set);
  };
  const breakdown = {
    policyDomainSimilarity: policyDomain === family.policyDomain ? 1 : 0,
    actorSimilarity: scoreFor(["actor"]),
    workflowSimilarity: scoreFor(["workflow", "deadline"]),
    accountabilitySimilarity: scoreFor(["accountability", "enforcement"]),
    eligibilitySimilarity: scoreFor(["eligibility", "help", "restriction", "right"]),
    definitionSimilarity: scoreFor(["definition"]),
  };
  const weightedScore = Object.entries(FAMILY_WEIGHTS).reduce(
    (sum, [key, weight]) => sum + breakdown[key as keyof typeof breakdown] * weight,
    0,
  );
  return {
    ...breakdown,
    weightedScore: clamp(weightedScore),
    sharedConfirmedTraitCount: sharedCount(billTraits, family_traits),
  };
}

export function scoreFamilyCandidate(
  policyDomain: string,
  billTraits: CivicGenomeTrait[],
  family: CivicGenomeFamily
): FamilySimilarityBreakdown {
  return scoreFamilyCandidateFromIndex(
    policyDomain,
    indexConfirmedTraits(billTraits),
    family,
  );
}

export function resolveFamily(
  policyDomain: string,
  traits: CivicGenomeTrait[],
  families: CivicGenomeFamily[],
  threshold = 0.7,
  minimumSharedConfirmedTraits = 3
): FamilyResolution {
  if (families.length === 0) {
    return { state: "unresolved_family_candidate", reason: "no_candidates", bestCandidateFamilyId: null, score: 0, breakdown: null };
  }
  // A single bill can accumulate thousands of confirmed traits across many
  // extraction runs. Build its normalized index once per resolution instead
  // of rescanning and JSON-stringifying it for every candidate family.
  const bill_trait_index = indexConfirmedTraits(traits);
  const ranked = families
    .map((family) => ({
      family,
      breakdown: scoreFamilyCandidateFromIndex(policyDomain, bill_trait_index, family),
    }))
    .sort((a, b) => b.breakdown.weightedScore - a.breakdown.weightedScore || a.family.familyId.localeCompare(b.family.familyId));
  const best = ranked[0];
  const contradiction = (best.family.hardContradictionKeys ?? []).some((key) => traits.some((trait) => trait.traitKey === key && trait.signalStatus === "confirmed"));
  if (contradiction) {
    return { state: "unresolved_family_candidate", reason: "hard_contradiction", bestCandidateFamilyId: best.family.familyId, score: best.breakdown.weightedScore, breakdown: best.breakdown };
  }
  if (best.breakdown.sharedConfirmedTraitCount < minimumSharedConfirmedTraits) {
    return { state: "unresolved_family_candidate", reason: "insufficient_confirmed_traits", bestCandidateFamilyId: best.family.familyId, score: best.breakdown.weightedScore, breakdown: best.breakdown };
  }
  if (best.breakdown.weightedScore < threshold) {
    return { state: "unresolved_family_candidate", reason: "below_threshold", bestCandidateFamilyId: best.family.familyId, score: best.breakdown.weightedScore, breakdown: best.breakdown };
  }
  return {
    state: "assigned",
    familyId: best.family.familyId,
    score: best.breakdown.weightedScore,
    breakdown: best.breakdown,
    competingFamilyIds: ranked.slice(1).filter((candidate) => candidate.breakdown.weightedScore >= threshold).map((candidate) => candidate.family.familyId),
  };
}

function evidenceForTraits(traits: CivicGenomeTrait[]) {
  return traits.map((trait) => ({ sourceType: trait.sourceObjectType, sourceId: trait.sourceObjectId, ...(trait.sourceBlockId ? { sourceBlockId: trait.sourceBlockId } : {}) }));
}

export function deriveLineageEdges(current: GenomeBillCandidate, candidates: GenomeBillCandidate[]): BillLineageEdge[] {
  const edges: BillLineageEdge[] = [];
  for (const candidate of candidates.filter((item) => item.genomeBillId !== current.genomeBillId)) {
    const shared = current.traits.filter((trait) => candidate.traits.some((other) => other.traitKey === trait.traitKey && stableStringify(other.normalizedValue) === stableStringify(trait.normalizedValue)));
    const similarity = shared.length / Math.max(1, new Set([...current.traits, ...candidate.traits].map((trait) => `${trait.traitKey}:${stableStringify(trait.normalizedValue)}`)).size);
    if (similarity < 0.35) continue;
    const currentDate = current.introducedAt ? Date.parse(current.introducedAt) : Number.NaN;
    const candidateDate = candidate.introducedAt ? Date.parse(candidate.introducedAt) : Number.NaN;
    const predecessor = Number.isFinite(currentDate) && Number.isFinite(candidateDate) && candidateDate <= currentDate;
    const changedClasses = new Set(current.traits.filter((trait) => candidate.traits.some((other) => other.traitClass === trait.traitClass && other.traitKey === trait.traitKey && stableStringify(other.normalizedValue) !== stableStringify(trait.normalizedValue))).map((trait) => trait.traitClass));
    const types: BillLineageEdge["relationshipType"][] = similarity >= 0.9 ? ["duplicates"] : predecessor ? ["inherits"] : ["references"];
    if (changedClasses.size > 0) types.push("modifies");
    if ([...changedClasses].some((value) => value === "accountability" || value === "enforcement" || value === "eligibility" || value === "definition")) types.push("diverges_from");
    for (const relationshipType of [...new Set(types)]) {
      const payload = { fromGenomeBillId: current.genomeBillId, toGenomeBillId: candidate.genomeBillId, relationshipType, shared: shared.map((trait) => trait.traitFingerprint) };
      const lineageFingerprint = hashValue(payload);
      edges.push({
        lineageEdgeId: `lineage_${lineageFingerprint.slice(0, 24)}`,
        fromGenomeBillId: current.genomeBillId,
        toGenomeBillId: candidate.genomeBillId,
        relationshipType,
        confidence: clamp(similarity),
        strength: clamp(similarity),
        evidenceRefs: evidenceForTraits(shared),
        lineageFingerprint,
      });
    }
  }
  return edges.sort((a, b) => a.lineageFingerprint.localeCompare(b.lineageFingerprint));
}

function relationshipFromLineage(edge: BillLineageEdge): CivicGenomeRelationship {
  const relationshipFingerprint = hashValue({ source: edge.fromGenomeBillId, target: edge.toGenomeBillId, type: edge.relationshipType, evidence: edge.evidenceRefs });
  return {
    relationshipId: `relationship_${relationshipFingerprint.slice(0, 24)}`,
    sourceEntityType: "bill",
    sourceEntityId: edge.fromGenomeBillId,
    targetEntityType: "bill",
    targetEntityId: edge.toGenomeBillId,
    relationshipType: edge.relationshipType,
    direction: "uni",
    supportCount: edge.evidenceRefs.length,
    confidence: edge.confidence,
    strength: edge.strength,
    validationState: edge.confidence >= 0.8 && edge.evidenceRefs.length >= 3 ? "validated" : "observed",
    evidenceRefs: edge.evidenceRefs,
    relationshipFingerprint,
  };
}

function event(genomeBillId: string, familyId: string | null, eventType: CivicGenomeEvent["eventType"], priorState: unknown, nextState: unknown, occurredAt: string, evidenceRefs: CivicGenomeEvent["evidenceRefs"]): CivicGenomeEvent {
  const eventFingerprint = hashValue({ genomeBillId, familyId, eventType, priorState, nextState, occurredAt, evidenceRefs });
  return { eventId: `event_${eventFingerprint.slice(0, 24)}`, genomeBillId, familyId, eventType, occurredAt, priorState, nextState, evidenceRefs, eventFingerprint };
}

export function generateEvents(input: GenomeAssemblyInput, traits: CivicGenomeTrait[], familyResolution: FamilyResolution, lineageEdges: BillLineageEdge[]): CivicGenomeEvent[] {
  const occurredAt = input.observedAt ?? input.canonicalBill.genomeBill.lastObservedAt;
  const familyId = familyResolution.state === "assigned" ? familyResolution.familyId : null;
  const prior = input.priorGenomeState;
  if (!prior) {
    return [
      event(input.genomeBillId, familyId, "bill_observed", null, input.canonicalBill, occurredAt, [{ sourceType: "document", sourceId: input.canonicalBill.genomeBill.sourceDocumentId }]),
      event(input.genomeBillId, familyId, "extraction_completed", null, { traitCount: traits.length }, occurredAt, evidenceForTraits(traits)),
      ...traits.map((trait) => event(input.genomeBillId, familyId, "trait_added", null, trait, occurredAt, evidenceForTraits([trait]))),
      ...lineageEdges.map((edge) => event(input.genomeBillId, familyId, "lineage_edge_added", null, edge, occurredAt, edge.evidenceRefs)),
      ...(familyId ? [event(input.genomeBillId, familyId, "family_assigned", null, familyResolution, occurredAt, evidenceForTraits(traits))] : []),
    ];
  }
  const events: CivicGenomeEvent[] = [];
  const priorTraits = new Map(prior.traits.map((trait) => [trait.traitFingerprint, trait]));
  const nextTraits = new Map(traits.map((trait) => [trait.traitFingerprint, trait]));
  for (const trait of traits) if (!priorTraits.has(trait.traitFingerprint)) events.push(event(input.genomeBillId, familyId, "trait_added", null, trait, occurredAt, evidenceForTraits([trait])));
  for (const trait of prior.traits) if (!nextTraits.has(trait.traitFingerprint)) events.push(event(input.genomeBillId, familyId, "trait_removed", trait, null, occurredAt, evidenceForTraits([trait])));
  const priorFamily = prior.familyResolution?.state === "assigned" ? prior.familyResolution.familyId : null;
  if (priorFamily !== familyId) events.push(event(input.genomeBillId, familyId, priorFamily ? "family_reassigned" : "family_assigned", priorFamily, familyId, occurredAt, evidenceForTraits(traits)));
  const priorEdges = new Map(prior.lineageEdges.map((edge) => [edge.lineageFingerprint, edge]));
  const nextEdges = new Map(lineageEdges.map((edge) => [edge.lineageFingerprint, edge]));
  for (const edge of lineageEdges) if (!priorEdges.has(edge.lineageFingerprint)) events.push(event(input.genomeBillId, familyId, "lineage_edge_added", null, edge, occurredAt, edge.evidenceRefs));
  for (const edge of prior.lineageEdges) if (!nextEdges.has(edge.lineageFingerprint)) events.push(event(input.genomeBillId, familyId, "lineage_edge_removed", edge, null, occurredAt, edge.evidenceRefs));
  if (prior.canonicalBill?.sourceHash && prior.canonicalBill.sourceHash !== input.canonicalBill.sourceHash) events.push(event(input.genomeBillId, familyId, "source_changed", prior.canonicalBill.sourceHash, input.canonicalBill.sourceHash, occurredAt, [{ sourceType: "document", sourceId: input.canonicalBill.genomeBill.sourceDocumentId }]));
  if (prior.canonicalBill?.status !== input.canonicalBill.status) events.push(event(input.genomeBillId, familyId, "status_changed", prior.canonicalBill?.status ?? null, input.canonicalBill.status, occurredAt, []));
  return events.sort((a, b) => a.eventFingerprint.localeCompare(b.eventFingerprint));
}

function momentumInputs(input: GenomeAssemblyInput, familyResolution: FamilyResolution): MomentumInput[] {
  if (familyResolution.state !== "assigned") return [];
  return [{
    familyId: familyResolution.familyId,
    dimension: "family_growth",
    value: 1,
    evidenceRefs: [{ sourceType: "bill", sourceId: input.genomeBillId }],
  }];
}

function absences(input: GenomeAssemblyInput): MissingDimension[] {
  const missing: MissingDimension[] = [];
  for (const layer of ["help", "workflow", "accountability", "override", "definition"] as const) {
    if ((input.rosettaLawView.coverage[layer] ?? 0) <= 0) missing.push({ dimension: `rosetta_layer:${layer}`, reason: "No verified Rosetta coverage", requiredForValidity: false });
  }
  if (!input.canonicalBill.introducedAt) missing.push({ dimension: "introduced_at", reason: "Lineage chronology is incomplete", requiredForValidity: false });
  return missing;
}

export function assembleCivicGenome(input: GenomeAssemblyInput): GenomeAssemblyResult {
  const inputHash = hashValue(input);
  const traits = adaptRosettaToGenomeTraits(input.genomeBillId, input.rosettaLawView.objects);
  const familyResolution = resolveFamily(input.canonicalBill.policyDomain, traits, input.candidateFamilies, input.familyThreshold, input.minimumSharedConfirmedTraits);
  const currentCandidate: GenomeBillCandidate = {
    genomeBillId: input.genomeBillId,
    canonicalBillId: input.canonicalBill.genomeBill.canonicalBillId,
    jurisdictionId: input.canonicalBill.genomeBill.jurisdictionId,
    introducedAt: input.canonicalBill.introducedAt,
    traits,
    familyId: familyResolution.state === "assigned" ? familyResolution.familyId : null,
  };
  const lineageEdges = deriveLineageEdges(currentCandidate, input.candidateRelatedBills);
  const relationships = lineageEdges.map(relationshipFromLineage);
  const events = generateEvents(input, traits, familyResolution, lineageEdges);
  const missing = absences(input);
  const checks: Record<string, boolean> = {
    deterministicInput: inputHash === hashValue(input),
    genomeBillIdentityMatch: input.genomeBillId === input.canonicalBill.genomeBill.genomeBillId,
    sourceHashMatch: input.canonicalBill.sourceHash === input.canonicalBill.genomeBill.sourceVersionHash,
    provenancePresent: input.rosettaLawView.provenanceState !== "failed" && traits.every((trait) => Boolean(trait.sourceObjectId && trait.extractionRunId)),
    confidenceRangesValid: traits.every((trait) => trait.confidence >= 0 && trait.confidence <= 1) && relationships.every((relationship) => relationship.confidence >= 0 && relationship.confidence <= 1 && relationship.strength >= 0 && relationship.strength <= 1),
    evidenceBackedRelationships: relationships.every((relationship) => relationship.supportCount > 0 && relationship.evidenceRefs.length === relationship.supportCount),
    fingerprintsUnique: new Set(traits.map((trait) => trait.traitFingerprint)).size === traits.length && new Set(relationships.map((relationship) => relationship.relationshipFingerprint)).size === relationships.length,
    methodologyVersionPresent: input.methodologyVersion.trim().length > 0,
  };
  const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  if (failedChecks.length > 0) return { isValid: false, error: "GENOME_ASSEMBLY_VERIFICATION_FAILED", failedChecks, inputHash };
  const coverageValues = ["help", "workflow", "accountability", "override", "definition"].map((layer) => clamp(input.rosettaLawView.coverage[layer as keyof typeof input.rosettaLawView.coverage] ?? 0));
  const coverage = coverageValues.reduce((sum, value) => sum + value, 0) / coverageValues.length;
  const data = { traits, relationships, familyResolution, lineageEdges, events, momentumInputs: momentumInputs(input, familyResolution), absences: missing };
  const outputHash = hashValue({ data, inputHash, methodologyVersion: input.methodologyVersion });
  return {
    isValid: true,
    data,
    verification: {
      status: coverage === 1 && input.rosettaLawView.provenanceState === "complete" ? "valid" : "partial",
      inputHash,
      outputHash,
      checks,
      failedChecks: [],
      coverage,
      methodologyVersion: input.methodologyVersion,
    },
  };
}

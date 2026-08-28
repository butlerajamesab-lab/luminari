import { describe, expect, it } from "vitest";
import type { CivicGenomeFamily, CivicGenomeTrait, GenomeAssemblyInput, GenomeBillCandidate } from "./assembly-contract";
import {
  adaptRosettaToGenomeTraits,
  assembleCivicGenome,
  deriveLineageEdges,
  hashValue,
  resolveFamily,
} from "./assembly-engine";

function makeInput(): GenomeAssemblyInput {
  const sourceVersionHash = hashValue({ bill: "WA-HB-1000", version: 1 });
  return {
    genomeBillId: "genome_bill_wa_hb_1000",
    canonicalBill: {
      genomeBill: {
        genomeBillId: "genome_bill_wa_hb_1000",
        canonicalBillId: "canonical_bill_wa_hb_1000",
        jurisdictionId: "us-wa",
        legislativeSessionId: "wa-2026",
        sourceDocumentId: "document_wa_hb_1000",
        sourceVersionHash,
        latestExtractionRunId: "run_1",
        status: "decomposed",
        firstObservedAt: "2026-01-10T00:00:00.000Z",
        lastObservedAt: "2026-01-12T00:00:00.000Z",
        provenanceState: "complete",
      },
      policyDomain: "housing",
      status: "introduced",
      introducedAt: "2026-01-10T00:00:00.000Z",
      lastActionAt: "2026-01-12T00:00:00.000Z",
      sourceHash: sourceVersionHash,
    },
    rosettaLawView: {
      provenanceState: "complete",
      coverage: { help: 1, workflow: 1, accountability: 1, override: 1, definition: 1 },
      objects: [
        object("help", "benefit", "rental assistance", "block_1"),
        object("workflow", "application_path", ["tenant", "agency"], "block_2"),
        object("accountability", "review_actor", "housing agency", "block_3"),
        object("override", "preemption", false, "block_4"),
        object("definition", "eligible_household", "income below 80% AMI", "block_5"),
      ],
    },
    candidateFamilies: [],
    candidateRelatedBills: [],
    methodologyVersion: "living-civic-genome-assembly-v1",
    observedAt: "2026-01-12T00:00:00.000Z",
  };
}

function object(layer: "help" | "workflow" | "accountability" | "override" | "definition", key: string, normalizedValue: unknown, sourceBlockId: string) {
  return {
    layer,
    key,
    normalizedValue,
    sourceObjectType: "rosetta_law_object",
    sourceObjectId: `${layer}_${key}`,
    sourceBlockId,
    extractionRunId: "run_1",
    confidence: 0.95,
    confirmed: true,
  } as const;
}

function familyFromTraits(traits: CivicGenomeTrait[]): CivicGenomeFamily {
  return {
    familyId: "family_housing_assistance",
    familyKey: "housing_assistance",
    policyDomain: "housing",
    confirmedTraits: traits,
  };
}

describe("Civic Genome assembly engine", () => {
  it("creates deterministic provenance-backed traits", () => {
    const input = makeInput();
    const first = adaptRosettaToGenomeTraits(input.genomeBillId, input.rosettaLawView.objects);
    const second = adaptRosettaToGenomeTraits(input.genomeBillId, [...input.rosettaLawView.objects].reverse());
    expect(first).toEqual(second);
    expect(first).toHaveLength(5);
    expect(first.every((trait) => trait.sourceBlockId && trait.extractionRunId === "run_1")).toBe(true);
    expect(new Set(first.map((trait) => trait.traitFingerprint)).size).toBe(first.length);
  });

  it("returns an explicit unresolved state when support is insufficient", () => {
    const input = makeInput();
    const traits = adaptRosettaToGenomeTraits(input.genomeBillId, input.rosettaLawView.objects);
    const resolution = resolveFamily("housing", traits.slice(0, 1), [familyFromTraits(traits)], 0.7, 3);
    expect(resolution.state).toBe("unresolved_family_candidate");
    if (resolution.state === "unresolved_family_candidate") {
      expect(resolution.reason).toBe("insufficient_confirmed_traits");
    }
  });

  it("assigns a family only after threshold and support gates pass", () => {
    const input = makeInput();
    const traits = adaptRosettaToGenomeTraits(input.genomeBillId, input.rosettaLawView.objects);
    const resolution = resolveFamily("housing", traits, [familyFromTraits(traits)], 0.7, 3);
    expect(resolution.state).toBe("assigned");
    if (resolution.state === "assigned") expect(resolution.score).toBeCloseTo(0.8);
  });

  it("normalizes a large bill trait once across the candidate universe", () => {
    let normalized_value_reads = 0;
    const normalized_value = {
      get agency() {
        normalized_value_reads += 1;
        return "housing";
      },
    };
    const adapted_source = adaptRosettaToGenomeTraits(
      "genome_bill_large",
      [object("accountability", "review_actor", normalized_value, "block_large")],
    )[0];
    const source = { ...adapted_source, normalizedValue: normalized_value };
    normalized_value_reads = 0;
    const empty_candidates = Array.from({ length: 500 }, (_, index) => ({
      familyId: `family_${String(index).padStart(3, "0")}`,
      familyKey: `family_${index}`,
      policyDomain: "housing",
      confirmedTraits: [],
    }));

    const resolution = resolveFamily("housing", [source], empty_candidates, 0.7, 3);

    expect(resolution.state).toBe("unresolved_family_candidate");
    expect(normalized_value_reads).toBe(1);
  });

  it("derives multiple lineage edges instead of a single parent pointer", () => {
    const input = makeInput();
    const currentTraits = adaptRosettaToGenomeTraits(input.genomeBillId, input.rosettaLawView.objects);
    const priorObjects = input.rosettaLawView.objects.map((item) =>
      item.layer === "accountability" ? { ...item, normalizedValue: "court" } : item
    );
    const priorTraits = adaptRosettaToGenomeTraits("genome_bill_or_hb_20", priorObjects);
    const current: GenomeBillCandidate = {
      genomeBillId: input.genomeBillId,
      canonicalBillId: input.canonicalBill.genomeBill.canonicalBillId,
      jurisdictionId: "us-wa",
      introducedAt: "2026-01-10T00:00:00.000Z",
      traits: currentTraits,
    };
    const prior: GenomeBillCandidate = {
      genomeBillId: "genome_bill_or_hb_20",
      canonicalBillId: "canonical_bill_or_hb_20",
      jurisdictionId: "us-or",
      introducedAt: "2025-01-10T00:00:00.000Z",
      traits: priorTraits,
    };
    const edges = deriveLineageEdges(current, [prior]);
    expect(edges.map((edge) => edge.relationshipType)).toContain("inherits");
    expect(edges.map((edge) => edge.relationshipType)).toContain("modifies");
    expect(edges.map((edge) => edge.relationshipType)).toContain("diverges_from");
    expect(edges.every((edge) => edge.evidenceRefs.length > 0)).toBe(true);
  });

  it("assembles a verified result and emits immutable initial events", () => {
    const input = makeInput();
    const traits = adaptRosettaToGenomeTraits(input.genomeBillId, input.rosettaLawView.objects);
    input.candidateFamilies = [familyFromTraits(traits)];
    const first = assembleCivicGenome(input);
    const second = assembleCivicGenome(input);
    expect(first).toEqual(second);
    expect(first.isValid).toBe(true);
    if (first.isValid) {
      expect(first.verification.status).toBe("valid");
      expect(first.verification.coverage).toBe(1);
      expect(first.data.familyResolution.state).toBe("assigned");
      expect(first.data.events.some((event) => event.eventType === "bill_observed")).toBe(true);
      expect(first.data.events.filter((event) => event.eventType === "trait_added")).toHaveLength(5);
    }
  });

  it("does not release derived data when verification fails", () => {
    const input = makeInput();
    input.canonicalBill.sourceHash = "mismatched_source_hash";
    const result = assembleCivicGenome(input);
    expect(result).toEqual({
      isValid: false,
      error: "GENOME_ASSEMBLY_VERIFICATION_FAILED",
      failedChecks: ["sourceHashMatch"],
      inputHash: hashValue(input),
    });
    expect("data" in result).toBe(false);
  });
});

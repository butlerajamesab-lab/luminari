import { describe, expect, it } from "vitest";
import type { VerifiedGenomeAssemblyResult } from "./assembly-contract";
import { planGenomePersistence } from "./persistence-planner";

function verifiedResult(familyAssigned: boolean): VerifiedGenomeAssemblyResult {
  return {
    isValid: true,
    data: {
      traits: [{
        traitId: "trait_1",
        genomeBillId: "genome_bill_1",
        traitClass: "workflow",
        traitKey: "application_path",
        normalizedValue: ["resident", "agency"],
        sourceObjectType: "rosetta_law_object",
        sourceObjectId: "object_1",
        sourceBlockId: "block_1",
        extractionRunId: "run_1",
        confidence: 0.95,
        signalStatus: "confirmed",
        traitFingerprint: "fingerprint_1",
      }],
      relationships: [],
      familyResolution: familyAssigned
        ? {
            state: "assigned",
            familyId: "family_1",
            score: 0.91,
            competingFamilyIds: [],
            breakdown: {
              policyDomainSimilarity: 1,
              actorSimilarity: 0.8,
              workflowSimilarity: 1,
              accountabilitySimilarity: 0.8,
              eligibilitySimilarity: 0.7,
              definitionSimilarity: 0.7,
              weightedScore: 0.91,
              sharedConfirmedTraitCount: 4,
            },
          }
        : {
            state: "unresolved_family_candidate",
            reason: "below_threshold",
            bestCandidateFamilyId: "family_1",
            score: 0.52,
            breakdown: null,
          },
      lineageEdges: [],
      events: [{
        eventId: "event_1",
        genomeBillId: "genome_bill_1",
        familyId: familyAssigned ? "family_1" : null,
        eventType: "bill_observed",
        occurredAt: "2026-07-18T00:00:00.000Z",
        priorState: null,
        nextState: { status: "observed" },
        evidenceRefs: [{ sourceType: "document", sourceId: "document_1" }],
        eventFingerprint: "event_fingerprint_1",
      }],
      momentumInputs: [],
      absences: [],
    },
    verification: {
      status: "valid",
      inputHash: "input_hash",
      outputHash: "output_hash",
      checks: { provenancePresent: true },
      failedChecks: [],
      coverage: 1,
      methodologyVersion: "living-civic-genome-assembly-v1",
    },
  };
}

const context = {
  billId: "bill_1",
  stateCode: "WA",
  sessionKey: "wa-2026",
  sourceBillNumber: "HB 1000",
  rosettaExtractionRunId: "run_1",
};

describe("Civic Genome persistence planner", () => {
  it("refuses to hide unresolved family state behind a mandatory family id", () => {
    const plan = planGenomePersistence(verifiedResult(false), context);
    expect(plan.canPersistLosslessly).toBe(false);
    expect(plan.blockers.map((blocker) => blocker.code)).toContain("UNRESOLVED_FAMILY_NOT_REPRESENTABLE");
    expect(plan.blockers.map((blocker) => blocker.code)).toContain("EVENT_REQUIRES_FAMILY");
    expect(plan.projections).toHaveLength(0);
  });

  it("reports the missing normalized trait destination even for assigned bills", () => {
    const plan = planGenomePersistence(verifiedResult(true), context);
    expect(plan.canPersistLosslessly).toBe(false);
    expect(plan.blockers.map((blocker) => blocker.code)).toContain("TRAIT_DESTINATION_MISSING");
    expect(plan.projections).toHaveLength(1);
    expect(plan.projections[0]).toMatchObject({
      table: "civic_genome_bill",
      operation: "upsert",
      lossy: true,
    });
    expect(plan.projections[0].rows[0]).toMatchObject({
      genome_bill_id: "genome_bill_1",
      family_id: "family_1",
      bill_id: "bill_1",
      structural_dna_hash: "output_hash",
    });
  });

  it("never performs a database write", () => {
    const source = planGenomePersistence.toString();
    expect(source).not.toContain("pool.query");
    expect(source).not.toContain("insert into");
    expect(source).not.toContain("update civic_genome");
  });
});

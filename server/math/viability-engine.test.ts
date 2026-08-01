import { describe, expect, it } from "vitest";
import { computeSOL, scoreViability, type ClaimDefinition, type ElementEvaluation } from "./viability-engine";

const CLAIM: ClaimDefinition = {
  claim_type: "governed_claim",
  jurisdiction: "WA",
  source_id: "rosetta-claim-1",
  rule_manifest_hash: "r".repeat(64),
  statute_of_limitations_days: 300,
  elements: [
    { id: "e1", name: "Element one", description: "", mandatory: true, weight: 0.6 },
    { id: "e2", name: "Element two", description: "", mandatory: false, weight: 0.4 },
  ],
};
const evaluation = (element_id: string, status: ElementEvaluation["status"]): ElementEvaluation => ({
  element_id,
  status,
  prism_verification_id: `prism-${element_id}`,
  rule_manifest_hash: "p".repeat(64),
  source_evidence_ids: status === "satisfied" ? [`ev-${element_id}`] : [],
});
const INPUT = { incident_date: 1_700_000_000_000, filing_date: 1_700_100_000_000, as_of: 1_700_100_000_000 };

describe("governed element aggregation", () => {
  it("rejects zero-element claims instead of returning a neutral score", () => {
    expect(() => scoreViability({ claim: { ...CLAIM, elements: [] }, evaluations: [], ...INPUT })).toThrow("at least one governed element");
  });
  it("does not accept raw unverified evidence as element satisfaction", () => {
    expect(() => scoreViability({ claim: CLAIM, evaluations: [{ ...evaluation("e1", "satisfied"), source_evidence_ids: [] }], ...INPUT })).toThrow("requires source evidence");
  });
  it("returns unresolved when a mandatory evaluation is absent", () => {
    const result = scoreViability({ claim: CLAIM, evaluations: [evaluation("e2", "satisfied")], ...INPUT });
    expect(result.status).toBe("unresolved");
    expect(result.completeness_score).toBeNull();
    expect(result.mandatory_elements_met).toBeNull();
  });
  it("blocks on unsatisfied mandatory element", () => {
    const result = scoreViability({ claim: CLAIM, evaluations: [evaluation("e1", "unsatisfied"), evaluation("e2", "satisfied")], ...INPUT });
    expect(result.status).toBe("blocked");
    expect(result.completeness_score).toBe(0);
  });
  it("computes only weighted completeness when all evaluations are resolved", () => {
    const result = scoreViability({ claim: CLAIM, evaluations: [evaluation("e1", "satisfied"), evaluation("e2", "unsatisfied")], ...INPUT });
    expect(result.status).toBe("supported");
    expect(result.weighted_completeness).toBe(0.6);
    expect(result.completeness_score).toBe(6);
  });
  it("passes through governed source and rule identity", () => {
    const result = scoreViability({ claim: CLAIM, evaluations: [evaluation("e1", "satisfied"), evaluation("e2", "satisfied")], ...INPUT });
    expect(result.source_claim_id).toBe(CLAIM.source_id);
    expect(result.rule_manifest_hash).toBe(CLAIM.rule_manifest_hash);
  });
});

describe("SOL separation", () => {
  it("keeps SOL unresolved when governed inputs are missing", () => {
    expect(computeSOL(null, INPUT.filing_date, 300).status).toBe("unresolved");
  });
  it("computes resolved date arithmetic without blending it into completeness", () => {
    expect(computeSOL(INPUT.incident_date, INPUT.filing_date, 300).status).toBe("resolved");
  });
});

describe("determinism", () => {
  it("replays identically 100 times", () => {
    const input = { claim: CLAIM, evaluations: [evaluation("e1", "satisfied"), evaluation("e2", "satisfied")], ...INPUT };
    const first = scoreViability(input);
    for (let i = 0; i < 100; i++) expect(scoreViability(input)).toEqual(first);
  });
});

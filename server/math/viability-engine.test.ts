/**
 * VIABILITY ENGINE v2.0.0 — Test Suite
 *
 * Test categories:
 *   1. Element satisfaction with 0.6 threshold
 *   2. Mandatory element blocking
 *   3. Weighted completeness math
 *   4. SOL computation
 *   5. Evidence gap analysis
 *   6. Claim comparison ordering
 *   7. Determinism replay
 *   8. Source traceability
 */
import { describe, expect, it } from "vitest";
import {
  scoreViability,
  computeSOL,
  compareClaimViability,
  identifyEvidenceGaps,
  SATISFACTION_THRESHOLD,
  type ClaimDefinition,
  type EvidenceItem,
  type ViabilityInput,
} from "./viability-engine";

// ============================================================
// FIXTURES
// ============================================================

const CLAIM: ClaimDefinition = {
  claim_type: "Title_VII_discrimination",
  jurisdiction: "WA",
  elements: [
    { id: "e1", name: "Protected class membership", description: "Plaintiff is member of protected class", mandatory: true, weight: 0.3 },
    { id: "e2", name: "Adverse action", description: "Employer took adverse action", mandatory: true, weight: 0.3 },
    { id: "e3", name: "Causal connection", description: "Connection between protected status and action", mandatory: true, weight: 0.25 },
    { id: "e4", name: "Damages", description: "Plaintiff suffered damages", mandatory: false, weight: 0.15 },
  ],
  statute_of_limitations_days: 300,
  source_id: "rosetta-title-vii-wa-001",
};

const STRONG_EVIDENCE: EvidenceItem[] = [
  { id: "ev1", element_id: "e1", strength: 0.9, source_verified: true, document_type: "record" },
  { id: "ev2", element_id: "e2", strength: 0.85, source_verified: true, document_type: "document" },
  { id: "ev3", element_id: "e3", strength: 0.7, source_verified: true, document_type: "testimony" },
  { id: "ev4", element_id: "e4", strength: 0.8, source_verified: false, document_type: "correspondence" },
];

const INCIDENT_DATE = 1_700_000_000_000;
const FILING_DATE = INCIDENT_DATE + 100 * 86_400_000; // 100 days later

// ============================================================
// 1. ELEMENT SATISFACTION WITH 0.6 THRESHOLD
// ============================================================

describe("Element satisfaction threshold", () => {
  it("Satisfaction threshold is 0.6", () => {
    expect(SATISFACTION_THRESHOLD).toBe(0.6);
  });

  it("Evidence at 0.6 satisfies element", () => {
    const evidence: EvidenceItem[] = [
      { id: "x1", element_id: "e1", strength: 0.6, source_verified: true, document_type: "record" },
    ];
    const result = scoreViability({ claim: CLAIM, evidence, incident_date: INCIDENT_DATE, filing_date: FILING_DATE });
    const e1 = result.element_satisfaction.find(e => e.element_id === "e1");
    expect(e1?.satisfied).toBe(true);
  });

  it("Evidence at 0.59 does NOT satisfy element", () => {
    const evidence: EvidenceItem[] = [
      { id: "x1", element_id: "e1", strength: 0.59, source_verified: true, document_type: "record" },
    ];
    const result = scoreViability({ claim: CLAIM, evidence, incident_date: INCIDENT_DATE, filing_date: FILING_DATE });
    const e1 = result.element_satisfaction.find(e => e.element_id === "e1");
    expect(e1?.satisfied).toBe(false);
  });

  it("No evidence → not satisfied", () => {
    const result = scoreViability({ claim: CLAIM, evidence: [], incident_date: INCIDENT_DATE, filing_date: FILING_DATE });
    expect(result.element_satisfaction.every(e => !e.satisfied)).toBe(true);
  });
});

// ============================================================
// 2. MANDATORY ELEMENT BLOCKING
// ============================================================

describe("Mandatory element blocking", () => {
  it("All mandatory satisfied → not blocked", () => {
    const result = scoreViability({ claim: CLAIM, evidence: STRONG_EVIDENCE, incident_date: INCIDENT_DATE, filing_date: FILING_DATE });
    expect(result.mandatory_elements_met).toBe(true);
    expect(result.blocking_elements).toHaveLength(0);
  });

  it("One mandatory unsatisfied → blocked", () => {
    const weakEvidence = STRONG_EVIDENCE.filter(e => e.element_id !== "e3");
    const result = scoreViability({ claim: CLAIM, evidence: weakEvidence, incident_date: INCIDENT_DATE, filing_date: FILING_DATE });
    expect(result.mandatory_elements_met).toBe(false);
    expect(result.blocking_elements).toContain("Causal connection");
  });

  it("Mandatory blocking reduces overall score", () => {
    const fullResult = scoreViability({ claim: CLAIM, evidence: STRONG_EVIDENCE, incident_date: INCIDENT_DATE, filing_date: FILING_DATE });
    const weakEvidence = STRONG_EVIDENCE.filter(e => e.element_id !== "e3");
    const blockedResult = scoreViability({ claim: CLAIM, evidence: weakEvidence, incident_date: INCIDENT_DATE, filing_date: FILING_DATE });
    expect(blockedResult.overall_score).toBeLessThan(fullResult.overall_score);
  });
});

// ============================================================
// 3. WEIGHTED COMPLETENESS
// ============================================================

describe("Weighted completeness", () => {
  it("All elements satisfied → weighted_completeness = 1.0", () => {
    const result = scoreViability({ claim: CLAIM, evidence: STRONG_EVIDENCE, incident_date: INCIDENT_DATE, filing_date: FILING_DATE });
    expect(result.weighted_completeness).toBe(1);
  });

  it("No elements satisfied → weighted_completeness = 0.0", () => {
    const result = scoreViability({ claim: CLAIM, evidence: [], incident_date: INCIDENT_DATE, filing_date: FILING_DATE });
    expect(result.weighted_completeness).toBe(0);
  });

  it("Partial satisfaction: only e1 (weight 0.3) satisfied", () => {
    const evidence: EvidenceItem[] = [
      { id: "x1", element_id: "e1", strength: 0.9, source_verified: true, document_type: "record" },
    ];
    const result = scoreViability({ claim: CLAIM, evidence, incident_date: INCIDENT_DATE, filing_date: FILING_DATE });
    expect(result.weighted_completeness).toBeCloseTo(0.3, 4);
  });

  it("Overall score formula: 10 × (0.5·wc + 0.3·mf + 0.2·sf)", () => {
    const result = scoreViability({ claim: CLAIM, evidence: STRONG_EVIDENCE, incident_date: INCIDENT_DATE, filing_date: FILING_DATE });
    const solStatus = computeSOL(INCIDENT_DATE, FILING_DATE, 300);
    const sf = 1 - solStatus.urgency * 0.5;
    const expected = 10 * (0.5 * 1.0 + 0.3 * 1.0 + 0.2 * sf);
    expect(result.overall_score).toBeCloseTo(expected, 2);
  });
});

// ============================================================
// 4. SOL COMPUTATION
// ============================================================

describe("SOL computation", () => {
  it("Within window → not expired", () => {
    const sol = computeSOL(INCIDENT_DATE, FILING_DATE, 300);
    expect(sol.expired).toBe(false);
    expect(sol.days_remaining).toBe(200);
  });

  it("Past window → expired", () => {
    const lateFiling = INCIDENT_DATE + 301 * 86_400_000;
    const sol = computeSOL(INCIDENT_DATE, lateFiling, 300);
    expect(sol.expired).toBe(true);
    expect(sol.days_remaining).toBe(0);
  });

  it("Urgency increases as deadline approaches", () => {
    const early = computeSOL(INCIDENT_DATE, INCIDENT_DATE + 50 * 86_400_000, 300);
    const late = computeSOL(INCIDENT_DATE, INCIDENT_DATE + 250 * 86_400_000, 300);
    expect(late.urgency).toBeGreaterThan(early.urgency);
  });

  it("Urgency at filing = incident → 0", () => {
    const sol = computeSOL(INCIDENT_DATE, INCIDENT_DATE, 300);
    expect(sol.urgency).toBeCloseTo(0, 4);
    expect(sol.days_remaining).toBe(300);
  });
});

// ============================================================
// 5. EVIDENCE GAP ANALYSIS
// ============================================================

describe("Evidence gap analysis", () => {
  it("No gaps when all elements satisfied", () => {
    const result = scoreViability({ claim: CLAIM, evidence: STRONG_EVIDENCE, incident_date: INCIDENT_DATE, filing_date: FILING_DATE });
    const gaps = identifyEvidenceGaps(result);
    expect(gaps.gaps).toHaveLength(0);
    expect(gaps.claim_salvageable).toBe(true);
  });

  it("Identifies missing evidence for unsatisfied elements", () => {
    const result = scoreViability({ claim: CLAIM, evidence: [], incident_date: INCIDENT_DATE, filing_date: FILING_DATE });
    const gaps = identifyEvidenceGaps(result);
    expect(gaps.gaps).toHaveLength(4);
  });

  it("Not salvageable when mandatory has zero evidence", () => {
    const evidence: EvidenceItem[] = [
      { id: "x1", element_id: "e1", strength: 0.9, source_verified: true, document_type: "record" },
    ];
    const result = scoreViability({ claim: CLAIM, evidence, incident_date: INCIDENT_DATE, filing_date: FILING_DATE });
    const gaps = identifyEvidenceGaps(result);
    expect(gaps.claim_salvageable).toBe(false);
  });
});

// ============================================================
// 6. CLAIM COMPARISON
// ============================================================

describe("Claim comparison", () => {
  it("Higher viability claims sort first", () => {
    const weakClaim: ClaimDefinition = {
      ...CLAIM,
      claim_type: "weak_claim",
      source_id: "test-weak",
      elements: [
        { id: "w1", name: "Hard element", description: "Very hard to prove", mandatory: true, weight: 1.0 },
      ],
    };
    const results = compareClaimViability([CLAIM, weakClaim], STRONG_EVIDENCE, INCIDENT_DATE, FILING_DATE);
    expect(results[0].claim_type).toBe("Title_VII_discrimination");
    expect(results[0].overall_score).toBeGreaterThan(results[1].overall_score);
  });
});

// ============================================================
// 7. DETERMINISM REPLAY
// ============================================================

describe("Viability determinism", () => {
  it("Same inputs produce identical outputs across 100 runs", () => {
    const input: ViabilityInput = { claim: CLAIM, evidence: STRONG_EVIDENCE, incident_date: INCIDENT_DATE, filing_date: FILING_DATE };
    const first = scoreViability(input);
    for (let i = 0; i < 100; i++) {
      expect(scoreViability(input)).toEqual(first);
    }
  });
});

// ============================================================
// 8. SOURCE TRACEABILITY
// ============================================================

describe("Source traceability", () => {
  it("source_claim_id passes through from claim definition", () => {
    const result = scoreViability({ claim: CLAIM, evidence: STRONG_EVIDENCE, incident_date: INCIDENT_DATE, filing_date: FILING_DATE });
    expect(result.source_claim_id).toBe("rosetta-title-vii-wa-001");
  });
});

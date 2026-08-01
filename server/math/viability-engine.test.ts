/**
 * VIABILITY ENGINE — Verification Tests
 * 
 * Verifies:
 * 1. Element satisfaction logic (binary per element)
 * 2. Mandatory element blocking
 * 3. Weighted completeness calculation
 * 4. Statute of limitations math
 * 5. Gap analysis
 * 6. Determinism
 */

import {
  scoreViability,
  computeSOL,
  compareClaimViability,
  identifyEvidenceGaps,
  type ClaimDefinition,
  type EvidenceItem,
  type ClaimInput,
} from "./viability-engine";

// ============================================================
// TEST HELPERS
// ============================================================

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function assertClose(actual: number, expected: number, tolerance: number, label: string): void {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(`${label}: expected ${expected} ± ${tolerance}, got ${actual} (diff=${diff})`);
  }
}

// ============================================================
// TEST DATA
// ============================================================

const titleVIIClaim: ClaimDefinition = {
  claim_type: "Title_VII_discrimination",
  jurisdiction: "federal",
  elements: [
    { id: "e1", name: "Protected class membership", description: "Plaintiff belongs to a protected class", mandatory: true, weight: 0.2 },
    { id: "e2", name: "Adverse employment action", description: "Plaintiff suffered adverse action", mandatory: true, weight: 0.3 },
    { id: "e3", name: "Causal connection", description: "Connection between protected class and adverse action", mandatory: true, weight: 0.3 },
    { id: "e4", name: "Similarly situated comparators", description: "Others outside class treated differently", mandatory: false, weight: 0.1 },
    { id: "e5", name: "Pretext evidence", description: "Employer's stated reason is pretextual", mandatory: false, weight: 0.1 },
  ],
  statute_of_limitations_days: 300, // EEOC charge filing deadline
};

const strongEvidence: EvidenceItem[] = [
  { id: "ev1", element_id: "e1", strength: 0.95, source_verified: true, document_type: "record" },
  { id: "ev2", element_id: "e2", strength: 0.9, source_verified: true, document_type: "document" },
  { id: "ev3", element_id: "e3", strength: 0.7, source_verified: true, document_type: "testimony" },
  { id: "ev4", element_id: "e4", strength: 0.6, source_verified: true, document_type: "record" },
  { id: "ev5", element_id: "e5", strength: 0.4, source_verified: false, document_type: "testimony" },
];

const now = Date.now();
const sixMonthsAgo = now - (180 * 86_400_000);

// ============================================================
// TESTS
// ============================================================

function testElementSatisfaction() {
  console.log("  [1] Element Satisfaction...");
  
  const result = scoreViability({
    claim: titleVIIClaim,
    evidence: strongEvidence,
    incident_date: sixMonthsAgo,
    filing_date: now,
  });
  
  // All elements should be satisfied (all have strength >= 0.3)
  assert(result.element_satisfaction.every(e => e.satisfied), "All elements satisfied with strong evidence");
  assert(result.mandatory_elements_met === true, "Mandatory elements met");
  assert(result.blocking_elements.length === 0, "No blocking elements");
  assert(result.completeness_ratio === 1.0, "100% completeness");
  
  console.log("    ✓ All elements satisfied, mandatory check passes");
}

function testMandatoryBlocking() {
  console.log("  [2] Mandatory Element Blocking...");
  
  // Remove evidence for mandatory element e3 (causal connection)
  const weakEvidence = strongEvidence.filter(e => e.element_id !== "e3");
  
  const result = scoreViability({
    claim: titleVIIClaim,
    evidence: weakEvidence,
    incident_date: sixMonthsAgo,
    filing_date: now,
  });
  
  assert(result.mandatory_elements_met === false, "Missing mandatory element blocks claim");
  assert(result.blocking_elements.includes("Causal connection"), "Identifies blocking element");
  assert(result.overall_score < 7, `Score should be reduced, got ${result.overall_score}`);
  
  console.log("    ✓ Missing mandatory element correctly blocks claim");
}

function testWeightedCompleteness() {
  console.log("  [3] Weighted Completeness...");
  
  // Only satisfy e1 (weight 0.2) and e2 (weight 0.3) = 0.5/1.0 = 50% weighted
  const partialEvidence: EvidenceItem[] = [
    { id: "ev1", element_id: "e1", strength: 0.9, source_verified: true, document_type: "record" },
    { id: "ev2", element_id: "e2", strength: 0.8, source_verified: true, document_type: "document" },
  ];
  
  const result = scoreViability({
    claim: titleVIIClaim,
    evidence: partialEvidence,
    incident_date: sixMonthsAgo,
    filing_date: now,
  });
  
  // Weighted: (0.2 + 0.3) / (0.2 + 0.3 + 0.3 + 0.1 + 0.1) = 0.5/1.0 = 0.5
  assertClose(result.weighted_completeness, 0.5, 0.0001, "Weighted completeness");
  // Ratio: 2/5 = 0.4
  assertClose(result.completeness_ratio, 0.4, 0.0001, "Completeness ratio");
  
  console.log("    ✓ Weighted completeness correct (0.5), ratio correct (0.4)");
}

function testStatuteOfLimitations() {
  console.log("  [4] Statute of Limitations...");
  
  // Not expired: 180 days elapsed of 300 day window
  const sol1 = computeSOL(sixMonthsAgo, now, 300);
  assert(sol1.expired === false, "Not expired at 180/300 days");
  assertClose(sol1.days_remaining, 120, 1, "120 days remaining");
  assertClose(sol1.urgency, 1 - 120/300, 0.01, "Urgency = 1 - remaining/total");
  
  // Expired: 400 days elapsed of 300 day window
  const longAgo = now - (400 * 86_400_000);
  const sol2 = computeSOL(longAgo, now, 300);
  assert(sol2.expired === true, "Expired at 400/300 days");
  assert(sol2.days_remaining === 0, "Zero days remaining when expired");
  
  // Just filed: 0 days elapsed
  const sol3 = computeSOL(now, now, 300);
  assert(sol3.expired === false, "Not expired on day 0");
  assertClose(sol3.days_remaining, 300, 1, "Full 300 days remaining");
  assertClose(sol3.urgency, 0, 0.01, "Zero urgency on day 0");
  
  console.log("    ✓ SOL math correct: expired, remaining, urgency");
}

function testOverallScoring() {
  console.log("  [5] Overall Score Calculation...");
  
  // Perfect case: all elements met, not expired, recent
  const perfect = scoreViability({
    claim: titleVIIClaim,
    evidence: strongEvidence,
    incident_date: sixMonthsAgo,
    filing_date: now,
  });
  
  // Overall = 10 × (0.5 × 1.0 + 0.3 × 1.0 + 0.2 × sol_factor)
  // sol_factor = 1 - urgency*0.5 = 1 - (180/300)*0.5 = 1 - 0.3 = 0.7
  // Overall = 10 × (0.5 + 0.3 + 0.14) = 10 × 0.94 = 9.4
  assert(perfect.overall_score > 9, `Perfect case should score > 9, got ${perfect.overall_score}`);
  assert(perfect.overall_score <= 10, "Score bounded at 10");
  
  // Expired SOL: score drops significantly
  const expired = scoreViability({
    claim: titleVIIClaim,
    evidence: strongEvidence,
    incident_date: now - (400 * 86_400_000),
    filing_date: now,
  });
  // sol_factor = 0 (expired)
  // Overall = 10 × (0.5 × 1.0 + 0.3 × 1.0 + 0.2 × 0) = 8.0
  assertClose(expired.overall_score, 8.0, 0.1, "Expired SOL score");
  
  console.log("    ✓ Overall scoring correct, SOL impact verified");
}

function testGapAnalysis() {
  console.log("  [6] Evidence Gap Analysis...");
  
  const weakEvidence: EvidenceItem[] = [
    { id: "ev1", element_id: "e1", strength: 0.9, source_verified: true, document_type: "record" },
    { id: "ev2", element_id: "e3", strength: 0.1, source_verified: false, document_type: "testimony" }, // below threshold
  ];
  
  const result = scoreViability({
    claim: titleVIIClaim,
    evidence: weakEvidence,
    incident_date: sixMonthsAgo,
    filing_date: now,
  });
  
  const gaps = identifyEvidenceGaps(result);
  
  // Should identify 4 gaps (e2, e3, e4, e5 — e3 has evidence but below threshold)
  assert(gaps.gaps.length === 4, `Should have 4 gaps, got ${gaps.gaps.length}`);
  
  // e3 has evidence but below threshold
  const e3Gap = gaps.gaps.find(g => g.element_name === "Causal connection");
  assert(e3Gap !== undefined, "e3 should be in gaps");
  assert(e3Gap!.current_strength === 0.1, "e3 strength should be 0.1");
  
  // Claim is salvageable if mandatory gaps have some evidence
  // e2 (mandatory) has NO evidence, so not salvageable
  assert(gaps.claim_salvageable === false, "Not salvageable with zero-evidence mandatory gap");
  
  console.log("    ✓ Gap analysis identifies missing elements and salvageability");
}

function testDeterminism() {
  console.log("  [7] Determinism...");
  
  const input: ClaimInput = {
    claim: titleVIIClaim,
    evidence: strongEvidence,
    incident_date: sixMonthsAgo,
    filing_date: now,
  };
  
  const r1 = scoreViability(input);
  const r2 = scoreViability(input);
  
  assert(r1.overall_score === r2.overall_score, "Same input → same score");
  assert(r1.mandatory_elements_met === r2.mandatory_elements_met, "Same input → same mandatory check");
  assert(r1.completeness_ratio === r2.completeness_ratio, "Same input → same completeness");
  
  console.log("    ✓ Deterministic: same input always produces same output");
}

function testClaimComparison() {
  console.log("  [8] Claim Comparison...");
  
  const fhaClam: ClaimDefinition = {
    claim_type: "Fair_Housing_Act",
    jurisdiction: "federal",
    elements: [
      { id: "f1", name: "Protected class", description: "", mandatory: true, weight: 0.3 },
      { id: "f2", name: "Housing denial", description: "", mandatory: true, weight: 0.4 },
      { id: "f3", name: "Discriminatory intent", description: "", mandatory: true, weight: 0.3 },
    ],
    statute_of_limitations_days: 365,
  };
  
  // Evidence only supports Title VII elements, not FHA
  const results = compareClaimViability(
    [titleVIIClaim, fhaClam],
    strongEvidence,
    sixMonthsAgo,
    now
  );
  
  assert(results.length === 2, "Both claims evaluated");
  assert(results[0].overall_score >= results[1].overall_score, "Sorted by score descending");
  assert(results[0].claim_type === "Title_VII_discrimination", "Title VII should score higher");
  
  console.log("    ✓ Comparison sorts by viability, correct claim wins");
}

// ============================================================
// RUN ALL TESTS
// ============================================================

console.log("\n═══════════════════════════════════════════════════");
console.log("  VIABILITY ENGINE — Verification Suite");
console.log("═══════════════════════════════════════════════════\n");

try {
  testElementSatisfaction();
  testMandatoryBlocking();
  testWeightedCompleteness();
  testStatuteOfLimitations();
  testOverallScoring();
  testGapAnalysis();
  testDeterminism();
  testClaimComparison();
  
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  ALL 8 TEST SUITES PASSED ✓");
  console.log("  Viability engine produces deterministic, correct results.");
  console.log("═══════════════════════════════════════════════════\n");
} catch (e: any) {
  console.error("\n✗ TEST FAILURE:", e.message);
  process.exit(1);
}

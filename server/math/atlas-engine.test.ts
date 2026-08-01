/**
 * ATLAS MATHEMATICAL ENGINE — Determinism Verification Tests
 * 
 * Each test verifies:
 * 1. Same input → same output (determinism)
 * 2. Output within declared bounds
 * 3. Mathematical correctness against hand-calculated values
 */

import {
  signalFingerprint,
  jaccardSimilarity,
  cosineSimilarity,
  precedenceScore,
  weightedConfidence,
  detectConvergence,
  temporalSimilarity,
  spatialSimilarity,
  jointSimilarity,
  priorityScore,
  urgencyFromDeadline,
  feasibilityScore,
  normalizeGeographicWeights,
  translateSignalConfidence,
  deduplicateSignals,
  type Signal,
  type ConvergenceInput,
  type PriorityInput,
} from "./atlas-engine";

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

const testSignal: Signal = {
  temporal_coordinate: 1700000000000,
  spatial_coordinate: "WA",
  signal_type: "SNAP_enrollment_drop",
  confidence: 0.85,
  characteristics: { agency: "DSHS", change_pct: -15, category: "benefits" },
};

// ============================================================
// 1. FINGERPRINTING TESTS
// ============================================================

function testFingerprinting() {
  console.log("  [1] Signal Fingerprinting...");
  
  // Determinism: same signal → same hash
  const h1 = signalFingerprint(testSignal);
  const h2 = signalFingerprint(testSignal);
  assert(h1 === h2, "Fingerprint must be deterministic");
  assert(h1.length === 64, "SHA-256 produces 64 hex chars");
  
  // Different signal → different hash
  const different: Signal = { ...testSignal, signal_type: "housing_complaint_spike" };
  const h3 = signalFingerprint(different);
  assert(h1 !== h3, "Different signals must produce different fingerprints");
  
  // Same time bucket → same hash regardless of exact timestamp
  const sameDay: Signal = { ...testSignal, temporal_coordinate: 1700000000000 + 3600000 }; // +1hr
  const h4 = signalFingerprint(sameDay);
  assert(h1 === h4, "Same day bucket → same fingerprint");
  
  // Different day → different hash
  const nextDay: Signal = { ...testSignal, temporal_coordinate: 1700000000000 + 86_400_001 };
  const h5 = signalFingerprint(nextDay);
  assert(h1 !== h5, "Different day bucket → different fingerprint");
  
  console.log("    ✓ Deterministic, 64-char hex, bucket-sensitive");
}

// ============================================================
// 2. SIMILARITY TESTS
// ============================================================

function testSimilarity() {
  console.log("  [2] Similarity Functions...");
  
  // Jaccard: identical sets → 1.0
  const j1 = jaccardSimilarity({ a: 1, b: 2, c: 3 }, { a: 1, b: 2, c: 3 });
  assertClose(j1, 1.0, 0.0001, "Jaccard identical");
  
  // Jaccard: disjoint sets → 0.0
  const j2 = jaccardSimilarity({ a: 1, b: 2 }, { c: 3, d: 4 });
  assertClose(j2, 0.0, 0.0001, "Jaccard disjoint");
  
  // Jaccard: partial overlap → |{a,b}∩{b,c}| / |{a,b}∪{b,c}| = 1/3
  const j3 = jaccardSimilarity({ a: 1, b: 2 }, { b: 3, c: 4 });
  assertClose(j3, 1/3, 0.0001, "Jaccard partial");
  
  // Cosine: identical vectors → 1.0
  const c1 = cosineSimilarity([1, 2, 3], [1, 2, 3]);
  assertClose(c1, 1.0, 0.0001, "Cosine identical");
  
  // Cosine: orthogonal → 0.0
  const c2 = cosineSimilarity([1, 0], [0, 1]);
  assertClose(c2, 0.0, 0.0001, "Cosine orthogonal");
  
  // Cosine: opposite → -1.0
  const c3 = cosineSimilarity([1, 0], [-1, 0]);
  assertClose(c3, -1.0, 0.0001, "Cosine opposite");
  
  console.log("    ✓ Jaccard [0,1], Cosine [-1,1], boundary cases correct");
}

// ============================================================
// 3. PRECEDENCE CONFIDENCE TESTS
// ============================================================

function testPrecedence() {
  console.log("  [3] Precedence Confidence Scoring...");
  
  // Neutral: no history → 0.5
  const s1 = precedenceScore({ confirmations: 0, negations: 0 });
  assertClose(s1, 0.5, 0.0001, "Neutral prior");
  
  // All confirmations → approaches 1.0
  const s2 = precedenceScore({ confirmations: 10, negations: 0 });
  assert(s2 > 0.5, "Confirmations increase score");
  assert(s2 <= 1.0, "Score bounded at 1.0");
  
  // All negations → approaches 0.0
  const s3 = precedenceScore({ confirmations: 0, negations: 10 });
  assert(s3 < 0.5, "Negations decrease score");
  assert(s3 >= 0.0, "Score bounded at 0.0");
  
  // Weighted confidence: W = 0.7c + 0.3Score
  const w1 = weightedConfidence(0.9, { confirmations: 5, negations: 1 });
  const expectedScore = precedenceScore({ confirmations: 5, negations: 1 });
  assertClose(w1, 0.7 * 0.9 + 0.3 * expectedScore, 0.0001, "Weighted confidence formula");
  
  // Determinism
  const s4 = precedenceScore({ confirmations: 7, negations: 3 });
  const s5 = precedenceScore({ confirmations: 7, negations: 3 });
  assert(s4 === s5, "Precedence score must be deterministic");
  
  console.log("    ✓ Bounded [0,1], directional, deterministic");
}

// ============================================================
// 4. CONVERGENCE DETECTION TESTS
// ============================================================

function testConvergence() {
  console.log("  [4] Convergence Detection...");
  
  const now = Date.now();
  const signals: Signal[] = [
    { temporal_coordinate: now - 1000, spatial_coordinate: "WA", signal_type: "A", confidence: 0.9, characteristics: {} },
    { temporal_coordinate: now - 2000, spatial_coordinate: "WA", signal_type: "B", confidence: 0.8, characteristics: {} },
    { temporal_coordinate: now - 3000, spatial_coordinate: "WA", signal_type: "C", confidence: 0.7, characteristics: {} },
    { temporal_coordinate: now - 4000, spatial_coordinate: "WA", signal_type: "A", confidence: 0.85, characteristics: {} },
    { temporal_coordinate: now - 5000, spatial_coordinate: "WA", signal_type: "D", confidence: 0.6, characteristics: {} },
  ];
  
  const input: ConvergenceInput = {
    geography: "WA",
    signals,
    time_window_ms: 86_400_000, // 1 day
    total_signals_all_geographies: 50,
    total_geographies: 50,  // 50 states → E[n] = 1 per state
  };
  
  const result = detectConvergence(input);
  
  // Verify distinct types: A, B, C, D = 4
  assert(result.distinct_types === 4, `Distinct types should be 4, got ${result.distinct_types}`);
  assert(result.signal_count === 5, `Signal count should be 5, got ${result.signal_count}`);
  
  // Mean confidence: (0.9 + 0.8 + 0.7 + 0.85 + 0.6) / 5 = 0.77
  assertClose(result.mean_confidence, 0.77, 0.001, "Mean confidence");
  
  // Recency: signals are very recent (< 5s ago), window is 1 day → r ≈ 1.0
  assert(result.recency_factor > 0.99, `Recency should be ~1.0, got ${result.recency_factor}`);
  
  // Multiplicative: 4 × 0.77 × ln(6) × (0.5 + 0.5×~1) ≈ 4 × 0.77 × 1.79 × 1 ≈ 5.51
  assert(result.multiplicative_score > 5, `Multiplicative should be > 5, got ${result.multiplicative_score}`);
  
  // Poisson Z: E[n] = 50/50 = 1, observed = 5, Z = (5-1)/√1 = 4.0
  assertClose(result.poisson_z_score, 4.0, 0.01, "Poisson Z-score");
  assert(result.statistically_significant === true, "Z=4 should be significant");
  assert(result.highly_significant === true, "Z=4 should be highly significant");
  
  // Empty geography → all zeros
  const empty = detectConvergence({ ...input, signals: [] });
  assert(empty.multiplicative_score === 0, "Empty → zero score");
  assert(empty.poisson_z_score === 0, "Empty → zero Z");
  
  // Determinism
  const r1 = detectConvergence(input);
  const r2 = detectConvergence(input);
  assert(r1.multiplicative_score === r2.multiplicative_score, "Convergence must be deterministic");
  
  console.log("    ✓ Z-score correct, multiplicative bounded, deterministic");
}

// ============================================================
// 5. SIGNAL LINKING TESTS
// ============================================================

function testLinking() {
  console.log("  [5] Signal Linking...");
  
  // Temporal: same time → 1.0
  assertClose(temporalSimilarity(1000, 1000, 10000), 1.0, 0.0001, "Same time");
  
  // Temporal: max distance → 0.0
  assertClose(temporalSimilarity(0, 10000, 10000), 0.0, 0.0001, "Max distance");
  
  // Temporal: half distance → 0.5
  assertClose(temporalSimilarity(0, 5000, 10000), 0.5, 0.0001, "Half distance");
  
  // Spatial: same location → 1.0
  assertClose(spatialSimilarity(0, 1), 1.0, 0.0001, "Same location");
  
  // Spatial: d=1, σ=1 → exp(-0.5) ≈ 0.6065
  assertClose(spatialSimilarity(1, 1), Math.exp(-0.5), 0.0001, "Adjacent σ=1");
  
  // Joint: same time + same place → 1.0
  const j1 = jointSimilarity({
    signal_a: testSignal,
    signal_b: testSignal,
    max_temporal_distance_ms: 86_400_000,
    spatial_sigma: 1,
  });
  assertClose(j1, 1.0, 0.0001, "Identical signals → joint=1");
  
  console.log("    ✓ Temporal [0,1], Spatial [0,1], Joint = product");
}

// ============================================================
// 6. PRIORITY SCORING TESTS
// ============================================================

function testPriority() {
  console.log("  [6] Priority Scoring (MAUT)...");
  
  // Maximum priority: all 1.0 → 10.0
  const max = priorityScore({ urgency: 1, equity: 1, feasibility: 1, confidence: 1 });
  assertClose(max, 10.0, 0.0001, "Max priority");
  
  // Minimum priority: all 0.0 → 0.0
  const min = priorityScore({ urgency: 0, equity: 0, feasibility: 0, confidence: 0 });
  assertClose(min, 0.0, 0.0001, "Min priority");
  
  // Specific case: 10 × (0.4×0.8 + 0.3×0.6 + 0.2×0.9 + 0.1×0.7)
  // = 10 × (0.32 + 0.18 + 0.18 + 0.07) = 10 × 0.75 = 7.5
  const specific = priorityScore({ urgency: 0.8, equity: 0.6, feasibility: 0.9, confidence: 0.7 });
  assertClose(specific, 7.5, 0.0001, "Specific weighted case");
  
  // Urgency from deadline: 30 days remaining of 90 day window
  const u = urgencyFromDeadline(30 * 86_400_000, 90 * 86_400_000);
  assertClose(u, 1 - 30/90, 0.0001, "Urgency from deadline");
  
  // Feasibility: 3 of 5 resources available
  const f = feasibilityScore(3, 5);
  assertClose(f, 0.6, 0.0001, "Feasibility 3/5");
  
  // Bounds: inputs > 1 get clamped
  const clamped = priorityScore({ urgency: 2.0, equity: -0.5, feasibility: 1.5, confidence: 0.5 });
  assert(clamped >= 0 && clamped <= 10, "Priority always in [0,10]");
  
  console.log("    ✓ Range [0,10], weights sum to 1, clamped inputs");
}

// ============================================================
// 7. GEOGRAPHIC NORMALIZATION TESTS
// ============================================================

function testGeographic() {
  console.log("  [7] Geographic Normalization...");
  
  // Normalize weights to sum to 1.0
  const raw = [
    { source: "WA", target: "King", weight: 0.4 },
    { source: "WA", target: "Pierce", weight: 0.3 },
    { source: "WA", target: "Snohomish", weight: 0.2 },
    { source: "WA", target: "Other", weight: 0.1 },
  ];
  
  const normalized = normalizeGeographicWeights(raw);
  const sum = normalized.reduce((s, a) => s + a.weight, 0);
  assertClose(sum, 1.0, 1e-6, "Partition of unity");
  
  // Already normalized → unchanged
  assertClose(normalized[0].weight, 0.4, 0.0001, "Already normalized stays same");
  
  // Signal translation: c' = c × w
  const translated = translateSignalConfidence(0.9, 0.4);
  assertClose(translated, 0.36, 0.0001, "Signal translation");
  
  // Non-normalized input gets normalized
  const uneven = [
    { source: "OR", target: "A", weight: 2 },
    { source: "OR", target: "B", weight: 3 },
  ];
  const norm2 = normalizeGeographicWeights(uneven);
  assertClose(norm2[0].weight, 0.4, 0.0001, "2/(2+3) = 0.4");
  assertClose(norm2[1].weight, 0.6, 0.0001, "3/(2+3) = 0.6");
  
  console.log("    ✓ Partition of unity, conservation, translation correct");
}

// ============================================================
// 8. DEDUPLICATION TESTS
// ============================================================

function testDeduplication() {
  console.log("  [8] Signal Deduplication...");
  
  const signals: Signal[] = [
    { ...testSignal, confidence: 0.7 },
    { ...testSignal, confidence: 0.9 },  // same fingerprint, higher confidence
    { ...testSignal, signal_type: "different", confidence: 0.5 },  // different fingerprint
  ];
  
  const deduped = deduplicateSignals(signals);
  assert(deduped.length === 2, `Should have 2 unique signals, got ${deduped.length}`);
  
  // The duplicate should keep the higher confidence one
  const snapSignal = deduped.find(s => s.signal_type === "SNAP_enrollment_drop");
  assert(snapSignal?.confidence === 0.9, "Keep highest confidence duplicate");
  
  console.log("    ✓ Fingerprint-based, keeps highest confidence");
}

// ============================================================
// RUN ALL TESTS
// ============================================================

console.log("\n═══════════════════════════════════════════════════");
console.log("  ATLAS MATHEMATICAL ENGINE — Verification Suite");
console.log("═══════════════════════════════════════════════════\n");

try {
  testFingerprinting();
  testSimilarity();
  testPrecedence();
  testConvergence();
  testLinking();
  testPriority();
  testGeographic();
  testDeduplication();
  
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  ALL 8 TEST SUITES PASSED ✓");
  console.log("  Engine produces deterministic, bounded, correct results.");
  console.log("═══════════════════════════════════════════════════\n");
} catch (e: any) {
  console.error("\n✗ TEST FAILURE:", e.message);
  process.exit(1);
}

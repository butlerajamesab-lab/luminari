/**
 * ATLAS MATHEMATICAL ENGINE v2.0.0 — Test Suite
 *
 * Tests verified against specification:
 *   - ATLAS_MATHEMATICAL_FOUNDATION.md
 *   - Luminari V3 Schema Mathematical Architecture
 *
 * Test categories:
 *   1. Exact source-derived vectors (known inputs → known outputs)
 *   2. Determinism replay (same inputs → identical outputs)
 *   3. Unknown/null propagation (missing confidence stays null)
 *   4. Partition of unity validation
 *   5. Incorrect area rejection
 *   6. Fingerprint bucket independence from analysis window
 *   7. Haversine distance verification
 *   8. Provenance receipt completeness
 *   9. No Date.now() in math paths
 *  10. Dominant type from raw frequency
 */
import { describe, expect, it } from "vitest";
import {
  signalFingerprint,
  jaccardSimilarity,
  cosineSimilarity,
  precedenceScore,
  weightedConfidence,
  detectConvergence,
  temporalSimilarity,
  spatialSimilarityHaversine,
  networkAdjacencyKernel,
  jointSimilarity,
  priorityScore,
  priorityScoreFromDeclared,
  urgencyFromDeadline,
  feasibilityScore,
  normalizeGeographicWeights,
  validatePartitionOfUnity,
  translateSignalConfidence,
  deduplicateSignals,
  haversineDistance,
  generateProvenanceReceipt,
  ENGINE_VERSION,
  ENGINE_EQUATIONS,
  type Signal,
  type GeographyRegistry,
  type ConvergenceInput,
} from "./atlas-engine";

// ============================================================
// TEST FIXTURES
// ============================================================

const REGISTRY: GeographyRegistry = {
  version: "test-v1",
  entries: [
    { id: "WA", area_sq_km: 184_827, centroid_lat: 47.3826, centroid_lon: -120.4472, adjacency: ["OR", "ID"] },
    { id: "OR", area_sq_km: 254_799, centroid_lat: 43.8041, centroid_lon: -120.5542, adjacency: ["WA", "CA", "ID", "NV"] },
    { id: "CA", area_sq_km: 423_967, centroid_lat: 36.7783, centroid_lon: -119.4179, adjacency: ["OR", "NV", "AZ"] },
    { id: "ID", area_sq_km: 216_443, centroid_lat: 44.0682, centroid_lon: -114.742, adjacency: ["WA", "OR", "MT", "NV", "UT", "WY"] },
    { id: "NV", area_sq_km: 286_380, centroid_lat: 38.8026, centroid_lon: -116.4194, adjacency: ["OR", "CA", "ID", "UT", "AZ"] },
  ],
};

const TOTAL_AREA = 184_827 + 254_799 + 423_967 + 216_443 + 286_380;

const makeSignal = (overrides: Partial<Signal> = {}): Signal => ({
  id: overrides.id ?? "sig-001",
  temporal_coordinate: overrides.temporal_coordinate ?? 1_700_000_000_000,
  spatial_coordinate: overrides.spatial_coordinate ?? "WA",
  signal_type: overrides.signal_type ?? "complaint",
  confidence: "confidence" in overrides ? overrides.confidence! : 0.8,
  characteristics: overrides.characteristics ?? { domain: "housing", severity: "high" },
});

// ============================================================
// 1. EXACT SOURCE-DERIVED VECTORS
// ============================================================

describe("Exact source-derived vectors", () => {
  it("Poisson Z-score with area-weighted E[n]", () => {
    const signals: Signal[] = Array.from({ length: 5 }, (_, i) => makeSignal({
      id: `sig-${i}`,
      temporal_coordinate: 1_700_000_000_000 + i * 3_600_000,
      signal_type: i < 3 ? "complaint" : "enforcement",
    }));

    const input: ConvergenceInput = {
      geography: "WA",
      signals,
      as_of: 1_700_000_000_000 + 86_400_000,
      time_window_ms: 7 * 86_400_000,
      total_signals_all_geographies: 10,
      geography_registry: REGISTRY,
    };

    const result = detectConvergence(input);
    expect(result.poisson.status).toBe("resolved");
    expect(result.poisson.observed_count).toBe(5);

    const expectedE = (10 / TOTAL_AREA) * 184_827;
    expect(result.poisson.expected_count).toBeCloseTo(expectedE, 3);

    const expectedZ = (5 - expectedE) / Math.sqrt(expectedE);
    expect(result.poisson.z_score).toBeCloseTo(expectedZ, 3);
  });

  it("Priority score: 10 × (0.4u + 0.3e + 0.2f + 0.1c)", () => {
    const result = priorityScore({ urgency: 0.9, equity: 0.7, feasibility: 0.5, confidence: 0.8 });
    const expected = 10 * (0.4 * 0.9 + 0.3 * 0.7 + 0.2 * 0.5 + 0.1 * 0.8);
    expect(result).toBeCloseTo(expected, 4);
  });

  it("Haversine distance: Seattle to Portland ≈ 233 km", () => {
    const d = haversineDistance(47.6062, -122.3321, 45.5152, -122.6784);
    expect(d).toBeGreaterThan(230);
    expect(d).toBeLessThan(240);
  });

  it("Urgency from deadline: 50% remaining = 0.5 urgency", () => {
    expect(urgencyFromDeadline(500, 1000)).toBe(0.5);
  });

  it("Feasibility: available/required = 3/4 = 0.75", () => {
    expect(feasibilityScore(3, 4)).toBe(0.75);
  });

  it("Precedence score: P0*(1+(C-N)*λ); λ=1/√(C+N+1), clamped [0,1]", () => {
    // Use C=3, N=1 which stays below 1.0
    const score = precedenceScore({ confirmations: 3, negations: 1 });
    const lambda = 1 / Math.sqrt(3 + 1 + 1);
    const expected = 0.5 * (1 + (3 - 1) * lambda);
    expect(score).toBeCloseTo(expected, 4);
    // Verify clamp: C=5, N=1 raw = 1.256 but clamped to 1.0
    expect(precedenceScore({ confirmations: 5, negations: 1 })).toBe(1);
    // Verify lower clamp: C=0, N=10 should be clamped to 0
    expect(precedenceScore({ confirmations: 0, negations: 10 })).toBe(0);
  });

  it("Recency factor: r = 1 - (as_of - t_max)/Δt_window", () => {
    const signals = [makeSignal({ temporal_coordinate: 1_700_000_000_000 })];
    const as_of = 1_700_000_000_000 + 3 * 86_400_000;
    const input: ConvergenceInput = {
      geography: "WA",
      signals,
      as_of,
      time_window_ms: 7 * 86_400_000,
      total_signals_all_geographies: 5,
      geography_registry: REGISTRY,
    };
    const result = detectConvergence(input);
    const expectedR = 1 - (3 * 86_400_000) / (7 * 86_400_000);
    expect(result.recency_factor).toBeCloseTo(expectedR, 3);
  });
});

// ============================================================
// 2. DETERMINISM REPLAY
// ============================================================

describe("Determinism replay", () => {
  it("Same inputs produce identical outputs across 100 runs", () => {
    const signals = Array.from({ length: 3 }, (_, i) => makeSignal({
      id: `det-${i}`,
      temporal_coordinate: 1_700_000_000_000 + i * 1_000_000,
      signal_type: "complaint",
    }));
    const input: ConvergenceInput = {
      geography: "WA",
      signals,
      as_of: 1_700_100_000_000,
      time_window_ms: 7 * 86_400_000,
      total_signals_all_geographies: 20,
      geography_registry: REGISTRY,
    };

    const first = detectConvergence(input);
    for (let i = 0; i < 100; i++) {
      expect(detectConvergence(input)).toEqual(first);
    }
  });

  it("Fingerprint is deterministic for same signal and bucket", () => {
    const signal = makeSignal();
    const fp1 = signalFingerprint(signal, 86_400_000);
    const fp2 = signalFingerprint(signal, 86_400_000);
    expect(fp1).toBe(fp2);
    expect(fp1).toHaveLength(64);
  });
});

// ============================================================
// 3. UNKNOWN/NULL PROPAGATION
// ============================================================

describe("Unknown/null propagation", () => {
  it("Null confidence signals: mean_confidence is null", () => {
    const signals = [
      makeSignal({ id: "n1", confidence: null, signal_type: "complaint" }),
      makeSignal({ id: "n2", confidence: null, signal_type: "enforcement" }),
    ];
    const input: ConvergenceInput = {
      geography: "WA",
      signals,
      as_of: 1_700_100_000_000,
      time_window_ms: 7 * 86_400_000,
      total_signals_all_geographies: 10,
      geography_registry: REGISTRY,
    };
    const result = detectConvergence(input);
    expect(result.mean_confidence).toBeNull();
    expect(result.multiplicative_score).toBeNull();
  });

  it("Mixed confidence: only non-null signals contribute to mean", () => {
    // Signals with DIFFERENT fingerprints (different types) so they don't dedup
    const signals = [
      makeSignal({ id: "m1", confidence: 0.8, signal_type: "complaint" }),
      makeSignal({ id: "m2", confidence: null, signal_type: "enforcement" }),
      makeSignal({ id: "m3", confidence: 0.6, signal_type: "violation" }),
    ];
    const input: ConvergenceInput = {
      geography: "WA",
      signals,
      as_of: 1_700_100_000_000,
      time_window_ms: 7 * 86_400_000,
      total_signals_all_geographies: 10,
      geography_registry: REGISTRY,
    };
    const result = detectConvergence(input);
    // Mean of non-null: (0.8 + 0.6) / 2 = 0.7
    expect(result.mean_confidence).toBeCloseTo(0.7, 2);
  });

  it("translateSignalConfidence preserves null", () => {
    expect(translateSignalConfidence(null, 0.5)).toBeNull();
  });
});

// ============================================================
// 4. PARTITION OF UNITY VALIDATION
// ============================================================

describe("Partition of unity", () => {
  it("Valid partition sums to 1.0", () => {
    const result = validatePartitionOfUnity([0.3, 0.3, 0.4]);
    expect(result.valid).toBe(true);
    expect(result.deviation).toBeLessThan(1e-6);
  });

  it("Invalid partition detected", () => {
    const result = validatePartitionOfUnity([0.3, 0.3, 0.3]);
    expect(result.valid).toBe(false);
    expect(result.sum).toBeCloseTo(0.9, 4);
  });

  it("normalizeGeographicWeights produces valid partition", () => {
    const allocations = [
      { source: "WA", target: "zone1", weight: 3 },
      { source: "WA", target: "zone2", weight: 7 },
    ];
    const normalized = normalizeGeographicWeights(allocations);
    const sum = normalized.reduce((s, a) => s + a.weight, 0);
    expect(sum).toBeCloseTo(1.0, 10);
    expect(normalized[0].weight).toBeCloseTo(0.3, 10);
    expect(normalized[1].weight).toBeCloseTo(0.7, 10);
  });

  it("normalizeGeographicWeights throws on all-zero weights", () => {
    const allocations = [{ source: "A", target: "B", weight: 0 }];
    expect(() => normalizeGeographicWeights(allocations)).toThrow("All allocation weights are zero");
  });

  it("normalizeGeographicWeights throws on negative weights", () => {
    const allocations = [{ source: "A", target: "B", weight: -0.5 }];
    expect(() => normalizeGeographicWeights(allocations)).toThrow("Negative allocation weights");
  });
});

// ============================================================
// 5. INCORRECT AREA REJECTION
// ============================================================

describe("Incorrect area rejection", () => {
  it("Geography not in registry → unresolved", () => {
    const signals = [makeSignal({ id: "rej1", spatial_coordinate: "XX" })];
    const input: ConvergenceInput = {
      geography: "XX",
      signals,
      as_of: 1_700_100_000_000,
      time_window_ms: 7 * 86_400_000,
      total_signals_all_geographies: 10,
      geography_registry: REGISTRY,
    };
    const result = detectConvergence(input);
    expect(result.poisson.status).toBe("unresolved");
    expect(result.poisson.z_score).toBeNull();
    expect(result.poisson.reason_unresolved).toContain("not found");
  });

  it("Zero area geography → unresolved", () => {
    const badRegistry: GeographyRegistry = {
      version: "bad-v1",
      entries: [{ id: "ZERO", area_sq_km: 0, adjacency: [] }],
    };
    const signals = [makeSignal({ id: "z1", spatial_coordinate: "ZERO" })];
    const input: ConvergenceInput = {
      geography: "ZERO",
      signals,
      as_of: 1_700_100_000_000,
      time_window_ms: 7 * 86_400_000,
      total_signals_all_geographies: 10,
      geography_registry: badRegistry,
    };
    const result = detectConvergence(input);
    expect(result.poisson.status).toBe("unresolved");
    expect(result.poisson.reason_unresolved).toContain("invalid area");
  });

  it("Negative area geography → unresolved", () => {
    const badRegistry: GeographyRegistry = {
      version: "bad-v2",
      entries: [{ id: "NEG", area_sq_km: -100, adjacency: [] }],
    };
    const signals = [makeSignal({ id: "neg1", spatial_coordinate: "NEG" })];
    const input: ConvergenceInput = {
      geography: "NEG",
      signals,
      as_of: 1_700_100_000_000,
      time_window_ms: 7 * 86_400_000,
      total_signals_all_geographies: 10,
      geography_registry: badRegistry,
    };
    const result = detectConvergence(input);
    expect(result.poisson.status).toBe("unresolved");
  });
});

// ============================================================
// 6. FINGERPRINT BUCKET INDEPENDENCE
// ============================================================

describe("Fingerprint bucket independence from analysis window", () => {
  it("Same signal, same bucket → same fingerprint regardless of context", () => {
    const signal = makeSignal({ temporal_coordinate: 1_700_000_000_000 });
    const bucket = 86_400_000;
    const fp = signalFingerprint(signal, bucket);
    expect(signalFingerprint(signal, bucket)).toBe(fp);
  });

  it("Same signal, different buckets → different fingerprints", () => {
    const signal = makeSignal({ temporal_coordinate: 1_700_000_000_000 });
    const fp1 = signalFingerprint(signal, 86_400_000);
    const fp2 = signalFingerprint(signal, 3_600_000);
    expect(fp1).not.toBe(fp2);
  });

  it("Invalid temporal_bucket_ms throws", () => {
    expect(() => signalFingerprint(makeSignal(), 0)).toThrow("temporal_bucket_ms must be positive");
    expect(() => signalFingerprint(makeSignal(), -1)).toThrow("temporal_bucket_ms must be positive");
  });

  it("Dedup uses temporal bucket, not analysis window", () => {
    // Use a timestamp at the START of a day bucket so +2h stays in same bucket
    const base = 19675 * 86_400_000; // 1699920000000 — start of day bucket 19675
    const s1 = makeSignal({ id: "t1", temporal_coordinate: base });
    const s2 = makeSignal({ id: "t2", temporal_coordinate: base + 7_200_000 });
    // Same day bucket (both floor to 19675) → same fingerprint → dedup
    expect(deduplicateSignals([s1, s2], 86_400_000)).toHaveLength(1);
    // With 1-hour bucket: floor(base/3600000) vs floor((base+7200000)/3600000) differ
    expect(deduplicateSignals([s1, s2], 3_600_000)).toHaveLength(2);
  });
});

// ============================================================
// 7. HAVERSINE DISTANCE
// ============================================================

describe("Haversine distance", () => {
  it("Same point → 0 km", () => {
    expect(haversineDistance(47.6, -122.3, 47.6, -122.3)).toBe(0);
  });

  it("Known distance: NYC to London ≈ 5,570 km", () => {
    const d = haversineDistance(40.7128, -74.0060, 51.5074, -0.1278);
    expect(d).toBeGreaterThan(5500);
    expect(d).toBeLessThan(5600);
  });

  it("Spatial similarity decreases with distance", () => {
    // spatialSimilarityHaversine takes (geo_a, geo_b, registry, sigma_km)
    const close = spatialSimilarityHaversine("WA", "OR", REGISTRY, 500);
    const far = spatialSimilarityHaversine("WA", "CA", REGISTRY, 500);
    expect(close).not.toBeNull();
    expect(far).not.toBeNull();
    expect(close!).toBeGreaterThan(far!);
  });
});

// ============================================================
// 8. PROVENANCE RECEIPT COMPLETENESS
// ============================================================

describe("Provenance receipt", () => {
  it("Contains all required fields", () => {
    const signals = [makeSignal({ id: "prov-1" }), makeSignal({ id: "prov-2", signal_type: "enforcement" })];
    const receipt = generateProvenanceReceipt({
      equation_id: "poisson_z_score",
      as_of: 1_700_000_000_000,
      config: { time_window_ms: 604_800_000, temporal_bucket_ms: 86_400_000 },
      input_signals: signals,
      geography_registry_version: "test-v1",
      expected_count: 1.35,
      observed_count: 5,
      computed_outputs: { z_score: 3.14 },
    });

    expect(receipt.equation_id).toBe("poisson_z_score");
    expect(receipt.engine_version).toBe(ENGINE_VERSION);
    expect(receipt.rule_manifest_hash).toHaveLength(64);
    expect(receipt.as_of).toBe(1_700_000_000_000);
    expect(receipt.configuration_hash).toHaveLength(64);
    expect(receipt.input_hash).toHaveLength(64);
    expect(receipt.source_signal_ids).toEqual(["prov-1", "prov-2"]);
    expect(receipt.geography_registry_version).toBe("test-v1");
    expect(receipt.expected_count).toBe(1.35);
    expect(receipt.observed_count).toBe(5);
    expect(receipt.computed_outputs).toEqual({ z_score: 3.14 });
    expect(receipt.timestamp_computed).toBe(1_700_000_000_000); // Must equal as_of, not Date.now()
  });

  it("Rule manifest hash is stable for same engine version", () => {
    const r1 = generateProvenanceReceipt({
      equation_id: "test", as_of: 1, config: {}, input_signals: [],
      geography_registry_version: "v1", expected_count: 0, observed_count: 0,
      computed_outputs: {},
    });
    const r2 = generateProvenanceReceipt({
      equation_id: "test", as_of: 2, config: { different: true }, input_signals: [],
      geography_registry_version: "v1", expected_count: 0, observed_count: 0,
      computed_outputs: {},
    });
    expect(r1.rule_manifest_hash).toBe(r2.rule_manifest_hash);
  });
});

// ============================================================
// 9. NO DATE.NOW() IN MATH PATHS
// ============================================================

describe("No Date.now() in math paths", () => {
  it("detectConvergence uses explicit as_of, not system clock", () => {
    const farFuture = 2_000_000_000_000;
    const signals = [makeSignal({ id: "time1", temporal_coordinate: farFuture - 1000 })];
    const input: ConvergenceInput = {
      geography: "WA",
      signals,
      as_of: farFuture,
      time_window_ms: 7 * 86_400_000,
      total_signals_all_geographies: 5,
      geography_registry: REGISTRY,
    };
    const result = detectConvergence(input);
    expect(result.recency_factor).toBeGreaterThan(0.99);
  });

  it("priorityScore is pure function with no time dependency", () => {
    const result = priorityScore({ urgency: 0.5, equity: 0.5, feasibility: 0.5, confidence: 0.5 });
    expect(result).toBe(5);
  });
});

// ============================================================
// 10. DOMINANT TYPE FROM RAW FREQUENCY
// ============================================================

describe("Dominant type from raw frequency distribution", () => {
  it("Most frequent type wins", () => {
    const signals = [
      makeSignal({ id: "d1", signal_type: "complaint" }),
      makeSignal({ id: "d2", signal_type: "complaint", temporal_coordinate: 1_700_000_100_000 }),
      makeSignal({ id: "d3", signal_type: "complaint", temporal_coordinate: 1_700_000_200_000 }),
      makeSignal({ id: "d4", signal_type: "enforcement", temporal_coordinate: 1_700_000_300_000 }),
      makeSignal({ id: "d5", signal_type: "violation", temporal_coordinate: 1_700_000_400_000 }),
    ];
    const input: ConvergenceInput = {
      geography: "WA",
      signals,
      as_of: 1_700_001_000_000,
      time_window_ms: 7 * 86_400_000,
      total_signals_all_geographies: 20,
      geography_registry: REGISTRY,
    };
    const result = detectConvergence(input);
    expect(result.dominant_type).toBe("complaint");
    expect(result.distinct_types).toBe(3);
  });
});

// ============================================================
// 11. SIMILARITY FUNCTIONS
// ============================================================

describe("Similarity functions", () => {
  it("Jaccard: identical sets → 1.0", () => {
    expect(jaccardSimilarity({ a: 1, b: 2, c: 3 }, { a: 1, b: 2, c: 3 })).toBe(1);
  });

  it("Jaccard: disjoint sets → 0.0", () => {
    expect(jaccardSimilarity({ a: 1 }, { b: 2 })).toBe(0);
  });

  it("Cosine: identical vectors → 1.0", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1.0, 10);
  });

  it("Cosine: orthogonal vectors → 0.0", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  it("Temporal similarity: same time → 1.0", () => {
    expect(temporalSimilarity(1000, 1000, 86_400_000)).toBe(1);
  });

  it("Temporal similarity: max distance → 0.0", () => {
    expect(temporalSimilarity(0, 86_400_000, 86_400_000)).toBe(0);
  });

  it("Joint similarity: product of temporal and spatial", () => {
    const result = jointSimilarity({
      signal_a: makeSignal({ temporal_coordinate: 1_700_000_000_000 }),
      signal_b: makeSignal({ temporal_coordinate: 1_700_000_000_000, spatial_coordinate: "OR" }),
      max_temporal_distance_ms: 7 * 86_400_000,
      geography_registry: REGISTRY,
      spatial_sigma_km: 200,
    });
    // Return fields are: joint, temporal, spatial, distance_km
    expect(result.temporal).toBe(1);
    expect(result.spatial).not.toBeNull();
    expect(result.spatial!).toBeGreaterThan(0.05);
    expect(result.spatial!).toBeLessThan(0.5);
    expect(result.joint).toBeCloseTo(
      result.temporal * result.spatial!, 4
    );
  });
});

// ============================================================
// 12. DECLARED UTILITIES
// ============================================================

describe("Declared utilities", () => {
  it("priorityScoreFromDeclared requires source attribution", () => {
    const result = priorityScoreFromDeclared({
      urgency: { value: 0.8, source: "deadline_config_v1" },
      equity: { value: 0.6, source: "vulnerability_index_v2" },
      feasibility: { value: 0.7, source: "resource_audit_2026Q3" },
      confidence: { value: 0.9, source: "signal_mean_confidence" },
    });
    expect(result.score).toBeCloseTo(10 * (0.4 * 0.8 + 0.3 * 0.6 + 0.2 * 0.7 + 0.1 * 0.9), 4);
    expect(result.sources.urgency).toBe("deadline_config_v1");
    expect(result.sources.equity).toBe("vulnerability_index_v2");
  });
});

// ============================================================
// 13. NO P-VALUE LANGUAGE
// ============================================================

describe("No p-value language", () => {
  it("Results contain no p-value or statistical significance claims", () => {
    const signals = Array.from({ length: 5 }, (_, i) => makeSignal({ id: `np-${i}` }));
    const input: ConvergenceInput = {
      geography: "WA",
      signals,
      as_of: 1_700_100_000_000,
      time_window_ms: 7 * 86_400_000,
      total_signals_all_geographies: 10,
      geography_registry: REGISTRY,
    };
    const result = detectConvergence(input);
    const json = JSON.stringify(result);
    expect(json).not.toContain("p-value");
    expect(json).not.toContain("p_value");
    expect(json).not.toContain("statistically significant");
    expect(json).not.toContain("statistically_significant");
    expect(json).not.toContain("highly_significant");
  });
});

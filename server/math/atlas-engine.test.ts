import { describe, expect, it } from "vitest";
import {
  ENGINE_VERSION,
  canonicalJson,
  computeRunKey,
  deduplicateSignals,
  detectConvergence,
  generateProvenanceReceipt,
  haversineDistance,
  networkAdjacencyKernel,
  normalizeGeographicWeights,
  priorityScoreFromDeclared,
  sha256,
  signalFingerprint,
  spatialSimilarityHaversine,
  type GeographyRegistry,
  type Signal,
} from "./atlas-engine";

const REGISTRY: GeographyRegistry = {
  version: "2026.08.01",
  entries: [
    { id: "OR", area_sq_km: 254799, centroid_lat: 43.8041, centroid_lon: -120.5542, adjacency: ["WA"] },
    { id: "WA", area_sq_km: 184827, centroid_lat: 47.3826, centroid_lon: -120.4472, adjacency: ["OR"] },
  ],
};
const AS_OF = 1_700_100_000_000;
const signal = (id: string, overrides: Partial<Signal> = {}): Signal => ({
  id,
  temporal_coordinate: 1_700_000_000_000,
  spatial_coordinate: "WA",
  signal_type: "complaint",
  confidence: 0.8,
  characteristics: { domain: "housing", severity: "high" },
  ...overrides,
});

const CONFIG = {
  as_of: AS_OF,
  time_window_ms: 7 * 86_400_000,
  temporal_bucket_ms: 86_400_000,
  geography_registry_version: REGISTRY.version,
  min_signals_for_analysis: 1,
  z_score_threshold: 2,
};

describe("canonical identity", () => {
  it("canonical JSON is key-order independent", () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe(canonicalJson({ a: 1, b: 2 }));
  });
  it("fingerprint uses declared bucket", () => {
    expect(signalFingerprint(signal("a"), 86_400_000)).toHaveLength(64);
    expect(() => signalFingerprint(signal("a"), 0)).toThrow();
  });
  it("dedup is deterministic and keeps the strongest then smallest id", () => {
    const a = signal("b", { confidence: 0.9 });
    const b = signal("a", { confidence: 0.9 });
    expect(deduplicateSignals([a, b])[0].id).toBe("a");
  });
});

describe("area-weighted convergence", () => {
  it("computes E[n]=(N/A_total)*A_g and Z", () => {
    const raw = [signal("1"), signal("2", { signal_type: "enforcement" })];
    const result = detectConvergence({ geography: "WA", raw_signals: raw, as_of: AS_OF, time_window_ms: CONFIG.time_window_ms, temporal_bucket_ms: CONFIG.temporal_bucket_ms, total_signals_all_geographies: 10, geography_registry: REGISTRY });
    const expected = (10 / (184827 + 254799)) * 184827;
    expect(result.poisson.expected_count).toBeCloseTo(expected, 3);
    expect(result.poisson.z_score).toBeCloseTo((2 - expected) / Math.sqrt(expected), 3);
  });
  it("dominant type comes from raw frequency, not deduped unique types", () => {
    const raw = [signal("1"), signal("2"), signal("3", { signal_type: "enforcement" })];
    const result = detectConvergence({ geography: "WA", raw_signals: raw, as_of: AS_OF, time_window_ms: CONFIG.time_window_ms, temporal_bucket_ms: CONFIG.temporal_bucket_ms, total_signals_all_geographies: 3, geography_registry: REGISTRY });
    expect(result.dominant_type).toBe("complaint");
    expect(result.raw_signal_count).toBe(3);
  });
  it("rejects signals after as_of", () => {
    expect(() => detectConvergence({ geography: "WA", raw_signals: [signal("future", { temporal_coordinate: AS_OF + 1 })], as_of: AS_OF, time_window_ms: CONFIG.time_window_ms, temporal_bucket_ms: CONFIG.temporal_bucket_ms, total_signals_all_geographies: 1, geography_registry: REGISTRY })).toThrow("after as_of");
  });
  it("propagates all-null confidence", () => {
    const result = detectConvergence({ geography: "WA", raw_signals: [signal("1", { confidence: null })], as_of: AS_OF, time_window_ms: CONFIG.time_window_ms, temporal_bucket_ms: CONFIG.temporal_bucket_ms, total_signals_all_geographies: 1, geography_registry: REGISTRY });
    expect(result.mean_confidence).toBeNull();
    expect(result.multiplicative_score).toBeNull();
  });
});

describe("full provenance identity", () => {
  const receipt = (rawPopulation: Signal[], registry = REGISTRY, expected = 1) => generateProvenanceReceipt({
    run_key: computeRunKey({ as_of: AS_OF, config: CONFIG, geography_registry_version: registry.version }),
    geography_id: "WA",
    equation_id: "poisson_z_score",
    as_of: AS_OF,
    config: CONFIG,
    raw_population: rawPopulation,
    deduplicated_population: deduplicateSignals(rawPopulation),
    geography_registry: registry,
    expected_count: expected,
    observed_count: rawPopulation.length,
    computed_outputs: { expected },
  });

  it("hash changes when confidence or characteristics change with the same ID", () => {
    const a = receipt([signal("same")]);
    const b = receipt([signal("same", { confidence: 0.7 })]);
    const c = receipt([signal("same", { characteristics: { domain: "employment" } })]);
    expect(a.input_hash).not.toBe(b.input_hash);
    expect(a.input_hash).not.toBe(c.input_hash);
  });
  it("hash changes when the full population changes outside the target geography", () => {
    const a = receipt([signal("wa")]);
    const b = receipt([signal("wa"), signal("or", { spatial_coordinate: "OR" })]);
    expect(a.input_hash).not.toBe(b.input_hash);
  });
  it("hash changes when registry geometry/area changes despite same version string", () => {
    const changed = { ...REGISTRY, entries: REGISTRY.entries.map(e => e.id === "WA" ? { ...e, area_sq_km: e.area_sq_km + 1 } : e) };
    expect(receipt([signal("wa")]).input_hash).not.toBe(receipt([signal("wa")], changed).input_hash);
  });
  it("receipt is fully deterministic and includes the explicit as_of timestamp", () => {
    const a = receipt([signal("wa")]);
    const b = receipt([signal("wa")]);
    expect(a).toEqual(b);
    expect(a.timestamp_computed).toBe(AS_OF);
    expect(a.input_hash).toHaveLength(64);
    expect(a.rule_manifest_hash).toHaveLength(64);
  });
});

describe("geographic and utility validation", () => {
  it("accepts zero latitude/longitude and validates sigma before same-geography shortcut", () => {
    const equator: GeographyRegistry = { version: "eq", entries: [{ id: "A", area_sq_km: 1, centroid_lat: 0, centroid_lon: 0, adjacency: [] }] };
    expect(spatialSimilarityHaversine("A", "A", equator, 1)).toBe(1);
    expect(() => spatialSimilarityHaversine("A", "A", equator, 0)).toThrow("sigma_km");
  });
  it("validates network sigma before same-geography shortcut", () => {
    expect(() => networkAdjacencyKernel("WA", "WA", REGISTRY, 0)).toThrow("sigma_hops");
  });
  it("rejects negative/all-zero geographic weights", () => {
    expect(() => normalizeGeographicWeights([{ source: "A", target: "B", weight: -1 }])).toThrow();
    expect(() => normalizeGeographicWeights([{ source: "A", target: "B", weight: 0 }])).toThrow();
  });
  it("computes Haversine distance", () => {
    expect(haversineDistance(47.6062, -122.3321, 45.5152, -122.6784)).toBeGreaterThan(230);
  });
  it("requires governed utility version and source record IDs", () => {
    expect(() => priorityScoreFromDeclared({ version: "", urgency: { value: 1, source_record_id: "u" }, equity: { value: 1, source_record_id: "e" }, feasibility: { value: 1, source_record_id: "f" }, confidence: { value: 1, source_record_id: "c" } })).toThrow();
  });
});

describe("replay", () => {
  it("same declared inputs produce identical outputs across 100 runs", () => {
    const input = { geography: "WA", raw_signals: [signal("1")], as_of: AS_OF, time_window_ms: CONFIG.time_window_ms, temporal_bucket_ms: CONFIG.temporal_bucket_ms, total_signals_all_geographies: 1, geography_registry: REGISTRY };
    const first = sha256(detectConvergence(input));
    for (let i = 0; i < 100; i++) expect(sha256(detectConvergence(input))).toBe(first);
    expect(ENGINE_VERSION).toBe("2.1.0");
  });
});

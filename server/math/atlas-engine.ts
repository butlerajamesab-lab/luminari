/**
 * ATLAS MATHEMATICAL ENGINE v2.1.0
 *
 * Pure deterministic math. No LLM, no hidden clock, no database access.
 * Every governed computation requires explicit inputs and produces a complete
 * provenance identity over the full source population and registry snapshot.
 */
import * as crypto from "crypto";

export const ENGINE_VERSION = "2.1.0";
export const NULL_MODEL_ID = "area_weighted_poisson" as const;
export const NULL_MODEL_ASSUMPTIONS = Object.freeze([
  "Signal generation is independent across geographies",
  "Area is a valid proxy for expected signal density",
  "Signals within the time window are independent observations",
  "The geography registry snapshot is complete for the analysis domain",
]);

export const ENGINE_EQUATIONS = Object.freeze({
  signal_fingerprint: "h(s)=SHA256(τ||G||⌊t/Δt⌋||χ)",
  jaccard_similarity: "J(A,B)=|A∩B|/|A∪B|",
  cosine_similarity: "cos(θ)=(a·b)/(||a||||b||)",
  precedence_confidence: "Score_n=P0*(1+(C-N)*λ_n); λ_n=1/√(C+N+1)",
  weighted_confidence: "W=0.7c+0.3Score",
  recency_factor: "r=1-(as_of-t_max)/Δt_window",
  multiplicative_convergence: "C2=|T|*mean(c)*ln(n+1)*(0.5+0.5r)",
  poisson_z_score: "E[n]=(N_total/A_total)*A_geography; Z=(n_observed-E[n])/√E[n]",
  haversine_distance: "d=R*2*atan2(√a,√(1-a)); R=6371km",
  network_adjacency_kernel: "s_g=exp(-d²/(2σ²))",
  temporal_similarity: "s_t=1-Δt/Δt_max",
  spatial_similarity_gaussian: "s_g=exp(-d²/(2σ²))",
  joint_similarity: "S=s_t×s_g",
  area_weighted_allocation: "w(s→t)=A(s∩t)/A(s); normalized: w/Σw",
  signal_translation: "c'_t=c_s×w(s→t)",
  weighted_priority: "Priority=10×(0.4u+0.3e+0.2f+0.1c)",
});

export interface Signal {
  id: string;
  temporal_coordinate: number;
  spatial_coordinate: string;
  signal_type: string;
  confidence: number | null;
  characteristics: Record<string, string | number | boolean | null>;
}

export interface GeographyEntry {
  id: string;
  area_sq_km: number;
  centroid_lat: number | null;
  centroid_lon: number | null;
  adjacency: string[];
}

export interface GeographyRegistry {
  version: string;
  entries: GeographyEntry[];
}

export interface PrecedenceRecord { confirmations: number; negations: number; }

export interface ConvergenceInput {
  geography: string;
  raw_signals: Signal[];
  as_of: number;
  time_window_ms: number;
  temporal_bucket_ms: number;
  total_signals_all_geographies: number;
  geography_registry: GeographyRegistry;
}

export interface PoissonResult {
  status: "resolved" | "unresolved";
  expected_count: number | null;
  observed_count: number;
  z_score: number | null;
  reason_unresolved?: string;
}

export interface ConvergenceResult {
  geography: string;
  raw_signal_count: number;
  signal_count: number;
  distinct_types: number;
  mean_confidence: number | null;
  recency_factor: number;
  multiplicative_score: number | null;
  dominant_type: string;
  poisson: PoissonResult;
  source_signal_ids: string[];
  deduplicated_signal_ids: string[];
  null_model: {
    model_id: typeof NULL_MODEL_ID;
    assumptions: readonly string[];
    geography_registry_version: string;
    total_area_sq_km: number;
    geography_area_sq_km: number | null;
    total_signals: number;
  };
}

export interface PriorityInput { urgency: number; equity: number; feasibility: number; confidence: number; }
export interface DeclaredUtilities {
  version: string;
  urgency: { value: number; source_record_id: string };
  equity: { value: number; source_record_id: string };
  feasibility: { value: number; source_record_id: string };
  confidence: { value: number; source_record_id: string };
}

export interface GeographicAllocation { source: string; target: string; weight: number; }

export interface ProvenanceReceipt {
  run_key: string;
  geography_id: string;
  equation_id: string;
  engine_version: string;
  rule_manifest_hash: string;
  as_of: number;
  configuration_hash: string;
  input_hash: string;
  source_signal_ids: string[];
  geography_registry_version: string;
  expected_count: number | null;
  observed_count: number;
  computed_outputs: Record<string, unknown>;
  timestamp_computed: number;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export function sha256(value: unknown): string {
  return crypto.createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function signalFingerprint(signal: Signal, temporal_bucket_ms = 86_400_000): string {
  assertPositiveFinite(temporal_bucket_ms, "temporal_bucket_ms");
  const payload = {
    signal_type: signal.signal_type,
    spatial_coordinate: signal.spatial_coordinate,
    temporal_bucket: Math.floor(signal.temporal_coordinate / temporal_bucket_ms),
    characteristics: signal.characteristics,
  };
  return sha256(payload);
}

export function deduplicateSignals(signals: Signal[], temporal_bucket_ms = 86_400_000): Signal[] {
  const ordered = [...signals].sort((a, b) => a.id.localeCompare(b.id));
  const seen = new Map<string, Signal>();
  for (const signal of ordered) {
    const fp = signalFingerprint(signal, temporal_bucket_ms);
    const existing = seen.get(fp);
    if (!existing || compareSignalPreference(signal, existing) < 0) seen.set(fp, signal);
  }
  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function compareSignalPreference(a: Signal, b: Signal): number {
  const ac = a.confidence ?? -1;
  const bc = b.confidence ?? -1;
  if (ac !== bc) return bc - ac;
  return a.id.localeCompare(b.id);
}

export function jaccardSimilarity(a: Record<string, unknown>, b: Record<string, unknown>): number {
  const A = new Set(Object.keys(a)); const B = new Set(Object.keys(b));
  const intersection = [...A].filter(k => B.has(k)).length;
  const union = A.size + B.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
  const denom = Math.sqrt(aa) * Math.sqrt(bb);
  return denom === 0 ? 0 : dot / denom;
}

export function precedenceScore(record: PrecedenceRecord): number {
  if (!Number.isInteger(record.confirmations) || record.confirmations < 0 || !Number.isInteger(record.negations) || record.negations < 0) {
    throw new Error("precedence counts must be non-negative integers");
  }
  const lambda = 1 / Math.sqrt(record.confirmations + record.negations + 1);
  return clamp(0.5 * (1 + (record.confirmations - record.negations) * lambda), 0, 1);
}

export function weightedConfidence(raw: number | null, record: PrecedenceRecord): number | null {
  if (raw === null) return null;
  assertUnit(raw, "rawConfidence");
  return 0.7 * raw + 0.3 * precedenceScore(record);
}

const EARTH_RADIUS_KM = 6371;
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  validateLatitude(lat1); validateLatitude(lat2); validateLongitude(lon1); validateLongitude(lon2);
  const rad = (d: number) => d * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function spatialSimilarityHaversine(a: string, b: string, registry: GeographyRegistry, sigma_km: number): number | null {
  assertPositiveFinite(sigma_km, "sigma_km");
  if (a === b) return 1;
  const A = registry.entries.find(e => e.id === a), B = registry.entries.find(e => e.id === b);
  if (!A || !B || A.centroid_lat === null || A.centroid_lon === null || B.centroid_lat === null || B.centroid_lon === null) return null;
  const d = haversineDistance(A.centroid_lat, A.centroid_lon, B.centroid_lat, B.centroid_lon);
  return Math.exp(-(d * d) / (2 * sigma_km * sigma_km));
}

export function networkAdjacencyKernel(a: string, b: string, registry: GeographyRegistry, sigma_hops: number): number | null {
  assertPositiveFinite(sigma_hops, "sigma_hops");
  if (a === b) return 1;
  const visited = new Set([a]); let frontier = [a]; let depth = 0;
  while (frontier.length && depth < registry.entries.length + 1) {
    depth++; const next: string[] = [];
    for (const node of frontier) {
      const entry = registry.entries.find(e => e.id === node);
      for (const neighbor of entry?.adjacency ?? []) {
        if (neighbor === b) return Math.exp(-(depth ** 2) / (2 * sigma_hops ** 2));
        if (!visited.has(neighbor)) { visited.add(neighbor); next.push(neighbor); }
      }
    }
    frontier = next;
  }
  return null;
}

export function temporalSimilarity(t1: number, t2: number, maxDistance: number): number {
  assertPositiveFinite(maxDistance, "max_temporal_distance_ms");
  return clamp(1 - Math.abs(t2 - t1) / maxDistance, 0, 1);
}

export function jointSimilarity(params: {
  signal_a: Signal; signal_b: Signal; max_temporal_distance_ms: number;
  geography_registry: GeographyRegistry; spatial_sigma_km: number;
}) {
  const temporal = temporalSimilarity(params.signal_a.temporal_coordinate, params.signal_b.temporal_coordinate, params.max_temporal_distance_ms);
  const spatial = spatialSimilarityHaversine(params.signal_a.spatial_coordinate, params.signal_b.spatial_coordinate, params.geography_registry, params.spatial_sigma_km);
  return { temporal: round4(temporal), spatial: spatial === null ? null : round4(spatial), joint: spatial === null ? null : round4(temporal * spatial) };
}

export function detectConvergence(input: ConvergenceInput): ConvergenceResult {
  assertFinite(input.as_of, "as_of");
  assertPositiveFinite(input.time_window_ms, "time_window_ms");
  assertPositiveFinite(input.temporal_bucket_ms, "temporal_bucket_ms");
  if (!Number.isInteger(input.total_signals_all_geographies) || input.total_signals_all_geographies < 0) throw new Error("total_signals_all_geographies must be a non-negative integer");
  validateRegistry(input.geography_registry);
  for (const s of input.raw_signals) {
    if (s.temporal_coordinate > input.as_of) throw new Error(`signal ${s.id} occurs after as_of`);
    if (s.confidence !== null) assertUnit(s.confidence, `signal ${s.id} confidence`);
  }

  const raw = [...input.raw_signals].sort((a, b) => a.id.localeCompare(b.id));
  const signals = deduplicateSignals(raw, input.temporal_bucket_ms);
  const counts = new Map<string, number>();
  for (const s of raw) counts.set(s.signal_type, (counts.get(s.signal_type) ?? 0) + 1);
  const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "none";
  const confidences = signals.flatMap(s => s.confidence === null ? [] : [s.confidence]);
  const mean = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null;
  const tMax = signals.length ? Math.max(...signals.map(s => s.temporal_coordinate)) : input.as_of;
  const recency = signals.length ? clamp(1 - (input.as_of - tMax) / input.time_window_ms, 0, 1) : 0;
  const multiplicative = mean === null ? null : counts.size * mean * Math.log(signals.length + 1) * (0.5 + 0.5 * recency);

  const totalArea = input.geography_registry.entries.reduce((s, e) => s + e.area_sq_km, 0);
  const geo = input.geography_registry.entries.find(e => e.id === input.geography);
  let poisson: PoissonResult;
  if (!signals.length) poisson = { status: "unresolved", expected_count: null, observed_count: 0, z_score: null, reason_unresolved: "No signals" };
  else if (!geo) poisson = { status: "unresolved", expected_count: null, observed_count: signals.length, z_score: null, reason_unresolved: `Geography '${input.geography}' absent from registry '${input.geography_registry.version}'` };
  else {
    const expected = (input.total_signals_all_geographies / totalArea) * geo.area_sq_km;
    poisson = expected > 0
      ? { status: "resolved", expected_count: round4(expected), observed_count: signals.length, z_score: round4((signals.length - expected) / Math.sqrt(expected)) }
      : { status: "unresolved", expected_count: 0, observed_count: signals.length, z_score: null, reason_unresolved: "Expected count is zero" };
  }

  return {
    geography: input.geography,
    raw_signal_count: raw.length,
    signal_count: signals.length,
    distinct_types: counts.size,
    mean_confidence: mean === null ? null : round4(mean),
    recency_factor: round4(recency),
    multiplicative_score: multiplicative === null ? null : round4(multiplicative),
    dominant_type: dominant,
    poisson,
    source_signal_ids: raw.map(s => s.id),
    deduplicated_signal_ids: signals.map(s => s.id),
    null_model: {
      model_id: NULL_MODEL_ID,
      assumptions: NULL_MODEL_ASSUMPTIONS,
      geography_registry_version: input.geography_registry.version,
      total_area_sq_km: round4(totalArea),
      geography_area_sq_km: geo ? round4(geo.area_sq_km) : null,
      total_signals: input.total_signals_all_geographies,
    },
  };
}

export function priorityScore(input: PriorityInput): number {
  assertUnit(input.urgency, "urgency"); assertUnit(input.equity, "equity");
  assertUnit(input.feasibility, "feasibility"); assertUnit(input.confidence, "confidence");
  return round4(10 * (0.4 * input.urgency + 0.3 * input.equity + 0.2 * input.feasibility + 0.1 * input.confidence));
}

export function priorityScoreFromDeclared(input: DeclaredUtilities) {
  if (!input.version.trim()) throw new Error("declared utility version is required");
  for (const [name, item] of Object.entries({ urgency: input.urgency, equity: input.equity, feasibility: input.feasibility, confidence: input.confidence })) {
    if (!item.source_record_id.trim()) throw new Error(`${name} source_record_id is required`);
  }
  return { score: priorityScore({ urgency: input.urgency.value, equity: input.equity.value, feasibility: input.feasibility.value, confidence: input.confidence.value }), version: input.version, source_record_ids: { urgency: input.urgency.source_record_id, equity: input.equity.source_record_id, feasibility: input.feasibility.source_record_id, confidence: input.confidence.source_record_id } };
}

export function urgencyFromDeadline(remainingMs: number, totalWindowMs: number): number { assertPositiveFinite(totalWindowMs, "totalWindowMs"); return clamp(1 - remainingMs / totalWindowMs, 0, 1); }
export function feasibilityScore(available: number, required: number): number { if (available < 0) throw new Error("available must be non-negative"); assertPositiveFinite(required, "required"); return clamp(available / required, 0, 1); }

export function normalizeGeographicWeights(allocations: GeographicAllocation[]): GeographicAllocation[] {
  if (!allocations.length) return [];
  if (allocations.some(a => !Number.isFinite(a.weight) || a.weight < 0)) throw new Error("allocation weights must be finite and non-negative");
  const total = allocations.reduce((s, a) => s + a.weight, 0);
  if (total <= 0) throw new Error("All allocation weights are zero");
  const normalized = allocations.map(a => ({ ...a, weight: a.weight / total }));
  if (!validatePartitionOfUnity(normalized.map(a => a.weight)).valid) throw new Error("Geographic normalization failed partition of unity");
  return normalized;
}

export function validatePartitionOfUnity(weights: number[], tolerance = 1e-6) {
  if (weights.some(w => !Number.isFinite(w) || w < 0)) return { valid: false, sum: Number.NaN, deviation: Number.POSITIVE_INFINITY };
  const sum = weights.reduce((s, w) => s + w, 0); const deviation = Math.abs(sum - 1);
  return { valid: deviation <= tolerance, sum, deviation };
}
export function translateSignalConfidence(confidence: number | null, weight: number): number | null { if (confidence === null) return null; assertUnit(confidence, "confidence"); assertUnit(weight, "weight"); return confidence * weight; }

export function computeRunKey(params: { as_of: number; config: Record<string, unknown>; geography_registry_version: string; }): string {
  return sha256({ engine_version: ENGINE_VERSION, ...params });
}

export function generateProvenanceReceipt(params: {
  run_key: string;
  geography_id: string;
  equation_id: string;
  as_of: number;
  config: Record<string, unknown>;
  raw_population: Signal[];
  deduplicated_population: Signal[];
  geography_registry: GeographyRegistry;
  expected_count: number | null;
  observed_count: number;
  computed_outputs: Record<string, unknown>;
}): ProvenanceReceipt {
  const inputPayload = {
    raw_population: [...params.raw_population].sort((a, b) => a.id.localeCompare(b.id)),
    deduplicated_population: [...params.deduplicated_population].sort((a, b) => a.id.localeCompare(b.id)),
    geography_registry: { version: params.geography_registry.version, entries: [...params.geography_registry.entries].sort((a, b) => a.id.localeCompare(b.id)) },
    null_model: { id: NULL_MODEL_ID, assumptions: NULL_MODEL_ASSUMPTIONS },
    configuration: params.config,
  };
  return {
    run_key: params.run_key,
    geography_id: params.geography_id,
    equation_id: params.equation_id,
    engine_version: ENGINE_VERSION,
    rule_manifest_hash: sha256(ENGINE_EQUATIONS),
    as_of: params.as_of,
    configuration_hash: sha256(params.config),
    input_hash: sha256(inputPayload),
    source_signal_ids: params.raw_population.map(s => s.id).sort(),
    geography_registry_version: params.geography_registry.version,
    expected_count: params.expected_count,
    observed_count: params.observed_count,
    computed_outputs: params.computed_outputs,
    timestamp_computed: params.as_of,
  };
}

function validateRegistry(registry: GeographyRegistry) {
  if (!registry.version.trim()) throw new Error("geography registry version is required");
  if (!registry.entries.length) throw new Error("geography registry is empty");
  const ids = new Set<string>();
  for (const e of registry.entries) {
    if (ids.has(e.id)) throw new Error(`duplicate geography '${e.id}'`); ids.add(e.id);
    assertPositiveFinite(e.area_sq_km, `area_sq_km for ${e.id}`);
    if (e.centroid_lat !== null) validateLatitude(e.centroid_lat);
    if (e.centroid_lon !== null) validateLongitude(e.centroid_lon);
  }
}
function validateLatitude(v: number) { if (!Number.isFinite(v) || v < -90 || v > 90) throw new Error("latitude must be between -90 and 90"); }
function validateLongitude(v: number) { if (!Number.isFinite(v) || v < -180 || v > 180) throw new Error("longitude must be between -180 and 180"); }
function assertUnit(v: number, name: string) { if (!Number.isFinite(v) || v < 0 || v > 1) throw new Error(`${name} must be in [0,1]`); }
function assertFinite(v: number, name: string) { if (!Number.isFinite(v)) throw new Error(`${name} must be finite`); }
function assertPositiveFinite(v: number, name: string) { if (!Number.isFinite(v) || v <= 0) throw new Error(`${name} must be positive`); }
function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }
function round4(v: number) { return Math.round(v * 10000) / 10000; }

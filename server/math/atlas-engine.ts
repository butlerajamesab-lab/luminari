/**
 * ATLAS MATHEMATICAL ENGINE v2.0.0
 *
 * Pure deterministic math functions implementing the Atlas Mathematical Foundation.
 * No LLM. No inference. No side effects. No Date.now(). No invented inputs.
 *
 * Source: ATLAS_MATHEMATICAL_FOUNDATION.md
 * Constitutional contract: Y = F_v(X, R)
 * Determinism: (X₁,R₁,v₁) = (X₂,R₂,v₂) ⟹ F_v₁(X₁,R₁) = F_v₂(X₂,R₂)
 *
 * REPAIR NOTES (from audit):
 *   1. as_of is explicit input everywhere — no Date.now() in any math path
 *   2. Poisson uses area-weighted E[n] = (N_total/A_total) × A_geography
 *   3. Priority consumes only declared, versioned utility values
 *   4. Missing confidence = null/undefined, never fabricated as 0.5
 *   5. Fingerprint uses declared temporal bucket (default 1 day)
 *   6. Geographic distance via Haversine or adjacency kernel
 *   7. Dominant type from raw source-signal frequency distribution
 *   8. No p-value language — Z-score + null model ID + assumptions only
 *   9. Provenance receipt structure defined for persistence
 *  10. Admin-gating handled at router level
 *  11. No caller-invented population baselines
 *  12. Viability accepts governed record identifiers (router resolves)
 */
import * as crypto from "crypto";

// ============================================================
// ENGINE METADATA
// ============================================================
export const ENGINE_VERSION = "2.0.0";
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
  maut_utility: "U=Σ(w_i×u_i); Σw_i=1",
  weighted_priority: "Priority=10×(0.4u+0.3e+0.2f+0.1c)",
  urgency_utility: "u_urgency=1-t_remaining/t_deadline",
  equity_utility: "u_equity=V_index∈[0,1]",
  feasibility_utility: "u_feasibility=R_available/R_required",
});

// ============================================================
// TYPES
// ============================================================

export interface Signal {
  id?: string;                        // Source signal ID for provenance
  temporal_coordinate: number;        // Unix timestamp ms
  spatial_coordinate: string;         // Geography identifier
  signal_type: string;                // Category τ
  confidence: number | null;          // c ∈ [0,1] or null if missing
  characteristics: Record<string, string | number | boolean>;
}

export interface GeographyEntry {
  id: string;                         // Geography identifier
  area_sq_km: number;                 // Area in km² — REQUIRED, no fallback
  centroid_lat?: number;              // Latitude of centroid (for Haversine)
  centroid_lon?: number;              // Longitude of centroid (for Haversine)
  adjacency?: string[];               // Adjacent geography IDs
}

export interface GeographyRegistry {
  version: string;                    // Registry version for provenance
  entries: GeographyEntry[];
}

export interface PrecedenceRecord {
  confirmations: number;
  negations: number;
}

export interface ConvergenceInput {
  geography: string;
  signals: Signal[];
  as_of: number;                      // Explicit timestamp — replaces Date.now()
  time_window_ms: number;             // Δt_window in milliseconds
  total_signals_all_geographies: number;  // N_total
  geography_registry: GeographyRegistry;
}

export interface ConvergenceResult {
  geography: string;
  distinct_types: number;
  signal_count: number;
  mean_confidence: number | null;     // null if all signals have null confidence
  recency_factor: number;
  multiplicative_score: number | null; // null if confidence unavailable
  poisson: PoissonResult;
  dominant_type: string;
  null_model: NullModelReport;
  source_signal_ids: string[];
}

export interface PoissonResult {
  status: "resolved" | "unresolved";
  expected_count: number | null;
  observed_count: number;
  z_score: number | null;
  reason_unresolved?: string;
}

export interface NullModelReport {
  model_id: "area_weighted_poisson";
  hypothesis: "H₀: Signals distributed uniformly across geography proportional to area";
  assumptions: string[];
  geography_registry_version: string;
  total_area_sq_km: number;
  geography_area_sq_km: number | null;
  total_signals: number;
}

export interface PriorityInput {
  urgency: number;       // u_urgency ∈ [0,1]
  equity: number;        // u_equity ∈ [0,1]
  feasibility: number;   // u_feasibility ∈ [0,1]
  confidence: number;    // u_confidence ∈ [0,1]
}

export interface DeclaredUtilities {
  urgency: { value: number; source: string };
  equity: { value: number; source: string };
  feasibility: { value: number; source: string };
  confidence: { value: number; source: string };
}

export interface SimilarityInput {
  signal_a: Signal;
  signal_b: Signal;
  max_temporal_distance_ms: number;
  geography_registry: GeographyRegistry;
  spatial_sigma_km: number;
}

export interface GeographicAllocation {
  source: string;
  target: string;
  weight: number;
}

export interface ProvenanceReceipt {
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

// ============================================================
// 1. SIGNAL FINGERPRINTING
// h(s) = SHA256(τ || G || ⌊t/Δt⌋ || χ)
// Δt = declared temporal bucket (default 1 day = 86_400_000 ms)
// ============================================================

export function signalFingerprint(
  signal: Signal,
  temporal_bucket_ms: number = 86_400_000
): string {
  if (temporal_bucket_ms <= 0) {
    throw new Error("temporal_bucket_ms must be positive");
  }
  const bucket = Math.floor(signal.temporal_coordinate / temporal_bucket_ms);
  const sortedChars = Object.keys(signal.characteristics)
    .sort()
    .map(k => `${k}=${signal.characteristics[k]}`)
    .join("|");
  const payload = [
    signal.signal_type,
    signal.spatial_coordinate,
    bucket.toString(),
    sortedChars
  ].join("||");
  return crypto.createHash("sha256").update(payload).digest("hex");
}

// ============================================================
// 2. SIMILARITY FUNCTIONS
// ============================================================

export function jaccardSimilarity(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): number {
  const keysA = new Set(Object.keys(a));
  const keysB = new Set(Object.keys(b));
  let intersection = 0;
  for (const k of Array.from(keysA)) {
    if (keysB.has(k)) intersection++;
  }
  const union = keysA.size + keysB.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

// ============================================================
// 3. PRECEDENCE CONFIDENCE SCORING
// Score_n = P₀ × (1 + (C - N) × λ_n)
// λ_n = 1/√(C + N + 1)
// W = 0.7c + 0.3Score
// LABEL: Bayesian-inspired HEURISTIC, not proper Bayesian inference
// ============================================================

export function precedenceScore(record: PrecedenceRecord): number {
  const P0 = 0.5;
  const lambda = 1 / Math.sqrt(record.confirmations + record.negations + 1);
  const raw = P0 * (1 + (record.confirmations - record.negations) * lambda);
  return clamp(raw, 0, 1);
}

export function weightedConfidence(
  rawConfidence: number | null,
  precedence: PrecedenceRecord
): number | null {
  if (rawConfidence === null || rawConfidence === undefined) return null;
  const score = precedenceScore(precedence);
  return 0.7 * rawConfidence + 0.3 * score;
}

// ============================================================
// 4. GEOGRAPHIC DISTANCE
// Haversine: d = R × 2 × atan2(√a, √(1-a))
// Network adjacency kernel: s_g = exp(-d²/(2σ²))
// ============================================================

const EARTH_RADIUS_KM = 6371;

export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const toRad = (deg: number) => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

export function spatialSimilarityHaversine(
  geo_a: string,
  geo_b: string,
  registry: GeographyRegistry,
  sigma_km: number
): number | null {
  if (geo_a === geo_b) return 1.0;
  const entryA = registry.entries.find(e => e.id === geo_a);
  const entryB = registry.entries.find(e => e.id === geo_b);
  if (!entryA?.centroid_lat || !entryA?.centroid_lon ||
      !entryB?.centroid_lat || !entryB?.centroid_lon) {
    return null; // Cannot compute — missing geometry
  }
  const d = haversineDistance(
    entryA.centroid_lat, entryA.centroid_lon,
    entryB.centroid_lat, entryB.centroid_lon
  );
  return Math.exp(-(d * d) / (2 * sigma_km * sigma_km));
}

export function networkAdjacencyKernel(
  geo_a: string,
  geo_b: string,
  registry: GeographyRegistry,
  sigma_hops: number
): number | null {
  if (geo_a === geo_b) return 1.0;
  const visited = new Set<string>([geo_a]);
  let frontier = [geo_a];
  let depth = 0;
  while (frontier.length > 0 && depth < 100) {
    depth++;
    const next: string[] = [];
    for (const node of frontier) {
      const entry = registry.entries.find(e => e.id === node);
      if (!entry?.adjacency) continue;
      for (const neighbor of entry.adjacency) {
        if (neighbor === geo_b) {
          return Math.exp(-(depth * depth) / (2 * sigma_hops * sigma_hops));
        }
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }
  return null; // Not reachable
}

// ============================================================
// 5. CONVERGENCE DETECTION
//
// Multiplicative: C₂ = |T| × c̄ × ln(n + 1) × (0.5 + 0.5r)
// Recency: r = 1 - (as_of - t_max)/Δt_window
// Poisson: E[n] = (N_total / A_total) × A_geography
//          Z = (n_observed - E[n]) / √E[n]
//
// NO p-value language. Report Z-score, E[n], n_observed, null model.
// Missing area = UNRESOLVED status.
// ============================================================

export function detectConvergence(input: ConvergenceInput): ConvergenceResult {
  const { geography, signals, as_of, time_window_ms, total_signals_all_geographies, geography_registry } = input;
  const n = signals.length;
  const sourceIds = signals.map(s => s.id ?? "unknown");

  if (n === 0) {
    return emptyConvergenceResult(geography, geography_registry);
  }

  // Dominant type: most frequent from RAW source-signal frequency distribution
  const typeCounts = new Map<string, number>();
  for (const s of signals) {
    typeCounts.set(s.signal_type, (typeCounts.get(s.signal_type) ?? 0) + 1);
  }
  const T = typeCounts.size;
  const dominant = Array.from(typeCounts.entries())
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";

  // Mean confidence — only from signals that HAVE confidence
  const withConfidence = signals.filter(s => s.confidence !== null && s.confidence !== undefined);
  const meanConf = withConfidence.length > 0
    ? withConfidence.reduce((sum, s) => sum + (s.confidence as number), 0) / withConfidence.length
    : null;

  // Recency factor: r = 1 - (as_of - t_max)/Δt_window
  const tMax = Math.max(...signals.map(s => s.temporal_coordinate));
  const r = clamp(1 - (as_of - tMax) / time_window_ms, 0, 1);

  // Multiplicative convergence score (null if no confidence available)
  const multiplicative = meanConf !== null
    ? T * meanConf * Math.log(n + 1) * (0.5 + 0.5 * r)
    : null;

  // Poisson Z-score — AREA WEIGHTED
  const geoEntry = geography_registry.entries.find(e => e.id === geography);
  const totalArea = geography_registry.entries.reduce((sum, e) => sum + e.area_sq_km, 0);

  let poisson: PoissonResult;
  if (!geoEntry) {
    poisson = {
      status: "unresolved",
      expected_count: null,
      observed_count: n,
      z_score: null,
      reason_unresolved: `Geography '${geography}' not found in registry version ${geography_registry.version}`,
    };
  } else if (geoEntry.area_sq_km <= 0) {
    poisson = {
      status: "unresolved",
      expected_count: null,
      observed_count: n,
      z_score: null,
      reason_unresolved: `Geography '${geography}' has invalid area (${geoEntry.area_sq_km} sq km)`,
    };
  } else if (totalArea <= 0) {
    poisson = {
      status: "unresolved",
      expected_count: null,
      observed_count: n,
      z_score: null,
      reason_unresolved: "Total registry area is zero or negative",
    };
  } else {
    const expected = (total_signals_all_geographies / totalArea) * geoEntry.area_sq_km;
    if (expected <= 0) {
      poisson = {
        status: "unresolved",
        expected_count: 0,
        observed_count: n,
        z_score: null,
        reason_unresolved: "Expected count is zero (no signals in system)",
      };
    } else {
      const sigma = Math.sqrt(expected);
      const z = (n - expected) / sigma;
      poisson = {
        status: "resolved",
        expected_count: round4(expected),
        observed_count: n,
        z_score: round4(z),
      };
    }
  }

  const nullModel: NullModelReport = {
    model_id: "area_weighted_poisson",
    hypothesis: "H₀: Signals distributed uniformly across geography proportional to area",
    assumptions: [
      "Signal generation is independent across geographies",
      "Area is a valid proxy for expected signal density",
      "Signals within the time window are independent observations",
      "The geography registry is complete for the analysis domain",
    ],
    geography_registry_version: geography_registry.version,
    total_area_sq_km: round4(totalArea),
    geography_area_sq_km: geoEntry ? round4(geoEntry.area_sq_km) : null,
    total_signals: total_signals_all_geographies,
  };

  return {
    geography,
    distinct_types: T,
    signal_count: n,
    mean_confidence: meanConf !== null ? round4(meanConf) : null,
    recency_factor: round4(r),
    multiplicative_score: multiplicative !== null ? round4(multiplicative) : null,
    poisson,
    dominant_type: dominant,
    null_model: nullModel,
    source_signal_ids: sourceIds,
  };
}

function emptyConvergenceResult(geography: string, registry: GeographyRegistry): ConvergenceResult {
  return {
    geography,
    distinct_types: 0,
    signal_count: 0,
    mean_confidence: null,
    recency_factor: 0,
    multiplicative_score: null,
    poisson: { status: "unresolved", expected_count: null, observed_count: 0, z_score: null, reason_unresolved: "No signals" },
    dominant_type: "none",
    null_model: {
      model_id: "area_weighted_poisson",
      hypothesis: "H₀: Signals distributed uniformly across geography proportional to area",
      assumptions: [],
      geography_registry_version: registry.version,
      total_area_sq_km: 0,
      geography_area_sq_km: null,
      total_signals: 0,
    },
    source_signal_ids: [],
  };
}

// ============================================================
// 6. SIGNAL LINKING
//
// Temporal: s_t = 1 - Δt/Δt_max
// Spatial: s_g = exp(-d²/2σ²) using Haversine distance
// Joint: S = s_t × s_g
// ============================================================

export function temporalSimilarity(
  t1: number, t2: number, maxDistance: number
): number {
  if (maxDistance <= 0) return 0;
  const delta = Math.abs(t2 - t1);
  return clamp(1 - delta / maxDistance, 0, 1);
}

export function jointSimilarity(input: SimilarityInput): {
  joint: number | null;
  temporal: number;
  spatial: number | null;
  distance_km: number | null;
} {
  const st = temporalSimilarity(
    input.signal_a.temporal_coordinate,
    input.signal_b.temporal_coordinate,
    input.max_temporal_distance_ms
  );

  const sg = spatialSimilarityHaversine(
    input.signal_a.spatial_coordinate,
    input.signal_b.spatial_coordinate,
    input.geography_registry,
    input.spatial_sigma_km
  );

  const entryA = input.geography_registry.entries.find(e => e.id === input.signal_a.spatial_coordinate);
  const entryB = input.geography_registry.entries.find(e => e.id === input.signal_b.spatial_coordinate);
  let distance_km: number | null = null;
  if (entryA?.centroid_lat && entryA?.centroid_lon && entryB?.centroid_lat && entryB?.centroid_lon) {
    distance_km = round4(haversineDistance(
      entryA.centroid_lat, entryA.centroid_lon,
      entryB.centroid_lat, entryB.centroid_lon
    ));
  }

  return {
    joint: sg !== null ? round4(st * sg) : null,
    temporal: round4(st),
    spatial: sg !== null ? round4(sg) : null,
    distance_km,
  };
}

// ============================================================
// 7. ACTION PRIORITIZATION (Decision Theory)
//
// Priority = 10 × (0.4·u_urgency + 0.3·u_equity + 0.2·u_feasibility + 0.1·u_confidence)
//
// ALL utility inputs must come from DECLARED sources.
// The engine does NOT manufacture urgency/equity/feasibility/confidence.
// ============================================================

export function priorityScore(input: PriorityInput): number {
  const u = clamp(input.urgency, 0, 1);
  const e = clamp(input.equity, 0, 1);
  const f = clamp(input.feasibility, 0, 1);
  const c = clamp(input.confidence, 0, 1);
  const raw = 10 * (0.4 * u + 0.3 * e + 0.2 * f + 0.1 * c);
  return round4(clamp(raw, 0, 10));
}

export function priorityScoreFromDeclared(declared: DeclaredUtilities): {
  score: number;
  sources: Record<string, string>;
} {
  const score = priorityScore({
    urgency: declared.urgency.value,
    equity: declared.equity.value,
    feasibility: declared.feasibility.value,
    confidence: declared.confidence.value,
  });
  return {
    score,
    sources: {
      urgency: declared.urgency.source,
      equity: declared.equity.source,
      feasibility: declared.feasibility.source,
      confidence: declared.confidence.source,
    },
  };
}

export function urgencyFromDeadline(remainingMs: number, totalWindowMs: number): number {
  if (totalWindowMs <= 0) return 1;
  return clamp(1 - remainingMs / totalWindowMs, 0, 1);
}

export function feasibilityScore(available: number, required: number): number {
  if (required <= 0) return 1;
  return clamp(available / required, 0, 1);
}

// ============================================================
// 8. GEOGRAPHIC NORMALIZATION
//
// w(s→t) = A(s∩t)/A(s)
// w_normalized = w_raw / Σₜ w_raw  (partition of unity)
// c'ₜ = cₛ × w(s→t)
// Validation: |Σw - 1.0| ≤ 1e-6
// ============================================================

export function normalizeGeographicWeights(
  allocations: GeographicAllocation[]
): GeographicAllocation[] {
  if (allocations.length === 0) return [];
  const totalWeight = allocations.reduce((sum, a) => sum + a.weight, 0);
  if (totalWeight === 0) return allocations.map(a => ({ ...a, weight: 0 }));
  const normalized = allocations.map(a => ({
    ...a,
    weight: a.weight / totalWeight,
  }));
  const sum = normalized.reduce((s, a) => s + a.weight, 0);
  if (Math.abs(sum - 1.0) > 1e-6) {
    throw new Error(
      `Geographic normalization failed conservation: |Σw - 1.0| = ${Math.abs(sum - 1.0)} > 1e-6`
    );
  }
  return normalized;
}

export function validatePartitionOfUnity(weights: number[], tolerance: number = 1e-6): {
  valid: boolean;
  sum: number;
  deviation: number;
} {
  const sum = weights.reduce((s, w) => s + w, 0);
  const deviation = Math.abs(sum - 1.0);
  return { valid: deviation <= tolerance, sum, deviation };
}

export function translateSignalConfidence(
  sourceConfidence: number | null,
  weight: number
): number | null {
  if (sourceConfidence === null) return null;
  return sourceConfidence * weight;
}

// ============================================================
// 9. DEDUPLICATION
// Fingerprint uses declared temporal bucket (default 1 day).
// ============================================================

export function deduplicateSignals(
  signals: Signal[],
  temporal_bucket_ms: number = 86_400_000
): Signal[] {
  const seen = new Map<string, Signal>();
  for (const signal of signals) {
    const fp = signalFingerprint(signal, temporal_bucket_ms);
    const existing = seen.get(fp);
    if (!existing) {
      seen.set(fp, signal);
    } else {
      const existConf = existing.confidence ?? -1;
      const newConf = signal.confidence ?? -1;
      if (newConf > existConf) {
        seen.set(fp, signal);
      }
    }
  }
  return Array.from(seen.values());
}

// ============================================================
// 10. PROVENANCE RECEIPT GENERATION
// ============================================================

export function generateProvenanceReceipt(params: {
  equation_id: string;
  as_of: number;
  config: Record<string, unknown>;
  input_signals: Signal[];
  geography_registry_version: string;
  expected_count: number | null;
  observed_count: number;
  computed_outputs: Record<string, unknown>;
}): ProvenanceReceipt {
  const configHash = crypto.createHash("sha256")
    .update(JSON.stringify(params.config))
    .digest("hex")
    .substring(0, 16);

  const inputHash = crypto.createHash("sha256")
    .update(JSON.stringify(params.input_signals.map(s => s.id ?? signalFingerprint(s))))
    .digest("hex")
    .substring(0, 16);

  const ruleManifestHash = crypto.createHash("sha256")
    .update(JSON.stringify(ENGINE_EQUATIONS))
    .digest("hex")
    .substring(0, 16);

  return {
    equation_id: params.equation_id,
    engine_version: ENGINE_VERSION,
    rule_manifest_hash: ruleManifestHash,
    as_of: params.as_of,
    configuration_hash: configHash,
    input_hash: inputHash,
    source_signal_ids: params.input_signals.map(s => s.id ?? "unknown"),
    geography_registry_version: params.geography_registry_version,
    expected_count: params.expected_count,
    observed_count: params.observed_count,
    computed_outputs: params.computed_outputs,
    timestamp_computed: Date.now(), // Audit trail only — NOT used in math
  };
}

// ============================================================
// UTILITIES
// ============================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

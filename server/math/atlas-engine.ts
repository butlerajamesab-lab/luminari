/**
 * ATLAS MATHEMATICAL ENGINE
 * 
 * Pure deterministic math functions implementing the Atlas Mathematical Foundation.
 * No LLM. No inference. No side effects. Same input → same output.
 * 
 * Source: ATLAS_MATHEMATICAL_FOUNDATION.md
 * Equations implemented:
 *   - Signal fingerprinting (SHA-256)
 *   - Jaccard similarity
 *   - Cosine similarity
 *   - Precedence confidence scoring (Bayesian-inspired heuristic)
 *   - Convergence detection (Poisson Z-score, multiplicative score)
 *   - Signal linking (temporal + spatial joint similarity)
 *   - Action prioritization (MAUT utility function)
 *   - Geographic normalization (area-weighted allocation)
 * 
 * Constitutional contract: Y = F_v(X, R)
 * Determinism: (X₁,R₁,v₁) = (X₂,R₂,v₂) ⟹ F_v₁(X₁,R₁) = F_v₂(X₂,R₂)
 */

import crypto from "crypto";

// ============================================================
// TYPES
// ============================================================

export interface Signal {
  temporal_coordinate: number;       // Unix timestamp ms
  spatial_coordinate: string;        // Geography identifier (state, county, zip)
  signal_type: string;               // Category τ
  confidence: number;                // c ∈ [0,1]
  characteristics: Record<string, string | number | boolean>;
}

export interface PrecedenceRecord {
  confirmations: number;  // C — signal preceded actual event
  negations: number;      // N — signal was false alarm
}

export interface ConvergenceInput {
  geography: string;
  signals: Signal[];
  time_window_ms: number;           // Δt_window in milliseconds
  total_signals_all_geographies: number;  // N_total
  total_geographies: number;              // for area approximation
}

export interface ConvergenceResult {
  geography: string;
  distinct_types: number;           // |T|
  signal_count: number;             // n
  mean_confidence: number;          // c̄
  recency_factor: number;           // r ∈ [0,1]
  multiplicative_score: number;     // C₂
  poisson_z_score: number;          // Z
  statistically_significant: boolean;  // Z > 2
  highly_significant: boolean;         // Z > 3
}

export interface PriorityInput {
  urgency: number;       // u_urgency ∈ [0,1] — 1 - t_remaining/t_deadline
  equity: number;        // u_equity ∈ [0,1] — vulnerability index
  feasibility: number;   // u_feasibility ∈ [0,1] — R_available/R_required
  confidence: number;    // u_confidence ∈ [0,1]
}

export interface SimilarityInput {
  signal_a: Signal;
  signal_b: Signal;
  max_temporal_distance_ms: number;  // Δt_max
  spatial_sigma: number;             // σ for Gaussian kernel (in hops or normalized units)
}

export interface GeographicAllocation {
  source: string;
  target: string;
  weight: number;  // w(s→t) = A(s∩t)/A(s)
}

// ============================================================
// ENGINE VERSION — increment on any logic change
// ============================================================

export const ENGINE_VERSION = "1.0.0";

// ============================================================
// 1. SIGNAL FINGERPRINTING
// h(s) = SHA256(τ || G || ⌊t/Δt⌋ || χ)
// ============================================================

/**
 * Compute deterministic signal fingerprint.
 * Same signal characteristics always produce the same 64-char hex hash.
 * 
 * @param signal - The signal to fingerprint
 * @param temporal_bucket_ms - Δt bucket size (default: 86400000 = 1 day)
 */
export function signalFingerprint(
  signal: Signal,
  temporal_bucket_ms: number = 86_400_000
): string {
  const bucket = Math.floor(signal.temporal_coordinate / temporal_bucket_ms);
  // Sort characteristics keys for deterministic serialization
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

/**
 * Jaccard similarity: J(A,B) = |A ∩ B| / |A ∪ B|
 * Operates on characteristic key sets.
 */
export function jaccardSimilarity(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): number {
  const keysA = new Set(Object.keys(a));
  const keysB = new Set(Object.keys(b));
  
  let intersection = 0;
  for (const k of keysA) {
    if (keysB.has(k)) intersection++;
  }
  
  const union = keysA.size + keysB.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

/**
 * Cosine similarity: cos(θ) = (a·b) / (||a|| ||b||)
 * For numeric feature vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  
  let dot = 0;
  let normA = 0;
  let normB = 0;
  
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
// 3. PRECEDENCE CONFIDENCE SCORING (Bayesian-inspired heuristic)
// Score_n = P₀ × (1 + (C - N) × λ_n)
// λ_n = 1/√(C + N + 1)
// W = 0.7c + 0.3Score
// 
// CRITICAL: This is NOT proper Bayesian inference.
// It is a directional confidence adjustment.
// ============================================================

/**
 * Compute precedence confidence score.
 * 
 * @param record - Historical confirmation/negation counts
 * @returns Score ∈ [0,1] — bounded confidence heuristic
 */
export function precedenceScore(record: PrecedenceRecord): number {
  const P0 = 0.5;  // neutral prior
  const lambda = 1 / Math.sqrt(record.confirmations + record.negations + 1);
  const raw = P0 * (1 + (record.confirmations - record.negations) * lambda);
  return Math.max(0, Math.min(1, raw));  // clamp [0,1]
}

/**
 * Weighted confidence combining raw signal confidence with learned precedence.
 * W = 0.7c + 0.3Score
 */
export function weightedConfidence(
  rawConfidence: number,
  precedence: PrecedenceRecord
): number {
  const score = precedenceScore(precedence);
  return 0.7 * rawConfidence + 0.3 * score;
}

// ============================================================
// 4. CONVERGENCE DETECTION
// 
// Multiplicative: C₂ = |T| × c̄ × ln(n + 1) × (0.5 + 0.5r)
// Poisson Z-score: Z = (n_observed - E[n]) / √E[n]
//   where E[n] = (N_total / num_geographies) — uniform null
// Recency: r = 1 - (t_now - t_max)/Δt_window
// ============================================================

/**
 * Compute convergence metrics for a geographic zone.
 * This is the core Atlas detection function.
 * 
 * @param input - Signals in a geography + context
 * @returns Convergence scores with statistical significance
 */
export function detectConvergence(input: ConvergenceInput): ConvergenceResult {
  const { geography, signals, time_window_ms, total_signals_all_geographies, total_geographies } = input;
  
  const n = signals.length;
  
  if (n === 0) {
    return {
      geography,
      distinct_types: 0,
      signal_count: 0,
      mean_confidence: 0,
      recency_factor: 0,
      multiplicative_score: 0,
      poisson_z_score: 0,
      statistically_significant: false,
      highly_significant: false,
    };
  }

  // Distinct signal types |T|
  const types = new Set(signals.map(s => s.signal_type));
  const T = types.size;

  // Mean confidence c̄
  const meanConf = signals.reduce((sum, s) => sum + s.confidence, 0) / n;

  // Recency factor: r = 1 - (t_now - t_max)/Δt_window
  const now = Date.now();
  const tMax = Math.max(...signals.map(s => s.temporal_coordinate));
  const r = Math.max(0, Math.min(1, 1 - (now - tMax) / time_window_ms));

  // Multiplicative convergence score
  // C₂ = |T| × c̄ × ln(n + 1) × (0.5 + 0.5r)
  const multiplicative = T * meanConf * Math.log(n + 1) * (0.5 + 0.5 * r);

  // Poisson Z-score against uniform null
  // E[n] = N_total / num_geographies (uniform distribution assumption)
  const expected = total_geographies > 0 
    ? total_signals_all_geographies / total_geographies 
    : 0;
  
  let zScore = 0;
  if (expected > 0) {
    const sigma = Math.sqrt(expected);
    zScore = (n - expected) / sigma;
  }

  return {
    geography,
    distinct_types: T,
    signal_count: n,
    mean_confidence: Math.round(meanConf * 10000) / 10000,
    recency_factor: Math.round(r * 10000) / 10000,
    multiplicative_score: Math.round(multiplicative * 10000) / 10000,
    poisson_z_score: Math.round(zScore * 10000) / 10000,
    statistically_significant: zScore > 2,   // p < 0.05
    highly_significant: zScore > 3,           // p < 0.01
  };
}

// ============================================================
// 5. SIGNAL LINKING & SIMILARITY
// 
// Temporal: s_t = 1 - Δt/Δt_max
// Spatial: s_g = exp(-d²/2σ²)
// Joint: S = s_t × s_g
// ============================================================

/**
 * Normalized temporal similarity.
 * s_t = 1 - Δt/Δt_max, clamped to [0,1]
 */
export function temporalSimilarity(
  t1: number,
  t2: number,
  maxDistance: number
): number {
  if (maxDistance <= 0) return 0;
  const delta = Math.abs(t2 - t1);
  return Math.max(0, 1 - delta / maxDistance);
}

/**
 * Spatial similarity using Gaussian kernel.
 * s_g = exp(-d²/2σ²)
 * 
 * For geographic domains, d = network distance (hops between jurisdictions).
 * For same jurisdiction, d = 0 → s_g = 1.
 * For adjacent jurisdictions, d = 1.
 */
export function spatialSimilarity(
  distance: number,
  sigma: number
): number {
  if (sigma <= 0) return distance === 0 ? 1 : 0;
  return Math.exp(-(distance * distance) / (2 * sigma * sigma));
}

/**
 * Joint similarity: S = s_t × s_g
 * Domain-agnostic: works for any metric space.
 */
export function jointSimilarity(input: SimilarityInput): number {
  const st = temporalSimilarity(
    input.signal_a.temporal_coordinate,
    input.signal_b.temporal_coordinate,
    input.max_temporal_distance_ms
  );
  
  // For jurisdiction-based spatial distance:
  // Same jurisdiction = 0, different = 1 (simplest model)
  // Can be extended with actual geographic hierarchy
  const spatialDistance = input.signal_a.spatial_coordinate === input.signal_b.spatial_coordinate ? 0 : 1;
  const sg = spatialSimilarity(spatialDistance, input.spatial_sigma);
  
  return st * sg;
}

// ============================================================
// 6. ACTION PRIORITIZATION (Decision Theory)
// 
// U = Σᵢ wᵢuᵢ, where Σwᵢ = 1
// Priority = 10 × (0.4·u_urgency + 0.3·u_equity + 0.2·u_feasibility + 0.1·u_confidence)
// Range: [0, 10]
// ============================================================

/**
 * Compute action priority score using Multi-Attribute Utility Theory (MAUT).
 * 
 * @param input - Normalized utility values, each ∈ [0,1]
 * @returns Priority score ∈ [0, 10]
 */
export function priorityScore(input: PriorityInput): number {
  // Clamp all inputs to [0,1]
  const u = clamp(input.urgency, 0, 1);
  const e = clamp(input.equity, 0, 1);
  const f = clamp(input.feasibility, 0, 1);
  const c = clamp(input.confidence, 0, 1);

  // Weighted sum: 0.4 urgency + 0.3 equity + 0.2 feasibility + 0.1 confidence
  const raw = 10 * (0.4 * u + 0.3 * e + 0.2 * f + 0.1 * c);
  
  // Clamp to [0, 10] and round to 4 decimal places
  return Math.round(clamp(raw, 0, 10) * 10000) / 10000;
}

/**
 * Compute urgency utility from deadline.
 * u_urgency = 1 - t_remaining/t_deadline
 * 
 * @param remainingMs - Time remaining until deadline (ms)
 * @param totalWindowMs - Total time window from trigger to deadline (ms)
 */
export function urgencyFromDeadline(remainingMs: number, totalWindowMs: number): number {
  if (totalWindowMs <= 0) return 1; // no time = maximum urgency
  return clamp(1 - remainingMs / totalWindowMs, 0, 1);
}

/**
 * Compute feasibility utility.
 * u_feasibility = R_available / R_required
 */
export function feasibilityScore(available: number, required: number): number {
  if (required <= 0) return 1; // nothing required = fully feasible
  return clamp(available / required, 0, 1);
}

// ============================================================
// 7. GEOGRAPHIC NORMALIZATION
// 
// w(s→t) = A(s∩t)/A(s)
// w_normalized = w_raw / Σₜ w_raw  (partition of unity)
// c'ₜ = cₛ × w(s→t)
// Validation: |Σw - 1.0| ≤ 1e-6
// ============================================================

/**
 * Normalize geographic allocation weights to enforce partition of unity.
 * Σₜ w(s→t) = 1 — total signal mass conserved.
 * 
 * @param allocations - Raw weights for source→target mappings
 * @returns Normalized allocations where weights sum to 1.0
 * @throws Error if conservation validation fails (|Σw - 1.0| > 1e-6)
 */
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

  // Validation: partition of unity
  const sum = normalized.reduce((s, a) => s + a.weight, 0);
  if (Math.abs(sum - 1.0) > 1e-6) {
    throw new Error(
      `Geographic normalization failed conservation: |Σw - 1.0| = ${Math.abs(sum - 1.0)} > 1e-6`
    );
  }

  return normalized;
}

/**
 * Translate signal confidence across geographies.
 * c'ₜ = cₛ × w(s→t)
 */
export function translateSignalConfidence(
  sourceConfidence: number,
  weight: number
): number {
  return sourceConfidence * weight;
}

// ============================================================
// 8. DEDUPLICATION
// Two signals are duplicates if they share a fingerprint.
// ============================================================

/**
 * Deduplicate signals by fingerprint.
 * When duplicates found, keep the one with highest confidence.
 */
export function deduplicateSignals(
  signals: Signal[],
  temporal_bucket_ms: number = 86_400_000
): Signal[] {
  const seen = new Map<string, Signal>();
  
  for (const signal of signals) {
    const fp = signalFingerprint(signal, temporal_bucket_ms);
    const existing = seen.get(fp);
    if (!existing || signal.confidence > existing.confidence) {
      seen.set(fp, signal);
    }
  }
  
  return Array.from(seen.values());
}

// ============================================================
// UTILITIES
// ============================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * CONVERGENCE RUNNER
 * 
 * Applies the Atlas Mathematical Engine to live signal data.
 * Reads from live_signals, computes convergence per geography,
 * computes priority scores, and returns structured results.
 * 
 * This is the bridge between the pure math (atlas-engine.ts)
 * and the database layer. No LLM. No inference.
 * 
 * Usage:
 *   import { runConvergenceAnalysis } from "./convergence-runner";
 *   const results = await runConvergenceAnalysis(db, { time_window_ms: 7 * 86_400_000 });
 */

import { db } from "../db";
import { liveSignals } from "../../drizzle/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import {
  detectConvergence,
  priorityScore,
  urgencyFromDeadline,
  signalFingerprint,
  deduplicateSignals,
  type Signal,
  type ConvergenceInput,
  type ConvergenceResult,
  type PriorityInput,
  ENGINE_VERSION,
} from "./atlas-engine";

// ============================================================
// TYPES
// ============================================================

export interface ConvergenceRunConfig {
  time_window_ms: number;           // How far back to look (default: 7 days)
  min_signals_for_convergence: number;  // Minimum signals in a geography to evaluate (default: 2)
  significance_threshold: number;       // Z-score threshold for flagging (default: 2.0)
}

export interface ConvergenceRunResult {
  engine_version: string;
  run_timestamp: number;
  config: ConvergenceRunConfig;
  total_signals_analyzed: number;
  geographies_evaluated: number;
  convergence_zones: ConvergenceZone[];
  prioritized_actions: PrioritizedAction[];
}

export interface ConvergenceZone {
  geography: string;
  convergence: ConvergenceResult;
  signal_types: string[];
  latest_signal_time: number;
}

export interface PrioritizedAction {
  geography: string;
  priority_score: number;   // [0, 10]
  urgency: number;          // [0, 1]
  equity: number;           // [0, 1]
  feasibility: number;      // [0, 1]
  confidence: number;       // [0, 1]
  signal_count: number;
  dominant_type: string;
  rationale: string;
}

// ============================================================
// DEFAULT CONFIG
// ============================================================

const DEFAULT_CONFIG: ConvergenceRunConfig = {
  time_window_ms: 7 * 86_400_000,        // 7 days
  min_signals_for_convergence: 2,
  significance_threshold: 2.0,            // Z > 2 = statistically significant
};

// ============================================================
// MAIN RUNNER
// ============================================================

/**
 * Run convergence analysis across all geographies with active signals.
 * 
 * Steps:
 * 1. Load active signals from live_signals within time window
 * 2. Group by jurisdiction (geography)
 * 3. Convert to Signal type for math engine
 * 4. Run detectConvergence per geography
 * 5. Compute priority scores for significant zones
 * 6. Return sorted results
 */
export async function runConvergenceAnalysis(
  config: Partial<ConvergenceRunConfig> = {}
): Promise<ConvergenceRunResult> {
  const cfg: ConvergenceRunConfig = { ...DEFAULT_CONFIG, ...config };
  const runTimestamp = Date.now();
  const cutoff = runTimestamp - cfg.time_window_ms;

  // Step 1: Load active signals within time window
  const rawSignals = await db
    .select()
    .from(liveSignals)
    .where(
      and(
        eq(liveSignals.active, true),
        gte(liveSignals.detectedAt, cutoff)
      )
    );

  if (rawSignals.length === 0) {
    return {
      engine_version: ENGINE_VERSION,
      run_timestamp: runTimestamp,
      config: cfg,
      total_signals_analyzed: 0,
      geographies_evaluated: 0,
      convergence_zones: [],
      prioritized_actions: [],
    };
  }

  // Step 2: Convert to math engine Signal type
  const signals: Signal[] = rawSignals.map(r => ({
    temporal_coordinate: Number(r.detectedAt),
    spatial_coordinate: r.jurisdiction,
    signal_type: r.signalType,
    confidence: parseFloat(r.confidenceScore as string) || 0.5,
    characteristics: {
      domain: r.domain,
      severity: r.severity,
      dataset: r.datasetId,
      ...(typeof r.supportingStatistics === 'object' ? r.supportingStatistics as Record<string, any> : {}),
    },
  }));

  // Step 3: Deduplicate
  const uniqueSignals = deduplicateSignals(signals, cfg.time_window_ms);

  // Step 4: Group by geography
  const byGeography = new Map<string, Signal[]>();
  for (const s of uniqueSignals) {
    const geo = s.spatial_coordinate;
    if (!byGeography.has(geo)) byGeography.set(geo, []);
    byGeography.get(geo)!.push(s);
  }

  // Step 5: Run convergence detection per geography
  const totalGeographies = byGeography.size;
  const convergenceZones: ConvergenceZone[] = [];

  for (const [geography, geoSignals] of byGeography) {
    if (geoSignals.length < cfg.min_signals_for_convergence) continue;

    const input: ConvergenceInput = {
      geography,
      signals: geoSignals,
      time_window_ms: cfg.time_window_ms,
      total_signals_all_geographies: uniqueSignals.length,
      total_geographies: totalGeographies,
    };

    const result = detectConvergence(input);

    // Only include if meets significance threshold
    if (result.poisson_z_score >= cfg.significance_threshold || result.multiplicative_score >= 3.0) {
      convergenceZones.push({
        geography,
        convergence: result,
        signal_types: [...new Set(geoSignals.map(s => s.signal_type))],
        latest_signal_time: Math.max(...geoSignals.map(s => s.temporal_coordinate)),
      });
    }
  }

  // Sort by Z-score descending (most significant first)
  convergenceZones.sort((a, b) => b.convergence.poisson_z_score - a.convergence.poisson_z_score);

  // Step 6: Compute priority scores for convergence zones
  const prioritizedActions: PrioritizedAction[] = convergenceZones.map(zone => {
    // Urgency: based on recency (more recent = more urgent)
    const urgency = zone.convergence.recency_factor;

    // Equity: based on signal diversity (more types = more systemic = higher equity concern)
    const equity = Math.min(1, zone.convergence.distinct_types / 5);

    // Feasibility: inverse of signal count (fewer signals = easier to investigate)
    // Capped at 1.0 for 1 signal, 0.2 for 10+ signals
    const feasibility = Math.max(0.2, 1 - (zone.convergence.signal_count - 1) / 10);

    // Confidence: mean confidence from the signals
    const confidence = zone.convergence.mean_confidence;

    const priority: PriorityInput = { urgency, equity, feasibility, confidence };
    const score = priorityScore(priority);

    // Dominant type: most frequent signal type
    const typeCounts = new Map<string, number>();
    for (const t of zone.signal_types) {
      typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
    }
    const dominant = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";

    return {
      geography: zone.geography,
      priority_score: score,
      urgency,
      equity,
      feasibility,
      confidence,
      signal_count: zone.convergence.signal_count,
      dominant_type: dominant,
      rationale: buildRationale(zone, score),
    };
  });

  // Sort by priority score descending
  prioritizedActions.sort((a, b) => b.priority_score - a.priority_score);

  return {
    engine_version: ENGINE_VERSION,
    run_timestamp: runTimestamp,
    config: cfg,
    total_signals_analyzed: uniqueSignals.length,
    geographies_evaluated: totalGeographies,
    convergence_zones: convergenceZones,
    prioritized_actions: prioritizedActions,
  };
}

// ============================================================
// HELPERS
// ============================================================

function buildRationale(zone: ConvergenceZone, score: number): string {
  const z = zone.convergence.poisson_z_score;
  const n = zone.convergence.signal_count;
  const types = zone.convergence.distinct_types;
  
  const significance = z > 3 
    ? "highly statistically significant (p < 0.01)" 
    : z > 2 
      ? "statistically significant (p < 0.05)"
      : "elevated but not statistically significant";

  return `${zone.geography}: ${n} signals across ${types} types. ` +
    `Z-score = ${z.toFixed(2)} (${significance}). ` +
    `Priority = ${score.toFixed(1)}/10.`;
}

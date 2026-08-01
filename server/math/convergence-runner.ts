/**
 * CONVERGENCE RUNNER v2.0.0
 *
 * Applies the Atlas Mathematical Engine to live signal data.
 * Reads from live_signals, loads geography_registry, computes convergence
 * per geography using area-weighted Poisson, and persists provenance receipts.
 *
 * REPAIR NOTES:
 *   - as_of is explicit input (no Date.now() in math paths)
 *   - Geography registry loaded from canonical source (no equal-geography fallback)
 *   - Priority scoring does NOT manufacture utility values — removed from runner
 *   - Missing confidence propagated as null (never 0.5)
 *   - Dominant type from raw frequency distribution (in atlas-engine)
 *   - Provenance receipts persisted to convergence_receipts table
 *   - No p-value language in outputs
 */

import { db } from "../db";
import { liveSignals } from "../../drizzle/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import {
  detectConvergence,
  deduplicateSignals,
  generateProvenanceReceipt,
  type Signal,
  type ConvergenceInput,
  type ConvergenceResult,
  type GeographyRegistry,
  type ProvenanceReceipt,
  ENGINE_VERSION,
} from "./atlas-engine";

// ============================================================
// TYPES
// ============================================================

export interface ConvergenceConfig {
  as_of: number;                      // REQUIRED — explicit timestamp
  time_window_ms: number;             // Analysis window (default 7 days)
  temporal_bucket_ms?: number;        // Fingerprint bucket (default 1 day)
  min_signals_for_analysis?: number;  // Minimum signals in a geography to analyze
  z_score_threshold?: number;         // Minimum Z-score to report (default 2.0)
}

export interface ConvergenceZone {
  geography: string;
  convergence: ConvergenceResult;
  provenance: ProvenanceReceipt;
}

export interface ConvergenceRunResult {
  engine_version: string;
  as_of: number;
  config: ConvergenceConfig;
  geography_registry_version: string;
  total_signals_analyzed: number;
  total_signals_after_dedup: number;
  geographies_evaluated: number;
  convergence_zones: ConvergenceZone[];
  unresolved_geographies: Array<{
    geography: string;
    reason: string;
  }>;
  receipt_ids?: string[];
}

// ============================================================
// GEOGRAPHY REGISTRY LOADER
//
// Loads from the canonical geography_registry table.
// If the table doesn't exist or is empty, returns an error —
// it does NOT fall back to equal-geography assumptions.
// ============================================================

async function loadGeographyRegistry(): Promise<GeographyRegistry | { error: string }> {
  try {
    const rows = await db.execute(sql`
      SELECT id, area_sq_km, centroid_lat, centroid_lon, adjacency, version
      FROM geography_registry
      WHERE active = true
      ORDER BY id
    `);

    if (!rows.rows || rows.rows.length === 0) {
      return { error: "geography_registry table is empty or does not exist. Cannot compute area-weighted convergence without canonical geography data." };
    }

    const version = (rows.rows[0] as any).version ?? "unknown";
    const entries = rows.rows.map((r: any) => ({
      id: r.id as string,
      area_sq_km: parseFloat(r.area_sq_km),
      centroid_lat: r.centroid_lat !== null && r.centroid_lat !== undefined ? parseFloat(r.centroid_lat) : undefined,
      centroid_lon: r.centroid_lon !== null && r.centroid_lon !== undefined ? parseFloat(r.centroid_lon) : undefined,
      adjacency: r.adjacency ? (Array.isArray(r.adjacency) ? r.adjacency : JSON.parse(r.adjacency)) : undefined,
    }));

    // Validate: all entries must have positive area
    const invalidAreas = entries.filter((e: any) => !e.area_sq_km || e.area_sq_km <= 0);
    if (invalidAreas.length > 0) {
      return { error: `${invalidAreas.length} geography entries have invalid area_sq_km: ${invalidAreas.map((e: any) => e.id).join(", ")}` };
    }

    return { version, entries };
  } catch (err: any) {
    return { error: `Failed to load geography_registry: ${err.message}` };
  }
}

// ============================================================
// MAIN RUNNER
// ============================================================

export async function runConvergenceAnalysis(
  config: ConvergenceConfig
): Promise<ConvergenceRunResult> {
  const {
    as_of,
    time_window_ms,
    temporal_bucket_ms = 86_400_000,
    min_signals_for_analysis = 2,
    z_score_threshold = 2.0,
  } = config;

  // Step 1: Load geography registry (canonical, no fallback)
  const registryResult = await loadGeographyRegistry();
  if ("error" in registryResult) {
    return {
      engine_version: ENGINE_VERSION,
      as_of,
      config,
      geography_registry_version: "unavailable",
      total_signals_analyzed: 0,
      total_signals_after_dedup: 0,
      geographies_evaluated: 0,
      convergence_zones: [],
      unresolved_geographies: [{
        geography: "*",
        reason: registryResult.error,
      }],
    };
  }

  const registry: GeographyRegistry = registryResult;

  // Step 2: Load signals within time window [cutoff, as_of]
  // BOTH lower AND upper bounds enforced for deterministic replay.
  // Signals created after as_of cannot enter a historical run.
  const cutoff = as_of - time_window_ms;
  const rawSignals = await db
    .select()
    .from(liveSignals)
    .where(
      and(
        eq(liveSignals.active, true),
        gte(liveSignals.detectedAt, cutoff),
        lte(liveSignals.detectedAt, as_of)
      )
    );

  if (rawSignals.length === 0) {
    // Persist empty-run receipt for audit trail
    const emptyReceipt = generateProvenanceReceipt({
      equation_id: "poisson_z_score",
      as_of,
      config: { time_window_ms, temporal_bucket_ms, min_signals_for_analysis, z_score_threshold },
      input_signals: [],
      geography_registry_version: registry.version,
      expected_count: null,
      observed_count: 0,
      computed_outputs: { status: "empty_run", reason: "no_signals_in_window" },
    });
    const emptyReceiptIds = await persistProvenanceReceipts([emptyReceipt]);
    return {
      engine_version: ENGINE_VERSION,
      as_of,
      config,
      geography_registry_version: registry.version,
      total_signals_analyzed: 0,
      total_signals_after_dedup: 0,
      geographies_evaluated: 0,
      convergence_zones: [],
      unresolved_geographies: [],
      receipt_ids: emptyReceiptIds,
    };
  }

  // Step 3: Convert to math engine Signal type
  // confidence: null if not present — NEVER fabricate 0.5
  const signals: Signal[] = rawSignals.map((r: any) => ({
    id: String(r.id),
    temporal_coordinate: Number(r.detectedAt),
    spatial_coordinate: r.jurisdiction,
    signal_type: r.signalType,
    confidence: r.confidenceScore !== null && r.confidenceScore !== undefined
      ? parseFloat(String(r.confidenceScore))
      : null,
    characteristics: {
      domain: r.domain,
      severity: r.severity,
      dataset: r.datasetId,
      ...(typeof r.supportingStatistics === "object" && r.supportingStatistics !== null
        ? r.supportingStatistics as Record<string, any>
        : {}),
    },
  }));

  const totalSignals = signals.length;

  // Step 4: Deduplicate using declared temporal bucket
  const uniqueSignals = deduplicateSignals(signals, temporal_bucket_ms);

  // Step 5: Group by geography
  const byGeography = new Map<string, Signal[]>();
  for (const s of uniqueSignals) {
    const geo = s.spatial_coordinate;
    if (!byGeography.has(geo)) byGeography.set(geo, []);
    byGeography.get(geo)!.push(s);
  }

  // Step 6: Run convergence detection per geography
  const convergenceZones: ConvergenceZone[] = [];
  const unresolvedGeographies: Array<{ geography: string; reason: string }> = [];

  for (const [geography, geoSignals] of Array.from(byGeography.entries())) {
    if (geoSignals.length < min_signals_for_analysis) continue;

    const input: ConvergenceInput = {
      geography,
      signals: geoSignals,
      as_of,
      time_window_ms,
      total_signals_all_geographies: uniqueSignals.length,
      geography_registry: registry,
    };

    const result = detectConvergence(input);

    // Track unresolved geographies
    if (result.poisson.status === "unresolved") {
      unresolvedGeographies.push({
        geography,
        reason: result.poisson.reason_unresolved ?? "unknown",
      });
    }

    // Generate provenance receipt for EVERY evaluated geography (resolved or not)
    const provenance = generateProvenanceReceipt({
      equation_id: "poisson_z_score",
      as_of,
      config: { time_window_ms, temporal_bucket_ms, min_signals_for_analysis, z_score_threshold },
      input_signals: geoSignals,
      geography_registry_version: registry.version,
      expected_count: result.poisson.expected_count,
      observed_count: result.poisson.observed_count,
      computed_outputs: {
        status: result.poisson.status,
        z_score: result.poisson.z_score,
        multiplicative_score: result.multiplicative_score,
        recency_factor: result.recency_factor,
        dominant_type: result.dominant_type,
        reason_unresolved: result.poisson.reason_unresolved ?? null,
      },
    });

    // Include ALL zones with provenance (not just threshold-exceeding)
    convergenceZones.push({ geography, convergence: result, provenance });
  }

  // Sort by Z-score descending
  convergenceZones.sort((a, b) => {
    const zA = a.convergence.poisson.z_score ?? 0;
    const zB = b.convergence.poisson.z_score ?? 0;
    return zB - zA;
  });

  // Step 7: Persist ALL provenance receipts (resolved, unresolved, below-threshold)
  const receiptIds = await persistProvenanceReceipts(convergenceZones.map(z => z.provenance));

  return {
    engine_version: ENGINE_VERSION,
    as_of,
    config,
    geography_registry_version: registry.version,
    total_signals_analyzed: totalSignals,
    total_signals_after_dedup: uniqueSignals.length,
    geographies_evaluated: byGeography.size,
    convergence_zones: convergenceZones,
    unresolved_geographies: unresolvedGeographies,
    receipt_ids: receiptIds,
  };
}

// ============================================================
// PROVENANCE PERSISTENCE
// ============================================================

async function persistProvenanceReceipts(receipts: ProvenanceReceipt[]): Promise<string[]> {
  if (receipts.length === 0) return [];
  // FAIL-CLOSED: if persistence fails, the entire run fails.
  // No silent discard of provenance data.
  const ids: string[] = [];
  for (const receipt of receipts) {
    const result = await db.execute(sql`
      INSERT INTO convergence_receipts (
        equation_id, engine_version, rule_manifest_hash, as_of,
        configuration_hash, input_hash, source_signal_ids,
        geography_registry_version, expected_count, observed_count,
        computed_outputs, timestamp_computed
      ) VALUES (
        ${receipt.equation_id},
        ${receipt.engine_version},
        ${receipt.rule_manifest_hash},
        ${receipt.as_of},
        ${receipt.configuration_hash},
        ${receipt.input_hash},
        ${JSON.stringify(receipt.source_signal_ids)},
        ${receipt.geography_registry_version},
        ${receipt.expected_count},
        ${receipt.observed_count},
        ${JSON.stringify(receipt.computed_outputs)}::jsonb,
        ${receipt.timestamp_computed}
      ) RETURNING id
    `);
    const id = (result.rows?.[0] as any)?.id;
    if (id) ids.push(id);
  }
  return ids;
}

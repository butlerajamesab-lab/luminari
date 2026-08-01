/**
 * CONVERGENCE RUNNER v2.1.0
 *
 * Creates an immutable, idempotent database snapshot for each declared run.
 * Historical replays load the stored snapshot/result instead of current mutable
 * signal or geography state.
 */
import { db } from "../db";
import { liveSignals } from "../../drizzle/schema";
import { and, gte, lte, sql } from "drizzle-orm";
import {
  ENGINE_VERSION,
  NULL_MODEL_ASSUMPTIONS,
  NULL_MODEL_ID,
  computeRunKey,
  deduplicateSignals,
  detectConvergence,
  generateProvenanceReceipt,
  type ConvergenceResult,
  type GeographyRegistry,
  type ProvenanceReceipt,
  type Signal,
} from "./atlas-engine";

export interface ConvergenceConfig {
  as_of: number;
  time_window_ms: number;
  geography_registry_version: string;
  temporal_bucket_ms?: number;
  min_signals_for_analysis?: number;
  z_score_threshold?: number;
}

export interface ConvergenceZone {
  geography: string;
  convergence: ConvergenceResult;
  provenance: ProvenanceReceipt;
  reportable: boolean;
  reason_not_reportable: string | null;
}

export interface ConvergenceRunResult {
  run_key: string;
  engine_version: string;
  as_of: number;
  config: Required<ConvergenceConfig>;
  geography_registry_version: string;
  total_signals_analyzed: number;
  total_signals_after_dedup: number;
  geographies_evaluated: number;
  convergence_zones: ConvergenceZone[];
  reported_zones: ConvergenceZone[];
  unresolved_geographies: Array<{ geography: string; reason: string }>;
  receipt_ids: string[];
  replayed_from_snapshot: boolean;
}

export async function runConvergenceAnalysis(config: ConvergenceConfig): Promise<ConvergenceRunResult> {
  const resolved: Required<ConvergenceConfig> = {
    as_of: config.as_of,
    time_window_ms: config.time_window_ms,
    geography_registry_version: config.geography_registry_version,
    temporal_bucket_ms: config.temporal_bucket_ms ?? 86_400_000,
    min_signals_for_analysis: config.min_signals_for_analysis ?? 2,
    z_score_threshold: config.z_score_threshold ?? 2,
  };
  validateConfig(resolved);
  const runKey = computeRunKey({
    as_of: resolved.as_of,
    config: resolved,
    geography_registry_version: resolved.geography_registry_version,
  });

  return db.transaction(async (tx: any) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${runKey}, 0))`);

    const existing = await tx.execute(sql`
      select result_payload
      from convergence_run_snapshot
      where run_key = ${runKey}
      limit 1
    `);
    if (existing.rows?.length) {
      const payload = parseJson(existing.rows[0].result_payload) as ConvergenceRunResult;
      return { ...payload, replayed_from_snapshot: true };
    }

    const registry = await loadRegistrySnapshot(tx, resolved.geography_registry_version);
    const rawSignals = await loadSignalSnapshot(resolved);
    const deduplicatedPopulation = deduplicateSignals(rawSignals, resolved.temporal_bucket_ms);
    const result = computeRunResult(runKey, resolved, registry, rawSignals, deduplicatedPopulation);

    const receiptIds: string[] = [];
    for (const zone of result.convergence_zones) {
      const inserted = await tx.execute(sql`
        insert into convergence_receipts (
          run_key, geography_id, equation_id, engine_version,
          rule_manifest_hash, as_of, configuration_hash, input_hash,
          source_signal_ids, geography_registry_version, expected_count,
          observed_count, computed_outputs, timestamp_computed
        ) values (
          ${zone.provenance.run_key}, ${zone.provenance.geography_id},
          ${zone.provenance.equation_id}, ${zone.provenance.engine_version},
          ${zone.provenance.rule_manifest_hash}, ${zone.provenance.as_of},
          ${zone.provenance.configuration_hash}, ${zone.provenance.input_hash},
          ${JSON.stringify(zone.provenance.source_signal_ids)}::jsonb,
          ${zone.provenance.geography_registry_version},
          ${zone.provenance.expected_count}, ${zone.provenance.observed_count},
          ${JSON.stringify(zone.provenance.computed_outputs)}::jsonb,
          ${zone.provenance.timestamp_computed}
        )
        returning id
      `);
      const id = String(inserted.rows?.[0]?.id ?? "");
      if (!id) throw new Error(`receipt insert returned no id for ${zone.geography}`);
      receiptIds.push(id);
    }

    const finalResult: ConvergenceRunResult = { ...result, receipt_ids: receiptIds, replayed_from_snapshot: false };
    await tx.execute(sql`
      insert into convergence_run_snapshot (
        run_key, engine_version, as_of, configuration,
        configuration_hash, geography_registry_version,
        raw_signal_snapshot, deduplicated_signal_snapshot,
        geography_registry_snapshot, input_hash, result_payload
      ) values (
        ${runKey}, ${ENGINE_VERSION}, ${resolved.as_of},
        ${JSON.stringify(resolved)}::jsonb,
        ${result.convergence_zones[0]?.provenance.configuration_hash ?? ""},
        ${resolved.geography_registry_version},
        ${JSON.stringify(rawSignals)}::jsonb,
        ${JSON.stringify(deduplicatedPopulation)}::jsonb,
        ${JSON.stringify(registry)}::jsonb,
        ${result.convergence_zones[0]?.provenance.input_hash ?? ""},
        ${JSON.stringify(finalResult)}::jsonb
      )
    `);
    return finalResult;
  });
}

async function loadSignalSnapshot(config: Required<ConvergenceConfig>): Promise<Signal[]> {
  const cutoff = config.as_of - config.time_window_ms;
  const rows = await db.select().from(liveSignals).where(and(
    gte(liveSignals.detectedAt, cutoff),
    lte(liveSignals.detectedAt, config.as_of),
  ));
  return rows.map((row: any) => ({
    id: String(row.id),
    temporal_coordinate: Number(row.detectedAt),
    spatial_coordinate: normalizeGeographyId(row.jurisdiction),
    signal_type: String(row.signalType),
    confidence: parseNullableUnit(row.confidenceScore),
    characteristics: {
      domain: row.domain ?? null,
      severity: row.severity ?? null,
      dataset: row.datasetId ?? null,
      supporting_statistics: normalizeSupportingStatistics(row.supportingStatistics),
    },
  })).sort((a, b) => a.id.localeCompare(b.id));
}

async function loadRegistrySnapshot(tx: any, version: string): Promise<GeographyRegistry> {
  const rows = await tx.execute(sql`
    select id, area_sq_km, centroid_lat, centroid_lon, adjacency
    from geography_registry
    where version = ${version}
    order by id
  `);
  return {
    version,
    entries: (rows.rows ?? []).map((row: any) => ({
      id: normalizeGeographyId(row.id),
      area_sq_km: Number(row.area_sq_km),
      centroid_lat: row.centroid_lat === null ? null : Number(row.centroid_lat),
      centroid_lon: row.centroid_lon === null ? null : Number(row.centroid_lon),
      adjacency: Array.isArray(row.adjacency) ? row.adjacency.map(normalizeGeographyId) : [],
    })),
  };
}

function computeRunResult(
  runKey: string,
  config: Required<ConvergenceConfig>,
  registry: GeographyRegistry,
  rawPopulation: Signal[],
  deduplicatedPopulation: Signal[],
): ConvergenceRunResult {
  const grouped = new Map<string, Signal[]>();
  for (const signal of rawPopulation) {
    const group = grouped.get(signal.spatial_coordinate) ?? [];
    group.push(signal);
    grouped.set(signal.spatial_coordinate, group);
  }

  const zones: ConvergenceZone[] = [];
  const unresolved: Array<{ geography: string; reason: string }> = [];
  const configForReceipt = { ...config, null_model_id: NULL_MODEL_ID, null_model_assumptions: NULL_MODEL_ASSUMPTIONS };

  if (!registry.entries.length || !rawPopulation.length) {
    const reason = !registry.entries.length ? `No geography rows for registry version '${registry.version}'` : "No signals in declared time window";
    const receipt = generateProvenanceReceipt({
      run_key: runKey,
      geography_id: "*",
      equation_id: "poisson_z_score",
      as_of: config.as_of,
      config: configForReceipt,
      raw_population: rawPopulation,
      deduplicated_population: deduplicatedPopulation,
      geography_registry: registry,
      expected_count: null,
      observed_count: 0,
      computed_outputs: { status: "unresolved", reason },
    });
    zones.push({
      geography: "*",
      convergence: unresolvedResult("*", registry, rawPopulation.length, reason),
      provenance: receipt,
      reportable: false,
      reason_not_reportable: reason,
    });
    unresolved.push({ geography: "*", reason });
  } else {
    for (const geography of [...grouped.keys()].sort()) {
      const rawSignals = grouped.get(geography) ?? [];
      const convergence = detectConvergence({
        geography,
        raw_signals: rawSignals,
        as_of: config.as_of,
        time_window_ms: config.time_window_ms,
        temporal_bucket_ms: config.temporal_bucket_ms,
        total_signals_all_geographies: deduplicatedPopulation.length,
        geography_registry: registry,
      });
      const enoughSignals = convergence.signal_count >= config.min_signals_for_analysis;
      const thresholdMet = convergence.poisson.status === "resolved" &&
        convergence.poisson.z_score !== null && convergence.poisson.z_score >= config.z_score_threshold;
      const reasonNotReportable = !enoughSignals
        ? `deduplicated signal count ${convergence.signal_count} is below minimum ${config.min_signals_for_analysis}`
        : !thresholdMet ? `Z-score does not meet reporting threshold ${config.z_score_threshold}` : null;
      if (convergence.poisson.status === "unresolved") {
        unresolved.push({ geography, reason: convergence.poisson.reason_unresolved ?? "unresolved" });
      }
      const receipt = generateProvenanceReceipt({
        run_key: runKey,
        geography_id: geography,
        equation_id: "poisson_z_score",
        as_of: config.as_of,
        config: configForReceipt,
        raw_population: rawPopulation,
        deduplicated_population: deduplicatedPopulation,
        geography_registry: registry,
        expected_count: convergence.poisson.expected_count,
        observed_count: convergence.poisson.observed_count,
        computed_outputs: { ...convergence, reportable: enoughSignals && thresholdMet, reason_not_reportable: reasonNotReportable },
      });
      zones.push({ geography, convergence, provenance: receipt, reportable: enoughSignals && thresholdMet, reason_not_reportable: reasonNotReportable });
    }
  }

  zones.sort((a, b) => (b.convergence.poisson.z_score ?? Number.NEGATIVE_INFINITY) - (a.convergence.poisson.z_score ?? Number.NEGATIVE_INFINITY));
  return {
    run_key: runKey,
    engine_version: ENGINE_VERSION,
    as_of: config.as_of,
    config,
    geography_registry_version: registry.version,
    total_signals_analyzed: rawPopulation.length,
    total_signals_after_dedup: deduplicatedPopulation.length,
    geographies_evaluated: zones.length,
    convergence_zones: zones,
    reported_zones: zones.filter(z => z.reportable),
    unresolved_geographies: unresolved,
    receipt_ids: [],
    replayed_from_snapshot: false,
  };
}

function unresolvedResult(geography: string, registry: GeographyRegistry, rawCount: number, reason: string): ConvergenceResult {
  return {
    geography,
    raw_signal_count: rawCount,
    signal_count: 0,
    distinct_types: 0,
    mean_confidence: null,
    recency_factor: 0,
    multiplicative_score: null,
    dominant_type: "none",
    poisson: { status: "unresolved", expected_count: null, observed_count: 0, z_score: null, reason_unresolved: reason },
    source_signal_ids: [],
    deduplicated_signal_ids: [],
    null_model: { model_id: NULL_MODEL_ID, assumptions: NULL_MODEL_ASSUMPTIONS, geography_registry_version: registry.version, total_area_sq_km: registry.entries.reduce((s, e) => s + e.area_sq_km, 0), geography_area_sq_km: null, total_signals: 0 },
  };
}

function validateConfig(config: Required<ConvergenceConfig>) {
  if (!Number.isFinite(config.as_of)) throw new Error("as_of is required and must be finite");
  if (!Number.isFinite(config.time_window_ms) || config.time_window_ms <= 0) throw new Error("time_window_ms must be positive");
  if (!Number.isFinite(config.temporal_bucket_ms) || config.temporal_bucket_ms <= 0) throw new Error("temporal_bucket_ms must be positive");
  if (!Number.isInteger(config.min_signals_for_analysis) || config.min_signals_for_analysis < 1) throw new Error("min_signals_for_analysis must be a positive integer");
  if (!Number.isFinite(config.z_score_threshold)) throw new Error("z_score_threshold must be finite");
  if (!config.geography_registry_version.trim()) throw new Error("geography_registry_version is required");
}

function parseNullableUnit(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) throw new Error(`invalid confidence '${String(value)}'`);
  return parsed;
}
function normalizeSupportingStatistics(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return JSON.stringify(value);
}
function normalizeGeographyId(value: unknown): string { return String(value ?? "").trim().toUpperCase(); }
function parseJson(value: unknown): unknown { return typeof value === "string" ? JSON.parse(value) : value; }

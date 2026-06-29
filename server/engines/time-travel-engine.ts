/**
 * Time-Travel Analysis Engine (Session 71)
 *
 * Enables historical replay, counterfactual analysis, algorithm comparison,
 * and earliest-detection analysis against Luminari's data.
 *
 * SAFETY: All outputs are stored in isolated historical_* tables.
 * Live signals, patterns, and trends are NEVER modified.
 *
 * Core functions:
 *   createSnapshot()           — capture current data state as a reference point
 *   runHistoricalReplay()      — replay signal/pattern detection on historical data
 *   runCounterfactualReplay()  — replay with modified parameters ("what if")
 *   compareAlgorithmVersions() — side-by-side algorithm comparison
 *   detectEarliestPatternDate()— find when a pattern first became detectable
 *   generateReplayReport()     — markdown summary of a replay run
 */

import { db } from "../db";
import {
  dataSnapshots,
  timeTravelRuns,
  historicalSignals,
  historicalPatterns,
  historicalTrends,
  counterfactualParameters,
  ingestedRecords,
  detectedSignals,
  patternRegistry,
  trendPressureMetrics,
} from "../../drizzle/schema";
import { eq, and, sql, gte, lte, desc, asc, count, between } from "drizzle-orm";
import crypto from "crypto";
import {
  classifyEntity,
  shouldGenerateSignal,
  computeEntityConfidenceScore,
} from "../ingestion/entity-classifier";

// ─── Algorithm Version Registry ───
// Each version represents a different set of detection thresholds and logic
export const ALGORITHM_VERSIONS: Record<string, {
  label: string;
  description: string;
  thresholds: {
    minRecordsForSignal: number;
    minConfidenceScore: number;
    minPatternRepetition: number;
    frequencySpikeMultiplier: number;
    geoClusterMinCount: number;
    entityRepeatMin: number;
    statusDelayDays: number;
    trendAnomalyPercent: number;
  };
}> = {
  "v1.0": {
    label: "Signal Detection v1.0 (Baseline)",
    description: "Original detection logic — high thresholds, conservative",
    thresholds: {
      minRecordsForSignal: 20,
      minConfidenceScore: 0.75,
      minPatternRepetition: 5,
      frequencySpikeMultiplier: 3.0,
      geoClusterMinCount: 15,
      entityRepeatMin: 10,
      statusDelayDays: 90,
      trendAnomalyPercent: 50,
    },
  },
  "v2.0": {
    label: "Signal Detection v2.0 (Entity-Aware)",
    description: "Added entity classification, role-based filtering, lower thresholds",
    thresholds: {
      minRecordsForSignal: 10,
      minConfidenceScore: 0.65,
      minPatternRepetition: 3,
      frequencySpikeMultiplier: 2.5,
      geoClusterMinCount: 10,
      entityRepeatMin: 5,
      statusDelayDays: 60,
      trendAnomalyPercent: 40,
    },
  },
  "v3.0": {
    label: "Signal Detection v3.0 (Current)",
    description: "Current production logic — entity classification + interpretation packs + governance",
    thresholds: {
      minRecordsForSignal: 10,
      minConfidenceScore: 0.60,
      minPatternRepetition: 3,
      frequencySpikeMultiplier: 2.0,
      geoClusterMinCount: 8,
      entityRepeatMin: 3,
      statusDelayDays: 45,
      trendAnomalyPercent: 30,
    },
  },
};

export function getAlgorithmVersions() {
  return Object.entries(ALGORITHM_VERSIONS).map(([id, v]) => ({
    id,
    label: v.label,
    description: v.description,
  }));
}

// ─── Snapshot Management ───

export async function createSnapshot(
  sourceTable: string,
  dateRange?: { from: number; to: number },
  createdBy?: number
) {
  // Count records in the source table within date range
  let recordCount = 0;
  const metadata: Record<string, unknown> = {};

  if (sourceTable === "ingested_records") {
    const conditions = [];
    if (dateRange?.from) conditions.push(gte(ingestedRecords.ingestedAt, new Date(dateRange.from)));
    if (dateRange?.to) conditions.push(lte(ingestedRecords.ingestedAt, new Date(dateRange.to)));

    const [result] = await db
      .select({ count: count() })
      .from(ingestedRecords)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    recordCount = result?.count ?? 0;

    // Get dataset breakdown
    const datasets = await db
      .select({
        datasetId: ingestedRecords.datasetId,
        cnt: count(),
      })
      .from(ingestedRecords)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(ingestedRecords.datasetId);

    metadata.datasetIds = datasets.map((d: any) => d.datasetId);
    metadata.dateRange = dateRange;
    metadata.description = `Snapshot of ${recordCount} ingested records across ${datasets.length} datasets`;
  } else if (sourceTable === "detected_signals") {
    const [result] = await db
      .select({ count: count() })
      .from(detectedSignals);
    recordCount = result?.count ?? 0;
    metadata.signalCount = recordCount;
    metadata.description = `Snapshot of ${recordCount} detected signals`;
  } else if (sourceTable === "pattern_registry") {
    const [result] = await db
      .select({ count: count() })
      .from(patternRegistry);
    recordCount = result?.count ?? 0;
    metadata.patternCount = recordCount;
    metadata.description = `Snapshot of ${recordCount} registered patterns`;
  }

  const [inserted] = await db.insert(dataSnapshots).values({
    snapshotDate: Date.now(),
    sourceTable,
    recordCount,
    snapshotMetadata: metadata as any,
    status: "complete",
    createdAt: Date.now(),
    createdBy: createdBy ?? null,
  });

  return { snapshotId: inserted.insertId, recordCount, metadata };
}

export async function listSnapshots(limit = 20) {
  return db
    .select()
    .from(dataSnapshots)
    .orderBy(desc(dataSnapshots.createdAt))
    .limit(limit);
}

export async function getSnapshot(id: number) {
  const [snap] = await db
    .select()
    .from(dataSnapshots)
    .where(eq(dataSnapshots.id, id));
  return snap ?? null;
}

// ─── Historical Replay ───

interface ReplayOptions {
  snapshotId?: number;
  algorithmVersion: string;
  startDate?: number;
  endDate?: number;
  datasetIds?: string[];
  createdBy?: number;
  notes?: string;
}

export async function runHistoricalReplay(options: ReplayOptions) {
  const algo = ALGORITHM_VERSIONS[options.algorithmVersion] ?? ALGORITHM_VERSIONS["v3.0"];
  const thresholds = algo.thresholds;

  // Create the run record
  const [runInsert] = await db.insert(timeTravelRuns).values({
    runId: crypto.randomUUID(),
    snapshotId: options.snapshotId ?? null,
    algorithmVersion: options.algorithmVersion,
    runType: "historical_replay",
    startDate: options.startDate ?? null,
    endDate: options.endDate ?? null,
    status: "running",
    notes: options.notes ?? `Historical replay using ${algo.label}`,
    createdAt: Date.now(),
    createdBy: options.createdBy ?? null,
  });
  const runId = runInsert.insertId;

  try {
    // Load historical records
    const conditions = [];
    if (options.startDate) conditions.push(gte(ingestedRecords.normalizedDate, new Date(options.startDate)));
    if (options.endDate) conditions.push(lte(ingestedRecords.normalizedDate, new Date(options.endDate)));
    if (options.datasetIds?.length) {
      conditions.push(sql`${ingestedRecords.datasetId} IN (${sql.join(options.datasetIds.map(d => sql`${d}`), sql`, `)})`);
    }

    const records = await db
      .select()
      .from(ingestedRecords)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(10000);

    if (records.length < thresholds.minRecordsForSignal) {
      await db.update(timeTravelRuns)
        .set({
          status: "completed",
          completedAt: Date.now(),
          signalsDetected: 0,
          patternsDetected: 0,
          summary: {
            totalRecordsProcessed: records.length,
            totalSignals: 0,
            totalPatterns: 0,
            totalTrends: 0,
            keyFindings: [`Only ${records.length} records found — below minimum threshold of ${thresholds.minRecordsForSignal}`],
          },
        })
        .where(eq(timeTravelRuns.id, runId));
      return { runId, signalsDetected: 0, patternsDetected: 0, status: "completed" };
    }

    // Re-run signal extraction with historical thresholds
    const signals = replaySignalDetection(records, thresholds, options.algorithmVersion);

    // Store historical signals
    let signalCount = 0;
    for (const signal of signals) {
      if (signal.confidenceScore < thresholds.minConfidenceScore) continue;
      await db.insert(historicalSignals).values({
        runId,
        sourceRecordId: signal.sourceRecordId ?? null,
        signalType: signal.signalType,
        entityName: signal.entityName ?? null,
        entityType: signal.entityType ?? null,
        datasetId: signal.datasetId ?? null,
        jurisdiction: signal.jurisdiction ?? null,
        domain: signal.domain ?? null,
        severity: signal.severity,
        title: signal.title,
        explanation: signal.explanation ?? null,
        confidenceScore: signal.confidenceScore.toFixed(4),
        originalDetectedAt: signal.originalDetectedAt ?? null,
        replayDetectedAt: Date.now(),
        algorithmVersion: options.algorithmVersion,
      });
      signalCount++;
    }

    // Build historical patterns from signals
    const patterns = buildHistoricalPatterns(signals, thresholds, options.algorithmVersion);
    let patternCount = 0;
    for (const pattern of patterns) {
      await db.insert(historicalPatterns).values({
        runId,
        patternType: pattern.patternType,
        patternName: pattern.patternName ?? null,
        entityName: pattern.entityName ?? null,
        jurisdiction: pattern.jurisdiction ?? null,
        patternConfidence: pattern.confidence.toFixed(4),
        signalCount: pattern.signalCount,
        firstDetectedAt: pattern.firstDetectedAt ?? null,
        lastConfirmedAt: pattern.lastConfirmedAt ?? null,
        algorithmVersion: options.algorithmVersion,
        contributingSignals: pattern.contributingSignalIds ?? null,
        metadata: pattern.metadata ?? null,
        createdAt: Date.now(),
      });
      patternCount++;
    }

    // Build historical trends
    const trends = buildHistoricalTrends(patterns, signals, thresholds);
    let trendCount = 0;
    for (const trend of trends) {
      await db.insert(historicalTrends).values({
        runId,
        patternId: trend.patternIndex ?? null,
        momentumScore: trend.momentumScore,
        pressureIndex: trend.pressureIndex,
        trendClassification: trend.classification,
        volumePressure: trend.volumePressure,
        velocityPressure: trend.velocityPressure,
        geographicPressure: trend.geographicPressure,
        severityPressure: trend.severityPressure,
        algorithmVersion: options.algorithmVersion,
        createdAt: Date.now(),
      });
      trendCount++;
    }

    // Find earliest detection date
    const earliestSignal = signals.length > 0
      ? signals.reduce((a, b) =>
          (a.originalDetectedAt ?? Infinity) < (b.originalDetectedAt ?? Infinity) ? a : b
        )
      : null;

    const summary = {
      totalRecordsProcessed: records.length,
      totalSignals: signalCount,
      totalPatterns: patternCount,
      totalTrends: trendCount,
      earliestDetection: earliestSignal?.originalDetectedAt ?? null,
      confidenceRange: signals.length > 0 ? {
        min: Math.min(...signals.map(s => s.confidenceScore)),
        max: Math.max(...signals.map(s => s.confidenceScore)),
      } : null,
      keyFindings: generateKeyFindings(signals, patterns, records.length),
    };

    await db.update(timeTravelRuns)
      .set({
        status: "completed",
        completedAt: Date.now(),
        signalsDetected: signalCount,
        patternsDetected: patternCount,
        // @ts-ignore pre-existing type mismatch
        summary,
      })
      .where(eq(timeTravelRuns.id, runId));

    return { runId, signalsDetected: signalCount, patternsDetected: patternCount, trendsDetected: trendCount, status: "completed", summary };
  } catch (error: any) {
    await db.update(timeTravelRuns)
      .set({
        status: "failed",
        completedAt: Date.now(),
        notes: `Error: ${error.message}`,
      })
      .where(eq(timeTravelRuns.id, runId));
    throw error;
  }
}

// ─── Counterfactual Replay ───

interface CounterfactualOptions extends ReplayOptions {
  parameters: Array<{
    name: string;
    value: string;
    type: "weight_override" | "filter_toggle" | "threshold_change" | "stream_inclusion" | "date_shift" | "entity_filter";
    description?: string;
  }>;
}

export async function runCounterfactualReplay(options: CounterfactualOptions) {
  // Create the run
  const [runInsert] = await db.insert(timeTravelRuns).values({
    runId: crypto.randomUUID(),
    snapshotId: options.snapshotId ?? null,
    algorithmVersion: options.algorithmVersion,
    runType: "counterfactual_replay",
    startDate: options.startDate ?? null,
    endDate: options.endDate ?? null,
    status: "running",
    notes: options.notes ?? `Counterfactual replay with ${options.parameters.length} parameter overrides`,
    createdAt: Date.now(),
    createdBy: options.createdBy ?? null,
  });
  const runId = runInsert.insertId;

  // Store counterfactual parameters
  for (const param of options.parameters) {
    await db.insert(counterfactualParameters).values({
      runId,
      parameterName: param.name,
      parameterValue: param.value,
      parameterType: param.type,
      description: param.description ?? null,
      createdAt: Date.now(),
    });
  }

  try {
    // Build modified thresholds from parameters
    const baseAlgo = ALGORITHM_VERSIONS[options.algorithmVersion] ?? ALGORITHM_VERSIONS["v3.0"];
    const modifiedThresholds = { ...baseAlgo.thresholds };

    for (const param of options.parameters) {
      if (param.type === "threshold_change") {
        const key = param.name as keyof typeof modifiedThresholds;
        if (key in modifiedThresholds) {
          (modifiedThresholds as any)[key] = parseFloat(param.value);
        }
      }
    }

    // Load records with optional entity filtering
    const entityFilter = options.parameters.find(p => p.type === "entity_filter");
    const streamFilter = options.parameters.find(p => p.type === "stream_inclusion");

    const conditions = [];
    if (options.startDate) conditions.push(gte(ingestedRecords.normalizedDate, new Date(options.startDate)));
    if (options.endDate) conditions.push(lte(ingestedRecords.normalizedDate, new Date(options.endDate)));
    if (options.datasetIds?.length) {
      conditions.push(sql`${ingestedRecords.datasetId} IN (${sql.join(options.datasetIds.map(d => sql`${d}`), sql`, `)})`);
    }
    if (streamFilter) {
      const includedStreams = streamFilter.value.split(",").map(s => s.trim());
      conditions.push(sql`${ingestedRecords.datasetId} IN (${sql.join(includedStreams.map(d => sql`${d}`), sql`, `)})`);
    }

    let records = await db
      .select()
      .from(ingestedRecords)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(10000);

    // Apply entity filter
    if (entityFilter) {
      const filterValue = entityFilter.value.toLowerCase();
      if (entityFilter.name === "exclude_entity_type") {
        records = records.filter((r: any) =>
          !classifyEntity(r.normalizedEntity ?? "", r.datasetId).entityType.toLowerCase().includes(filterValue)
        );
      } else if (entityFilter.name === "include_only_entity") {
        records = records.filter((r: any) =>
          (r.normalizedEntity ?? "").toLowerCase().includes(filterValue)
        );
      }
    }

    // Apply weight overrides
    const weightOverrides: Record<string, number> = {};
    for (const param of options.parameters) {
      if (param.type === "weight_override") {
        weightOverrides[param.name] = parseFloat(param.value);
      }
    }

    // Run detection with modified thresholds
    const signals = replaySignalDetection(records, modifiedThresholds, options.algorithmVersion, weightOverrides);

    // Store results
    let signalCount = 0;
    for (const signal of signals) {
      if (signal.confidenceScore < modifiedThresholds.minConfidenceScore) continue;
      await db.insert(historicalSignals).values({
        runId,
        sourceRecordId: signal.sourceRecordId ?? null,
        signalType: signal.signalType,
        entityName: signal.entityName ?? null,
        entityType: signal.entityType ?? null,
        datasetId: signal.datasetId ?? null,
        jurisdiction: signal.jurisdiction ?? null,
        domain: signal.domain ?? null,
        severity: signal.severity,
        title: signal.title,
        explanation: signal.explanation ?? null,
        confidenceScore: signal.confidenceScore.toFixed(4),
        originalDetectedAt: signal.originalDetectedAt ?? null,
        replayDetectedAt: Date.now(),
        algorithmVersion: `${options.algorithmVersion}+counterfactual`,
      });
      signalCount++;
    }

    const patterns = buildHistoricalPatterns(signals, modifiedThresholds, options.algorithmVersion);
    let patternCount = 0;
    for (const pattern of patterns) {
      await db.insert(historicalPatterns).values({
        runId,
        patternType: pattern.patternType,
        patternName: pattern.patternName ?? null,
        entityName: pattern.entityName ?? null,
        jurisdiction: pattern.jurisdiction ?? null,
        patternConfidence: pattern.confidence.toFixed(4),
        signalCount: pattern.signalCount,
        firstDetectedAt: pattern.firstDetectedAt ?? null,
        lastConfirmedAt: pattern.lastConfirmedAt ?? null,
        algorithmVersion: `${options.algorithmVersion}+counterfactual`,
        contributingSignals: pattern.contributingSignalIds ?? null,
        metadata: { ...pattern.metadata, counterfactualParameters: options.parameters.map(p => p.name) },
        createdAt: Date.now(),
      });
      patternCount++;
    }

    const summary = {
      totalRecordsProcessed: records.length,
      totalSignals: signalCount,
      totalPatterns: patternCount,
      totalTrends: 0,
      keyFindings: [
        `Counterfactual replay with ${options.parameters.length} parameter overrides`,
        ...generateKeyFindings(signals, patterns, records.length),
      ],
    };

    await db.update(timeTravelRuns)
      .set({
        status: "completed",
        completedAt: Date.now(),
        signalsDetected: signalCount,
        patternsDetected: patternCount,
        summary,
      })
      .where(eq(timeTravelRuns.id, runId));

    return { runId, signalsDetected: signalCount, patternsDetected: patternCount, status: "completed", summary };
  } catch (error: any) {
    await db.update(timeTravelRuns)
      .set({ status: "failed", completedAt: Date.now(), notes: `Error: ${error.message}` })
      .where(eq(timeTravelRuns.id, runId));
    throw error;
  }
}

// ─── Algorithm Comparison ───

export async function compareAlgorithmVersions(
  versionA: string,
  versionB: string,
  options: {
    startDate?: number;
    endDate?: number;
    datasetIds?: string[];
    createdBy?: number;
  }
) {
  // Run both replays
  const resultA = await runHistoricalReplay({
    algorithmVersion: versionA,
    startDate: options.startDate,
    endDate: options.endDate,
    datasetIds: options.datasetIds,
    createdBy: options.createdBy,
    notes: `Algorithm comparison: ${versionA} (side A)`,
  });

  const resultB = await runHistoricalReplay({
    algorithmVersion: versionB,
    startDate: options.startDate,
    endDate: options.endDate,
    datasetIds: options.datasetIds,
    createdBy: options.createdBy,
    notes: `Algorithm comparison: ${versionB} (side B)`,
  });

  // Create comparison run
  const [compInsert] = await db.insert(timeTravelRuns).values({
    runId: crypto.randomUUID(),
    algorithmVersion: versionA,
    comparisonAlgorithmVersion: versionB,
    runType: "algorithm_comparison",
    startDate: options.startDate ?? null,
    endDate: options.endDate ?? null,
    status: "completed",
    signalsDetected: resultA.signalsDetected + resultB.signalsDetected,
    patternsDetected: resultA.patternsDetected + resultB.patternsDetected,
    notes: `Comparison: ${versionA} vs ${versionB}`,
    summary: {
      totalRecordsProcessed: (resultA.summary?.totalRecordsProcessed ?? 0),
      totalSignals: resultA.signalsDetected + resultB.signalsDetected,
      totalPatterns: resultA.patternsDetected + resultB.patternsDetected,
      comparisonDelta: {
        signalDiff: resultB.signalsDetected - resultA.signalsDetected,
        patternDiff: resultB.patternsDetected - resultA.patternsDetected,
        avgConfidenceDiff: 0,
        earlierDetections: 0,
      },
      keyFindings: [
        `${versionA}: ${resultA.signalsDetected} signals, ${resultA.patternsDetected} patterns`,
        `${versionB}: ${resultB.signalsDetected} signals, ${resultB.patternsDetected} patterns`,
        `Signal difference: ${resultB.signalsDetected - resultA.signalsDetected > 0 ? "+" : ""}${resultB.signalsDetected - resultA.signalsDetected}`,
        `Pattern difference: ${resultB.patternsDetected - resultA.patternsDetected > 0 ? "+" : ""}${resultB.patternsDetected - resultA.patternsDetected}`,
      ],
    },
    createdAt: Date.now(),
    completedAt: Date.now(),
    createdBy: options.createdBy ?? null,
  });

  // Load signals from both runs for detailed comparison
  const signalsA = await db.select().from(historicalSignals).where(eq(historicalSignals.runId, resultA.runId));
  const signalsB = await db.select().from(historicalSignals).where(eq(historicalSignals.runId, resultB.runId));

  // Calculate confidence comparison
  const avgConfA = signalsA.length > 0 ? signalsA.reduce((s: any, sig: any) => s + Number(sig.confidenceScore), 0) / signalsA.length : 0;
  const avgConfB = signalsB.length > 0 ? signalsB.reduce((s: any, sig: any) => s + Number(sig.confidenceScore), 0) / signalsB.length : 0;

  // Find signals unique to each version
  const typesA = new Set(signalsA.map((s: any) => `${s.signalType}|${s.entityName}`));
  const typesB = new Set(signalsB.map((s: any) => `${s.signalType}|${s.entityName}`));
  const onlyInA = [...typesA].filter(t => !typesB.has(t));
  const onlyInB = [...typesB].filter(t => !typesA.has(t));

  return {
    comparisonRunId: compInsert.insertId,
    runIdA: resultA.runId,
    runIdB: resultB.runId,
    versionA: { version: versionA, signals: resultA.signalsDetected, patterns: resultA.patternsDetected, avgConfidence: avgConfA },
    versionB: { version: versionB, signals: resultB.signalsDetected, patterns: resultB.patternsDetected, avgConfidence: avgConfB },
    delta: {
      signals: resultB.signalsDetected - resultA.signalsDetected,
      patterns: resultB.patternsDetected - resultA.patternsDetected,
      avgConfidence: avgConfB - avgConfA,
    },
    uniqueToA: onlyInA.length,
    uniqueToB: onlyInB.length,
    shared: typesA.size - onlyInA.length,
  };
}

// ─── Earliest Detection Analysis ───

export async function detectEarliestPatternDate(
  patternType: string,
  entityName?: string,
  algorithmVersion: string = "v3.0"
) {
  const algo = ALGORITHM_VERSIONS[algorithmVersion] ?? ALGORITHM_VERSIONS["v3.0"];
  const thresholds = algo.thresholds;

  // Create the run
  const [runInsert] = await db.insert(timeTravelRuns).values({
    runId: crypto.randomUUID(),
    algorithmVersion,
    runType: "early_warning_test",
    status: "running",
    notes: `Earliest detection: ${patternType}${entityName ? ` for ${entityName}` : ""}`,
    createdAt: Date.now(),
  });
  const runId = runInsert.insertId;

  try {
    // Load ALL historical records sorted by date
    const conditions = [];
    if (entityName) {
      conditions.push(sql`LOWER(${ingestedRecords.normalizedEntity}) LIKE ${`%${entityName.toLowerCase()}%`}`);
    }

    const records = await db
      .select()
      .from(ingestedRecords)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(ingestedRecords.normalizedDate))
      .limit(10000);

    if (records.length === 0) {
      await db.update(timeTravelRuns)
        .set({ status: "completed", completedAt: Date.now(), summary: { keyFindings: ["No matching records found"] } })
        .where(eq(timeTravelRuns.id, runId));
      return { runId, earliestDate: null, confidence: 0, signalsRequired: 0, contributingStreams: [] };
    }

    // Progressively scan through time windows to find earliest detection
    let earliestDetection: number | null = null;
    let detectionConfidence = 0;
    let signalsAtDetection: any[] = [];
    let contributingStreams: string[] = [];

    // Group records by month-sized windows
    const sortedRecords = records.filter((r: any) => r.normalizedDate != null).sort((a: any, b: any) => (a.normalizedDate ?? 0) - (b.normalizedDate ?? 0));
    if (sortedRecords.length === 0) {
      await db.update(timeTravelRuns)
        .set({ status: "completed", completedAt: Date.now(), summary: { keyFindings: ["No dated records found"] } })
        .where(eq(timeTravelRuns.id, runId));
      return { runId, earliestDate: null, confidence: 0, signalsRequired: 0, contributingStreams: [] };
    }

    const firstDate = sortedRecords[0].normalizedDate!;
    const lastDate = sortedRecords[sortedRecords.length - 1].normalizedDate!;
    const WINDOW_SIZE = 30 * 24 * 60 * 60 * 1000; // 30 days

    for (let windowStart = firstDate; windowStart <= lastDate; windowStart += WINDOW_SIZE) {
      const windowEnd = windowStart + WINDOW_SIZE;
      const windowRecords = sortedRecords.filter((r: any) =>
        r.normalizedDate! >= firstDate && r.normalizedDate! <= windowEnd
      );

      if (windowRecords.length < thresholds.minRecordsForSignal) continue;

      const signals = replaySignalDetection(windowRecords, thresholds, algorithmVersion);
      const validSignals = signals.filter(s => s.confidenceScore >= thresholds.minConfidenceScore);

      // Check if the target pattern type appears
      const matchingSignals = validSignals.filter(s => {
        if (patternType === "any") return true;
        return s.signalType.toLowerCase().includes(patternType.toLowerCase());
      });

      if (matchingSignals.length >= thresholds.minPatternRepetition && !earliestDetection) {
        earliestDetection = windowEnd;
        detectionConfidence = matchingSignals.reduce((s, sig) => s + sig.confidenceScore, 0) / matchingSignals.length;
        signalsAtDetection = matchingSignals;
        contributingStreams = [...new Set(matchingSignals.map(s => s.datasetId).filter(Boolean))] as string[];
      }
    }

    // Store the earliest detection signal
    if (earliestDetection && signalsAtDetection.length > 0) {
      for (const signal of signalsAtDetection) {
        await db.insert(historicalSignals).values({
          runId,
          signalType: signal.signalType,
          entityName: signal.entityName ?? null,
          entityType: signal.entityType ?? null,
          datasetId: signal.datasetId ?? null,
          jurisdiction: signal.jurisdiction ?? null,
          domain: signal.domain ?? null,
          severity: signal.severity,
          title: signal.title,
          explanation: signal.explanation ?? null,
          confidenceScore: signal.confidenceScore.toFixed(4),
          originalDetectedAt: earliestDetection,
          replayDetectedAt: Date.now(),
          algorithmVersion,
        });
      }
    }

    const summary = {
      totalRecordsProcessed: records.length,
      totalSignals: signalsAtDetection.length,
      earliestDetection,
      confidenceRange: signalsAtDetection.length > 0 ? {
        min: Math.min(...signalsAtDetection.map(s => s.confidenceScore)),
        max: Math.max(...signalsAtDetection.map(s => s.confidenceScore)),
      } : null,
      keyFindings: earliestDetection
        ? [
            `Earliest detectable date: ${new Date(earliestDetection).toISOString().split("T")[0]}`,
            `${signalsAtDetection.length} signals would have been present`,
            `Average confidence: ${(detectionConfidence * 100).toFixed(1)}%`,
            `Contributing streams: ${contributingStreams.join(", ") || "N/A"}`,
          ]
        : [`Pattern "${patternType}" was not detectable in the historical data with ${algorithmVersion} thresholds`],
    };

    await db.update(timeTravelRuns)
      .set({
        status: "completed",
        completedAt: Date.now(),
        signalsDetected: signalsAtDetection.length,
        // @ts-ignore pre-existing type mismatch
        summary,
      })
      .where(eq(timeTravelRuns.id, runId));

    return {
      runId,
      earliestDate: earliestDetection,
      confidence: detectionConfidence,
      signalsRequired: signalsAtDetection.length,
      contributingStreams,
      signalsAtDetection: signalsAtDetection.map(s => ({
        type: s.signalType,
        entity: s.entityName,
        confidence: s.confidenceScore,
      })),
    };
  } catch (error: any) {
    await db.update(timeTravelRuns)
      .set({ status: "failed", completedAt: Date.now(), notes: `Error: ${error.message}` })
      .where(eq(timeTravelRuns.id, runId));
    throw error;
  }
}

// ─── Report Generation ───

export async function generateReplayReport(runId: number): Promise<string> {
  const [run] = await db.select().from(timeTravelRuns).where(eq(timeTravelRuns.id, runId));
  if (!run) return "# Error\n\nRun not found.";

  const signals = await db.select().from(historicalSignals).where(eq(historicalSignals.runId, runId));
  const patterns = await db.select().from(historicalPatterns).where(eq(historicalPatterns.runId, runId));
  const trends = await db.select().from(historicalTrends).where(eq(historicalTrends.runId, runId));
  const cfParams = run.runType === "counterfactual_replay"
    ? await db.select().from(counterfactualParameters).where(eq(counterfactualParameters.runId, runId))
    : [];

  const summary = run.summary as any;
  const algoLabel = ALGORITHM_VERSIONS[run.algorithmVersion]?.label ?? run.algorithmVersion;

  let report = `# Time-Travel Analysis Report\n\n`;
  report += `**Run ID:** ${run.runId}\n`;
  report += `**Type:** ${run.runType.replace(/_/g, " ").replace(/\b\w/g, (c: any) => c.toUpperCase())}\n`;
  report += `**Algorithm:** ${algoLabel}\n`;
  report += `**Status:** ${run.status}\n`;
  report += `**Created:** ${new Date(run.createdAt).toISOString()}\n`;
  if (run.completedAt) report += `**Completed:** ${new Date(run.completedAt).toISOString()}\n`;
  report += `\n---\n\n`;

  // Summary
  report += `## Summary\n\n`;
  report += `| Metric | Value |\n|--------|-------|\n`;
  report += `| Records Processed | ${summary?.totalRecordsProcessed?.toLocaleString() ?? "N/A"} |\n`;
  report += `| Signals Detected | ${run.signalsDetected} |\n`;
  report += `| Patterns Formed | ${run.patternsDetected} |\n`;
  report += `| Trends Identified | ${trends.length} |\n`;
  if (summary?.earliestDetection) {
    report += `| Earliest Detection | ${new Date(summary.earliestDetection).toISOString().split("T")[0]} |\n`;
  }
  if (summary?.confidenceRange) {
    report += `| Confidence Range | ${(summary.confidenceRange.min * 100).toFixed(1)}% – ${(summary.confidenceRange.max * 100).toFixed(1)}% |\n`;
  }
  report += `\n`;

  // Key Findings
  if (summary?.keyFindings?.length > 0) {
    report += `## Key Findings\n\n`;
    for (const finding of summary.keyFindings) {
      report += `- ${finding}\n`;
    }
    report += `\n`;
  }

  // Counterfactual Parameters
  if (cfParams.length > 0) {
    report += `## Counterfactual Parameters\n\n`;
    report += `| Parameter | Value | Type |\n|-----------|-------|------|\n`;
    for (const p of cfParams) {
      report += `| ${p.parameterName} | ${p.parameterValue} | ${p.parameterType} |\n`;
    }
    report += `\n`;
  }

  // Comparison Delta
  if (summary?.comparisonDelta) {
    report += `## Algorithm Comparison\n\n`;
    report += `| Metric | Delta |\n|--------|-------|\n`;
    report += `| Signal Difference | ${summary.comparisonDelta.signalDiff > 0 ? "+" : ""}${summary.comparisonDelta.signalDiff} |\n`;
    report += `| Pattern Difference | ${summary.comparisonDelta.patternDiff > 0 ? "+" : ""}${summary.comparisonDelta.patternDiff} |\n`;
    report += `\n`;
  }

  // Signals Table
  if (signals.length > 0) {
    report += `## Detected Signals (${signals.length})\n\n`;
    report += `| Type | Entity | Severity | Confidence | Dataset |\n|------|--------|----------|------------|--------|\n`;
    for (const s of signals.slice(0, 50)) {
      report += `| ${s.signalType} | ${s.entityName ?? "—"} | ${s.severity} | ${(Number(s.confidenceScore) * 100).toFixed(1)}% | ${s.datasetId ?? "—"} |\n`;
    }
    if (signals.length > 50) report += `\n*...and ${signals.length - 50} more signals*\n`;
    report += `\n`;
  }

  // Patterns Table
  if (patterns.length > 0) {
    report += `## Detected Patterns (${patterns.length})\n\n`;
    report += `| Pattern | Entity | Confidence | Signals | First Detected |\n|---------|--------|------------|---------|----------------|\n`;
    for (const p of patterns.slice(0, 30)) {
      const firstDate = p.firstDetectedAt ? new Date(p.firstDetectedAt).toISOString().split("T")[0] : "—";
      report += `| ${p.patternType} | ${p.entityName ?? "—"} | ${(Number(p.patternConfidence) * 100).toFixed(1)}% | ${p.signalCount} | ${firstDate} |\n`;
    }
    report += `\n`;
  }

  // Analysis conclusion
  report += `## Analysis\n\n`;
  if (run.runType === "historical_replay") {
    report += `This historical replay processed ${summary?.totalRecordsProcessed?.toLocaleString() ?? "N/A"} records using the **${algoLabel}** algorithm. `;
    report += `The system detected ${run.signalsDetected} signals and ${run.patternsDetected} patterns. `;
    if (summary?.earliestDetection) {
      report += `The earliest detectable signal dates to **${new Date(summary.earliestDetection).toISOString().split("T")[0]}**. `;
    }
  } else if (run.runType === "counterfactual_replay") {
    report += `This counterfactual analysis modified ${cfParams.length} parameters to test alternative detection scenarios. `;
    report += `Under the modified conditions, ${run.signalsDetected} signals and ${run.patternsDetected} patterns were detected. `;
  } else if (run.runType === "early_warning_test") {
    report += `This early warning test scanned historical data to determine the earliest point at which the target pattern would have been detectable. `;
  }
  report += `\n\n---\n*Report generated by Luminari Time-Travel Analysis Engine*\n`;

  return report;
}

// ─── Run Management ───

export async function listRuns(limit = 20) {
  return db
    .select()
    .from(timeTravelRuns)
    .orderBy(desc(timeTravelRuns.createdAt))
    .limit(limit);
}

export async function getRun(runId: number) {
  const [run] = await db.select().from(timeTravelRuns).where(eq(timeTravelRuns.id, runId));
  if (!run) return null;

  const signals = await db.select().from(historicalSignals).where(eq(historicalSignals.runId, runId));
  const patterns = await db.select().from(historicalPatterns).where(eq(historicalPatterns.runId, runId));
  const trends = await db.select().from(historicalTrends).where(eq(historicalTrends.runId, runId));
  const cfParams = run.runType === "counterfactual_replay"
    ? await db.select().from(counterfactualParameters).where(eq(counterfactualParameters.runId, runId))
    : [];

  return { run, signals, patterns, trends, counterfactualParameters: cfParams };
}

export async function getRunStats() {
  const [totalRuns] = await db.select({ count: count() }).from(timeTravelRuns);
  const [completedRuns] = await db.select({ count: count() }).from(timeTravelRuns).where(eq(timeTravelRuns.status, "completed"));
  const [totalSignals] = await db.select({ count: count() }).from(historicalSignals);
  const [totalPatterns] = await db.select({ count: count() }).from(historicalPatterns);
  const [totalSnapshots] = await db.select({ count: count() }).from(dataSnapshots);

  const recentRuns = await db
    .select()
    .from(timeTravelRuns)
    .orderBy(desc(timeTravelRuns.createdAt))
    .limit(5);

  return {
    totalRuns: totalRuns?.count ?? 0,
    completedRuns: completedRuns?.count ?? 0,
    totalHistoricalSignals: totalSignals?.count ?? 0,
    totalHistoricalPatterns: totalPatterns?.count ?? 0,
    totalSnapshots: totalSnapshots?.count ?? 0,
    recentRuns,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// INTERNAL REPLAY LOGIC — Pure functions, no DB writes
// ═══════════════════════════════════════════════════════════════════════

interface ReplaySignal {
  signalType: string;
  entityName?: string;
  entityType?: string;
  datasetId?: string;
  jurisdiction?: string;
  domain?: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  explanation?: string;
  confidenceScore: number;
  originalDetectedAt?: number;
  sourceRecordId?: string;
}

interface ReplayPattern {
  patternType: string;
  patternName?: string;
  entityName?: string;
  jurisdiction?: string;
  confidence: number;
  signalCount: number;
  firstDetectedAt?: number;
  lastConfirmedAt?: number;
  contributingSignalIds?: number[];
  metadata?: Record<string, unknown>;
}

interface ReplayTrend {
  patternIndex?: number;
  momentumScore: number;
  pressureIndex: number;
  classification: string;
  volumePressure: number;
  velocityPressure: number;
  geographicPressure: number;
  severityPressure: number;
}

function replaySignalDetection(
  records: (typeof ingestedRecords.$inferSelect)[],
  thresholds: typeof ALGORITHM_VERSIONS["v3.0"]["thresholds"],
  algorithmVersion: string,
  weightOverrides?: Record<string, number>
): ReplaySignal[] {
  const signals: ReplaySignal[] = [];

  // T1. Frequency spike detection
  const categoryMap = new Map<string, typeof records>();
  for (const r of records) {
    const cat = r.normalizedCategory ?? "Unknown";
    if (!categoryMap.has(cat)) categoryMap.set(cat, []);
    categoryMap.get(cat)!.push(r);
  }

  const avgPerCategory = records.length / Math.max(categoryMap.size, 1);
  for (const [category, catRecords] of categoryMap) {
    const multiplier = weightOverrides?.["complaint_weight"] ?? thresholds.frequencySpikeMultiplier;
    if (catRecords.length >= avgPerCategory * multiplier && catRecords.length >= 5) {
      const ratio = catRecords.length / avgPerCategory;
      const confidence = Math.min(0.95, 0.5 + (ratio - multiplier) * 0.1);
      signals.push({
        signalType: "frequency_spike",
        entityName: category,
        datasetId: catRecords[0]?.datasetId ?? undefined,
        jurisdiction: catRecords[0]?.normalizedCity ?? "Unknown",
        domain: category,
        severity: ratio > multiplier * 2 ? "critical" : ratio > multiplier * 1.5 ? "high" : "medium",
        title: `Sector Spike: ${category}`,
        explanation: `Category "${category}" has ${catRecords.length} records (${ratio.toFixed(1)}x average)`,
        confidenceScore: confidence,
        originalDetectedAt: catRecords[0]?.normalizedDate?.getTime() ?? undefined,
      });
    }
  }

  // T2. Entity repeat detection
  const entityMap = new Map<string, typeof records>();
  for (const r of records) {
    const entity = r.normalizedEntity;
    if (!entity || entity.trim().length <= 2) continue;
    // Non-entity name filter
    const lower = entity.trim().toLowerCase();
    if (["private individual", "unknown", "unnamed business", "n/a", "none", "other", "various", "anonymous", "confidential", "redacted"].includes(lower)) continue;
    if (/^\d+$/.test(lower)) continue;

    if (!entityMap.has(entity)) entityMap.set(entity, []);
    entityMap.get(entity)!.push(r);
  }

  for (const [entity, entityRecords] of entityMap) {
    if (entityRecords.length < thresholds.entityRepeatMin) continue;

    // Entity classification
    const classification = classifyEntity(entity, entityRecords[0]?.datasetId ?? undefined);
    const signalDecision = shouldGenerateSignal(classification, entityRecords.length, false);
    if (!signalDecision.generate) continue;

    const confidence = Math.min(0.95, 0.4 + entityRecords.length * 0.03);
    signals.push({
      signalType: "repeat_entity",
      entityName: entity,
      entityType: classification.entityType,
      datasetId: entityRecords[0]?.datasetId ?? undefined,
      jurisdiction: entityRecords[0]?.normalizedCity ?? "Unknown",
      domain: entityRecords[0]?.normalizedCategory ?? "Unknown",
      severity: entityRecords.length >= 20 ? "critical" : entityRecords.length >= 10 ? "high" : "medium",
      title: `Repeat Entity: ${entity} (${entityRecords.length} records)`,
      explanation: `Entity "${entity}" appears ${entityRecords.length} times across records`,
      confidenceScore: confidence * (signalDecision.priorityMultiplier || 1),
      originalDetectedAt: entityRecords[0]?.normalizedDate?.getTime() ?? undefined,
    });
  }

  // T3. Geographic clustering
  const geoMap = new Map<string, typeof records>();
  for (const r of records) {
    const city = r.normalizedCity;
    if (!city || city.trim().length <= 2) continue;
    if (!geoMap.has(city)) geoMap.set(city, []);
    geoMap.get(city)!.push(r);
  }

  for (const [city, cityRecords] of geoMap) {
    if (cityRecords.length < thresholds.geoClusterMinCount) continue;
    const pct = (cityRecords.length / records.length) * 100;
    const confidence = Math.min(0.90, 0.4 + pct * 0.02);
    signals.push({
      signalType: "geographic_cluster",
      entityName: city,
      datasetId: cityRecords[0]?.datasetId ?? undefined,
      jurisdiction: cityRecords[0]?.normalizedCity ?? "Unknown",
      domain: cityRecords[0]?.normalizedCategory ?? "Unknown",
      severity: pct > 30 ? "high" : "medium",
      title: `Geographic Concentration: ${city}`,
      explanation: `${city} accounts for ${pct.toFixed(1)}% of records (${cityRecords.length} of ${records.length})`,
      confidenceScore: confidence,
      originalDetectedAt: cityRecords[0]?.normalizedDate?.getTime() ?? undefined,
    });
  }

  // T4. Status delay detection
  // NOTE: ingestedRecords.status is a recordStatusEnum with values:
  //   "received" | "normalized" | "processed" | "failed" | "rejected"
  // The original code referenced a non-existent "normalizedStatus" column and compared against
  // open-state strings ("open", "pending", etc.) that do not exist in this enum.
  // Map the enum: "received" and "normalized" are in-flight (not yet processed) — treat as "open".
  const statusMap = new Map<string, number>();
  for (const r of records) {
    const status = (r.status ?? "").toLowerCase();
    statusMap.set(status, (statusMap.get(status) ?? 0) + 1);
  }
  // Map recordStatusEnum values to open/in-flight concept
  const openStatuses: Array<typeof records[number]["status"]> = ["received", "normalized"];
  let openCount = 0;
  for (const s of openStatuses) openCount += statusMap.get(s) ?? 0;
  const openPct = records.length > 0 ? (openCount / records.length) * 100 : 0;
  if (openPct > 30 && openCount >= 5) {
    signals.push({
      signalType: "status_delay",
      datasetId: records[0]?.datasetId ?? undefined,
      jurisdiction: records[0]?.normalizedCity ?? "Unknown",
      domain: "resolution_status",
      severity: openPct > 50 ? "high" : "medium",
      title: `Elevated Unresolved Record Rate`,
      explanation: `${openPct.toFixed(1)}% of records (${openCount}) remain in received/normalized status`,
      confidenceScore: Math.min(0.85, 0.4 + openPct * 0.01),
    });
  }

  return signals;
}

function buildHistoricalPatterns(
  signals: ReplaySignal[],
  thresholds: typeof ALGORITHM_VERSIONS["v3.0"]["thresholds"],
  algorithmVersion: string
): ReplayPattern[] {
  const patterns: ReplayPattern[] = [];

  // Group signals by entity
  const entitySignals = new Map<string, ReplaySignal[]>();
  for (const s of signals) {
    if (!s.entityName) continue;
    if (!entitySignals.has(s.entityName)) entitySignals.set(s.entityName, []);
    entitySignals.get(s.entityName)!.push(s);
  }

  for (const [entity, sigs] of entitySignals) {
    if (sigs.length < 2) continue;
    const signalTypes = [...new Set(sigs.map(s => s.signalType))];
    const jurisdictions = [...new Set(sigs.map(s => s.jurisdiction).filter(Boolean))];
    const avgConfidence = sigs.reduce((s, sig) => s + sig.confidenceScore, 0) / sigs.length;
    const dates = sigs.map(s => s.originalDetectedAt).filter(Boolean) as number[];

    patterns.push({
      patternType: signalTypes.length >= 3 ? "multi_signal_convergence" : signalTypes.length >= 2 ? "dual_signal_pattern" : signalTypes[0],
      patternName: `${entity} — ${signalTypes.join(" + ")}`,
      entityName: entity,
      jurisdiction: jurisdictions[0] ?? "Unknown",
      confidence: avgConfidence,
      signalCount: sigs.length,
      firstDetectedAt: dates.length > 0 ? Math.min(...dates) : undefined,
      lastConfirmedAt: dates.length > 0 ? Math.max(...dates) : undefined,
      metadata: { signalTypes, jurisdictions, algorithmVersion },
    });
  }

  // Group signals by jurisdiction for geographic patterns
  const jurisdictionSignals = new Map<string, ReplaySignal[]>();
  for (const s of signals) {
    if (!s.jurisdiction || s.jurisdiction === "Unknown") continue;
    if (!jurisdictionSignals.has(s.jurisdiction)) jurisdictionSignals.set(s.jurisdiction, []);
    jurisdictionSignals.get(s.jurisdiction)!.push(s);
  }

  for (const [jurisdiction, sigs] of jurisdictionSignals) {
    if (sigs.length < thresholds.minPatternRepetition) continue;
    const signalTypes = [...new Set(sigs.map(s => s.signalType))];
    if (signalTypes.length < 2) continue;

    patterns.push({
      patternType: "jurisdictional_convergence",
      patternName: `${jurisdiction} — multi-signal convergence`,
      jurisdiction,
      confidence: sigs.reduce((s, sig) => s + sig.confidenceScore, 0) / sigs.length,
      signalCount: sigs.length,
      metadata: { signalTypes, algorithmVersion },
    });
  }

  return patterns;
}

function buildHistoricalTrends(
  patterns: ReplayPattern[],
  signals: ReplaySignal[],
  thresholds: typeof ALGORITHM_VERSIONS["v3.0"]["thresholds"]
): ReplayTrend[] {
  const trends: ReplayTrend[] = [];

  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i];
    const patternSignals = signals.filter(s => s.entityName === pattern.entityName);

    // Volume pressure: signal count relative to threshold
    const volumePressure = Math.min(100, Math.round((pattern.signalCount / thresholds.minPatternRepetition) * 30));

    // Velocity pressure: how quickly signals accumulated
    const dates = patternSignals.map(s => s.originalDetectedAt).filter(Boolean) as number[];
    let velocityPressure = 0;
    if (dates.length >= 2) {
      const span = Math.max(...dates) - Math.min(...dates);
      const daysSpan = span / (24 * 60 * 60 * 1000);
      velocityPressure = daysSpan > 0 ? Math.min(100, Math.round((pattern.signalCount / daysSpan) * 30)) : 50;
    }

    // Geographic pressure: unique jurisdictions
    const uniqueJurisdictions = new Set(patternSignals.map(s => s.jurisdiction).filter(Boolean));
    const geographicPressure = Math.min(100, uniqueJurisdictions.size * 20);

    // Severity pressure: based on signal severity distribution
    const severityWeights: Record<string, number> = { critical: 100, high: 70, medium: 40, low: 10 };
    const severityPressure = patternSignals.length > 0
      ? Math.round(patternSignals.reduce((s, sig) => s + (severityWeights[sig.severity] ?? 0), 0) / patternSignals.length)
      : 0;

    const pressureIndex = Math.round((volumePressure + velocityPressure + geographicPressure + severityPressure) / 4);
    const momentumScore = Math.round(pressureIndex * (pattern.confidence));

    let classification = "stable";
    if (momentumScore >= 70) classification = "accelerating";
    else if (momentumScore >= 50) classification = "growing";
    else if (momentumScore >= 30) classification = "emerging";
    else if (momentumScore < 15) classification = "declining";

    trends.push({
      patternIndex: i,
      momentumScore,
      pressureIndex,
      classification,
      volumePressure,
      velocityPressure,
      geographicPressure,
      severityPressure,
    });
  }

  return trends;
}

function generateKeyFindings(signals: ReplaySignal[], patterns: ReplayPattern[], totalRecords: number): string[] {
  const findings: string[] = [];

  if (signals.length === 0) {
    findings.push("No signals detected in the historical data with the given thresholds");
    return findings;
  }

  // Top entities by signal count
  const entityCounts = new Map<string, number>();
  for (const s of signals) {
    if (s.entityName) entityCounts.set(s.entityName, (entityCounts.get(s.entityName) ?? 0) + 1);
  }
  const topEntities = [...entityCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (topEntities.length > 0) {
    findings.push(`Top entities: ${topEntities.map(([e, c]) => `${e} (${c} signals)`).join(", ")}`);
  }

  // Signal type breakdown
  const typeCounts = new Map<string, number>();
  for (const s of signals) typeCounts.set(s.signalType, (typeCounts.get(s.signalType) ?? 0) + 1);
  findings.push(`Signal types: ${[...typeCounts.entries()].map(([t, c]) => `${t}: ${c}`).join(", ")}`);

  // Severity breakdown
  const severityCounts = new Map<string, number>();
  for (const s of signals) severityCounts.set(s.severity, (severityCounts.get(s.severity) ?? 0) + 1);
  const critical = severityCounts.get("critical") ?? 0;
  const high = severityCounts.get("high") ?? 0;
  if (critical > 0 || high > 0) {
    findings.push(`High-severity signals: ${critical} critical, ${high} high`);
  }

  // Multi-signal patterns
  const multiSignalPatterns = patterns.filter(p => p.signalCount >= 3);
  if (multiSignalPatterns.length > 0) {
    findings.push(`${multiSignalPatterns.length} entities have 3+ converging signals`);
  }

  return findings;
}

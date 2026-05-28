// LINT-GUARD: AUTHORIZED live_signals accessor — signal pipeline infrastructure
/**
 * Sunam Approval Gate
 * 
 * The canonical quality gate between live_signals and detected_signals.
 * 
 * Flow: live_signals → Sunam gate → detected_signals (pass) OR extraction_staging (fail)
 * 
 * Rules:
 * - Every signal from live_signals is scored using weighted factors
 * - Signals above threshold → promoted to detected_signals
 * - Signals below threshold → sent to extraction_staging (admin-visible only)
 * - Every decision (approve/reject) is logged to sunam_gate_log with full score breakdown
 * - Thresholds are configurable from Sovereign Control via sunam_thresholds table
 * - No retroactive reprocessing without explicit instruction
 * - Once live, only Sunam reads from live_signals — nothing else
 */

import { db } from "./db";
import { sql } from "drizzle-orm";
import { storeGovernedSignal, type DetectedSignalInput } from "./signal-governance";

// ─── Types ──────────────────────────────────────────────────────

export interface SunamScoreBreakdown {
  confidence: { raw: number; weight: number; weighted: number; rationale: string };
  evidenceStrength: { raw: number; weight: number; weighted: number; rationale: string };
  corroboration: { raw: number; weight: number; weighted: number; rationale: string };
  temporalDensity: { raw: number; weight: number; weighted: number; rationale: string };
  geographicScope: { raw: number; weight: number; weighted: number; rationale: string };
}

export interface SunamDecision {
  approved: boolean;
  score: number;
  threshold: number;
  breakdown: SunamScoreBreakdown;
  reason: string;
}

interface ThresholdConfig {
  id: number;
  thresholdName: string;
  weightConfidence: number;
  weightEvidenceStrength: number;
  weightCorroboration: number;
  weightTemporalDensity: number;
  weightGeographicScope: number;
  passThreshold: number;
  appliesToSignalType: string | null;
  appliesToDataset: string | null;
}

export interface LiveSignalRow {
  id: number;
  signalType: string;
  datasetId: string;
  jurisdiction: string | null;
  domain: string | null;
  severity: string;
  title: string;
  explanation: string | null;
  patternSummary: string | null;
  supportingStatistics: any;
  confidenceScore: string | null;
  detectedAt: number;
  ingestRunId: number | null;
  signalFingerprint: string | null;
  entityType: string | null;
  canonicalEntityName: string | null;
  entityRole: string | null;
}

// ─── Threshold Loading ──────────────────────────────────────────

let cachedThresholds: ThresholdConfig[] | null = null;
let thresholdCacheTime = 0;
const THRESHOLD_CACHE_TTL = 30_000; // 30 seconds

async function loadThresholds(): Promise<ThresholdConfig[]> {
  if (cachedThresholds && Date.now() - thresholdCacheTime < THRESHOLD_CACHE_TTL) {
    return cachedThresholds;
  }
  const rows = await db.execute(
    sql`SELECT id, threshold_name, weight_confidence, weight_evidence_strength,
               weight_corroboration, weight_temporal_density, weight_geographic_scope,
               pass_threshold, applies_to_signal_type, applies_to_dataset
        FROM sunam_thresholds WHERE is_active = 1 ORDER BY id`
  );
  cachedThresholds = (rows as any)[0].map((r: any) => ({
    id: r.id,
    thresholdName: r.threshold_name,
    weightConfidence: parseFloat(r.weight_confidence),
    weightEvidenceStrength: parseFloat(r.weight_evidence_strength),
    weightCorroboration: parseFloat(r.weight_corroboration),
    weightTemporalDensity: parseFloat(r.weight_temporal_density),
    weightGeographicScope: parseFloat(r.weight_geographic_scope),
    passThreshold: parseFloat(r.pass_threshold),
    appliesToSignalType: r.applies_to_signal_type,
    appliesToDataset: r.applies_to_dataset,
  }));
  thresholdCacheTime = Date.now();
  return cachedThresholds!;
}

/** Invalidate threshold cache (called when admin updates thresholds) */
export function invalidateThresholdCache(): void {
  cachedThresholds = null;
  thresholdCacheTime = 0;
}

/**
 * Find the most specific threshold config for a signal.
 * Priority: signal_type + dataset > signal_type > dataset > default
 */
async function getThresholdFor(signalType: string, datasetId: string): Promise<ThresholdConfig> {
  const thresholds = await loadThresholds();

  // Most specific: matches both signal_type and dataset
  const exact = thresholds.find(
    t => t.appliesToSignalType === signalType && t.appliesToDataset === datasetId
  );
  if (exact) return exact;

  // Signal type specific
  const byType = thresholds.find(
    t => t.appliesToSignalType === signalType && !t.appliesToDataset
  );
  if (byType) return byType;

  // Dataset specific
  const byDataset = thresholds.find(
    t => !t.appliesToSignalType && t.appliesToDataset === datasetId
  );
  if (byDataset) return byDataset;

  // Default
  const defaultThreshold = thresholds.find(t => t.thresholdName === "default");
  if (defaultThreshold) return defaultThreshold;

  // Hardcoded fallback (should never reach here)
  return {
    id: 0,
    thresholdName: "fallback",
    weightConfidence: 0.30,
    weightEvidenceStrength: 0.25,
    weightCorroboration: 0.20,
    weightTemporalDensity: 0.15,
    weightGeographicScope: 0.10,
    passThreshold: 0.50,
    appliesToSignalType: null,
    appliesToDataset: null,
  };
}

// ─── Scoring ────────────────────────────────────────────────────

/**
 * Score a live signal using weighted factors.
 * Each factor produces a raw score 0.0–1.0, then multiplied by its weight.
 * Final score = sum of weighted scores (0.0–1.0).
 */
function scoreSignal(signal: LiveSignalRow, config: ThresholdConfig): SunamScoreBreakdown {
  const stats = typeof signal.supportingStatistics === "string"
    ? JSON.parse(signal.supportingStatistics)
    : (signal.supportingStatistics || {});

  // 1. Confidence — based on the detector's own confidence score
  const rawConfidence = signal.confidenceScore ? parseFloat(signal.confidenceScore) : 0;
  const confidenceRaw = Math.min(1.0, rawConfidence);
  const confidenceRationale = `Detector confidence: ${(confidenceRaw * 100).toFixed(1)}%`;

  // 2. Evidence Strength — based on record count and pattern repetition
  const recordsAnalyzed = stats.recordsAnalyzed || stats.totalRecords || 0;
  const patternCount = stats.patternCount || stats.count || 0;
  let evidenceRaw = 0;
  if (recordsAnalyzed >= 1000 && patternCount >= 50) evidenceRaw = 0.95;
  else if (recordsAnalyzed >= 500 && patternCount >= 20) evidenceRaw = 0.80;
  else if (recordsAnalyzed >= 100 && patternCount >= 10) evidenceRaw = 0.65;
  else if (recordsAnalyzed >= 50 && patternCount >= 5) evidenceRaw = 0.50;
  else if (recordsAnalyzed >= 10 && patternCount >= 3) evidenceRaw = 0.35;
  else if (patternCount >= 2) evidenceRaw = 0.25;
  else evidenceRaw = 0.10;
  const evidenceRationale = `${recordsAnalyzed} records, ${patternCount} pattern instances`;

  // 3. Corroboration — based on whether signal has cross-dataset or multi-source support
  let corroborationRaw = 0.20; // Default: no corroboration
  const deviation = stats.deviation || stats.stdDevAboveMean || 0;
  const percentChange = stats.percentChange || stats.yoyChange || 0;
  if (deviation >= 3) corroborationRaw = 0.90;
  else if (deviation >= 2) corroborationRaw = 0.70;
  else if (deviation >= 1.5) corroborationRaw = 0.50;
  else if (Math.abs(percentChange) >= 50) corroborationRaw = 0.60;
  else if (Math.abs(percentChange) >= 25) corroborationRaw = 0.40;
  const corroborationRationale = deviation > 0
    ? `Statistical deviation: ${deviation.toFixed(2)}σ`
    : (percentChange ? `Change: ${percentChange.toFixed(1)}%` : "No statistical corroboration available");

  // 4. Temporal Density — based on time range of the signal
  const timeRange = stats.timeRange || {};
  const from = timeRange.from || timeRange.start || 0;
  const to = timeRange.to || timeRange.end || 0;
  const spanDays = from && to ? Math.round((to - from) / 86400000) : 0;
  let temporalRaw = 0.15;
  if (spanDays >= 365) temporalRaw = 0.90;
  else if (spanDays >= 180) temporalRaw = 0.75;
  else if (spanDays >= 90) temporalRaw = 0.60;
  else if (spanDays >= 30) temporalRaw = 0.45;
  else if (spanDays >= 7) temporalRaw = 0.30;
  const temporalRationale = spanDays > 0 ? `Temporal span: ${spanDays} days` : "No temporal range data";

  // 5. Geographic Scope — based on jurisdiction and scope classification
  const scope = stats.scopeClassification || stats.interpretationContext?.scopeClassification || "";
  const jurisdiction = signal.jurisdiction || "";
  let geoRaw = 0.20;
  if (scope === "national" || jurisdiction.toLowerCase().includes("national")) geoRaw = 0.95;
  else if (scope === "statewide" || jurisdiction.toLowerCase().includes("statewide")) geoRaw = 0.80;
  else if (scope === "regional" || scope === "multi_county") geoRaw = 0.60;
  else if (scope === "local" || scope === "county") geoRaw = 0.40;
  else if (jurisdiction) geoRaw = 0.30;
  const geoRationale = scope ? `Scope: ${scope}` : (jurisdiction ? `Jurisdiction: ${jurisdiction}` : "No geographic scope data");

  return {
    confidence: {
      raw: confidenceRaw,
      weight: config.weightConfidence,
      weighted: Math.round(confidenceRaw * config.weightConfidence * 10000) / 10000,
      rationale: confidenceRationale,
    },
    evidenceStrength: {
      raw: evidenceRaw,
      weight: config.weightEvidenceStrength,
      weighted: Math.round(evidenceRaw * config.weightEvidenceStrength * 10000) / 10000,
      rationale: evidenceRationale,
    },
    corroboration: {
      raw: corroborationRaw,
      weight: config.weightCorroboration,
      weighted: Math.round(corroborationRaw * config.weightCorroboration * 10000) / 10000,
      rationale: corroborationRationale,
    },
    temporalDensity: {
      raw: temporalRaw,
      weight: config.weightTemporalDensity,
      weighted: Math.round(temporalRaw * config.weightTemporalDensity * 10000) / 10000,
      rationale: temporalRationale,
    },
    geographicScope: {
      raw: geoRaw,
      weight: config.weightGeographicScope,
      weighted: Math.round(geoRaw * config.weightGeographicScope * 10000) / 10000,
      rationale: geoRationale,
    },
  };
}

function computeTotalScore(breakdown: SunamScoreBreakdown): number {
  return Math.round((
    breakdown.confidence.weighted +
    breakdown.evidenceStrength.weighted +
    breakdown.corroboration.weighted +
    breakdown.temporalDensity.weighted +
    breakdown.geographicScope.weighted
  ) * 10000) / 10000;
}

// ─── Gate Decision ──────────────────────────────────────────────

/**
 * Evaluate a single live signal through the Sunam gate.
 * Returns the decision with full score breakdown.
 */
export async function evaluateSignal(signal: LiveSignalRow): Promise<SunamDecision> {
  const config = await getThresholdFor(signal.signalType, signal.datasetId);
  const breakdown = scoreSignal(signal, config);
  const score = computeTotalScore(breakdown);
  const approved = score >= config.passThreshold;

  const reason = approved
    ? `Score ${score.toFixed(4)} >= threshold ${config.passThreshold.toFixed(4)} (config: ${config.thresholdName})`
    : `Score ${score.toFixed(4)} < threshold ${config.passThreshold.toFixed(4)} (config: ${config.thresholdName})`;

  return {
    approved,
    score,
    threshold: config.passThreshold,
    breakdown,
    reason,
  };
}

// ─── Promote to detected_signals ────────────────────────────────

async function promoteSignal(signal: LiveSignalRow, decision: SunamDecision, gateLogId: number): Promise<string> {
  const stats = typeof signal.supportingStatistics === "string"
    ? JSON.parse(signal.supportingStatistics)
    : (signal.supportingStatistics || {});

  const governed = await storeGovernedSignal({
    signalType: signal.signalType,
    datasetId: signal.datasetId,
    ingestRunId: signal.ingestRunId ?? undefined,
    title: signal.title,
    explanation: signal.explanation || undefined,
    severityLevel: signal.severity,
    jurisdictionScope: signal.jurisdiction || undefined,
    statisticalContext: {
      ...stats,
      sunamScore: decision.score,
      sunamThreshold: decision.threshold,
    },
    sourceRecordIds: [],
    sampleSize: stats.recordsAnalyzed || stats.totalRecords,
    recordCount: stats.patternCount || stats.count,
    temporalSpan: (() => {
      const tr = stats.timeRange || {};
      const f = tr.from || tr.start || 0;
      const t = tr.to || tr.end || 0;
      return f && t ? Math.round((t - f) / 86400000) : 0;
    })(),
    geographicScope: stats.scopeClassification || undefined,
    hasCorroboration: decision.breakdown.corroboration.raw >= 0.50,
    dataQuality: Math.round(decision.score * 100),
    gateLogId,
  });

  return governed.signalId;
}

// ─── Stage failed signal ────────────────────────────────────────

async function stageSignal(signal: LiveSignalRow, decision: SunamDecision): Promise<number> {
  const now = Date.now();
  const result = await db.execute(sql`
    INSERT INTO extraction_staging
      (signal_type, dataset_id, jurisdiction, domain, severity, title, explanation,
       pattern_summary, supporting_statistics, raw_confidence_score, signal_fingerprint,
       entity_type, canonical_entity_name, entity_role,
       live_signal_id, ingest_run_id,
       sunam_score, sunam_threshold, score_breakdown,
       gate_decision, gate_reason,
       staged_at, created_at, updated_at)
    VALUES
      (${signal.signalType || 'unknown'}, ${signal.datasetId || 'unclassified'}, ${signal.jurisdiction || 'unknown'},
       ${signal.domain || 'unknown'}, ${signal.severity || 'medium'}, ${signal.title || 'Untitled Signal'}, ${signal.explanation || null},
       ${signal.patternSummary},
       ${JSON.stringify(signal.supportingStatistics)},
       ${signal.confidenceScore ? parseFloat(signal.confidenceScore) : null},
       ${signal.signalFingerprint},
       ${signal.entityType}, ${signal.canonicalEntityName}, ${signal.entityRole},
       ${signal.id}, ${signal.ingestRunId},
       ${decision.score}, ${decision.threshold},
       ${JSON.stringify(decision.breakdown)},
       'staged', ${decision.reason},
       ${now}, ${now}, ${now})
  `);
  return (result as any)[0]?.insertId || 0;
}

// ─── Log gate decision ──────────────────────────────────────────

async function logGateDecision(
  signal: LiveSignalRow,
  decision: SunamDecision,
  outcome: "approve" | "reject",
  promotedSignalId: string | null,
  stagingId: number | null,
  actor: string | null = null
): Promise<number> {
  const now = Date.now();
  await db.execute(sql`
    INSERT INTO sunam_gate_log
      (live_signal_id, signal_fingerprint, signal_type, dataset_id,
       sunam_score, threshold_used, score_breakdown,
       decision, decision_reason,
       promoted_signal_id, staging_id, actor,
       decided_at, created_at)
    VALUES
      (${signal.id}, ${signal.signalFingerprint || null}, ${signal.signalType || 'unknown'}, ${signal.datasetId || 'unclassified'},
       ${decision.score}, ${decision.threshold},
       ${JSON.stringify(decision.breakdown)},
       ${outcome}, ${decision.reason},
       ${promotedSignalId}, ${stagingId}, ${actor},
       ${now}, ${now})
  `);
  // Return the auto-increment ID of the gate log entry
  const [rows] = await db.execute(sql`SELECT LAST_INSERT_ID() as id`);
  return Number((rows as unknown as any[])[0]?.id) || 0;
}

// ─── Main Gate Processing ───────────────────────────────────────

/**
 * Process a single live signal through the Sunam gate.
 * - Scores the signal
 * - Promotes to detected_signals if approved
 * - Stages to extraction_staging if rejected
 * - Logs the decision either way
 * 
 * Returns the decision and destination.
 */
export async function processSignalThroughGate(signal: LiveSignalRow): Promise<{
  decision: SunamDecision;
  destination: "detected_signals" | "extraction_staging";
  destinationId: string | number;
  gateLogId: number;
}> {
  const decision = await evaluateSignal(signal);

  if (decision.approved) {
    // Step 1: Log the gate decision FIRST to get the gateLogId
    const gateLogId = await logGateDecision(signal, decision, "approve", null, null);
    // Step 2: Promote signal with gateLogId (enforced linkage)
    const signalId = await promoteSignal(signal, decision, gateLogId);
    // Step 3: Update the gate log with the promoted signal ID
    await db.execute(sql`
      UPDATE sunam_gate_log SET promoted_signal_id = ${signalId} WHERE id = ${gateLogId}
    `);
    return { decision, destination: "detected_signals", destinationId: signalId, gateLogId };
  } else {
    const stagingId = await stageSignal(signal, decision);
    const gateLogId = await logGateDecision(signal, decision, "reject", null, stagingId);
    return { decision, destination: "extraction_staging", destinationId: stagingId, gateLogId };
  }
}

/**
 * Process a batch of live signals through the gate.
 * Called after signal detection completes for a dataset.
 * 
 * @param liveSignalIds - IDs of live_signals to process (from the current detection run)
 */
export async function processGateBatch(liveSignalIds: number[]): Promise<{
  total: number;
  approved: number;
  rejected: number;
  errors: number;
}> {
  const stats = { total: liveSignalIds.length, approved: 0, rejected: 0, errors: 0 };

  for (const id of liveSignalIds) {
    try {
      // Read the live signal — COALESCE _ls columns with originals
      // _ls columns were added later but are empty on most rows;
      // original columns hold the actual data for all 1,216 signals.
      const rows = await db.execute(sql`
        SELECT id,
               COALESCE(NULLIF(signalType_ls, ''), signalType) as signalType,
               COALESCE(NULLIF(datasetId_ls, ''), datasetId) as datasetId,
               COALESCE(NULLIF(jurisdiction_ls, ''), jurisdiction) as jurisdiction,
               COALESCE(NULLIF(domain_ls, ''), domain) as domain,
               COALESCE(NULLIF(severity_ls, ''), severity) as severity,
               COALESCE(NULLIF(title_ls, ''), title) as title,
               COALESCE(NULLIF(explanation_ls, ''), explanation) as explanation,
               patternSummary,
               supportingStatistics, confidenceScore,
               COALESCE(detectedAt_ls, detectedAt) as detectedAt,
               ingestRunId,
               signalFingerprint,
               COALESCE(NULLIF(entity_type_ls, ''), entityType) as entityType,
               canonical_entity_name as canonicalEntityName,
               entity_role as entityRole
        FROM live_signals WHERE id = ${id}
      `);
      const arr = (rows as any)[0];
      if (arr.length === 0) {
        stats.errors++;
        continue;
      }

      const signal: LiveSignalRow = {
        id: arr[0].id,
        signalType: arr[0].signalType,
        datasetId: arr[0].datasetId,
        jurisdiction: arr[0].jurisdiction,
        domain: arr[0].domain,
        severity: arr[0].severity,
        title: arr[0].title,
        explanation: arr[0].explanation,
        patternSummary: arr[0].patternSummary,
        supportingStatistics: typeof arr[0].supportingStatistics === "string"
          ? JSON.parse(arr[0].supportingStatistics)
          : arr[0].supportingStatistics,
        confidenceScore: arr[0].confidenceScore,
        detectedAt: Number(arr[0].detectedAt),
        ingestRunId: arr[0].ingestRunId,
        signalFingerprint: arr[0].signalFingerprint,
        entityType: arr[0].entityType,
        canonicalEntityName: arr[0].canonicalEntityName,
        entityRole: arr[0].entityRole,
      };

      const result = await processSignalThroughGate(signal);
      if (result.destination === "detected_signals") {
        stats.approved++;
      } else {
        stats.rejected++;
      }
    } catch (err) {
      console.error(`[SunamGate] Error processing signal ${id}:`, err);
      stats.errors++;
    }
  }

  console.log(
    `[SunamGate] Batch complete: ${stats.total} processed, ` +
    `${stats.approved} approved, ${stats.rejected} rejected, ${stats.errors} errors`
  );

  return stats;
}

// ─── Admin: Manual Promote from Staging ─────────────────────────

/**
 * Manually promote a staged signal to detected_signals.
 * Used by admin from Sovereign Control.
 */
export async function manualPromote(stagingId: number, actor: string): Promise<{
  success: boolean;
  signalId?: string;
  error?: string;
}> {
  // Read the staged signal
  const rows = await db.execute(sql`
    SELECT * FROM extraction_staging WHERE id = ${stagingId} AND gate_decision = 'staged'
  `);
  const arr = (rows as any)[0];
  if (arr.length === 0) {
    return { success: false, error: "Staged signal not found or already processed" };
  }

  const staged = arr[0];
  const now = Date.now();

  // Build a LiveSignalRow-like object for promotion
  const signalLike: LiveSignalRow = {
    id: staged.live_signal_id || 0,
    signalType: staged.signal_type,
    datasetId: staged.dataset_id,
    jurisdiction: staged.jurisdiction,
    domain: staged.domain,
    severity: staged.severity,
    title: staged.title,
    explanation: staged.explanation,
    patternSummary: staged.pattern_summary,
    supportingStatistics: typeof staged.supporting_statistics === "string"
      ? JSON.parse(staged.supporting_statistics)
      : staged.supporting_statistics,
    confidenceScore: staged.raw_confidence_score,
    detectedAt: Number(staged.staged_at),
    ingestRunId: staged.ingest_run_id,
    signalFingerprint: staged.signal_fingerprint,
    entityType: staged.entity_type,
    canonicalEntityName: staged.canonical_entity_name,
    entityRole: staged.entity_role,
  };

  const manualDecision: SunamDecision = {
    approved: true,
    score: parseFloat(staged.sunam_score),
    threshold: parseFloat(staged.sunam_threshold),
    breakdown: typeof staged.score_breakdown === "string"
      ? JSON.parse(staged.score_breakdown)
      : staged.score_breakdown,
    reason: `Manually promoted by ${actor}`,
  };

  // Step 1: Log the gate decision FIRST to get gateLogId
  await db.execute(sql`
    INSERT INTO sunam_gate_log
      (live_signal_id, signal_fingerprint, signal_type, dataset_id,
       sunam_score, threshold_used, score_breakdown,
       decision, decision_reason,
       promoted_signal_id, staging_id, actor,
       decided_at, created_at)
    VALUES
      (${staged.live_signal_id}, ${staged.signal_fingerprint},
       ${staged.signal_type}, ${staged.dataset_id},
       ${staged.sunam_score}, ${staged.sunam_threshold},
       ${JSON.stringify(staged.score_breakdown)},
       'manual_promote', ${`Manually promoted by ${actor}`},
       ${null}, ${stagingId}, ${actor},
       ${now}, ${now})
  `);
  const [gateRows] = await db.execute(sql`SELECT LAST_INSERT_ID() as id`);
  const gateLogId = Number((gateRows as unknown as any[])[0]?.id) || 0;

  // Step 2: Promote through governance layer WITH gateLogId
  const signalId = await promoteSignal(signalLike, manualDecision, gateLogId);

  // Step 3: Update gate log with promoted signal ID
  await db.execute(sql`
    UPDATE sunam_gate_log SET promoted_signal_id = ${signalId} WHERE id = ${gateLogId}
  `);

  // Update staging record
  await db.execute(sql`
    UPDATE extraction_staging
    SET gate_decision = 'promoted',
        promoted_at = ${now},
        promoted_signal_id = ${signalId},
        reviewed_by = ${actor},
        reviewed_at = ${now},
        updated_at = ${now}
    WHERE id = ${stagingId}
  `);

  return { success: true, signalId };
}

// ─── Admin: Manual Reject from Staging ──────────────────────────

/**
 * Manually reject a staged signal (remove from staging queue).
 */
export async function manualReject(stagingId: number, actor: string, reason: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const rows = await db.execute(sql`
    SELECT * FROM extraction_staging WHERE id = ${stagingId} AND gate_decision = 'staged'
  `);
  const arr = (rows as any)[0];
  if (arr.length === 0) {
    return { success: false, error: "Staged signal not found or already processed" };
  }

  const staged = arr[0];
  const now = Date.now();

  await db.execute(sql`
    UPDATE extraction_staging
    SET gate_decision = 'rejected',
        reviewed_by = ${actor},
        reviewed_at = ${now},
        review_notes = ${reason},
        updated_at = ${now}
    WHERE id = ${stagingId}
  `);

  await db.execute(sql`
    INSERT INTO sunam_gate_log
      (live_signal_id, signal_fingerprint, signal_type, dataset_id,
       sunam_score, threshold_used, score_breakdown,
       decision, decision_reason,
       promoted_signal_id, staging_id, actor,
       decided_at, created_at)
    VALUES
      (${staged.live_signal_id}, ${staged.signal_fingerprint},
       ${staged.signal_type}, ${staged.dataset_id},
       ${staged.sunam_score}, ${staged.sunam_threshold},
       ${JSON.stringify(staged.score_breakdown)},
       'manual_reject', ${reason},
       ${null}, ${stagingId}, ${actor},
       ${now}, ${now})
  `);

  return { success: true };
}

// ─── Dashboard Queries ──────────────────────────────────────────

/**
 * Get Sunam gate statistics for Sovereign Control dashboard.
 */
export async function getGateStats(): Promise<{
  totalProcessed: number;
  totalApproved: number;
  totalRejected: number;
  totalStaged: number;
  totalManualPromoted: number;
  totalManualRejected: number;
  approvalRate: number;
  recentDecisions: Array<{
    id: number;
    signalType: string;
    datasetId: string;
    score: number;
    threshold: number;
    decision: string;
    decidedAt: number;
    actor: string | null;
  }>;
}> {
  const countRows = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN decision = 'approve' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN decision = 'reject' THEN 1 ELSE 0 END) as rejected,
      SUM(CASE WHEN decision = 'manual_promote' THEN 1 ELSE 0 END) as manual_promoted,
      SUM(CASE WHEN decision = 'manual_reject' THEN 1 ELSE 0 END) as manual_rejected
    FROM sunam_gate_log
  `);
  const counts = (countRows as any)[0][0];

  const stagedRows = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM extraction_staging WHERE gate_decision = 'staged'
  `);
  const staged = (stagedRows as any)[0][0].cnt;

  const recentRows = await db.execute(sql`
    SELECT id, signal_type, dataset_id, sunam_score, threshold_used,
           decision, decided_at, actor
    FROM sunam_gate_log
    ORDER BY decided_at DESC
    LIMIT 50
  `);

  const total = Number(counts.total) || 0;
  const approved = Number(counts.approved) || 0;

  return {
    totalProcessed: total,
    totalApproved: approved,
    totalRejected: Number(counts.rejected) || 0,
    totalStaged: Number(staged) || 0,
    totalManualPromoted: Number(counts.manual_promoted) || 0,
    totalManualRejected: Number(counts.manual_rejected) || 0,
    approvalRate: total > 0 ? Math.round((approved / total) * 10000) / 100 : 0,
    recentDecisions: (recentRows as any)[0].map((r: any) => ({
      id: r.id,
      signalType: r.signal_type,
      datasetId: r.dataset_id,
      score: parseFloat(r.sunam_score),
      threshold: parseFloat(r.threshold_used),
      decision: r.decision,
      decidedAt: Number(r.decided_at),
      actor: r.actor,
    })),
  };
}

/**
 * Get staged signals for admin review.
 */
export async function getStagedSignals(opts?: {
  limit?: number;
  offset?: number;
  datasetId?: string;
}): Promise<{
  signals: Array<{
    id: number;
    signalType: string;
    datasetId: string;
    title: string;
    severity: string;
    sunamScore: number;
    sunamThreshold: number;
    scoreBreakdown: SunamScoreBreakdown;
    gateReason: string;
    stagedAt: number;
  }>;
  total: number;
}> {
  const limit = opts?.limit || 50;
  const offset = opts?.offset || 0;
  const datasetFilter = opts?.datasetId ? sql` AND dataset_id = ${opts.datasetId}` : sql``;

  const countRows = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM extraction_staging WHERE gate_decision = 'staged' ${datasetFilter}
  `);
  const total = Number((countRows as any)[0][0].cnt);

  const rows = await db.execute(sql`
    SELECT id, signal_type, dataset_id, title, severity,           sunam_score, sunam_threshold, score_breakdown,           gate_reason, staged_at
    FROM extraction_staging
    WHERE gate_decision = 'staged' ${datasetFilter}
    ORDER BY sunam_score DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  return {
    signals: (rows as any)[0].map((r: any) => ({
      id: r.id,
      signalType: r.signal_type,
      datasetId: r.dataset_id,
      title: r.title,
      severity: r.severity,
      sunamScore: parseFloat(r.sunam_score),
      sunamThreshold: parseFloat(r.sunam_threshold),
      scoreBreakdown: typeof r.score_breakdown === "string"
        ? JSON.parse(r.score_breakdown)
        : r.score_breakdown,
      gateReason: r.gate_reason,
      stagedAt: Number(r.staged_at),
    })),
    total,
  };
}

/**
 * Get current threshold configuration for Sovereign Control display.
 */
export async function getThresholdConfig(): Promise<ThresholdConfig[]> {
  return loadThresholds();
}

/**
 * Update a threshold configuration from Sovereign Control.
 */
export async function updateThreshold(
  thresholdId: number,
  updates: Partial<{
    weightConfidence: number;
    weightEvidenceStrength: number;
    weightCorroboration: number;
    weightTemporalDensity: number;
    weightGeographicScope: number;
    passThreshold: number;
    description: string;
  }>,
  actor: string
): Promise<{ success: boolean }> {
  const setClauses: string[] = [];
  if (updates.weightConfidence !== undefined) setClauses.push(`weight_confidence = ${updates.weightConfidence}`);
  if (updates.weightEvidenceStrength !== undefined) setClauses.push(`weight_evidence_strength = ${updates.weightEvidenceStrength}`);
  if (updates.weightCorroboration !== undefined) setClauses.push(`weight_corroboration = ${updates.weightCorroboration}`);
  if (updates.weightTemporalDensity !== undefined) setClauses.push(`weight_temporal_density = ${updates.weightTemporalDensity}`);
  if (updates.weightGeographicScope !== undefined) setClauses.push(`weight_geographic_scope = ${updates.weightGeographicScope}`);
  if (updates.passThreshold !== undefined) setClauses.push(`pass_threshold = ${updates.passThreshold}`);
  if (updates.description !== undefined) setClauses.push(`description = '${updates.description.replace(/'/g, "''")}'`);

  if (setClauses.length === 0) return { success: false };

  setClauses.push(`updated_by = '${actor.replace(/'/g, "''")}'`);
  setClauses.push(`updated_at = ${Date.now()}`);

  await db.execute(
    sql.raw(`UPDATE sunam_thresholds SET ${setClauses.join(", ")} WHERE id = ${thresholdId}`)
  );

  invalidateThresholdCache();
  return { success: true };
}

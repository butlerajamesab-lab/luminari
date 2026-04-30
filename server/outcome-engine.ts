/**
 * Outcome & Feedback Engine — Service Layer
 * 
 * Tracks intervention outcomes and feeds results back into:
 *   - Trend & Pressure Engine (update trend classification)
 *   - Strategy effectiveness tables (improve future strategy selection)
 *   - Strategy success rates (update historical success rates)
 * 
 * Functions:
 *   recordOutcome(params) → create outcome record
 *   updateOutcomeMetrics(outcomeId, params) → update post-intervention metrics
 *   calculateEffectivenessScore(params) → pure function, 0-100
 *   recordOutcomeMetric(params) → granular metric recording
 *   feedbackLoop(outcomeId) → full feedback cycle
 *   getOutcomeDashboard() → dashboard data
 *   getEffectivenessReport() → aggregated effectiveness
 *   getMissionControlOutcomeSummary() → summary widget
 */
import { db } from "./db";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";

// ─── O1. Record Outcome ──────────────────────────────────────────────────────

export async function recordOutcome(params: {
  pathId: string;
  strategyId: string;
  patternId: string;
  outcomeStatus: string;
  outcomeDescription?: string;
  interventionStartDate?: string;
  interventionEndDate?: string;
  lessonsLearned?: string;
}): Promise<{ outcomeId: string }> {
  const outcomeId = randomUUID();

  // Get pre-intervention metrics from the pattern and trend data
  const [patternRows] = await db.execute(sql`
    SELECT pr.signal_count, tr.pressure_index, tr.trend_classification
    FROM pattern_registry pr
    LEFT JOIN trend_registry tr ON pr.pattern_id = tr.pattern_id
    WHERE pr.pattern_id = ${params.patternId}
  `);
  const p = (patternRows as unknown as any[])[0];

  await db.execute(sql`
    INSERT INTO outcome_registry (
      outcome_id, path_id, strategy_id, pattern_id,
      outcome_status, outcome_description,
      intervention_start_date, intervention_end_date,
      signals_before, pressure_before, trend_before,
      lessons_learned
    ) VALUES (
      ${outcomeId}, ${params.pathId}, ${params.strategyId}, ${params.patternId},
      ${params.outcomeStatus}, ${params.outcomeDescription || null},
      ${params.interventionStartDate ? new Date(params.interventionStartDate) : null},
      ${params.interventionEndDate ? new Date(params.interventionEndDate) : null},
      ${p?.signal_count || 0}, ${p?.pressure_index || 0}, ${p?.trend_classification || "unknown"},
      ${params.lessonsLearned || null}
    )
  `);

  return { outcomeId };
}

// ─── O2. Update Outcome Metrics ──────────────────────────────────────────────

export async function updateOutcomeMetrics(
  outcomeId: string,
  params: {
    outcomeStatus?: string;
    signalsAfter?: number;
    pressureAfter?: number;
    trendAfter?: string;
    entitiesAffected?: number;
    geographicAreasAffected?: number;
    totalCost?: number;
    lessonsLearned?: string;
  }
): Promise<{ success: boolean; effectivenessScore?: number }> {
  // Get current outcome data
  const [currentRows] = await db.execute(sql`
    SELECT signals_before, pressure_before FROM outcome_registry WHERE outcome_id = ${outcomeId}
  `);
  const current = (currentRows as unknown as any[])[0];
  if (!current) return { success: false };

  const signalsBefore = Number(current.signals_before) || 0;
  const pressureBefore = Number(current.pressure_before) || 0;
  const signalsAfter = params.signalsAfter ?? signalsBefore;
  const pressureAfter = params.pressureAfter ?? pressureBefore;

  // Calculate reduction percentages
  const signalReductionPct = signalsBefore > 0
    ? Math.round(((signalsBefore - signalsAfter) / signalsBefore) * 10000) / 100
    : 0;
  const pressureReductionPct = pressureBefore > 0
    ? Math.round(((pressureBefore - pressureAfter) / pressureBefore) * 10000) / 100
    : 0;

  // Calculate cost per signal reduced
  const signalsReduced = Math.max(0, signalsBefore - signalsAfter);
  const costPerSignalReduced = signalsReduced > 0 && params.totalCost
    ? Math.round((params.totalCost / signalsReduced) * 100) / 100
    : 0;

  // Calculate effectiveness score
  const trendImproved = params.trendAfter === "declining" || params.trendAfter === "stable";
  const effectivenessScore = calculateEffectivenessScore({
    signalReductionPct: Math.max(0, signalReductionPct),
    pressureReductionPct: Math.max(0, pressureReductionPct),
    trendImprovement: trendImproved,
    costEfficiency: costPerSignalReduced > 0 ? Math.min(1, 1000 / costPerSignalReduced) : 0.5,
    timeEfficiency: 0.5, // default
    geographicCoverage: 0.5, // default
  });

  await db.execute(sql`
    UPDATE outcome_registry SET
      outcome_status = COALESCE(${params.outcomeStatus || null}, outcome_status),
      signals_after = ${signalsAfter},
      signal_reduction_pct = ${signalReductionPct},
      pressure_after = ${pressureAfter},
      pressure_reduction_pct = ${pressureReductionPct},
      trend_after = COALESCE(${params.trendAfter || null}, trend_after),
      entities_affected = COALESCE(${params.entitiesAffected ?? null}, entities_affected),
      geographic_areas_affected = COALESCE(${params.geographicAreasAffected ?? null}, geographic_areas_affected),
      total_cost = COALESCE(${params.totalCost ?? null}, total_cost),
      cost_per_signal_reduced = ${costPerSignalReduced},
      overall_effectiveness_score = ${effectivenessScore},
      lessons_learned = COALESCE(${params.lessonsLearned || null}, lessons_learned),
      updated_at = NOW()
    WHERE outcome_id = ${outcomeId}
  `);

  return { success: true, effectivenessScore };
}

// ─── O3. Effectiveness Score Calculation ─────────────────────────────────────

/**
 * Calculate overall effectiveness score (0-100).
 * 
 * Weights:
 *   signalReduction:  30%
 *   pressureReduction: 25%
 *   trendImprovement:  15%
 *   costEfficiency:    15%
 *   timeEfficiency:    10%
 *   geographicCoverage: 5%
 */
export function calculateEffectivenessScore(params: {
  signalReductionPct: number;   // 0-100
  pressureReductionPct: number; // 0-100
  trendImprovement: boolean;
  costEfficiency: number;       // 0-1
  timeEfficiency: number;       // 0-1
  geographicCoverage: number;   // 0-1
}): number {
  const score =
    (Math.min(100, Math.max(0, params.signalReductionPct)) * 0.30) +
    (Math.min(100, Math.max(0, params.pressureReductionPct)) * 0.25) +
    (params.trendImprovement ? 15 : 0) +
    (Math.min(1, Math.max(0, params.costEfficiency)) * 15) +
    (Math.min(1, Math.max(0, params.timeEfficiency)) * 10) +
    (Math.min(1, Math.max(0, params.geographicCoverage)) * 5);

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ─── O4. Record Granular Metric ──────────────────────────────────────────────

export async function recordOutcomeMetric(params: {
  outcomeId: string;
  metricName: string;
  metricCategory: string;
  valueBefore: number;
  valueAfter: number;
  notes?: string;
}): Promise<{ metricId: number }> {
  const changePct = params.valueBefore !== 0
    ? Math.round(((params.valueAfter - params.valueBefore) / Math.abs(params.valueBefore)) * 10000) / 100
    : 0;

  const [result] = await db.execute(sql`
    INSERT INTO outcome_metrics (
      outcome_id, metric_name, metric_category,
      value_before, value_after, change_pct,
      measurement_date, notes
    ) VALUES (
      ${params.outcomeId}, ${params.metricName}, ${params.metricCategory},
      ${params.valueBefore}, ${params.valueAfter}, ${changePct},
      NOW(), ${params.notes || null}
    )
  `);

  return { metricId: (result as any).insertId };
}

// ─── O5. Feedback Loop ───────────────────────────────────────────────────────

/**
 * Full feedback cycle: takes a completed outcome and:
 * 1. Updates strategy_effectiveness aggregates
 * 2. Updates strategy_success_rates
 * 3. Records trend_intervention_impacts
 * 4. Updates strategy_registry historical_success_rate
 */
export async function feedbackLoop(outcomeId: string): Promise<{
  effectivenessUpdated: boolean;
  successRateUpdated: boolean;
  trendImpactRecorded: boolean;
  registryUpdated: boolean;
}> {
  // Get outcome data
  const [outcomeRows] = await db.execute(sql`
    SELECT o.*, pr.pattern_type
    FROM outcome_registry o
    LEFT JOIN pattern_registry pr ON o.pattern_id = pr.pattern_id
    WHERE o.outcome_id = ${outcomeId}
  `);
  const outcome = (outcomeRows as unknown as any[])[0];
  if (!outcome) return { effectivenessUpdated: false, successRateUpdated: false, trendImpactRecorded: false, registryUpdated: false };

  // 1. Update strategy_effectiveness
  let effectivenessUpdated = false;
  try {
    const [existing] = await db.execute(sql`
      SELECT effectiveness_id FROM strategy_effectiveness
      WHERE strategy_id = ${outcome.strategy_id} AND pattern_type = ${outcome.pattern_type || "unknown"}
      LIMIT 1
    `);

    if ((existing as unknown as any[]).length > 0) {
      await db.execute(sql`
        UPDATE strategy_effectiveness SET
          total_deployments = total_deployments + 1,
          successful_deployments = successful_deployments + ${outcome.outcome_status === "successful" ? 1 : 0},
          avg_signal_reduction_pct = (avg_signal_reduction_pct * (total_deployments - 1) + ${Number(outcome.signal_reduction_pct) || 0}) / total_deployments,
          avg_pressure_reduction_pct = (avg_pressure_reduction_pct * (total_deployments - 1) + ${Number(outcome.pressure_reduction_pct) || 0}) / total_deployments,
          avg_effectiveness_score = (avg_effectiveness_score * (total_deployments - 1) + ${outcome.overall_effectiveness_score || 0}) / total_deployments,
          avg_cost = (avg_cost * (total_deployments - 1) + ${Number(outcome.total_cost) || 0}) / total_deployments,
          last_calculated = NOW()
        WHERE strategy_id = ${outcome.strategy_id} AND pattern_type = ${outcome.pattern_type || "unknown"}
      `);
    } else {
      await db.execute(sql`
        INSERT INTO strategy_effectiveness (
          strategy_id, pattern_type, jurisdiction,
          total_deployments, successful_deployments,
          avg_signal_reduction_pct, avg_pressure_reduction_pct,
          avg_effectiveness_score, avg_cost, last_calculated
        ) VALUES (
          ${outcome.strategy_id}, ${outcome.pattern_type || "unknown"}, 'general',
          1, ${outcome.outcome_status === "successful" ? 1 : 0},
          ${Number(outcome.signal_reduction_pct) || 0}, ${Number(outcome.pressure_reduction_pct) || 0},
          ${outcome.overall_effectiveness_score || 0}, ${Number(outcome.total_cost) || 0}, NOW()
        )
      `);
    }
    effectivenessUpdated = true;
  } catch (e) {
    console.error("[FeedbackLoop] effectiveness update error:", e);
  }

  // 2. Update strategy_success_rates
  let successRateUpdated = false;
  try {
    const [existingRate] = await db.execute(sql`
      SELECT rate_id FROM strategy_success_rates
      WHERE strategy_id = ${outcome.strategy_id} AND pattern_type = ${outcome.pattern_type || "unknown"}
      LIMIT 1
    `);

    if ((existingRate as unknown as any[]).length > 0) {
      const statusCol = outcome.outcome_status === "successful" ? "successful_outcomes"
        : outcome.outcome_status === "partial" ? "partial_outcomes" : "failed_outcomes";
      await db.execute(sql`
        UPDATE strategy_success_rates SET
          total_attempts = total_attempts + 1,
          ${sql.raw(statusCol)} = ${sql.raw(statusCol)} + 1,
          last_updated = NOW()
        WHERE strategy_id = ${outcome.strategy_id} AND pattern_type = ${outcome.pattern_type || "unknown"}
      `);
    } else {
      await db.execute(sql`
        INSERT INTO strategy_success_rates (
          strategy_id, pattern_type, total_attempts,
          successful_outcomes, partial_outcomes, failed_outcomes, last_updated
        ) VALUES (
          ${outcome.strategy_id}, ${outcome.pattern_type || "unknown"}, 1,
          ${outcome.outcome_status === "successful" ? 1 : 0},
          ${outcome.outcome_status === "partial" ? 1 : 0},
          ${outcome.outcome_status === "failed" ? 1 : 0},
          NOW()
        )
      `);
    }
    successRateUpdated = true;
  } catch (e) {
    console.error("[FeedbackLoop] success rate update error:", e);
  }

  // 3. Record trend_intervention_impacts
  let trendImpactRecorded = false;
  try {
    const impactId = randomUUID();
    await db.execute(sql`
      INSERT INTO trend_intervention_impacts (
        impact_id, pattern_id, intervention_id, intervention_date,
        pre_trend_classification, pre_pressure_index,
        post_trend_classification, post_pressure_index,
        pressure_reduction, confidence_of_impact
      ) VALUES (
        ${impactId}, ${outcome.pattern_id}, ${outcomeId}, CURDATE(),
        ${outcome.trend_before || "unknown"}, ${Number(outcome.pressure_before) || 0},
        ${outcome.trend_after || outcome.trend_before || "unknown"}, ${Number(outcome.pressure_after) || Number(outcome.pressure_before) || 0},
        ${(Number(outcome.pressure_before) || 0) - (Number(outcome.pressure_after) || 0)},
        ${Number(outcome.overall_effectiveness_score) || 0}
      )
    `);
    trendImpactRecorded = true;
  } catch (e) {
    console.error("[FeedbackLoop] trend impact error:", e);
  }

  // 4. Update strategy_registry historical_success_rate
  let registryUpdated = false;
  try {
    const [rateRows] = await db.execute(sql`
      SELECT SUM(total_attempts) as total, SUM(successful_outcomes) as successes
      FROM strategy_success_rates WHERE strategy_id = ${outcome.strategy_id}
    `);
    const r = (rateRows as unknown as any[])[0];
    if (r && Number(r.total) > 0) {
      const newRate = Math.round((Number(r.successes) / Number(r.total)) * 10000) / 100;
      await db.execute(sql`
        UPDATE strategy_registry SET
          historical_success_rate = ${newRate},
          last_updated_from_outcomes = CURDATE(),
          updated_at = NOW()
        WHERE strategy_id = ${outcome.strategy_id}
      `);
      registryUpdated = true;
    }
  } catch (e) {
    console.error("[FeedbackLoop] registry update error:", e);
  }

  return { effectivenessUpdated, successRateUpdated, trendImpactRecorded, registryUpdated };
}

// ─── O6. Dashboard Queries ───────────────────────────────────────────────────

export async function getOutcomeDashboard(): Promise<{
  outcomes: any[];
  summary: {
    total: number;
    successful: number;
    partial: number;
    failed: number;
    inProgress: number;
    avgEffectiveness: number;
    avgSignalReduction: number;
    avgPressureReduction: number;
    totalCost: number;
  };
}> {
  const [outcomeRows] = await db.execute(sql`
    SELECT o.outcome_id, o.path_id, o.strategy_id, o.pattern_id,
           o.outcome_status, o.outcome_description,
           o.signals_before, o.signals_after, o.signal_reduction_pct,
           o.pressure_before, o.pressure_after, o.pressure_reduction_pct,
           o.trend_before, o.trend_after,
           o.entities_affected, o.geographic_areas_affected,
           o.total_cost, o.cost_per_signal_reduced,
           o.overall_effectiveness_score, o.lessons_learned,
           o.created_at,
           sr.strategy_name, sr.strategy_type,
           pr.pattern_name, pr.pattern_type
    FROM outcome_registry o
    LEFT JOIN strategy_registry sr ON o.strategy_id = sr.strategy_id
    LEFT JOIN pattern_registry pr ON o.pattern_id = pr.pattern_id
    ORDER BY o.created_at DESC
    LIMIT 50
  `);

  const [summaryRows] = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN outcome_status = 'successful' THEN 1 ELSE 0 END) as successful,
      SUM(CASE WHEN outcome_status = 'partial' THEN 1 ELSE 0 END) as partial,
      SUM(CASE WHEN outcome_status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN outcome_status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
      AVG(overall_effectiveness_score) as avg_effectiveness,
      AVG(signal_reduction_pct) as avg_signal_reduction,
      AVG(pressure_reduction_pct) as avg_pressure_reduction,
      SUM(total_cost) as total_cost
    FROM outcome_registry
  `);
  const s = (summaryRows as unknown as any[])[0] || {};

  return {
    outcomes: outcomeRows as unknown as any[],
    summary: {
      total: Number(s.total) || 0,
      successful: Number(s.successful) || 0,
      partial: Number(s.partial) || 0,
      failed: Number(s.failed) || 0,
      inProgress: Number(s.in_progress) || 0,
      avgEffectiveness: Math.round(Number(s.avg_effectiveness) || 0),
      avgSignalReduction: Math.round((Number(s.avg_signal_reduction) || 0) * 100) / 100,
      avgPressureReduction: Math.round((Number(s.avg_pressure_reduction) || 0) * 100) / 100,
      totalCost: Number(s.total_cost) || 0,
    },
  };
}

export async function getEffectivenessReport(): Promise<any[]> {
  const [rows] = await db.execute(sql`
    SELECT se.effectiveness_id, se.strategy_id, se.pattern_type, se.jurisdiction,
           se.total_deployments, se.successful_deployments,
           se.avg_signal_reduction_pct, se.avg_pressure_reduction_pct,
           se.avg_effectiveness_score, se.avg_cost, se.avg_duration_days,
           se.last_calculated,
           sr.strategy_name, sr.strategy_type
    FROM strategy_effectiveness se
    LEFT JOIN strategy_registry sr ON se.strategy_id = sr.strategy_id
    ORDER BY se.avg_effectiveness_score DESC
  `);
  return rows as unknown as any[];
}

export async function getMissionControlOutcomeSummary(): Promise<{
  totalOutcomes: number;
  avgEffectiveness: number;
  totalSignalsReduced: number;
  totalCostInvested: number;
  topStrategy: { name: string; score: number } | null;
  recentOutcomes: Array<{ patternName: string; status: string; score: number }>;
}> {
  const [summaryRows] = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      AVG(overall_effectiveness_score) as avg_effectiveness,
      SUM(GREATEST(0, COALESCE(signals_before, 0) - COALESCE(signals_after, 0))) as total_signals_reduced,
      SUM(COALESCE(total_cost, 0)) as total_cost
    FROM outcome_registry
  `);
  const s = (summaryRows as unknown as any[])[0] || {};

  const [topRows] = await db.execute(sql`
    SELECT sr.strategy_name, se.avg_effectiveness_score
    FROM strategy_effectiveness se
    JOIN strategy_registry sr ON se.strategy_id = sr.strategy_id
    ORDER BY se.avg_effectiveness_score DESC
    LIMIT 1
  `);
  const topStrategy = (topRows as unknown as any[])[0]
    ? { name: (topRows as unknown as any[])[0].strategy_name, score: (topRows as unknown as any[])[0].avg_effectiveness_score }
    : null;

  const [recentRows] = await db.execute(sql`
    SELECT pr.pattern_name, o.outcome_status, o.overall_effectiveness_score
    FROM outcome_registry o
    LEFT JOIN pattern_registry pr ON o.pattern_id = pr.pattern_id
    ORDER BY o.created_at DESC
    LIMIT 5
  `);

  return {
    totalOutcomes: Number(s.total) || 0,
    avgEffectiveness: Math.round(Number(s.avg_effectiveness) || 0),
    totalSignalsReduced: Number(s.total_signals_reduced) || 0,
    totalCostInvested: Number(s.total_cost) || 0,
    topStrategy,
    recentOutcomes: (recentRows as unknown as any[]).map((r: any) => ({
      patternName: r.pattern_name || "Unknown",
      status: r.outcome_status,
      score: r.overall_effectiveness_score || 0,
    })),
  };
}

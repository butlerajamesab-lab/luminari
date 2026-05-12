/**
 * Strategy Learning Loop — Orchestrates the full feedback cycle
 *
 * This module connects:
 *   Outcome Engine → Strategy Effectiveness → Trend Classification → Strategy Selection
 *
 * When a strategy path completes execution:
 *   1. Record the outcome (outcome-engine)
 *   2. Run the feedback loop (outcome-engine.feedbackLoop)
 *   3. Update trend classification based on intervention impacts
 *   4. Recalculate strategy selection weights for affected pattern types
 *   5. Optionally trigger new strategy evaluation for patterns still active
 */
import { db } from "./db";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { recordOutcome, updateOutcomeMetrics, feedbackLoop } from "./outcome-engine";
import { evaluatePatternsForStrategies } from "./systemic-strategy-engine";

// ─── L1. Complete Strategy Path and Record Outcome ──────────────────────────

export async function completeStrategyPathWithOutcome(params: {
  pathId: string;
  outcomeStatus: "successful" | "partial" | "failed";
  outcomeDescription?: string;
  signalsAfter?: number;
  pressureAfter?: number;
  trendAfter?: string;
  entitiesAffected?: number;
  geographicAreasAffected?: number;
  totalCost?: number;
  lessonsLearned?: string;
}): Promise<{
  outcomeId: string;
  feedbackResult: any;
  trendUpdated: boolean;
  reEvaluationTriggered: boolean;
}> {
  // Get path details
  const pathResult = await db.execute(sql`
    SELECT sp.*, sr.strategy_name, sr.strategy_type
    FROM sys_strategy_paths sp
    LEFT JOIN strategy_registry sr ON sp.strategy_id = sr.strategy_id
    WHERE sp.path_id = ${params.pathId}
  `);
  const pathRows = Array.isArray(pathResult) ? pathResult : (pathResult as any).rows ?? [];
  const path = pathRows[0];
  if (!path) throw new Error(`Strategy path ${params.pathId} not found`);

  // Mark path as completed
  await db.execute(sql`
    UPDATE sys_strategy_paths SET
      status = 'completed',
      completed_at = NOW(),
      updated_at = NOW()
    WHERE path_id = ${params.pathId}
  `);

  // Record outcome
  const outcome = await recordOutcome({
    pathId: params.pathId,
    strategyId: path.strategy_id,
    patternId: path.pattern_id || "",
    outcomeStatus: params.outcomeStatus,
    outcomeDescription: params.outcomeDescription,
    interventionStartDate: path.created_at?.toISOString?.() || new Date().toISOString(),
    interventionEndDate: new Date().toISOString(),
    lessonsLearned: params.lessonsLearned,
  });

  // Update outcome metrics if provided
  if (params.signalsAfter !== undefined || params.pressureAfter !== undefined) {
    await updateOutcomeMetrics(outcome.outcomeId, {
      outcomeStatus: params.outcomeStatus,
      signalsAfter: params.signalsAfter,
      pressureAfter: params.pressureAfter,
      trendAfter: params.trendAfter,
      entitiesAffected: params.entitiesAffected,
      geographicAreasAffected: params.geographicAreasAffected,
      totalCost: params.totalCost,
      lessonsLearned: params.lessonsLearned,
    });
  }

  // Run feedback loop
  const feedbackResult = await feedbackLoop(outcome.outcomeId);

  // Update trend classification based on impact
  let trendUpdated = false;
  if (path.pattern_id && params.trendAfter) {
    try {
      await db.execute(sql`
        UPDATE trend_registry SET
          trend_classification = ${params.trendAfter},
          updated_at = NOW()
        WHERE pattern_id = ${path.pattern_id}
      `);
      trendUpdated = true;
    } catch (e) {
      console.error("[LearningLoop] trend update error:", e);
    }
  }

  // Re-evaluate patterns if the outcome was not fully successful
  let reEvaluationTriggered = false;
  if (params.outcomeStatus !== "successful" && path.pattern_id) {
    try {
      // Check if pattern is still active
      const patternResult = await db.execute(sql`
        SELECT pattern_id, decay_status FROM pattern_registry
        WHERE pattern_id = ${path.pattern_id}
      `);
      const patternRows = Array.isArray(patternResult) ? patternResult : (patternResult as any).rows ?? [];
      const pattern = patternRows[0];
      if (pattern && pattern.decay_status === "active") {
        await evaluatePatternsForStrategies();
        reEvaluationTriggered = true;
      }
    } catch (e) {
      console.error("[LearningLoop] re-evaluation error:", e);
    }
  }

  return {
    outcomeId: outcome.outcomeId,
    feedbackResult,
    trendUpdated,
    reEvaluationTriggered,
  };
}

// ─── L2. Batch Feedback Processing ──────────────────────────────────────────

export async function processPendingFeedback(): Promise<{
  processed: number;
  errors: number;
}> {
  // Find outcomes that haven't had feedback processed
  const pendingResult = await db.execute(sql`
    SELECT o.outcome_id
    FROM outcome_registry o
    LEFT JOIN strategy_effectiveness se ON o.strategy_id = se.strategy_id
    WHERE o.outcome_status IN ('successful', 'partial', 'failed')
    AND o.feedback_processed IS NULL
    ORDER BY o.created_at ASC
    LIMIT 50
  `);

  const pending = Array.isArray(pendingResult) ? pendingResult : (pendingResult as any).rows ?? [];
  let processed = 0;
  let errors = 0;

  for (const row of pending) {
    try {
      await feedbackLoop(row.outcome_id);
      await db.execute(sql`
        UPDATE outcome_registry SET feedback_processed = NOW()
        WHERE outcome_id = ${row.outcome_id}
      `);
      processed++;
    } catch (e) {
      console.error(`[LearningLoop] feedback error for ${row.outcome_id}:`, e);
      errors++;
    }
  }

  return { processed, errors };
}

// ─── L3. Strategy Effectiveness Recalculation ───────────────────────────────

export async function recalculateStrategyWeights(): Promise<{
  strategiesUpdated: number;
}> {
  // Recalculate historical_success_rate for all strategies with outcomes
  const strategyResult = await db.execute(sql`
    SELECT DISTINCT strategy_id FROM strategy_success_rates
  `);
  const strategyRows = Array.isArray(strategyResult) ? strategyResult : (strategyResult as any).rows ?? [];

  let strategiesUpdated = 0;

  for (const row of strategyRows as any[]) {
    try {
      const rateResult = await db.execute(sql`
        SELECT SUM(total_attempts) as total, SUM(successful_outcomes) as successes
        FROM strategy_success_rates WHERE strategy_id = ${row.strategy_id}
      `);
      const rateRows = Array.isArray(rateResult) ? rateResult : (rateResult as any).rows ?? [];
      const r = rateRows[0];
      if (r && Number(r.total) > 0) {
        const newRate = Math.round((Number(r.successes) / Number(r.total)) * 10000) / 100;
        await db.execute(sql`
          UPDATE strategy_registry SET
            historical_success_rate = ${newRate},
            last_updated_from_outcomes = CURRENT_DATE,
            updated_at = NOW()
          WHERE strategy_id = ${row.strategy_id}
        `);
        strategiesUpdated++;
      }
    } catch (e) {
      console.error(`[LearningLoop] weight recalc error for ${row.strategy_id}:`, e);
    }
  }

  return { strategiesUpdated };
}

// ─── L4. Full Learning Cycle ────────────────────────────────────────────────

export async function runFullLearningCycle(): Promise<{
  feedbackProcessed: number;
  feedbackErrors: number;
  strategiesRecalculated: number;
  patternsReEvaluated: boolean;
}> {
  // Step 1: Process pending feedback
  const feedback = await processPendingFeedback();

  // Step 2: Recalculate strategy weights
  const weights = await recalculateStrategyWeights();

  // Step 3: Re-evaluate active patterns for new strategies
  let patternsReEvaluated = false;
  try {
    const result = await evaluatePatternsForStrategies();
    patternsReEvaluated = (result?.evaluated ?? 0) > 0;
  } catch (e) {
    console.error("[LearningLoop] pattern re-evaluation error:", e);
  }

  return {
    feedbackProcessed: feedback.processed,
    feedbackErrors: feedback.errors,
    strategiesRecalculated: weights.strategiesUpdated,
    patternsReEvaluated,
  };
}

// ─── L5. Learning Loop Status ───────────────────────────────────────────────

export async function getLearningLoopStatus(): Promise<{
  pendingFeedback: number;
  totalOutcomes: number;
  processedOutcomes: number;
  strategiesWithData: number;
  lastCycleRun: string | null;
  effectivenessRecords: number;
  trendImpactRecords: number;
}> {
  const pendingRes = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM outcome_registry WHERE feedback_processed IS NULL AND outcome_status IS NOT NULL
  `);
  const totalRes = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM outcome_registry
  `);
  const processedRes = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM outcome_registry WHERE feedback_processed IS NOT NULL
  `);
  const stratRes = await db.execute(sql`
    SELECT COUNT(DISTINCT strategy_id) as cnt FROM strategy_success_rates
  `);
  const effRes = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM strategy_effectiveness
  `);
  const impactRes = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM trend_intervention_impacts
  `);

  const safeFirst = (r: any) => {
    const rows = Array.isArray(r) ? r : (r as any).rows ?? [];
    return rows[0];
  };

  return {
    pendingFeedback: Number(safeFirst(pendingRes)?.cnt) || 0,
    totalOutcomes: Number(safeFirst(totalRes)?.cnt) || 0,
    processedOutcomes: Number(safeFirst(processedRes)?.cnt) || 0,
    strategiesWithData: Number(safeFirst(stratRes)?.cnt) || 0,
    lastCycleRun: null, // Would need a separate tracking table
    effectivenessRecords: Number(safeFirst(effRes)?.cnt) || 0,
    trendImpactRecords: Number(safeFirst(impactRes)?.cnt) || 0,
  };
}

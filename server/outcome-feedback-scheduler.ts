/**
 * Outcome Feedback Scheduler
 *
 * Periodic background job that runs the strategy learning cycle.
 *
 * OFS1. Runs on configurable interval (default: every 6 hours)
 * OFS2. Processes pending outcome feedback → updates trend classifications
 * OFS3. Recalculates strategy effectiveness scores
 * OFS4. Updates intervention success metrics
 * OFS5. Correlates outcome data with policy impact
 * OFS6. Logs each cycle run for audit
 *
 * Uses existing learning loop service — no architecture redesign.
 */
import {
  runFullLearningCycle,
  processPendingFeedback,
  recalculateStrategyWeights,
  getLearningLoopStatus,
} from "./strategy-learning-loop";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { bulkUpdatePercentageChange } from "./signal-governance";

function getExecuteRows(result: unknown): any[] {
  if (Array.isArray(result)) {
    return Array.isArray(result[0]) ? result[0] : result;
  }
  const maybeRows = (result as { rows?: unknown })?.rows;
  return Array.isArray(maybeRows) ? maybeRows : [];
}

function getAffectedRows(result: unknown): number {
  const candidate = Array.isArray(result) ? result[0] : result;
  return Number(
    (candidate as { affectedRows?: unknown; rowCount?: unknown; changes?: unknown })?.affectedRows ??
    (candidate as { rowCount?: unknown })?.rowCount ??
    (candidate as { changes?: unknown })?.changes ??
    0
  ) || 0;
}

// ─── OFS1. Configuration ─────────────────────────────────────────────────────

/** Default interval: 6 hours in milliseconds */
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Minimum interval: 5 minutes (prevent tight loops) */
const MIN_INTERVAL_MS = 5 * 60 * 1000;

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let lastRunAt: Date | null = null;
let lastRunResult: any = null;
let runCount = 0;
let errorCount = 0;

// ─── OFS2. Run One Cycle ─────────────────────────────────────────────────────

export async function runScheduledFeedbackCycle(): Promise<{
  success: boolean;
  feedbackProcessed: number;
  strategiesUpdated: number;
  cycleResult: any;
  durationMs: number;
  error?: string;
}> {
  if (isRunning) {
    console.log("[OutcomeFeedbackScheduler] Skipping — previous cycle still running");
    return {
      success: false,
      feedbackProcessed: 0,
      strategiesUpdated: 0,
      cycleResult: null,
      durationMs: 0,
      error: "Previous cycle still running",
    };
  }

  isRunning = true;
  const startTime = Date.now();
  console.log("[OutcomeFeedbackScheduler] Starting feedback cycle...");

  try {
    // Step 1: Run the full learning cycle (feedback + recalculation)
    const cycleResult = await runFullLearningCycle();

    // Step 2: Update intervention success metrics from outcome data
    const interventionMetrics = await updateInterventionSuccessMetrics();

    // Step 3: Correlate outcomes with policy impact
    const policyCorrelations = await correlateOutcomesWithPolicy();

    const durationMs = Date.now() - startTime;
    runCount++;
    lastRunAt = new Date();
    lastRunResult = {
      cycleResult,
      interventionMetrics,
      policyCorrelations,
      durationMs,
    };

    console.log(
      `[OutcomeFeedbackScheduler] Cycle complete: ${cycleResult.feedbackProcessed} feedback processed, ` +
      `${cycleResult.strategiesRecalculated} strategies updated, ` +
      `${interventionMetrics.updated} intervention metrics updated (${durationMs}ms)`
    );

    // Step 4: Update trend classifications and pressure metrics
    const trendUpdates = await updateTrendClassifications();

    // Step 5: Update signal change percentages
    const signalUpdates = await updateSignalChangePercentages();

    // Step 6: Log to feedback_scheduler_log
    await logFeedbackRun({
      patternsProcessed: cycleResult.feedbackProcessed,
      strategiesUpdated: cycleResult.strategiesRecalculated,
      signalsChanged: signalUpdates.changed,
      trendsUpdated: trendUpdates.updated,
      pressureUpdates: trendUpdates.pressureUpdated,
      policyCorrelations: policyCorrelations.correlationsFound,
      durationMs,
      status: 'completed',
    });

    return {
      success: true,
      feedbackProcessed: cycleResult.feedbackProcessed,
      strategiesUpdated: cycleResult.strategiesRecalculated,
      // @ts-ignore pre-existing type mismatch
      trendsUpdated: trendUpdates.updated,
      signalsChanged: signalUpdates.changed,
      cycleResult: lastRunResult,
      durationMs,
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    errorCount++;
    console.error("[OutcomeFeedbackScheduler] Cycle error:", err);
    // Log failed run
    await logFeedbackRun({
      patternsProcessed: 0, strategiesUpdated: 0, signalsChanged: 0,
      trendsUpdated: 0, pressureUpdates: 0, policyCorrelations: 0,
      durationMs, status: 'failed', errorMessage: err.message,
    });

    return {
      success: false,
      feedbackProcessed: 0,
      strategiesUpdated: 0,
      // @ts-ignore pre-existing type mismatch
      trendsUpdated: 0,
      signalsChanged: 0,
      cycleResult: null,
      durationMs,
      error: err.message || "Unknown error",
    };
  } finally {
    isRunning = false;
  }
}

// ─── OFS4. Update Intervention Success Metrics ───────────────────────────────

async function updateInterventionSuccessMetrics(): Promise<{
  updated: number;
}> {
  try {
    // Update strategy_effectiveness from completed outcomes
    const result = await db.execute(sql`
      UPDATE strategy_effectiveness se
      SET
        total_deployments = (
          SELECT COUNT(*) FROM outcome_registry o
          WHERE o.strategy_id = se.strategy_id
        ),
        successful_deployments = (
          SELECT COUNT(*) FROM outcome_registry o
          WHERE o.strategy_id = se.strategy_id AND o.outcome_status = 'successful'
        ),
        avg_signal_reduction_pct = COALESCE((
          SELECT AVG(o.signal_reduction_pct) FROM outcome_registry o
          WHERE o.strategy_id = se.strategy_id AND o.outcome_status IN ('successful','partial')
        ), se.avg_signal_reduction_pct),
        avg_pressure_reduction_pct = COALESCE((
          SELECT AVG(o.pressure_reduction_pct) FROM outcome_registry o
          WHERE o.strategy_id = se.strategy_id AND o.outcome_status IN ('successful','partial')
        ), se.avg_pressure_reduction_pct),
        avg_effectiveness_score = CASE
          WHEN (SELECT COUNT(*) FROM outcome_registry o WHERE o.strategy_id = se.strategy_id) > 0
          THEN (SELECT COUNT(*) FROM outcome_registry o WHERE o.strategy_id = se.strategy_id AND o.outcome_status = 'successful') * 100
               / (SELECT COUNT(*) FROM outcome_registry o WHERE o.strategy_id = se.strategy_id)
          ELSE se.avg_effectiveness_score
        END,
        last_calculated = NOW()
      WHERE EXISTS (
        SELECT 1 FROM outcome_registry o WHERE o.strategy_id = se.strategy_id
      )
    `);
    return { updated: getAffectedRows(result) };
  } catch (e) {
    console.warn("[OutcomeFeedbackScheduler] Intervention metrics update partial:", e);
    return { updated: 0 };
  }
}

// ─── OFS5. Correlate Outcomes with Policy Impact ─────────────────────────────

async function correlateOutcomesWithPolicy(): Promise<{
  correlationsFound: number;
}> {
  try {
    // Find outcomes that occurred after policy events and update impact scores
    const rows = getExecuteRows(await db.execute(sql`
      SELECT ppi.policy_id, ppi.pattern_id,
             COUNT(o.outcome_id) as outcome_count,
             AVG(CASE WHEN o.outcome_status = 'successful' THEN 1 ELSE 0 END) as success_rate
      FROM policy_pattern_impacts ppi
      JOIN outcome_registry o ON o.pattern_id = ppi.pattern_id
      JOIN policy_events pe ON pe.policy_id = ppi.policy_id
      WHERE o.created_at > pe.effective_date
      GROUP BY ppi.policy_id, ppi.pattern_id
    `));

    let updated = 0;
    for (const row of rows) {
      if (Number(row.outcome_count) > 0) {
        await db.execute(sql`
          UPDATE policy_pattern_impacts
          SET confidence_score = LEAST(
                confidence_score + ${Number(row.outcome_count) * 0.5},
                100
              ),
              updated_at = NOW()
          WHERE policy_id = ${row.policy_id} AND pattern_id = ${row.pattern_id}
        `);
        updated++;
      }
    }

    return { correlationsFound: updated };
  } catch (e) {
    console.warn("[OutcomeFeedbackScheduler] Policy correlation partial:", e);
    return { correlationsFound: 0 };
  }
}

// ─── OFS6. Start / Stop / Status ─────────────────────────────────────────────

export function startOutcomeFeedbackScheduler(intervalMs: number = DEFAULT_INTERVAL_MS): void {
  if (schedulerTimer) {
    console.log("[OutcomeFeedbackScheduler] Already running, restarting with new interval");
    stopOutcomeFeedbackScheduler();
  }

  const safeInterval = Math.max(intervalMs, MIN_INTERVAL_MS);
  console.log(`[OutcomeFeedbackScheduler] Starting (interval: ${safeInterval / 1000}s)`);

  // Run immediately on start
  runScheduledFeedbackCycle().catch(err =>
    console.error("[OutcomeFeedbackScheduler] Initial run error:", err)
  );

  schedulerTimer = setInterval(() => {
    runScheduledFeedbackCycle().catch(err =>
      console.error("[OutcomeFeedbackScheduler] Scheduled run error:", err)
    );
  }, safeInterval);
}

export function stopOutcomeFeedbackScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log("[OutcomeFeedbackScheduler] Stopped");
  }
}

export function getOutcomeFeedbackSchedulerStatus(): {
  running: boolean;
  lastRunAt: Date | null;
  lastRunResult: any;
  runCount: number;
  errorCount: number;
  isCurrentlyRunning: boolean;
} {
  return {
    running: schedulerTimer !== null,
    lastRunAt,
    lastRunResult,
    runCount,
    errorCount,
    isCurrentlyRunning: isRunning,
  };
}


// ─── OFS7. Update Trend Classifications ─────────────────────────────────────
async function updateTrendClassifications(): Promise<{
  updated: number;
  pressureUpdated: number;
}> {
  try {
    // Recalculate trend classifications based on recent outcome data
    const result = await db.execute(sql`
      UPDATE trend_registry tr
      SET
        trend_classification = CASE
          WHEN tr.growth_rate_7d > 20 AND tr.momentum_score > 70 THEN 'accelerating'
          WHEN tr.growth_rate_7d > 5 THEN 'growing'
          WHEN tr.growth_rate_7d < -5 THEN 'declining'
          WHEN tr.growth_rate_7d BETWEEN -5 AND 5 THEN 'stable'
          ELSE tr.trend_classification
        END,
        momentum_direction = CASE
          WHEN tr.growth_rate_7d > 10 THEN 'up'
          WHEN tr.growth_rate_7d < -10 THEN 'down'
          ELSE 'stable'
        END,
        last_calculated = NOW(),
        updated_at = NOW()
      WHERE tr.is_current = 1
    `);
    const updated = getAffectedRows(result);

    // Update pressure index based on signal density and geographic spread
    const pressureResult = await db.execute(sql`
      UPDATE trend_registry tr
      SET pressure_index = LEAST(
        GREATEST(
          ROUND(
            (tr.current_signal_count * 2) +
            (tr.current_geographic_spread * 5) +
            (CAST(tr.current_confidence_score AS SIGNED) * 0.5) +
            (CASE WHEN tr.growth_rate_7d > 0 THEN tr.growth_rate_7d ELSE 0 END)
          , 0),
          0
        ),
        100
      ),
      updated_at = NOW()
      WHERE tr.is_current = 1
    `);
    const pressureUpdated = getAffectedRows(pressureResult);

    return { updated, pressureUpdated };
  } catch (e) {
    console.warn("[OutcomeFeedbackScheduler] Trend update partial:", e);
    return { updated: 0, pressureUpdated: 0 };
  }
}

// ─── OFS8. Update Signal Change Percentages ─────────────────────────────────
async function updateSignalChangePercentages(): Promise<{
  changed: number;
}> {
  try {
    // GATE ENFORCEMENT: use the single authorized bulk update path
    const changed = await bulkUpdatePercentageChange();
    return { changed };
  } catch (e) {
    console.warn("[OutcomeFeedbackScheduler] Signal update partial:", e);
    return { changed: 0 };
  }
}

// ─── OFS9. Log Feedback Run ─────────────────────────────────────────────────
async function logFeedbackRun(params: {
  patternsProcessed: number;
  strategiesUpdated: number;
  signalsChanged: number;
  trendsUpdated: number;
  pressureUpdates: number;
  policyCorrelations: number;
  durationMs: number;
  status: string;
  errorMessage?: string;
}): Promise<void> {
  try {
    const nowMs = Date.now();
    await db.execute(sql`
      INSERT INTO feedback_scheduler_log
        (run_timestamp, patterns_processed, strategies_updated, signals_changed,
         trends_updated, pressure_updates, policy_correlations, duration_ms, status, error_message, created_at)
      VALUES (${nowMs}, ${params.patternsProcessed}, ${params.strategiesUpdated},
        ${params.signalsChanged}, ${params.trendsUpdated}, ${params.pressureUpdates},
        ${params.policyCorrelations}, ${params.durationMs}, ${params.status},
        ${params.errorMessage || null}, ${nowMs})
    `);
  } catch (e) {
    console.warn("[OutcomeFeedbackScheduler] Log write failed:", e);
  }
}

// ─── OFS10. Get Feedback History ────────────────────────────────────────────
export async function getFeedbackHistory(limit: number = 20): Promise<any[]> {
  try {
    return getExecuteRows(await db.execute(sql`
      SELECT * FROM feedback_scheduler_log ORDER BY run_timestamp DESC LIMIT ${limit}
    `));
  } catch (e) {
    console.warn("[OutcomeFeedbackScheduler] History read failed:", e);
    return [];
  }
}

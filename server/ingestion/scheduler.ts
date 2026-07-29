/**
 * Ingestion Scheduler — Session 80 Hardened
 *
 * T1. Initialize node-cron jobs for each enabled dataset in the registry.
 * T2. Prevent duplicate concurrent runs for the same dataset.
 * T3. Orchestrate: fetch → normalize → upsert → detect signals → log run.
 * T4. Provide manual trigger capability.
 * T5. Refresh schedule when datasets are added/updated.
 * T6. Orphan run recovery on startup.
 * T7. Self-healing: consecutive failure tracking, exponential backoff, auto-disable.
 * T8. Complete signal loop: auto post-processing, signal count writeback.
 */

import { db } from "../db";
import { dataStreamRegistry, ingestRuns } from "../../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { ingestDataset, classifyError, type IngestionResult } from "./socrata-adapter";
import { ingestCfpbDataset } from "./cfpb-adapter";
import { ingest_atlas_stream } from "./atlas-stream-adapter";
import { detectSignals } from "./signal-detector";
import { emitSignal, resolveSignalsForTarget } from "../live-signal-emitter";

// ─── Constants ───

const AUTO_DISABLE_THRESHOLD = 5; // consecutive failures before auto-disable
const BASE_RETRY_DELAY_MS = 60_000; // 1 minute base delay
const MAX_RETRY_DELAY_MS = 3_600_000; // 1 hour max delay

// ─── State ───

const activeJobs = new Map<string, ReturnType<typeof setInterval> | NodeJS.Timeout>();
const cronExpressions = new Map<string, string>();
const runningIngestions = new Set<string>();
const ingestionQueue = new Map<string, { maxRecords?: number }[]>();

// ─── T1. Initialize Scheduler ───

export async function initializeScheduler(): Promise<void> {
  console.log("[Scheduler] Initializing ingestion scheduler...");

  // T6. Orphan run recovery
  await cleanupOrphanedRuns();

  const datasets = await db
    .select()
    .from(dataStreamRegistry)
    .where(eq(dataStreamRegistry.enabled, true));

  for (const dataset of datasets) {
    // Skip auto-disabled streams
    if (dataset.autoDisabled) {
      console.log(`[Scheduler] Skipping auto-disabled stream ${dataset.streamId}: ${dataset.disabledReason}`);
      continue;
    }

    // Check retry-after window
    if (dataset.retryAfterAt && Date.now() < Number(dataset.retryAfterAt)) {
      console.log(`[Scheduler] Stream ${dataset.streamId} in backoff until ${new Date(Number(dataset.retryAfterAt)).toISOString()}`);
      // Schedule a delayed start
      const delay = Number(dataset.retryAfterAt) - Date.now();
      setTimeout(() => {
        scheduleDataset(dataset.streamId, dataset.cronExpression ?? getDefaultCron(dataset.updateFrequency));
      }, delay);
      continue;
    }

    scheduleDataset(dataset.streamId, dataset.cronExpression ?? getDefaultCron(dataset.updateFrequency));
  }

  console.log(`[Scheduler] ${activeJobs.size} dataset jobs scheduled`);
}

// ─── T6. Orphan Run Recovery ───

export async function cleanupOrphanedRuns(): Promise<number> {
  const orphans = await db
    .select({ id: ingestRuns.id })
    .from(ingestRuns)
    .where(eq(ingestRuns.status, "running"));

  if (orphans.length === 0) return 0;

  const ids = orphans.map((r: any) => r.id);
  console.log(`[Scheduler] Found ${ids.length} orphaned 'running' run(s): ${ids.join(", ")}. Marking as failed.`);

  for (const id of ids) {
    await db
      .update(ingestRuns)
      .set({
        status: "failed",
        endTime: Date.now(),
        errors: ["Orphaned run: server restarted while ingestion was in progress"],
        summary: "Orphaned run cleaned up on server restart",
        outcomeClassification: "orphan_recovery",
      })
      .where(eq(ingestRuns.id, id));
  }

  console.log(`[Scheduler] Cleaned up ${ids.length} orphaned run(s)`);
  return ids.length;
}

// ─── T2. Schedule Individual Dataset ───

function getDefaultCron(frequency: string): string {
  switch (frequency) {
    case "hourly": return "0 0 * * * *";
    case "daily": return "0 0 3 * * *";
    case "weekly": return "0 0 3 * * 0";
    case "monthly": return "0 0 3 1 * *";
    default: return "0 0 3 * * *";
  }
}

function cronToIntervalMs(cronExpr: string): number {
  // Simple cron-to-interval conversion for common patterns
  // This is a fallback — node-cron handles the actual scheduling
  if (cronExpr.includes("* * * * *")) return 60_000; // every minute
  if (cronExpr.match(/^0 0 \* \* \* \*$/)) return 3_600_000; // hourly
  if (cronExpr.match(/^0 0 \d+ \* \* \*$/)) return 86_400_000; // daily
  if (cronExpr.match(/^0 0 \d+ \* \* \d$/)) return 604_800_000; // weekly
  return 86_400_000; // default daily
}

export function scheduleDataset(datasetId: string, cronExpression: string): void {
  // Stop existing job if any
  const existing = activeJobs.get(datasetId);
  if (existing) {
    clearInterval(existing as NodeJS.Timeout);
    activeJobs.delete(datasetId);
  }

  cronExpressions.set(datasetId, cronExpression);

  // Use setInterval as a simpler, more reliable alternative to node-cron
  const intervalMs = cronToIntervalMs(cronExpression);
  const timer = setInterval(async () => {
    await runIngestionPipeline(datasetId);
  }, intervalMs);

  activeJobs.set(datasetId, timer);
  console.log(`[Scheduler] Scheduled ${datasetId} with cron: ${cronExpression} (interval: ${intervalMs}ms)`);
}

// ─── T7. Self-Healing: Failure Tracking & Auto-Disable ───

async function handleFailure(datasetId: string, errorMsg: string, errorClass: string): Promise<void> {
  try {
    // Get current failure state
    const [stream] = await db
      .select({
        consecutiveFailures: dataStreamRegistry.consecutiveFailures,
        failureCount: dataStreamRegistry.failureCount,
      })
      .from(dataStreamRegistry)
      .where(eq(dataStreamRegistry.streamId, datasetId))
      .limit(1);

    const currentConsecutive = (stream?.consecutiveFailures ?? 0) + 1;
    const totalFailures = (stream?.failureCount ?? 0) + 1;

    // Calculate exponential backoff
    const backoffMs = Math.min(
      BASE_RETRY_DELAY_MS * Math.pow(2, currentConsecutive - 1),
      MAX_RETRY_DELAY_MS
    );
    const retryAfterAt = Date.now() + backoffMs;

    // Check if we should auto-disable
    const shouldAutoDisable = currentConsecutive >= AUTO_DISABLE_THRESHOLD;

    const updateSet: Record<string, any> = {
      lastRunStatus: "failed",
      lastFailureAt: Date.now(),
      lastErrorType: errorClass,
      lastErrorMessage: errorMsg.substring(0, 500),
      failureCount: totalFailures,
      consecutiveFailures: currentConsecutive,
      retryAfterAt,
      updatedAt: Date.now(),
    };

    if (shouldAutoDisable) {
      updateSet.autoDisabled = true;
      updateSet.disabledReason = `Auto-disabled after ${currentConsecutive} consecutive failures. Last error: ${errorClass}. Use Sovereign Control to re-enable.`;

      // Stop the scheduled job
      const job = activeJobs.get(datasetId);
      if (job) {
        clearInterval(job as NodeJS.Timeout);
        activeJobs.delete(datasetId);
      }

      console.warn(`[Scheduler] AUTO-DISABLED stream ${datasetId} after ${currentConsecutive} consecutive failures`);
    } else {
      console.warn(`[Scheduler] Stream ${datasetId}: failure ${currentConsecutive}/${AUTO_DISABLE_THRESHOLD}. Backoff: ${Math.round(backoffMs / 1000)}s`);
    }

    await db
      .update(dataStreamRegistry)
      .set(updateSet)
      .where(eq(dataStreamRegistry.streamId, datasetId));

    // Emit STREAM_ANOMALY signal for Mission Control alerting
    try {
      await emitSignal({
        effectType: "STREAM_ANOMALY",
        targetTable: "data_stream_registry",
        targetId: 0,
        signalType: `STREAM_ANOMALY:${datasetId}`,
        title: `Stream Failure: ${datasetId}`,
        explanation: `Ingestion stream '${datasetId}' failed (${errorClass}). Consecutive failures: ${currentConsecutive}/${AUTO_DISABLE_THRESHOLD}. Error: ${errorMsg.substring(0, 200)}`,
        severity: shouldAutoDisable ? "critical" : currentConsecutive >= 3 ? "high" : "medium",
        jurisdiction: "federal",
        domain: "data_infrastructure",
        datasetId,
        sourceTimestamp: Date.now(),
      });
    } catch { /* non-fatal — don't let signal emission break ingestion tracking */ }
  } catch (dbErr) {
    console.error(`[Scheduler] Failed to update failure tracking for ${datasetId}:`, dbErr);
  }
}

async function handleSuccess(datasetId: string, result: IngestionResult): Promise<void> {
  try {
    await db
      .update(dataStreamRegistry)
      .set({
        lastRunStatus: "completed",
        lastSuccessAt: Date.now(),
        consecutiveFailures: 0,
        retryAfterAt: null,
        autoDisabled: false,
        disabledReason: null,
        lastRecordsIngested: result.recordsInserted,
        lastSignalsGenerated: result.signalsGenerated,
        updatedAt: Date.now(),
      })
      .where(eq(dataStreamRegistry.streamId, datasetId));
    // Resolve any active STREAM_ANOMALY signals for this stream on recovery
    try {
      await resolveSignalsForTarget("data_stream_registry", 0, "STREAM_ANOMALY");
    } catch { /* non-fatal */ }
  } catch (dbErr) {
    console.error(`[Scheduler] Failed to update success tracking for ${datasetId}:`, dbErr);
  }
}

// ─── T8. Re-enable a stream that was auto-disabled ───

export async function reenableStream(datasetId: string): Promise<{ success: boolean; message: string }> {
  const [stream] = await db
    .select()
    .from(dataStreamRegistry)
    .where(eq(dataStreamRegistry.streamId, datasetId))
    .limit(1);

  if (!stream) return { success: false, message: `Stream ${datasetId} not found` };

  await db
    .update(dataStreamRegistry)
    .set({
      autoDisabled: false,
      disabledReason: null,
      consecutiveFailures: 0,
      retryAfterAt: null,
      updatedAt: Date.now(),
    })
    .where(eq(dataStreamRegistry.streamId, datasetId));

  // Re-schedule if enabled
  if (stream.enabled) {
    scheduleDataset(datasetId, stream.cronExpression ?? getDefaultCron(stream.updateFrequency));
  }

  return { success: true, message: `Stream ${datasetId} re-enabled and rescheduled` };
}

// ─── Reset failure counters for a stream ───

export async function resetFailureCounters(datasetId: string): Promise<{ success: boolean }> {
  await db
    .update(dataStreamRegistry)
    .set({
      consecutiveFailures: 0,
      retryAfterAt: null,
      autoDisabled: false,
      disabledReason: null,
      lastErrorType: null,
      lastErrorMessage: null,
      updatedAt: Date.now(),
    })
    .where(eq(dataStreamRegistry.streamId, datasetId));

  return { success: true };
}

// ─── T3. Full Pipeline Orchestration ───

export async function runIngestionPipeline(
  datasetId: string,
  options?: { maxRecords?: number }
): Promise<{
  success: boolean;
  recordsProcessed: number;
  recordsInserted: number;
  recordsUpdated: number;
  signalsGenerated: number;
  errors: string[];
  runId: number;
  diagnostics?: IngestionResult["diagnostics"];
}> {
  // T2. Prevent duplicate concurrent runs — queue instead of rejecting
  if (runningIngestions.has(datasetId)) {
    const queue = ingestionQueue.get(datasetId) ?? [];
    if (queue.length > 0) {
      console.log(`[Scheduler] ${datasetId} already has a queued run, skipping`);
      return {
        success: false, recordsProcessed: 0, recordsInserted: 0, recordsUpdated: 0,
        signalsGenerated: 0, errors: ["Ingestion already queued for this dataset"], runId: 0,
      };
    }
    queue.push({ maxRecords: options?.maxRecords });
    ingestionQueue.set(datasetId, queue);
    console.log(`[Scheduler] ${datasetId} is running — queued for next run`);
    return {
      success: false, recordsProcessed: 0, recordsInserted: 0, recordsUpdated: 0,
      signalsGenerated: 0, errors: ["Ingestion queued — will run after current ingestion completes"], runId: 0,
    };
  }

  runningIngestions.add(datasetId);
  console.log(`[Scheduler] Starting pipeline for ${datasetId}`);

  try {
    // Step 1: Ingest data — route only through a declared adapter.
    const [streamConfig] = await db
      .select({ source: dataStreamRegistry.source })
      .from(dataStreamRegistry)
      .where(eq(dataStreamRegistry.streamId, datasetId))
      .limit(1);

    const adapterSource = streamConfig?.source;
    if (!adapterSource) {
      throw new Error(`Stream ${datasetId} has no declared ingestion source`);
    }

    let result: IngestionResult;

    if (adapterSource === "atlas_stream") {
      result = await ingest_atlas_stream(datasetId, {
        max_records: options?.maxRecords,
        on_progress: (msg) => console.log(msg),
      });
    } else if (adapterSource === "cfpb" || adapterSource === "cfpb_native") {
      result = await ingestCfpbDataset(datasetId, {
        maxRecords: options?.maxRecords,
        onProgress: (msg) => console.log(msg),
      });
    } else if (adapterSource === "socrata") {
      result = await ingestDataset(datasetId, {
        maxRecords: options?.maxRecords,
        onProgress: (msg) => console.log(msg),
      });
    } else {
      throw new Error(
        `Unsupported ingestion source '${adapterSource}' for stream ${datasetId}`,
      );
    }

    const atlasPartialFailure =
      adapterSource === "atlas_stream" && result.recordsProcessed > 0 &&
      result.diagnostics?.outcomeClassification === "partial_failure";

    // The Atlas adapter has already committed and accounted for these pages.
    // Preserve the durable counts, but do not reinterpret the events or relabel
    // the partial result as a successful run.
    if (atlasPartialFailure) {
      return {
        success: false,
        recordsProcessed: result.recordsProcessed,
        recordsInserted: result.recordsInserted,
        recordsUpdated: result.recordsUpdated,
        signalsGenerated: result.signalsGenerated,
        errors: result.errors,
        runId: result.runId,
        diagnostics: result.diagnostics,
      };
    }

    // Check if ingestion failed at the adapter level
    if (result.errors.length > 0 && result.recordsProcessed === 0) {
      // This is a failure — track it for self-healing
      const errorClass = result.diagnostics?.errorClassification ?? "unknown";
      await handleFailure(datasetId, result.errors[0], errorClass);

      return {
        success: false,
        recordsProcessed: 0,
        recordsInserted: 0,
        recordsUpdated: 0,
        signalsGenerated: 0,
        errors: result.errors,
        runId: result.runId,
        diagnostics: result.diagnostics,
      };
    }

    const atlas_partial_failure = adapterSource === "atlas_stream" && result.recordsProcessed > 0 &&
      result.diagnostics?.outcomeClassification === "partial_failure";
    if (atlas_partial_failure) {
      console.warn(
        `[Scheduler] Atlas bridge partially synchronized ${datasetId}: ${result.recordsProcessed} committed before failure`,
      );
      return {
        success: false,
        recordsProcessed: result.recordsProcessed,
        recordsInserted: result.recordsInserted,
        recordsUpdated: result.recordsUpdated,
        signalsGenerated: result.signalsGenerated,
        errors: result.errors,
        runId: result.runId,
        diagnostics: result.diagnostics,
      };
    }

    // Step 2: Atlas owns its signal events. Only raw-source adapters run the
    // Lighthouse signal detector.
    let signalsGenerated = result.signalsGenerated;
    let postProcessingEngine = "atlas-stream-bridge";
    if (adapterSource !== "atlas_stream") {
      signalsGenerated = 0;
      postProcessingEngine = "signal-detection-engine";
      try {
        signalsGenerated = await detectSignals(datasetId, result.runId, (msg) => console.log(msg));
      } catch (signalErr) {
        console.error(`[Scheduler] Signal detection failed for ${datasetId}:`, signalErr);
        result.errors.push(`Signal detection: ${signalErr instanceof Error ? signalErr.message : String(signalErr)}`);
      }
    }

    // Step 3: Update run with signal count + mark signals processed
    if (result.runId) {
      try {
        await db
          .update(ingestRuns)
          .set({
            signalsGenerated,
            signalsProcessed: true,
            postProcessingEngine,
          })
          .where(eq(ingestRuns.id, result.runId));
      } catch { /* non-fatal */ }
    }

    // Step 4: Update stream registry with signal count
    try {
      await db
        .update(dataStreamRegistry)
        .set({
          signalsGenerated: sql`signals_generated_dsr + ${signalsGenerated}`,
          lastSignalsGenerated: signalsGenerated,
        })
        .where(eq(dataStreamRegistry.streamId, datasetId));
    } catch { /* non-fatal */ }

    // Step 5: Track success for self-healing
    const fullResult = { ...result, signalsGenerated };
    await handleSuccess(datasetId, fullResult);

    console.log(`[Scheduler] Pipeline complete for ${datasetId}: ${result.recordsProcessed} processed, ${signalsGenerated} signals`);

    return {
      success: true,
      recordsProcessed: result.recordsProcessed,
      recordsInserted: result.recordsInserted,
      recordsUpdated: result.recordsUpdated,
      signalsGenerated,
      errors: result.errors,
      runId: result.runId,
      diagnostics: result.diagnostics,
    };
  } catch (err) {
    console.error(`[Scheduler] Pipeline failed for ${datasetId}:`, err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    const errorClass = classifyError(err);

    await handleFailure(datasetId, errorMsg, errorClass);

    return {
      success: false, recordsProcessed: 0, recordsInserted: 0, recordsUpdated: 0,
      signalsGenerated: 0, errors: [errorMsg], runId: 0,
    };
  } finally {
    runningIngestions.delete(datasetId);

    // Process queued run if any
    const queue = ingestionQueue.get(datasetId);
    if (queue && queue.length > 0) {
      const next = queue.shift()!;
      if (queue.length === 0) ingestionQueue.delete(datasetId);
      console.log(`[Scheduler] Processing queued run for ${datasetId}`);
      runIngestionPipeline(datasetId, next).catch((err) =>
        console.error(`[Scheduler] Queued run failed for ${datasetId}:`, err)
      );
    }
  }
}

// ─── T4. Manual Trigger ───

export async function triggerManualIngestion(
  datasetId: string,
  maxRecords?: number
) {
  return runIngestionPipeline(datasetId, { maxRecords });
}

// ─── T5. Refresh Schedules ───

export async function refreshSchedules(): Promise<void> {
  // Stop all existing jobs
  for (const [id, timer] of activeJobs) {
    clearInterval(timer as NodeJS.Timeout);
  }
  activeJobs.clear();
  cronExpressions.clear();

  // Re-initialize
  await initializeScheduler();
}

// ─── Status ───

export function getSchedulerStatus(): {
  activeJobs: string[];
  runningIngestions: string[];
  queuedIngestions: Record<string, number>;
  cronExpressions: Record<string, string>;
  autoDisableThreshold: number;
} {
  const queued: Record<string, number> = {};
  for (const [id, q] of ingestionQueue) {
    queued[id] = q.length;
  }
  const crons: Record<string, string> = {};
  for (const [id, expr] of cronExpressions) {
    crons[id] = expr;
  }
  return {
    activeJobs: Array.from(activeJobs.keys()),
    runningIngestions: Array.from(runningIngestions),
    queuedIngestions: queued,
    cronExpressions: crons,
    autoDisableThreshold: AUTO_DISABLE_THRESHOLD,
  };
}

/** Check if a specific dataset is currently running */
export function isDatasetRunning(datasetId: string): boolean {
  return runningIngestions.has(datasetId);
}

/** Check if a specific dataset has a queued run */
export function isDatasetQueued(datasetId: string): boolean {
  return (ingestionQueue.get(datasetId)?.length ?? 0) > 0;
}

export function stopScheduler(): void {
  for (const [id, timer] of activeJobs) {
    clearInterval(timer as NodeJS.Timeout);
  }
  activeJobs.clear();
  cronExpressions.clear();
  console.log("[Scheduler] All jobs stopped");
}

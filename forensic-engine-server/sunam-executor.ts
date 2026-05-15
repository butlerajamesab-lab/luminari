/**
 * Sunam Executor
 * 
 * Autonomous execution loop for Sunam.
 * Runs on server startup, processes signals in batches, creates sessions, logs to governance.
 * 
 * Flow:
 * 1. Start a session with governance anchor
 * 2. Run process_signals_batch()
 * 3. Record actions and results in session
 * 4. End session and produce handoff
 * 5. Schedule next run
 */

import { db } from "./db.ts";
import { processSignalsBatch } from "./sunam-backfill.ts";
import { startSession, recordSessionAction, endSession, getSessionHandoff } from "./session-management.ts";
import { notifyOwner } from "./_core/notification.ts";

export interface SunamExecutorConfig {
  enabled: boolean;
  intervalMs: number; // How often to run (default 5 minutes)
  batchSize: number; // Signals to process per run (default 100)
  maxRetries: number; // Retry failed runs (default 3)
}

const DEFAULT_CONFIG: SunamExecutorConfig = {
  enabled: true,
  intervalMs: 5 * 60 * 1000, // 5 minutes
  batchSize: 100,
  maxRetries: 3,
};

let executorInterval: NodeJS.Timeout | null = null;
let isRunning = false;
let lastRunTime = 0;
let consecutiveFailures = 0;

/**
 * Initialize Sunam executor
 * Called on server startup
 */
export async function initSunamExecutor(config: Partial<SunamExecutorConfig> = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  if (!finalConfig.enabled) {
    console.log("[Sunam] Executor disabled");
    return;
  }

  console.log(
    `[Sunam] Executor initialized (interval: ${finalConfig.intervalMs}ms, batch: ${finalConfig.batchSize})`
  );

  // Run once immediately on startup
  await runSunamExecution(finalConfig);

  // Then schedule recurring runs
  executorInterval = setInterval(
    () => runSunamExecution(finalConfig),
    finalConfig.intervalMs
  );
}

/**
 * Execute one Sunam cycle
 */
async function runSunamExecution(config: SunamExecutorConfig) {
  if (isRunning) {
    console.log("[Sunam] Execution already in progress, skipping");
    return;
  }

  isRunning = true;
  const cycleStartTime = Date.now();

  try {
    // Step 1: Start a session
    const sessionId = await startSession("sunam", "autonomous_backfill");
    console.log(`[Sunam] Session started: ${sessionId}`);

    // Step 2: Process signals batch
    console.log(`[Sunam] Processing signal batch (size: ${config.batchSize})...`);
    const result = await processSignalsBatch(config.batchSize);

    // Step 3: Record action in session
    await recordSessionAction(sessionId, "process_signals_batch", {
      batchSize: config.batchSize,
      processed: result.processed,
      inserted: result.inserted,
      skipped: result.skipped,
      failed: result.failed,
    });

    console.log(
      `[Sunam] Batch complete: ${result.processed} processed, ${result.inserted} inserted, ${result.skipped} skipped, ${result.failed} failed`
    );

    // Step 4: End session
    await endSession(sessionId, {
      processed: result.processed,
      inserted: result.inserted,
      skipped: result.skipped,
      failed: result.failed,
      finalDetectedSignalsCount: result.finalDetectedSignalsCount,
    });

    // Step 5: Get handoff for logging
    const handoff = await getSessionHandoff(sessionId);
    console.log(
      `[Sunam] Session ended: ${handoff.actionsTaken.length} actions, governance entries ${handoff.governanceEntries ? `${handoff.governanceEntries[0]}-${handoff.governanceEntries[1]}` : "none"}`
    );

    // Reset failure counter on success
    consecutiveFailures = 0;
    lastRunTime = Date.now();

    // Notify on significant results
    if (result.inserted > 0) {
      await notifyOwner({
        title: "Sunam Backfill Complete",
        content: `Processed ${result.processed} signals, inserted ${result.inserted} new detected signals`,
      }).catch((err) => console.error("[Sunam] Notification failed:", err));
    }
  } catch (error) {
    consecutiveFailures++;
    console.error(`[Sunam] Execution failed (attempt ${consecutiveFailures}):`, error);

    if (consecutiveFailures >= config.maxRetries) {
      console.error("[Sunam] Max retries exceeded, notifying owner");
      await notifyOwner({
        title: "Sunam Executor Failed",
        content: `Sunam autonomous backfill has failed ${consecutiveFailures} times. Manual intervention may be required.`,
      }).catch((err) => console.error("[Sunam] Notification failed:", err));
    }
  } finally {
    isRunning = false;
    const cycleDuration = Date.now() - cycleStartTime;
    console.log(`[Sunam] Cycle complete (${cycleDuration}ms)`);
  }
}

/**
 * Shutdown executor
 */
export function shutdownSunamExecutor() {
  if (executorInterval) {
    clearInterval(executorInterval);
    executorInterval = null;
    console.log("[Sunam] Executor shutdown");
  }
}

/**
 * Get executor status
 */
export function getSunamExecutorStatus() {
  return {
    running: isRunning,
    lastRunTime,
    consecutiveFailures,
    intervalActive: executorInterval !== null,
  };
}

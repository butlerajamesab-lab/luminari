/**
 * Chain Verification Cron
 * 
 * Periodically verifies governance chain integrity and notifies owner on failure.
 * Runs every N minutes (configurable).
 * 
 * On failure:
 * - Logs the break point with seq_no, expected hash, actual hash
 * - Notifies owner with full details
 * - Records cron run in audit log
 */

import { verifyGovernanceChain } from "./governance-log.ts";
import { notifyOwner } from "./_core/notification.ts";
import { db } from "./db.ts";
import { chainVerificationLog } from "../drizzle/schema.ts";

interface CronConfig {
  intervalMinutes: number;
  enabled: boolean;
}

let cronJob: NodeJS.Timeout | null = null;
let lastRunAt: number | null = null;
let isRunning = false;

/**
 * Start the chain verification cron
 */
export function startChainVerificationCron(config: CronConfig = { intervalMinutes: 5, enabled: true }) {
  if (!config.enabled) {
    console.log("[Chain Verification Cron] Disabled");
    return;
  }

  if (cronJob) {
    console.log("[Chain Verification Cron] Already running");
    return;
  }

  const intervalMs = config.intervalMinutes * 60 * 1000;

  console.log(`[Chain Verification Cron] Starting (every ${config.intervalMinutes} minutes)`);

  // Run immediately on start
  runVerification();

  // Then run periodically
  cronJob = setInterval(runVerification, intervalMs);
}

/**
 * Stop the chain verification cron
 */
export function stopChainVerificationCron() {
  if (cronJob) {
    clearInterval(cronJob);
    cronJob = null;
    console.log("[Chain Verification Cron] Stopped");
  }
}

/**
 * Run a single verification cycle
 */
async function runVerification() {
  if (isRunning) {
    console.log("[Chain Verification Cron] Already running, skipping");
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    console.log("[Chain Verification Cron] Running verification...");

    // Verify the chain
    const result = await verifyGovernanceChain(db);

    // Log the run
    await db.insert(chainVerificationLog).values({
      runAt: startTime,
      valid: result.valid,
      totalEntries: result.totalEntries,
      lastValidSeqNo: result.lastValidSeqNo,
      breakPoint: result.breakPoint || null,
      durationMs: Date.now() - startTime,
    });

    // If broken, notify owner
    if (!result.valid && result.breakPoint) {
      const message = `
Governance Chain Integrity Alert

Status: BROKEN at seq_no ${result.breakPoint.seqNo}

Details:
- Expected Hash: ${result.breakPoint.expectedHash}
- Actual Hash: ${result.breakPoint.actualHash}
- Reason: ${result.breakPoint.reason}

Total Entries: ${result.totalEntries}
Last Valid Seq No: ${result.lastValidSeqNo}

This indicates potential tampering or data corruption.
Immediate investigation required.
      `.trim();

      console.warn("[Chain Verification Cron] Chain is BROKEN, notifying owner");

      const notified = await notifyOwner({
        title: "⚠️ Governance Chain Integrity Alert",
        content: message,
      });

      if (!notified) {
        console.error("[Chain Verification Cron] Failed to notify owner");
      }
    } else if (result.valid) {
      console.log(
        `[Chain Verification Cron] Chain is VALID (${result.totalEntries} entries, last valid seq_no: ${result.lastValidSeqNo})`
      );
    }

    lastRunAt = startTime;
  } catch (error) {
    console.error("[Chain Verification Cron] Error:", error);

    // Try to notify owner of cron failure
    try {
      await notifyOwner({
        title: "⚠️ Chain Verification Cron Failed",
        content: `The periodic chain verification cron encountered an error: ${error instanceof Error ? error.message : String(error)}`,
      });
    } catch (notifyError) {
      console.error("[Chain Verification Cron] Failed to notify owner of cron failure:", notifyError);
    }
  } finally {
    isRunning = false;
  }
}

/**
 * Get cron status
 */
export function getChainVerificationCronStatus() {
  return {
    running: cronJob !== null,
    lastRunAt,
    isCurrentlyRunning: isRunning,
  };
}

/**
 * Get recent verification runs
 */
export async function getRecentVerificationRuns(limit: number = 10) {
  return await db
    .select()
    .from(chainVerificationLog)
    .orderBy(chainVerificationLog.runAt)
    .limit(limit);
}

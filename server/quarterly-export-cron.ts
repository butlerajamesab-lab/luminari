/**
 * Quarterly Spine Export Cron
 *
 * Automatically runs a Full Spine Export every 90 days.
 * Stores the bundle to S3 and notifies the owner on completion or failure.
 *
 * This is the resilience backbone for Luminari — ensuring the complete
 * knowledge base, enforcement pathways, and institutional memory are
 * preserved independently of platform availability.
 *
 * Schedule: Every 90 days via node-cron (cron: 0 0 1 every-3rd-month)
 * First run: At the next scheduled cron tick (not immediate)
 * Owner notification: on success AND on failure
 *
 * Safety: A minimum 30-day guard prevents accidental rapid re-runs.
 */

import * as cron from "node-cron";
import { runExport } from "./engines/export-spine-engine";
import { notifyOwner } from "./_core/notification";
import { db } from "./db";
import { exportSpineRuns } from "../drizzle/schema";
import { desc, eq } from "drizzle-orm";

// ─── Config ───────────────────────────────────────────────────────────────────

const CREATED_BY = "quarterly-auto-export";
// Minimum 30 days between auto-runs (safety guard against rapid re-runs)
const MIN_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

// ─── State ────────────────────────────────────────────────────────────────────

let cronTask: cron.ScheduledTask | null = null;
let nextRunAt: number | null = null;
let isRunning = false;
let lastRunAt: number | null = null;
let lastRunStatus: "success" | "failed" | null = null;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Start the quarterly export cron.
 * Uses node-cron schedule: 0 0 1 every-3rd-month (1st of every 3rd month at midnight UTC)
 * This is approximately every 90 days.
 */
export function startQuarterlyExportCron() {
  if (cronTask) {
    console.log("[Quarterly Export Cron] Already scheduled, skipping re-registration");
    return;
  }

  // Schedule: 1st of every 3rd month at midnight UTC ≈ every 90 days
  // Cron format: second minute hour day month weekday
  // "0 0 1 */3 *" = at 00:00 on day 1 of every 3rd month
  cronTask = cron.schedule("0 0 1 */3 *", () => {
    // Safety guard: don't run if last run was less than 30 days ago
    if (lastRunAt && Date.now() - lastRunAt < MIN_INTERVAL_MS) {
      console.log("[Quarterly Export Cron] Skipping — last run was too recent");
      return;
    }
    runQuarterlyExport().catch(err =>
      console.error("[Quarterly Export Cron] Unhandled error:", err)
    );
  }, {
    timezone: "UTC",
  });

  // Compute next run date (1st of next quarter)
  const now = new Date();
  const nextQuarter = new Date(now);
  nextQuarter.setUTCDate(1);
  nextQuarter.setUTCHours(0, 0, 0, 0);
  // Advance to next 3-month boundary
  const currentMonth = now.getUTCMonth(); // 0-11
  const nextQuarterMonth = Math.ceil((currentMonth + 1) / 3) * 3;
  if (nextQuarterMonth >= 12) {
    nextQuarter.setUTCFullYear(now.getUTCFullYear() + 1);
    nextQuarter.setUTCMonth(0);
  } else {
    nextQuarter.setUTCMonth(nextQuarterMonth);
  }
  nextRunAt = nextQuarter.getTime();

  console.log(
    `[Quarterly Export Cron] Scheduled — next Full Spine Export: ${nextQuarter.toISOString()}`
  );
}

/**
 * Stop the quarterly export cron.
 */
export function stopQuarterlyExportCron() {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    nextRunAt = null;
    console.log("[Quarterly Export Cron] Stopped");
  }
}

/**
 * Trigger a manual export run outside the schedule.
 * Safe to call at any time — will skip if already running.
 */
export async function triggerManualQuarterlyExport(): Promise<{ success: boolean; bundleName?: string; error?: string }> {
  if (isRunning) {
    return { success: false, error: "Export already in progress" };
  }
  return runQuarterlyExport();
}

/**
 * Get current cron status for display in Sovereign Control UI.
 */
export async function getQuarterlyExportStatus() {
  // Get last 10 runs from DB
  const recentRuns = await db
    .select({
      id: exportSpineRuns.id,
      exportType: exportSpineRuns.exportType,
      bundleName: exportSpineRuns.bundleName,
      status: exportSpineRuns.status,
      createdAt: exportSpineRuns.createdAt,
      completedAt: exportSpineRuns.completedAt,
      fileUrl: exportSpineRuns.fileUrl,
      bundleSize: exportSpineRuns.bundleSize,
      createdBy: exportSpineRuns.createdBy,
      errorMessage: exportSpineRuns.errorMessage,
    })
    .from(exportSpineRuns)
    .orderBy(desc(exportSpineRuns.createdAt))
    .limit(10);

  const autoRuns = recentRuns.filter(
    (r: any) => r.createdBy === CREATED_BY || r.createdBy === "manual-trigger"
  );

  return {
    scheduled: cronTask !== null,
    nextRunAt,
    nextRunFormatted: nextRunAt
      ? new Date(nextRunAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : null,
    isCurrentlyRunning: isRunning,
    lastRunAt,
    lastRunStatus,
    intervalDays: 90,
    recentRuns: recentRuns.slice(0, 5),
    autoRunCount: autoRuns.length,
  };
}

// ─── Core Export Runner ───────────────────────────────────────────────────────

async function runQuarterlyExport(): Promise<{ success: boolean; bundleName?: string; error?: string }> {
  if (isRunning) {
    console.log("[Quarterly Export Cron] Already running, skipping");
    return { success: false, error: "Already running" };
  }

  isRunning = true;
  lastRunAt = Date.now();
  const startTime = Date.now();

  console.log("[Quarterly Export Cron] Starting Full Spine Export...");

  try {
    const { runId, bundleName } = await runExport("full", CREATED_BY);

    const durationSec = Math.round((Date.now() - startTime) / 1000);
    lastRunStatus = "success";

    console.log(`[Quarterly Export Cron] Export complete — bundle: ${bundleName} (${durationSec}s)`);

    // Fetch the completed run for size/URL info
    const [completedRun] = await db
      .select()
      .from(exportSpineRuns)
      .where(eq(exportSpineRuns.id, runId))
      .limit(1);

    const sizeMB = completedRun?.bundleSize
      ? (Number(completedRun.bundleSize) / (1024 * 1024)).toFixed(1)
      : "unknown";

    // Update next run time
    if (nextRunAt) {
      const nextDate = new Date(nextRunAt);
      nextDate.setUTCMonth(nextDate.getUTCMonth() + 3);
      nextRunAt = nextDate.getTime();
    }

    // Notify owner of successful backup
    await notifyOwner({
      title: "✅ Quarterly Spine Export Complete",
      content: `
Luminari Knowledge Backbone — Quarterly Backup Complete

Bundle: ${bundleName}
Size: ${sizeMB} MB
Duration: ${durationSec} seconds
Completed: ${new Date().toISOString()}
${completedRun?.fileUrl ? `\nDownload: ${completedRun.fileUrl}` : ""}

This export captures the complete Luminari knowledge backbone including all enforcement pathways, legal knowledge, jurisdiction hierarchy, remedy feasibility rules, coalition data, and procedural engine configuration.

Next scheduled export: ${nextRunAt ? new Date(nextRunAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "in ~90 days"}
      `.trim(),
    });

    return { success: true, bundleName };

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    lastRunStatus = "failed";

    console.error("[Quarterly Export Cron] Export FAILED:", errMsg);

    // Notify owner of failure
    try {
      await notifyOwner({
        title: "⚠️ Quarterly Spine Export Failed",
        content: `
Luminari Knowledge Backbone — Quarterly Backup FAILED

Error: ${errMsg}
Time: ${new Date().toISOString()}

The scheduled quarterly backup of the Luminari knowledge backbone did not complete successfully.

Action required: Please run a manual Full Export from Sovereign Control → Export Spine to ensure the knowledge backbone is backed up.
        `.trim(),
      });
    } catch (notifyErr) {
      console.error("[Quarterly Export Cron] Failed to notify owner:", notifyErr);
    }

    return { success: false, error: errMsg };
  } finally {
    isRunning = false;
  }
}

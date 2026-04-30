/**
 * Deadline Scheduler — Session 9C
 *
 * Server-side scheduled job that proactively checks FOIA deadlines
 * and generates notifications for all users with active requests.
 *
 * Architecture:
 * D1. Runs on a configurable interval (default: every 24 hours)
 * D2. Scans all users with active FOIA requests (status = submitted/acknowledged/in_processing)
 * D3. For each user, checks for overdue and approaching deadlines
 * D4. Deduplicates notifications: only sends one notification per request per day
 * D5. Fire-and-forget: errors in one user's check don't block others
 *
 * Constraints:
 * - No LLM calls
 * - No user context required (runs as system job)
 * - Errors are logged but never crash the server
 */

import { db } from "./db";
import {
  foiaRequests,
  cases,
  users,
  notifications,
} from "../drizzle/schema";
import { eq, and, sql, desc, isNull, isNotNull } from "drizzle-orm";
import {
  findOverdueFoiaRequests,
  findApproachingDeadlineFoiaRequests,
  notifyFoiaDeadlineApproaching,
  notifyFoiaOverdue,
} from "./db";

// ─── D1. Configuration ───

/** Default interval: 24 hours in milliseconds */
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Minimum interval: 5 minutes (prevent accidental tight loops) */
const MIN_INTERVAL_MS = 5 * 60 * 1000;

/** Track the interval handle for cleanup */
let schedulerHandle: ReturnType<typeof setInterval> | null = null;

/** Track last run timestamp for deduplication */
let lastRunAt: number = 0;

// ─── D2. User Discovery ───

/**
 * Find all user IDs that have at least one active FOIA request
 * (status = submitted, acknowledged, or in_processing) with a response due date.
 *
 * This avoids scanning users who have no active requests.
 */
export async function findUsersWithActiveRequests(): Promise<number[]> {
  const rows = await db.selectDistinct({ userId: foiaRequests.userId })
    .from(foiaRequests)
    .where(and(
      sql`${foiaRequests.status} IN ('submitted', 'acknowledged', 'in_processing')`,
      isNotNull(foiaRequests.responseDueAt),
      isNull(foiaRequests.responseReceivedAt),
    ));

  return rows.map(r => r.userId);
}

// ─── D3. Per-User Deadline Check ───

/**
 * Check deadlines for a single user and generate notifications.
 *
 * D3.1: Find overdue requests
 * D3.2: Find approaching deadline requests (within 7 days)
 * D3.3: Deduplicate against recent notifications (same type + requestId within 24h)
 * D3.4: Create notifications for new alerts only
 *
 * Returns { overdue, approaching, notified } counts.
 */
export async function checkUserDeadlines(userId: number): Promise<{
  overdue: number;
  approaching: number;
  notified: number;
}> {
  const overdue = await findOverdueFoiaRequests(userId);
  const approaching = await findApproachingDeadlineFoiaRequests(userId);

  let notified = 0;

  // D3.3: Check for recent notifications to avoid duplicates
  const recentCutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago

  for (const req of overdue) {
    const isDuplicate = await hasRecentNotification(
      userId, "foia_overdue", req.id, recentCutoff
    );
    if (!isDuplicate) {
      const daysOverdue = req.responseDueAt
        ? Math.ceil((Date.now() - req.responseDueAt) / (24 * 60 * 60 * 1000))
        : 0;
      await notifyFoiaOverdue(
        userId, req.id, req.caseId,
        req.agencyName ?? "", req.recordType, daysOverdue
      );
      notified++;
    }
  }

  for (const req of approaching) {
    const isDuplicate = await hasRecentNotification(
      userId, "foia_deadline_approaching", req.id, recentCutoff
    );
    if (!isDuplicate) {
      const daysRemaining = req.responseDueAt
        ? Math.ceil((req.responseDueAt - Date.now()) / (24 * 60 * 60 * 1000))
        : 0;
      await notifyFoiaDeadlineApproaching(
        userId, req.id, req.caseId,
        req.agencyName ?? "", req.recordType, daysRemaining
      );
      notified++;
    }
  }

  return { overdue: overdue.length, approaching: approaching.length, notified };
}

// ─── D4. Deduplication ───

/**
 * Check if a notification of the given type for the given request
 * was already sent within the dedup window.
 */
export async function hasRecentNotification(
  userId: number,
  type: string,
  requestId: number,
  sinceTimestamp: number,
): Promise<boolean> {
  const [row] = await db.select({ id: notifications.id })
    .from(notifications)
    .where(and(
      eq(notifications.userId, userId),
      eq(notifications.type, type),
      sql`${notifications.createdAt} > ${sinceTimestamp}`,
      sql`JSON_EXTRACT(${notifications.metadata}, '$.requestId') = ${requestId}`,
    ))
    .limit(1);

  return !!row;
}

// ─── D5. Batch Runner ───

/**
 * Run the full deadline check across all users.
 *
 * This is the main entry point called by the scheduler.
 * Errors in individual user checks are caught and logged.
 */
export async function runScheduledDeadlineCheck(): Promise<{
  usersChecked: number;
  totalOverdue: number;
  totalApproaching: number;
  totalNotified: number;
  errors: number;
}> {
  const startTime = Date.now();
  console.log("[DeadlineScheduler] Starting scheduled deadline check...");

  const userIds = await findUsersWithActiveRequests();

  let totalOverdue = 0;
  let totalApproaching = 0;
  let totalNotified = 0;
  let errors = 0;

  for (const userId of userIds) {
    try {
      const result = await checkUserDeadlines(userId);
      totalOverdue += result.overdue;
      totalApproaching += result.approaching;
      totalNotified += result.notified;
    } catch (err) {
      errors++;
      console.error(`[DeadlineScheduler] Error checking user ${userId}:`, err);
    }
  }

  lastRunAt = Date.now();
  const elapsed = Date.now() - startTime;
  console.log(
    `[DeadlineScheduler] Complete: ${userIds.length} users checked, ` +
    `${totalOverdue} overdue, ${totalApproaching} approaching, ` +
    `${totalNotified} notifications sent, ${errors} errors (${elapsed}ms)`
  );

  return {
    usersChecked: userIds.length,
    totalOverdue,
    totalApproaching,
    totalNotified,
    errors,
  };
}

// ─── Scheduler Lifecycle ───

/**
 * Start the deadline scheduler with the given interval.
 *
 * Runs immediately on start, then repeats at the interval.
 * Safe to call multiple times (stops previous scheduler first).
 */
export function startDeadlineScheduler(intervalMs: number = DEFAULT_INTERVAL_MS): void {
  // Enforce minimum interval
  const safeInterval = Math.max(intervalMs, MIN_INTERVAL_MS);

  // Stop existing scheduler if running
  stopDeadlineScheduler();

  console.log(`[DeadlineScheduler] Starting with ${Math.round(safeInterval / 60000)}min interval`);

  // Run immediately (fire-and-forget)
  runScheduledDeadlineCheck().catch(err =>
    console.error("[DeadlineScheduler] Initial run error:", err)
  );

  // Schedule recurring runs
  schedulerHandle = setInterval(() => {
    runScheduledDeadlineCheck().catch(err =>
      console.error("[DeadlineScheduler] Scheduled run error:", err)
    );
  }, safeInterval);
}

/**
 * Stop the deadline scheduler.
 */
export function stopDeadlineScheduler(): void {
  if (schedulerHandle) {
    clearInterval(schedulerHandle);
    schedulerHandle = null;
    console.log("[DeadlineScheduler] Stopped");
  }
}

/**
 * Get the scheduler status.
 */
export function getSchedulerStatus(): {
  running: boolean;
  lastRunAt: number;
} {
  return {
    running: schedulerHandle !== null,
    lastRunAt,
  };
}

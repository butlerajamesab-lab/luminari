/**
 * Autonomous Healer — Sunam Self-Operating Loop
 * 
 * Runs on a fixed interval (every 60s). No user interaction required.
 * 
 * Loop:
 * 1. DETECT: Query data_stream_registry for streams with failures
 * 2. DIAGNOSE: Classify the failure type
 * 3. FIX: Apply SAFE fixes only (reset counters, re-enable, disable broken)
 * 4. RE-RUN: Trigger ingestion only for streams that were re-enabled
 * 5. LOG: Write every action to admin_change_log for audit
 * 
 * SAFETY CONSTRAINTS (enforced after URL corruption incident):
 * - Healer may NEVER change apiUrl or fieldMapping
 * - Healer may NEVER change source adapter type
 * - URL, field mapping, and adapter changes require admin action
 * - Healer may only: reset failure counters, re-enable auto-disabled streams,
 *   disable broken streams, and trigger re-ingestion for re-enabled streams
 */

import { db } from "./db";
import { dataStreamRegistry, adminChangeLog } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { triggerManualIngestion, resetFailureCounters } from "./ingestion/scheduler";

// ─── Types ───

interface StreamFix {
  streamId: string;
  updates: Record<string, any>;
  description: string;
  /** Whether to trigger re-ingestion after fix */
  triggerRerun: boolean;
}

type DiagnosisRule = (stream: StreamRow) => StreamFix | null;

interface StreamRow {
  streamId: string;
  streamName: string;
  apiUrl: string | null;
  sourceUrl: string | null;
  source: string | null;
  enabled: boolean;
  autoDisabled: boolean;
  consecutiveFailures: number;
  failureCount: number;
  lastErrorType: string | null;
  lastErrorMessage: string | null;
  lastHttpStatus: number | null;
  recordsIngested: number;
  fieldMapping: Record<string, string> | null;
}

// ─── FORBIDDEN FIELDS ───
// The Healer is NEVER allowed to modify these fields.
// This is a hard safety constraint after the URL corruption incident.
const FORBIDDEN_FIELDS = new Set([
  "apiUrl",
  "sourceUrl",
  "source",
  "fieldMapping",
  "adapterType",
]);

/**
 * Validate that a fix does not touch forbidden fields.
 * Throws if any forbidden field is present in the updates.
 */
function validateFix(fix: StreamFix): void {
  for (const key of Object.keys(fix.updates)) {
    if (FORBIDDEN_FIELDS.has(key)) {
      throw new Error(
        `[Healer SAFETY VIOLATION] Attempted to modify forbidden field "${key}" on stream ${fix.streamId}. ` +
        `URL, field mapping, source, and adapter changes require admin action. Fix rejected.`
      );
    }
  }
}

// ─── Diagnosis Rules (SAFE operations only) ───

const diagnosisRules: DiagnosisRule[] = [
  // Rule 1: Stream is auto-disabled with a valid API URL — re-enable and retry
  (stream) => {
    if (!stream.autoDisabled) return null;
    const url = stream.apiUrl || "";
    // Only re-enable if it has a valid-looking API URL
    if (!url || url.length < 10) return null;
    // Don't re-enable if it has had too many total failures (likely a dead endpoint)
    if (stream.failureCount > 20) return null;
    return {
      streamId: stream.streamId,
      updates: {
        autoDisabled: false,
        disabledReason: null,
        consecutiveFailures: 0,
        retryAfterAt: null,
      },
      description: `Re-enabled auto-disabled stream ${stream.streamId} for retry`,
      triggerRerun: true,
    };
  },

  // Rule 2: Stream has consecutive failures but is not auto-disabled yet — reset counters if in backoff
  (stream) => {
    if (stream.autoDisabled) return null;
    if (stream.consecutiveFailures === 0) return null;
    if (!stream.enabled) return null;
    // If the stream has a retryAfterAt in the past, reset it
    return null; // Let the scheduler's own backoff handle this
  },

  // Rule 3: Stream has invalid_json error — disable it (URL returns HTML, not JSON)
  (stream) => {
    if (stream.lastErrorType !== "invalid_json") return null;
    if (!stream.enabled) return null;
    return {
      streamId: stream.streamId,
      updates: {
        enabled: false,
        disabledReason: `Auto-disabled by healer: API returns HTML, not JSON. URL: ${stream.apiUrl}. Admin must fix the API URL.`,
      },
      description: `Disabled stream ${stream.streamId}: API URL returns HTML, not JSON. Admin must provide correct API URL.`,
      triggerRerun: false,
    };
  },

  // Rule 4: Stream has auth_failure — disable it
  (stream) => {
    if (stream.lastErrorType !== "auth_failure") return null;
    if (!stream.enabled) return null;
    return {
      streamId: stream.streamId,
      updates: {
        enabled: false,
        disabledReason: `Auto-disabled by healer: Authentication failure. Admin must provide credentials or fix the endpoint.`,
      },
      description: `Disabled stream ${stream.streamId}: Authentication failure. Requires admin intervention.`,
      triggerRerun: false,
    };
  },
];

// ─── Autonomous Action Log ───

interface HealerAction {
  timestamp: number;
  streamId: string;
  phase: "detect" | "diagnose" | "fix" | "rerun" | "validate" | "safety_block";
  description: string;
  beforeState: Record<string, any>;
  afterState?: Record<string, any>;
  success: boolean;
  error?: string;
}

const actionLog: HealerAction[] = [];

// ─── Core Loop ───

let healerRunning = false;
let healerInterval: NodeJS.Timeout | null = null;
let runCount = 0;

export async function runHealerCycle(): Promise<HealerAction[]> {
  if (healerRunning) {
    console.log("[Healer] Cycle already running, skipping");
    return [];
  }

  healerRunning = true;
  runCount++;
  const cycleActions: HealerAction[] = [];
  const cycleStart = Date.now();

  console.log(`[Healer] ═══ Autonomous cycle #${runCount} starting ═══`);

  try {
    // ─── STEP 1: DETECT ───
    const streams = await db
      .select({
        streamId: dataStreamRegistry.streamId,
        streamName: dataStreamRegistry.streamName,
        apiUrl: dataStreamRegistry.apiUrl,
        sourceUrl: dataStreamRegistry.sourceUrl,
        source: dataStreamRegistry.source,
        enabled: dataStreamRegistry.enabled,
        autoDisabled: dataStreamRegistry.autoDisabled,
        consecutiveFailures: dataStreamRegistry.consecutiveFailures,
        failureCount: dataStreamRegistry.failureCount,
        lastErrorType: dataStreamRegistry.lastErrorType,
        lastErrorMessage: dataStreamRegistry.lastErrorMessage,
        lastHttpStatus: dataStreamRegistry.lastHttpStatus,
        recordsIngested: dataStreamRegistry.recordsIngested,
        fieldMapping: dataStreamRegistry.fieldMapping,
      })
      .from(dataStreamRegistry);

    // Filter to streams that need healing
    const needsHealing = streams.filter((s: any) => {
      if (s.autoDisabled) return true;
      if (s.consecutiveFailures > 0 && s.enabled) return true;
      if (s.lastErrorType && s.enabled) return true;
      return false;
    });

    if (needsHealing.length === 0) {
      console.log("[Healer] No streams need healing. All clear.");
      return [];
    }

    console.log(`[Healer] DETECT: ${needsHealing.length} stream(s) need attention`);

    // ─── STEP 2-4: DIAGNOSE → FIX → RE-RUN ───
    for (const stream of needsHealing) {
      const streamRow = stream as unknown as StreamRow;

      // DIAGNOSE: Run rules
      let fix: StreamFix | null = null;
      for (const rule of diagnosisRules) {
        fix = rule(streamRow);
        if (fix) break;
      }

      if (!fix) {
        console.log(`[Healer] No fix available for ${stream.streamId} (error: ${stream.lastErrorType})`);
        continue;
      }

      // SAFETY CHECK: Validate fix does not touch forbidden fields
      try {
        validateFix(fix);
      } catch (safetyErr: any) {
        console.error(`[Healer] ${safetyErr.message}`);
        cycleActions.push({
          timestamp: Date.now(),
          streamId: fix.streamId,
          phase: "safety_block",
          description: safetyErr.message,
          beforeState: { apiUrl: stream.apiUrl, source: stream.source },
          success: false,
          error: safetyErr.message,
        });
        continue;
      }

      // Record before state
      const beforeState: Record<string, any> = {
        apiUrl: stream.apiUrl,
        source: stream.source,
        consecutiveFailures: stream.consecutiveFailures,
        lastErrorType: stream.lastErrorType,
        recordsIngested: stream.recordsIngested,
        autoDisabled: stream.autoDisabled,
      };

      console.log(`[Healer] DIAGNOSE: ${stream.streamId} → ${fix.description}`);

      // FIX: Apply the database update
      try {
        const setValues: Record<string, any> = { updatedAt: Date.now() };
        for (const [key, value] of Object.entries(fix.updates)) {
          switch (key) {
            case "enabled": setValues.enabled = value; break;
            case "autoDisabled": setValues.autoDisabled = value; break;
            case "disabledReason": setValues.disabledReason = value; break;
            case "consecutiveFailures": setValues.consecutiveFailures = value; break;
            case "failureCount": setValues.failureCount = value; break;
            case "retryAfterAt": setValues.retryAfterAt = value; break;
            case "lastErrorType": setValues.lastErrorType = value; break;
            case "lastErrorMessage": setValues.lastErrorMessage = value; break;
            default:
              // Unknown field — skip it, do not apply
              console.warn(`[Healer] Skipping unknown field "${key}" in fix for ${fix.streamId}`);
              break;
          }
        }

        await db
          .update(dataStreamRegistry)
          .set(setValues)
          .where(eq(dataStreamRegistry.streamId, fix.streamId));

        console.log(`[Healer] FIX: Applied update to ${fix.streamId}`);

        // Log to admin change log
        await db.insert(adminChangeLog).values({
          adminId: "sunam-healer",
          actionType: "config_change",
          targetSystem: "data_stream_registry",
          targetId: fix.streamId,
          description: `[AUTONOMOUS] ${fix.description}`,
          previousState: beforeState,
          newState: fix.updates,
          rollbackAvailable: true,
          rollbackData: beforeState,
          timestamp: new Date(),
        });

        cycleActions.push({
          timestamp: Date.now(),
          streamId: fix.streamId,
          phase: "fix",
          description: fix.description,
          beforeState,
          afterState: fix.updates,
          success: true,
        });

      } catch (fixErr: any) {
        console.error(`[Healer] FIX FAILED for ${fix.streamId}:`, fixErr.message);
        cycleActions.push({
          timestamp: Date.now(),
          streamId: fix.streamId,
          phase: "fix",
          description: `Fix failed: ${fixErr.message}`,
          beforeState,
          success: false,
          error: fixErr.message,
        });
        continue;
      }

      // RE-RUN: Only if the fix explicitly allows it
      if (fix.triggerRerun) {
        console.log(`[Healer] RE-RUN: Triggering ingestion for ${fix.streamId}`);
        try {
          await resetFailureCounters(fix.streamId);
          const result = await triggerManualIngestion(fix.streamId, 500);

          const afterState = {
            success: result.success,
            recordsProcessed: result.recordsProcessed,
            recordsInserted: result.recordsInserted,
            signalsGenerated: result.signalsGenerated,
            errors: result.errors,
            runId: result.runId,
          };

          console.log(`[Healer] RE-RUN RESULT: ${fix.streamId} → ${result.success ? "SUCCESS" : "FAILED"} (${result.recordsProcessed} records, ${result.signalsGenerated} signals)`);

          cycleActions.push({
            timestamp: Date.now(),
            streamId: fix.streamId,
            phase: "rerun",
            description: result.success
              ? `Ingestion succeeded: ${result.recordsProcessed} records processed, ${result.recordsInserted} inserted, ${result.signalsGenerated} signals`
              : `Ingestion failed: ${result.errors.join("; ")}`,
            beforeState: { recordsIngested: beforeState.recordsIngested },
            afterState,
            success: result.success,
            error: result.success ? undefined : result.errors[0],
          });

          // Log re-run result
          await db.insert(adminChangeLog).values({
            adminId: "sunam-healer",
            actionType: "stream_run",
            targetSystem: "ingestion",
            targetId: fix.streamId,
            description: `[AUTONOMOUS] Re-run after fix: ${result.success ? `${result.recordsProcessed} records, ${result.signalsGenerated} signals` : `FAILED: ${result.errors[0]}`}`,
            newState: afterState,
            rollbackAvailable: false,
            timestamp: new Date(),
          });

        } catch (runErr: any) {
          console.error(`[Healer] RE-RUN FAILED for ${fix.streamId}:`, runErr.message);
          cycleActions.push({
            timestamp: Date.now(),
            streamId: fix.streamId,
            phase: "rerun",
            description: `Re-run failed: ${runErr.message}`,
            beforeState: { recordsIngested: beforeState.recordsIngested },
            success: false,
            error: runErr.message,
          });
        }
      }
    }

  } catch (err: any) {
    console.error(`[Healer] Cycle error:`, err.message);
  } finally {
    healerRunning = false;
    const elapsed = Date.now() - cycleStart;
    console.log(`[Healer] ═══ Cycle #${runCount} complete: ${cycleActions.length} actions in ${elapsed}ms ═══`);
    actionLog.push(...cycleActions);
  }

  return cycleActions;
}

// ─── Start/Stop ───

const HEALER_INTERVAL_MS = 60_000; // 60 seconds

export function startHealer(): void {
  if (healerInterval) {
    console.log("[Healer] Already running");
    return;
  }

  console.log(`[Healer] Starting autonomous healer (interval: ${HEALER_INTERVAL_MS / 1000}s)`);

  // Run first cycle immediately
  runHealerCycle().catch(err => console.error("[Healer] Initial cycle error:", err));

  // Then run on interval
  healerInterval = setInterval(() => {
    runHealerCycle().catch(err => console.error("[Healer] Cycle error:", err));
  }, HEALER_INTERVAL_MS);
}

export function stopHealer(): void {
  if (healerInterval) {
    clearInterval(healerInterval);
    healerInterval = null;
    console.log("[Healer] Stopped");
  }
}

export function getHealerStatus(): {
  running: boolean;
  cycleCount: number;
  totalActions: number;
  recentActions: HealerAction[];
} {
  return {
    running: !!healerInterval,
    cycleCount: runCount,
    totalActions: actionLog.length,
    recentActions: actionLog.slice(-20),
  };
}

export function getHealerLog(): HealerAction[] {
  return [...actionLog];
}

/**
 * DETERMINISM CHECK WORKER
 * 
 * Continuously verifies that interpretation-service remains deterministic.
 * 
 * SCHEDULE:
 * - Every 10 minutes (continuous)
 * - On new case ingestion
 * - On snapshot creation
 * 
 * SCOPE:
 * - Rolling window sampling of cases with snapshots
 * - Verify same snapshot + same input = same output
 * - Detect drift in interpretation output
 * 
 * VIOLATIONS:
 * - CRITICAL: Determinism failure (blocks interpretation)
 * - HIGH: Snapshot binding issues
 * - WARNING: Ordering instability
 */

import { db } from "../db";
import {
  interpretCase,
  verifyInterpretationDeterminism,
  CaseInterpretationOutput,
} from "../services/interpretation-service";
import { computeCanonicalHash } from "../lib/determinism";

const WORKER_NAME = "determinismCheckWorker";
const SAMPLE_SIZE = 5; // Sample 5 cases per cycle
const DETERMINISM_TOLERANCE = 0; // Zero tolerance for non-determinism

// Rolling window state (in-memory, reset on restart)
let lastCheckedCaseId = 0;
const interpretationCache = new Map<number, { hash: string; timestamp: number }>();

// ============================================================================
// MAIN WORKER FUNCTION
// ============================================================================

export async function runDeterminismCheckWorker(): Promise<void> {
  console.log(`[${WORKER_NAME}] Starting determinism check cycle...`);

  try {
    // Step 1: Get sample of cases with snapshots
    const casesToCheck = await getSampleCasesWithSnapshots(SAMPLE_SIZE);

    if (casesToCheck.length === 0) {
      console.log(`[${WORKER_NAME}] No cases with snapshots to check, skipping cycle`);
      return;
    }

    console.log(`[${WORKER_NAME}] Checking determinism for ${casesToCheck.length} cases...`);

    // Step 2: Verify determinism for each case
    const results: DeterminismCheckResult[] = [];
    for (const caseId of casesToCheck) {
      try {
        const result = await checkDeterminism(caseId);
        results.push(result);

        // Store result
        await storeDeterminismCheckResult(result);

        // Handle violations
        if (!result.passed) {
          await handleDeterminismViolation(caseId, result);
        }
      } catch (error) {
        console.error(`[${WORKER_NAME}] Error checking case ${caseId}:`, error);
        await logWorkerError(caseId, error);
      }
    }

    // Step 3: Aggregate results
    const passed = results.filter((r) => r.passed).length;
    const total = results.length;

    console.log(`[${WORKER_NAME}] Cycle complete: ${passed}/${total} cases verified as deterministic`);

    // Step 4: Update metrics
    await updateDeterminismMetrics(results);
  } catch (error) {
    console.error(`[${WORKER_NAME}] Fatal error:`, error);
    await logWorkerError(null, error);
  }
}

// ============================================================================
// DETERMINISM CHECK
// ============================================================================

export type DeterminismCheckResult = {
  caseId: number;
  snapshotHash: string;
  passed: boolean;
  run1Hash: string;
  run2Hash: string;
  hashMatch: boolean;
  outputMatch: boolean;
  cachedHashMatch: boolean;
  details: string;
  timestamp: number;
};

async function checkDeterminism(caseId: number): Promise<DeterminismCheckResult> {
  try {
    // Step 1: Get snapshot hash
    const snapshotResult = await db.execute(
      `SELECT snapshot_hash FROM corpus_snapshots WHERE case_id = ? ORDER BY snapshot_timestamp DESC LIMIT 1`,
      [caseId]
    );

    if (!snapshotResult || snapshotResult.length === 0) {
      return {
        caseId,
        snapshotHash: "unknown",
        passed: false,
        run1Hash: "",
        run2Hash: "",
        hashMatch: false,
        outputMatch: false,
        cachedHashMatch: false,
        details: "No snapshot found for case",
        timestamp: Date.now(),
      };
    }

    const snapshotHash = snapshotResult[0]?.snapshot_hash;

    // Step 2: Run interpretation twice
    const output1 = await interpretCase(caseId);
    const output2 = await interpretCase(caseId);

    // Step 3: Compute hashes
    const run1Hash = computeCanonicalHash(output1);
    const run2Hash = computeCanonicalHash(output2);

    // Step 4: Check hash match
    const hashMatch = run1Hash === run2Hash;

    // Step 5: Check cached hash match
    const cached = interpretationCache.get(caseId);
    const cachedHashMatch = cached ? cached.hash === run1Hash : true; // True if no cache (first run)

    // Step 6: Verify output structure match
    const outputMatch = JSON.stringify(output1) === JSON.stringify(output2);

    // Step 7: Update cache
    interpretationCache.set(caseId, {
      hash: run1Hash,
      timestamp: Date.now(),
    });

    // Clean old cache entries (keep last 100)
    if (interpretationCache.size > 100) {
      const entries = Array.from(interpretationCache.entries());
      const sorted = entries.sort((a, b) => b[1].timestamp - a[1].timestamp);
      const toDelete = sorted.slice(100);
      for (const [key] of toDelete) {
        interpretationCache.delete(key);
      }
    }

    const passed = hashMatch && cachedHashMatch && outputMatch;

    return {
      caseId,
      snapshotHash,
      passed,
      run1Hash: run1Hash.slice(0, 16),
      run2Hash: run2Hash.slice(0, 16),
      hashMatch,
      outputMatch,
      cachedHashMatch,
      details: passed
        ? `✅ Determinism verified: ${run1Hash.slice(0, 8)}...`
        : `❌ Determinism failed: run1=${run1Hash.slice(0, 8)}..., run2=${run2Hash.slice(0, 8)}..., cached=${cached?.hash.slice(0, 8) || "none"}...`,
      timestamp: Date.now(),
    };
  } catch (error) {
    return {
      caseId,
      snapshotHash: "error",
      passed: false,
      run1Hash: "",
      run2Hash: "",
      hashMatch: false,
      outputMatch: false,
      cachedHashMatch: false,
      details: `Error: ${error instanceof Error ? error.message : String(error)}`,
      timestamp: Date.now(),
    };
  }
}

// ============================================================================
// CASE SAMPLING (WITH SNAPSHOTS)
// ============================================================================

async function getSampleCasesWithSnapshots(sampleSize: number): Promise<number[]> {
  try {
    // Get cases with recent snapshots
    const cases = await db.execute(
      `SELECT DISTINCT case_id FROM corpus_snapshots 
       WHERE case_id > ? 
       ORDER BY snapshot_timestamp DESC 
       LIMIT ?`,
      [lastCheckedCaseId, sampleSize]
    );

    const caseIds = cases.map((c) => c.case_id);

    // Update rolling window
    if (caseIds.length > 0) {
      lastCheckedCaseId = Math.max(...caseIds);
    }

    return caseIds;
  } catch (error) {
    console.error(`[${WORKER_NAME}] Error getting sample cases:`, error);
    return [];
  }
}

// ============================================================================
// VIOLATION HANDLING
// ============================================================================

async function handleDeterminismViolation(caseId: number, result: DeterminismCheckResult): Promise<void> {
  console.error(`[${WORKER_NAME}] DETERMINISM VIOLATION for case ${caseId}:`, result);

  // This is CRITICAL — interpretation must be deterministic
  // Block further interpretation until issue is resolved

  try {
    // Log to admin_change_log
    await db.execute(
      `INSERT INTO admin_change_log (change_type, change_description, changed_at, severity) VALUES (?, ?, ?, ?)`,
      [
        "determinism_violation",
        JSON.stringify({
          caseId,
          run1Hash: result.run1Hash,
          run2Hash: result.run2Hash,
          hashMatch: result.hashMatch,
          outputMatch: result.outputMatch,
          cachedHashMatch: result.cachedHashMatch,
          details: result.details,
        }),
        result.timestamp,
        "critical",
      ]
    );

    // Log to constitutional_test_runs
    await db.execute(
      `INSERT INTO constitutional_test_runs (test_type, test_status, test_details, run_at) VALUES (?, ?, ?, ?)`,
      [
        "Determinism Check",
        "failed",
        JSON.stringify(result),
        result.timestamp,
      ]
    );

    // Block interpretation on this case
    await db.execute(
      `UPDATE cases SET status = 'blocked' WHERE id = ?`,
      [caseId]
    );

    console.error(`[${WORKER_NAME}] Case ${caseId} BLOCKED due to determinism violation`);
  } catch (error) {
    console.error(`[${WORKER_NAME}] Error handling determinism violation:`, error);
  }
}

// ============================================================================
// METRICS & HEALTH UPDATES
// ============================================================================

async function updateDeterminismMetrics(results: DeterminismCheckResult[]): Promise<void> {
  try {
    const passed = results.filter((r) => r.passed).length;
    const total = results.length;
    const passRate = total > 0 ? (passed / total) * 100 : 0;

    await db.execute(
      `INSERT INTO system_health (health_check_type, status, last_check, details) VALUES (?, ?, ?, ?)`,
      [
        "determinism_check",
        passRate === 100 ? "healthy" : passRate >= 90 ? "degraded" : "failed",
        Date.now(),
        JSON.stringify({
          totalCases: total,
          passedCases: passed,
          failedCases: total - passed,
          passRate: passRate.toFixed(2) + "%",
          cacheSize: interpretationCache.size,
        }),
      ]
    );
  } catch (error) {
    console.error(`[${WORKER_NAME}] Error updating metrics:`, error);
  }
}

// ============================================================================
// STORAGE
// ============================================================================

async function storeDeterminismCheckResult(result: DeterminismCheckResult): Promise<void> {
  try {
    await db.execute(
      `INSERT INTO constitutional_test_runs (test_type, test_status, test_details, run_at) VALUES (?, ?, ?, ?)`,
      [
        "Determinism Check",
        result.passed ? "passed" : "failed",
        JSON.stringify(result),
        result.timestamp,
      ]
    );
  } catch (error) {
    console.error(`[${WORKER_NAME}] Error storing result:`, error);
  }
}

// ============================================================================
// ERROR LOGGING
// ============================================================================

async function logWorkerError(caseId: number | null, error: unknown): Promise<void> {
  try {
    await db.execute(
      `INSERT INTO admin_change_log (change_type, change_description, changed_at, severity) VALUES (?, ?, ?, ?)`,
      [
        "worker_error",
        JSON.stringify({
          worker: WORKER_NAME,
          caseId,
          error: error instanceof Error ? error.message : String(error),
        }),
        new Date(),
        "warning",
      ]
    );
  } catch (err) {
    console.error(`[${WORKER_NAME}] Error logging worker error:`, err);
  }
}

// ============================================================================
// EXPORT FOR SCHEDULING
// ============================================================================

export const workerConfig = {
  name: WORKER_NAME,
  schedule: "*/10 * * * *", // Every 10 minutes
  triggers: ["case_ingestion", "snapshot_creation"],
  handler: runDeterminismCheckWorker,
};

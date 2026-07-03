/**
 * CONSTITUTIONAL GUARD WORKER
 * 
 * Continuously monitors system integrity by running constitutional tests.
 * 
 * SCHEDULE:
 * - Every 5 minutes (continuous)
 * - On service startup
 * - On schema migration
 * - On deployment
 * 
 * SCOPE:
 * - Rolling window sampling of active cases
 * - Priority: recently modified, with signals, with actions, with contradictions
 * - Non-blocking, indexed queries only
 * 
 * VIOLATIONS:
 * - CRITICAL: Block actions/exports, emit immediate alert
 * - HIGH: Log, surface to Sovereign Control
 * - WARNING: Track, update metrics
 */

import { db } from "../db";
import {
  runAllConstitutionalTests,
  storeConstitutionalTestResults,
  ConstitutionalTestReport,
  TestViolation,
} from "../services/constitutional-test-service";

const WORKER_NAME = "constitutionalGuardWorker";
const SAMPLE_SIZE = 10; // Sample 10 cases per cycle
const CRITICAL_VIOLATION_THRESHOLD = 1; // Block on any CRITICAL violation

// Rolling window state (in-memory, reset on restart)
let lastSampledCaseId = 0;

// ============================================================================
// MAIN WORKER FUNCTION
// ============================================================================

export async function runConstitutionalGuardWorker(): Promise<void> {
  console.log(`[${WORKER_NAME}] Starting constitutional guard cycle...`);

  try {
    // Step 1: Get sample of cases to test
    const casesToTest = await getSampleCases(SAMPLE_SIZE);

    if (casesToTest.length === 0) {
      console.log(`[${WORKER_NAME}] No cases to test, skipping cycle`);
      return;
    }

    console.log(`[${WORKER_NAME}] Testing ${casesToTest.length} cases...`);

    // Step 2: Run constitutional tests on each case
    const allReports: ConstitutionalTestReport[] = [];
    for (const caseId of casesToTest) {
      try {
        const report = await runAllConstitutionalTests(caseId);
        allReports.push(report);

        // Store results immediately
        await storeConstitutionalTestResults(report);

        // Check for CRITICAL violations
        if (report.criticalViolations.length > 0) {
          await handleCriticalViolations(caseId, report.criticalViolations);
        }

        // Check for HIGH violations
        if (report.highViolations.length > 0) {
          await handleHighViolations(caseId, report.highViolations);
        }

        // Check for warnings
        if (report.warnings.length > 0) {
          await handleWarnings(caseId, report.warnings);
        }
      } catch (error) {
        console.error(`[${WORKER_NAME}] Error testing case ${caseId}:`, error);
        await logWorkerError(caseId, error);
      }
    }

    // Step 3: Aggregate results and update metrics
    const aggregatedReport = aggregateReports(allReports);
    await updateSystemHealth(aggregatedReport);

    // Step 4: Surface violations to Sovereign Control
    if (aggregatedReport.criticalViolations.length > 0) {
      await escalateToSovereignControl(aggregatedReport);
    }

    console.log(
      `[${WORKER_NAME}] Cycle complete: ${aggregatedReport.passedTests}/${aggregatedReport.totalTests} tests passed, ${aggregatedReport.criticalViolations.length} CRITICAL violations`
    );
  } catch (error) {
    console.error(`[${WORKER_NAME}] Fatal error:`, error);
    await logWorkerError(null, error);
  }
}

// ============================================================================
// CASE SAMPLING (ROLLING WINDOW, PRIORITY-BASED)
// ============================================================================

async function getSampleCases(sampleSize: number): Promise<number[]> {
  try {
    // Priority 1: Recently modified cases
    const recentCases = await db.execute(
      `SELECT id FROM cases 
       WHERE id > ? 
       ORDER BY updated_at DESC 
       LIMIT ?`,
      [lastSampledCaseId, Math.ceil(sampleSize * 0.4)]
    );

    // Priority 2: Cases with signals
    const signalCases = await db.execute(
      `SELECT DISTINCT case_id as id FROM signal_flags 
       WHERE case_id > ? 
       ORDER BY created_at DESC 
       LIMIT ?`,
      [lastSampledCaseId, Math.ceil(sampleSize * 0.3)]
    );

    // Priority 3: Cases with available actions
    const actionCases = await db.execute(
      `SELECT DISTINCT case_id as id FROM available_actions 
       WHERE case_id > ? 
       ORDER BY created_at DESC 
       LIMIT ?`,
      [lastSampledCaseId, Math.ceil(sampleSize * 0.2)]
    );

    // Priority 4: Cases with contradictions
    const contradictionCases = await db.execute(
      `SELECT DISTINCT case_id as id FROM contradictions 
       WHERE case_id > ? 
       ORDER BY id DESC 
       LIMIT ?`,
      [lastSampledCaseId, Math.ceil(sampleSize * 0.1)]
    );

    // Combine and deduplicate
    const allCases = [
      ...recentCases,
      ...signalCases,
      ...actionCases,
      ...contradictionCases,
    ];

    const uniqueCases = Array.from(new Set(allCases.map((c) => c.id))).slice(0, sampleSize);

    // Update rolling window
    if (uniqueCases.length > 0) {
      lastSampledCaseId = Math.max(...uniqueCases);
    }

    return uniqueCases;
  } catch (error) {
    console.error(`[${WORKER_NAME}] Error getting sample cases:`, error);
    return [];
  }
}

// ============================================================================
// VIOLATION HANDLING
// ============================================================================

async function handleCriticalViolations(caseId: number, violations: TestViolation[]): Promise<void> {
  console.error(`[${WORKER_NAME}] CRITICAL violations for case ${caseId}:`, violations);

  for (const violation of violations) {
    // Block action creation
    await db.execute(
      `UPDATE available_actions SET requires_action = 0 WHERE case_id = ?`,
      [caseId]
    );

    // Block export generation
    await db.execute(
      `UPDATE case_bundles SET exported_at = NULL WHERE case_id = ? AND exported_at IS NOT NULL`,
      [caseId]
    );

    // Log to admin_change_log
    await db.execute(
      `INSERT INTO admin_change_log (change_type, change_description, changed_at, severity) VALUES (?, ?, ?, ?)`,
      [
        "constitutional_violation_critical",
        JSON.stringify({
          caseId,
          violation: violation.detail,
          test: violation.testName,
        }),
        new Date(),
        "critical",
      ]
    );
  }
}

async function handleHighViolations(caseId: number, violations: TestViolation[]): Promise<void> {
  console.warn(`[${WORKER_NAME}] HIGH violations for case ${caseId}:`, violations);

  for (const violation of violations) {
    // Log to admin_change_log
    await db.execute(
      `INSERT INTO admin_change_log (change_type, change_description, changed_at, severity) VALUES (?, ?, ?, ?)`,
      [
        "constitutional_violation_high",
        JSON.stringify({
          caseId,
          violation: violation.detail,
          test: violation.testName,
        }),
        new Date(),
        "warning",
      ]
    );
  }
}

async function handleWarnings(caseId: number, violations: TestViolation[]): Promise<void> {
  console.log(`[${WORKER_NAME}] Warnings for case ${caseId}:`, violations);

  for (const violation of violations) {
    // Log to admin_change_log
    await db.execute(
      `INSERT INTO admin_change_log (change_type, change_description, changed_at, severity) VALUES (?, ?, ?, ?)`,
      [
        "constitutional_warning",
        JSON.stringify({
          caseId,
          violation: violation.detail,
          test: violation.testName,
        }),
        new Date(),
        "info",
      ]
    );
  }
}

// ============================================================================
// METRICS & HEALTH UPDATES
// ============================================================================

async function updateSystemHealth(report: ConstitutionalTestReport): Promise<void> {
  try {
    const status = report.criticalViolations.length === 0 ? "healthy" : "failed";

    await db.execute(
      `INSERT INTO system_health (health_check_type, status, last_check, details) VALUES (?, ?, ?, ?)`,
      [
        "constitutional_guard",
        status,
        Date.now(),
        JSON.stringify({
          totalTests: report.totalTests,
          passedTests: report.passedTests,
          failedTests: report.failedTests,
          criticalViolations: report.criticalViolations.length,
          highViolations: report.highViolations.length,
          warnings: report.warnings.length,
        }),
      ]
    );
  } catch (error) {
    console.error(`[${WORKER_NAME}] Error updating system health:`, error);
  }
}

async function escalateToSovereignControl(report: ConstitutionalTestReport): Promise<void> {
  try {
    // This would integrate with Sovereign Control / Mission Control
    // For now, just log the escalation
    console.error(
      `[${WORKER_NAME}] ESCALATING TO SOVEREIGN CONTROL: ${report.criticalViolations.length} CRITICAL violations`
    );

    // TODO: Integrate with Sovereign Control API
    // await sovereignControl.alert({
    //   severity: "CRITICAL",
    //   title: "Constitutional Violations Detected",
    //   details: report.criticalViolations,
    // });
  } catch (error) {
    console.error(`[${WORKER_NAME}] Error escalating to Sovereign Control:`, error);
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
// REPORT AGGREGATION
// ============================================================================

function aggregateReports(reports: ConstitutionalTestReport[]): ConstitutionalTestReport {
  const aggregated: ConstitutionalTestReport = {
    passed: true,
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    tests: [],
    violations: [],
    criticalViolations: [],
    highViolations: [],
    warnings: [],
    timestamp: Date.now(),
  };

  for (const report of reports) {
    aggregated.totalTests += report.totalTests;
    aggregated.passedTests += report.passedTests;
    aggregated.failedTests += report.failedTests;
    aggregated.tests.push(...report.tests);
    aggregated.violations.push(...report.violations);
    aggregated.criticalViolations.push(...report.criticalViolations);
    aggregated.highViolations.push(...report.highViolations);
    aggregated.warnings.push(...report.warnings);

    if (!report.passed) {
      aggregated.passed = false;
    }
  }

  return aggregated;
}

// ============================================================================
// EXPORT FOR SCHEDULING
// ============================================================================

export const workerConfig = {
  name: WORKER_NAME,
  schedule: "*/5 * * * *", // Every 5 minutes
  triggers: ["startup", "schema_migration", "deployment"],
  handler: runConstitutionalGuardWorker,
};

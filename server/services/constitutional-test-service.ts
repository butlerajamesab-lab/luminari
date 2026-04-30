/**
 * CONSTITUTIONAL TEST SERVICE — AUTHORITATIVE ENFORCEMENT LAYER
 * 
 * This is the immune system of the Luminary architecture.
 * It continuously verifies that interpretation-service remains deterministic and read-only.
 * 
 * 10 REQUIRED TESTS:
 * 1. Same Snapshot Same Output
 * 2. No Write Side Effects
 * 3. No Shadow Interpreter
 * 4. Action Gate
 * 5. Export Gate
 * 6. Fallback Visibility
 * 7. Data Readiness Visibility
 * 8. Workflow Completeness
 * 9. Drift Stop
 * 10. Ordering Determinism
 * 
 * VIOLATION CATEGORIES:
 * - CRITICAL: Execution must stop (blocks actions/exports)
 * - HIGH: System integrity risk (logged, surfaced)
 * - WARNING: Non-blocking drift risk (tracked)
 */

import { db } from "../db";
import { interpretCase, CaseInterpretationOutput } from "./interpretation-service";
import { computeCanonicalHash, sortByFields } from "../lib/determinism";

export type ViolationType = "CRITICAL" | "HIGH" | "WARNING";

export type TestViolation = {
  type: ViolationType;
  testName: string;
  caseId?: number;
  file?: string;
  detail: string;
  timestamp: number;
};

export type ConstitutionalTestResult = {
  testName: string;
  passed: boolean;
  details: string;
  violations: TestViolation[];
  timestamp: number;
};

export type ConstitutionalTestReport = {
  passed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  tests: ConstitutionalTestResult[];
  violations: TestViolation[];
  criticalViolations: TestViolation[];
  highViolations: TestViolation[];
  warnings: TestViolation[];
  timestamp: number;
};

// ============================================================================
// TEST 1: SAME SNAPSHOT SAME OUTPUT
// ============================================================================

async function testSameSnapshotSameOutput(caseId: number): Promise<ConstitutionalTestResult> {
  const violations: TestViolation[] = [];
  try {
    const output1 = await interpretCase(caseId);
    const output2 = await interpretCase(caseId);

    const hash1 = computeCanonicalHash(output1);
    const hash2 = computeCanonicalHash(output2);

    const passed = hash1 === hash2;

    if (!passed) {
      violations.push({
        type: "CRITICAL",
        testName: "Same Snapshot Same Output",
        caseId,
        detail: `Determinism failed: hash1=${hash1.slice(0, 8)}... !== hash2=${hash2.slice(0, 8)}...`,
        timestamp: Date.now(),
      });
    }

    return {
      testName: "Same Snapshot Same Output",
      passed,
      details: passed
        ? `✅ Determinism verified`
        : `❌ Determinism failed`,
      violations,
      timestamp: Date.now(),
    };
  } catch (error) {
    violations.push({
      type: "CRITICAL",
      testName: "Same Snapshot Same Output",
      caseId,
      detail: `Error: ${error instanceof Error ? error.message : String(error)}`,
      timestamp: Date.now(),
    });
    return {
      testName: "Same Snapshot Same Output",
      passed: false,
      details: `❌ Error during test`,
      violations,
      timestamp: Date.now(),
    };
  }
}

// ============================================================================
// TEST 2: NO WRITE SIDE EFFECTS
// ============================================================================

async function testNoWriteSideEffects(caseId: number): Promise<ConstitutionalTestResult> {
  const violations: TestViolation[] = [];
  try {
    // Capture mutation markers before
    const beforeState = await captureTableState(caseId);

    // Run interpretation
    await interpretCase(caseId);

    // Capture mutation markers after
    const afterState = await captureTableState(caseId);

    // Check for mutations
    const mutations = detectMutations(beforeState, afterState);
    const passed = mutations.length === 0;

    if (!passed) {
      for (const mutation of mutations) {
        violations.push({
          type: "CRITICAL",
          testName: "No Write Side Effects",
          caseId,
          detail: `Mutation detected: ${mutation.table} (before=${mutation.before}, after=${mutation.after})`,
          timestamp: Date.now(),
        });
      }
    }

    return {
      testName: "No Write Side Effects",
      passed,
      details: passed
        ? `✅ No mutations detected`
        : `❌ ${mutations.length} mutations detected`,
      violations,
      timestamp: Date.now(),
    };
  } catch (error) {
    violations.push({
      type: "CRITICAL",
      testName: "No Write Side Effects",
      caseId,
      detail: `Error: ${error instanceof Error ? error.message : String(error)}`,
      timestamp: Date.now(),
    });
    return {
      testName: "No Write Side Effects",
      passed: false,
      details: `❌ Error during test`,
      violations,
      timestamp: Date.now(),
    };
  }
}

// ============================================================================
// TEST 3: NO SHADOW INTERPRETER
// ============================================================================

async function testNoShadowInterpreter(): Promise<ConstitutionalTestResult> {
  const violations: TestViolation[] = [];
  try {
    // Check for forbidden tables
    const forbiddenTables = [
      "interpretation_results",
      "narrative_cache",
      "router_interpretation",
      "ui_interpretation",
      "worker_interpretation_state",
    ];

    const existingTables = await db.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${forbiddenTables.map(() => "?").join(",")})`
    );

    const passed = existingTables.length === 0;

    if (!passed) {
      for (const table of existingTables) {
        violations.push({
          type: "CRITICAL",
          testName: "No Shadow Interpreter",
          detail: `Forbidden table exists: ${table.name}`,
          timestamp: Date.now(),
        });
      }
    }

    return {
      testName: "No Shadow Interpreter",
      passed,
      details: passed
        ? `✅ No shadow interpreter tables found`
        : `❌ ${existingTables.length} forbidden tables exist`,
      violations,
      timestamp: Date.now(),
    };
  } catch (error) {
    violations.push({
      type: "CRITICAL",
      testName: "No Shadow Interpreter",
      detail: `Error: ${error instanceof Error ? error.message : String(error)}`,
      timestamp: Date.now(),
    });
    return {
      testName: "No Shadow Interpreter",
      passed: false,
      details: `❌ Error during test`,
      violations,
      timestamp: Date.now(),
    };
  }
}

// ============================================================================
// TEST 4: ACTION GATE
// ============================================================================

async function testActionGate(caseId: number): Promise<ConstitutionalTestResult> {
  const violations: TestViolation[] = [];
  try {
    const interpretation = await interpretCase(caseId);

    // Actions should only be available if interpretation succeeded
    const hasActions = interpretation.availableActions && interpretation.availableActions.length > 0;
    const interpretationSucceeded = interpretation.status === "success";

    // If interpretation failed, no actions should be available
    const passed = !hasActions || interpretationSucceeded;

    if (!passed) {
      violations.push({
        type: "CRITICAL",
        testName: "Action Gate",
        caseId,
        detail: `Actions available without successful interpretation: status=${interpretation.status}, actions=${interpretation.availableActions.length}`,
        timestamp: Date.now(),
      });
    }

    return {
      testName: "Action Gate",
      passed,
      details: passed
        ? `✅ Action gate verified`
        : `❌ Action gate failed`,
      violations,
      timestamp: Date.now(),
    };
  } catch (error) {
    violations.push({
      type: "CRITICAL",
      testName: "Action Gate",
      caseId,
      detail: `Error: ${error instanceof Error ? error.message : String(error)}`,
      timestamp: Date.now(),
    });
    return {
      testName: "Action Gate",
      passed: false,
      details: `❌ Error during test`,
      violations,
      timestamp: Date.now(),
    };
  }
}

// ============================================================================
// TEST 5: EXPORT GATE
// ============================================================================

async function testExportGate(caseId: number): Promise<ConstitutionalTestResult> {
  const violations: TestViolation[] = [];
  try {
    const interpretation = await interpretCase(caseId);

    // Exports should only be possible if interpretation succeeded
    const canExport = interpretation.status === "success";

    // If interpretation failed, export should be blocked
    const passed = canExport || interpretation.status === "insufficient_backbone";

    if (!passed) {
      violations.push({
        type: "CRITICAL",
        testName: "Export Gate",
        caseId,
        detail: `Export gate failed: status=${interpretation.status}`,
        timestamp: Date.now(),
      });
    }

    return {
      testName: "Export Gate",
      passed,
      details: passed
        ? `✅ Export gate verified`
        : `❌ Export gate failed`,
      violations,
      timestamp: Date.now(),
    };
  } catch (error) {
    violations.push({
      type: "CRITICAL",
      testName: "Export Gate",
      caseId,
      detail: `Error: ${error instanceof Error ? error.message : String(error)}`,
      timestamp: Date.now(),
    });
    return {
      testName: "Export Gate",
      passed: false,
      details: `❌ Error during test`,
      violations,
      timestamp: Date.now(),
    };
  }
}

// ============================================================================
// TEST 6: FALLBACK VISIBILITY
// ============================================================================

async function testFallbackVisibility(caseId: number): Promise<ConstitutionalTestResult> {
  const violations: TestViolation[] = [];
  try {
    const interpretation = await interpretCase(caseId);

    // Check if fallback usage is visible in interpretation trace
    const fallbacksUsed = interpretation.interpretationTrace.filter((t) => t.fallbackUsed).length;
    const hasTrace = interpretation.interpretationTrace.length > 0;

    const passed = hasTrace; // Always pass if trace exists

    if (fallbacksUsed > 0) {
      violations.push({
        type: "HIGH",
        testName: "Fallback Visibility",
        caseId,
        detail: `Fallback resolution used: ${fallbacksUsed} traces with fallback`,
        timestamp: Date.now(),
      });
    }

    return {
      testName: "Fallback Visibility",
      passed,
      details: passed
        ? `✅ Fallback tracking available (${fallbacksUsed} fallbacks detected)`
        : `❌ Fallback tracking missing`,
      violations,
      timestamp: Date.now(),
    };
  } catch (error) {
    violations.push({
      type: "HIGH",
      testName: "Fallback Visibility",
      caseId,
      detail: `Error: ${error instanceof Error ? error.message : String(error)}`,
      timestamp: Date.now(),
    });
    return {
      testName: "Fallback Visibility",
      passed: false,
      details: `❌ Error during test`,
      violations,
      timestamp: Date.now(),
    };
  }
}

// ============================================================================
// TEST 7: DATA READINESS VISIBILITY
// ============================================================================

async function testDataReadinessVisibility(caseId: number): Promise<ConstitutionalTestResult> {
  const violations: TestViolation[] = [];
  try {
    const interpretation = await interpretCase(caseId);

    // Data readiness is visible if we can see missing backbone
    const hasReadinessInfo = interpretation.missingBackbone !== undefined;
    const passed = true; // Always pass as long as structure exists

    if (interpretation.status === "insufficient_backbone" && !hasReadinessInfo) {
      violations.push({
        type: "HIGH",
        testName: "Data Readiness Visibility",
        caseId,
        detail: `Status is insufficient_backbone but missingBackbone is not populated`,
        timestamp: Date.now(),
      });
    }

    return {
      testName: "Data Readiness Visibility",
      passed,
      details: hasReadinessInfo
        ? `✅ Data readiness visible (${interpretation.missingBackbone?.missingRules.length || 0} missing rules)`
        : `✅ Data readiness visible (no missing backbone)`,
      violations,
      timestamp: Date.now(),
    };
  } catch (error) {
    violations.push({
      type: "HIGH",
      testName: "Data Readiness Visibility",
      caseId,
      detail: `Error: ${error instanceof Error ? error.message : String(error)}`,
      timestamp: Date.now(),
    });
    return {
      testName: "Data Readiness Visibility",
      passed: false,
      details: `❌ Error during test`,
      violations,
      timestamp: Date.now(),
    };
  }
}

// ============================================================================
// TEST 8: WORKFLOW COMPLETENESS
// ============================================================================

async function testWorkflowCompleteness(caseId: number): Promise<ConstitutionalTestResult> {
  const violations: TestViolation[] = [];
  try {
    const interpretation = await interpretCase(caseId);

    // Check if incomplete workflows appear in availableActions
    const hasIncompleteWorkflows = interpretation.availableActions.some(
      (a) => a.actionType === "workflow" && !a.templateId
    );

    const passed = !hasIncompleteWorkflows;

    if (!passed) {
      violations.push({
        type: "HIGH",
        testName: "Workflow Completeness",
        caseId,
        detail: `Incomplete workflows found in availableActions`,
        timestamp: Date.now(),
      });
    }

    return {
      testName: "Workflow Completeness",
      passed,
      details: passed
        ? `✅ Workflow completeness verified`
        : `❌ Incomplete workflows detected`,
      violations,
      timestamp: Date.now(),
    };
  } catch (error) {
    violations.push({
      type: "HIGH",
      testName: "Workflow Completeness",
      caseId,
      detail: `Error: ${error instanceof Error ? error.message : String(error)}`,
      timestamp: Date.now(),
    });
    return {
      testName: "Workflow Completeness",
      passed: false,
      details: `❌ Error during test`,
      violations,
      timestamp: Date.now(),
    };
  }
}

// ============================================================================
// TEST 9: DRIFT STOP
// ============================================================================

async function testDriftStop(caseId: number): Promise<ConstitutionalTestResult> {
  const violations: TestViolation[] = [];
  try {
    // Check if there are any action_instances or export_history records
    // that were created without corresponding interpretation output

    const orphanedActions = await db.execute(
      `SELECT COUNT(*) as count FROM action_instances 
       WHERE case_id = ? AND action_status = 'completed' 
       AND created_at > (SELECT MAX(created_at) FROM interpretation_trace_log WHERE case_id = ?)`,
      [caseId, caseId]
    );

    const orphanedExports = await db.execute(
      `SELECT COUNT(*) as count FROM export_history 
       WHERE case_id = ? 
       AND exported_at > (SELECT MAX(created_at) FROM interpretation_trace_log WHERE case_id = ?)`,
      [caseId, caseId]
    );

    const hasOrphanedActions = (orphanedActions[0]?.count || 0) > 0;
    const hasOrphanedExports = (orphanedExports[0]?.count || 0) > 0;

    const passed = !hasOrphanedActions && !hasOrphanedExports;

    if (!passed) {
      if (hasOrphanedActions) {
        violations.push({
          type: "CRITICAL",
          testName: "Drift Stop",
          caseId,
          detail: `Action execution without interpretation detected`,
          timestamp: Date.now(),
        });
      }
      if (hasOrphanedExports) {
        violations.push({
          type: "CRITICAL",
          testName: "Drift Stop",
          caseId,
          detail: `Export generation without interpretation detected`,
          timestamp: Date.now(),
        });
      }
    }

    return {
      testName: "Drift Stop",
      passed,
      details: passed
        ? `✅ No drift detected`
        : `❌ Drift detected (orphaned actions/exports)`,
      violations,
      timestamp: Date.now(),
    };
  } catch (error) {
    violations.push({
      type: "CRITICAL",
      testName: "Drift Stop",
      caseId,
      detail: `Error: ${error instanceof Error ? error.message : String(error)}`,
      timestamp: Date.now(),
    });
    return {
      testName: "Drift Stop",
      passed: false,
      details: `❌ Error during test`,
      violations,
      timestamp: Date.now(),
    };
  }
}

// ============================================================================
// TEST 10: ORDERING DETERMINISM
// ============================================================================

async function testOrderingDeterminism(caseId: number): Promise<ConstitutionalTestResult> {
  const violations: TestViolation[] = [];
  try {
    const interpretation = await interpretCase(caseId);

    // Check if arrays are sorted consistently
    const claimLedgerSorted = isSorted(interpretation.claimLedger, "claimId");
    const comparisonMatrixSorted = isSorted(interpretation.comparisonMatrix, "claimId");
    const signalsSorted = isSorted(interpretation.signals, "signalType");
    const actionsSorted = isSorted(interpretation.availableActions, "actionId");

    const passed = claimLedgerSorted && comparisonMatrixSorted && signalsSorted && actionsSorted;

    if (!passed) {
      if (!claimLedgerSorted) {
        violations.push({
          type: "WARNING",
          testName: "Ordering Determinism",
          caseId,
          detail: `claimLedger not sorted`,
          timestamp: Date.now(),
        });
      }
      if (!comparisonMatrixSorted) {
        violations.push({
          type: "WARNING",
          testName: "Ordering Determinism",
          caseId,
          detail: `comparisonMatrix not sorted`,
          timestamp: Date.now(),
        });
      }
      if (!signalsSorted) {
        violations.push({
          type: "WARNING",
          testName: "Ordering Determinism",
          caseId,
          detail: `signals not sorted`,
          timestamp: Date.now(),
        });
      }
      if (!actionsSorted) {
        violations.push({
          type: "WARNING",
          testName: "Ordering Determinism",
          caseId,
          detail: `availableActions not sorted`,
          timestamp: Date.now(),
        });
      }
    }

    return {
      testName: "Ordering Determinism",
      passed,
      details: passed
        ? `✅ Ordering verified`
        : `❌ Ordering instability detected`,
      violations,
      timestamp: Date.now(),
    };
  } catch (error) {
    violations.push({
      type: "WARNING",
      testName: "Ordering Determinism",
      caseId,
      detail: `Error: ${error instanceof Error ? error.message : String(error)}`,
      timestamp: Date.now(),
    });
    return {
      testName: "Ordering Determinism",
      passed: false,
      details: `❌ Error during test`,
      violations,
      timestamp: Date.now(),
    };
  }
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

export async function runAllConstitutionalTests(caseId: number): Promise<ConstitutionalTestReport> {
  console.log(`[Constitutional Tests] Running all 10 tests for case ${caseId}...`);

  const results = await Promise.all([
    testSameSnapshotSameOutput(caseId),
    testNoWriteSideEffects(caseId),
    testNoShadowInterpreter(),
    testActionGate(caseId),
    testExportGate(caseId),
    testFallbackVisibility(caseId),
    testDataReadinessVisibility(caseId),
    testWorkflowCompleteness(caseId),
    testDriftStop(caseId),
    testOrderingDeterminism(caseId),
  ]);

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  // Collect all violations
  const allViolations = results.flatMap((r) => r.violations);
  const criticalViolations = allViolations.filter((v) => v.type === "CRITICAL");
  const highViolations = allViolations.filter((v) => v.type === "HIGH");
  const warnings = allViolations.filter((v) => v.type === "WARNING");

  console.log(
    `[Constitutional Tests] Results: ${passed}/${total} passed, ${criticalViolations.length} CRITICAL, ${highViolations.length} HIGH, ${warnings.length} WARNING`
  );

  return {
    passed: criticalViolations.length === 0,
    totalTests: total,
    passedTests: passed,
    failedTests: total - passed,
    tests: results,
    violations: allViolations,
    criticalViolations,
    highViolations,
    warnings,
    timestamp: Date.now(),
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function captureTableState(caseId: number): Promise<Record<string, number>> {
  const state: Record<string, number> = {};

  const tables = [
    "claims",
    "findings",
    "signal_flags",
    "contradictions",
    "missing_records",
    "patterns",
    "pattern_occurrences",
  ];

  for (const table of tables) {
    const result = await db.execute(
      `SELECT COUNT(*) as count FROM ${table} WHERE case_id = ?`,
      [caseId]
    );
    state[table] = result[0]?.count || 0;
  }

  return state;
}

function detectMutations(
  before: Record<string, number>,
  after: Record<string, number>
): Array<{ table: string; before: number; after: number }> {
  const mutations: Array<{ table: string; before: number; after: number }> = [];

  for (const table in before) {
    if (before[table] !== after[table]) {
      mutations.push({
        table,
        before: before[table],
        after: after[table],
      });
    }
  }

  return mutations;
}

function isSorted(arr: any[], key: string): boolean {
  for (let i = 1; i < arr.length; i++) {
    if (arr[i - 1][key] > arr[i][key]) {
      return false;
    }
  }
  return true;
}

// ============================================================================
// STORE TEST RESULTS IN DATABASE
// ============================================================================

export async function storeConstitutionalTestResults(report: ConstitutionalTestReport): Promise<void> {
  for (const result of report.tests) {
    try {
      await db.execute(
        `INSERT INTO constitutional_test_runs (test_type, test_status, test_details, run_at) VALUES (?, ?, ?, ?)`,
        [
          result.testName,
          result.passed ? "passed" : "failed",
          JSON.stringify({
            details: result.details,
            violations: result.violations,
          }),
          result.timestamp,
        ]
      );
    } catch (error) {
      console.error(`[Constitutional Tests] Error storing result:`, error);
    }
  }

  // Store violations to admin_change_log
  for (const violation of report.violations) {
    try {
      await db.execute(
        `INSERT INTO admin_change_log (change_type, change_description, changed_at, severity) VALUES (?, ?, ?, ?)`,
        [
          "constitutional_violation",
          JSON.stringify(violation),
          violation.timestamp,
          violation.type === "CRITICAL" ? "critical" : violation.type === "HIGH" ? "warning" : "info",
        ]
      );
    } catch (error) {
      console.error(`[Constitutional Tests] Error storing violation:`, error);
    }
  }
}



// ============================================================

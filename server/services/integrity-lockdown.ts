/**
 * LUMINARI INTEGRITY LOCKDOWN
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs on server startup and on-demand.
 * Validates that every canonical table is populated and every router→table
 * connection is live. Logs a clear PASS / FAIL report and throws on critical
 * failures so the server refuses to start in a broken state.
 *
 * Protocol: Repair before hardening. This file is the gate.
 */

import { pool } from "../db.ts";

// ─── Canonical Table Registry ─────────────────────────────────────────────────
// Every table that must have at least one row for the system to be operational.
// minRows: minimum acceptable row count (0 = table must exist but can be empty)
const CANONICAL_TABLES: Array<{ table: string; minRows: number; critical: boolean }> = [
  // Core legal knowledge
  { table: "legal_statutes",              minRows: 1,   critical: true  },
  { table: "legal_case_law",              minRows: 1,   critical: true  },
  { table: "legal_weak_joints",           minRows: 1,   critical: true  },
  { table: "legal_contradictions",        minRows: 1,   critical: true  },
  { table: "legal_enforcement_records",   minRows: 1,   critical: true  },
  { table: "legal_statute_clauses",       minRows: 1,   critical: true  },
  // Doctrine graph
  { table: "doctrine_registry",           minRows: 1,   critical: true  },
  { table: "doctrine_graph_edges",        minRows: 1,   critical: true  },
  // Enforcement
  { table: "enforcement_penalties",       minRows: 1,   critical: true  },
  { table: "enforcement_viability_rules", minRows: 1,   critical: true  },
  { table: "agency_authority_map",        minRows: 1,   critical: true  },
  { table: "agency_forms",                minRows: 1,   critical: true  },
  // Signals
  { table: "signal_registry",             minRows: 1,   critical: true  },
  { table: "live_signals",                minRows: 1,   critical: true  },
  { table: "detected_signals",            minRows: 0,   critical: false },
  // Procedural engine
  { table: "jurisdiction_hierarchy",      minRows: 1,   critical: true  },
  { table: "workflow_master",             minRows: 1,   critical: true  },
  { table: "workflow_steps",              minRows: 1,   critical: true  },
  { table: "evidence_profiles",           minRows: 1,   critical: true  },
  { table: "escalation_routes",           minRows: 1,   critical: true  },
  { table: "deadline_rules",              minRows: 1,   critical: true  },
  { table: "weak_joint_triggers",         minRows: 1,   critical: true  },
  { table: "claim_detection_rules",       minRows: 1,   critical: true  },
  { table: "node_timeline",               minRows: 1,   critical: true  },
  // Barriers & frameworks
  { table: "litigation_barriers",         minRows: 1,   critical: true  },
  { table: "proof_frameworks",            minRows: 1,   critical: true  },
  { table: "claim_elements",              minRows: 1,   critical: true  },
  // Narrative & filing
  { table: "narrative_templates",         minRows: 1,   critical: true  },
  { table: "filing_generator_templates",  minRows: 1,   critical: true  },
  { table: "investigation_guidance",      minRows: 1,   critical: true  },
  // Interagency
  { table: "interagency_referrals",       minRows: 1,   critical: true  },
  // Contradiction templates
  { table: "contradiction_templates",     minRows: 1,   critical: true  },
  // Guidance
  { table: "agency_guidance",             minRows: 1,   critical: true  },
  // Workflow definitions (signal-to-workflow)
  { table: "workflow_definitions",        minRows: 1,   critical: true  },
  // Ingestion
  { table: "data_stream_registry",        minRows: 1,   critical: true  },
  { table: "ingest_runs",                 minRows: 0,   critical: false },
  // Users & cases (operational — can be empty on fresh deploy)
  { table: "users",                       minRows: 0,   critical: false },
  { table: "cases",                       minRows: 0,   critical: false },
];

export interface IntegrityResult {
  table: string;
  exists: boolean;
  rowCount: number;
  minRows: number;
  critical: boolean;
  pass: boolean;
  note?: string;
}

export interface IntegrityReport {
  timestamp: number;
  totalTables: number;
  passed: number;
  failed: number;
  criticalFailures: number;
  results: IntegrityResult[];
  healthy: boolean;
}

/**
 * Run the full integrity check.
 * @param throwOnCritical - if true, throws an error if any critical table fails.
 */
export async function runIntegrityLockdown(throwOnCritical = false): Promise<IntegrityReport> {
  const results: IntegrityResult[] = [];

  for (const entry of CANONICAL_TABLES) {
    let exists = false;
    let rowCount = 0;
    let note: string | undefined;

    try {
      const [rows] = await pool.query(
        `SELECT COUNT(*) AS cnt FROM \`${entry.table}\``
      ) as any;
      exists = true;
      rowCount = Number(rows[0]?.cnt ?? 0);
    } catch (e: any) {
      exists = false;
      note = e.message?.slice(0, 120);
    }

    const pass = exists && rowCount >= entry.minRows;
    results.push({
      table: entry.table,
      exists,
      rowCount,
      minRows: entry.minRows,
      critical: entry.critical,
      pass,
      note,
    });
  }

  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  const criticalFailures = results.filter(r => !r.pass && r.critical).length;
  const healthy = criticalFailures === 0;

  const report: IntegrityReport = {
    timestamp: Date.now(),
    totalTables: results.length,
    passed,
    failed,
    criticalFailures,
    results,
    healthy,
  };

  // Always log the report
  console.log(`\n╔═══════════════════════════════════════════════════════╗`);
  console.log(`║  LUMINARI INTEGRITY LOCKDOWN — ${new Date(report.timestamp).toISOString()}  ║`);
  console.log(`╚═══════════════════════════════════════════════════════╝`);
  console.log(`  Tables checked : ${report.totalTables}`);
  console.log(`  Passed         : ${report.passed}`);
  console.log(`  Failed         : ${report.failed}`);
  console.log(`  Critical fails : ${report.criticalFailures}`);
  console.log(`  Status         : ${healthy ? "✅ HEALTHY" : "❌ DEGRADED"}`);

  if (failed > 0) {
    console.log(`\n  Failed tables:`);
    for (const r of results.filter(r => !r.pass)) {
      console.log(`    ❌ ${r.table.padEnd(35)} rows=${r.rowCount} min=${r.minRows} critical=${r.critical}${r.note ? ` [${r.note}]` : ""}`);
    }
  }
  console.log("");

  if (throwOnCritical && criticalFailures > 0) {
    throw new Error(
      `[IntegrityLockdown] ${criticalFailures} critical table(s) failed. System cannot start in this state.`
    );
  }

  return report;
}

/**
 * Quick health check — returns true if all critical tables pass.
 */
export async function isSystemHealthy(): Promise<boolean> {
  const report = await runIntegrityLockdown(false);
  return report.healthy;
}

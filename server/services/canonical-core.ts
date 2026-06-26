/**
 * CANONICAL KNOWLEDGE CORE — Central Source of Truth
 *
 * This module defines the canonical knowledge core: the single set of tables
 * that all truth must land in and all modules must read from.
 *
 * Architecture:
 * - WRITE ONCE → LAND IN CORE → READ EVERYWHERE
 * - All pipelines must commit through finalizePipelineRun()
 * - All modules must read through the unified access layer
 * - No shadow truth, no module-local truth, no JSON-as-primary-truth
 *
 * Canonical Entity Map:
 * ┌─────────────────────────────────┬─────────────────────────────────────┐
 * │ Canonical Entity                │ DB Table(s)                         │
 * ├─────────────────────────────────┼─────────────────────────────────────┤
 * │ Jurisdictions                   │ registry_jurisdictions              │
 * │ Programs                        │ registry_programs                   │
 * │ Oversight Bodies / Agencies     │ registry_oversight_bodies           │
 * │ Workflows                       │ registry_workflows                  │
 * │ Signals (raw)                   │ live_signals                        │
 * │ Signals (governed)              │ detected_signals                    │
 * │ Signal Registry (definitions)   │ registry_signals                    │
 * │ Documents                       │ documents                           │
 * │ Entities                        │ entities                            │
 * │ Claims                          │ claims                              │
 * │ Findings                        │ findings                            │
 * │ Patterns                        │ patterns + pattern_occurrences      │
 * │ Legal Statutes                  │ legal_statutes + legal_statute_clauses │
 * │ Case Law                        │ legal_case_law                      │
 * │ Doctrine Registry               │ doctrine_registry                   │
 * │ Proof Frameworks                │ proof_frameworks (empty)            │
 * │ Litigation Barriers             │ litigation_barriers                 │
 * │ Agency Authority                │ agency_authority_map                │
 * │ Enforcement Records             │ legal_enforcement_records           │
 * │ FOIA Requests                   │ foia_requests                       │
 * │ FOIA Statutes                   │ foia_statutes                       │
 * │ FOIA Agencies                   │ foia_agencies                       │
 * │ Cases                           │ cases                               │
 * │ Docket Entries                  │ docket_entries                      │
 * │ Recommendations                 │ (via findings with type=recommendation) │
 * │ Source Traceability              │ registry_source_traceability        │
 * │ Provenance Audit                │ provenance_audit_logs               │
 * │ Pipeline Events                 │ pipeline_events                     │
 * │ Engine Runs                     │ engine_runs                         │
 * │ Ingest Runs                     │ ingest_runs                         │
 * │ Governance Log                  │ governance_log                      │
 * │ Governance Snapshots            │ governance_snapshots                │
 * │ Pattern Outputs                 │ pattern_outputs                     │
 * │ Strategy Outputs                │ strategy_outputs                    │
 * │ Procedural Outputs              │ procedural_outputs                  │
 * │ Activation Outputs              │ activation_outputs                  │
 * │ Lighthouse Jobs                 │ lighthouse_jobs                     │
 * │ Lighthouse Posts                │ lighthouse_posts                    │
 * │ Lighthouse Events               │ lighthouse_events                   │
 * │ Lighthouse Spotlight            │ lighthouse_spotlight                │
 * │ Escalation Registry             │ escalation_registry                 │
 * │ LumenSend Templates             │ lumensend_templates                 │
 * │ LumenSend Drafts                │ lumensend_drafts                    │
 * │ Agency Performance Metrics      │ agency_performance_metrics          │
 * │ Systemic Risk Forecasts         │ systemic_risk_forecasts             │
 * │ Alert Subscriptions             │ alert_subscriptions                 │
 * │ System Map Nodes                │ system_map_nodes                    │
 * │ System Map Edges                │ system_map_edges                    │
 * │ Investigative Queries           │ investigative_queries               │
 * │ Knowledge Entries               │ knowledge_entries (empty)           │
 * │ Knowledge Modules               │ knowledge_modules (empty)           │
 * └─────────────────────────────────┴─────────────────────────────────────┘
 *
 * Source Module → Canonical Destination Map:
 * ┌──────────────────────────────┬──────────────────────────────────────────┐
 * │ Source Module                │ Canonical Destination                    │
 * ├──────────────────────────────┼──────────────────────────────────────────┤
 * │ Canonical Registry Ingest   │ registry_* + live_signals + ingest_runs  │
 * │ Signal Detector             │ live_signals                             │
 * │ Sunam Gate                  │ detected_signals OR extraction_staging   │
 * │ Signal Governance           │ detected_signals                         │
 * │ Pattern Engine              │ patterns + pattern_occurrences           │
 * │ Strategy Engine             │ strategy_outputs                         │
 * │ Viability Engine            │ claim_viability + element_strength       │
 * │ Assembly Engine             │ assembly_* tables                        │
 * │ Case-to-Pattern Pipeline    │ detected_signals + pattern links         │
 * │ Lighthouse                  │ lighthouse_jobs/posts/events/spotlight   │
 * │ Upload Pipeline             │ documents + upload_sessions              │
 * │ Analysis Pipeline           │ findings + entities + claims             │
 * │ Knowledge Ingestion         │ knowledge_entries + knowledge_modules    │
 * │ FOIA Tracker                │ foia_requests                            │
 * │ Docket Room                 │ docket_entries                           │
 * │ LumenSend                   │ lumensend_drafts                         │
 * │ Governance Layer            │ governance_log + governance_snapshots    │
 * └──────────────────────────────┴──────────────────────────────────────────┘
 */

import { db, pool } from "../db";
import { sql } from "drizzle-orm";
// Note: We use raw SQL for inserts to handle schema constraints.
// The drizzle schema is referenced for documentation only.

// ─── Types ───────────────────────────────────────────────────────────────────

export type PipelineSource =
  | "canonical_registry_ingest"
  | "signal_detector"
  | "sunam_gate"
  | "pattern_engine"
  | "trend_engine"
  | "strategy_engine"
  | "viability_engine"
  | "assembly_engine"
  | "activation_engine"
  | "case_to_pattern"
  | "lighthouse"
  | "upload_pipeline"
  | "analysis_pipeline"
  | "knowledge_ingestion"
  | "foia_tracker"
  | "docket_room"
  | "lumensend"
  | "governance";

export type CommitStatus = "success" | "partial" | "failed";

export interface PipelineCommitResult {
  pipelineSource: PipelineSource;
  runId: number | null;
  status: CommitStatus;
  recordsWritten: number;
  canonicalTables: string[];
  errors: string[];
  timestamp: number;
  tracePath: string;
}

export interface CanonicalCommitPayload {
  pipelineSource: PipelineSource;
  /** Human-readable description of what was committed */
  description: string;
  /** Tables that were written to */
  canonicalTables: string[];
  /** Number of records written */
  recordsWritten: number;
  /** Errors encountered (non-fatal) */
  errors?: string[];
  /** Trace path for provenance */
  tracePath?: string;
  /** Optional existing run ID (for ingest_runs) */
  existingRunId?: number;
  /** Optional metadata */
  metadata?: Record<string, any>;
}

// ─── Finalization Layer ──────────────────────────────────────────────────────

/**
 * finalizePipelineRun — THE GLOBAL WRITE CONTRACT
 *
 * Every pipeline must call this after writing canonical records.
 * This function:
 * 1. Validates required fields
 * 2. Normalizes the commit payload
 * 3. Records a pipeline_event for tracking
 * 4. Updates engine_runs if applicable
 * 5. Returns a commit receipt
 *
 * Pipeline completion is NOT allowed before this succeeds.
 */
export async function finalizePipelineRun(
  payload: CanonicalCommitPayload
): Promise<PipelineCommitResult> {
  const now = Date.now();
  const tracePath = payload.tracePath || `${payload.pipelineSource}:${now}`;
  const errors = payload.errors || [];

  // 1. Validate required fields
  if (!payload.pipelineSource) {
    throw new Error("[CanonicalCore] finalizePipelineRun: pipelineSource is required");
  }
  if (!payload.canonicalTables || payload.canonicalTables.length === 0) {
    throw new Error("[CanonicalCore] finalizePipelineRun: canonicalTables must be non-empty");
  }

  // 2. Determine status
  const status: CommitStatus = errors.length > 0
    ? (payload.recordsWritten > 0 ? "partial" : "failed")
    : "success";

  // 3. Record pipeline_event for tracking
  // pipeline_events table has a constrained eventType enum and requires userId.
  // We use a raw INSERT to store canonical_commit events with a system userId of 0.
  let eventId: number | null = null;
  try {
    const [result] = await db.execute(sql`
      INSERT INTO pipeline_events (userId, pipelineType, eventType, stateCode, createdAt)
      VALUES (0, ${payload.pipelineSource}, 'analysis_complete', NULL, ${now})
    `);
    eventId = (result as any).insertId || null;
  } catch (err: any) {
    console.error("[CanonicalCore] Failed to record pipeline_event:", err.message);
    errors.push(`pipeline_event write failed: ${err.message}`);
  }

  // 4. Update engine_runs if this is an engine pipeline
  const enginePipelines: PipelineSource[] = [
    "pattern_engine", "trend_engine", "strategy_engine",
    "viability_engine", "assembly_engine", "activation_engine",
  ];
  if (enginePipelines.includes(payload.pipelineSource)) {
    try {
      // engine_runs requires caseId (use 0 for system-level runs)
      const runStatus = status === "success" ? "completed" : status === "partial" ? "completed" : "failed";
      await db.execute(sql`
        INSERT INTO engine_runs (caseId, userId, engineRunType, engineRunStatus, currentStage, stageResults, errorMessage, startedAt, completedAt, createdAt)
        VALUES (0, 0, 'full_pipeline', ${runStatus}, ${payload.pipelineSource},
                ${JSON.stringify({ description: payload.description, canonicalTables: payload.canonicalTables, recordsWritten: payload.recordsWritten })},
                ${errors.length > 0 ? errors.join('; ') : null},
                ${now - 1000}, ${now}, ${now})
      `);
    } catch (err: any) {
      console.error("[CanonicalCore] Failed to record engine_run:", err.message);
    }
  }

  // 5. Return commit receipt
  const result: PipelineCommitResult = {
    pipelineSource: payload.pipelineSource,
    runId: eventId,
    status,
    recordsWritten: payload.recordsWritten,
    canonicalTables: payload.canonicalTables,
    errors,
    timestamp: now,
    tracePath,
  };

  console.log(
    `[CanonicalCore] Pipeline ${payload.pipelineSource} committed: ` +
    `${payload.recordsWritten} records → [${payload.canonicalTables.join(", ")}] ` +
    `(status: ${status})`
  );

  return result;
}

// ─── Canonical Core Health ───────────────────────────────────────────────────

/**
 * getCanonicalCoreHealth — Returns row counts for all canonical tables
 * Used by Mission Control to reflect true system state
 */
export async function getCanonicalCoreHealth(): Promise<{
  tables: Array<{ table: string; category: string; count: number }>;
  totalRecords: number;
  populatedTables: number;
  emptyTables: number;
}> {
  const canonicalTables: Array<{ table: string; category: string }> = [
    // Registry Core
    { table: "registry_jurisdictions", category: "registry" },
    { table: "registry_programs", category: "registry" },
    { table: "registry_oversight_bodies", category: "registry" },
    { table: "registry_workflows", category: "registry" },
    { table: "registry_signals", category: "registry" },
    { table: "registry_source_traceability", category: "registry" },
    // Signals
    { table: "live_signals", category: "signals" },
    { table: "detected_signals", category: "signals" },
    // Case Data
    { table: "cases", category: "cases" },
    { table: "documents", category: "cases" },
    { table: "entities", category: "cases" },
    { table: "claims", category: "cases" },
    { table: "findings", category: "cases" },
    // Patterns & Analysis
    { table: "patterns", category: "analysis" },
    { table: "pattern_occurrences", category: "analysis" },
    { table: "pattern_outputs", category: "analysis" },
    { table: "strategy_outputs", category: "analysis" },
    { table: "procedural_outputs", category: "analysis" },
    { table: "activation_outputs", category: "analysis" },
    // Legal
    { table: "legal_statutes", category: "legal" },
    { table: "legal_case_law", category: "legal" },
    { table: "legal_enforcement_records", category: "legal" },
    { table: "legal_weak_joints", category: "legal" },
    { table: "legal_contradictions", category: "legal" },
    { table: "doctrine_registry", category: "legal" },
    { table: "litigation_barriers", category: "legal" },
    { table: "agency_authority_map", category: "legal" },
    // Knowledge Backbone
    { table: "knowledge_entries", category: "knowledge" },
    { table: "knowledge_modules", category: "knowledge" },
    { table: "proof_frameworks", category: "knowledge" },
    // FOIA
    { table: "foia_requests", category: "foia" },
    { table: "foia_statutes", category: "foia" },
    { table: "foia_agencies", category: "foia" },
    // Lighthouse
    { table: "lighthouse_jobs", category: "lighthouse" },
    { table: "lighthouse_posts", category: "lighthouse" },
    { table: "lighthouse_events", category: "lighthouse" },
    { table: "lighthouse_spotlight", category: "lighthouse" },
    // Governance
    { table: "governance_log", category: "governance" },
    { table: "governance_snapshots", category: "governance" },
    // Pipeline Tracking
    { table: "pipeline_events", category: "pipeline" },
    { table: "engine_runs", category: "pipeline" },
    { table: "ingest_runs", category: "pipeline" },
    // Docket
    { table: "docket_entries", category: "docket" },
    // Agency Performance
    { table: "agency_performance_metrics", category: "performance" },
    // LumenSend
    { table: "lumensend_templates", category: "lumensend" },
    { table: "lumensend_drafts", category: "lumensend" },
    // Escalation
    { table: "escalation_registry", category: "escalation" },
    // System Map
    { table: "system_map_nodes", category: "system" },
    { table: "system_map_edges", category: "system" },
  ];

  const results: Array<{ table: string; category: string; count: number }> = [];
  let totalRecords = 0;
  let populatedTables = 0;
  let emptyTables = 0;

  for (const { table, category } of canonicalTables) {
    try {
      const result = await db.execute(sql.raw(`SELECT COUNT(*) as c FROM "${table}"`));
      const rows = (result as any).rows ?? result;
      const count = Number(rows?.[0]?.c) || 0;
      results.push({ table, category, count });
      totalRecords += count;
      if (count > 0) populatedTables++;
      else emptyTables++;
    } catch {
      results.push({ table, category, count: -1 }); // table missing
      emptyTables++;
    }
  }

  return { tables: results, totalRecords, populatedTables, emptyTables };
}

/**
 * getPipelineCompletionState — Returns pipeline execution history
 * Used by Pipeline Analytics and Mission Control
 */
export async function getPipelineCompletionState(): Promise<{
  recentEvents: Array<{
    id: number;
    eventType: string;
    pipelineId: string;
    payload: any;
    createdAt: number;
  }>;
  engineRunSummary: Array<{
    engineName: string;
    totalRuns: number;
    lastRun: number | null;
    lastStatus: string | null;
  }>;
  ingestRunSummary: Array<{
    datasetId: string;
    totalRuns: number;
    lastRun: number | null;
    lastStatus: string | null;
    totalRecords: number;
  }>;
}> {
  // Recent pipeline events — actual columns: id, userId, pipelineType, eventType, stateCode, createdAt
  // Use pool.query (text protocol) to avoid TiDB prepared-statement LIMIT restriction
  const [eventRows] = await pool.query(
    `SELECT id, eventType, pipelineType as pipeline_id, stateCode, createdAt
     FROM pipeline_events
     ORDER BY createdAt DESC
     LIMIT 50`
  );

  // Engine run summary — group by engine_id (actual column name)
  const [engineRows] = await pool.query(
    `SELECT engine_id as engine_name,
            COUNT(*) as total_runs,
            MAX(completedAt) as last_run,
            MAX(status) as last_status
     FROM engine_runs
     GROUP BY engine_id`
  );

  // Ingest run summary
  const [ingestRows] = await pool.query(
    `SELECT datasetId_run as dataset_id,
            COUNT(*) as total_runs,
            MAX(endTime) as last_run,
            (SELECT ingestStatus FROM ingest_runs i2 WHERE i2.datasetId_run = ingest_runs.datasetId_run ORDER BY endTime DESC LIMIT 1) as last_status,
            SUM(recordsInserted) as total_records
     FROM ingest_runs
     GROUP BY datasetId_run`
  );

  return {
    recentEvents: (eventRows as unknown as any[]).map((r: any) => ({
      id: r.id,
      eventType: r.eventType,
      pipelineId: r.pipelineId || r.pipelineType || '',
      payload: r.payload ? (typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload) : { stateCode: r.stateCode },
      createdAt: Number(r.createdAt),
    })),
    engineRunSummary: (engineRows as unknown as any[]).map((r: any) => ({
      engineName: r.engineName,
      totalRuns: Number(r.totalRuns),
      lastRun: r.lastRun ? Number(r.lastRun) : null,
      lastStatus: r.lastStatus,
    })),
    ingestRunSummary: (ingestRows as unknown as any[]).map((r: any) => ({
      datasetId: r.datasetId,
      totalRuns: Number(r.totalRuns),
      lastRun: r.lastRun ? Number(r.lastRun) : null,
      lastStatus: r.lastStatus,
      totalRecords: Number(r.totalRecords) || 0,
    })),
  };
}

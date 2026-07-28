/**
 * CANONICAL KNOWLEDGE CORE — Central Source of Truth
 *
 * This service owns canonical-core bookkeeping and the Mission Control
 * canonical-core runtime adapter. Database identifiers remain canonical; the
 * runtime response also preserves the frontend fields already consumed by
 * Mission Control so architecture-linked pages do not crash on undefined
 * metrics while the broader runtime contract reconciliation continues.
 */

import { db, pool } from "../db";
import { sql } from "drizzle-orm";

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
  description: string;
  canonicalTables: string[];
  recordsWritten: number;
  errors?: string[];
  tracePath?: string;
  existingRunId?: number;
  metadata?: Record<string, any>;
}

export async function finalizePipelineRun(payload: CanonicalCommitPayload): Promise<PipelineCommitResult> {
  const now = Date.now();
  const tracePath = payload.tracePath || `${payload.pipelineSource}:${now}`;
  const errors = payload.errors || [];

  if (!payload.pipelineSource) {
    throw new Error("[CanonicalCore] finalizePipelineRun: pipelineSource is required");
  }
  if (!payload.canonicalTables || payload.canonicalTables.length === 0) {
    throw new Error("[CanonicalCore] finalizePipelineRun: canonicalTables must be non-empty");
  }

  const status: CommitStatus = errors.length > 0
    ? (payload.recordsWritten > 0 ? "partial" : "failed")
    : "success";

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

  const enginePipelines: PipelineSource[] = [
    "pattern_engine", "trend_engine", "strategy_engine",
    "viability_engine", "assembly_engine", "activation_engine",
  ];
  if (enginePipelines.includes(payload.pipelineSource)) {
    try {
      const runStatus = status === "failed" ? "failed" : "completed";
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
    `(status: ${status})`,
  );

  return result;
}

const canonicalTables: Array<{ table: string; category: string }> = [
  { table: "registry_jurisdictions", category: "registry" },
  { table: "registry_programs", category: "registry" },
  { table: "registry_oversight_bodies", category: "registry" },
  { table: "registry_workflows", category: "registry" },
  { table: "registry_signals", category: "registry" },
  { table: "registry_source_traceability", category: "registry" },
  { table: "live_signals", category: "signals" },
  { table: "detected_signals", category: "signals" },
  { table: "cases", category: "cases" },
  { table: "documents", category: "cases" },
  { table: "entities", category: "cases" },
  { table: "claims", category: "cases" },
  { table: "findings", category: "cases" },
  { table: "patterns", category: "analysis" },
  { table: "pattern_occurrences", category: "analysis" },
  { table: "pattern_outputs", category: "analysis" },
  { table: "strategy_outputs", category: "analysis" },
  { table: "procedural_outputs", category: "analysis" },
  { table: "activation_outputs", category: "analysis" },
  { table: "legal_statutes", category: "legal" },
  { table: "legal_case_law", category: "legal" },
  { table: "legal_enforcement_records", category: "legal" },
  { table: "legal_weak_joints", category: "legal" },
  { table: "legal_contradictions", category: "legal" },
  { table: "doctrine_registry", category: "legal" },
  { table: "litigation_barriers", category: "legal" },
  { table: "agency_authority_map", category: "legal" },
  { table: "knowledge_entries", category: "knowledge" },
  { table: "knowledge_modules", category: "knowledge" },
  { table: "proof_frameworks", category: "knowledge" },
  { table: "foia_requests", category: "foia" },
  { table: "foia_statutes", category: "foia" },
  { table: "foia_agencies", category: "foia" },
  { table: "lighthouse_jobs", category: "lighthouse" },
  { table: "lighthouse_posts", category: "lighthouse" },
  { table: "lighthouse_events", category: "lighthouse" },
  { table: "lighthouse_spotlight", category: "lighthouse" },
  { table: "governance_log", category: "governance" },
  { table: "governance_snapshots", category: "governance" },
  { table: "pipeline_events", category: "pipeline" },
  { table: "engine_runs", category: "pipeline" },
  { table: "ingest_runs", category: "pipeline" },
  { table: "docket_entries", category: "docket" },
  { table: "agency_performance_metrics", category: "performance" },
  { table: "lumensend_templates", category: "lumensend" },
  { table: "lumensend_drafts", category: "lumensend" },
  { table: "escalation_registry", category: "escalation" },
  { table: "system_map_nodes", category: "system" },
  { table: "system_map_edges", category: "system" },
];

export async function getCanonicalCoreHealth(): Promise<{
  tables: Array<{ table: string; category: string; count: number }>;
  total_records: number;
  totalRecords: number;
  populatedTables: number;
  emptyTables: number;
}> {
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
      results.push({ table, category, count: -1 });
      emptyTables++;
    }
  }

  return {
    tables: results,
    total_records: totalRecords,
    totalRecords,
    populatedTables,
    emptyTables,
  };
}

export async function getPipelineCompletionState(): Promise<{
  recentEvents: Array<{ id: number; eventType: string; pipeline_id: string; payload: any; createdAt: number }>;
  engineRunSummary: Array<{ engine_name: string; engineName: string; total_runs: number; totalRuns: number; last_run: number | null; lastRun: number | null; last_status: string | null; lastStatus: string | null }>;
  ingestRunSummary: Array<{ dataset_id: string; datasetId: string; total_runs: number; totalRuns: number; last_run: number | null; lastRun: number | null; last_status: string | null; lastStatus: string | null; total_records: number; totalRecords: number }>;
}> {
  const eventResult = await pool.query(
    `SELECT id,
            event_type,
            pipeline_type AS pipeline_id,
            state_code,
            created_at
     FROM pipeline_events
     ORDER BY created_at DESC
     LIMIT 50`,
  );

  const engineResult = await pool.query(
    `SELECT engine_id AS engine_name,
            COUNT(*)::int AS total_runs,
            MAX(COALESCE(completed_at, started_at, created_at)) AS last_run,
            (ARRAY_AGG(
              COALESCE(engine_run_status, status)
              ORDER BY COALESCE(completed_at, started_at, created_at) DESC, id DESC
            ))[1] AS last_status
     FROM engine_runs
     GROUP BY engine_id
     ORDER BY engine_id`,
  );

  const ingestResult = await pool.query(
    `SELECT COALESCE(dataset_id_run, stream_id) AS dataset_id,
            COUNT(*)::int AS total_runs,
            MAX(COALESCE(end_time, completed_at, started_at, created_at)) AS last_run,
            (ARRAY_AGG(
              COALESCE(ingest_status::text, status)
              ORDER BY COALESCE(end_time, completed_at, started_at, created_at) DESC, id DESC
            ))[1] AS last_status,
            SUM(COALESCE(records_inserted, records_processed, 0))::bigint AS total_records
     FROM ingest_runs
     GROUP BY COALESCE(dataset_id_run, stream_id)
     ORDER BY COALESCE(dataset_id_run, stream_id)`,
  );

  return {
    recentEvents: eventResult.rows.map((r: any) => ({
      id: Number(r.id),
      eventType: r.event_type,
      pipeline_id: r.pipeline_id ?? "",
      payload: { stateCode: r.state_code },
      createdAt: Number(r.created_at),
    })),
    engineRunSummary: engineResult.rows.map((r: any) => {
      const engineName = r.engine_name;
      const totalRuns = Number(r.total_runs) || 0;
      const lastRun = r.last_run == null ? null : Number(r.last_run);
      const lastStatus = r.last_status ?? null;
      return {
        engine_name: engineName,
        engineName,
        total_runs: totalRuns,
        totalRuns,
        last_run: lastRun,
        lastRun,
        last_status: lastStatus,
        lastStatus,
      };
    }),
    ingestRunSummary: ingestResult.rows.map((r: any) => {
      const datasetId = r.dataset_id;
      const totalRuns = Number(r.total_runs) || 0;
      const lastRun = r.last_run == null ? null : Number(r.last_run);
      const lastStatus = r.last_status ?? null;
      const totalRecords = Number(r.total_records) || 0;
      return {
        dataset_id: datasetId,
        datasetId,
        total_runs: totalRuns,
        totalRuns,
        last_run: lastRun,
        lastRun,
        last_status: lastStatus,
        lastStatus,
        total_records: totalRecords,
        totalRecords,
      };
    }),
  };
}

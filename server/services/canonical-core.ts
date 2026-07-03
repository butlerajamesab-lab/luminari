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
  const [eventRows] = await pool.query(
    `SELECT id, eventType, pipelineType as pipeline_id, stateCode, createdAt
     FROM pipeline_events
     ORDER BY createdAt DESC
     LIMIT 50`,
  );

  const [engineRows] = await pool.query(
    `SELECT engine_id as engine_name,
            COUNT(*) as total_runs,
            MAX(completedAt) as last_run,
            MAX(status) as last_status
     FROM engine_runs
     GROUP BY engine_id`,
  );

  const [ingestRows] = await pool.query(
    `SELECT datasetId_run as dataset_id,
            COUNT(*) as total_runs,
            MAX(endTime) as last_run,
            (SELECT ingestStatus FROM ingest_runs i2 WHERE i2.datasetId_run = ingest_runs.datasetId_run ORDER BY endTime DESC LIMIT 1) as last_status,
            SUM(recordsInserted) as total_records
     FROM ingest_runs
     GROUP BY datasetId_run`,
  );

  return {
    recentEvents: (eventRows as unknown as any[]).map((r: any) => ({
      id: r.id,
      eventType: r.eventType,
      pipeline_id: r.pipeline_id || r.pipelineType || "",
      payload: r.payload ? (typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload) : { stateCode: r.stateCode },
      createdAt: Number(r.createdAt),
    })),
    engineRunSummary: (engineRows as unknown as any[]).map((r: any) => {
      const engineName = r.engine_name;
      const totalRuns = Number(r.total_runs) || 0;
      const lastRun = r.last_run ? Number(r.last_run) : null;
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
    ingestRunSummary: (ingestRows as unknown as any[]).map((r: any) => {
      const datasetId = r.dataset_id;
      const totalRuns = Number(r.total_runs) || 0;
      const lastRun = r.last_run ? Number(r.last_run) : null;
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

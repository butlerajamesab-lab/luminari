/**
 * Engine Metadata Layer
 *
 * wrapEngineExecution — wraps any engine function to:
 *   1. Register the run in engine_runs before execution
 *   2. Track status transitions (pending → running → success|failed)
 *   3. Capture output_refs from the engine result (meta-wrapped object format)
 *   4. Bind to snapshot_id if provided
 *   5. Enforce validation gate before marking success
 *   6. Validate all output_refs entities exist before persisting
 *
 * STATUS CONTRACT (no drift):
 *   pending | running | success | failed | unknown
 *   No other values are permitted.
 *
 * OUTPUT_REFS CONTRACT:
 *   Must be an OutputRefs object (primary + artifacts + meta).
 *   String arrays are INVALID and will be rejected.
 *   All entity IDs are validated against their declared tables.
 */

import { db } from "./db";
import { engineRegistry } from "../drizzle/schema";
import { engineRunsCanonical as engineRuns } from "./engine-runs-schema";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { persistEngineOutputs } from "./engine-output-persist";
import type { OutputRefs } from "./output-refs";
import { assertOutputRefsFormat } from "./output-refs";
import { logConduitEvent } from "./metadata-conduit";

const VALID_STATUSES = ["pending", "running", "success", "failed", "unknown"] as const;
type EngineRunStatus = (typeof VALID_STATUSES)[number];

function assertStatus(s: string): EngineRunStatus {
  if (!VALID_STATUSES.includes(s as any)) {
    throw new Error(`[EngineMetadata] Invalid status "${s}". Must be one of: ${VALID_STATUSES.join(" | ")}`);
  }
  return s as EngineRunStatus;
}

/**
 * Builds the status fields for any engine_runs UPDATE or INSERT.
 * Guarantees status === engineRunStatus at every write.
 */
function syncStatus(s: string): { runStatus: EngineRunStatus; status: EngineRunStatus } {
  const validated = assertStatus(s);
  return { runStatus: validated, status: validated };
}

interface EngineRunConfig {
  engineId: string;
  caseId: number;
  userId?: number | string;
  runType?: "full_pipeline" | "viability_only" | "strategy_only" | "assembly_only" | "pattern_only";
  snapshotId?: number;
}

interface EngineRunResult {
  runId: string;
  engineId: string;
  status: EngineRunStatus;
  outputRefs: OutputRefs | null;
  error?: string;
}

export async function wrapEngineExecution<T>(
  config: EngineRunConfig,
  engineFn: () => Promise<T>,
  extractOutputRefs?: (result: T, runId: string) => Promise<OutputRefs>
): Promise<EngineRunResult> {
  const runId = `run_${config.engineId}_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const now = Date.now();

  await db.insert(engineRuns).values({
    runId,
    caseId: config.caseId,
    engineId: config.engineId,
    userId: config.userId ?? null,
    runType: config.runType ?? "full_pipeline",
    ...syncStatus("pending"),
    currentStage: "init",
    stageResults: null,
    outputRefs: null,
    snapshotId: config.snapshotId ?? null,
    startedAt: now,
    createdAt: now,
  });

  await db.update(engineRuns)
    .set({ ...syncStatus("running"), currentStage: "executing" })
    .where(sql`run_id = ${runId}`);

  try {
    const gateResult = await validateGate(config.engineId);

    if (!gateResult.pass) {
      await db.update(engineRuns)
        .set({
          ...syncStatus("failed"),
          currentStage: "validation_gate",
          errorMessage: gateResult.reason,
          outputRefs: null,
          completedAt: Date.now(),
        })
        .where(sql`run_id = ${runId}`);

      return { runId, engineId: config.engineId, status: "failed", outputRefs: null, error: gateResult.reason };
    }

    const result = await engineFn();

    let outputRefs: OutputRefs | null = null;
    if (extractOutputRefs) {
      outputRefs = await extractOutputRefs(result, runId);
      assertOutputRefsFormat(outputRefs);
    }

    await db.update(engineRuns)
      .set({
        ...syncStatus("success"),
        currentStage: "done",
        outputRefs,
        completedAt: Date.now(),
      })
      .where(sql`run_id = ${runId}`);

    console.log(`[EngineMetadata] ${config.engineId} run ${runId} → success. OutputRefs: ${outputRefs ? "present" : "null"}`);

    await logConduitEvent({
      eventType: "ENGINE_RUN",
      engineId: config.engineId,
      runId,
      snapshotId: config.snapshotId,
      metadata: {
        status: "success",
        case_id: config.caseId,
        has_output_refs: !!outputRefs,
        tables: outputRefs?.meta?.tables ?? [],
        fields: outputRefs?.meta?.fields ?? [],
      },
    });

    if (outputRefs) {
      try {
        const persistResult = await persistEngineOutputs(runId);
        // @ts-ignore — legacy persist result shape
        console.log(`[EngineMetadata] ${config.engineId} run ${runId} → backbone persist: ${persistResult.persisted} persisted, ${persistResult?.skipped ?? 0} skipped`);
      } catch (persistErr: any) {
        console.error(`[EngineMetadata] ${config.engineId} run ${runId} → backbone persist error:`, persistErr?.message || persistErr);
      }
    }

    return { runId, engineId: config.engineId, status: "success", outputRefs };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    await db.update(engineRuns)
      .set({
        ...syncStatus("failed"),
        currentStage: "error",
        errorMessage: errorMsg,
        completedAt: Date.now(),
      })
      .where(sql`run_id = ${runId}`);

    console.error(`[EngineMetadata] ${config.engineId} run ${runId} → failed:`, errorMsg);

    await logConduitEvent({
      eventType: "ENGINE_RUN",
      engineId: config.engineId,
      runId,
      snapshotId: config.snapshotId,
      metadata: { status: "failed", case_id: config.caseId, error: errorMsg },
    }).catch(() => {});

    return { runId, engineId: config.engineId, status: "failed", outputRefs: null, error: errorMsg };
  }
}

export async function bindRunToSnapshot(runId: string, snapshotId: number): Promise<void> {
  await db.update(engineRuns)
    .set({ snapshotId })
    .where(sql`run_id = ${runId}`);
  console.log(`[EngineMetadata] Bound run ${runId} to snapshot ${snapshotId}`);
}

async function validateGate(engineId: string): Promise<{ pass: boolean; reason?: string }> {
  const [rows] = await db.execute(
    sql`SELECT engine_id_er, enabled_er FROM engine_registry WHERE engine_id_er = ${engineId} LIMIT 1`
  );
  const registry = rows as unknown as any[];

  if (registry.length === 0) {
    return { pass: false, reason: `Engine ${engineId} is not registered in engine_registry. Registration required before execution.` };
  }

  const entry = registry[0] as any;
  if (!entry.enabled_er) {
    return { pass: false, reason: `Engine ${engineId} is disabled in engine_registry` };
  }

  return { pass: true };
}

export async function runValidationGate(engineId: string): Promise<{ pass: boolean; reason?: string }> {
  return validateGate(engineId);
}

export async function getLatestRun(engineId?: string): Promise<any> {
  let query = `SELECT run_id, engine_id, status, output_refs, snapshot_id, started_at, completed_at FROM engine_runs ORDER BY created_at DESC LIMIT 1`;
  if (engineId) {
    query = `SELECT run_id, engine_id, status, output_refs, snapshot_id, started_at, completed_at FROM engine_runs WHERE engine_id = '${engineId.replaceAll("'", "''")}' ORDER BY created_at DESC LIMIT 1`;
  }
  const [rows] = await db.execute(sql.raw(query));
  return (rows as unknown as any[])[0] || null;
}

export async function getRunsByCase(caseId: number): Promise<any[]> {
  const [rows] = await db.execute(
    sql`SELECT run_id, engine_id, status, output_refs, snapshot_id, started_at, completed_at
        FROM engine_runs WHERE case_id = ${caseId} ORDER BY created_at DESC`
  );
  return rows as unknown as any[];
}

export { VALID_STATUSES, syncStatus };
export type { EngineRunStatus, EngineRunConfig, EngineRunResult };

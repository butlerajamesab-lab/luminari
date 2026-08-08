import { getPool } from "./db-legacy";

export type ProvenanceBatchRunCompat = {
  id: number;
  startedBy: number;
  status: "running" | "completed" | "aborted" | "error";
  totalFindings: number;
  processedCount: number;
  resolvedCount: number;
  errorCount: number;
  stillUnsupported: number;
  lastProcessedFindingId: number | null;
  fallbackUsageCount: number;
  startedAt: number;
  completedAt: number | null;
  abortedAt: number | null;
  runtimeMs: number | null;
};

function as_number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function as_nullable_number(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function map_batch_run(row: any): ProvenanceBatchRunCompat | null {
  if (!row) return null;
  const status = String(row.status ?? "") as ProvenanceBatchRunCompat["status"];
  if (!["running", "completed", "aborted", "error"].includes(status)) {
    throw new Error(`invalid_batch_rerun_status:${status}`);
  }
  return {
    id: as_number(row.id),
    startedBy: as_number(row.started_by),
    status,
    totalFindings: as_number(row.total_findings),
    processedCount: as_number(row.processed_count),
    resolvedCount: as_number(row.resolved_count),
    errorCount: as_number(row.error_count),
    stillUnsupported: as_number(row.still_unsupported),
    lastProcessedFindingId: as_nullable_number(row.last_processed_finding_id),
    fallbackUsageCount: as_number(row.fallback_usage_count),
    startedAt: as_number(row.started_at),
    completedAt: as_nullable_number(row.completed_at),
    abortedAt: as_nullable_number(row.aborted_at),
    runtimeMs: as_nullable_number(row.runtime_ms),
  };
}

const BATCH_SELECT = `
  select
    id,
    started_by,
    status,
    total_findings,
    processed_count,
    resolved_count,
    error_count,
    still_unsupported,
    last_processed_finding_id,
    fallback_usage_count,
    started_at,
    completed_at,
    aborted_at,
    runtime_ms
  from public.batch_rerun_runs
`;

/**
 * Live Postgres compatibility boundary for provenance batch reruns.
 *
 * The historical Drizzle declaration uses camelCase physical column names,
 * while the production table is snake_case. These helpers deliberately read
 * and write the live snake_case contract and return the existing camelCase API
 * shape expected by the tRPC/UI layer.
 */
export async function createBatchRun(startedBy: number, totalFindings: number): Promise<number> {
  const now = Date.now();
  const result = await getPool().query<{ id: number }>(
    `insert into public.batch_rerun_runs (
       started_by,
       status,
       total_findings,
       processed_count,
       resolved_count,
       error_count,
       still_unsupported,
       fallback_usage_count,
       started_at
     ) values ($1, 'running', $2, 0, 0, 0, $2, 0, $3)
     returning id`,
    [startedBy, totalFindings, now],
  );
  const id = as_number(result.rows[0]?.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("batch_rerun_not_persisted");
  return id;
}

export async function getActiveBatchRun(): Promise<ProvenanceBatchRunCompat | null> {
  const result = await getPool().query(
    `${BATCH_SELECT}
     where status = 'running'
     order by started_at desc, id desc
     limit 1`,
  );
  return map_batch_run(result.rows[0]);
}

export async function getBatchRunById(id: number): Promise<ProvenanceBatchRunCompat | null> {
  const result = await getPool().query(
    `${BATCH_SELECT}
     where id = $1
     limit 1`,
    [id],
  );
  return map_batch_run(result.rows[0]);
}

export async function updateBatchProgress(id: number, data: {
  processedCount?: number;
  resolvedCount?: number;
  errorCount?: number;
  stillUnsupported?: number;
  lastProcessedFindingId?: number;
  fallbackUsageCount?: number;
}) {
  await getPool().query(
    `update public.batch_rerun_runs
        set processed_count = coalesce($2, processed_count),
            resolved_count = coalesce($3, resolved_count),
            error_count = coalesce($4, error_count),
            still_unsupported = coalesce($5, still_unsupported),
            last_processed_finding_id = coalesce($6, last_processed_finding_id),
            fallback_usage_count = coalesce($7, fallback_usage_count)
      where id = $1`,
    [
      id,
      data.processedCount ?? null,
      data.resolvedCount ?? null,
      data.errorCount ?? null,
      data.stillUnsupported ?? null,
      data.lastProcessedFindingId ?? null,
      data.fallbackUsageCount ?? null,
    ],
  );
}

/**
 * Move an aborted/error batch back to running without using the drifted Drizzle
 * batch table. Terminal timestamps are cleared because the same batch record is
 * active again; the original started_at is preserved as the batch's identity
 * anchor rather than fabricating a new start time.
 */
export async function resumeBatchRun(id: number, totalFindings: number) {
  const result = await getPool().query(
    `update public.batch_rerun_runs
        set status = 'running',
            total_findings = $2,
            completed_at = null,
            aborted_at = null,
            runtime_ms = null
      where id = $1
        and status in ('aborted', 'error')
      returning id`,
    [id, totalFindings],
  );
  if (result.rows.length !== 1) {
    throw new Error(`batch_rerun_not_resumable:${id}`);
  }
}

export async function completeBatchRun(id: number) {
  const run = await getBatchRunById(id);
  if (!run) return;
  const now = Date.now();
  const runtimeMs = Math.max(0, now - run.startedAt);
  await getPool().query(
    `update public.batch_rerun_runs
        set status = 'completed',
            completed_at = $2,
            aborted_at = null,
            runtime_ms = $3,
            still_unsupported = greatest(total_findings - resolved_count - error_count, 0)
      where id = $1`,
    [id, now, runtimeMs],
  );
}

export async function abortBatchRun(id: number) {
  const run = await getBatchRunById(id);
  if (!run) return;
  const now = Date.now();
  const runtimeMs = Math.max(0, now - run.startedAt);
  await getPool().query(
    `update public.batch_rerun_runs
        set status = 'aborted',
            aborted_at = $2,
            completed_at = null,
            runtime_ms = $3,
            still_unsupported = greatest(total_findings - resolved_count - error_count, 0)
      where id = $1`,
    [id, now, runtimeMs],
  );
}

/** Fatal processor failure is not a user abort. Keep those states distinct. */
export async function failBatchRun(id: number) {
  const run = await getBatchRunById(id);
  if (!run) return;
  const now = Date.now();
  const runtimeMs = Math.max(0, now - run.startedAt);
  await getPool().query(
    `update public.batch_rerun_runs
        set status = 'error',
            completed_at = $2,
            aborted_at = null,
            runtime_ms = $3,
            still_unsupported = greatest(total_findings - resolved_count - error_count, 0)
      where id = $1`,
    [id, now, runtimeMs],
  );
}

export async function getLatestBatchRun(): Promise<ProvenanceBatchRunCompat | null> {
  const result = await getPool().query(
    `${BATCH_SELECT}
     order by started_at desc, id desc
     limit 1`,
  );
  return map_batch_run(result.rows[0]);
}

export async function listBatchRuns(limit = 10): Promise<ProvenanceBatchRunCompat[]> {
  const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const result = await getPool().query(
    `${BATCH_SELECT}
     order by started_at desc, id desc
     limit $1`,
    [boundedLimit],
  );
  return result.rows.map(map_batch_run).filter((row): row is ProvenanceBatchRunCompat => row !== null);
}

export async function expireStaleBatchRuns(thresholdMs = 30 * 60 * 1000): Promise<number> {
  const now = Date.now();
  const cutoff = now - thresholdMs;
  const result = await getPool().query(
    `update public.batch_rerun_runs
        set status = 'error',
            completed_at = $1,
            aborted_at = null,
            runtime_ms = greatest($1 - started_at, 0),
            still_unsupported = greatest(total_findings - resolved_count - error_count, 0)
      where status = 'running'
        and started_at <= $2
      returning id`,
    [now, cutoff],
  );
  return result.rows.length;
}

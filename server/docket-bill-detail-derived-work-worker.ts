import { randomUUID } from "node:crypto";
import { query_with_diagnostics } from "./db";
import { background_feature_enabled } from "./runtime-role";

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const MIN_POLL_INTERVAL_MS = 1_000;
const MAX_POLL_INTERVAL_MS = 60_000;
const CLAIM_LIMIT = 1;
const WORKER_LEASE_ID = [
  process.env.RENDER_SERVICE_ID ?? "lighthouse",
  "docket-bill-detail-derived-work",
  process.pid,
  randomUUID(),
].join(":");

type derived_work_job = {
  work_id: string;
  source_bill_id: number;
  docket_fetched_at: string | Date;
  attempt_count: number;
};

const CLAIM_SQL = `
  select work_id, source_bill_id, docket_fetched_at, attempt_count
  from public.claim_docket_bill_detail_derived_work_v1($1,$2)
`;
const PROCESS_SQL = `
  select public.process_docket_bill_detail_derived_work_v1($1,$2::timestamptz) as receipt
`;
const COMPLETE_SQL = `
  select public.complete_docket_bill_detail_derived_work_v1($1::uuid,$2::text,$3::jsonb) as completed
`;
const DEFER_SQL = `
  select public.defer_docket_bill_detail_derived_work_v1($1::uuid,$2::text,$3::text,$4::integer) as deferred
`;

let queue_timer: NodeJS.Timeout | null = null;
let active_cycle: Promise<void> | null = null;
let stopped = false;

function bounded_poll_interval_ms(): number {
  const parsed = Number(process.env.DOCKET_BILL_DETAIL_DERIVED_POLL_MS);
  if (!Number.isFinite(parsed)) return DEFAULT_POLL_INTERVAL_MS;
  return Math.max(MIN_POLL_INTERVAL_MS, Math.min(MAX_POLL_INTERVAL_MS, Math.trunc(parsed)));
}

function enabled(): boolean {
  return background_feature_enabled("DOCKET_BILL_DETAIL_DERIVED_WORK_ENABLED");
}

function safe_error_code(error: unknown): string {
  const raw = error instanceof Error ? error.message : "unknown_docket_detail_derived_failure";
  return raw.replace(/key=[^&\s]+/gi, "key=[redacted]")
    .replace(/[^a-zA-Z0-9:_-]/g, "_")
    .slice(0, 200) || "unknown_docket_detail_derived_failure";
}

function retry_delay_seconds(attempt_count: number): number {
  return Math.min(3_600, 15 * (2 ** Math.max(0, Math.min(7, attempt_count - 1))));
}

async function claim_next_job(): Promise<derived_work_job | null> {
  const { rows } = await query_with_diagnostics<derived_work_job>(CLAIM_SQL,
    [WORKER_LEASE_ID, CLAIM_LIMIT],
    { label: "docket_bill_detail_derived_claim", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 5_000 },
  );
  return rows[0] ?? null;
}

async function process_job(job: derived_work_job): Promise<void> {
  try {
    const { rows } = await query_with_diagnostics<{ receipt: Record<string, unknown> }>(
      PROCESS_SQL,
      [job.source_bill_id, job.docket_fetched_at],
      {
        label: "docket_bill_detail_derived_process",
        pool_acquire_timeout_ms: 1_000,
        // The slow work is now off the source-response path. Keep a server-side
        // cancellation bound for this worker so a pathological item cannot
        // run forever or be retried while its first execution is still live.
        query_timeout_ms: 180_000,
      },
    );
    const receipt = rows[0]?.receipt ?? { status: "processed" };
    const { rows: completed } = await query_with_diagnostics<{ completed: boolean }>(
      COMPLETE_SQL,
      [job.work_id, WORKER_LEASE_ID, JSON.stringify(receipt)],
      { label: "docket_bill_detail_derived_complete", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 5_000 },
    );
    console.log("[DocketBillDetailDerivedWork] completed", {
      work_id: job.work_id,
      source_bill_id: job.source_bill_id,
      status: receipt.status ?? "processed",
      lease_completed: completed[0]?.completed === true,
    });
  } catch (error) {
    const error_code = safe_error_code(error);
    try {
      const { rows } = await query_with_diagnostics<{ deferred: boolean }>(
        DEFER_SQL,
        [job.work_id, WORKER_LEASE_ID, error_code, retry_delay_seconds(job.attempt_count)],
        { label: "docket_bill_detail_derived_failure_record", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 5_000 },
      );
      console.error("[DocketBillDetailDerivedWork] deferred", {
        work_id: job.work_id,
        source_bill_id: job.source_bill_id,
        attempt_count: job.attempt_count,
        retry_delay_seconds: retry_delay_seconds(job.attempt_count),
        lease_deferred: rows[0]?.deferred === true,
        error_code,
      });
    } catch (record_error) {
      // The lease is reclaimed after five minutes if the failure receipt itself
      // cannot be written; the source cache remains independently committed.
      console.error("[DocketBillDetailDerivedWork] failure_record_deferred", {
        work_id: job.work_id,
        source_bill_id: job.source_bill_id,
        error_code,
        record_error_code: safe_error_code(record_error),
      });
    }
  }
}

export function run_docket_bill_detail_derived_work_cycle(): Promise<void> {
  if (active_cycle) return active_cycle;
  if (stopped || !enabled()) return Promise.resolve();
  const cycle = (async () => {
    try {
      const job = await claim_next_job();
      if (job) await process_job(job);
    } catch (error) {
      console.error("[DocketBillDetailDerivedWork] cycle_failed", {
        error_code: safe_error_code(error),
      });
    }
  })();
  active_cycle = cycle;
  void cycle.finally(() => {
    if (active_cycle === cycle) active_cycle = null;
  });
  return cycle;
}

export function start_docket_bill_detail_derived_work_worker(): void {
  if (queue_timer || !enabled()) return;
  stopped = false;
  const interval_ms = bounded_poll_interval_ms();
  console.log("[DocketBillDetailDerivedWork] started", {
    worker_id: WORKER_LEASE_ID,
    interval_ms,
    claim_limit: CLAIM_LIMIT,
  });
  void run_docket_bill_detail_derived_work_cycle();
  queue_timer = setInterval(() => void run_docket_bill_detail_derived_work_cycle(), interval_ms);
  queue_timer.unref?.();
}

export async function stop_docket_bill_detail_derived_work_worker(): Promise<void> {
  stopped = true;
  if (queue_timer) clearInterval(queue_timer);
  queue_timer = null;
  await active_cycle;
}

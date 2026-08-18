import { randomUUID } from "node:crypto";

import { project_docket_cache_to_civic_genome } from "./civic-genome-projection";
import { query_with_diagnostics } from "./db";
import { get_bill, type legiscan_bill_detail } from "./services/legiscan";

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const MIN_POLL_INTERVAL_MS = 250;
const MAX_POLL_INTERVAL_MS = 60_000;
const DEFAULT_CONCURRENCY = 4;
const MAX_CONCURRENCY = 32;
const QUEUE_LEASE_MINUTES = 30;
const UNKNOWN_FAILURE_LIMIT = 5;

export type docket_bill_activation_job = {
  queue_id: string;
  source_bill_id: number;
  state: string;
  summary_fingerprint: string;
  observed_change_hash: string | null;
  attempt_count: number;
};

export type docket_bill_activation_receipt = {
  source_bill_id: number;
  genome_bill_id: string;
  registered_document_count: number;
  text_version_count: number;
  amendment_count: number;
  matched_amendment_base_count: number;
  queued_or_refreshed_count: number;
  docket_fetched_at: string;
};

export type docket_bill_activation_failure_decision = {
  queue_state: "degraded" | "permanent_failure";
  failure_class: "transient" | "deterministic_contract" | "unknown";
  error_code: string;
  retry_delay_seconds: number;
  terminal: boolean;
};

let queue_timer: NodeJS.Timeout | null = null;
let queue_cycle_running = false;
let queue_stopped = false;
const state_projection_in_flight = new Map<string, Promise<void>>();
const queue_worker_id = [
  process.env.RENDER_SERVICE_ID ?? "lighthouse",
  "docket-jurisdiction-activation",
  process.pid,
  randomUUID(),
].join(":");

function bounded_integer(input: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number.parseInt(input ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function bounded_poll_interval(): number {
  return bounded_integer(
    process.env.DOCKET_BILL_ACTIVATION_QUEUE_POLL_MS,
    DEFAULT_POLL_INTERVAL_MS,
    MIN_POLL_INTERVAL_MS,
    MAX_POLL_INTERVAL_MS,
  );
}

function bounded_concurrency(): number {
  return bounded_integer(
    process.env.DOCKET_BILL_ACTIVATION_CONCURRENCY,
    DEFAULT_CONCURRENCY,
    1,
    MAX_CONCURRENCY,
  );
}

function queue_enabled(): boolean {
  const configured = process.env.DOCKET_BILL_ACTIVATION_QUEUE_ENABLED
    ?.trim()
    .toLowerCase();
  if (configured === "false") return false;
  if (configured === "true") return true;
  return process.env.NODE_ENV === "production";
}

function as_record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalize_state(value: string): string {
  const state = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) {
    throw new Error("invalid_docket_activation_state");
  }
  return state;
}

function safe_error_code(error: unknown): string {
  const raw = error instanceof Error
    ? error.message
    : "unknown_docket_bill_activation_failure";
  return raw
    .replace(/key=[^&\s]+/gi, "key=[redacted]")
    .replace(/[^a-zA-Z0-9:_-]/g, "_")
    .slice(0, 500) || "unknown_docket_bill_activation_failure";
}

function deterministic_failure(error_code: string): boolean {
  return [
    "docket_bill_activation_invalid_detail",
    "docket_bill_activation_invalid_registration_receipt",
    "invalid_docket_activation_",
    "rosetta_source_document_already_bound_to_other_bill",
    "rosetta_source_identity_binding_changed",
  ].some(prefix => error_code.startsWith(prefix));
}

export function docket_bill_activation_retry_delay_seconds(failure_number: number): number {
  const exponent = Math.max(0, Math.min(7, failure_number - 1));
  return Math.min(3_600, 15 * (2 ** exponent));
}

export function classify_docket_bill_activation_failure(input: {
  error: unknown;
  prior_attempt_count: number;
}): docket_bill_activation_failure_decision {
  const error_code = safe_error_code(input.error);
  const failure_number = input.prior_attempt_count + 1;
  const deterministic = deterministic_failure(error_code);
  const terminal = deterministic || failure_number >= UNKNOWN_FAILURE_LIMIT;
  return {
    queue_state: terminal ? "permanent_failure" : "degraded",
    failure_class: deterministic
      ? "deterministic_contract"
      : failure_number >= UNKNOWN_FAILURE_LIMIT
        ? "unknown"
        : "transient",
    error_code,
    retry_delay_seconds: terminal
      ? 0
      : docket_bill_activation_retry_delay_seconds(failure_number),
    terminal,
  };
}

async function claim_jobs(limit: number): Promise<docket_bill_activation_job[]> {
  const result = await query_with_diagnostics<docket_bill_activation_job>(
    `with candidate as (
       select queue.queue_id,
              jurisdiction.state
         from public.docket_bill_processing_queue queue
         cross join lateral (
           select binding.state
             from public.docket_jurisdiction_activation_bill binding
            where binding.queue_id = queue.queue_id
            order by binding.created_at desc, binding.activation_id desc
            limit 1
         ) jurisdiction
        where queue.next_attempt_at <= now()
          and (
            queue.queue_state in ('eligible', 'degraded')
            or (
              queue.queue_state = 'submitted'
              and queue.locked_at < now() - make_interval(mins => $2::integer)
            )
          )
          and (
            queue.locked_at is null
            or queue.locked_at < now() - make_interval(mins => $2::integer)
          )
        order by queue.created_at, queue.queue_id
        for update of queue skip locked
        limit $3::integer
     )
     update public.docket_bill_processing_queue queue
        set queue_state = 'submitted',
            locked_at = now(),
            locked_by = $1,
            updated_at = now()
       from candidate
      where queue.queue_id = candidate.queue_id
      returning queue.queue_id::text,
                queue.source_bill_id,
                candidate.state,
                queue.summary_fingerprint,
                queue.observed_change_hash,
                queue.attempt_count`,
    [queue_worker_id, QUEUE_LEASE_MINUTES, limit],
    {
      label: "docket_bill_activation_queue_claim",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
  return result.rows;
}

async function civic_genome_bill_ready(source_bill_id: number): Promise<boolean> {
  const result = await query_with_diagnostics<{ ready: boolean }>(
    `select exists (
       select 1
       from public.civic_genome_bill bill
       where bill.structural_dna_json ->> 'source_bill_id' = $1::text
     ) as ready`,
    [source_bill_id],
    {
      label: "docket_bill_activation_genome_readiness",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
  return result.rows[0]?.ready === true;
}

async function project_state_once(state: string): Promise<void> {
  const normalized_state = normalize_state(state);
  const existing = state_projection_in_flight.get(normalized_state);
  if (existing) {
    await existing;
    return;
  }

  const projection = (async () => {
    const result = await project_docket_cache_to_civic_genome({
      state_code: normalized_state,
    });
    console.log("[DocketJurisdictionActivation] projected_state", {
      state: normalized_state,
      bills_seen: result.bills_seen,
      inserted_count: result.inserted_count,
      updated_count: result.updated_count,
      unchanged_count: result.unchanged_count,
    });
  })();

  state_projection_in_flight.set(normalized_state, projection);
  try {
    await projection;
  } finally {
    if (state_projection_in_flight.get(normalized_state) === projection) {
      state_projection_in_flight.delete(normalized_state);
    }
  }
}

async function ensure_civic_genome_bill_ready(job: docket_bill_activation_job): Promise<void> {
  if (await civic_genome_bill_ready(job.source_bill_id)) return;
  await project_state_once(job.state);
  if (!await civic_genome_bill_ready(job.source_bill_id)) {
    throw new Error("docket_civic_genome_projection_missing_after_refresh");
  }
}

async function cache_bill_detail(source_bill_id: number, bill: legiscan_bill_detail): Promise<void> {
  if (!as_record(bill)) throw new Error("docket_bill_activation_invalid_detail");
  await query_with_diagnostics(
    `insert into public.docket_bill_detail_cache (
       bill_id,
       bill,
       fetched_at,
       source,
       created_at,
       updated_at
     ) values (
       $1,
       $2::jsonb,
       now(),
       'legiscan_get_bill_jurisdiction_activation',
       now(),
       now()
     )
     on conflict (bill_id) do update
       set bill = excluded.bill,
           fetched_at = excluded.fetched_at,
           source = excluded.source,
           updated_at = now()`,
    [source_bill_id, JSON.stringify(bill)],
    {
      label: "docket_bill_activation_cache_detail",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 10_000,
    },
  );
}

function normalize_registration_receipt(value: unknown): docket_bill_activation_receipt {
  const receipt = as_record(value);
  if (!receipt) throw new Error("docket_bill_activation_invalid_registration_receipt");
  const normalized: docket_bill_activation_receipt = {
    source_bill_id: Number(receipt.source_bill_id),
    genome_bill_id: String(receipt.genome_bill_id ?? ""),
    registered_document_count: Number(receipt.registered_document_count ?? 0),
    text_version_count: Number(receipt.text_version_count ?? 0),
    amendment_count: Number(receipt.amendment_count ?? 0),
    matched_amendment_base_count: Number(receipt.matched_amendment_base_count ?? 0),
    queued_or_refreshed_count: Number(receipt.queued_or_refreshed_count ?? 0),
    docket_fetched_at: String(receipt.docket_fetched_at ?? ""),
  };
  if (!Number.isSafeInteger(normalized.source_bill_id) || normalized.source_bill_id <= 0) {
    throw new Error("docket_bill_activation_invalid_registration_receipt");
  }
  if (!normalized.genome_bill_id) {
    throw new Error("docket_bill_activation_invalid_registration_receipt");
  }
  return normalized;
}

async function register_legislative_versions(source_bill_id: number): Promise<docket_bill_activation_receipt> {
  const result = await query_with_diagnostics<{ receipt: unknown }>(
    `select public.register_docket_legislative_version_spine($1::integer, true) as receipt`,
    [source_bill_id],
    {
      label: "docket_bill_activation_register_version_spine",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 30_000,
    },
  );
  return normalize_registration_receipt(result.rows[0]?.receipt);
}

async function mark_job_terminal(input: {
  job: docket_bill_activation_job;
  queue_state: "completed" | "source_unavailable";
  receipt: docket_bill_activation_receipt;
}): Promise<void> {
  await query_with_diagnostics(
    `update public.docket_bill_processing_queue
        set queue_state = $2,
            attempt_count = attempt_count + 1,
            completed_at = now(),
            locked_at = null,
            locked_by = null,
            last_failure_class = null,
            last_error_code = null,
            receipt_json = receipt_json || $3::jsonb,
            updated_at = now()
      where queue_id = $1::uuid
        and locked_by = $4`,
    [
      input.job.queue_id,
      input.queue_state,
      JSON.stringify({
        ...input.receipt,
        terminal_state: input.queue_state,
        completed_at: new Date().toISOString(),
      }),
      queue_worker_id,
    ],
    {
      label: "docket_bill_activation_queue_terminal",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );

  console.log("[DocketJurisdictionActivation] completed", {
    queue_id: input.job.queue_id,
    source_bill_id: input.job.source_bill_id,
    state: input.job.state,
    queue_state: input.queue_state,
    registered_document_count: input.receipt.registered_document_count,
    text_version_count: input.receipt.text_version_count,
    amendment_count: input.receipt.amendment_count,
    queued_or_refreshed_count: input.receipt.queued_or_refreshed_count,
  });
}

async function mark_job_failed(input: {
  job: docket_bill_activation_job;
  decision: docket_bill_activation_failure_decision;
}): Promise<void> {
  await query_with_diagnostics(
    `update public.docket_bill_processing_queue queue
        set queue_state = $2,
            attempt_count = attempt_count + 1,
            next_attempt_at = case
              when $5::boolean then queue.next_attempt_at
              else now() + make_interval(secs => $6::integer)
            end,
            locked_at = null,
            locked_by = null,
            last_failure_class = $3,
            last_error_code = $4,
            receipt_json = receipt_json || jsonb_build_object(
              'failure_class', $3::text,
              'failure_code', $4::text,
              'failed_at', now()
            ),
            updated_at = now()
      where queue.queue_id = $1::uuid
        and queue.locked_by = $7`,
    [
      input.job.queue_id,
      input.decision.queue_state,
      input.decision.failure_class,
      input.decision.error_code,
      input.decision.terminal,
      input.decision.retry_delay_seconds,
      queue_worker_id,
    ],
    {
      label: "docket_bill_activation_queue_fail",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );

  console.error("[DocketJurisdictionActivation] failed", {
    queue_id: input.job.queue_id,
    source_bill_id: input.job.source_bill_id,
    state: input.job.state,
    queue_state: input.decision.queue_state,
    failure_class: input.decision.failure_class,
    error_code: input.decision.error_code,
    retry_delay_seconds: input.decision.retry_delay_seconds,
  });
}

export async function process_docket_bill_activation_job(
  job: docket_bill_activation_job,
): Promise<void> {
  let receipt: docket_bill_activation_receipt;
  try {
    await ensure_civic_genome_bill_ready(job);
    const bill = await get_bill(job.source_bill_id);
    await cache_bill_detail(job.source_bill_id, bill);
    receipt = await register_legislative_versions(job.source_bill_id);
  } catch (error) {
    const decision = classify_docket_bill_activation_failure({
      error,
      prior_attempt_count: job.attempt_count,
    });
    await mark_job_failed({ job, decision });
    return;
  }

  const queue_state = receipt.registered_document_count > 0
    ? "completed" as const
    : "source_unavailable" as const;
  try {
    await mark_job_terminal({
      job,
      queue_state,
      receipt,
    });
  } catch (error) {
    // The provider fetch, cache write and version-spine registration already
    // succeeded. A terminal queue-ledger write failure is bookkeeping only;
    // leaving the lease in place allows the existing stale-lease retry path to
    // replay the idempotent registration rather than inventing a false failure.
    console.error("[DocketJurisdictionActivation] completion_deferred", {
      queue_id: job.queue_id,
      source_bill_id: job.source_bill_id,
      state: job.state,
      intended_queue_state: queue_state,
      genome_bill_id: receipt.genome_bill_id,
      registered_document_count: receipt.registered_document_count,
      error_code: safe_error_code(error),
    });
  }
}

export async function run_docket_bill_activation_queue_cycle(): Promise<void> {
  if (queue_cycle_running || queue_stopped) return;
  queue_cycle_running = true;
  try {
    const jobs = await claim_jobs(bounded_concurrency());
    await Promise.all(jobs.map(job => process_docket_bill_activation_job(job)));
  } catch (error) {
    console.error("[DocketJurisdictionActivation] cycle_failed", {
      error_class: error instanceof Error ? error.name : "unknown",
      error_code: safe_error_code(error),
    });
  } finally {
    queue_cycle_running = false;
  }
}

export function start_docket_bill_activation_queue_worker(): void {
  if (queue_timer || !queue_enabled()) return;
  queue_stopped = false;
  const interval_ms = bounded_poll_interval();
  const concurrency = bounded_concurrency();
  console.log("[DocketJurisdictionActivation] started", {
    worker_id: queue_worker_id,
    interval_ms,
    concurrency,
    lease_minutes: QUEUE_LEASE_MINUTES,
  });
  void run_docket_bill_activation_queue_cycle();
  queue_timer = setInterval(() => {
    void run_docket_bill_activation_queue_cycle();
  }, interval_ms);
  queue_timer.unref?.();
}

export function stop_docket_bill_activation_queue_worker(): void {
  queue_stopped = true;
  if (queue_timer) clearInterval(queue_timer);
  queue_timer = null;
}

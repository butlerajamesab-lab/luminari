import { randomUUID } from "crypto";
import { query_with_diagnostics } from "../db";
import { activate_prism_for_rosetta_assembly } from "./prism-rosetta-activation";
import {
  PRISM_ROSETTA_RULE_SET_ID,
  PRISM_ROSETTA_RULE_SET_VERSION,
} from "./prism-verification-contract";
import { PrismBoundaryError } from "./prism-verification-client";

const DEFAULT_POLL_INTERVAL_MS = 10_000;
const MIN_POLL_INTERVAL_MS = 5_000;
const MAX_POLL_INTERVAL_MS = 300_000;
const QUEUE_LEASE_MINUTES = 60;
const UNKNOWN_FAILURE_LIMIT = 5;

export type prism_rosetta_queue_state =
  | "eligible"
  | "submitted"
  | "receipt_partial"
  | "completed"
  | "degraded"
  | "permanent_failure"
  | "superseded";

type prism_rosetta_queue_job = {
  queue_id: string;
  assembly_run_id: string;
  genome_bill_id: string;
  expected_trait_count: number;
  receipt_count: number;
  attempt_count: number;
};

export type prism_queue_failure_decision = {
  queue_state: "receipt_partial" | "degraded" | "permanent_failure";
  failure_class: string;
  error_code: string;
  retry_delay_seconds: number;
  terminal: boolean;
};

let queue_timer: NodeJS.Timeout | null = null;
let queue_cycle_running = false;
let queue_stopped = false;
const queue_worker_id = [
  process.env.RENDER_SERVICE_ID ?? "lighthouse",
  process.pid,
  randomUUID(),
].join(":");

function bounded_poll_interval(): number {
  const parsed = Number.parseInt(
    process.env.PRISM_ROSETTA_QUEUE_POLL_MS ?? "",
    10,
  );
  if (!Number.isFinite(parsed)) return DEFAULT_POLL_INTERVAL_MS;
  return Math.max(MIN_POLL_INTERVAL_MS, Math.min(MAX_POLL_INTERVAL_MS, parsed));
}

function queue_enabled(): boolean {
  const configured = process.env.PRISM_ROSETTA_QUEUE_ENABLED?.trim().toLowerCase();
  if (configured === "false") return false;
  if (configured === "true") return true;
  return process.env.NODE_ENV === "production";
}

export function prism_queue_retry_delay_seconds(failure_number: number): number {
  const exponent = Math.max(0, Math.min(7, failure_number - 1));
  return Math.min(3_600, 30 * (2 ** exponent));
}

function safe_error_code(error: unknown): string {
  const raw = error instanceof Error ? error.message : "unknown_queue_failure";
  return raw
    .replace(/[^a-zA-Z0-9:_-]/g, "_")
    .slice(0, 256) || "unknown_queue_failure";
}

function deterministic_contract_failure(error_code: string): boolean {
  return [
    "prism_rosetta_assembly_",
    "prism_rosetta_trait_",
    "prism_rosetta_source_",
    "prism_rosetta_identity_",
    "prism_rosetta_binding_",
    "prism_rosetta_run_receipt_",
    "prism_rosetta_receipt_count_",
    "prism_rosetta_completion_timestamp_",
  ].some(prefix => error_code.startsWith(prefix));
}

export function classify_prism_queue_failure(input: {
  error: unknown;
  prior_attempt_count: number;
  receipt_count: number;
}): prism_queue_failure_decision {
  const error_code = safe_error_code(input.error);
  const failure_number = input.prior_attempt_count + 1;
  let failure_class = "unknown";
  let terminal = deterministic_contract_failure(error_code);

  if (input.error instanceof PrismBoundaryError) {
    failure_class = input.error.failure_class;
    terminal = [
      "validation",
      "request_id_conflict",
      "permanent_upstream",
    ].includes(input.error.failure_class);
  } else if (!terminal && failure_number >= UNKNOWN_FAILURE_LIMIT) {
    terminal = true;
  }

  return {
    queue_state: terminal
      ? "permanent_failure"
      : input.receipt_count > 0
        ? "receipt_partial"
        : "degraded",
    failure_class,
    error_code,
    retry_delay_seconds: terminal
      ? 0
      : prism_queue_retry_delay_seconds(failure_number),
    terminal,
  };
}

async function reconcile_completed_jobs(): Promise<void> {
  await query_with_diagnostics(
    `update public.civic_genome_prism_verification_queue queue
        set queue_state = 'completed',
            receipt_count = verification.receipt_count,
            completed_at = verification.completed_at,
            locked_at = null,
            locked_by = null,
            last_failure_class = null,
            last_error_code = null,
            updated_at = now()
       from public.civic_genome_prism_verification_run verification
      where queue.assembly_run_id = verification.assembly_run_id
        and queue.prism_rule_set_id = verification.prism_rule_set_id
        and queue.prism_rule_set_version = verification.prism_rule_set_version
        and verification.receipt_count = verification.expected_trait_count
        and verification.expected_trait_count = queue.expected_trait_count
        and queue.queue_state <> 'completed'`,
    [],
    {
      label: "prism_rosetta_queue_reconcile_completed",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
}

async function claim_next_job(): Promise<prism_rosetta_queue_job | null> {
  const result = await query_with_diagnostics<prism_rosetta_queue_job>(
    `with candidate as (
       select queue.queue_id
         from public.civic_genome_prism_verification_queue queue
        where queue.prism_rule_set_id = $2
          and queue.prism_rule_set_version = $3
          and queue.next_attempt_at <= now()
          and (
            queue.queue_state in ('eligible', 'degraded', 'receipt_partial')
            or (
              queue.queue_state = 'submitted'
              and queue.locked_at < now() - make_interval(mins => $4::integer)
            )
          )
          and (
            queue.locked_at is null
            or queue.locked_at < now() - make_interval(mins => $4::integer)
          )
          and not exists (
            select 1
              from public.civic_genome_prism_verification_run verification
             where verification.assembly_run_id = queue.assembly_run_id
               and verification.prism_rule_set_id = queue.prism_rule_set_id
               and verification.prism_rule_set_version = queue.prism_rule_set_version
               and verification.receipt_count = verification.expected_trait_count
          )
        order by queue.eligible_at, queue.queue_id
        for update skip locked
        limit 1
     )
     update public.civic_genome_prism_verification_queue queue
        set queue_state = 'submitted',
            locked_at = now(),
            locked_by = $1,
            updated_at = now()
       from candidate
      where queue.queue_id = candidate.queue_id
      returning queue.queue_id::text,
                queue.assembly_run_id::text,
                queue.genome_bill_id::text,
                queue.expected_trait_count,
                queue.receipt_count,
                queue.attempt_count`,
    [
      queue_worker_id,
      PRISM_ROSETTA_RULE_SET_ID,
      PRISM_ROSETTA_RULE_SET_VERSION,
      QUEUE_LEASE_MINUTES,
    ],
    {
      label: "prism_rosetta_queue_claim",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
  return result.rows[0] ?? null;
}

async function observed_receipt_count(job: prism_rosetta_queue_job): Promise<number> {
  const result = await query_with_diagnostics<{ receipt_count: number }>(
    `select count(*)::integer as receipt_count
       from public.civic_genome_prism_verification_binding receipt
      where receipt.assembly_run_id = $1::uuid
        and receipt.prism_rule_set_id = $2
        and receipt.prism_rule_set_version = $3`,
    [
      job.assembly_run_id,
      PRISM_ROSETTA_RULE_SET_ID,
      PRISM_ROSETTA_RULE_SET_VERSION,
    ],
    {
      label: "prism_rosetta_queue_receipt_count",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
  return result.rows[0]?.receipt_count ?? 0;
}

async function mark_job_completed(input: {
  job: prism_rosetta_queue_job;
  receipt_count: number;
}): Promise<void> {
  if (input.receipt_count !== input.job.expected_trait_count) {
    throw new Error(
      `prism_rosetta_queue_receipt_count_mismatch:${input.job.expected_trait_count}:${input.receipt_count}`,
    );
  }
  await query_with_diagnostics(
    `update public.civic_genome_prism_verification_queue
        set queue_state = 'completed',
            receipt_count = $2,
            attempt_count = attempt_count + 1,
            completed_at = now(),
            locked_at = null,
            locked_by = null,
            last_failure_class = null,
            last_error_code = null,
            updated_at = now()
      where queue_id = $1::uuid
        and locked_by = $3`,
    [input.job.queue_id, input.receipt_count, queue_worker_id],
    {
      label: "prism_rosetta_queue_complete",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
}

async function mark_job_failed(input: {
  job: prism_rosetta_queue_job;
  decision: prism_queue_failure_decision;
  receipt_count: number;
}): Promise<void> {
  await query_with_diagnostics(
    `update public.civic_genome_prism_verification_queue
        set queue_state = $2,
            receipt_count = $3,
            attempt_count = attempt_count + 1,
            next_attempt_at = case
              when $6::boolean then next_attempt_at
              else now() + make_interval(secs => $7::integer)
            end,
            locked_at = null,
            locked_by = null,
            last_failure_class = $4,
            last_error_code = $5,
            updated_at = now()
      where queue_id = $1::uuid
        and locked_by = $8`,
    [
      input.job.queue_id,
      input.decision.queue_state,
      input.receipt_count,
      input.decision.failure_class,
      input.decision.error_code,
      input.decision.terminal,
      input.decision.retry_delay_seconds,
      queue_worker_id,
    ],
    {
      label: "prism_rosetta_queue_fail",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
}

async function process_job(job: prism_rosetta_queue_job): Promise<void> {
  try {
    const result = await activate_prism_for_rosetta_assembly({
      genome_bill_id: job.genome_bill_id,
      assembly_run_id: job.assembly_run_id,
    });
    await mark_job_completed({
      job,
      receipt_count: result.receipt_count,
    });
    console.log("[PrismRosettaQueue] completed", {
      queue_id: job.queue_id,
      assembly_run_id: job.assembly_run_id,
      genome_bill_id: job.genome_bill_id,
      expected_trait_count: job.expected_trait_count,
      receipt_count: result.receipt_count,
      verification_run_id: result.verification_run_id,
      replayed: result.replayed,
    });
  } catch (error) {
    const receipt_count = await observed_receipt_count(job).catch(() => job.receipt_count);
    const decision = classify_prism_queue_failure({
      error,
      prior_attempt_count: job.attempt_count,
      receipt_count,
    });
    await mark_job_failed({ job, decision, receipt_count });
    console.error("[PrismRosettaQueue] failed", {
      queue_id: job.queue_id,
      assembly_run_id: job.assembly_run_id,
      genome_bill_id: job.genome_bill_id,
      expected_trait_count: job.expected_trait_count,
      receipt_count,
      queue_state: decision.queue_state,
      failure_class: decision.failure_class,
      error_code: decision.error_code,
      retry_delay_seconds: decision.retry_delay_seconds,
    });
  }
}

async function run_queue_cycle(): Promise<void> {
  if (queue_cycle_running || queue_stopped) return;
  queue_cycle_running = true;
  try {
    await reconcile_completed_jobs();
    const job = await claim_next_job();
    if (job) await process_job(job);
  } catch (error) {
    console.error("[PrismRosettaQueue] cycle_failed", {
      error_class: error instanceof Error ? error.name : "unknown",
      error_code: safe_error_code(error),
    });
  } finally {
    queue_cycle_running = false;
  }
}

export function start_prism_rosetta_queue_worker(): void {
  if (queue_timer || !queue_enabled()) {
    if (!queue_enabled()) {
      console.log("[PrismRosettaQueue] disabled");
    }
    return;
  }
  queue_stopped = false;
  const interval_ms = bounded_poll_interval();
  console.log("[PrismRosettaQueue] started", {
    worker_id: queue_worker_id,
    interval_ms,
    lease_minutes: QUEUE_LEASE_MINUTES,
    rule_set_id: PRISM_ROSETTA_RULE_SET_ID,
    rule_set_version: PRISM_ROSETTA_RULE_SET_VERSION,
  });
  void run_queue_cycle();
  queue_timer = setInterval(() => {
    void run_queue_cycle();
  }, interval_ms);
  queue_timer.unref?.();
}

export function stop_prism_rosetta_queue_worker(): void {
  queue_stopped = true;
  if (queue_timer) clearInterval(queue_timer);
  queue_timer = null;
}

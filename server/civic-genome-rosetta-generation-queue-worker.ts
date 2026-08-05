import { randomUUID } from "node:crypto";
import { query_with_diagnostics } from "./db";
import { assemble_rosetta_and_resolve_family } from "./civic-genome-rosetta-family-orchestration";

const DEFAULT_POLL_INTERVAL_MS = 10_000;
const MIN_POLL_INTERVAL_MS = 5_000;
const MAX_POLL_INTERVAL_MS = 300_000;
const QUEUE_LEASE_MINUTES = 60;
const MAX_ATTEMPTS = 5;

export type rosetta_generation_activation_queue_job = {
  activation_id: string;
  genome_bill_id: string;
  source_document_id: number;
  extraction_run_id: number;
  attempt_count: number;
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
    process.env.ROSETTA_GENOME_ACTIVATION_QUEUE_POLL_MS ?? "",
    10,
  );
  if (!Number.isFinite(parsed)) return DEFAULT_POLL_INTERVAL_MS;
  return Math.max(MIN_POLL_INTERVAL_MS, Math.min(MAX_POLL_INTERVAL_MS, parsed));
}

function queue_enabled(): boolean {
  const configured = process.env.ROSETTA_GENOME_ACTIVATION_QUEUE_ENABLED
    ?.trim()
    .toLowerCase();
  if (configured === "false") return false;
  if (configured === "true") return true;
  return process.env.NODE_ENV === "production";
}

function safe_error_code(error: unknown): string {
  const raw = error instanceof Error ? error.message : "unknown_rosetta_generation_activation_failure";
  return raw
    .replace(/[^a-zA-Z0-9:_-]/g, "_")
    .slice(0, 256) || "unknown_rosetta_generation_activation_failure";
}

export function rosetta_generation_activation_retry_delay_seconds(
  prior_attempt_count: number,
): number {
  const exponent = Math.max(0, Math.min(7, prior_attempt_count));
  return Math.min(3_600, 30 * (2 ** exponent));
}

async function claim_next_job(): Promise<rosetta_generation_activation_queue_job | null> {
  const result = await query_with_diagnostics<rosetta_generation_activation_queue_job>(
    `with candidate as (
       select activation.activation_id
         from public.civic_genome_rosetta_generation_activation_queue activation
        where activation.next_attempt_at <= now()
          and activation.attempt_count < $2::integer
          and (
            activation.queue_state in ('eligible', 'failed')
            or (
              activation.queue_state = 'submitted'
              and activation.locked_at < now() - make_interval(mins => $3::integer)
            )
          )
          and (
            activation.locked_at is null
            or activation.locked_at < now() - make_interval(mins => $3::integer)
          )
        order by activation.created_at, activation.activation_id
        for update skip locked
        limit 1
     )
     update public.civic_genome_rosetta_generation_activation_queue activation
        set queue_state = 'submitted',
            locked_at = now(),
            locked_by = $1,
            updated_at = now()
       from candidate
      where activation.activation_id = candidate.activation_id
      returning activation.activation_id::text,
                activation.genome_bill_id::text,
                activation.source_document_id::integer,
                activation.extraction_run_id::integer,
                activation.attempt_count`,
    [queue_worker_id, MAX_ATTEMPTS, QUEUE_LEASE_MINUTES],
    {
      label: "rosetta_generation_activation_queue_claim",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
  return result.rows[0] ?? null;
}

async function mark_job_completed(input: {
  job: rosetta_generation_activation_queue_job;
  assembly_run_id: string;
}): Promise<void> {
  await query_with_diagnostics(
    `update public.civic_genome_rosetta_generation_activation_queue
        set queue_state = 'completed',
            attempt_count = attempt_count + 1,
            assembly_run_id = $2::uuid,
            completed_at = now(),
            locked_at = null,
            locked_by = null,
            last_error_code = null,
            updated_at = now()
      where activation_id = $1::uuid
        and locked_by = $3`,
    [input.job.activation_id, input.assembly_run_id, queue_worker_id],
    {
      label: "rosetta_generation_activation_queue_complete",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
}

async function mark_job_failed(input: {
  job: rosetta_generation_activation_queue_job;
  error_code: string;
}): Promise<void> {
  const delay = rosetta_generation_activation_retry_delay_seconds(
    input.job.attempt_count,
  );
  await query_with_diagnostics(
    `update public.civic_genome_rosetta_generation_activation_queue
        set queue_state = 'failed',
            attempt_count = attempt_count + 1,
            next_attempt_at = now() + make_interval(secs => $3::integer),
            locked_at = null,
            locked_by = null,
            last_error_code = $2,
            updated_at = now()
      where activation_id = $1::uuid
        and locked_by = $4`,
    [input.job.activation_id, input.error_code, delay, queue_worker_id],
    {
      label: "rosetta_generation_activation_queue_fail",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
}

export async function process_rosetta_generation_activation_job(
  job: rosetta_generation_activation_queue_job,
): Promise<void> {
  try {
    const result = await assemble_rosetta_and_resolve_family({
      genome_bill_id: job.genome_bill_id,
      source_document_id: job.source_document_id,
      extraction_run_id: job.extraction_run_id,
    });
    await mark_job_completed({
      job,
      assembly_run_id: result.assembly_run_id,
    });
    console.log("[RosettaGenerationQueue] completed", {
      activation_id: job.activation_id,
      genome_bill_id: job.genome_bill_id,
      source_document_id: job.source_document_id,
      extraction_run_id: job.extraction_run_id,
      assembly_run_id: result.assembly_run_id,
      trait_count: result.trait_count,
      verification_state: result.verification_state,
      family_resolution_status: result.family_resolution.status,
      replayed: result.replayed,
    });
  } catch (error) {
    const error_code = safe_error_code(error);
    await mark_job_failed({ job, error_code });
    console.error("[RosettaGenerationQueue] failed", {
      activation_id: job.activation_id,
      genome_bill_id: job.genome_bill_id,
      source_document_id: job.source_document_id,
      extraction_run_id: job.extraction_run_id,
      prior_attempt_count: job.attempt_count,
      error_code,
    });
  }
}

export async function run_rosetta_generation_activation_queue_cycle(): Promise<void> {
  if (queue_cycle_running || queue_stopped) return;
  queue_cycle_running = true;
  try {
    const job = await claim_next_job();
    if (job) await process_rosetta_generation_activation_job(job);
  } catch (error) {
    console.error("[RosettaGenerationQueue] cycle_failed", {
      error_class: error instanceof Error ? error.name : "unknown",
      error_code: safe_error_code(error),
    });
  } finally {
    queue_cycle_running = false;
  }
}

export function start_rosetta_generation_activation_queue_worker(): void {
  if (queue_timer || !queue_enabled()) return;
  queue_stopped = false;
  const interval_ms = bounded_poll_interval();
  console.log("[RosettaGenerationQueue] started", {
    worker_id: queue_worker_id,
    interval_ms,
    max_attempts: MAX_ATTEMPTS,
  });
  void run_rosetta_generation_activation_queue_cycle();
  queue_timer = setInterval(() => {
    void run_rosetta_generation_activation_queue_cycle();
  }, interval_ms);
  queue_timer.unref?.();
}

export function stop_rosetta_generation_activation_queue_worker(): void {
  queue_stopped = true;
  if (queue_timer) clearInterval(queue_timer);
  queue_timer = null;
}

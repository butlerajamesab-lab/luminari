import { randomUUID } from "node:crypto";

import { query_with_diagnostics } from "./db";
import { process_legislative_version } from "./civic-genome-legislative-version-pipeline";

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const MIN_POLL_INTERVAL_MS = 250;
const MAX_POLL_INTERVAL_MS = 60_000;
const DEFAULT_CONCURRENCY = 8;
const MAX_CONCURRENCY = 32;
const QUEUE_LEASE_MINUTES = 60;
const UNKNOWN_FAILURE_LIMIT = 5;

export type legislative_version_queue_job = {
  queue_id: string;
  bill_version_id: string;
  source_document_key: string;
  source_bill_id: number;
  document_family: "text" | "amendment";
  version_type: string;
  attempt_count: number;
};

export type legislative_version_failure_decision = {
  queue_state: "degraded" | "permanent_failure";
  failure_class: "transient" | "deterministic_contract" | "unknown";
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

function bounded_integer(input: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number.parseInt(input ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function bounded_poll_interval(): number {
  return bounded_integer(
    process.env.LEGISLATIVE_VERSION_QUEUE_POLL_MS,
    DEFAULT_POLL_INTERVAL_MS,
    MIN_POLL_INTERVAL_MS,
    MAX_POLL_INTERVAL_MS,
  );
}

function bounded_concurrency(): number {
  return bounded_integer(
    process.env.LEGISLATIVE_VERSION_QUEUE_CONCURRENCY,
    DEFAULT_CONCURRENCY,
    1,
    MAX_CONCURRENCY,
  );
}

function queue_enabled(): boolean {
  const configured = process.env.LEGISLATIVE_VERSION_QUEUE_ENABLED
    ?.trim()
    .toLowerCase();
  if (configured === "false") return false;
  if (configured === "true") return true;
  return process.env.NODE_ENV === "production";
}

function safe_error_code(error: unknown): string {
  const raw = error instanceof Error
    ? error.message
    : "unknown_legislative_version_failure";
  return raw
    .replace(/[^a-zA-Z0-9:_-]/g, "_")
    .slice(0, 500) || "unknown_legislative_version_failure";
}

function deterministic_failure(error_code: string): boolean {
  return [
    "legislative_version_not_found",
    "legislative_version_source_url_invalid",
    "legislative_version_source_format_unsupported",
    "legislative_version_source_is_not_pdf",
    "legislative_version_pdf_text_incomplete",
    "legislative_version_html_text_incomplete",
    "legislative_version_reference_date_unavailable",
    "legislative_version_extraction_source_document_mismatch",
    "legislative_version_extraction_not_admissible",
    "legislative_version_extraction_output_hash_missing",
    "rosetta_source_document_already_bound_to_other_bill",
    "rosetta_source_identity_binding_changed",
    "rosetta_completed_run_has_no_objects",
    "rosetta_object_source_span_missing",
    "rosetta_five_layer_coverage_not_terminal",
  ].some(prefix => error_code.startsWith(prefix));
}

export function legislative_version_retry_delay_seconds(
  failure_number: number,
): number {
  const exponent = Math.max(0, Math.min(7, failure_number - 1));
  return Math.min(3_600, 30 * (2 ** exponent));
}

export function classify_legislative_version_failure(input: {
  error: unknown;
  prior_attempt_count: number;
}): legislative_version_failure_decision {
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
      : legislative_version_retry_delay_seconds(failure_number),
    terminal,
  };
}

async function reconcile_completed_jobs(): Promise<void> {
  await query_with_diagnostics(
    `update public.civic_genome_legislative_version_queue queue
        set queue_state = 'completed',
            completed_at = coalesce(queue.completed_at, version.updated_at),
            locked_at = null,
            locked_by = null,
            last_failure_class = null,
            last_error_code = null,
            updated_at = now()
       from public.civic_genome_bill_version version
      where version.bill_version_id = queue.bill_version_id
        and version.assembly_run_id is not null
        and version.processing_state in ('assembled', 'verification_partial', 'verified')
        and queue.queue_state <> 'completed'`,
    [],
    {
      label: "legislative_version_queue_reconcile_completed",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
}

async function claim_jobs(limit: number): Promise<legislative_version_queue_job[]> {
  const result = await query_with_diagnostics<legislative_version_queue_job>(
    `with host_activity as (
       select split_part(lower(document.source_url), '/', 3) as source_host,
              max(queue.updated_at) filter (
                where queue.attempt_count > 0
              ) as last_attempt_at,
              max(queue.next_attempt_at) filter (
                where queue.queue_state = 'degraded'
                  and queue.next_attempt_at > now()
              ) as blocked_until
         from public.civic_genome_legislative_version_queue queue
         join public.civic_genome_bill_version version
           on version.bill_version_id = queue.bill_version_id
         join public.docket_bill_source_document document
           on document.source_document_key = version.source_document_key
        group by split_part(lower(document.source_url), '/', 3)
     ), candidate as (
       select queue.queue_id
         from public.civic_genome_legislative_version_queue queue
         join public.civic_genome_bill_version version
           on version.bill_version_id = queue.bill_version_id
         join public.docket_bill_source_document document
           on document.source_document_key = version.source_document_key
         join host_activity source_host
           on source_host.source_host = split_part(lower(document.source_url), '/', 3)
         cross join lateral (
           select not exists (
             select 1
               from public.civic_genome_bill_version newer
              where newer.genome_bill_id = version.genome_bill_id
                and (
                  newer.stage_rank > version.stage_rank
                  or (
                    newer.stage_rank = version.stage_rank
                    and newer.provider_sequence > version.provider_sequence
                  )
                )
           ) as is_current
         ) currency
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
          and version.processing_state not in ('verified', 'verified_with_findings')
          and coalesce(source_host.blocked_until, '-infinity'::timestamptz) <= now()
        order by source_host.last_attempt_at asc nulls first,
                 case when queue.priority < 0 then 0 else 1 end,
                 currency.is_current desc,
                 case when currency.is_current then version.stage_rank else 0 end desc,
                 queue.priority,
                 queue.created_at,
                 queue.queue_id
        for update of queue skip locked
        limit $3::integer
     )
     update public.civic_genome_legislative_version_queue queue
        set queue_state = 'submitted',
            locked_at = now(),
            locked_by = $1,
            updated_at = now()
       from candidate,
            public.civic_genome_bill_version version
      join public.docket_bill_source_document document
        on document.source_document_key = version.source_document_key
      where queue.queue_id = candidate.queue_id
        and version.bill_version_id = queue.bill_version_id
      returning queue.queue_id::text,
                version.bill_version_id::text,
                version.source_document_key,
                version.source_bill_id,
                version.document_family,
                version.version_type,
                queue.attempt_count`,
    [queue_worker_id, QUEUE_LEASE_MINUTES, limit],
    {
      label: "legislative_version_queue_claim",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
  return result.rows;
}

async function mark_job_completed(input: {
  job: legislative_version_queue_job;
  assembly_run_id: string;
}): Promise<void> {
  await query_with_diagnostics(
    `update public.civic_genome_legislative_version_queue
        set queue_state = 'completed',
            attempt_count = attempt_count + 1,
            completed_at = now(),
            locked_at = null,
            locked_by = null,
            last_failure_class = null,
            last_error_code = null,
            updated_at = now()
      where queue_id = $1::uuid
        and locked_by = $2`,
    [input.job.queue_id, queue_worker_id],
    {
      label: "legislative_version_queue_complete",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
  console.log("[LegislativeVersionQueue] completed", {
    queue_id: input.job.queue_id,
    bill_version_id: input.job.bill_version_id,
    source_document_key: input.job.source_document_key,
    source_bill_id: input.job.source_bill_id,
    document_family: input.job.document_family,
    version_type: input.job.version_type,
    assembly_run_id: input.assembly_run_id,
  });
}

async function mark_job_failed(input: {
  job: legislative_version_queue_job;
  decision: legislative_version_failure_decision;
}): Promise<void> {
  await query_with_diagnostics(
    `update public.civic_genome_legislative_version_queue queue
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
      label: "legislative_version_queue_fail",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );

  await query_with_diagnostics(
    `update public.civic_genome_bill_version
        set processing_state = 'failed',
            failure_code = $2,
            receipt_json = receipt_json || jsonb_build_object(
              'failure_class', $3::text,
              'failure_code', $2::text,
              'failed_at', now()
            ),
            updated_at = now()
      where bill_version_id = $1::uuid`,
    [
      input.job.bill_version_id,
      input.decision.error_code,
      input.decision.failure_class,
    ],
    {
      label: "legislative_version_record_failure",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );

  console.error("[LegislativeVersionQueue] failed", {
    queue_id: input.job.queue_id,
    bill_version_id: input.job.bill_version_id,
    source_document_key: input.job.source_document_key,
    source_bill_id: input.job.source_bill_id,
    document_family: input.job.document_family,
    version_type: input.job.version_type,
    queue_state: input.decision.queue_state,
    failure_class: input.decision.failure_class,
    error_code: input.decision.error_code,
    retry_delay_seconds: input.decision.retry_delay_seconds,
  });
}

export async function process_legislative_version_job(
  job: legislative_version_queue_job,
): Promise<void> {
  try {
    const result = await process_legislative_version(job.bill_version_id);
    await mark_job_completed({
      job,
      assembly_run_id: result.assembly.assembly_run_id,
    });
  } catch (error) {
    const decision = classify_legislative_version_failure({
      error,
      prior_attempt_count: job.attempt_count,
    });
    await mark_job_failed({ job, decision });
  }
}

export async function run_legislative_version_queue_cycle(): Promise<void> {
  if (queue_cycle_running || queue_stopped) return;
  queue_cycle_running = true;
  try {
    await reconcile_completed_jobs();
    const jobs = await claim_jobs(bounded_concurrency());
    await Promise.all(jobs.map(job => process_legislative_version_job(job)));
  } catch (error) {
    console.error("[LegislativeVersionQueue] cycle_failed", {
      error_class: error instanceof Error ? error.name : "unknown",
      error_code: safe_error_code(error),
    });
  } finally {
    queue_cycle_running = false;
  }
}

export function start_legislative_version_queue_worker(): void {
  if (queue_timer || !queue_enabled()) return;
  queue_stopped = false;
  const interval_ms = bounded_poll_interval();
  const concurrency = bounded_concurrency();
  console.log("[LegislativeVersionQueue] started", {
    worker_id: queue_worker_id,
    interval_ms,
    concurrency,
    lease_minutes: QUEUE_LEASE_MINUTES,
  });
  void run_legislative_version_queue_cycle();
  queue_timer = setInterval(() => {
    void run_legislative_version_queue_cycle();
  }, interval_ms);
  queue_timer.unref?.();
}

export function stop_legislative_version_queue_worker(): void {
  queue_stopped = true;
  if (queue_timer) clearInterval(queue_timer);
  queue_timer = null;
}

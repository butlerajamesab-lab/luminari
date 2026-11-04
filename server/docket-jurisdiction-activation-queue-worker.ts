import { randomUUID } from "node:crypto";

import { project_docket_bulk_bill_to_civic_genome, project_docket_state_cache_to_civic_genome_serialized } from "./civic-genome-projection";
import { query_with_diagnostics } from "./db";
import { accept_docket_bill_detail } from "./docket-bill-detail-acceptance";
import { get_bill, type legiscan_bill_detail } from "./services/legiscan";
import { background_feature_enabled } from "./runtime-role";

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const MIN_POLL_INTERVAL_MS = 250;
const MAX_POLL_INTERVAL_MS = 60_000;
const DEFAULT_CONCURRENCY = 1;
const MAX_CONCURRENCY = 32;
const QUEUE_LEASE_MINUTES = 30;
const UNKNOWN_FAILURE_LIMIT = 5;

export type docket_bill_activation_job = {
  queue_id: string;
  source_bill_id: number;
  state: string;
  session_id: number;
  activation_source: string;
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
  consume_attempt: boolean;
};

let queue_timer: NodeJS.Timeout | null = null;
let active_queue_cycle: Promise<void> | null = null;
let queue_stopped = false;
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
  return background_feature_enabled("DOCKET_BILL_ACTIVATION_QUEUE_ENABLED");
}

/**
 * Restrict the existing canonical worker to provenance-bearing ZIP activations
 * when running the credit-free Docket archive host. Default preserves the
 * current live API worker's existing behavior.
 */
export type docket_activation_source_scope = "all" | "legiscan_bulk_json";

export function resolve_docket_activation_source_scope(
  environment: NodeJS.ProcessEnv = process.env,
): docket_activation_source_scope {
  const configured = environment.DOCKET_BILL_ACTIVATION_SOURCE_SCOPE ?? "all";
  if (configured === "all" || configured === "legiscan_bulk_json") return configured;
  throw new Error("docket_bill_activation_invalid_source_scope");
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

function shared_provider_failure(error_code: string): boolean {
  return error_code.startsWith("legiscan_shared_api_error_while_calling_")
    || error_code.startsWith("legiscan_http_429_while_calling_")
    || /^legiscan_http_5\d\d_while_calling_/.test(error_code)
    || error_code.startsWith("legiscan_network_")
    || error_code.startsWith("legiscan_request_timeout_while_calling_")
    || error_code.startsWith("legiscan_invalid_json_while_calling_")
    || error_code.startsWith("legiscan_invalid_status_while_calling_")
    || error_code === "legiscan_shared_provider_circuit_open"
    || error_code === "legiscan_local_monthly_budget_exhausted"
    || error_code === "legiscan_budget_guard_unavailable";
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

  // Provider/account capacity is infrastructure state, not a defect in the
  // legislative source. Preserve the queue item and do not spend its terminal
  // failure counter while the shared provider is unavailable.
  if (
    error_code === "Missing_required_environment_variable:_LEGISCAN_API_KEY"
    || shared_provider_failure(error_code)
  ) {
    return {
      queue_state: "degraded",
      failure_class: "transient",
      error_code,
      retry_delay_seconds:
        error_code === "Missing_required_environment_variable:_LEGISCAN_API_KEY"
          ? 300
          : 3_600,
      terminal: false,
      consume_attempt: false,
    };
  }

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
    consume_attempt: true,
  };
}

async function claim_jobs(limit: number): Promise<docket_bill_activation_job[]> {
  const result = await query_with_diagnostics<docket_bill_activation_job>(
    `with superseded as (
       -- A newer canonical API detail can replace an archive cache row before
       -- its archive activation is claimed. Settle only provenance-verified
       -- archive queue items, not live API jobs or unrelated old backlog.
       update public.docket_bill_processing_queue queue
          set queue_state = 'completed',
              completed_at = now(),
              locked_at = null,
              locked_by = null,
              last_failure_class = null,
              last_error_code = null,
              receipt_json = coalesce(queue.receipt_json, '{}'::jsonb) ||
                jsonb_build_object(
                  'terminal_state', 'superseded_by_live_api',
                  'superseding_source', detail.source,
                  'superseding_detail_fetched_at', detail.fetched_at,
                  'superseded_at', now()
                ),
              updated_at = now()
         from public.docket_jurisdiction_activation_bill binding
         join public.docket_jurisdiction_activation_run activation
           on activation.activation_id = binding.activation_id
          and activation.state = binding.state
          and activation.session_id = binding.session_id
         join public.docket_bill_detail_cache detail
           on detail.bill_id = binding.source_bill_id
        where queue.queue_id = binding.queue_id
          and queue.source_bill_id = binding.source_bill_id
          and activation.source = 'legiscan_bulk_json'
          and detail.source like 'legiscan_get_bill%'
          and detail.fetched_at > activation.cache_fetched_at
          and detail.bill ->> 'state' = activation.state
          and detail.bill ->> 'session_id' = activation.session_id::text
          and exists (
            select 1
              from public.docket_legiscan_bulk_member_receipt receipt
             where receipt.bill_id = queue.source_bill_id
               and receipt.member_kind = 'bill'
               and receipt.disposition = 'inserted'
          )
          and (
            queue.queue_state in ('eligible','degraded')
            or (queue.queue_state = 'submitted'
                and queue.locked_at < now() - make_interval(mins => $2::integer))
          )
        returning queue.queue_id
     ), candidate as (
       select queue.queue_id,
              activation.state,
              activation.session_id,
              activation.source as activation_source
         from public.docket_bill_processing_queue queue
         join public.docket_jurisdiction_activation_bill binding
           on binding.queue_id = queue.queue_id
          and binding.source_bill_id = queue.source_bill_id
         join public.docket_jurisdiction_activation_run activation
           on activation.activation_id = binding.activation_id
          and activation.state = binding.state
          and activation.session_id = binding.session_id
         left join public.docket_bill_state_cache cache
           on cache.state = activation.state
          and cache.session_id = activation.session_id
          and cache.fetched_at = activation.cache_fetched_at
        where (
          (
            cache.fetched_at >= now() - interval '24 hours'
            and extract(year from cache.fetched_at at time zone 'UTC')
                = extract(year from current_timestamp at time zone 'UTC')
            and exists (
              select 1
              from jsonb_array_elements(cache.bills)
                with ordinality as current_bill(value, ordinality)
              where current_bill.ordinality <= 100
                and coalesce(current_bill.value ->> 'bill_id', '') ~ '^[0-9]+$'
                and (current_bill.value ->> 'bill_id')::integer = queue.source_bill_id
            )
          )
          or (
            activation.source = 'legiscan_bulk_json'
            and exists (
              select 1 from public.docket_bill_detail_cache detail
              where detail.bill_id = queue.source_bill_id
                and detail.source = 'legiscan_bulk_json'
                and detail.fetched_at = activation.cache_fetched_at
                and detail.bill ->> 'state' = activation.state
                and detail.bill ->> 'session_id' = activation.session_id::text
            )
          )
        )
          and ($4::text = 'all' or activation.source = $4::text)
          and not exists (select 1 from superseded
                           where superseded.queue_id = queue.queue_id)
          and queue.next_attempt_at <= now()
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
                candidate.session_id,
                candidate.activation_source,
                queue.summary_fingerprint,
                queue.observed_change_hash,
                queue.attempt_count`,
    [queue_worker_id, QUEUE_LEASE_MINUTES, limit, resolve_docket_activation_source_scope()],
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
  const result = await project_docket_state_cache_to_civic_genome_serialized(normalized_state);
  console.log("[DocketJurisdictionActivation] projected_state", {
    state: normalized_state,
    bills_seen: result.bills_seen,
    inserted_count: result.inserted_count,
    updated_count: result.updated_count,
    unchanged_count: result.unchanged_count,
  });
}

async function read_docket_archive_detail(job: docket_bill_activation_job): Promise<{
  bill: legiscan_bill_detail;
  archive_sha256: string;
  member_path: string;
}> {
  const result = await query_with_diagnostics<{
    bill: legiscan_bill_detail; archive_sha256: string; member_path: string;
  }>(
    `select detail.bill, receipt.archive_sha256, receipt.member_path
       from public.docket_bill_detail_cache detail
       join public.docket_legiscan_bulk_member_receipt receipt
         on receipt.bill_id = detail.bill_id
        and receipt.member_kind = 'bill'
        and receipt.disposition = 'inserted'
      where detail.bill_id = $1::integer
        and detail.source = 'legiscan_bulk_json'
        and detail.bill ->> 'state' = $2::text
        and detail.bill ->> 'session_id' = $3::text
      order by receipt.imported_at asc, receipt.member_path asc
      limit 1`,
    [job.source_bill_id, job.state, String(job.session_id)],
    {
      label: "docket_bill_activation_archive_source_read",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
  const row = result.rows[0];
  if (!row) throw new Error("docket_bulk_verified_receipt_or_cache_missing");
  return row;
}

async function ensure_civic_genome_bill_ready(
  job: docket_bill_activation_job,
  archive?: { bill: legiscan_bill_detail; archive_sha256: string; member_path: string },
): Promise<void> {
  if (await civic_genome_bill_ready(job.source_bill_id)) return;
  if (archive) {
    // Both transports use the existing deterministic project_bill engine.
    await project_docket_bulk_bill_to_civic_genome({
      bill: archive.bill,
      archive_sha256: archive.archive_sha256,
      member_path: archive.member_path,
    });
  } else {
    await project_state_once(job.state);
  }
  if (!await civic_genome_bill_ready(job.source_bill_id)) {
    throw new Error("docket_civic_genome_projection_missing_after_refresh");
  }
}

async function cache_bill_detail(source_bill_id: number, bill: legiscan_bill_detail): Promise<void> {
  if (!as_record(bill)) throw new Error("docket_bill_activation_invalid_detail");
  await accept_docket_bill_detail({ bill_id: source_bill_id, bill, source: "legiscan_get_bill_jurisdiction_activation", label: "docket_bill_activation_cache_detail" });
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
    // Radar/source activation owns acquisition and registration only.
    // Rosetta execution must be authorized independently after source state is complete.
    `select public.register_docket_legislative_version_spine($1::integer, false) as receipt`,
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
            attempt_count = attempt_count + case when $8::boolean then 1 else 0 end,
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
      input.decision.consume_attempt,
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
    consume_attempt: input.decision.consume_attempt,
  });
}

export async function process_docket_bill_activation_job(
  job: docket_bill_activation_job,
): Promise<void> {
  // Even if a caller bypasses claim_jobs, the archive-only host never makes
  // live provider requests for a non-archive job.
  if (resolve_docket_activation_source_scope() === "legiscan_bulk_json"
      && job.activation_source !== "legiscan_bulk_json") {
    throw new Error("docket_archive_worker_non_archive_job_refused");
  }
  let receipt: docket_bill_activation_receipt;
  try {
    if (job.activation_source === "legiscan_bulk_json") {
      // Use verified archived bill detail; never spend credits on a second getBill.
      const archive = await read_docket_archive_detail(job);
      await ensure_civic_genome_bill_ready(job, archive);
    } else {
      await ensure_civic_genome_bill_ready(job);
      const bill = await get_bill(job.source_bill_id);
      await cache_bill_detail(job.source_bill_id, bill);
    }
    // Identical source registration and queue state transitions for both transports.
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

export function run_docket_bill_activation_queue_cycle(): Promise<void> {
  if (active_queue_cycle) return active_queue_cycle;
  if (queue_stopped) return Promise.resolve();

  const cycle = (async () => {
    try {
      const jobs = await claim_jobs(bounded_concurrency());
      await Promise.all(jobs.map(job => process_docket_bill_activation_job(job)));
    } catch (error) {
      console.error("[DocketJurisdictionActivation] cycle_failed", {
        error_class: error instanceof Error ? error.name : "unknown",
        error_code: safe_error_code(error),
      });
    }
  })();
  active_queue_cycle = cycle;
  void cycle.finally(() => {
    if (active_queue_cycle === cycle) active_queue_cycle = null;
  });
  return cycle;
}

export function start_docket_bill_activation_queue_worker(): void {
  if (queue_timer || !queue_enabled()) return;
  const source_scope = resolve_docket_activation_source_scope();
  queue_stopped = false;
  const interval_ms = bounded_poll_interval();
  const concurrency = bounded_concurrency();
  console.log("[DocketJurisdictionActivation] started", {
    worker_id: queue_worker_id,
    interval_ms,
    concurrency,
    lease_minutes: QUEUE_LEASE_MINUTES,
    source_scope,
  });
  void run_docket_bill_activation_queue_cycle();
  queue_timer = setInterval(() => {
    void run_docket_bill_activation_queue_cycle();
  }, interval_ms);
  queue_timer.unref?.();
}

export async function stop_docket_bill_activation_queue_worker(): Promise<void> {
  queue_stopped = true;
  if (queue_timer) clearInterval(queue_timer);
  queue_timer = null;
  await active_queue_cycle;
}

import { randomUUID } from "node:crypto";

import { query_with_diagnostics } from "./db";
import { run_with_database_job_context } from "./db-request-context";
import {
  LEGISLATIVE_VERSION_PROVIDER_SHARED_OUTAGE_ERROR_CODE,
  process_legislative_version,
} from "./civic-genome-legislative-version-pipeline";
import { create_rosetta_supabase_headers } from "./rosetta-supabase-auth";
import { background_feature_enabled } from "./runtime-role";

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const MIN_POLL_INTERVAL_MS = 250;
const MAX_POLL_INTERVAL_MS = 60_000;
// Family resolution is CPU-heavy. Keep concurrency at one even in an isolated
// worker so a single queue cycle cannot amplify event-loop or database pressure.
const DEFAULT_CONCURRENCY = 1;
const MAX_CONCURRENCY = 32;
const QUEUE_LEASE_MINUTES = 60;
const UNKNOWN_FAILURE_LIMIT = 5;
const RECONCILE_BATCH_SIZE = 100;
const DEFAULT_RECONCILE_INTERVAL_MS = 60_000;
const MIN_RECONCILE_INTERVAL_MS = 10_000;
const MAX_RECONCILE_INTERVAL_MS = 15 * 60_000;
const ROSETTA_TERMINAL_CLASSIFIER_LIMIT = 250;
const ROSETTA_BACKLOG_SELECTOR_LIMIT = 100;
const ROSETTA_CONTROL_REQUEST_TIMEOUT_MS = 10_000;
const DURABLE_CONTENT_RECOVERY_CONTRACT = "oldest-unbound-docket-v1";
const DURABLE_CONTENT_RECOVERY_MAX_ATTEMPTS = 3;
const DURABLE_CONTENT_RECOVERY_RETRY_SECONDS = 30;
const PROVIDER_COPY_FALLBACK_RECOVERY_CONTRACT =
  "civic-genome-provider-copy-fallback-recovery-v1";
const SHARED_PROVIDER_RELEASE_RETRY_MIN_MS = 250;
const SHARED_PROVIDER_RELEASE_RETRY_MAX_MS = 5_000;
const ALLOWED_RECOVERY_CONTRACT_SCOPES = new Set([
  PROVIDER_COPY_FALLBACK_RECOVERY_CONTRACT,
]);

export type legislative_version_queue_job = {
  queue_id: string;
  bill_version_id: string;
  source_document_key: string;
  source_bill_id: number;
  document_family: "text" | "amendment";
  version_type: string;
  prior_queue_state: "eligible" | "degraded" | "submitted" | "permanent_failure";
  attempt_count: number;
  document_identifier: string;
  durable_content_recovery: boolean;
};

type rosetta_unbound_docket_source = {
  source_document_id?: unknown;
  document_identifier?: unknown;
  registered_at?: unknown;
};

export type legislative_version_failure_decision = {
  queue_state: "degraded" | "permanent_failure";
  failure_class: "transient" | "deterministic_contract" | "unknown";
  error_code: string;
  retry_delay_seconds: number;
  terminal: boolean;
};

let queue_timer: NodeJS.Timeout | null = null;
let active_queue_cycle: Promise<void> | null = null;
let queue_cycle_running = false;
let queue_stopped = false;
let queue_shutdown_requested = false;
let next_reconcile_at_ms = 0;
const shared_provider_release_waiters = new Map<NodeJS.Timeout, () => void>();
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

function bounded_reconcile_interval(): number {
  return bounded_integer(
    process.env.LEGISLATIVE_VERSION_QUEUE_RECONCILE_MS,
    DEFAULT_RECONCILE_INTERVAL_MS,
    MIN_RECONCILE_INTERVAL_MS,
    MAX_RECONCILE_INTERVAL_MS,
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

function required_environment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

export function legislative_version_queue_recovery_contract_scope(
  environment: Record<string, string | undefined> = process.env,
): string | null {
  const value = environment
    .LEGISLATIVE_VERSION_QUEUE_RECOVERY_CONTRACT_SCOPE
    ?.trim();
  if (!value) return null;
  if (!ALLOWED_RECOVERY_CONTRACT_SCOPES.has(value)) {
    throw new Error("legislative_version_queue_recovery_contract_scope_invalid");
  }
  return value;
}

export function is_exact_docket_document_identifier(value: string): boolean {
  const match = value.match(/^docket:(\d+):(text|amendment):(\d+):(\d+)$/);
  return Boolean(match && match[1] === match[3]);
}

export async function classify_hidden_rosetta_terminal_rejections(): Promise<number> {
  const base_url = required_environment("ROSETTA_SUPABASE_URL").replace(/\/$/, "");
  const service_role_key = required_environment("ROSETTA_SUPABASE_SERVICE_ROLE_KEY");
  const headers = create_rosetta_supabase_headers(service_role_key);
  headers.set("accept", "application/json");
  headers.set("content-type", "application/json");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ROSETTA_CONTROL_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${base_url}/rest/v1/rpc/rosetta_classify_terminal_rejections_v1`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ p_limit: ROSETTA_TERMINAL_CLASSIFIER_LIMIT }),
        signal: controller.signal,
      },
    );
    const response_body = response.status === 204 ? "" : await response.text();
    if (!response.ok) {
      throw new Error(
        `rosetta_terminal_classifier_failed:${response.status}:${response_body.slice(0, 500)}`,
      );
    }
    if (response.status === 204) return 0;

    let payload: unknown;
    try {
      payload = JSON.parse(response_body);
    } catch {
      throw new Error("rosetta_terminal_classifier_invalid_json");
    }
    const classified_count = typeof payload === "number"
      ? payload
      : Array.isArray(payload) && payload.length === 1 && typeof payload[0] === "number"
        ? payload[0]
        : Number.NaN;
    if (
      !Number.isSafeInteger(classified_count)
      || classified_count < 0
      || classified_count > ROSETTA_TERMINAL_CLASSIFIER_LIMIT
    ) {
      throw new Error("rosetta_terminal_classifier_invalid_response");
    }
    return classified_count;
  } catch (error) {
    if (
      error instanceof Error
      && error.message.startsWith("rosetta_terminal_classifier_")
    ) {
      throw error;
    }
    if (controller.signal.aborted) {
      throw new Error(
        `rosetta_terminal_classifier_timeout:${ROSETTA_CONTROL_REQUEST_TIMEOUT_MS}`,
      );
    }
    const cause = error instanceof Error ? error.name : "unknown";
    throw new Error(`rosetta_terminal_classifier_network_failed:${cause}`);
  } finally {
    clearTimeout(timeout);
  }
}

export async function load_oldest_unbound_docket_identifiers(): Promise<string[]> {
  const base_url = required_environment("ROSETTA_SUPABASE_URL").replace(/\/$/, "");
  const service_role_key = required_environment("ROSETTA_SUPABASE_SERVICE_ROLE_KEY");
  const headers = create_rosetta_supabase_headers(service_role_key);
  headers.set("accept", "application/json");
  headers.set("content-type", "application/json");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ROSETTA_CONTROL_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${base_url}/rest/v1/rpc/rosetta_unbound_docket_source_documents_v1`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ p_limit: ROSETTA_BACKLOG_SELECTOR_LIMIT }),
        signal: controller.signal,
      },
    );
    const response_body = response.status === 204 ? "" : await response.text();
    if (!response.ok) {
      throw new Error(
        `rosetta_unbound_docket_selector_failed:${response.status}:${response_body.slice(0, 500)}`,
      );
    }
    if (response.status === 204) return [];

    let payload: unknown;
    try {
      payload = JSON.parse(response_body);
    } catch {
      throw new Error("rosetta_unbound_docket_selector_invalid_json");
    }
    if (!Array.isArray(payload)) {
      throw new Error("rosetta_unbound_docket_selector_invalid_response");
    }

    const identifiers: string[] = [];
    const seen = new Set<string>();
    for (const raw of payload as rosetta_unbound_docket_source[]) {
      const source_document_id = Number(raw.source_document_id);
      const document_identifier = String(raw.document_identifier ?? "");
      if (
        !Number.isSafeInteger(source_document_id)
        || source_document_id <= 0
        || !is_exact_docket_document_identifier(document_identifier)
        || seen.has(document_identifier)
      ) {
        throw new Error("rosetta_unbound_docket_selector_identity_invalid");
      }
      seen.add(document_identifier);
      identifiers.push(document_identifier);
    }
    return identifiers;
  } catch (error) {
    if (
      error instanceof Error
      && error.message.startsWith("rosetta_unbound_docket_selector_")
    ) {
      throw error;
    }
    if (controller.signal.aborted) {
      throw new Error(
        `rosetta_unbound_docket_selector_timeout:${ROSETTA_CONTROL_REQUEST_TIMEOUT_MS}`,
      );
    }
    const cause = error instanceof Error ? error.name : "unknown";
    throw new Error(`rosetta_unbound_docket_selector_network_failed:${cause}`);
  } finally {
    clearTimeout(timeout);
  }
}

function queue_enabled(): boolean {
  return background_feature_enabled("LEGISLATIVE_VERSION_QUEUE_ENABLED");
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
    "legislative_version_source_empty",
    "legislative_version_source_fetch_failed:404",
    "legislative_version_pdf_text_incomplete",
    "legislative_version_html_text_incomplete",
    "docket_html_text_incomplete",
    "california_official_pdf_unavailable",
    "legislative_version_reference_date_unavailable",
    "legislative_version_extraction_source_document_mismatch",
    "legislative_version_extraction_not_admissible",
    "legislative_version_extraction_output_hash_missing",
    "legislative_version_rosetta_extraction_failed:400",
    "legislative_version_rosetta_content_registration_failed:400",
    "legislative_version_content_registration_identity_mismatch",
    "rosetta_source_document_already_bound_to_other_bill",
    "rosetta_source_identity_binding_changed",
    "rosetta_completed_run_has_no_objects",
    "rosetta_completed_run_has_no_operative_or_structural_evidence",
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

export function is_legislative_version_shared_provider_outage(
  error: unknown,
): boolean {
  return safe_error_code(error)
    === LEGISLATIVE_VERSION_PROVIDER_SHARED_OUTAGE_ERROR_CODE;
}

async function reconcile_completed_jobs(
  recovery_contract_scope: string | null,
): Promise<void> {
  await query_with_diagnostics(
    `with candidate as (
       select queue.queue_id,
              version.updated_at as version_updated_at
         from public.civic_genome_legislative_version_queue queue
         join public.civic_genome_bill_version version
           on version.bill_version_id = queue.bill_version_id
        where version.assembly_run_id is not null
          and version.processing_state in ('assembled', 'verification_partial', 'verified')
          and queue.queue_state <> 'completed'
          and (
            $2::text is null
            or version.receipt_json->>'source_fallback_recovery_contract' = $2
          )
        order by queue.updated_at, queue.queue_id
        for update of queue skip locked
        limit $1::integer
     )
     update public.civic_genome_legislative_version_queue queue
        set queue_state = 'completed',
            completed_at = coalesce(queue.completed_at, candidate.version_updated_at),
            locked_at = null,
            locked_by = null,
            last_failure_class = null,
            last_error_code = null,
            updated_at = now()
       from candidate
      where queue.queue_id = candidate.queue_id`,
    [RECONCILE_BATCH_SIZE, recovery_contract_scope],
    {
      label: "legislative_version_queue_reconcile_completed",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
}

async function reconcile_completed_jobs_if_due(
  recovery_contract_scope: string | null,
): Promise<void> {
  const now_ms = Date.now();
  if (now_ms < next_reconcile_at_ms) return;
  next_reconcile_at_ms = now_ms + bounded_reconcile_interval();
  await reconcile_completed_jobs(recovery_contract_scope);
}

async function claim_jobs(
  limit: number,
  oldest_unbound_docket_identifiers: string[],
  recovery_contract_scope: string | null,
): Promise<legislative_version_queue_job[]> {
  const result = await query_with_diagnostics<legislative_version_queue_job>(
    `with current_sessions as (
       select distinct state, session_id::text as session_key
         from public.docket_bill_state_cache
     ), host_activity as (
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
        where (
            $8::text is null
            or version.receipt_json->>'source_fallback_recovery_contract' = $8
          )
          and (
            queue.attempt_count > 0
            or (
              queue.queue_state = 'degraded'
              and queue.next_attempt_at > now()
            )
          )
        group by split_part(lower(document.source_url), '/', 3)
     ), candidate as materialized (
       select queue.queue_id,
              version.bill_version_id,
              queue.queue_state as prior_queue_state,
              queue.attempt_count as prior_attempt_count,
              rosetta_identity.document_identifier,
              recovery_state.prior_recovery_attempts,
              recovery.is_durable_content_recovery
         from public.civic_genome_legislative_version_queue queue
         join public.civic_genome_bill_version version
           on version.bill_version_id = queue.bill_version_id
         join public.civic_genome_bill bill
           on bill.genome_bill_id = version.genome_bill_id
         join public.docket_bill_source_document document
           on document.source_document_key = version.source_document_key
         left join current_sessions current_session
           on current_session.state = bill.state_code
          and current_session.session_key = bill.session_key
         left join host_activity source_host
           on source_host.source_host = split_part(lower(document.source_url), '/', 3)
         cross join lateral (
           select 'docket:' || version.source_bill_id::text || ':' ||
                  version.source_document_key as document_identifier
         ) rosetta_identity
         cross join lateral (
           select case
             when coalesce(version.receipt_json, '{}'::jsonb)
                    ? 'durable_content_recovery_v1'
               then case
                 when version.receipt_json
                        #>> '{durable_content_recovery_v1,attempt_ordinal}'
                        ~ '^[0-9]{1,9}$'
                   then greatest(
                     1,
                     (version.receipt_json
                       #>> '{durable_content_recovery_v1,attempt_ordinal}')::integer
                   )
                 else 1
               end
             else 0
           end as prior_recovery_attempts
         ) recovery_state
         cross join lateral (
           select queue.queue_state = 'permanent_failure'
              and $8::text is null
              and rosetta_identity.document_identifier = any($4::text[])
              and recovery_state.prior_recovery_attempts < $6::integer
              and queue.updated_at
                    <= now() - make_interval(secs => $7::integer)
              as is_durable_content_recovery
         ) recovery
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
        where (
            (
              queue.next_attempt_at <= now()
              and (
                queue.queue_state in ('eligible', 'degraded')
                or (
                  queue.queue_state = 'submitted'
                  and queue.locked_at < now() - make_interval(mins => $2::integer)
                )
              )
            )
            or recovery.is_durable_content_recovery
          )
          and (
            queue.locked_at is null
            or queue.locked_at < now() - make_interval(mins => $2::integer)
          )
          and version.processing_state not in ('verified', 'verified_with_findings')
          and (
            $8::text is null
            or version.receipt_json->>'source_fallback_recovery_contract' = $8
          )
          and coalesce(source_host.blocked_until, '-infinity'::timestamptz) <= now()
        order by case when recovery.is_durable_content_recovery then 0 else 1 end,
                 case when recovery.is_durable_content_recovery
                   then array_position($4::text[], rosetta_identity.document_identifier)
                 end asc nulls last,
                 case when queue.priority < 0 then 0 else 1 end,
                 (current_session.state is not null) desc,
                 currency.is_current desc,
                 source_host.last_attempt_at asc nulls first,
                 case when currency.is_current then version.stage_rank else 0 end desc,
                 queue.priority,
                 queue.created_at,
                 queue.queue_id
        for update of queue, version skip locked
        limit $3::integer
     ), marked_version as (
       update public.civic_genome_bill_version version
          set receipt_json = coalesce(version.receipt_json, '{}'::jsonb)
                || jsonb_build_object(
                  'durable_content_recovery_v1',
                  jsonb_build_object(
                    'contract', $5::text,
                    'document_identifier', candidate.document_identifier,
                    'attempt_ordinal',
                      candidate.prior_recovery_attempts + 1,
                    'first_selected_at', coalesce(
                      version.receipt_json
                        #>> '{durable_content_recovery_v1,first_selected_at}',
                      version.receipt_json
                        #>> '{durable_content_recovery_v1,selected_at}',
                      now()::text
                    ),
                    'selected_at', now(),
                    'worker_identity', $1::text,
                    'prior_queue_state', candidate.prior_queue_state,
                    'prior_attempt_count', candidate.prior_attempt_count
                  )
                ),
              updated_at = now()
         from candidate
        where candidate.is_durable_content_recovery
          and version.bill_version_id = candidate.bill_version_id
       returning version.bill_version_id
     )
     update public.civic_genome_legislative_version_queue queue
        set queue_state = 'submitted',
            locked_at = now(),
            locked_by = $1,
            updated_at = now()
       from candidate
       join public.civic_genome_bill_version version
         on version.bill_version_id = candidate.bill_version_id
      join public.docket_bill_source_document document
        on document.source_document_key = version.source_document_key
      left join marked_version
        on marked_version.bill_version_id = version.bill_version_id
      where queue.queue_id = candidate.queue_id
        and version.bill_version_id = queue.bill_version_id
      returning queue.queue_id::text,
                version.bill_version_id::text,
                version.source_document_key,
                version.source_bill_id,
                version.document_family,
                version.version_type,
                candidate.prior_queue_state,
                queue.attempt_count,
                candidate.document_identifier,
                candidate.is_durable_content_recovery as durable_content_recovery`,
    [
      queue_worker_id,
      QUEUE_LEASE_MINUTES,
      limit,
      oldest_unbound_docket_identifiers,
      DURABLE_CONTENT_RECOVERY_CONTRACT,
      DURABLE_CONTENT_RECOVERY_MAX_ATTEMPTS,
      DURABLE_CONTENT_RECOVERY_RETRY_SECONDS,
      recovery_contract_scope,
    ],
    {
      label: "legislative_version_queue_claim",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
  return result.rows;
}

function pause_legislative_version_queue_after_shared_provider_outage(): void {
  queue_stopped = true;
  if (queue_timer) clearInterval(queue_timer);
  queue_timer = null;
}

function restorable_queue_state(
  prior_queue_state: legislative_version_queue_job["prior_queue_state"],
): legislative_version_queue_job["prior_queue_state"] {
  // A stale submitted lease cannot be restored without a lock because it would
  // no longer satisfy the queue's reclaim predicate. Degraded preserves its
  // retryability while the process-wide provider pause prevents another claim.
  return prior_queue_state === "submitted" ? "degraded" : prior_queue_state;
}

async function release_job_after_shared_provider_outage(
  job: legislative_version_queue_job,
): Promise<void> {
  const result = await query_with_diagnostics<{ queue_id: string }>(
    `with released as (
       update public.civic_genome_legislative_version_queue queue
          set queue_state = $2,
              locked_at = null,
              locked_by = null,
              updated_at = now()
        where queue.queue_id = $1::uuid
          and queue.locked_by = $3
          and queue.attempt_count = $4::integer
       returning queue.queue_id::text
     )
     select released.queue_id
       from released
     union all
     select queue.queue_id::text
       from public.civic_genome_legislative_version_queue queue
      where queue.queue_id = $1::uuid
        and queue.queue_state = $2
        and queue.locked_at is null
        and queue.locked_by is null
        and queue.attempt_count = $4::integer
        and not exists (select 1 from released)`,
    [
      job.queue_id,
      restorable_queue_state(job.prior_queue_state),
      queue_worker_id,
      job.attempt_count,
    ],
    {
      label: "legislative_version_queue_release_shared_provider_outage",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
  if (result.rows.length !== 1) {
    throw new Error("legislative_version_queue_shared_provider_release_failed");
  }
}

function shared_provider_release_retry_delay_ms(
  release_attempt: number,
): number {
  return Math.min(
    SHARED_PROVIDER_RELEASE_RETRY_MAX_MS,
    SHARED_PROVIDER_RELEASE_RETRY_MIN_MS
      * (2 ** Math.min(5, Math.max(0, release_attempt - 1))),
  );
}

function wait_for_shared_provider_release_retry(delay_ms: number): Promise<void> {
  return new Promise(resolve => {
    let timer: NodeJS.Timeout;
    const finish = (): void => {
      shared_provider_release_waiters.delete(timer);
      resolve();
    };
    timer = setTimeout(finish, delay_ms);
    shared_provider_release_waiters.set(timer, finish);
  });
}

function wake_shared_provider_release_retries(): void {
  for (const [timer, finish] of shared_provider_release_waiters) {
    clearTimeout(timer);
    finish();
  }
}

async function finalize_shared_provider_release(
  job: legislative_version_queue_job,
): Promise<void> {
  let release_attempt = 0;
  while (true) {
    release_attempt += 1;
    try {
      await release_job_after_shared_provider_outage(job);
      if (release_attempt > 1) {
        console.log("[LegislativeVersionQueue] shared_provider_release_recovered", {
          queue_id: job.queue_id,
          bill_version_id: job.bill_version_id,
          release_attempt,
        });
      }
      return;
    } catch (release_error) {
      if (queue_shutdown_requested) throw release_error;
      const retry_delay_ms = shared_provider_release_retry_delay_ms(
        release_attempt,
      );
      console.error("[LegislativeVersionQueue] shared_provider_release_retry", {
        queue_id: job.queue_id,
        bill_version_id: job.bill_version_id,
        attempt_count: job.attempt_count,
        release_attempt,
        retry_delay_ms,
        error_code: safe_error_code(release_error),
      });
      await wait_for_shared_provider_release_retry(retry_delay_ms);
    }
  }
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
    document_identifier: input.job.document_identifier,
    durable_content_recovery: input.job.durable_content_recovery,
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
    document_identifier: input.job.document_identifier,
    durable_content_recovery: input.job.durable_content_recovery,
    queue_state: input.decision.queue_state,
    failure_class: input.decision.failure_class,
    error_code: input.decision.error_code,
    retry_delay_seconds: input.decision.retry_delay_seconds,
  });
}

export async function process_legislative_version_job(
  job: legislative_version_queue_job,
): Promise<void> {
  let result: Awaited<ReturnType<typeof process_legislative_version>>;
  try {
    result = await process_legislative_version(job.bill_version_id);
  } catch (error) {
    if (is_legislative_version_shared_provider_outage(error)) {
      pause_legislative_version_queue_after_shared_provider_outage();
      try {
        await finalize_shared_provider_release(job);
      } catch (release_error) {
        console.error("[LegislativeVersionQueue] shared_provider_release_failed", {
          queue_id: job.queue_id,
          bill_version_id: job.bill_version_id,
          attempt_count: job.attempt_count,
          error_code: safe_error_code(release_error),
        });
        throw release_error;
      }
      console.error("[LegislativeVersionQueue] paused_shared_provider_outage", {
        queue_id: job.queue_id,
        bill_version_id: job.bill_version_id,
        attempt_count: job.attempt_count,
        restored_queue_state: restorable_queue_state(job.prior_queue_state),
        error_code: LEGISLATIVE_VERSION_PROVIDER_SHARED_OUTAGE_ERROR_CODE,
      });
      return;
    }
    const decision = classify_legislative_version_failure({
      error,
      prior_attempt_count: job.attempt_count,
    });
    await mark_job_failed({ job, decision });
    return;
  }

  try {
    await mark_job_completed({
      job,
      assembly_run_id: result.assembly.assembly_run_id,
    });
  } catch (error) {
    console.error("[LegislativeVersionQueue] completion_deferred", {
      queue_id: job.queue_id,
      bill_version_id: job.bill_version_id,
      assembly_run_id: result.assembly.assembly_run_id,
      error_code: safe_error_code(error),
    });
  }
}

export async function run_legislative_version_queue_cycle(): Promise<void> {
  if (queue_cycle_running || queue_stopped) return;
  queue_cycle_running = true;
  try {
    const recovery_contract_scope =
      legislative_version_queue_recovery_contract_scope();
    await reconcile_completed_jobs_if_due(recovery_contract_scope);
    if (!recovery_contract_scope) {
      try {
        const classified_count = await classify_hidden_rosetta_terminal_rejections();
        if (classified_count > 0) {
          console.log("[LegislativeVersionQueue] terminal_repairs_classified", {
            classified_count,
            contract: "rosetta-terminal-rejection-repair-v1",
          });
        }
      } catch (error) {
        // Classification is fail-closed in Rosetta: terminal runs stay rejected.
        // A control-surface outage must not stop unrelated queue work.
        console.error("[LegislativeVersionQueue] terminal_classifier_failed", {
          error_code: safe_error_code(error),
        });
      }
    }
    let oldest_unbound_docket_identifiers: string[] = [];
    if (!recovery_contract_scope) {
      try {
        oldest_unbound_docket_identifiers = await load_oldest_unbound_docket_identifiers();
      } catch (error) {
        // The recovery selector is supplemental. An unavailable Rosetta control
        // surface must not stop ordinary eligible/degraded queue processing.
        console.error("[LegislativeVersionQueue] backlog_selector_failed", {
          error_code: safe_error_code(error),
        });
      }
    }
    const jobs = await claim_jobs(
      recovery_contract_scope ? 1 : bounded_concurrency(),
      oldest_unbound_docket_identifiers,
      recovery_contract_scope,
    );
    await Promise.all(jobs.map(job => run_with_database_job_context(
      { label: "legislative_version_queue_job", job_id: job.queue_id },
      () => process_legislative_version_job(job),
    )));
  } catch (error) {
    console.error("[LegislativeVersionQueue] cycle_failed", {
      error_class: error instanceof Error ? error.name : "unknown",
      error_code: safe_error_code(error),
    });
  } finally {
    queue_cycle_running = false;
  }
}

function schedule_legislative_version_queue_cycle(): void {
  if (active_queue_cycle) return;
  const cycle = run_legislative_version_queue_cycle();
  active_queue_cycle = cycle;
  void cycle.finally(() => {
    if (active_queue_cycle === cycle) active_queue_cycle = null;
  });
}

export function start_legislative_version_queue_worker(): void {
  if (queue_timer || !queue_enabled()) return;
  let recovery_contract_scope: string | null;
  try {
    recovery_contract_scope =
      legislative_version_queue_recovery_contract_scope();
  } catch (error) {
    console.error("[LegislativeVersionQueue] disabled_invalid_scope", {
      error_code: safe_error_code(error),
    });
    return;
  }
  queue_stopped = false;
  queue_shutdown_requested = false;
  const interval_ms = bounded_poll_interval();
  const concurrency = recovery_contract_scope ? 1 : bounded_concurrency();
  const reconcile_interval_ms = bounded_reconcile_interval();
  console.log("[LegislativeVersionQueue] started", {
    worker_id: queue_worker_id,
    interval_ms,
    reconcile_interval_ms,
    concurrency,
    recovery_contract_scope,
    lease_minutes: QUEUE_LEASE_MINUTES,
    priority_scope: "oldest_unbound_docket_then_current_session_latest_version_host_fairness",
  });
  schedule_legislative_version_queue_cycle();
  queue_timer = setInterval(() => {
    schedule_legislative_version_queue_cycle();
  }, interval_ms);
  queue_timer.unref?.();
}

export async function stop_legislative_version_queue_worker(): Promise<void> {
  queue_stopped = true;
  queue_shutdown_requested = true;
  if (queue_timer) clearInterval(queue_timer);
  queue_timer = null;
  wake_shared_provider_release_retries();
  await active_queue_cycle;
}

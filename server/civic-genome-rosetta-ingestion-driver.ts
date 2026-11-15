import { randomUUID } from "node:crypto";
import { query_with_diagnostics } from "./db";
import { background_feature_enabled } from "./runtime-role";
import {
  read_admitted_target,
  read_live_target,
  validate_target_agreement,
  type admitted_generation_target,
  type live_generation_target,
} from "./civic-genome-version-admission-driver";
import {
  ensure_rosetta_source_document,
  extract_version_source,
  load_version,
  record_amendment_attachment,
  register_rosetta_amendment_attachment,
  register_rosetta_source_content,
  resolve_current_amendment_attachment,
} from "./civic-genome-legislative-version-pipeline";

/**
 * Engine-neutral Lane 2 restoration: legislative-version source ingestion.
 *
 * The retired automatic conveyor (the legislative-version pipeline's
 * automatic processing entry and the legislative-version queue worker)
 * stays retired. This driver is the separately verified, engine-neutral
 * admission path the retirement requires. It performs Lane 2's canonical work
 * only: take the exact Civic Genome version toward Rosetta, preserve its exact
 * source, register the exact Rosetta source content, and record the version as
 * source_ingested. It never invokes decomposition (Rosetta owns execution and
 * routing), never binds a result, never assembles, and carries no generation
 * name of its own: every cycle first proves that the Genome's admitted
 * generation target and Rosetta's live selected target agree, and stands down
 * without writing anything when they do not.
 *
 * Claimed work is narrow by construction: queue rows still eligible, due, and
 * unlocked (or holding only a stale lease), whose version is still in the
 * registered state. Ingested versions are never re-claimed here; degraded and
 * held rows are evidence states this driver does not select, replay, or repair.
 */

const DEFAULT_POLL_INTERVAL_MS = 60_000;
const MIN_POLL_INTERVAL_MS = 15_000;
const MAX_POLL_INTERVAL_MS = 300_000;
const DEFAULT_BATCH_SIZE = 5;
const MIN_BATCH_SIZE = 1;
const MAX_BATCH_SIZE = 25;
const LEASE_STALE_AFTER_MINUTES = 60;
const TRANSIENT_RETRY_MINUTES = 5;

const ingestion_worker_id = [
  "genome-rosetta-ingestion",
  process.pid,
  randomUUID(),
].join(":");

let timer: NodeJS.Timeout | null = null;
let running = false;
let stopped = false;

export type ingestion_cycle_plan =
  | { action: "stand_down"; reason: string }
  | { action: "ingest" };

export function plan_ingestion_cycle(
  admitted: admitted_generation_target | null,
  live: live_generation_target | null,
): ingestion_cycle_plan {
  if (!admitted) return { action: "stand_down", reason: "no_admitted_target" };
  if (!live) return { action: "stand_down", reason: "live_target_unreadable" };
  const agreement = validate_target_agreement(admitted, live);
  if (!agreement.ok) return { action: "stand_down", reason: agreement.reason };
  return { action: "ingest" };
}

export const CLAIM_INGESTION_JOBS_SQL = `
  with candidate as (
    select queue.queue_id
      from public.civic_genome_legislative_version_queue queue
      join public.civic_genome_bill_version version
        on version.bill_version_id = queue.bill_version_id
     where queue.queue_state = 'eligible'
       and queue.next_attempt_at <= now()
       and (
         queue.locked_at is null
         or queue.locked_at < now() - make_interval(mins => ${LEASE_STALE_AFTER_MINUTES})
       )
       and version.processing_state = 'registered'
     order by queue.created_at, queue.queue_id
     for update of queue skip locked
     limit $1::int
  ), claimed as (
    update public.civic_genome_legislative_version_queue queue
       set locked_at = now(),
           locked_by = $2::text,
           updated_at = now()
      from candidate
     where queue.queue_id = candidate.queue_id
    returning queue.queue_id::text as queue_id,
              queue.bill_version_id::text as bill_version_id
  )
  select * from claimed`;

/**
 * Crash-window recovery: if the worker exits after a version's
 * source-ingested transition commits but before its queue lease is released,
 * the row can never be claimed again here (its version is no longer
 * registered) and downstream lanes require a null lock. Release stale leases
 * on rows whose version already left the registered state. The version's
 * source is never re-fetched or re-registered by this sweep.
 */
export const RECOVER_STRANDED_INGESTED_SQL = `
  update public.civic_genome_legislative_version_queue queue
     set locked_at = null,
         locked_by = null,
         updated_at = now()
    from public.civic_genome_bill_version version
   where version.bill_version_id = queue.bill_version_id
     and queue.queue_state = 'eligible'
     and queue.locked_at is not null
     and queue.locked_at < now() - make_interval(mins => ${LEASE_STALE_AFTER_MINUTES})
     and version.processing_state <> 'registered'
  returning queue.queue_id`;

export const COMPLETE_INGESTION_JOB_SQL = `
  update public.civic_genome_legislative_version_queue
     set locked_at = null,
         locked_by = null,
         last_failure_class = null,
         last_error_code = null,
         updated_at = now()
   where queue_id = $1::uuid
     and locked_by = $2::text`;

export const PARK_INGESTION_JOB_SQL = `
  update public.civic_genome_legislative_version_queue
     set queue_state = 'degraded',
         next_attempt_at = 'infinity'::timestamptz,
         locked_at = null,
         locked_by = null,
         last_failure_class = 'ingestion_parked',
         last_error_code = $3::text,
         updated_at = now()
   where queue_id = $1::uuid
     and locked_by = $2::text`;

export const DEFER_INGESTION_JOB_SQL = `
  update public.civic_genome_legislative_version_queue
     set locked_at = null,
         locked_by = null,
         last_failure_class = 'ingestion_transient',
         last_error_code = $3::text,
         next_attempt_at = now() + make_interval(mins => ${TRANSIENT_RETRY_MINUTES}),
         updated_at = now()
   where queue_id = $1::uuid
     and locked_by = $2::text`;

/**
 * The Genome-side ingestion record. The bill-version receipt quarantine
 * (zz_civic_genome_block_bill_version_rosetta_receipt_v1) deliberately
 * rejects newly introduced receipt keys in the rosetta_/assembly_/prism_
 * namespaces: those are derivative receipts, and this lane records raw
 * evidence only. The record therefore carries the source document id, the
 * exact source hashes, and the durable-content registration facts — the
 * fields the quarantine's own text says to preserve — and no derivative
 * receipt keys. The Rosetta content row itself remains reachable through
 * the recorded source document id and source content hash.
 */
export const RECORD_INGESTION_SQL = `
  update public.civic_genome_bill_version
     set rosetta_source_document_id = $2::bigint,
         processing_state = 'source_ingested',
         failure_code = null,
         receipt_json = receipt_json || jsonb_build_object(
           'source_document_id', $2::bigint,
           'source_version', $3::text,
           'source_url', $4::text,
           'source_content_hash', $5::text,
           'source_byte_hash', $6::text,
           'text_extractor_version', $7::text,
           'durable_source_content_contract', $8::text,
           'durable_source_content_replayed', $9::boolean,
           'durable_source_content_registered_at', $10::timestamptz
         ),
         updated_at = now()
   where bill_version_id = $1::uuid`;

type extracted_source = Awaited<ReturnType<typeof extract_version_source>>;
type registered_content = Awaited<
  ReturnType<typeof register_rosetta_source_content>
>;

async function record_ingestion(
  job: ingestion_job,
  source_document_id: number,
  source: extracted_source,
  content: registered_content,
): Promise<void> {
  await query_with_diagnostics(RECORD_INGESTION_SQL, [
    job.bill_version_id,
    source_document_id,
    source.source_version,
    source.source_url,
    source.source_content_hash,
    source.source_byte_hash,
    source.extractor_version,
    content.contract,
    content.replayed,
    content.registered_at,
  ], {
    label: "genome_rosetta_ingestion_record",
    pool_acquire_timeout_ms: 1_000,
    query_timeout_ms: 10_000,
  });
}

function enabled(): boolean {
  return background_feature_enabled("GENOME_ROSETTA_INGESTION_ENABLED");
}

function bounded_batch_size(): number {
  const raw = Number(process.env.GENOME_ROSETTA_INGESTION_BATCH_SIZE);
  if (!Number.isFinite(raw)) return DEFAULT_BATCH_SIZE;
  return Math.min(MAX_BATCH_SIZE, Math.max(MIN_BATCH_SIZE, Math.trunc(raw)));
}

function bounded_poll_interval_ms(): number {
  const raw = Number(process.env.GENOME_ROSETTA_INGESTION_POLL_MS);
  if (!Number.isFinite(raw)) return DEFAULT_POLL_INTERVAL_MS;
  return Math.min(
    MAX_POLL_INTERVAL_MS,
    Math.max(MIN_POLL_INTERVAL_MS, Math.trunc(raw)),
  );
}

function error_code(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    const prefix = typeof code === "string" ? `${code}:` : "";
    return `${prefix}${error.message}`.slice(0, 200);
  }
  return "unknown";
}

/**
 * Failures that describe the source itself, not the moment: the document is
 * not legislative law, its URL or reference date cannot support exact-source
 * registration, or an amendment's attachment against its exact base cannot be
 * resolved. These park the queue row as a degraded evidence state with the
 * exact reason; they are never retried blindly and never reclassified here.
 */
export function is_deterministic_ingestion_failure(error: unknown): boolean {
  const code = error_code(error);
  return (
    code.includes("legislative_version_non_legislative_document")
    || code.includes("legislative_version_source_url_invalid")
    || code.includes("legislative_version_reference_date_unavailable")
    || code.includes("legislative_amendment_attachment_unresolved")
    || code.includes("legislative_amendment_base_content_unavailable")
    || code.includes("legislative_amendment_attachment_state_unresolved")
    || code.includes("legislative_amendment_attachment_not_resolved")
  );
}

type ingestion_job = {
  queue_id: string;
  bill_version_id: string;
};

async function claim_ingestion_jobs(
  batch_size: number,
): Promise<ingestion_job[]> {
  const { rows } = await query_with_diagnostics<ingestion_job>(
    CLAIM_INGESTION_JOBS_SQL,
    [batch_size, ingestion_worker_id],
    {
      label: "genome_rosetta_ingestion_claim",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 10_000,
    },
  );
  return rows;
}

async function complete_ingestion_job(job: ingestion_job): Promise<void> {
  await query_with_diagnostics(
    COMPLETE_INGESTION_JOB_SQL,
    [job.queue_id, ingestion_worker_id],
    {
      label: "genome_rosetta_ingestion_complete",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
}

async function park_ingestion_job(
  job: ingestion_job,
  reason: string,
): Promise<void> {
  await query_with_diagnostics(
    PARK_INGESTION_JOB_SQL,
    [job.queue_id, ingestion_worker_id, reason.slice(0, 200)],
    {
      label: "genome_rosetta_ingestion_park",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
}

async function defer_ingestion_job(
  job: ingestion_job,
  reason: string,
): Promise<void> {
  await query_with_diagnostics(
    DEFER_INGESTION_JOB_SQL,
    [job.queue_id, ingestion_worker_id, reason.slice(0, 200)],
    {
      label: "genome_rosetta_ingestion_defer",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
}

/**
 * Ingest one version's exact source into Rosetta. Returns "ingested" when the
 * source is registered and the version recorded as source_ingested (for an
 * amendment, its attachment against the exact base is registered too), or
 * "parked" when the source is ingested but the amendment attachment is an
 * evidence state that must wait (unresolved or awaiting its base content).
 * Throws only for failures before or during source registration itself.
 */
async function ingest_version_source(
  job: ingestion_job,
): Promise<"ingested" | "parked"> {
  const version = await load_version(job.bill_version_id);
  const source_document_id = await ensure_rosetta_source_document(version);
  const source = await extract_version_source(version, null);
  const content = await register_rosetta_source_content(
    source_document_id,
    source,
  );
  await record_ingestion(job, source_document_id, source, content);

  if (version.document_family !== "amendment") return "ingested";

  const attachment = await resolve_current_amendment_attachment(
    version,
    source,
  );
  if (!attachment) return "ingested";
  if (attachment.resolution.status === "resolved") {
    const receipt = await register_rosetta_amendment_attachment(
      content.source_content_id,
      source.source_content_hash,
      attachment,
    );
    await record_amendment_attachment(job.bill_version_id, attachment, receipt);
    return "ingested";
  }
  if (attachment.resolution.status === "awaiting_base_content") {
    await park_ingestion_job(job, "legislative_amendment_base_content_unavailable");
    return "parked";
  }
  await park_ingestion_job(
    job,
    `legislative_amendment_attachment_unresolved:${attachment.resolution.reason}`,
  );
  return "parked";
}

async function recover_stranded_ingested_jobs(): Promise<number> {
  const { rows } = await query_with_diagnostics<{ released: number }>(
    `with stranded as (${RECOVER_STRANDED_INGESTED_SQL}) select count(*)::int as released from stranded`,
    [],
    {
      label: "genome_rosetta_ingestion_recover_stranded",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 10_000,
    },
  );
  return rows[0]?.released ?? 0;
}

async function run_ingestion_cycle(): Promise<void> {
  if (running || stopped) return;
  running = true;
  try {
    let admitted: admitted_generation_target | null = null;
    try {
      admitted = await read_admitted_target();
    } catch {
      admitted = null;
    }
    let live: live_generation_target | null = null;
    if (admitted) {
      try {
        live = await read_live_target();
      } catch {
        live = null;
      }
    }
    const plan = plan_ingestion_cycle(admitted, live);
    if (plan.action === "stand_down") {
      console.log("[GenomeRosettaIngestion] stood_down", {
        reason: plan.reason,
      });
      return;
    }

    const recovered = await recover_stranded_ingested_jobs();
    if (recovered > 0) {
      console.log("[GenomeRosettaIngestion] recovered_stranded", {
        released: recovered,
      });
    }

    const jobs = await claim_ingestion_jobs(bounded_batch_size());
    let ingested = 0;
    let parked = 0;
    let deferred = 0;
    for (const job of jobs) {
      try {
        const outcome = await ingest_version_source(job);
        if (outcome === "ingested") {
          await complete_ingestion_job(job);
          ingested += 1;
        } else {
          parked += 1;
        }
      } catch (error) {
        const code = error_code(error);
        if (is_deterministic_ingestion_failure(error)) {
          await park_ingestion_job(job, code);
          parked += 1;
        } else {
          await defer_ingestion_job(job, code);
          deferred += 1;
        }
      }
    }
    if (jobs.length > 0) {
      console.log("[GenomeRosettaIngestion] cycle", {
        claimed: jobs.length,
        ingested,
        parked,
        deferred,
        rule_set_version: admitted?.rule_set_version,
      });
    }
  } catch (error) {
    console.error("[GenomeRosettaIngestion] cycle_failed", {
      error_code: error_code(error),
    });
  } finally {
    running = false;
  }
}

export function start_genome_rosetta_ingestion_driver(): void {
  if (timer || !enabled()) return;
  stopped = false;
  const delay = bounded_poll_interval_ms();
  console.log("[GenomeRosettaIngestion] started", {
    interval_ms: delay,
    batch_size: bounded_batch_size(),
  });
  void run_ingestion_cycle();
  timer = setInterval(() => void run_ingestion_cycle(), delay);
  timer.unref?.();
}

export function stop_genome_rosetta_ingestion_driver(): void {
  stopped = true;
  if (timer) clearInterval(timer);
  timer = null;
}

import { query_with_diagnostics } from "./db";
import {
  attach_completed_current_result,
  type completed_current_result_attachment,
} from "./civic-genome-legislative-version-pipeline";

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 100;
const DEFAULT_CONCURRENCY = 5;
const MAX_CONCURRENCY = 10;
const AWAITING_PUBLICATION_CODE =
  "rosetta_public_current_docket_result_awaiting_publication";

type held_current_result_candidate = {
  queue_id: string;
  bill_version_id: string;
  source_document_key: string;
  source_content_hash: string;
};

export type current_result_reconciliation_summary = {
  checked: number;
  attached: number;
  awaiting_publication: number;
  still_held: number;
  read_errors: number;
};

function bounded_integer(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, value as number));
}

async function claim_held_current_result_candidates(
  limit: number,
): Promise<held_current_result_candidate[]> {
  const result = await query_with_diagnostics<held_current_result_candidate>(
    `with candidate as materialized (
       select queue.queue_id,
              version.bill_version_id,
              version.source_document_key,
              lower(version.receipt_json->>'source_content_hash') as source_content_hash
         from public.civic_genome_legislative_version_queue queue
         join public.civic_genome_bill_version version
           on version.bill_version_id = queue.bill_version_id
        where version.document_family = 'text'
          and version.processing_state in ('source_ingested', 'extracted')
          and version.assembly_run_id is null
          and version.source_document_key is not null
          and version.receipt_json->>'source_content_hash' ~ '^[0-9A-Fa-f]{64}$'
          and not exists (
            select 1
              from public.civic_genome_bill_version newer
             where newer.genome_bill_id = version.genome_bill_id
               and newer.document_family = 'text'
               and (
                 newer.stage_rank > version.stage_rank
                 or (
                   newer.stage_rank = version.stage_rank
                   and newer.provider_sequence > version.provider_sequence
                 )
               )
          )
          and (
            (
              version.rosetta_extraction_run_id is null
              and (
                (
                  queue.queue_state = 'degraded'
                  and queue.last_failure_class = 'awaiting_current_result'
                  and queue.last_error_code is distinct from
                      'rosetta_public_current_docket_result_awaiting_publication'
                  and queue.next_attempt_at = 'infinity'::timestamptz
                )
                or (
                  queue.queue_state = 'eligible'
                  and queue.attempt_count = 0
                )
              )
            )
            or (
              version.rosetta_extraction_run_id is not null
              and queue.queue_state = 'degraded'
              and queue.last_failure_class = 'awaiting_publication'
              and queue.last_error_code =
                  'rosetta_public_current_docket_result_awaiting_publication'
              and queue.next_attempt_at = 'infinity'::timestamptz
              and version.receipt_json->>'current_publication_status' = 'awaiting_publication'
              and exists (
                select 1
                  from public.civic_genome_rosetta_generation_target target
                 where target.target_name = 'current'
                   and target.engine_version = version.receipt_json->>'rosetta_engine_version'
                   and target.rule_set_version = version.receipt_json->>'rosetta_rule_set_version'
                   and lower(target.rule_manifest_hash) =
                       lower(version.receipt_json->>'rosetta_rule_manifest_hash')
              )
            )
          )
          and queue.locked_at is null
          and queue.locked_by is null
        order by queue.current_result_checked_at nulls first,
                 queue.updated_at,
                 queue.queue_id
        for update of queue skip locked
        limit $1::integer
     ), observed as (
       update public.civic_genome_legislative_version_queue queue
          set current_result_checked_at = now()
         from candidate
        where queue.queue_id = candidate.queue_id
        returning candidate.queue_id::text,
                  candidate.bill_version_id::text,
                  candidate.source_document_key,
                  candidate.source_content_hash
     )
     select * from observed
     order by queue_id`,
    [limit],
    {
      label: "legislative_version_current_result_observation_claim",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
  return result.rows;
}

async function complete_attached_current_result(
  candidate: held_current_result_candidate,
  attachment: completed_current_result_attachment,
): Promise<boolean> {
  if (attachment.state !== "assembled" || !attachment.assembly_run_id) return false;
  const result = await query_with_diagnostics<{ queue_id: string }>(
    `update public.civic_genome_legislative_version_queue queue
        set queue_state = 'completed',
            completed_at = coalesce(queue.completed_at, now()),
            next_attempt_at = now(),
            locked_at = null,
            locked_by = null,
            last_failure_class = null,
            last_error_code = null,
            current_result_checked_at = now(),
            updated_at = now()
       from public.civic_genome_bill_version version
      where queue.queue_id = $1::uuid
        and version.bill_version_id = queue.bill_version_id
        and version.bill_version_id = $2::uuid
        and version.source_document_key = $3::text
        and lower(version.receipt_json->>'source_content_hash') = $4::text
        and version.rosetta_extraction_run_id = $5::text
        and version.assembly_run_id = $6::uuid
        and queue.queue_state in ('degraded', 'eligible')
        and queue.locked_at is null
        and queue.locked_by is null
      returning queue.queue_id::text`,
    [
      candidate.queue_id,
      candidate.bill_version_id,
      candidate.source_document_key,
      candidate.source_content_hash,
      String(attachment.extraction_run_id),
      attachment.assembly_run_id,
    ],
    {
      label: "legislative_version_current_result_attached",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
  return result.rows.length === 1;
}

async function park_awaiting_publication(
  candidate: held_current_result_candidate,
  attachment: completed_current_result_attachment,
): Promise<boolean> {
  if (attachment.state !== "awaiting_publication") return false;
  const result = await query_with_diagnostics<{ queue_id: string }>(
    `update public.civic_genome_legislative_version_queue queue
        set queue_state = 'degraded',
            next_attempt_at = 'infinity'::timestamptz,
            locked_at = null,
            locked_by = null,
            last_failure_class = 'awaiting_publication',
            last_error_code = $5::text,
            current_result_checked_at = now(),
            updated_at = now()
       from public.civic_genome_bill_version version
      where queue.queue_id = $1::uuid
        and version.bill_version_id = queue.bill_version_id
        and version.bill_version_id = $2::uuid
        and version.source_document_key = $3::text
        and lower(version.receipt_json->>'source_content_hash') = $4::text
        and version.rosetta_extraction_run_id = $6::text
        and version.assembly_run_id is null
        and version.processing_state = 'extracted'
        and version.receipt_json->>'current_publication_status' = 'awaiting_publication'
        and queue.queue_state in ('degraded', 'eligible')
        and queue.locked_at is null
        and queue.locked_by is null
      returning queue.queue_id::text`,
    [
      candidate.queue_id,
      candidate.bill_version_id,
      candidate.source_document_key,
      candidate.source_content_hash,
      AWAITING_PUBLICATION_CODE,
      String(attachment.extraction_run_id),
    ],
    {
      label: "legislative_version_current_result_awaiting_publication",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
  return result.rows.length === 1;
}

async function observe_candidate(
  candidate: held_current_result_candidate,
): Promise<"attached" | "awaiting_publication" | "held" | "read_error"> {
  try {
    const attachment = await attach_completed_current_result(
      candidate.bill_version_id,
    );
    if (!attachment) return "held";
    if (attachment.state === "awaiting_publication") {
      return await park_awaiting_publication(candidate, attachment)
        ? "awaiting_publication"
        : "held";
    }
    return await complete_attached_current_result(candidate, attachment)
      ? "attached"
      : "held";
  } catch (error) {
    console.error("[CurrentResultReconciliation] observation_failed", {
      queue_id: candidate.queue_id,
      bill_version_id: candidate.bill_version_id,
      source_document_key: candidate.source_document_key,
      error_code: error instanceof Error ? error.message : "unknown_current_result_read_failure",
    });
    return "read_error";
  }
}

/**
 * Observe exact current-source rows and record completed Rosetta extraction
 * truth without invoking source acquisition or Rosetta execution.
 *
 * Publication remains separately governed. If the exact completed result does
 * not match Civic Genome's current generation target, extraction is persisted
 * and the row parks as awaiting_publication. The row becomes eligible for
 * assembly automatically only after that target matches the recorded engine,
 * rule set, and manifest. No queue attempt is consumed here.
 */
export async function reconcile_awaiting_current_results(input: {
  limit?: number;
  concurrency?: number;
} = {}): Promise<current_result_reconciliation_summary> {
  const limit = bounded_integer(input.limit, DEFAULT_BATCH_SIZE, 1, MAX_BATCH_SIZE);
  const concurrency = bounded_integer(
    input.concurrency,
    DEFAULT_CONCURRENCY,
    1,
    MAX_CONCURRENCY,
  );
  const candidates = await claim_held_current_result_candidates(limit);
  const summary: current_result_reconciliation_summary = {
    checked: candidates.length,
    attached: 0,
    awaiting_publication: 0,
    still_held: 0,
    read_errors: 0,
  };

  for (let offset = 0; offset < candidates.length; offset += concurrency) {
    const outcomes = await Promise.all(
      candidates.slice(offset, offset + concurrency).map(observe_candidate),
    );
    for (const outcome of outcomes) {
      if (outcome === "attached") summary.attached += 1;
      else if (outcome === "awaiting_publication") summary.awaiting_publication += 1;
      else if (outcome === "read_error") summary.read_errors += 1;
      else summary.still_held += 1;
    }
  }
  return summary;
}

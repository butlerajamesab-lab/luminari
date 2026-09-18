import { query_with_diagnostics } from "./db";
import { load_rosetta_current_docket_result_for_binding } from "./civic-genome-rosetta-evaluation";

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 100;
const DEFAULT_CONCURRENCY = 5;
const MAX_CONCURRENCY = 10;

type held_current_result_candidate = {
  queue_id: string;
  bill_version_id: string;
  source_document_key: string;
  source_content_hash: string;
};

export type current_result_reconciliation_summary = {
  checked: number;
  woken: number;
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
        where queue.queue_state = 'degraded'
          and queue.last_failure_class = 'awaiting_current_result'
          and queue.last_error_code is distinct from
              'rosetta_public_current_docket_result_awaiting_publication'
          and queue.next_attempt_at = 'infinity'::timestamptz
          and queue.locked_at is null
          and queue.locked_by is null
          and version.source_document_key is not null
          and version.receipt_json->>'source_content_hash' ~ '^[0-9A-Fa-f]{64}$'
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

async function wake_completed_current_result(
  candidate: held_current_result_candidate,
): Promise<boolean> {
  const result = await query_with_diagnostics<{ queue_id: string }>(
    `update public.civic_genome_legislative_version_queue queue
        set queue_state = 'eligible',
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
        and queue.queue_state = 'degraded'
        and queue.last_failure_class = 'awaiting_current_result'
        and queue.last_error_code is distinct from
            'rosetta_public_current_docket_result_awaiting_publication'
        and queue.next_attempt_at = 'infinity'::timestamptz
        and queue.locked_at is null
        and queue.locked_by is null
      returning queue.queue_id::text`,
    [
      candidate.queue_id,
      candidate.bill_version_id,
      candidate.source_document_key,
      candidate.source_content_hash,
    ],
    {
      label: "legislative_version_current_result_arrived",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
  return result.rows.length === 1;
}

async function observe_candidate(
  candidate: held_current_result_candidate,
): Promise<"woken" | "held" | "read_error"> {
  try {
    const current = await load_rosetta_current_docket_result_for_binding({
      source_document_key: candidate.source_document_key,
      source_content_hash: candidate.source_content_hash,
    });
    if (current?.status !== "complete" || !current.current_result) return "held";
    return await wake_completed_current_result(candidate) ? "woken" : "held";
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
 * Observe parked current-result holds without invoking Rosetta execution.
 *
 * A row is reopened only after Rosetta returns a complete result for the exact
 * source_document_key + SHA-256 pair already preserved on the bill version.
 * The queue attempt counter and prior source/decomposition receipts are never
 * rewritten here.
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
    woken: 0,
    still_held: 0,
    read_errors: 0,
  };

  for (let offset = 0; offset < candidates.length; offset += concurrency) {
    const outcomes = await Promise.all(
      candidates.slice(offset, offset + concurrency).map(observe_candidate),
    );
    for (const outcome of outcomes) {
      if (outcome === "woken") summary.woken += 1;
      else if (outcome === "read_error") summary.read_errors += 1;
      else summary.still_held += 1;
    }
  }
  return summary;
}

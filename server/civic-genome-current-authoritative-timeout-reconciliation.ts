import { query_with_diagnostics } from "./db";

const LEGACY_ROSETTA_TIMEOUT_CODE =
  "legislative_version_rosetta_extraction_timeout:60000";
const RECOVERY_BATCH_SIZE = 100;

export type current_authoritative_timeout_recovery = {
  queue_id: string;
  bill_version_id: string;
  source_bill_id: number;
  state_code: string;
  source_bill_number: string | null;
  version_type: string;
  attempt_count: number;
};

/**
 * Reopens only current-session authoritative legislative versions that were
 * terminal solely because Lighthouse's former 60-second Rosetta RPC window
 * expired. Historical failures remain terminal. Attempt counts and immutable
 * bill-version failure receipts are preserved; clearing the queue failure fields
 * is the explicit intentional-replay signal required by the monotonicity guard.
 */
export async function reconcile_current_authoritative_legacy_rosetta_timeouts(): Promise<
  current_authoritative_timeout_recovery[]
> {
  const result = await query_with_diagnostics<current_authoritative_timeout_recovery>(
    `with current_sessions as (
       select distinct state, session_id::text as session_key
         from public.docket_bill_state_cache
     ), authoritative as (
       select distinct on (version.genome_bill_id)
              version.bill_version_id,
              version.genome_bill_id,
              version.source_bill_id,
              bill.state_code,
              bill.source_bill_number,
              version.version_type
         from public.civic_genome_bill_version version
         join public.civic_genome_bill bill
           on bill.genome_bill_id = version.genome_bill_id
         join current_sessions current_session
           on current_session.state = bill.state_code
          and current_session.session_key = bill.session_key
        where bill.current_state_position = 'enacted'
          and version.document_family = 'text'
          and lower(version.version_type) in ('chaptered', 'enrolled')
        order by version.genome_bill_id,
                 case lower(version.version_type)
                   when 'chaptered' then 2
                   when 'enrolled' then 1
                   else 0
                 end desc,
                 version.provider_sequence desc,
                 version.updated_at desc,
                 version.bill_version_id
     ), candidate as (
       select queue.queue_id,
              queue.bill_version_id,
              queue.attempt_count,
              authoritative.source_bill_id,
              authoritative.state_code,
              authoritative.source_bill_number,
              authoritative.version_type
         from public.civic_genome_legislative_version_queue queue
         join authoritative
           on authoritative.bill_version_id = queue.bill_version_id
         join public.civic_genome_bill_version version
           on version.bill_version_id = queue.bill_version_id
        where queue.queue_state = 'permanent_failure'
          and queue.last_error_code = $1
          and version.processing_state = 'failed'
          and version.failure_code = $1
        order by queue.updated_at, queue.queue_id
        for update of queue skip locked
        limit $2::integer
     ), recovered as (
       update public.civic_genome_legislative_version_queue queue
          set queue_state = 'eligible',
              next_attempt_at = now(),
              locked_at = null,
              locked_by = null,
              completed_at = null,
              last_failure_class = null,
              last_error_code = null,
              updated_at = now()
         from candidate
        where queue.queue_id = candidate.queue_id
        returning queue.queue_id::text,
                  queue.bill_version_id::text,
                  queue.attempt_count
     )
     select recovered.queue_id,
            recovered.bill_version_id,
            candidate.source_bill_id,
            candidate.state_code,
            candidate.source_bill_number,
            candidate.version_type,
            recovered.attempt_count
       from recovered
       join candidate on candidate.queue_id::text = recovered.queue_id
      order by candidate.state_code,
               candidate.source_bill_number nulls last,
               recovered.queue_id`,
    [LEGACY_ROSETTA_TIMEOUT_CODE, RECOVERY_BATCH_SIZE],
    {
      label: "current_authoritative_legacy_rosetta_timeout_recovery",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );

  if (result.rows.length > 0) {
    console.log("[CurrentAuthoritativeRosettaRecovery] legacy_timeouts_requeued", {
      recovered_count: result.rows.length,
      failure_code: LEGACY_ROSETTA_TIMEOUT_CODE,
      scope: "current_session_enacted_authoritative_enrolled_or_chaptered_only",
      attempt_counts_preserved: true,
      historical_replay: false,
    });
  }
  return result.rows;
}

import { query_with_diagnostics } from "./db";
import {
  reconcile_preserved_amendment_source_basis,
  type amendment_source_completion_result,
} from "./civic-genome-legislative-version-pipeline";

const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 50;
const DEFAULT_CONCURRENCY = 5;
const MAX_CONCURRENCY = 10;
const TRANSIENT_DELAY_SECONDS = 300;
const worker_id = `amendment-source-completion:${process.env.RENDER_INSTANCE_ID ?? process.pid}`;

type source_completion_job = {
  queue_id: string;
  bill_version_id: string;
};

export type amendment_source_completion_summary = {
  checked: number;
  awaiting_attachment: number;
  awaiting_base: number;
  awaiting_delta: number;
  transient: number;
};

function bounded_integer(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!Number.isSafeInteger(value)) return fallback;
  return Math.max(min, Math.min(max, value as number));
}

async function claim_jobs(limit: number): Promise<source_completion_job[]> {
  const result = await query_with_diagnostics<source_completion_job>(
    `with candidate as materialized (
       select queue.queue_id,version.bill_version_id
         from public.civic_genome_legislative_version_queue queue
         join public.civic_genome_bill_version version
           on version.bill_version_id=queue.bill_version_id
        where version.document_family='amendment'
          and version.processing_state='source_ingested'
          and version.receipt_json->>'rosetta_source_content_id'
                ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          and version.receipt_json->>'source_content_hash' ~ '^[0-9A-Fa-f]{64}$'
          and queue.next_attempt_at <= now()
          and (
            queue.queue_state='eligible'
            or (
              queue.queue_state='degraded'
              and queue.last_failure_class='amendment_source_completion_transient'
            )
          )
          and queue.locked_at is null
          and queue.locked_by is null
        order by queue.created_at,queue.queue_id
        for update of queue skip locked
        limit $1::integer
     )
     update public.civic_genome_legislative_version_queue queue
        set queue_state='submitted',
            locked_at=now(),
            locked_by=$2::text,
            updated_at=now()
       from candidate
      where queue.queue_id=candidate.queue_id
      returning queue.queue_id::text,candidate.bill_version_id::text`,
    [limit,worker_id],
    {
      label:"amendment_source_completion_claim",
      pool_acquire_timeout_ms:1000,
      query_timeout_ms:5000,
    },
  );
  return result.rows;
}

async function park_dependency(
  job: source_completion_job,
  result: amendment_source_completion_result,
): Promise<void> {
  await query_with_diagnostics(
    `update public.civic_genome_legislative_version_queue
        set queue_state='degraded',
            next_attempt_at='infinity'::timestamptz,
            locked_at=null,
            locked_by=null,
            last_failure_class=$2::text,
            last_error_code=$3::text,
            updated_at=now()
      where queue_id=$1::uuid
        and locked_by=$4::text`,
    [job.queue_id,result.failure_class,result.error_code,worker_id],
    {
      label:"amendment_source_completion_park",
      pool_acquire_timeout_ms:1000,
      query_timeout_ms:5000,
    },
  );
  await query_with_diagnostics(
    `update public.civic_genome_bill_version
        set processing_state='source_ingested',
            failure_code=$2::text,
            receipt_json=coalesce(receipt_json,'{}'::jsonb)
              || jsonb_build_object(
                'amendment_dependency_state',$3::text,
                'amendment_dependency_code',$2::text,
                'amendment_dependency_observed_at',now(),
                'amendment_source_completion_contract',
                  'preserved-source-basis-v1'
              ),
            updated_at=now()
      where bill_version_id=$1::uuid`,
    [job.bill_version_id,result.error_code,result.failure_class],
    {
      label:"amendment_source_completion_record",
      pool_acquire_timeout_ms:1000,
      query_timeout_ms:5000,
    },
  );
}

async function release_transient(
  job: source_completion_job,
  error: unknown,
): Promise<void> {
  const error_code = error instanceof Error ? error.message : "unknown_amendment_source_completion_error";
  await query_with_diagnostics(
    `update public.civic_genome_legislative_version_queue
        set queue_state='degraded',
            next_attempt_at=now()+make_interval(secs=>$2::integer),
            locked_at=null,
            locked_by=null,
            last_failure_class='amendment_source_completion_transient',
            last_error_code=$3::text,
            updated_at=now()
      where queue_id=$1::uuid
        and locked_by=$4::text`,
    [job.queue_id,TRANSIENT_DELAY_SECONDS,error_code.slice(0,1000),worker_id],
    {
      label:"amendment_source_completion_transient",
      pool_acquire_timeout_ms:1000,
      query_timeout_ms:5000,
    },
  );
}

async function process_job(
  job: source_completion_job,
): Promise<amendment_source_completion_result["failure_class"] | "transient"> {
  try {
    const result = await reconcile_preserved_amendment_source_basis(job.bill_version_id);
    await park_dependency(job,result);
    return result.failure_class;
  } catch (error) {
    await release_transient(job,error);
    console.error("[AmendmentSourceCompletion] transient", {
      queue_id:job.queue_id,
      bill_version_id:job.bill_version_id,
      error_code:error instanceof Error ? error.message : "unknown",
    });
    return "transient";
  }
}

/**
 * Reconcile already-preserved amendment source bases without provider fetches
 * or Rosetta execution. Queue attempt_count is never modified here.
 */
export async function reconcile_preserved_amendment_sources(input: {
  limit?: number;
  concurrency?: number;
} = {}): Promise<amendment_source_completion_summary> {
  const limit=bounded_integer(input.limit,DEFAULT_BATCH_SIZE,1,MAX_BATCH_SIZE);
  const concurrency=bounded_integer(input.concurrency,DEFAULT_CONCURRENCY,1,MAX_CONCURRENCY);
  const jobs=await claim_jobs(limit);
  const summary: amendment_source_completion_summary = {
    checked:jobs.length,
    awaiting_attachment:0,
    awaiting_base:0,
    awaiting_delta:0,
    transient:0,
  };
  for(let offset=0;offset<jobs.length;offset+=concurrency){
    const outcomes=await Promise.all(jobs.slice(offset,offset+concurrency).map(process_job));
    for(const outcome of outcomes){
      if(outcome==="awaiting_amendment_attachment") summary.awaiting_attachment+=1;
      else if(outcome==="awaiting_amendment_base") summary.awaiting_base+=1;
      else if(outcome==="awaiting_delta_executor") summary.awaiting_delta+=1;
      else summary.transient+=1;
    }
  }
  return summary;
}

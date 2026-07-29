import { getPool } from "../db";

const ATLAS_ADAPTER_NAME = "atlas_stream";
const ATLAS_POST_PROCESSING_ENGINE = "atlas-stream-bridge";

export async function create_atlas_ingest_run(input: {
  dataset_id: string;
  start_time: number;
  endpoint_attempted: string;
}): Promise<number> {
  const result = await getPool().query<{ id: number | string }>(
    `insert into public.ingest_runs (
       dataset_id_run,
       start_time,
       ingest_status,
       endpoint_attempted_run,
       adapter_used_run
     ) values ($1, $2, 'running', $3, $4)
     returning id`,
    [
      input.dataset_id,
      input.start_time,
      input.endpoint_attempted,
      ATLAS_ADAPTER_NAME,
    ],
  );

  const run_id = Number(result.rows[0]?.id);
  if (!Number.isSafeInteger(run_id) || run_id <= 0) {
    throw new Error(`Failed to create Atlas bridge ingest run for ${input.dataset_id}`);
  }
  return run_id;
}

export async function complete_atlas_ingest_run(input: {
  run_id: number;
  end_time: number;
  records_processed: number;
  records_inserted: number;
  records_updated: number;
  endpoint_attempted: string;
}): Promise<void> {
  const result = await getPool().query(
    `update public.ingest_runs
        set end_time = $2,
            records_processed = $3,
            records_inserted = $4,
            records_updated = $5,
            signals_generated = $4,
            ingest_status = 'completed',
            errors_run = null,
            summary_run = $6,
            endpoint_attempted_run = $7,
            adapter_used_run = $8,
            signals_processed_run = true,
            post_processing_engine_run = $9,
            outcome_classification_run = 'completed'
      where id = $1`,
    [
      input.run_id,
      input.end_time,
      input.records_processed,
      input.records_inserted,
      input.records_updated,
      `Synchronized ${input.records_processed} Atlas events: ${input.records_inserted} inserted, ${input.records_updated} refreshed`,
      input.endpoint_attempted,
      ATLAS_ADAPTER_NAME,
      ATLAS_POST_PROCESSING_ENGINE,
    ],
  );

  if ((result.rowCount ?? 0) !== 1) {
    throw new Error(`Atlas ingest run ${input.run_id} was not completed`);
  }
}

export async function fail_atlas_ingest_run(input: {
  run_id: number;
  end_time: number;
  records_processed: number;
  records_inserted: number;
  records_updated: number;
  error_message: string;
  endpoint_attempted: string;
}): Promise<void> {
  const partial_failure = input.records_processed > 0;
  const failure_classification = partial_failure
    ? "atlas_bridge_partial_failure"
    : "atlas_bridge_failure";
  const outcome_classification = partial_failure
    ? "partial_failure"
    : "pipeline_error";
  const summary = partial_failure
    ? `Partially synchronized ${input.records_processed} Atlas events before failure: ${input.records_inserted} inserted, ${input.records_updated} refreshed`
    : "Atlas stream synchronization failed before any event page committed";

  const result = await getPool().query(
    `update public.ingest_runs
        set end_time = $2,
            records_processed = $3,
            records_inserted = $4,
            records_updated = $5,
            signals_generated = $4,
            ingest_status = 'failed',
            errors_run = $6,
            summary_run = $7,
            error_classification_run = 'unknown',
            endpoint_attempted_run = $8,
            adapter_used_run = $9,
            failure_classification_run = $10,
            suggested_remediation_run = $11,
            signals_processed_run = $12,
            post_processing_engine_run = $13,
            outcome_classification_run = $14
      where id = $1`,
    [
      input.run_id,
      input.end_time,
      input.records_processed,
      input.records_inserted,
      input.records_updated,
      JSON.stringify([input.error_message]),
      summary,
      input.endpoint_attempted,
      ATLAS_ADAPTER_NAME,
      failure_classification,
      "Verify Atlas credentials, stream registration, and signal_events access.",
      partial_failure,
      ATLAS_POST_PROCESSING_ENGINE,
      outcome_classification,
    ],
  );

  if ((result.rowCount ?? 0) !== 1) {
    throw new Error(`Atlas ingest run ${input.run_id} failure was not recorded`);
  }
}

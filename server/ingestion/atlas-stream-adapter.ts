import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { dataStreamRegistry } from "../../drizzle/schema";
import { db, getPool } from "../db";
import {
  fetch_atlas_signal_events,
  fetch_atlas_stream_definition,
  get_atlas_bridge_client,
  type atlas_signal_event,
  type atlas_stream_definition,
} from "./atlas-bridge-client";
import {
  complete_atlas_ingest_run,
  create_atlas_ingest_run,
  fail_atlas_ingest_run,
} from "./atlas-ingest-run-store";
import type { IngestionResult } from "./socrata-adapter";

const ATLAS_BRIDGE_CURSOR_NAME = "lighthouse-atlas-bridge-v1";
const ATLAS_PAGE_SIZE = 1_000;
const ATLAS_MAX_PAGES = 1_000;
const ATLAS_ADAPTER_NAME = "atlas_stream";

function make_cursor_id(stream_id: string): string {
  const digest = createHash("sha256")
    .update(`${ATLAS_BRIDGE_CURSOR_NAME}:${stream_id}`)
    .digest("hex")
    .slice(0, 24);
  return `cur_atlas_${digest}`;
}

function make_diagnostics(input: {
  error_classification: string | null;
  failure_classification: string | null;
  suggested_remediation: string | null;
  outcome_classification: string;
  endpoint_attempted: string;
}) {
  return {
    errorClassification: input.error_classification,
    httpStatus: null,
    contentType: "application/json",
    endpointAttempted: input.endpoint_attempted,
    adapterUsed: ATLAS_ADAPTER_NAME,
    bodyPreview: null,
    parseFailureReason: null,
    retryCount: 0,
    failureClassification: input.failure_classification,
    suggestedRemediation: input.suggested_remediation,
    outcomeClassification: input.outcome_classification,
  };
}

async function mirror_stream_definition(
  stream: atlas_stream_definition,
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO public.streams (
       stream_id,
       source_id,
       jurisdiction_id,
       module_hint,
       throughput_profile,
       safety_profile,
       governance_contract_id,
       status,
       created_at,
       updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz)
     ON CONFLICT (stream_id) DO UPDATE SET
       source_id = EXCLUDED.source_id,
       jurisdiction_id = EXCLUDED.jurisdiction_id,
       module_hint = EXCLUDED.module_hint,
       throughput_profile = EXCLUDED.throughput_profile,
       safety_profile = EXCLUDED.safety_profile,
       governance_contract_id = EXCLUDED.governance_contract_id,
       status = EXCLUDED.status,
       updated_at = EXCLUDED.updated_at`,
    [
      stream.stream_id,
      stream.source_id,
      stream.jurisdiction_id,
      stream.module_hint,
      stream.throughput_profile,
      stream.safety_profile,
      stream.governance_contract_id,
      stream.status,
      stream.created_at,
      stream.updated_at,
    ],
  );
}

async function get_bridge_offset(stream_id: string): Promise<number> {
  const pool = getPool();
  const result = await pool.query<{ current_offset: string | number }>(
    `SELECT current_offset
       FROM public.cursors
      WHERE stream_id = $1 AND name = $2
      LIMIT 1`,
    [stream_id, ATLAS_BRIDGE_CURSOR_NAME],
  );

  const current_offset = Number(result.rows[0]?.current_offset ?? 0);
  return Number.isSafeInteger(current_offset) && current_offset >= 0
    ? current_offset
    : 0;
}

async function write_event_page(input: {
  stream_id: string;
  events: atlas_signal_event[];
  next_offset: number;
}): Promise<{ inserted: number; updated: number }> {
  if (input.events.length === 0) return { inserted: 0, updated: 0 };

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const offsets = input.events.map((event) => String(event.offset));
    const existing_result = await client.query<{ offset: string }>(
      `SELECT "offset"::text AS offset
         FROM public.signal_events
        WHERE stream_id = $1 AND "offset" = ANY($2::bigint[])`,
      [input.stream_id, offsets],
    );
    const existing_offsets = new Set(
      existing_result.rows.map((row) => String(row.offset)),
    );

    await client.query(
      `WITH incoming AS (
         SELECT *
           FROM jsonb_to_recordset($1::jsonb) AS event_row(
             stream_id text,
             "offset" bigint,
             "timestamp" timestamptz,
             signal_type text,
             spacetime jsonb,
             provenance jsonb,
             payload jsonb,
             source_id text,
             jurisdiction_id text,
             module_hint text,
             ingested_at timestamptz
           )
       )
       INSERT INTO public.signal_events (
         stream_id,
         "offset",
         "timestamp",
         signal_type,
         spacetime,
         provenance,
         payload,
         source_id,
         jurisdiction_id,
         module_hint,
         ingested_at
       )
       SELECT
         stream_id,
         "offset",
         "timestamp",
         signal_type,
         spacetime,
         provenance,
         payload,
         source_id,
         jurisdiction_id,
         module_hint,
         ingested_at
       FROM incoming
       ON CONFLICT (stream_id, "offset") DO UPDATE SET
         "timestamp" = EXCLUDED."timestamp",
         signal_type = EXCLUDED.signal_type,
         spacetime = EXCLUDED.spacetime,
         provenance = EXCLUDED.provenance,
         payload = EXCLUDED.payload,
         source_id = EXCLUDED.source_id,
         jurisdiction_id = EXCLUDED.jurisdiction_id,
         module_hint = EXCLUDED.module_hint,
         ingested_at = EXCLUDED.ingested_at`,
      [JSON.stringify(input.events)],
    );

    const now = new Date().toISOString();
    await client.query(
      `INSERT INTO public.cursors (
         cursor_id,
         stream_id,
         name,
         current_offset,
         created_by,
         created_at,
         updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $6::timestamptz)
       ON CONFLICT (stream_id, name) DO UPDATE SET
         current_offset = EXCLUDED.current_offset,
         updated_at = EXCLUDED.updated_at`,
      [
        make_cursor_id(input.stream_id),
        input.stream_id,
        ATLAS_BRIDGE_CURSOR_NAME,
        input.next_offset,
        "SYSTEM:lighthouse-atlas-bridge",
        now,
      ],
    );

    await client.query("COMMIT");

    const updated = input.events.filter((event) =>
      existing_offsets.has(String(event.offset)),
    ).length;
    return {
      inserted: input.events.length - updated,
      updated,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function ingest_atlas_stream(
  dataset_id: string,
  options?: { max_records?: number; on_progress?: (message: string) => void },
): Promise<IngestionResult> {
  const log = options?.on_progress ?? console.log;
  const endpoint_attempted = `atlas://public.signal_events/${dataset_id}`;

  const [dataset] = await db
    .select()
    .from(dataStreamRegistry)
    .where(eq(dataStreamRegistry.streamId, dataset_id))
    .limit(1);

  if (!dataset) {
    const error_message = `Dataset ${dataset_id} not found in registry`;
    return {
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      signalsGenerated: 0,
      errors: [error_message],
      runId: 0,
      diagnostics: make_diagnostics({
        error_classification: "schema_mismatch",
        failure_classification: "config_error",
        suggested_remediation: "Register the Atlas stream mirror before running ingestion.",
        outcome_classification: "config_error",
        endpoint_attempted,
      }),
    };
  }

  if (!dataset.enabled) {
    const error_message = `Dataset ${dataset_id} is disabled`;
    return {
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      signalsGenerated: 0,
      errors: [error_message],
      runId: 0,
      diagnostics: make_diagnostics({
        error_classification: null,
        failure_classification: "disabled",
        suggested_remediation: "Enable the Atlas stream mirror before running ingestion.",
        outcome_classification: "skipped_disabled",
        endpoint_attempted,
      }),
    };
  }

  const atlas_result = await get_atlas_bridge_client();
  if (!atlas_result.configured) {
    return {
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      signalsGenerated: 0,
      errors: [atlas_result.error_message],
      runId: 0,
      diagnostics: make_diagnostics({
        error_classification: "auth_failure",
        failure_classification: "bridge_not_configured",
        suggested_remediation: atlas_result.error_message,
        outcome_classification: "config_error",
        endpoint_attempted,
      }),
    };
  }

  const run_id = await create_atlas_ingest_run({
    dataset_id,
    start_time: Date.now(),
    endpoint_attempted,
  });
  const max_records = options?.max_records && options.max_records > 0
    ? Math.floor(options.max_records)
    : Number.POSITIVE_INFINITY;
  let current_offset = 0;
  let records_processed = 0;
  let records_inserted = 0;
  let records_updated = 0;
  let page_count = 0;

  try {
    const stream_data = await fetch_atlas_stream_definition(
      atlas_result.client,
      dataset_id,
    );

    if (!stream_data) {
      throw new Error(`Atlas stream ${dataset_id} is not registered or exported`);
    }

    await mirror_stream_definition(stream_data);

    current_offset = await get_bridge_offset(dataset_id);

    while (page_count < ATLAS_MAX_PAGES && records_processed < max_records) {
      const remaining = max_records - records_processed;
      const page_size = Number.isFinite(remaining)
        ? Math.min(ATLAS_PAGE_SIZE, remaining)
        : ATLAS_PAGE_SIZE;

      const events = await fetch_atlas_signal_events(atlas_result.client, {
        stream_id: dataset_id,
        offset: current_offset,
        limit: page_size,
      });
      if (events.length === 0) break;

      const last_offset = Number(events[events.length - 1].offset);
      if (!Number.isSafeInteger(last_offset)) {
        throw new Error(
          `Atlas offset is outside the JavaScript safe integer range: ${String(events[events.length - 1].offset)}`,
        );
      }
      const next_offset = last_offset + 1;

      const page_result = await write_event_page({
        stream_id: dataset_id,
        events,
        next_offset,
      });

      records_processed += events.length;
      records_inserted += page_result.inserted;
      records_updated += page_result.updated;
      current_offset = next_offset;
      page_count += 1;
      log(
        `[Atlas Bridge] ${dataset_id}: ${records_processed} events synchronized through offset ${current_offset}`,
      );

      if (events.length < page_size) break;
    }

    if (page_count >= ATLAS_MAX_PAGES && records_processed < max_records) {
      const remaining_events = await fetch_atlas_signal_events(atlas_result.client, {
        stream_id: dataset_id,
        offset: current_offset,
        limit: 1,
      });
      if (remaining_events.length > 0) {
        throw new Error(
          `Atlas bridge page limit reached for ${dataset_id}; cursor preserved at ${current_offset}`,
        );
      }
    }

    const now = Date.now();
    await complete_atlas_ingest_run({
      run_id,
      end_time: now,
      records_processed,
      records_inserted,
      records_updated,
      endpoint_attempted,
    });

    await db
      .update(dataStreamRegistry)
      .set({
        lastIngestedAt: now,
        recordsIngested: sql`coalesce(records_ingested_dsr, 0) + ${records_inserted}`,
        lastRecordsIngested: records_inserted,
        lastRunStatus: "completed",
        lastSuccessAt: now,
        consecutiveFailures: 0,
        retryAfterAt: null,
        autoDisabled: false,
        disabledReason: null,
        updatedAt: now,
      })
      .where(eq(dataStreamRegistry.streamId, dataset_id));

    return {
      recordsProcessed: records_processed,
      recordsInserted: records_inserted,
      recordsUpdated: records_updated,
      signalsGenerated: records_inserted,
      errors: [],
      runId: run_id,
      diagnostics: make_diagnostics({
        error_classification: null,
        failure_classification: null,
        suggested_remediation: null,
        outcome_classification: "completed",
        endpoint_attempted,
      }),
    };
  } catch (error) {
    const error_message = error instanceof Error ? error.message : String(error);
    const partial_failure = records_processed > 0;
    const now = Date.now();

    try {
      await fail_atlas_ingest_run({
        run_id,
        end_time: now,
        records_processed,
        records_inserted,
        records_updated,
        error_message,
        endpoint_attempted,
      });

      if (partial_failure) {
        await db
          .update(dataStreamRegistry)
          .set({
            lastIngestedAt: now,
            recordsIngested: sql`coalesce(records_ingested_dsr, 0) + ${records_inserted}`,
            signalsGenerated: sql`coalesce(signals_generated_dsr, 0) + ${records_inserted}`,
            lastRecordsIngested: records_inserted,
            lastSignalsGenerated: records_inserted,
            lastRunStatus: "partial",
            lastFailureAt: now,
            lastErrorType: "atlas_bridge_partial_failure",
            lastErrorMessage: error_message.substring(0, 500),
            failureCount: sql`coalesce(failure_count_dsr, 0) + 1`,
            consecutiveFailures: 0,
            retryAfterAt: null,
            autoDisabled: false,
            disabledReason: null,
            updatedAt: now,
          })
          .where(eq(dataStreamRegistry.streamId, dataset_id));
      }
    } catch (run_update_error) {
      console.error(
        `[Atlas Bridge] Failed to record run ${run_id} failure:`,
        run_update_error,
      );
    }

    return {
      recordsProcessed: records_processed,
      recordsInserted: records_inserted,
      recordsUpdated: records_updated,
      signalsGenerated: records_inserted,
      errors: [error_message],
      runId: run_id,
      diagnostics: make_diagnostics({
        error_classification: "unknown",
        failure_classification: partial_failure
          ? "atlas_bridge_partial_failure"
          : "atlas_bridge_failure",
        suggested_remediation:
          "Verify Atlas credentials, stream registration, and signal_events access.",
        outcome_classification: partial_failure ? "partial_failure" : "pipeline_error",
        endpoint_attempted,
      }),
    };
  }
}

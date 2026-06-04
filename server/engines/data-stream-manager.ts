/**
 * Data Stream Manager
 *
 * Admin UI service for managing ingestion data streams:
 * - Add new streams (government_complaints, court_filings, etc.)
 * - Edit stream configuration (weights, frequency, field mapping)
 * - Enable/disable streams
 * - View stream health and statistics
 *
 * Runtime note:
 * The unified query layer owns data_stream_registry reads and emits one
 * canonical snake_case shape for Sovereign Control, Mission Control, and Sunam.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { get_unified_ingestion_metrics, get_unified_ingestion_summary } from "../unified-queries";

export const STREAM_TYPES = [
  { id: "government_complaints", label: "Government Complaints", description: "Consumer complaints filed with government agencies" },
  { id: "court_filings", label: "Court Filings", description: "Federal and state court case filings" },
  { id: "regulatory_enforcement", label: "Regulatory Enforcement", description: "Enforcement actions by regulatory agencies" },
  { id: "public_records", label: "Public Records", description: "Government public records and disclosures" },
  { id: "media_reports", label: "Media Reports", description: "News and investigative journalism reports" },
  { id: "civil_society_reports", label: "Civil Society Reports", description: "Reports from NGOs and advocacy organizations" },
  { id: "verified_user_reports", label: "Verified User Reports", description: "Reports submitted and verified by platform users" },
] as const;

export const UPDATE_FREQUENCIES = [
  { id: "realtime", label: "Real-time" },
  { id: "hourly", label: "Hourly" },
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "manual", label: "Manual Only" },
] as const;

<<<<<<< codex/complete-snake_case-migration-in-runtime-code-dmxds3
type CanonicalStream = Awaited<ReturnType<typeof get_unified_ingestion_metrics>>[number];

async function listCanonicalStreams(): Promise<CanonicalStream[]> {
  return get_unified_ingestion_metrics();
=======
type StreamRow = {
  id: number;
  stream_id: string;
  stream_name: string;
  stream_type: string | null;
  source_url: string | null;
  api_url: string | null;
  update_frequency: string | null;
  cron_expression: string | null;
  signal_weight: number | null;
  confidence_multiplier: number | null;
  enabled: number | boolean | null;
  field_mapping: string | null;
  post_processing_engine_name: string | null;
  parser_mode: string | null;
  records_ingested: number | null;
  signals_generated: number | null;
  lastIngestedAt: string | number | null;
  lastRunStatus: string | null;
  lastSuccessAt: string | number | null;
  lastFailureAt: string | number | null;
  last_errorType: string | null;
  last_errorMessage: string | null;
  lastHttpStatus: string | null;
  failureCount: number | null;
  consecutive_failures: number | null;
  auto_disabled: number | boolean | null;
  disabledReason: string | null;
};

function toBool(value: number | boolean | null | undefined): boolean {
  return value === true || Number(value) === 1;
}

function toNumber(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toTimestamp(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStream(row: StreamRow) {
  const lastIngestedAt = toTimestamp(row.lastIngestedAt);
  const enabled = toBool(row.enabled);
  const auto_disabled = toBool(row.auto_disabled);
  const records_ingested = toNumber(row.records_ingested);
  const signals_generated = toNumber(row.signals_generated);
  const failureCount = toNumber(row.failureCount);
  const consecutive_failures = toNumber(row.consecutive_failures);
  const signal_weight = toNumber(row.signal_weight) || 100;
  const confidence_multiplier = toNumber(row.confidence_multiplier) || 100;

  return {
    id: row.id,
    stream_id: row.stream_id,
    stream_name: row.stream_name,
    stream_type: row.stream_type ?? "unknown",
    source_url: row.source_url,
    api_url: row.api_url,
    update_frequency: row.update_frequency ?? "manual",
    cron_expression: row.cron_expression,
    signal_weight,
    confidence_multiplier,
    enabled,
    field_mapping: row.field_mapping,
    post_processing_engine_name: row.post_processing_engine_name,
    parser_mode: row.parser_mode,
    records_ingested,
    signals_generated,
    lastIngestedAt,
    lastRunStatus: row.lastRunStatus,
    lastSuccessAt: toTimestamp(row.lastSuccessAt),
    lastFailureAt: toTimestamp(row.lastFailureAt),
    last_errorType: row.last_errorType,
    last_errorMessage: row.last_errorMessage,
    lastHttpStatus: row.lastHttpStatus,
    failureCount,
    consecutive_failures,
    auto_disabled,
    disabledReason: row.disabledReason,
    linkedDatasetCount: 1,
    healthStatus: auto_disabled
      ? "auto_disabled"
      : enabled
        ? (lastIngestedAt && Date.now() - lastIngestedAt < 7 * 24 * 60 * 60 * 1000
          ? "healthy"
          : "stale")
        : "disabled",
  };
}

async function listCanonicalStreams() {
  const [rows]: any = await db.execute(sql.raw(`
    SELECT
      id,
      stream_id_dsr as "stream_id",
      stream_name_dsr as "stream_name",
      stream_type_dsr as "stream_type",
      source_url_dsr as "source_url",
      api_url_dsr as "api_url",
      update_freq_dsr as "update_frequency",
      cron_expression_dsr as "cron_expression",
      signal_weight_dsr as "signal_weight",
      confidence_multiplier_dsr as "confidence_multiplier",
      enabled_dsr as "enabled",
      field_mapping_dsr as "field_mapping",
      post_processing_engine_name_dsr as "post_processing_engine_name",
      parser_mode_dsr as "parser_mode",
      records_ingested_dsr as "records_ingested",
      signals_generated_dsr as "signals_generated",
      last_ingested_at_dsr as "lastIngestedAt",
      last_run_status_dsr as "lastRunStatus",
      last_success_at_dsr as "lastSuccessAt",
      last_failure_at_dsr as "lastFailureAt",
      last_error_type_dsr as "last_errorType",
      last_error_message_dsr as "last_errorMessage",
      last_http_status_dsr as "lastHttpStatus",
      failure_count_dsr as "failureCount",
      consecutive_failures_dsr as "consecutive_failures",
      auto_disabled_dsr as "auto_disabled",
      disabled_reason_dsr as "disabledReason"
    FROM data_stream_registry
    ORDER BY stream_name_dsr
  `));

  return (rows as StreamRow[]).map(normalizeStream);
>>>>>>> main
}

/** Get all streams with health stats — includes self-healing columns */
export async function getStreamsWithHealth() {
  return listCanonicalStreams();
}

/** Get stream detail with recent activity */
export async function getStreamDetail(stream_id: string) {
<<<<<<< codex/complete-snake_case-migration-in-runtime-code-dmxds3
  const [stream] = await get_unified_ingestion_metrics({ stream_id });
  if (!stream) return null;
=======
  const escapedStreamId = stream_id.replace(/'/g, "''");
  const [rows]: any = await db.execute(sql.raw(`
    SELECT
      id,
      stream_id_dsr as "stream_id",
      stream_name_dsr as "stream_name",
      stream_type_dsr as "stream_type",
      source_url_dsr as "source_url",
      api_url_dsr as "api_url",
      update_freq_dsr as "update_frequency",
      cron_expression_dsr as "cron_expression",
      signal_weight_dsr as "signal_weight",
      confidence_multiplier_dsr as "confidence_multiplier",
      enabled_dsr as "enabled",
      field_mapping_dsr as "field_mapping",
      post_processing_engine_name_dsr as "post_processing_engine_name",
      parser_mode_dsr as "parser_mode",
      records_ingested_dsr as "records_ingested",
      signals_generated_dsr as "signals_generated",
      last_ingested_at_dsr as "lastIngestedAt",
      last_run_status_dsr as "lastRunStatus",
      last_success_at_dsr as "lastSuccessAt",
      last_failure_at_dsr as "lastFailureAt",
      last_error_type_dsr as "last_errorType",
      last_error_message_dsr as "last_errorMessage",
      last_http_status_dsr as "lastHttpStatus",
      failure_count_dsr as "failureCount",
      consecutive_failures_dsr as "consecutive_failures",
      auto_disabled_dsr as "auto_disabled",
      disabled_reason_dsr as "disabledReason"
    FROM data_stream_registry
    WHERE stream_id_dsr = '${escapedStreamId}'
    LIMIT 1
  `));
>>>>>>> main

  return {
    ...stream,
<<<<<<< codex/complete-snake_case-migration-in-runtime-code-dmxds3
    linked_datasets: [{
      dataset_id: stream.stream_id,
      dataset_name: stream.stream_name,
      source: stream.source_url ?? stream.api_url ?? "unknown",
      enabled: stream.enabled,
      total_records_ingested: stream.records_ingested,
      last_ingested_at: stream.last_ingested_at,
=======
    linkedDatasets: [{
      datasetId: stream.stream_id,
      datasetName: stream.stream_name,
      source: stream.source_url ?? stream.api_url ?? "unknown",
      enabled: stream.enabled,
      totalRecordsIngested: stream.records_ingested ?? 0,
      lastIngestedAt: stream.lastIngestedAt,
>>>>>>> main
    }],
  };
}

/** Create a new stream */
export async function createStream(input: {
  stream_id: string;
  stream_name: string;
  stream_type: string;
  source_url?: string;
  update_frequency?: string;
  signal_weight?: number;
  confidence_multiplier?: number;
  description?: string;
  field_mapping?: Record<string, string>;
}) {
  const stream_id = input.stream_id.replace(/'/g, "''");
  const stream_name = input.stream_name.replace(/'/g, "''");
  const stream_type = input.stream_type.replace(/'/g, "''");
  const source_url = input.source_url ? `'${input.source_url.replace(/'/g, "''")}'` : "NULL";
  const update_frequency = (input.update_frequency ?? "daily").replace(/'/g, "''");
  const signal_weight = input.signal_weight ?? 100;
  const confidence_multiplier = input.confidence_multiplier ?? 100;
  const field_mapping = input.field_mapping ? `'${JSON.stringify(input.field_mapping).replace(/'/g, "''")}'` : "NULL";

  const [rows]: any = await db.execute(sql.raw(`
    INSERT INTO data_stream_registry (
      stream_id_dsr,
      stream_name_dsr,
      stream_type_dsr,
      source_url_dsr,
      update_freq_dsr,
      signal_weight_dsr,
      confidence_multiplier_dsr,
      enabled_dsr,
      field_mapping_dsr,
      records_ingested_dsr,
      signals_generated_dsr
    ) VALUES (
      '${stream_id}',
      '${stream_name}',
      '${stream_type}',
      ${source_url},
      '${update_frequency}',
      ${signal_weight},
      ${confidence_multiplier},
      1,
      ${field_mapping},
      0,
      0
    )
    RETURNING id, stream_id_dsr as "stream_id"
  `));

  const inserted = (rows as any[])[0];
  return { id: inserted?.id, stream_id: inserted?.stream_id ?? input.stream_id };
}

/** Update a stream */
export async function updateStream(stream_id: string, updates: {
  stream_name?: string;
  signal_weight?: number;
  confidence_multiplier?: number;
  enabled?: boolean;
  description?: string;
  source_url?: string;
  update_frequency?: string;
  field_mapping?: Record<string, string>;
}) {
  const setValues: string[] = [];
  if (updates.stream_name !== undefined) setValues.push(`stream_name_dsr = '${updates.stream_name.replace(/'/g, "''")}'`);
  if (updates.signal_weight !== undefined) setValues.push(`signal_weight_dsr = ${updates.signal_weight}`);
  if (updates.confidence_multiplier !== undefined) setValues.push(`confidence_multiplier_dsr = ${updates.confidence_multiplier}`);
  if (updates.enabled !== undefined) setValues.push(`enabled_dsr = ${updates.enabled ? 1 : 0}`);
  if (updates.description !== undefined) setValues.push(`description_dsr = '${updates.description.replace(/'/g, "''")}'`);
  if (updates.source_url !== undefined) setValues.push(`source_url_dsr = '${updates.source_url.replace(/'/g, "''")}'`);
  if (updates.update_frequency !== undefined) setValues.push(`update_freq_dsr = '${updates.update_frequency.replace(/'/g, "''")}'`);
  if (updates.field_mapping !== undefined) setValues.push(`field_mapping_dsr = '${JSON.stringify(updates.field_mapping).replace(/'/g, "''")}'`);

  if (setValues.length === 0) return { success: true, skipped: true };

  const escapedStreamId = stream_id.replace(/'/g, "''");
  await db.execute(sql.raw(`
    UPDATE data_stream_registry
    SET ${setValues.join(", ")}
    WHERE stream_id_dsr = '${escapedStreamId}'
  `));
  return { success: true };
}

/** Delete a stream */
export async function deleteStream(stream_id: string) {
  const escapedStreamId = stream_id.replace(/'/g, "''");
  await db.execute(sql.raw(`DELETE FROM data_stream_registry WHERE stream_id_dsr = '${escapedStreamId}'`));
  return { success: true };
}

/** Get stream statistics */
export async function getStreamStats() {
<<<<<<< codex/complete-snake_case-migration-in-runtime-code-dmxds3
  const summary = await get_unified_ingestion_summary();
  return {
    ...summary,
    by_type: STREAM_TYPES.map((type) => ({
      type: type.id,
      label: type.label,
      count: summary.by_type[type.id] ?? 0,
=======
  const streams = await listCanonicalStreams();
  const totalRecords = streams.reduce((sum, s) => sum + s.records_ingested, 0);
  const totalSignals = streams.reduce((sum, s) => sum + s.signals_generated, 0);

  return {
    totalStreams: streams.length,
    enabledStreams: streams.filter(s => s.enabled).length,
    disabledStreams: streams.filter(s => !s.enabled).length,
    auto_disabledStreams: streams.filter(s => s.auto_disabled).length,
    totalRecordsIngested: totalRecords,
    totalSignalsGenerated: totalSignals,
    totalFailures: streams.reduce((sum, s) => sum + s.failureCount, 0),
    byType: STREAM_TYPES.map(t => ({
      type: t.id,
      label: t.label,
      count: streams.filter(s => s.stream_type === t.id).length,
>>>>>>> main
    })),
  };
}

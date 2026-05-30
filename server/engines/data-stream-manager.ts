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
 * The live Lighthouse database stores data_stream_registry columns with the
 * canonical *_dsr snake_case/suffixed names. Read paths use explicit SQL aliases
 * so Sovereign Control receives the existing UI shape without requiring
 * destructive database changes or frontend rewrites.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

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

type StreamRow = {
  id: number;
  streamId: string;
  streamName: string;
  streamType: string | null;
  sourceUrl: string | null;
  apiUrl: string | null;
  updateFrequency: string | null;
  cronExpression: string | null;
  signalWeight: number | null;
  confidenceMultiplier: number | null;
  enabled: number | boolean | null;
  fieldMapping: string | null;
  postProcessingEngineName: string | null;
  parserMode: string | null;
  recordsIngested: number | null;
  signalsGenerated: number | null;
  lastIngestedAt: string | number | null;
  lastRunStatus: string | null;
  lastSuccessAt: string | number | null;
  lastFailureAt: string | number | null;
  lastErrorType: string | null;
  lastErrorMessage: string | null;
  lastHttpStatus: string | null;
  failureCount: number | null;
  consecutiveFailures: number | null;
  autoDisabled: number | boolean | null;
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
  const autoDisabled = toBool(row.autoDisabled);
  const recordsIngested = toNumber(row.recordsIngested);
  const signalsGenerated = toNumber(row.signalsGenerated);
  const failureCount = toNumber(row.failureCount);
  const consecutiveFailures = toNumber(row.consecutiveFailures);
  const signalWeight = toNumber(row.signalWeight) || 100;
  const confidenceMultiplier = toNumber(row.confidenceMultiplier) || 100;

  return {
    id: row.id,
    streamId: row.streamId,
    streamName: row.streamName,
    streamType: row.streamType ?? "unknown",
    sourceUrl: row.sourceUrl,
    apiUrl: row.apiUrl,
    updateFrequency: row.updateFrequency ?? "manual",
    cronExpression: row.cronExpression,
    signalWeight,
    confidenceMultiplier,
    enabled,
    fieldMapping: row.fieldMapping,
    postProcessingEngineName: row.postProcessingEngineName,
    parserMode: row.parserMode,
    recordsIngested,
    signalsGenerated,
    lastIngestedAt,
    lastRunStatus: row.lastRunStatus,
    lastSuccessAt: toTimestamp(row.lastSuccessAt),
    lastFailureAt: toTimestamp(row.lastFailureAt),
    lastErrorType: row.lastErrorType,
    lastErrorMessage: row.lastErrorMessage,
    lastHttpStatus: row.lastHttpStatus,
    failureCount,
    consecutiveFailures,
    autoDisabled,
    disabledReason: row.disabledReason,
    linkedDatasetCount: 1,
    healthStatus: autoDisabled
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
      stream_id_dsr as "streamId",
      stream_name_dsr as "streamName",
      stream_type_dsr as "streamType",
      source_url_dsr as "sourceUrl",
      api_url_dsr as "apiUrl",
      update_freq_dsr as "updateFrequency",
      cron_expression_dsr as "cronExpression",
      signal_weight_dsr as "signalWeight",
      confidence_multiplier_dsr as "confidenceMultiplier",
      enabled_dsr as "enabled",
      field_mapping_dsr as "fieldMapping",
      post_processing_engine_name_dsr as "postProcessingEngineName",
      parser_mode_dsr as "parserMode",
      records_ingested_dsr as "recordsIngested",
      signals_generated_dsr as "signalsGenerated",
      last_ingested_at_dsr as "lastIngestedAt",
      last_run_status_dsr as "lastRunStatus",
      last_success_at_dsr as "lastSuccessAt",
      last_failure_at_dsr as "lastFailureAt",
      last_error_type_dsr as "lastErrorType",
      last_error_message_dsr as "lastErrorMessage",
      last_http_status_dsr as "lastHttpStatus",
      failure_count_dsr as "failureCount",
      consecutive_failures_dsr as "consecutiveFailures",
      auto_disabled_dsr as "autoDisabled",
      disabled_reason_dsr as "disabledReason"
    FROM data_stream_registry
    ORDER BY stream_name_dsr
  `));

  return (rows as StreamRow[]).map(normalizeStream);
}

/** Get all streams with health stats — includes self-healing columns */
export async function getStreamsWithHealth() {
  return listCanonicalStreams();
}

/** Get stream detail with recent activity */
export async function getStreamDetail(streamId: string) {
  const escapedStreamId = streamId.replace(/'/g, "''");
  const [rows]: any = await db.execute(sql.raw(`
    SELECT
      id,
      stream_id_dsr as "streamId",
      stream_name_dsr as "streamName",
      stream_type_dsr as "streamType",
      source_url_dsr as "sourceUrl",
      api_url_dsr as "apiUrl",
      update_freq_dsr as "updateFrequency",
      cron_expression_dsr as "cronExpression",
      signal_weight_dsr as "signalWeight",
      confidence_multiplier_dsr as "confidenceMultiplier",
      enabled_dsr as "enabled",
      field_mapping_dsr as "fieldMapping",
      post_processing_engine_name_dsr as "postProcessingEngineName",
      parser_mode_dsr as "parserMode",
      records_ingested_dsr as "recordsIngested",
      signals_generated_dsr as "signalsGenerated",
      last_ingested_at_dsr as "lastIngestedAt",
      last_run_status_dsr as "lastRunStatus",
      last_success_at_dsr as "lastSuccessAt",
      last_failure_at_dsr as "lastFailureAt",
      last_error_type_dsr as "lastErrorType",
      last_error_message_dsr as "lastErrorMessage",
      last_http_status_dsr as "lastHttpStatus",
      failure_count_dsr as "failureCount",
      consecutive_failures_dsr as "consecutiveFailures",
      auto_disabled_dsr as "autoDisabled",
      disabled_reason_dsr as "disabledReason"
    FROM data_stream_registry
    WHERE stream_id_dsr = '${escapedStreamId}'
    LIMIT 1
  `));

  if (!(rows as StreamRow[]).length) return null;
  const stream = normalizeStream((rows as StreamRow[])[0]);

  // Stream IS the dataset — no separate linked datasets
  return {
    ...stream,
    linkedDatasets: [{
      datasetId: stream.streamId,
      datasetName: stream.streamName,
      source: stream.sourceUrl ?? stream.apiUrl ?? "unknown",
      enabled: stream.enabled,
      totalRecordsIngested: stream.recordsIngested ?? 0,
      lastIngestedAt: stream.lastIngestedAt,
    }],
  };
}

/** Create a new stream */
export async function createStream(input: {
  streamId: string;
  streamName: string;
  streamType: string;
  sourceUrl?: string;
  updateFrequency?: string;
  signalWeight?: number;
  confidenceMultiplier?: number;
  description?: string;
  fieldMapping?: Record<string, string>;
}) {
  const streamId = input.streamId.replace(/'/g, "''");
  const streamName = input.streamName.replace(/'/g, "''");
  const streamType = input.streamType.replace(/'/g, "''");
  const sourceUrl = input.sourceUrl ? `'${input.sourceUrl.replace(/'/g, "''")}'` : "NULL";
  const updateFrequency = (input.updateFrequency ?? "daily").replace(/'/g, "''");
  const signalWeight = input.signalWeight ?? 100;
  const confidenceMultiplier = input.confidenceMultiplier ?? 100;
  const fieldMapping = input.fieldMapping ? `'${JSON.stringify(input.fieldMapping).replace(/'/g, "''")}'` : "NULL";

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
      '${streamId}',
      '${streamName}',
      '${streamType}',
      ${sourceUrl},
      '${updateFrequency}',
      ${signalWeight},
      ${confidenceMultiplier},
      1,
      ${fieldMapping},
      0,
      0
    )
    RETURNING id, stream_id_dsr as "streamId"
  `));

  const inserted = (rows as any[])[0];
  return { id: inserted?.id, streamId: inserted?.streamId ?? input.streamId };
}

/** Update a stream */
export async function updateStream(streamId: string, updates: {
  streamName?: string;
  signalWeight?: number;
  confidenceMultiplier?: number;
  enabled?: boolean;
  description?: string;
  sourceUrl?: string;
  updateFrequency?: string;
  fieldMapping?: Record<string, string>;
}) {
  const setValues: string[] = [];
  if (updates.streamName !== undefined) setValues.push(`stream_name_dsr = '${updates.streamName.replace(/'/g, "''")}'`);
  if (updates.signalWeight !== undefined) setValues.push(`signal_weight_dsr = ${updates.signalWeight}`);
  if (updates.confidenceMultiplier !== undefined) setValues.push(`confidence_multiplier_dsr = ${updates.confidenceMultiplier}`);
  if (updates.enabled !== undefined) setValues.push(`enabled_dsr = ${updates.enabled ? 1 : 0}`);
  if (updates.description !== undefined) setValues.push(`description_dsr = '${updates.description.replace(/'/g, "''")}'`);
  if (updates.sourceUrl !== undefined) setValues.push(`source_url_dsr = '${updates.sourceUrl.replace(/'/g, "''")}'`);
  if (updates.updateFrequency !== undefined) setValues.push(`update_freq_dsr = '${updates.updateFrequency.replace(/'/g, "''")}'`);
  if (updates.fieldMapping !== undefined) setValues.push(`field_mapping_dsr = '${JSON.stringify(updates.fieldMapping).replace(/'/g, "''")}'`);

  if (setValues.length === 0) return { success: true, skipped: true };

  const escapedStreamId = streamId.replace(/'/g, "''");
  await db.execute(sql.raw(`
    UPDATE data_stream_registry
    SET ${setValues.join(", ")}
    WHERE stream_id_dsr = '${escapedStreamId}'
  `));
  return { success: true };
}

/** Delete a stream */
export async function deleteStream(streamId: string) {
  const escapedStreamId = streamId.replace(/'/g, "''");
  await db.execute(sql.raw(`DELETE FROM data_stream_registry WHERE stream_id_dsr = '${escapedStreamId}'`));
  return { success: true };
}

/** Get stream statistics */
export async function getStreamStats() {
  const streams = await listCanonicalStreams();
  const totalRecords = streams.reduce((sum, s) => sum + s.recordsIngested, 0);
  const totalSignals = streams.reduce((sum, s) => sum + s.signalsGenerated, 0);

  return {
    totalStreams: streams.length,
    enabledStreams: streams.filter(s => s.enabled).length,
    disabledStreams: streams.filter(s => !s.enabled).length,
    autoDisabledStreams: streams.filter(s => s.autoDisabled).length,
    totalRecordsIngested: totalRecords,
    totalSignalsGenerated: totalSignals,
    totalFailures: streams.reduce((sum, s) => sum + s.failureCount, 0),
    byType: STREAM_TYPES.map(t => ({
      type: t.id,
      label: t.label,
      count: streams.filter(s => s.streamType === t.id).length,
    })),
  };
}

import { pool } from "./db";

export interface UnifiedSignal {
  id: string;
  signal_id: string;
  signal_type: string;
  stream_id: string | null;
  stream_name: string | null;
  jurisdiction: string | null;
  severity_level: string;
  title: string;
  explanation: string | null;
  confidence_score: number;
  detected_at: number | null;
  status: string;
  active: boolean;
  escalation_tier: string | null;
  entity_id: string | null;
  affected_entities: unknown;
  source_table: string;
  source_id: string;
}

export interface UnifiedStreamMetric {
  id: number | null;
  stream_id: string;
  stream_name: string;
  stream_type: string;
  source: string | null;
  source_url: string | null;
  api_url: string | null;
  update_frequency: string;
  cron_expression: string | null;
  signal_weight: number;
  confidence_multiplier: number;
  enabled: boolean;
  description: string | null;
  jurisdiction: string | null;
  domain: string | null;
  field_mapping: unknown;
  post_processing_engine_name: string | null;
  parser_mode: string | null;
  records_ingested: number;
  signals_generated: number;
  last_ingested_at: number | null;
  last_run_status: string | null;
  last_success_at: number | null;
  last_failure_at: number | null;
  last_error_type: string | null;
  last_error_message: string | null;
  last_http_status: string | null;
  failure_count: number;
  consecutive_failures: number;
  auto_disabled: boolean;
  disabled_reason: string | null;
  health_status: "healthy" | "stale" | "disabled" | "auto_disabled";
  linked_dataset_count: number;
  created_at: number | null;
  updated_at: number | null;
}

export interface UnifiedSignalsInput {
  stream_id?: string;
  status?: string;
  severity?: string;
  limit?: number;
  offset?: number;
}

const DEFAULT_LIMIT = 100;

function rows_from_result<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    if (Array.isArray(result[0])) return result[0] as T[];
    return result as T[];
  }
  const maybe_rows = (result as { rows?: T[] })?.rows;
  return Array.isArray(maybe_rows) ? maybe_rows : [];
}

function to_number(value: unknown, fallback = 0): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function to_bool(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

function to_timestamp(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function parse_json(value: unknown): unknown {
  if (typeof value !== "string") return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalize_signal(row: Record<string, unknown>): UnifiedSignal {
  const signal_id = String(row.signal_id ?? row.id ?? row.source_id ?? `signal-${Date.now()}`);
  const signal_type = String(row.signal_type ?? row.signalType ?? row.type ?? "unknown");
  const stream_id = row.stream_id ?? row.dataset_id ?? row.datasetId ?? null;
  const status = String(row.signal_status ?? row.verification_status ?? row.status ?? (row.active === false ? "inactive" : "active"));
  const active = !["inactive", "dismissed", "rejected", "resolved", "archived"].includes(status.toLowerCase());
  const explanation = row.plain_language_explanation ?? row.explanation ?? row.description ?? row.signal_description ?? null;
  const detected_at = to_timestamp(row.extraction_timestamp ?? row.detected_at ?? row.detectedAt ?? row.created_at ?? row.createdAt);

  return {
    id: signal_id,
    signal_id,
    signal_type,
    stream_id: stream_id === null || stream_id === undefined ? null : String(stream_id),
    stream_name: row.stream_name === null || row.stream_name === undefined ? null : String(row.stream_name),
    jurisdiction: row.jurisdiction_scope === null || row.jurisdiction_scope === undefined
      ? (row.jurisdiction === null || row.jurisdiction === undefined ? null : String(row.jurisdiction))
      : String(row.jurisdiction_scope),
    severity_level: String(row.severity_level ?? row.severity ?? "medium"),
    title: String(row.title ?? row.signal_title ?? signal_type),
    explanation: explanation === null || explanation === undefined ? null : String(explanation),
    confidence_score: to_number(row.confidence_score ?? row.confidenceScore, 0),
    detected_at,
    status,
    active,
    escalation_tier: row.escalation_tier === null || row.escalation_tier === undefined
      ? (row.escalation_status === null || row.escalation_status === undefined ? null : String(row.escalation_status))
      : String(row.escalation_tier),
    entity_id: row.entity_id === null || row.entity_id === undefined ? null : String(row.entity_id),
    affected_entities: parse_json(row.affected_entities),
    source_table: "detected_signals",
    source_id: String(row.id ?? signal_id),
  };
}

function normalize_stream(row: Record<string, unknown>): UnifiedStreamMetric {
  const enabled = to_bool(row.enabled);
  const auto_disabled = to_bool(row.auto_disabled);
  const last_ingested_at = to_timestamp(row.last_ingested_at);
  const records_ingested = to_number(row.records_ingested, 0);
  const signals_generated = to_number(row.signals_generated, 0);
  const failure_count = to_number(row.failure_count, 0);
  const consecutive_failures = to_number(row.consecutive_failures, 0);
  const health_status = auto_disabled
    ? "auto_disabled"
    : !enabled
      ? "disabled"
      : last_ingested_at && Date.now() - last_ingested_at < 7 * 24 * 60 * 60 * 1000
        ? "healthy"
        : "stale";

  return {
    id: row.id === null || row.id === undefined ? null : to_number(row.id, 0),
    stream_id: String(row.stream_id ?? ""),
    stream_name: String(row.stream_name ?? row.stream_id ?? "Unnamed stream"),
    stream_type: String(row.stream_type ?? "unknown"),
    source: row.source === null || row.source === undefined ? null : String(row.source),
    source_url: row.source_url === null || row.source_url === undefined ? null : String(row.source_url),
    api_url: row.api_url === null || row.api_url === undefined ? null : String(row.api_url),
    update_frequency: String(row.update_frequency ?? "manual"),
    cron_expression: row.cron_expression === null || row.cron_expression === undefined ? null : String(row.cron_expression),
    signal_weight: to_number(row.signal_weight, 100),
    confidence_multiplier: to_number(row.confidence_multiplier, 100),
    enabled,
    description: row.description === null || row.description === undefined ? null : String(row.description),
    jurisdiction: row.jurisdiction === null || row.jurisdiction === undefined ? null : String(row.jurisdiction),
    domain: row.domain === null || row.domain === undefined ? null : String(row.domain),
    field_mapping: parse_json(row.field_mapping),
    post_processing_engine_name: row.post_processing_engine_name === null || row.post_processing_engine_name === undefined ? null : String(row.post_processing_engine_name),
    parser_mode: row.parser_mode === null || row.parser_mode === undefined ? null : String(row.parser_mode),
    records_ingested,
    signals_generated,
    last_ingested_at,
    last_run_status: row.last_run_status === null || row.last_run_status === undefined ? null : String(row.last_run_status),
    last_success_at: to_timestamp(row.last_success_at),
    last_failure_at: to_timestamp(row.last_failure_at),
    last_error_type: row.last_error_type === null || row.last_error_type === undefined ? null : String(row.last_error_type),
    last_error_message: row.last_error_message === null || row.last_error_message === undefined ? null : String(row.last_error_message),
    last_http_status: row.last_http_status === null || row.last_http_status === undefined ? null : String(row.last_http_status),
    failure_count,
    consecutive_failures,
    auto_disabled,
    disabled_reason: row.disabled_reason === null || row.disabled_reason === undefined ? null : String(row.disabled_reason),
    health_status,
    linked_dataset_count: 1,
    created_at: to_timestamp(row.created_at),
    updated_at: to_timestamp(row.updated_at),
  };
}

export async function get_unified_ingestion_metrics(input: { stream_id?: string } = {}): Promise<UnifiedStreamMetric[]> {
  const params: unknown[] = [];
  const where = input.stream_id ? "WHERE stream_id_dsr = $1" : "";
  if (input.stream_id) params.push(input.stream_id);

  const result = await pool.query(
    `SELECT
      id,
      stream_id_dsr AS stream_id,
      stream_name_dsr AS stream_name,
      stream_type_dsr AS stream_type,
      source_dsr AS source,
      source_url_dsr AS source_url,
      api_url_dsr AS api_url,
      update_freq_dsr AS update_frequency,
      cron_expression_dsr AS cron_expression,
      signal_weight_dsr AS signal_weight,
      confidence_multiplier_dsr AS confidence_multiplier,
      enabled_dsr AS enabled,
      description_dsr AS description,
      jurisdiction_dsr AS jurisdiction,
      domain_dsr AS domain,
      field_mapping_dsr AS field_mapping,
      post_processing_engine_name_dsr AS post_processing_engine_name,
      parser_mode_dsr AS parser_mode,
      records_ingested_dsr AS records_ingested,
      signals_generated_dsr AS signals_generated,
      last_ingested_at_dsr AS last_ingested_at,
      last_run_status_dsr AS last_run_status,
      last_success_at_dsr AS last_success_at,
      last_failure_at_dsr AS last_failure_at,
      last_error_type_dsr AS last_error_type,
      last_error_message_dsr AS last_error_message,
      last_http_status_dsr AS last_http_status,
      failure_count_dsr AS failure_count,
      consecutive_failures_dsr AS consecutive_failures,
      auto_disabled_dsr AS auto_disabled,
      disabled_reason_dsr AS disabled_reason,
      created_at_dsr AS created_at,
      updated_at_dsr AS updated_at
    FROM data_stream_registry
    ${where}
    ORDER BY stream_name_dsr ASC`,
    params,
  );

  return rows_from_result<Record<string, unknown>>(result).map(normalize_stream);
}

export async function get_unified_ingestion_summary() {
  const streams = await get_unified_ingestion_metrics();
  const by_type: Record<string, number> = {};
  const by_domain: Record<string, number> = {};

  for (const stream of streams) {
    by_type[stream.stream_type] = (by_type[stream.stream_type] ?? 0) + 1;
    const domain = stream.domain ?? "unknown";
    by_domain[domain] = (by_domain[domain] ?? 0) + 1;
  }

  return {
    total_streams: streams.length,
    enabled_streams: streams.filter((stream) => stream.enabled).length,
    disabled_streams: streams.filter((stream) => !stream.enabled).length,
    auto_disabled_streams: streams.filter((stream) => stream.auto_disabled).length,
    total_records_ingested: streams.reduce((sum, stream) => sum + stream.records_ingested, 0),
    total_signals_generated: streams.reduce((sum, stream) => sum + stream.signals_generated, 0),
    total_failures: streams.reduce((sum, stream) => sum + stream.failure_count, 0),
    by_type,
    by_domain,
    generated_at: Date.now(),
  };
}

export async function get_unified_signals(input: UnifiedSignalsInput = {}): Promise<UnifiedSignal[]> {
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), 1000);
  const offset = Math.max(input.offset ?? 0, 0);
  const result = await pool.query(`SELECT * FROM detected_signals LIMIT $1 OFFSET $2`, [Math.max(limit * 5, limit), offset]);
  let signals = rows_from_result<Record<string, unknown>>(result).map(normalize_signal);

  if (input.stream_id) signals = signals.filter((signal) => signal.stream_id === input.stream_id);
  if (input.status) signals = signals.filter((signal) => signal.status === input.status);
  if (input.severity) signals = signals.filter((signal) => signal.severity_level === input.severity);

  signals.sort((left, right) => (right.detected_at ?? 0) - (left.detected_at ?? 0));
  return signals.slice(0, limit);
}

export async function get_unified_signal_summary(input: Omit<UnifiedSignalsInput, "limit" | "offset"> = {}) {
  const signals = await get_unified_signals({ ...input, limit: 1000, offset: 0 });
  const by_status: Record<string, number> = {};
  const by_severity: Record<string, number> = {};
  const by_stream: Record<string, number> = {};

  for (const signal of signals) {
    by_status[signal.status] = (by_status[signal.status] ?? 0) + 1;
    by_severity[signal.severity_level] = (by_severity[signal.severity_level] ?? 0) + 1;
    const stream_id = signal.stream_id ?? "unknown";
    by_stream[stream_id] = (by_stream[stream_id] ?? 0) + 1;
  }

  return {
    total_signals: signals.length,
    total_active: signals.filter((signal) => signal.active).length,
    active_signals: signals.filter((signal) => signal.active).length,
    pending_signals: signals.filter((signal) => signal.status === "pending").length,
    approved_signals: signals.filter((signal) => signal.status === "approved").length,
    rejected_signals: signals.filter((signal) => signal.status === "rejected").length,
    by_status,
    by_severity,
    by_stream,
    generated_at: Date.now(),
  };
}

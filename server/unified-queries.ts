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
const RETIRED_STREAM_STATUS = "retired_superseded_by_atlas";

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

async function get_detected_signal_columns(): Promise<Set<string>> {
  const result = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'detected_signals'`,
  );
  return new Set(rows_from_result<{ column_name: string }>(result).map((row) => row.column_name));
}

function first_existing_column(columns: Set<string>, candidates: string[]): string | null {
  return candidates.find((candidate) => columns.has(candidate)) ?? null;
}

async function query_unified_signal_rows(input: UnifiedSignalsInput = {}, include_paging = true): Promise<Record<string, unknown>[]> {
  const columns = await get_detected_signal_columns();
  const where: string[] = [];
  const params: unknown[] = [];

  const add_filter = (value: string | undefined, candidates: string[]) => {
    if (!value) return true;
    const column = first_existing_column(columns, candidates);
    if (!column) return false;
    params.push(value);
    where.push(`${column} = $${params.length}`);
    return true;
  };

  if (!add_filter(input.stream_id, ["stream_id", "dataset_id"])) return [];
  if (!add_filter(input.severity, ["severity_level", "severity"])) return [];
  if (!add_filter(input.status, ["status", "signal_status", "verification_status"])) return [];

  const order_column = first_existing_column(columns, ["extraction_timestamp", "detected_at", "created_at", "updated_at"]);
  const where_sql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const order_sql = order_column ? `ORDER BY ${order_column} DESC` : "";
  let paging_sql = "";

  if (include_paging) {
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), 1000);
    const offset = Math.max(input.offset ?? 0, 0);
    params.push(limit);
    const limit_param = params.length;
    params.push(offset);
    paging_sql = `LIMIT $${limit_param} OFFSET $${params.length}`;
  }

  const result = await pool.query(
    `SELECT * FROM detected_signals ${where_sql} ${order_sql} ${paging_sql}`,
    params,
  );
  return rows_from_result<Record<string, unknown>>(result);
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
  const params: unknown[] = [RETIRED_STREAM_STATUS];
  const stream_filter = input.stream_id
    ? `AND stream_id_dsr = $${params.push(input.stream_id)}`
    : "";

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
    WHERE COALESCE(last_run_status_dsr, '') <> $1
    ${stream_filter}
    ORDER BY stream_name_dsr ASC`,
    params,
  );

  return rows_from_result<Record<string, unknown>>(result).map(normalize_stream);
}

async function get_current_domain3_signal_count(): Promise<number> {
  try {
    const result = await pool.query(`SELECT count(*)::text AS cnt FROM public.live_data_signals WHERE is_current`);
    return to_number(rows_from_result<{ cnt: string }>(result)[0]?.cnt, 0);
  } catch {
    return 0;
  }
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

  const legacy_stream_signal_counter_sum = streams.reduce((sum, stream) => sum + stream.signals_generated, 0);
  const canonical_live_data_signals = await get_current_domain3_signal_count();

  return {
    total_streams: streams.length,
    enabled_streams: streams.filter((stream) => stream.enabled).length,
    disabled_streams: streams.filter((stream) => !stream.enabled).length,
    auto_disabled_streams: streams.filter((stream) => stream.auto_disabled).length,
    total_records_ingested: streams.reduce((sum, stream) => sum + stream.records_ingested, 0),
    total_signals_generated: canonical_live_data_signals,
    canonical_live_data_signals,
    legacy_stream_signal_counter_sum,
    signal_counter_semantics: "total_signals_generated is the current canonical Domain 3 output count; legacy per-stream signal counters are retained separately because some Atlas bridge counters mirror records/events rather than qualified signals",
    total_failures: streams.reduce((sum, stream) => sum + stream.failure_count, 0),
    by_type,
    by_domain,
    generated_at: Date.now(),
  };
}

export async function get_unified_signals(input: UnifiedSignalsInput = {}): Promise<UnifiedSignal[]> {
  return (await query_unified_signal_rows(input, true)).map(normalize_signal);
}

async function get_lighthouse_data_visibility(): Promise<unknown> {
  try {
    const result = await pool.query(`SELECT public.fetch_lighthouse_data_visibility_v1() AS visibility`);
    return rows_from_result<{ visibility: unknown }>(result)[0]?.visibility ?? null;
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function get_legacy_filtered_signal_summary(input: Omit<UnifiedSignalsInput, "limit" | "offset">) {
  const signals = (await query_unified_signal_rows(input, false)).map(normalize_signal);
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
    summary_contract: "legacy_detected_signals_filtered",
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

export async function get_unified_signal_summary(input: Omit<UnifiedSignalsInput, "limit" | "offset"> = {}) {
  if (input.stream_id || input.status || input.severity) {
    return get_legacy_filtered_signal_summary(input);
  }

  const [counts_result, severity_result, stream_result, data_visibility] = await Promise.all([
    pool.query(`SELECT
      (SELECT count(*) FROM public.intake_signals WHERE is_current)::text AS domain1_current,
      (SELECT count(*) FROM public.intake_signals WHERE NOT is_current)::text AS domain1_history,
      (SELECT count(*) FROM public.legal_patterns WHERE is_current)::text AS domain2_current,
      (SELECT count(*) FROM public.legal_patterns WHERE NOT is_current)::text AS domain2_history,
      (SELECT count(*) FROM public.live_data_signals WHERE is_current)::text AS domain3_current,
      (SELECT count(*) FROM public.live_data_signals WHERE NOT is_current)::text AS domain3_history,
      (SELECT count(*) FROM public.signal_convergences WHERE is_current)::text AS convergence_current,
      (SELECT count(*) FROM public.signal_convergences WHERE NOT is_current)::text AS convergence_history,
      (SELECT count(*) FROM public.detected_signals)::text AS legacy_detected_rows`),
    pool.query(`SELECT coalesce(severity, 'unknown') AS severity, count(*)::text AS cnt
      FROM public.live_data_signals WHERE is_current GROUP BY coalesce(severity, 'unknown') ORDER BY severity`),
    pool.query(`SELECT coalesce(primary_stream_id, 'unknown') AS stream_id, count(*)::text AS cnt
      FROM public.live_data_signals WHERE is_current GROUP BY coalesce(primary_stream_id, 'unknown') ORDER BY cnt DESC, stream_id`),
    get_lighthouse_data_visibility(),
  ]);

  const counts = rows_from_result<Record<string, unknown>>(counts_result)[0] ?? {};
  const domain1_current = to_number(counts.domain1_current, 0);
  const domain2_current = to_number(counts.domain2_current, 0);
  const domain3_current = to_number(counts.domain3_current, 0);
  const canonical_source_domain_outputs = domain1_current + domain2_current + domain3_current;
  const by_severity: Record<string, number> = {};
  const by_stream: Record<string, number> = {};

  for (const row of rows_from_result<{ severity: string; cnt: string }>(severity_result)) {
    by_severity[row.severity] = to_number(row.cnt, 0);
  }
  for (const row of rows_from_result<{ stream_id: string; cnt: string }>(stream_result)) {
    by_stream[row.stream_id] = to_number(row.cnt, 0);
  }

  return {
    summary_contract: "canonical_three_domain_signals_v1",
    total_signals: canonical_source_domain_outputs,
    total_active: canonical_source_domain_outputs,
    active_signals: canonical_source_domain_outputs,
    pending_signals: 0,
    approved_signals: 0,
    rejected_signals: 0,
    by_status: { canonical_current: canonical_source_domain_outputs },
    by_severity,
    by_stream,
    by_domain: {
      case_intake_signals: domain1_current,
      legal_patterns: domain2_current,
      live_data_signals: domain3_current,
    },
    domain1_current,
    domain1_history: to_number(counts.domain1_history, 0),
    domain2_current,
    domain2_history: to_number(counts.domain2_history, 0),
    domain3_current,
    domain3_history: to_number(counts.domain3_history, 0),
    convergence_current: to_number(counts.convergence_current, 0),
    convergence_history: to_number(counts.convergence_history, 0),
    legacy_detected_signal_rows: to_number(counts.legacy_detected_rows, 0),
    legacy_detected_signal_status: "quarantined_not_canonical_signal_total",
    data_visibility,
    generated_at: Date.now(),
  };
}

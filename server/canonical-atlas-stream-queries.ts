import { pool } from "./db";

export type CanonicalAtlasStreamRuntime = {
  id: null;
  stream_id: string;
  stream_name: string;
  stream_type: string;
  source: string;
  source_url: null;
  api_url: null;
  update_frequency: string;
  cron_expression: null;
  signal_weight: number;
  confidence_multiplier: number;
  enabled: boolean;
  description: string;
  jurisdiction: string;
  domain: string;
  field_mapping: Record<string, unknown>;
  post_processing_engine_name: string | null;
  parser_mode: string;
  records_ingested: number;
  signals_generated: number;
  last_ingested_at: number | null;
  last_run_status: string | null;
  last_success_at: number | null;
  last_failure_at: number | null;
  last_error_type: string | null;
  last_error_message: string | null;
  last_http_status: null;
  failure_count: number;
  consecutive_failures: number;
  auto_disabled: boolean;
  disabled_reason: string | null;
  health_status: "healthy" | "stale" | "disabled" | "auto_disabled";
  linked_dataset_count: number;
  created_at: null;
  updated_at: number | null;
  runnable: boolean;
  adapter_name: string | null;
  schedule_priority: string | null;
  interval_hours: number | null;
  identity_bound_observations: number;
  observation_classification_count: number;
  source_snapshot_hash: string;
  source_observed_at: number;
  projection_contract: "atlas_stream_runtime_projection_v1";
};

function millis(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function get_canonical_atlas_stream_metrics(input: { stream_id?: string } = {}): Promise<CanonicalAtlasStreamRuntime[]> {
  const params: unknown[] = [];
  const filters = ["is_current = true"];
  if (input.stream_id) {
    params.push(input.stream_id);
    filters.push(`stream_id = $${params.length}`);
  }

  const result = await pool.query(
    `select *
       from public.atlas_stream_runtime_projection_v1
      where ${filters.join(" and ")}
      order by stream_id`,
    params,
  );

  return result.rows.map((row: any) => {
    const enabled = row.status === "active";
    const lastRunAt = millis(row.last_run_at);
    const lastError = row.last_error ? String(row.last_error) : null;
    const latest = millis(row.latest_ingested_at) ?? millis(row.latest_observed_at);
    const health: CanonicalAtlasStreamRuntime["health_status"] = !enabled
      ? "disabled"
      : lastError && row.last_run_status === "error"
        ? "stale"
        : latest && Date.now() - latest < 7 * 24 * 60 * 60 * 1000
          ? "healthy"
          : "stale";

    return {
      id: null,
      stream_id: String(row.stream_id),
      stream_name: String(row.stream_id),
      stream_type: String(row.module_hint),
      source: String(row.source_id),
      source_url: null,
      api_url: null,
      update_frequency: row.interval_hours ? `every_${row.interval_hours}_hours` : "declared_only",
      cron_expression: null,
      signal_weight: 100,
      confidence_multiplier: 100,
      enabled,
      description: `Atlas canonical stream contract ${row.governance_contract_id ?? "unversioned"}`,
      jurisdiction: String(row.jurisdiction_id),
      domain: String(row.module_hint),
      field_mapping: {
        governance_contract_id: row.governance_contract_id,
        observation_classification_count: number(row.observation_classification_count),
      },
      post_processing_engine_name: row.adapter_name ? "atlas_domain3" : null,
      parser_mode: "atlas_reflected",
      records_ingested: number(row.observation_count),
      signals_generated: 0,
      last_ingested_at: latest,
      last_run_status: row.last_run_status ? String(row.last_run_status) : null,
      last_success_at: row.last_run_status === "ok" ? lastRunAt : null,
      last_failure_at: row.last_run_status === "error" ? lastRunAt : null,
      last_error_type: lastError ? "atlas_runtime_error" : null,
      last_error_message: lastError,
      last_http_status: null,
      failure_count: row.last_run_status === "error" ? 1 : 0,
      consecutive_failures: row.last_run_status === "error" ? 1 : 0,
      auto_disabled: false,
      disabled_reason: enabled ? null : `atlas_stream_${row.status}`,
      health_status: health,
      linked_dataset_count: 1,
      created_at: null,
      updated_at: millis(row.updated_at),
      runnable: Boolean(row.runnable),
      adapter_name: row.adapter_name ? String(row.adapter_name) : null,
      schedule_priority: row.schedule_priority ? String(row.schedule_priority) : null,
      interval_hours: row.interval_hours == null ? null : number(row.interval_hours),
      identity_bound_observations: number(row.identity_bound_observation_count),
      observation_classification_count: number(row.observation_classification_count),
      source_snapshot_hash: String(row.snapshot_hash),
      source_observed_at: millis(row.observed_at) ?? 0,
      projection_contract: "atlas_stream_runtime_projection_v1",
    };
  });
}

export async function get_canonical_atlas_stream_summary() {
  const streams = await get_canonical_atlas_stream_metrics();
  const by_type: Record<string, number> = {};
  const by_domain: Record<string, number> = {};
  for (const stream of streams) {
    by_type[stream.stream_type] = (by_type[stream.stream_type] ?? 0) + 1;
    by_domain[stream.domain] = (by_domain[stream.domain] ?? 0) + 1;
  }
  return {
    total_streams: streams.length,
    enabled_streams: streams.filter(stream => stream.enabled).length,
    disabled_streams: streams.filter(stream => !stream.enabled).length,
    auto_disabled_streams: 0,
    runnable_streams: streams.filter(stream => stream.runnable).length,
    observed_streams: streams.filter(stream => stream.records_ingested > 0).length,
    zero_observation_streams: streams.filter(stream => stream.records_ingested === 0).length,
    total_records_ingested: streams.reduce((sum, stream) => sum + stream.records_ingested, 0),
    total_signals_generated: 0,
    total_failures: streams.reduce((sum, stream) => sum + stream.failure_count, 0),
    by_type,
    by_domain,
    projection_contract: "atlas_stream_runtime_projection_v1",
    generated_at: Date.now(),
  };
}

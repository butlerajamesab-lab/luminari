import { query_with_diagnostics } from "./db-legacy";

export type DiagnosticSignalFilter = { jurisdiction?: string; domain?: string; severity?: string; query?: string };

type DiagnosticSignalRow = {
  record_id: string | null; signal_type: string; title: string; description: string;
  primary_stream_id: string | null; jurisdiction_id: string | null; severity: string | null;
  confidence_score: number | string | null; verification_state: string | null;
  governance_status: string | null; signal_hash: string; detected_at: string | null;
  engine_id: string | null; engine_version: string | null; detection_rule_id: string | null;
  detection_rule_version: string | null; input_hash: string | null; source_freshness_at: string | null;
  supporting_statistics: unknown; dataset_name: string | null; domain: string | null;
  total_count: number | string;
};

// A single source and predicate serve both pages and totals. The legacy mixed
// detected_signals table cannot supply current Domain 3 records.
const current_signals = `with current_signals as (
  select s.live_data_signal_id::text as record_id, s.signal_type, s.title, s.description,
         s.primary_stream_id, s.jurisdiction_id, s.severity, s.confidence_score,
         s.verification_state, s.governance_status, s.signal_hash, s.detected_at::text,
         s.engine_id, s.engine_version, s.detection_rule_id, s.detection_rule_version,
         s.input_hash, s.source_freshness_at::text, s.supporting_statistics,
         d.stream_name_dsr as dataset_name, d.domain_dsr as domain
    from public.live_data_signals s
    left join public.data_stream_registry d on d.stream_id_dsr = s.primary_stream_id
   where s.is_current
), filtered as (
  select * from current_signals
   where ($1::text is null or jurisdiction_id = $1)
     and ($2::text is null or domain = $2)
     and ($3::text is null or severity = $3)
     and ($4::text = '' or strpos(replace(lower(concat_ws(' ', title, description, signal_type, domain)), '_', ' '), $4) > 0)
)`;

function parameters(input: DiagnosticSignalFilter) {
  return [input.jurisdiction || null, input.domain || null, input.severity || null, (input.query ?? "").trim().toLowerCase().replaceAll("_", " ")];
}

function known_count(value: unknown) {
  if (value == null || !Number.isSafeInteger(Number(value)) || Number(value) < 0) {
    throw new Error("Current Domain 3 count is unavailable");
  }
  return Number(value);
}

export async function read_diagnostic_signals(input: DiagnosticSignalFilter & { limit: number; offset: number }) {
  const { rows } = await query_with_diagnostics<DiagnosticSignalRow>(`${current_signals}
    select page.*, totals.total_count
      from (select count(*)::int as total_count from filtered) totals
      left join lateral (
        select * from filtered order by detected_at desc nulls last, record_id
        limit $5 offset $6
      ) page on true
     order by page.detected_at desc nulls last, page.record_id`,
    [...parameters(input), input.limit, input.offset],
    { label: "dual_lens_current_domain3_page", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 5_000 });
  const total = known_count(rows[0]?.total_count);
  const items = rows.filter(row => row.record_id != null).map(({ total_count, ...row }) => ({
    ...row,
    destination_path: `/viewfinder?${new URLSearchParams({ signal_domain: "live_data", signal_id: row.record_id! })}`,
  }));
  return {
    source_relation: "public.live_data_signals" as const,
    items, total, returned: items.length, offset: input.offset, limit: input.limit,
    next_offset: input.offset + items.length < total ? input.offset + input.limit : null,
  };
}

export async function read_diagnostic_signal_summary(input: DiagnosticSignalFilter = {}) {
  const { rows } = await query_with_diagnostics<any>(`${current_signals}
    select (select count(*)::int from filtered) as total_current,
      (select count(*)::int from filtered where governance_status = 'observation_candidate') as observation_candidates,
      (select count(*)::int from filtered where governance_status = 'promoted') as promoted_signals,
      (select max(detected_at) from filtered) as last_detected_at,
      coalesce((select jsonb_object_agg(severity, n) from (
        select coalesce(severity, 'unclassified') as severity, count(*)::int as n
        from filtered group by 1) counts), '{}'::jsonb) as by_severity,
      coalesce((select jsonb_agg(jurisdiction_id order by jurisdiction_id) from (
        select distinct jurisdiction_id from current_signals where jurisdiction_id is not null) options), '[]'::jsonb) as jurisdictions,
      coalesce((select jsonb_agg(domain order by domain) from (
        select distinct domain from current_signals where domain is not null) options), '[]'::jsonb) as domains`,
    parameters(input),
    { label: "dual_lens_current_domain3_summary", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 5_000 });
  const row = rows[0];
  return {
    source_relation: "public.live_data_signals" as const,
    total_current: known_count(row?.total_current),
    observation_candidates: known_count(row?.observation_candidates),
    promoted_signals: known_count(row?.promoted_signals),
    last_detected_at: row.last_detected_at,
    by_severity: row.by_severity as Record<string, number>,
    jurisdictions: row.jurisdictions as string[], domains: row.domains as string[],
  };
}

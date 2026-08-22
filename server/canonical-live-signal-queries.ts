import { pool } from "./db";

export type CanonicalLiveSignal = {
  id: string;
  signal_id: string;
  signal_type: string;
  stream_id: string;
  stream_name: string | null;
  jurisdiction: string;
  severity_level: string;
  title: string;
  explanation: string;
  confidence_score: number;
  detected_at: number | null;
  status: string;
  active: boolean;
  escalation_tier: null;
  entity_id: string | null;
  affected_entities: string[];
  source_table: "live_data_signals";
  source_id: string;
  verification_state: string;
  detection_rule_id: string;
  detection_rule_version: string;
  engine_id: string;
  engine_version: string;
  signal_hash: string;
  input_hash: string;
  governance_status: string;
  entity_resolution_status: string;
  source_event_refs: unknown;
  supporting_statistics: unknown;
  evidence_refs: unknown;
  source_freshness_at: number | null;
  record_kind: "observation_candidate" | "promoted_signal" | "governed_domain_record";
};

export type CanonicalLiveSignalInput = {
  stream_id?: string;
  severity?: string;
  status?: string;
  limit?: number;
  offset?: number;
};

function to_timestamp(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(row: any): CanonicalLiveSignal {
  const entity_ids = Array.isArray(row.entity_ids) ? row.entity_ids.map(String) : [];
  return {
    id: String(row.live_data_signal_id),
    signal_id: String(row.live_data_signal_id),
    signal_type: String(row.signal_type),
    stream_id: String(row.primary_stream_id),
    stream_name: null,
    jurisdiction: String(row.jurisdiction_id),
    severity_level: String(row.severity),
    title: String(row.title),
    explanation: String(row.description),
    confidence_score: Number(row.confidence_score ?? 0),
    detected_at: to_timestamp(row.detected_at),
    status: String(row.governance_status),
    active: row.is_current === true && row.governance_status !== "rejected",
    escalation_tier: null,
    entity_id: entity_ids[0] ?? null,
    affected_entities: entity_ids,
    source_table: "live_data_signals",
    source_id: String(row.live_data_signal_id),
    verification_state: String(row.verification_state),
    detection_rule_id: String(row.detection_rule_id),
    detection_rule_version: String(row.detection_rule_version),
    engine_id: String(row.engine_id),
    engine_version: String(row.engine_version),
    signal_hash: String(row.signal_hash),
    input_hash: String(row.input_hash),
    governance_status: String(row.governance_status),
    entity_resolution_status: String(row.entity_resolution_status),
    source_event_refs: row.source_event_refs,
    supporting_statistics: row.supporting_statistics,
    evidence_refs: row.evidence_refs,
    source_freshness_at: to_timestamp(row.source_freshness_at),
    record_kind: row.governance_status === "observation_candidate"
      ? "observation_candidate"
      : row.governance_status === "promoted"
        ? "promoted_signal"
        : "governed_domain_record",
  };
}

async function query_rows(input: CanonicalLiveSignalInput = {}, page = true) {
  const where = ["is_current = true", "governance_status <> 'rejected'"];
  const params: unknown[] = [];
  const add = (column: string, value?: string) => {
    if (!value) return;
    params.push(value);
    where.push(`${column} = $${params.length}`);
  };
  add("primary_stream_id", input.stream_id);
  add("severity", input.severity);
  add("governance_status", input.status);

  let paging = "";
  if (page) {
    const limit = Math.min(Math.max(input.limit ?? 100, 1), 1000);
    const offset = Math.max(input.offset ?? 0, 0);
    params.push(limit);
    const limitParam = params.length;
    params.push(offset);
    paging = `limit $${limitParam} offset $${params.length}`;
  }

  const result = await pool.query(
    `select
       live_data_signal_id,
       signal_type,
       title,
       description,
       primary_stream_id,
       source_event_refs,
       entity_ids,
       entity_resolution_status,
       jurisdiction_id,
       severity,
       confidence_score,
       verification_state,
       supporting_statistics,
       evidence_refs,
       detection_rule_id,
       detection_rule_version,
       engine_id,
       engine_version,
       input_hash,
       signal_hash,
       source_freshness_at,
       detected_at,
       governance_status,
       is_current
     from public.live_data_signals
     where ${where.join(" and ")}
     order by detected_at desc, live_data_signal_id desc
     ${paging}`,
    params,
  );
  return result.rows.map(normalize);
}

export async function get_canonical_live_signals(input: CanonicalLiveSignalInput = {}) {
  return query_rows(input, true);
}

export async function get_canonical_live_signal_summary(input: Omit<CanonicalLiveSignalInput, "limit" | "offset"> = {}) {
  const signals = await query_rows(input, false);
  const by_status: Record<string, number> = {};
  const by_severity: Record<string, number> = {};
  const by_stream: Record<string, number> = {};
  const by_verification_state: Record<string, number> = {};

  for (const signal of signals) {
    by_status[signal.governance_status] = (by_status[signal.governance_status] ?? 0) + 1;
    by_severity[signal.severity_level] = (by_severity[signal.severity_level] ?? 0) + 1;
    by_stream[signal.stream_id] = (by_stream[signal.stream_id] ?? 0) + 1;
    by_verification_state[signal.verification_state] = (by_verification_state[signal.verification_state] ?? 0) + 1;
  }

  const legacy = await pool.query(`
    select
      (select count(*)::int from public.detected_signals) as legacy_detected_signals,
      (select count(*)::int from public.live_signals) as legacy_live_signals
  `);
  const legacyRow = legacy.rows[0] ?? {};

  return {
    total_signals: signals.length,
    total_active: signals.filter(signal => signal.active).length,
    active_signals: signals.filter(signal => signal.active).length,
    pending_signals: signals.filter(signal => signal.governance_status === "observation_candidate").length,
    approved_signals: signals.filter(signal => signal.governance_status === "promoted").length,
    observation_candidate_count: signals.filter(signal => signal.record_kind === "observation_candidate").length,
    promoted_signal_count: signals.filter(signal => signal.record_kind === "promoted_signal").length,
    rejected_signals: 0,
    by_status,
    by_severity,
    by_stream,
    by_verification_state,
    legacy_archived: {
      detected_signals: Number(legacyRow.legacy_detected_signals ?? 0),
      live_signals: Number(legacyRow.legacy_live_signals ?? 0),
      status: "historical_not_current",
    },
    source_relation: "public.live_data_signals",
    contract_version: "signal_architecture_ground_truth_v1",
    generated_at: Date.now(),
  };
}

import { getPool } from "./db";

function to_count(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Reads the governed three-domain signal architecture from its canonical
 * database projections. This is the single runtime implementation shared by
 * the production router and the retained compatibility router.
 */
export async function read_signal_architecture(limit: number) {
  const pool = getPool();
  const { rows } = await pool.query(`
    select coalesce((
             select jsonb_agg(to_jsonb(domain_row) order by domain_order)
               from (
                 select domain_code,
                        domain_label,
                        canonical_relation,
                        source_owner,
                        description,
                        source_boundary,
                        severity_policy,
                        confidence_policy,
                        is_source_domain,
                        total_record_count,
                        current_record_count,
                        latest_record_at,
                        case domain_code
                          when 'case_intake' then 1
                          when 'legal_pattern' then 2
                          when 'live_data' then 3
                          else 4
                        end as domain_order
                   from public.v_signal_architecture_summary
               ) domain_row
           ), '[]'::jsonb) as domains,
           coalesce((
             select to_jsonb(integrity_row)
               from public.v_signal_architecture_integrity integrity_row
              limit 1
           ), '{}'::jsonb) as integrity,
           coalesce((
             select jsonb_agg(to_jsonb(recent_row)
                              order by occurred_at desc nulls last, created_at desc)
               from (
                 select domain_code,
                        record_id,
                        title,
                        description,
                        jurisdiction_id,
                        status,
                        severity,
                        confidence_score,
                        entity_resolution_status,
                        source_reference,
                        occurred_at,
                        created_at
                   from public.v_signal_architecture_recent
                  where domain_code <> 'case_intake'
                  order by occurred_at desc nulls last, created_at desc
                  limit $1
               ) recent_row
           ), '[]'::jsonb) as recent_records
  `, [limit]);

  const snapshot = rows[0] ?? {};
  const domain_rows = Array.isArray(snapshot.domains) ? snapshot.domains : [];
  const integrity = snapshot.integrity ?? {};
  const recent_rows = Array.isArray(snapshot.recent_records)
    ? snapshot.recent_records
    : [];
  const recent_records = recent_rows
    .filter((row: any) => row.domain_code !== "case_intake")
    .map((row: any) => ({
      domain_code: String(row.domain_code),
      record_id: String(row.record_id),
      title: String(row.title ?? "Untitled record"),
      description: String(row.description ?? ""),
      jurisdiction_id:
        row.jurisdiction_id == null ? null : String(row.jurisdiction_id),
      status: String(row.status ?? "unknown"),
      severity: row.severity == null ? null : String(row.severity),
      confidence_score:
        row.confidence_score == null ? null : Number(row.confidence_score),
      entity_resolution_status:
        row.entity_resolution_status == null
          ? null
          : String(row.entity_resolution_status),
      source_reference: row.source_reference == null
        ? null
        : String(row.source_reference),
      occurred_at:
        row.occurred_at == null
          ? null
          : new Date(row.occurred_at).toISOString(),
      created_at:
        row.created_at == null ? null : new Date(row.created_at).toISOString(),
    }));

  return {
    contract_version: "signal_architecture_ground_truth_v1",
    domains: domain_rows.map((row: any) => ({
      domain_code: String(row.domain_code),
      domain_label: String(row.domain_label),
      canonical_relation: String(row.canonical_relation),
      source_owner: String(row.source_owner),
      description: String(row.description),
      source_boundary: String(row.source_boundary),
      severity_policy: String(row.severity_policy),
      confidence_policy: String(row.confidence_policy),
      is_source_domain: Boolean(row.is_source_domain),
      total_record_count: to_count(row.total_record_count),
      current_record_count: to_count(row.current_record_count),
      latest_record_at:
        row.latest_record_at == null
          ? null
          : new Date(row.latest_record_at).toISOString(),
    })),
    integrity: {
      atlas_raw_observation_count: to_count(
        integrity.atlas_raw_observation_count,
      ),
      atlas_unique_observation_count: to_count(
        integrity.atlas_unique_observation_count,
      ),
      atlas_replay_observation_count: to_count(
        integrity.atlas_replay_observation_count,
      ),
      legacy_detected_signals_count: to_count(
        integrity.legacy_detected_signals_count,
      ),
      legacy_live_signals_count: to_count(integrity.legacy_live_signals_count),
      prior_v2_signal_count: to_count(integrity.prior_v2_signal_count),
      intake_signal_count: to_count(integrity.intake_signal_count),
      legal_pattern_count: to_count(integrity.legal_pattern_count),
      live_data_signal_count: to_count(integrity.live_data_signal_count),
      live_data_candidate_count: to_count(integrity.live_data_candidate_count),
      live_data_promoted_count: to_count(integrity.live_data_promoted_count),
      convergence_count: to_count(integrity.convergence_count),
      latest_atlas_observation_at:
        integrity.latest_atlas_observation_at == null
          ? null
          : new Date(integrity.latest_atlas_observation_at).toISOString(),
      legacy_status: String(integrity.legacy_status ?? "unknown"),
      atlas_status: String(integrity.atlas_status ?? "unknown"),
    },
    recent_records,
  };
}

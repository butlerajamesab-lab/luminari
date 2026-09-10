import { query_with_diagnostics } from "./db-legacy";
import {
  RULE_MANIFEST,
  RULE_VERSION,
} from "./engines/intake-spine/layer-10-pattern_registry";

// Read retained pattern history without returning case text, identities, or links.
// A later processing run does not invalidate an earlier observed pattern.
export const INTAKE_PATTERN_CATALOG_SQL = `
  with pattern_records as (
    select distinct s.signal_id, s.source_intake_session_id, s.rule_id,
           s.rule_version, s.breakpoint_type,
           nullif(r->>'pattern_id', '') as pattern_id
      from public.intake_signals s
      cross join lateral jsonb_array_elements(s.source_record_refs) r
     where r->>'type' = 'structural_pattern'
       and s.breakpoint_type <> 'chronology_event'
  ), history as (
    select rule_id, rule_version, breakpoint_type,
           count(distinct signal_id)::int as recorded_versions,
           count(distinct (source_intake_session_id, pattern_id))
             filter (where pattern_id is not null)::int as distinct_occurrence_keys,
           count(distinct signal_id) filter (where pattern_id is null)::int as unresolved_identity_records
      from pattern_records
     group by rule_id, rule_version, breakpoint_type
  )
  select
    (select count(*)::int from public.intake_signals) as retained_records,
    (select count(*)::int from public.intake_signals where breakpoint_type = 'chronology_event') as chronology_observations,
    (select count(distinct (source_intake_session_id, rule_id, pattern_id))
       filter (where pattern_id is not null)::int from pattern_records) as distinct_pattern_occurrences,
    coalesce((select jsonb_agg(to_jsonb(h) order by rule_id, rule_version, breakpoint_type) from history h), '[]'::jsonb) as history
`;

type PatternHistory = {
  rule_id: string;
  rule_version: string;
  breakpoint_type: string;
  recorded_versions: number;
  distinct_occurrence_keys: number;
  unresolved_identity_records: number;
};

export async function read_intake_pattern_catalog() {
  const { rows } = await query_with_diagnostics<{
    retained_records: number;
    chronology_observations: number;
    distinct_pattern_occurrences: number;
    history: PatternHistory[];
  }>(INTAKE_PATTERN_CATALOG_SQL, [], { label: "intake_pattern_catalog" });
  const row = rows[0];
  if (!row) throw new Error("intake_pattern_catalog_snapshot_missing");
  const history = row.history.map((h) => ({
    rule_id: h.rule_id,
    rule_version: h.rule_version,
    breakpoint_type: h.breakpoint_type,
    recorded_versions: Number(h.recorded_versions),
    distinct_occurrence_keys: Number(h.distinct_occurrence_keys),
    unresolved_identity_records: Number(h.unresolved_identity_records),
  }));
  return {
    retained_records: Number(row.retained_records),
    chronology_observations: Number(row.chronology_observations),
    distinct_pattern_occurrences: Number(row.distinct_pattern_occurrences),
    rules: RULE_MANIFEST.rules.map((rule) => ({
      rule_id: rule.rule_id,
      rule_version: RULE_VERSION,
      pattern_type: rule.pattern_type,
      description: rule.description,
      required_sequence: rule.required_sequence,
      time_window_days: rule.time_window_days,
      min_independent_source_artifacts: rule.min_independent_source_artifacts,
      same_entity: rule.same_entity,
    })),
    history,
  };
}

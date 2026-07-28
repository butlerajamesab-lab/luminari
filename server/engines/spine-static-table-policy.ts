import {
  SPINE_CONFIG_TABLES,
  restore_spine_table_data,
  type spine_restore_data_result,
  type spine_table_data,
} from "./spine-postgres";

/**
 * Full Spine carries only public/static civic configuration and knowledge.
 * Case artifacts, user queries, generated strategy/remedy instances,
 * calculations, procedural outputs, and outcome runtime are excluded.
 *
 * The lower-level PostgreSQL helper owns the canonical list; this module gives
 * the policy its constitutional name and guarded restore entrypoint.
 */
export const SPINE_STATIC_CIVIC_TABLES = SPINE_CONFIG_TABLES;

export const SPINE_STATIC_CIVIC_TABLE_SET = new Set<string>(
  SPINE_STATIC_CIVIC_TABLES,
);

export const SPINE_EXCLUDED_RUNTIME_TABLES = [
  "interpreter_claim_matches",
  "investigative_queries",
  "remedy_paths",
  "settlement_calculations",
  "strategy_paths",
  "strategy_success_rates",
  "strategy_deadline_engine",
  "strategy_viability_assessment",
  "sys_strategy_paths",
  "procedural_timelines",
  "procedural_outputs",
  "timeline_edges",
  "timeline_events",
  "outcome_registry",
  "outcome_metrics",
] as const;

export function assert_static_spine_table(tableName: string): string {
  if (!SPINE_STATIC_CIVIC_TABLE_SET.has(tableName)) {
    throw new Error(
      `Table ${tableName} is outside the static civic Spine policy`,
    );
  }
  return tableName;
}

export async function restore_static_spine_table_data(
  data: spine_table_data,
): Promise<spine_restore_data_result> {
  assert_static_spine_table(data.tableName);
  return restore_spine_table_data(data);
}

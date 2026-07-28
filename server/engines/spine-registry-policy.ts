export type spine_registry_restore_policy = {
  identityColumns: string[];
  writableColumns: string[];
};

export const SPINE_REGISTRY_RESTORE_POLICY: Record<
  string,
  spine_registry_restore_policy
> = {
  engine_registry: {
    identityColumns: ["engine_id_er"],
    writableColumns: [
      "engine_id_er", "engine_name_er", "description_er", "category_er",
      "enabled_er", "sort_order_er", "config_json_er", "version_er",
      "created_at_er", "updated_at_er",
    ],
  },
  data_stream_registry: {
    identityColumns: ["stream_id_dsr"],
    writableColumns: [
      "stream_id_dsr", "stream_name_dsr", "stream_type_dsr", "source_url_dsr",
      "update_freq_dsr", "signal_weight_dsr", "confidence_multiplier_dsr",
      "enabled_dsr", "description_dsr", "field_mapping_dsr", "source_dsr",
      "api_url_dsr", "jurisdiction_dsr", "domain_dsr", "cron_expression_dsr",
      "post_processing_engine_name_dsr", "parser_mode_dsr", "created_at_dsr",
      "updated_at_dsr",
    ],
  },
  signal_registry: {
    identityColumns: ["signal_type"],
    writableColumns: [
      "signal_type", "domain", "trigger_patterns", "linked_doctrine",
      "linked_weak_joints", "linked_contradiction_templates", "severity",
      "explanation", "recommended_next_steps", "added_by", "created_at",
      "updated_at", "cluster_id", "route_to_pattern_engine",
      "route_to_strategy_engine", "route_to_procedural_engine",
    ],
  },
  pattern_registry: {
    identityColumns: ["pattern_id", "pattern_name"],
    writableColumns: [
      "pattern_id", "pattern_name", "pattern_description", "pattern_type",
      "signal_type", "trigger_threshold", "confidence_threshold",
      "jurisdiction_scope", "related_laws", "related_agencies", "harm_domains",
      "metadata", "created_at", "updated_at", "jurisdiction",
    ],
  },
};

export function get_spine_registry_policy(
  tableName: string,
): spine_registry_restore_policy {
  const policy = SPINE_REGISTRY_RESTORE_POLICY[tableName];
  if (!policy) {
    throw new Error(`Unsupported registry restore table: ${tableName}`);
  }
  return policy;
}

export function resolve_registry_identity_column(
  tableName: string,
  targetColumns: Iterable<string>,
  rows: Array<Record<string, unknown>>,
): string {
  const policy = get_spine_registry_policy(tableName);
  const available = new Set(targetColumns);

  if (tableName === "pattern_registry" && available.has("pattern_id")) {
    const completePatternIds = rows.every((row) => {
      const value = row?.pattern_id;
      return value !== null && value !== undefined && String(value).trim() !== "";
    });
    if (!completePatternIds) {
      throw new Error(
        "Target pattern_registry requires complete pattern_id values; mutable name fallback is not permitted",
      );
    }
    return "pattern_id";
  }

  for (const candidate of policy.identityColumns) {
    if (!available.has(candidate)) continue;
    const complete = rows.every((row) => {
      const value = row?.[candidate];
      return value !== null && value !== undefined && String(value).trim() !== "";
    });
    if (complete) return candidate;
  }

  throw new Error(
    `No complete canonical identity column is available for ${tableName}; expected one of ${policy.identityColumns.join(", ")}`,
  );
}

export function select_spine_registry_write_row(
  tableName: string,
  targetColumns: Iterable<string>,
  rawRow: Record<string, unknown>,
): Record<string, unknown> {
  const policy = get_spine_registry_policy(tableName);
  const target = new Set(targetColumns);
  return Object.fromEntries(
    Object.entries(rawRow).filter(
      ([column]) => target.has(column) && policy.writableColumns.includes(column),
    ),
  );
}

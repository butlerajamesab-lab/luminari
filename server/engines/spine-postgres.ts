import type { PoolClient } from "pg";
import { getPool, query_with_diagnostics } from "../db";

export const SPINE_CONFIG_TABLES = [
  "engine_registry", "data_stream_registry",
  "signal_registry", "pattern_registry", "pattern_types",
  "pattern_creation_thresholds", "pattern_decay_rules", "pattern_confidence_factors",
  "trend_alert_rules",
  "doctrine_registry", "foia_statutes", "foia_agencies",
  "foia_record_types", "foia_agency_records",
  "interp_signal_templates", "interp_harm_mappings",
  "interp_jurisdiction_guidance", "interp_category_interpretations",
  "interp_status_interpretations", "interp_timeline_expectations",
  "interp_entity_signal_rules", "interp_geographic_signal_rules",
  "interpreter_evidence_guidance", "interpreter_question_flow",
  "jurisdiction_rules", "jurisdiction_hierarchy", "registry_jurisdictions",
  "legal_statutes", "legal_statute_clauses", "legal_case_law",
  "legal_weak_joints", "legal_enforcement_records", "legal_contradictions",
  "regulatory_guidance",
  "knowledge_entries", "knowledge_modules", "knowledge_cross_refs",
  "claim_validation_rules_v2", "remedy_feasibility_rules_v2",
  "remedy_feasibility_full", "remedy_matrix",
  "remedy_templates", "remedy_steps", "settlement_formulas",
  "proof_frameworks", "evidence_profiles", "weak_joint_triggers",
  "strategy_selection_rules", "strategy_registry", "strategy_steps",
  "strategy_claim_catalog", "strategy_forum_rules",
  "node_timeline", "timeline_rules",
  "workflow_definitions", "workflow_steps", "workflow_master", "world_nodes",
  "escalation_thresholds", "escalation_routes",
  "enforcement_viability_rules", "intervention_escalation_rules",
  "intervention_endpoints", "investigation_guidance",
  "registry_programs", "registry_workflows", "registry_signals",
  "registry_oversight_bodies", "registry_contacts",
  "registry_policy_alerts", "registry_source_traceability",
  "institution_registry", "legislator_contacts", "advocacy_organizations",
  "narrative_templates", "lumensend_templates",
  "intake_document_templates", "paperwork_templates",
  "harm_map_nodes", "harm_map_edges", "populations_affected",
  "litigation_registry", "litigation_barriers",
  "unified_resources", "mental_health_resources",
] as const;

export const SPINE_CONFIG_TABLE_SET = new Set<string>(SPINE_CONFIG_TABLES);

export type spine_schema_column = {
  columnName: string;
  typeSql: string;
  notNull: boolean;
  defaultSql: string | null;
  identity: "" | "a" | "d";
  generated: "" | "s";
};

export type spine_schema_constraint = {
  constraintName: string;
  constraintType: "p" | "u" | "c" | "f";
  definition: string;
};

export type spine_schema_index = {
  indexName: string;
  definition: string;
};

export type spine_enum_definition = {
  enumName: string;
  labels: string[];
};

export type spine_table_schema = {
  tableName: string;
  rowCount: number;
  rowCountMode: "estimate";
  columns: spine_schema_column[];
  constraints: spine_schema_constraint[];
  indexes: spine_schema_index[];
  createStatement: string;
  postCreateStatements: string[];
};

export type spine_table_data = {
  tableName: string;
  rowCount: number;
  truncated: boolean;
  rows: Record<string, unknown>[];
};

export type spine_restore_data_result = {
  tableName: string;
  insertedRows: number;
  skipped: boolean;
  reason?: string;
};

export function assert_spine_identifier(value: unknown, label = "identifier"): string {
  const identifier = typeof value === "string" ? value.trim() : "";
  if (!/^[a-z_][a-z0-9_]{0,62}$/i.test(identifier)) {
    throw new Error(`${label} must be one unqualified PostgreSQL identifier`);
  }
  return identifier;
}

export function quote_spine_identifier(value: unknown, label = "identifier"): string {
  const identifier = assert_spine_identifier(value, label);
  return `"${identifier.replace(/"/g, '""')}"`;
}

function assert_safe_sql_fragment(value: unknown, label: string): string {
  const fragment = typeof value === "string" ? value.trim() : "";
  if (!fragment) throw new Error(`${label} is empty`);
  if (/;|--|\/\*|\*\/|\u0000/.test(fragment)) {
    throw new Error(`${label} contains a forbidden SQL delimiter`);
  }
  if (/\b(drop|truncate|insert|update|delete|copy|program|alter\s+system)\b/i.test(fragment)) {
    throw new Error(`${label} contains a forbidden SQL operation`);
  }
  return fragment;
}

function normalize_type_sql(value: unknown): string {
  const typeSql = assert_safe_sql_fragment(value, "column type");
  if (!/^[a-z0-9_ .,"()\[\]]+$/i.test(typeSql)) {
    throw new Error(`Unsupported PostgreSQL type expression: ${typeSql}`);
  }
  return typeSql;
}

function build_column_sql(column: spine_schema_column): string {
  const columnName = quote_spine_identifier(column.columnName, "column name");
  const typeSql = normalize_type_sql(column.typeSql);
  let clause = `${columnName} ${typeSql}`;
  const serialDefault =
    typeof column.defaultSql === "string" &&
    /^nextval\('[^']+'::regclass\)$/i.test(column.defaultSql.trim());

  if (column.identity === "a") {
    clause += " GENERATED ALWAYS AS IDENTITY";
  } else if (column.identity === "d" || serialDefault) {
    clause += " GENERATED BY DEFAULT AS IDENTITY";
  } else if (column.generated === "s") {
    const expression = assert_safe_sql_fragment(column.defaultSql, "generated expression");
    clause += ` GENERATED ALWAYS AS (${expression}) STORED`;
  } else if (column.defaultSql) {
    clause += ` DEFAULT ${assert_safe_sql_fragment(column.defaultSql, "column default")}`;
  }
  if (column.notNull) clause += " NOT NULL";
  return clause;
}

function build_constraint_sql(constraint: spine_schema_constraint): string {
  const name = quote_spine_identifier(constraint.constraintName, "constraint name");
  const definition = assert_safe_sql_fragment(
    constraint.definition,
    `constraint ${constraint.constraintName}`,
  );
  return `CONSTRAINT ${name} ${definition}`;
}

export function build_spine_create_table_statement(schema: spine_table_schema): string {
  const table = quote_spine_identifier(schema.tableName, "table name");
  if (!Array.isArray(schema.columns) || schema.columns.length === 0) {
    throw new Error(`Schema for ${schema.tableName} has no columns`);
  }
  const clauses = [
    ...schema.columns.map(build_column_sql),
    ...schema.constraints
      .filter((constraint) => constraint.constraintType !== "f")
      .map(build_constraint_sql),
  ];
  return `CREATE TABLE public.${table} (\n  ${clauses.join(",\n  ")}\n)`;
}

export function build_spine_post_create_statements(schema: spine_table_schema): string[] {
  const table = quote_spine_identifier(schema.tableName, "table name");
  const foreignKeys = schema.constraints
    .filter((constraint) => constraint.constraintType === "f")
    .map(
      (constraint) =>
        `ALTER TABLE public.${table} ADD ${build_constraint_sql(constraint)}`,
    );
  const indexes = schema.indexes.map((index) => {
    assert_spine_identifier(index.indexName, "index name");
    const definition = assert_safe_sql_fragment(index.definition, `index ${index.indexName}`);
    if (!/^create\s+(unique\s+)?index\s+/i.test(definition)) {
      throw new Error(`Unsupported index definition: ${index.indexName}`);
    }
    return definition;
  });
  return [...foreignKeys, ...indexes];
}

export async function list_spine_public_tables(): Promise<
  Array<{ tableName: string; estimatedRowCount: number }>
> {
  const result = await query_with_diagnostics<{
    table_name: string;
    estimated_row_count: number | string | null;
  }>(
    `select
       c.relname as table_name,
       greatest(coalesce(s.n_live_tup, c.reltuples, 0), 0)::bigint as estimated_row_count
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     left join pg_stat_user_tables s on s.relid = c.oid
     where n.nspname = 'public' and c.relkind in ('r','p')
     order by c.relname`,
    [],
    {
      label: "spine_public_table_inventory",
      pool_acquire_timeout_ms: 3_000,
      query_timeout_ms: 10_000,
    },
  );
  return result.rows.map((row) => ({
    tableName: row.table_name,
    estimatedRowCount: Number(row.estimated_row_count ?? 0),
  }));
}

export async function export_spine_table_schema(
  tableName: string,
  estimatedRowCount = 0,
): Promise<spine_table_schema> {
  const table_name = assert_spine_identifier(tableName, "table name");
  const [columnsResult, constraintsResult, indexesResult] = await Promise.all([
    query_with_diagnostics<{
      column_name: string;
      type_sql: string;
      not_null: boolean;
      default_sql: string | null;
      identity_kind: "" | "a" | "d";
      generated_kind: "" | "s";
    }>(
      `select
         a.attname as column_name,
         format_type(a.atttypid, a.atttypmod) as type_sql,
         a.attnotnull as not_null,
         pg_get_expr(ad.adbin, ad.adrelid, true) as default_sql,
         a.attidentity as identity_kind,
         a.attgenerated as generated_kind
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
       left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
       where n.nspname = 'public'
         and c.relname = $1
         and a.attnum > 0
         and not a.attisdropped
       order by a.attnum`,
      [table_name],
      { label: "spine_export_schema_columns", query_timeout_ms: 5_000 },
    ),
    query_with_diagnostics<{
      constraint_name: string;
      constraint_type: "p" | "u" | "c" | "f";
      definition: string;
    }>(
      `select
         con.conname as constraint_name,
         con.contype as constraint_type,
         pg_get_constraintdef(con.oid, true) as definition
       from pg_constraint con
       join pg_class c on c.oid = con.conrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = $1
         and con.contype in ('p','u','c','f')
       order by con.contype, con.conname`,
      [table_name],
      { label: "spine_export_schema_constraints", query_timeout_ms: 5_000 },
    ),
    query_with_diagnostics<{
      index_name: string;
      definition: string;
    }>(
      `select
         index_class.relname as index_name,
         pg_get_indexdef(i.indexrelid, 0, true) as definition
       from pg_index i
       join pg_class table_class on table_class.oid = i.indrelid
       join pg_namespace n on n.oid = table_class.relnamespace
       join pg_class index_class on index_class.oid = i.indexrelid
       left join pg_constraint con on con.conindid = i.indexrelid
       where n.nspname = 'public'
         and table_class.relname = $1
         and not i.indisprimary
         and con.oid is null
       order by index_class.relname`,
      [table_name],
      { label: "spine_export_schema_indexes", query_timeout_ms: 5_000 },
    ),
  ]);

  if (columnsResult.rows.length === 0) {
    throw new Error(`public.${table_name} does not exist or has no columns`);
  }

  const schema: spine_table_schema = {
    tableName: table_name,
    rowCount: estimatedRowCount,
    rowCountMode: "estimate",
    columns: columnsResult.rows.map((row) => ({
      columnName: row.column_name,
      typeSql: row.type_sql,
      notNull: row.not_null,
      defaultSql: row.default_sql,
      identity: row.identity_kind ?? "",
      generated: row.generated_kind ?? "",
    })),
    constraints: constraintsResult.rows.map((row) => ({
      constraintName: row.constraint_name,
      constraintType: row.constraint_type,
      definition: row.definition,
    })),
    indexes: indexesResult.rows.map((row) => ({
      indexName: row.index_name,
      definition: row.definition,
    })),
    createStatement: "",
    postCreateStatements: [],
  };
  schema.createStatement = build_spine_create_table_statement(schema);
  schema.postCreateStatements = build_spine_post_create_statements(schema);
  return schema;
}

export async function export_spine_table_data(
  tableName: string,
  limit = 100_000,
): Promise<spine_table_data> {
  const table_name = assert_spine_identifier(tableName, "table name");
  const bounded_limit = Math.min(250_000, Math.max(1, Math.floor(limit)));
  const table = quote_spine_identifier(table_name);
  const [countResult, rowsResult] = await Promise.all([
    query_with_diagnostics<{ row_count: string | number }>(
      `select count(*)::text as row_count from public.${table}`,
      [],
      { label: "spine_export_data_count", query_timeout_ms: 15_000 },
    ),
    query_with_diagnostics<Record<string, unknown>>(
      `select * from public.${table} limit ${bounded_limit}`,
      [],
      { label: "spine_export_data_rows", query_timeout_ms: 30_000 },
    ),
  ]);
  const total = Number(countResult.rows[0]?.row_count ?? 0);
  return {
    tableName: table_name,
    rowCount: rowsResult.rows.length,
    truncated: total > rowsResult.rows.length,
    rows: rowsResult.rows,
  };
}

async function load_target_columns(
  client: PoolClient,
  tableName: string,
): Promise<Map<string, { dataType: string; udtName: string }>> {
  const result = await client.query(
    `select column_name, data_type, udt_name
     from information_schema.columns
     where table_schema = 'public' and table_name = $1
     order by ordinal_position`,
    [tableName],
  );
  return new Map(
    result.rows.map((row) => [
      row.column_name,
      { dataType: row.data_type, udtName: row.udt_name },
    ]),
  );
}

function adapt_restore_value(
  value: unknown,
  metadata: { dataType: string; udtName: string },
): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (metadata.dataType === "json" || metadata.dataType === "jsonb") {
    return typeof value === "string" ? value : JSON.stringify(value);
  }
  if (metadata.dataType === "bigint" && typeof value === "number") {
    return String(value);
  }
  return value;
}

export async function create_spine_missing_tables(
  schemas: spine_table_schema[],
  enums: spine_enum_definition[] = [],
): Promise<string[]> {
  const client = await getPool().connect();
  const created: string[] = [];
  try {
    await client.query("begin");

    const existingEnumsResult = await client.query(
      `select t.typname as enum_name
       from pg_type t
       join pg_namespace n on n.oid=t.typnamespace
       where n.nspname='public' and t.typtype='e'`,
    );
    const existingEnums = new Set<string>(
      existingEnumsResult.rows.map((row) => row.enum_name),
    );
    for (const definition of [...enums].sort((a, b) =>
      a.enumName.localeCompare(b.enumName),
    )) {
      const enumName = assert_spine_identifier(definition.enumName, "enum name");
      if (existingEnums.has(enumName)) continue;
      if (!Array.isArray(definition.labels) || definition.labels.length === 0) {
        throw new Error(`Enum ${enumName} has no labels`);
      }
      const labels = definition.labels.map((label) => {
        if (typeof label !== "string" || label.includes("\u0000")) {
          throw new Error(`Enum ${enumName} contains an invalid label`);
        }
        return `'${label.replace(/'/g, "''")}'`;
      });
      await client.query(
        `create type public.${quote_spine_identifier(enumName)} as enum (${labels.join(", ")})`,
      );
      existingEnums.add(enumName);
    }

    const existingResult = await client.query(
      `select table_name from information_schema.tables where table_schema = 'public'`,
    );
    const existing = new Set<string>(existingResult.rows.map((row) => row.table_name));

    for (const schema of [...schemas].sort((a, b) => a.tableName.localeCompare(b.tableName))) {
      const tableName = assert_spine_identifier(schema.tableName, "table name");
      if (existing.has(tableName)) continue;
      await client.query(build_spine_create_table_statement(schema));
      existing.add(tableName);
      created.push(tableName);
    }

    for (const schema of schemas.filter((item) => created.includes(item.tableName))) {
      for (const statement of build_spine_post_create_statements(schema)) {
        await client.query(statement);
      }
    }
    await client.query("commit");
    return created;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function restore_spine_table_data(
  data: spine_table_data,
): Promise<spine_restore_data_result> {
  const tableName = assert_spine_identifier(data.tableName, "table name");
  if (!SPINE_CONFIG_TABLE_SET.has(tableName)) {
    return { tableName, insertedRows: 0, skipped: true, reason: "table_not_allowlisted" };
  }
  if (!Array.isArray(data.rows)) {
    throw new Error(`Data export for ${tableName} does not contain rows`);
  }

  const client = await getPool().connect();
  try {
    await client.query("begin");
    const exists = await client.query(
      `select exists(
         select 1 from information_schema.tables
         where table_schema='public' and table_name=$1
       ) as exists`,
      [tableName],
    );
    if (!exists.rows[0]?.exists) {
      await client.query("rollback");
      return { tableName, insertedRows: 0, skipped: true, reason: "table_missing" };
    }

    const table = quote_spine_identifier(tableName);
    const currentCount = await client.query(
      `select count(*)::bigint as count from public.${table}`,
    );
    if (Number(currentCount.rows[0]?.count ?? 0) > 0) {
      await client.query("rollback");
      return { tableName, insertedRows: 0, skipped: true, reason: "table_not_empty" };
    }

    const columns = await load_target_columns(client, tableName);
    let insertedRows = 0;
    for (const row of data.rows) {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        throw new Error(`Invalid row in ${tableName}`);
      }
      const rowEntries = Object.entries(row).filter(([column]) => columns.has(column));
      if (rowEntries.length === 0) continue;
      for (const [column] of rowEntries) assert_spine_identifier(column, "column name");
      const names = rowEntries.map(([column]) => quote_spine_identifier(column));
      const values = rowEntries.map(([column, value]) =>
        adapt_restore_value(value, columns.get(column)!),
      );
      const placeholders = values.map((_value, index) => `$${index + 1}`);
      const result = await client.query(
        `insert into public.${table} (${names.join(", ")})
         values (${placeholders.join(", ")})
         on conflict do nothing`,
        values,
      );
      insertedRows += result.rowCount ?? 0;
    }

    const serialColumns = await client.query(
      `select column_name, pg_get_serial_sequence('public.' || table_name, column_name) as sequence_name
       from information_schema.columns
       where table_schema='public' and table_name=$1`,
      [tableName],
    );
    for (const row of serialColumns.rows) {
      if (!row.sequence_name) continue;
      const column = quote_spine_identifier(row.column_name, "serial column");
      const maximum = await client.query(
        `select coalesce(max(${column}),0)::bigint as maximum from public.${table}`,
      );
      const value = Number(maximum.rows[0]?.maximum ?? 0);
      if (value > 0) {
        await client.query(`select setval($1::regclass, $2, true)`, [row.sequence_name, value]);
      }
    }

    await client.query("commit");
    return { tableName, insertedRows, skipped: false };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

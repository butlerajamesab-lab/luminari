import { query_with_diagnostics } from "../db";

export type sovereign_table_summary = {
  tableName: string;
  rowCount: number;
  rowCountMode: "estimate";
};

export type sovereign_column_summary = {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  ordinal_position: number;
};

export function assert_sovereign_table_name(value: unknown): string {
  const table_name = typeof value === "string" ? value.trim() : "";
  if (!/^[a-z_][a-z0-9_]{0,62}$/i.test(table_name)) {
    throw new Error("tableName must be one unqualified PostgreSQL identifier");
  }
  return table_name;
}

export async function list_sovereign_tables(): Promise<sovereign_table_summary[]> {
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
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
     order by c.relname`,
    [],
    {
      label: "sovereign_schema_list_tables",
      pool_acquire_timeout_ms: 2_000,
      query_timeout_ms: 5_000,
    },
  );

  return result.rows.map((row) => ({
    tableName: row.table_name,
    rowCount: Number(row.estimated_row_count ?? 0),
    rowCountMode: "estimate" as const,
  }));
}

export async function inspect_sovereign_table(tableName: string) {
  const table_name = assert_sovereign_table_name(tableName);
  const quoted_table = `"${table_name}"`;

  const columns_result = await query_with_diagnostics<sovereign_column_summary>(
    `select
       column_name,
       data_type,
       is_nullable,
       column_default,
       ordinal_position
     from information_schema.columns
     where table_schema = 'public'
       and table_name = $1
     order by ordinal_position`,
    [table_name],
    {
      label: "sovereign_schema_inspect_columns",
      pool_acquire_timeout_ms: 2_000,
      query_timeout_ms: 5_000,
    },
  );

  if (columns_result.rows.length === 0) {
    throw new Error(`public.${table_name} does not exist or has no visible columns`);
  }

  const [count_result, sample_result] = await Promise.all([
    query_with_diagnostics<{ row_count: number | string }>(
      `select count(*)::text as row_count from public.${quoted_table}`,
      [],
      {
        label: "sovereign_schema_inspect_count",
        pool_acquire_timeout_ms: 2_000,
        query_timeout_ms: 10_000,
      },
    ),
    query_with_diagnostics<Record<string, unknown>>(
      `select * from public.${quoted_table} limit 5`,
      [],
      {
        label: "sovereign_schema_inspect_sample",
        pool_acquire_timeout_ms: 2_000,
        query_timeout_ms: 5_000,
      },
    ),
  ]);

  const createStatement = [
    `CREATE TABLE public.${quoted_table} (`,
    ...columns_result.rows.map((column, index) => {
      const default_clause = column.column_default
        ? ` DEFAULT ${column.column_default}`
        : "";
      const null_clause = column.is_nullable === "NO" ? " NOT NULL" : "";
      const comma = index === columns_result.rows.length - 1 ? "" : ",";
      return `  "${column.column_name}" ${column.data_type}${default_clause}${null_clause}${comma}`;
    }),
    ");",
  ].join("\n");

  return {
    tableName: table_name,
    createStatement,
    columns: columns_result.rows,
    rowCount: Number(count_result.rows[0]?.row_count ?? 0),
    sampleRows: sample_result.rows,
  };
}

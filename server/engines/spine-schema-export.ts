import { query_with_diagnostics } from "../db";
import {
  build_spine_create_table_statement,
  build_spine_post_create_statements,
  type spine_schema_column,
  type spine_schema_constraint,
  type spine_schema_index,
  type spine_table_schema,
} from "./spine-postgres";

export async function export_spine_database_schema(): Promise<spine_table_schema[]> {
  const [inventoryResult, columnsResult, constraintsResult, indexesResult] =
    await Promise.all([
      query_with_diagnostics<{
        table_name: string;
        estimated_row_count: string | number | null;
      }>(
        `select
           c.relname as table_name,
           greatest(coalesce(s.n_live_tup, c.reltuples, 0), 0)::bigint as estimated_row_count
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         left join pg_stat_user_tables s on s.relid = c.oid
         where n.nspname='public' and c.relkind in ('r','p')
         order by c.relname`,
        [],
        {
          label: "spine_schema_inventory",
          pool_acquire_timeout_ms: 3_000,
          query_timeout_ms: 15_000,
        },
      ),
      query_with_diagnostics<{
        table_name: string;
        column_name: string;
        type_sql: string;
        not_null: boolean;
        default_sql: string | null;
        identity_kind: "" | "a" | "d";
        generated_kind: "" | "s";
      }>(
        `select
           c.relname as table_name,
           a.attname as column_name,
           format_type(a.atttypid, a.atttypmod) as type_sql,
           a.attnotnull as not_null,
           pg_get_expr(ad.adbin, ad.adrelid, true) as default_sql,
           a.attidentity as identity_kind,
           a.attgenerated as generated_kind
         from pg_attribute a
         join pg_class c on c.oid=a.attrelid
         join pg_namespace n on n.oid=c.relnamespace
         left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum
         where n.nspname='public'
           and c.relkind in ('r','p')
           and a.attnum > 0
           and not a.attisdropped
         order by c.relname, a.attnum`,
        [],
        {
          label: "spine_schema_columns_all",
          pool_acquire_timeout_ms: 3_000,
          query_timeout_ms: 20_000,
        },
      ),
      query_with_diagnostics<{
        table_name: string;
        constraint_name: string;
        constraint_type: "p" | "u" | "c" | "f";
        definition: string;
      }>(
        `select
           c.relname as table_name,
           con.conname as constraint_name,
           con.contype as constraint_type,
           pg_get_constraintdef(con.oid, true) as definition
         from pg_constraint con
         join pg_class c on c.oid=con.conrelid
         join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='public' and con.contype in ('p','u','c','f')
         order by c.relname, con.contype, con.conname`,
        [],
        {
          label: "spine_schema_constraints_all",
          pool_acquire_timeout_ms: 3_000,
          query_timeout_ms: 20_000,
        },
      ),
      query_with_diagnostics<{
        table_name: string;
        index_name: string;
        definition: string;
      }>(
        `select
           table_class.relname as table_name,
           index_class.relname as index_name,
           pg_get_indexdef(i.indexrelid, 0, true) as definition
         from pg_index i
         join pg_class table_class on table_class.oid=i.indrelid
         join pg_namespace n on n.oid=table_class.relnamespace
         join pg_class index_class on index_class.oid=i.indexrelid
         left join pg_constraint con on con.conindid=i.indexrelid
         where n.nspname='public'
           and not i.indisprimary
           and con.oid is null
         order by table_class.relname, index_class.relname`,
        [],
        {
          label: "spine_schema_indexes_all",
          pool_acquire_timeout_ms: 3_000,
          query_timeout_ms: 20_000,
        },
      ),
    ]);

  const columns = new Map<string, spine_schema_column[]>();
  for (const row of columnsResult.rows) {
    const list = columns.get(row.table_name) ?? [];
    list.push({
      columnName: row.column_name,
      typeSql: row.type_sql,
      notNull: row.not_null,
      defaultSql: row.default_sql,
      identity: row.identity_kind ?? "",
      generated: row.generated_kind ?? "",
    });
    columns.set(row.table_name, list);
  }

  const constraints = new Map<string, spine_schema_constraint[]>();
  for (const row of constraintsResult.rows) {
    const list = constraints.get(row.table_name) ?? [];
    list.push({
      constraintName: row.constraint_name,
      constraintType: row.constraint_type,
      definition: row.definition,
    });
    constraints.set(row.table_name, list);
  }

  const indexes = new Map<string, spine_schema_index[]>();
  for (const row of indexesResult.rows) {
    const list = indexes.get(row.table_name) ?? [];
    list.push({ indexName: row.index_name, definition: row.definition });
    indexes.set(row.table_name, list);
  }

  return inventoryResult.rows.map((row) => {
    const schema: spine_table_schema = {
      tableName: row.table_name,
      rowCount: Number(row.estimated_row_count ?? 0),
      rowCountMode: "estimate",
      columns: columns.get(row.table_name) ?? [],
      constraints: constraints.get(row.table_name) ?? [],
      indexes: indexes.get(row.table_name) ?? [],
      createStatement: "",
      postCreateStatements: [],
    };
    schema.createStatement = build_spine_create_table_statement(schema);
    schema.postCreateStatements = build_spine_post_create_statements(schema);
    return schema;
  });
}

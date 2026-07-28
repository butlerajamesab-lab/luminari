import type { PoolClient } from "pg";
import { query_with_diagnostics } from "../db";
import {
  assert_spine_identifier,
  quote_spine_identifier,
  type spine_table_data,
} from "./spine-postgres";

/**
 * Export one table from a single PostgreSQL statement. Reading limit + 1 rows
 * makes truncation a property of the same snapshot as the exported rows. When
 * a client is supplied, the statement belongs to the bundle-wide read-only
 * repeatable-read transaction.
 */
export async function export_spine_table_data_consistent(
  tableName: string,
  limit = 100_000,
  client?: PoolClient,
): Promise<spine_table_data> {
  const table_name = assert_spine_identifier(tableName, "table name");
  const bounded_limit = Math.min(250_000, Math.max(1, Math.floor(limit)));
  const table = quote_spine_identifier(table_name);
  const probe_limit = bounded_limit + 1;
  const text = `select * from public.${table} limit ${probe_limit}`;

  const result = client
    ? await client.query<Record<string, unknown>>(text)
    : await query_with_diagnostics<Record<string, unknown>>(text, [], {
        label: "spine_export_data_consistent_snapshot",
        query_timeout_ms: 30_000,
      });

  const truncated = result.rows.length > bounded_limit;
  const rows = truncated ? result.rows.slice(0, bounded_limit) : result.rows;
  return {
    tableName: table_name,
    rowCount: rows.length,
    truncated,
    rows,
  };
}

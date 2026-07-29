import type { PoolClient } from "pg";
import { types as pgTypes } from "pg";
import { connect_with_pool_timeout } from "../db";
import {
  assert_spine_identifier,
  quote_spine_identifier,
  type spine_table_data,
} from "./spine-postgres";

// PostgreSQL date/time OIDs. Returning their text representation prevents
// node-postgres from converting timezone-less values into local JavaScript
// Date objects and then shifting them during JSON serialization.
const SPINE_TEMPORAL_TYPE_OIDS = new Set([
  1082, // date
  1083, // time without time zone
  1114, // timestamp without time zone
  1184, // timestamp with time zone
  1186, // interval
  1266, // time with time zone
]);

export const SPINE_EXPORT_TYPE_OVERRIDES = {
  getTypeParser(dataTypeId: number, format?: string) {
    const parserFormat = format === "binary" ? "binary" : "text";
    if (parserFormat === "text" && SPINE_TEMPORAL_TYPE_OIDS.has(dataTypeId)) {
      return (value: string) => value;
    }
    return pgTypes.getTypeParser(dataTypeId, parserFormat);
  },
};

/**
 * Export one table from a single PostgreSQL statement. Reading limit + 1 rows
 * makes truncation a property of the same snapshot as the exported rows. When
 * a client is supplied, the statement belongs to the bundle-wide read-only
 * repeatable-read transaction.
 *
 * Temporal values are deliberately read with text parsers. This preserves a
 * PostgreSQL date or timestamp-without-time-zone as the exact calendar/wall-
 * clock value stored in PostgreSQL, independent of the Node process timezone.
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
  const query = {
    text: `select * from public.${table} limit ${probe_limit}`,
    query_timeout: 30_000,
    types: SPINE_EXPORT_TYPE_OVERRIDES,
  };

  const ownedClient = client
    ? null
    : await connect_with_pool_timeout(1_000, "spine_export_data_consistent_snapshot");
  try {
    const result = (await (client ?? ownedClient).query(query as any)) as {
      rows: Record<string, unknown>[];
    };
    const truncated = result.rows.length > bounded_limit;
    const rows = truncated ? result.rows.slice(0, bounded_limit) : result.rows;
    return {
      tableName: table_name,
      rowCount: rows.length,
      truncated,
      rows,
    };
  } finally {
    ownedClient?.release();
  }
}

import type { PoolClient } from "pg";
import {
  assert_spine_identifier,
  quote_spine_identifier,
  type spine_schema_column,
  type spine_table_schema,
} from "./spine-postgres";

export type spine_target_column_contract = {
  columnName: string;
  dataType: string;
  udtName: string;
  nullable: boolean;
  defaultSql: string | null;
  identity: "" | "YES";
  identityGeneration: string | null;
  generated: string;
};

export type spine_target_table_contract = {
  tableName: string;
  exists: boolean;
  columns: Map<string, spine_target_column_contract>;
};

function incomingColumnContract(
  column: spine_schema_column,
): spine_target_column_contract {
  const typeSql = String(column.typeSql ?? "").trim().toLowerCase();
  return {
    columnName: assert_spine_identifier(column.columnName, "column name"),
    dataType: typeSql,
    udtName: typeSql,
    nullable: !column.notNull,
    defaultSql: column.defaultSql ?? null,
    identity: column.identity ? "YES" : "",
    identityGeneration:
      column.identity === "a" ? "ALWAYS" : column.identity === "d" ? "BY DEFAULT" : null,
    generated: column.generated === "s" ? "ALWAYS" : "NEVER",
  };
}

export function build_incoming_spine_table_contracts(
  tables: spine_table_schema[],
): Map<string, spine_target_table_contract> {
  const contracts = new Map<string, spine_target_table_contract>();
  for (const table of tables) {
    const tableName = assert_spine_identifier(table.tableName, "schema table");
    const columns = new Map<string, spine_target_column_contract>();
    for (const column of table.columns ?? []) {
      const contract = incomingColumnContract(column);
      columns.set(contract.columnName, contract);
    }
    contracts.set(tableName, { tableName, exists: false, columns });
  }
  return contracts;
}

export async function load_spine_target_table_contracts(
  client: PoolClient,
  tableNames: string[],
): Promise<Map<string, spine_target_table_contract>> {
  const unique = [...new Set(tableNames.map((name) =>
    assert_spine_identifier(name, "target table"),
  ))];
  if (unique.length === 0) return new Map();

  const result = await client.query<{
    table_name: string;
    column_name: string;
    data_type: string;
    udt_name: string;
    is_nullable: "YES" | "NO";
    column_default: string | null;
    is_identity: "YES" | "NO";
    identity_generation: string | null;
    is_generated: string;
  }>(
    `select table_name, column_name, data_type, udt_name, is_nullable,
            column_default, is_identity, identity_generation, is_generated
       from information_schema.columns
      where table_schema='public' and table_name = any($1::text[])
      order by table_name, ordinal_position`,
    [unique],
  );

  const contracts = new Map<string, spine_target_table_contract>();
  for (const row of result.rows) {
    const contract = contracts.get(row.table_name) ?? {
      tableName: row.table_name,
      exists: true,
      columns: new Map<string, spine_target_column_contract>(),
    };
    contract.columns.set(row.column_name, {
      columnName: row.column_name,
      dataType: row.data_type.toLowerCase(),
      udtName: row.udt_name.toLowerCase(),
      nullable: row.is_nullable === "YES",
      defaultSql: row.column_default,
      identity: row.is_identity === "YES" ? "YES" : "",
      identityGeneration: row.identity_generation,
      generated: row.is_generated,
    });
    contracts.set(row.table_name, contract);
  }
  return contracts;
}

function isNumericValue(value: unknown): boolean {
  return (
    typeof value === "number" && Number.isFinite(value)
  ) || typeof value === "bigint" || (
    typeof value === "string" && /^[-+]?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(value.trim())
  );
}

function parseIntegerValue(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) return null;
    return BigInt(value);
  }
  if (typeof value === "string" && /^[-+]?\d+$/.test(value.trim())) {
    try {
      return BigInt(value.trim());
    } catch {
      return null;
    }
  }
  return null;
}

const POSTGRES_INTEGER_RANGES = {
  smallint: { min: -32768n, max: 32767n },
  integer: { min: -2147483648n, max: 2147483647n },
  bigint: { min: -9223372036854775808n, max: 9223372036854775807n },
} as const;

function validateIntegerValue(
  tableName: string,
  columnName: string,
  value: unknown,
  kind: keyof typeof POSTGRES_INTEGER_RANGES,
): void {
  const parsed = parseIntegerValue(value);
  if (parsed === null) {
    throw new Error(
      `Spine row requires an integral ${kind} value for ${tableName}.${columnName}`,
    );
  }
  const range = POSTGRES_INTEGER_RANGES[kind];
  if (parsed < range.min || parsed > range.max) {
    throw new Error(
      `Spine row value for ${tableName}.${columnName} is outside PostgreSQL ${kind} range`,
    );
  }
}

function isDateValue(value: unknown): boolean {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isUuidValue(value: unknown): boolean {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validateValue(
  tableName: string,
  column: spine_target_column_contract,
  value: unknown,
): void {
  if (value === null || value === undefined) {
    if (!column.nullable) {
      throw new Error(`Spine row writes null to required ${tableName}.${column.columnName}`);
    }
    return;
  }

  if (column.generated && column.generated !== "NEVER") {
    throw new Error(`Spine row cannot write generated column ${tableName}.${column.columnName}`);
  }
  if (column.identityGeneration?.toUpperCase() === "ALWAYS") {
    throw new Error(`Spine row cannot write ALWAYS identity column ${tableName}.${column.columnName}`);
  }

  const type = `${column.dataType} ${column.udtName}`;
  if (/json/.test(type)) {
    try {
      JSON.stringify(value);
    } catch {
      throw new Error(`Spine row has invalid JSON value for ${tableName}.${column.columnName}`);
    }
    return;
  }
  if (/array|^_/.test(type)) {
    if (!Array.isArray(value)) {
      throw new Error(`Spine row requires an array for ${tableName}.${column.columnName}`);
    }
    return;
  }
  if (/bool/.test(type)) {
    if (typeof value !== "boolean") {
      throw new Error(`Spine row requires a boolean for ${tableName}.${column.columnName}`);
    }
    return;
  }
  if (/\b(smallint|int2)\b/.test(type)) {
    validateIntegerValue(tableName, column.columnName, value, "smallint");
    return;
  }
  if (/\b(integer|int4)\b/.test(type)) {
    validateIntegerValue(tableName, column.columnName, value, "integer");
    return;
  }
  if (/\b(bigint|int8)\b/.test(type)) {
    validateIntegerValue(tableName, column.columnName, value, "bigint");
    return;
  }
  if (/numeric|decimal|real|double|float|money/.test(type)) {
    if (!isNumericValue(value)) {
      throw new Error(`Spine row requires a numeric value for ${tableName}.${column.columnName}`);
    }
    return;
  }
  if (/timestamp|date|time/.test(type)) {
    if (!isDateValue(value)) {
      throw new Error(`Spine row requires a date/time value for ${tableName}.${column.columnName}`);
    }
    return;
  }
  if (/uuid/.test(type)) {
    if (!isUuidValue(value)) {
      throw new Error(`Spine row requires a UUID for ${tableName}.${column.columnName}`);
    }
    return;
  }
  if (/bytea/.test(type)) {
    if (!(typeof value === "string" || value instanceof Uint8Array)) {
      throw new Error(`Spine row requires byte content for ${tableName}.${column.columnName}`);
    }
    return;
  }
  if (typeof value === "object") {
    throw new Error(`Spine row has an incompatible object value for ${tableName}.${column.columnName}`);
  }
}

export function validate_spine_row_against_target(
  table: spine_target_table_contract,
  row: Record<string, unknown>,
  options: { requireInsertCompleteness: boolean },
): void {
  const provided = new Set(Object.keys(row));
  for (const [columnName, value] of Object.entries(row)) {
    assert_spine_identifier(columnName, "data column");
    const column = table.columns.get(columnName);
    if (!column) {
      throw new Error(`Data table ${table.tableName} contains unknown column ${columnName}`);
    }
    validateValue(table.tableName, column, value);
  }

  if (!options.requireInsertCompleteness) return;
  for (const column of table.columns.values()) {
    const generated = column.generated && column.generated !== "NEVER";
    const suppliedByDatabase =
      generated ||
      column.identity === "YES" ||
      column.defaultSql !== null ||
      column.nullable;
    if (!suppliedByDatabase && !provided.has(column.columnName)) {
      throw new Error(
        `Spine insert cannot satisfy required target column ${table.tableName}.${column.columnName}`,
      );
    }
  }
}

export async function load_spine_target_identity_counts(
  client: PoolClient,
  tableName: string,
  identityColumn: string,
  identities: string[],
): Promise<Map<string, number>> {
  if (identities.length === 0) return new Map();
  const table = quote_spine_identifier(tableName, "registry table");
  const identity = quote_spine_identifier(identityColumn, "identity column");
  const result = await client.query<{ identity_value: string; match_count: string | number }>(
    `select ${identity}::text as identity_value, count(*) as match_count
       from public.${table}
      where ${identity}::text = any($1::text[])
      group by ${identity}::text`,
    [identities],
  );
  return new Map(
    result.rows.map((row) => [row.identity_value, Number(row.match_count)]),
  );
}

export async function load_spine_target_row_count(
  client: PoolClient,
  tableName: string,
): Promise<number> {
  const table = quote_spine_identifier(tableName, "data table");
  const result = await client.query<{ row_count: string | number }>(
    `select count(*) as row_count from public.${table}`,
  );
  return Number(result.rows[0]?.row_count ?? 0);
}

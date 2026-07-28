import type { PoolClient } from "pg";
import { getPool } from "../db";
import type { spine_bundle_type } from "./spine-bundle-contract";
import {
  SPINE_CONFIG_TABLE_SET,
  assert_spine_identifier,
  build_spine_create_table_statement,
  build_spine_post_create_statements,
  type spine_table_schema,
} from "./spine-postgres";

export type spine_restore_type = "full" | "schema" | "config" | "deployment";
export type spine_registry_identity_resolver = (
  tableName: string,
  targetColumns: Iterable<string>,
  rows: Array<Record<string, unknown>>,
) => string;

const RESTORE_CAPABILITIES: Record<spine_bundle_type, Set<spine_restore_type>> = {
  full: new Set(["full", "schema", "config", "deployment"]),
  deployment: new Set(["deployment", "schema", "config"]),
  schema: new Set(["schema"]),
  config: new Set(["config"]),
};

const SPINE_REGISTRY_TABLE_SET = new Set([
  "engine_registry",
  "data_stream_registry",
  "signal_registry",
  "pattern_registry",
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Validate the requested restore capability and required top-level sections.
 */
export function preflight_spine_restore_request(
  bundle: any,
  requestedRestoreType: spine_restore_type,
): { manifestType: spine_bundle_type; restoreType: spine_restore_type } {
  const manifestType = bundle?._manifest?.bundleType as spine_bundle_type | undefined;
  if (!manifestType || !RESTORE_CAPABILITIES[manifestType]) {
    throw new Error(
      `Spine bundle has an unsupported manifest type: ${String(manifestType ?? "missing")}`,
    );
  }

  if (!RESTORE_CAPABILITIES[manifestType].has(requestedRestoreType)) {
    throw new Error(
      `Spine ${manifestType} bundle cannot execute requested ${requestedRestoreType} restore`,
    );
  }

  const needsSchema = ["full", "schema", "deployment"].includes(
    requestedRestoreType,
  );
  const needsConfig = ["full", "config", "deployment"].includes(
    requestedRestoreType,
  );
  const needsData = requestedRestoreType === "full";

  if (needsSchema && !Array.isArray(bundle?.schema?.tables)) {
    throw new Error(
      `Restore type ${requestedRestoreType} requires a complete schema.tables section`,
    );
  }
  if (needsConfig && !Array.isArray(bundle?.config?.registryTables)) {
    throw new Error(
      `Restore type ${requestedRestoreType} requires a complete config.registryTables section`,
    );
  }
  if (needsData && !Array.isArray(bundle?.data)) {
    throw new Error("Full restore requires a complete data section");
  }

  return { manifestType, restoreType: requestedRestoreType };
}

function validateSchemaSection(bundle: any): Map<string, Set<string>> {
  const schemaColumns = new Map<string, Set<string>>();
  const seenTables = new Set<string>();
  const seenEnums = new Set<string>();

  const enums = Array.isArray(bundle?.schema?.enums) ? bundle.schema.enums : [];
  for (const rawEnum of enums) {
    if (!isPlainRecord(rawEnum)) throw new Error("Invalid Spine enum definition");
    const enumName = assert_spine_identifier(rawEnum.enumName, "enum name");
    if (seenEnums.has(enumName)) throw new Error(`Duplicate Spine enum: ${enumName}`);
    seenEnums.add(enumName);
    if (
      !Array.isArray(rawEnum.labels) ||
      rawEnum.labels.length === 0 ||
      rawEnum.labels.some((label) => typeof label !== "string" || label.length === 0)
    ) {
      throw new Error(`Spine enum ${enumName} has invalid labels`);
    }
  }

  const tables = Array.isArray(bundle?.schema?.tables) ? bundle.schema.tables : [];
  for (const rawTable of tables) {
    if (!isPlainRecord(rawTable)) throw new Error("Invalid Spine table definition");
    const tableName = assert_spine_identifier(rawTable.tableName, "schema table");
    if (seenTables.has(tableName)) throw new Error(`Duplicate Spine table: ${tableName}`);
    seenTables.add(tableName);

    if (!Array.isArray(rawTable.columns) || rawTable.columns.length === 0) {
      throw new Error(`Spine table ${tableName} has no columns`);
    }
    const columns = new Set<string>();
    for (const rawColumn of rawTable.columns) {
      if (!isPlainRecord(rawColumn)) {
        throw new Error(`Spine table ${tableName} has an invalid column`);
      }
      const columnName = assert_spine_identifier(rawColumn.columnName, "column name");
      if (columns.has(columnName)) {
        throw new Error(`Spine table ${tableName} has duplicate column ${columnName}`);
      }
      columns.add(columnName);
    }

    // Rebuild every executable statement now. The restore phase uses the same
    // governed builders, so a malformed table cannot be discovered after a
    // previous table has already been created.
    const table = rawTable as unknown as spine_table_schema;
    build_spine_create_table_statement(table);
    build_spine_post_create_statements(table);
    schemaColumns.set(tableName, columns);
  }
  return schemaColumns;
}

async function loadTargetColumns(
  client: PoolClient,
  tableNames: string[],
): Promise<Map<string, Set<string>>> {
  if (tableNames.length === 0) return new Map();
  const result = await client.query<{
    table_name: string;
    column_name: string;
  }>(
    `select table_name, column_name
       from information_schema.columns
      where table_schema='public' and table_name = any($1::text[])
      order by table_name, ordinal_position`,
    [tableNames],
  );
  const columns = new Map<string, Set<string>>();
  for (const row of result.rows) {
    const list = columns.get(row.table_name) ?? new Set<string>();
    list.add(row.column_name);
    columns.set(row.table_name, list);
  }
  return columns;
}

function resolveEffectiveColumns(
  tableName: string,
  targetColumns: Map<string, Set<string>>,
  schemaColumns: Map<string, Set<string>>,
  schemaWillRun: boolean,
): Set<string> {
  const existing = targetColumns.get(tableName);
  if (existing && existing.size > 0) return existing;
  if (schemaWillRun) {
    const incoming = schemaColumns.get(tableName);
    if (incoming && incoming.size > 0) return incoming;
  }
  throw new Error(
    `Restore target has no table contract for ${tableName}; include it in the requested schema restore or create it first`,
  );
}

/**
 * Validate every schema/config/data entry—including target-dependent registry
 * identity and row-column compatibility—inside a read-only transaction before
 * any target mutation begins.
 */
export async function preflight_spine_restore_contents(
  bundle: any,
  requestedRestoreType: spine_restore_type,
  resolveRegistryIdentity: spine_registry_identity_resolver,
): Promise<void> {
  preflight_spine_restore_request(bundle, requestedRestoreType);
  const schemaWillRun = ["full", "schema", "deployment"].includes(
    requestedRestoreType,
  );
  const configWillRun = ["full", "config", "deployment"].includes(
    requestedRestoreType,
  );
  const dataWillRun = requestedRestoreType === "full";
  const schemaColumns = schemaWillRun
    ? validateSchemaSection(bundle)
    : new Map<string, Set<string>>();

  const registryTables = configWillRun ? bundle.config.registryTables : [];
  const dataTables = dataWillRun ? bundle.data : [];
  const requestedTableNames = new Set<string>();

  for (const rawTable of registryTables) {
    if (!isPlainRecord(rawTable)) throw new Error("Invalid registry table export");
    requestedTableNames.add(
      assert_spine_identifier(rawTable.tableName, "registry table"),
    );
  }
  for (const rawTable of dataTables) {
    if (!isPlainRecord(rawTable)) throw new Error("Invalid data table export");
    requestedTableNames.add(
      assert_spine_identifier(rawTable.tableName, "data table"),
    );
  }

  const client = await getPool().connect();
  try {
    await client.query("begin transaction isolation level repeatable read read only");
    const targetColumns = await loadTargetColumns(
      client,
      [...requestedTableNames],
    );

    if (configWillRun) {
      const seenRegistryTables = new Set<string>();
      for (const rawTable of registryTables) {
        const tableName = assert_spine_identifier(
          rawTable.tableName,
          "registry table",
        );
        if (!SPINE_REGISTRY_TABLE_SET.has(tableName)) {
          throw new Error(`Unsupported registry restore table: ${tableName}`);
        }
        if (seenRegistryTables.has(tableName)) {
          throw new Error(`Duplicate registry table export: ${tableName}`);
        }
        seenRegistryTables.add(tableName);
        if (!Array.isArray(rawTable.rows)) {
          throw new Error(`Registry table ${tableName} has invalid rows`);
        }
        const rows = rawTable.rows as Array<Record<string, unknown>>;
        if (rows.some((row) => !isPlainRecord(row))) {
          throw new Error(`Registry table ${tableName} contains a malformed row`);
        }
        const columns = resolveEffectiveColumns(
          tableName,
          targetColumns,
          schemaColumns,
          schemaWillRun,
        );
        const identityColumn = resolveRegistryIdentity(
          tableName,
          columns,
          rows,
        );
        const identities = new Set<string>();
        for (const row of rows) {
          const identity = String(row[identityColumn] ?? "").trim();
          if (!identity) {
            throw new Error(
              `Registry row in ${tableName} is missing ${identityColumn}`,
            );
          }
          if (identities.has(identity)) {
            throw new Error(
              `Bundle contains duplicate ${tableName}.${identityColumn} identity: ${identity}`,
            );
          }
          identities.add(identity);
        }
      }
    }

    if (dataWillRun) {
      const seenDataTables = new Set<string>();
      for (const rawTable of dataTables) {
        const tableName = assert_spine_identifier(
          rawTable.tableName,
          "data table",
        );
        if (!SPINE_CONFIG_TABLE_SET.has(tableName)) {
          throw new Error(`Data table ${tableName} is outside the Spine allowlist`);
        }
        if (seenDataTables.has(tableName)) {
          throw new Error(`Duplicate data table export: ${tableName}`);
        }
        seenDataTables.add(tableName);
        if (rawTable.truncated === true) {
          throw new Error(`Data table ${tableName} was truncated in the bundle`);
        }
        if (!Array.isArray(rawTable.rows)) {
          throw new Error(`Data table ${tableName} has invalid rows`);
        }
        const columns = resolveEffectiveColumns(
          tableName,
          targetColumns,
          schemaColumns,
          schemaWillRun,
        );
        for (const row of rawTable.rows) {
          if (!isPlainRecord(row) || Object.keys(row).length === 0) {
            throw new Error(`Data table ${tableName} contains a malformed row`);
          }
          for (const columnName of Object.keys(row)) {
            assert_spine_identifier(columnName, "data column");
            if (!columns.has(columnName)) {
              throw new Error(
                `Data table ${tableName} contains unknown column ${columnName}`,
              );
            }
          }
        }
      }
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

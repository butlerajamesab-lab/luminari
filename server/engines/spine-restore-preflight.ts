import { getPool } from "../db";
import type { spine_bundle_type } from "./spine-bundle-contract";
import {
  assert_spine_identifier,
  build_spine_create_table_statement,
  build_spine_post_create_statements,
  type spine_table_schema,
} from "./spine-postgres";
import {
  SPINE_REGISTRY_TABLES,
  SPINE_REGISTRY_TABLE_SET,
  select_spine_registry_write_row,
} from "./spine-registry-policy";
import { SPINE_STATIC_CIVIC_TABLE_SET } from "./spine-static-table-policy";
import {
  build_incoming_spine_table_contracts,
  load_spine_target_identity_counts,
  load_spine_target_row_count,
  load_spine_target_table_contracts,
  validate_spine_row_against_target,
  type spine_target_table_contract,
} from "./spine-target-contract";

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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validateRequiredRegistryInventory(registryTables: unknown[]): void {
  if (registryTables.length === 0) {
    throw new Error("Spine config registryTables inventory is empty");
  }

  const names = new Set<string>();
  for (const rawTable of registryTables) {
    if (!isPlainRecord(rawTable)) {
      throw new Error("Spine config contains an invalid registry table export");
    }
    names.add(assert_spine_identifier(rawTable.tableName, "registry table"));
  }

  const missing = SPINE_REGISTRY_TABLES.filter((tableName) => !names.has(tableName));
  if (missing.length > 0) {
    throw new Error(
      `Spine config is missing required registry tables: ${missing.join(", ")}`,
    );
  }
}

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
  if (needsConfig) {
    validateRequiredRegistryInventory(bundle.config.registryTables);
  }
  if (needsData && !Array.isArray(bundle?.data)) {
    throw new Error("Full restore requires a complete data section");
  }

  return { manifestType, restoreType: requestedRestoreType };
}

function validateSchemaSection(bundle: any): spine_table_schema[] {
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

  const tables = Array.isArray(bundle?.schema?.tables)
    ? (bundle.schema.tables as unknown[])
    : [];
  const validated: spine_table_schema[] = [];
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

    const table = rawTable as unknown as spine_table_schema;
    build_spine_create_table_statement(table);
    build_spine_post_create_statements(table);
    validated.push(table);
  }
  return validated;
}

function resolveEffectiveContract(
  tableName: string,
  targetContracts: Map<string, spine_target_table_contract>,
  incomingContracts: Map<string, spine_target_table_contract>,
  schemaWillRun: boolean,
): spine_target_table_contract {
  const existing = targetContracts.get(tableName);
  if (existing) return existing;
  if (schemaWillRun) {
    const incoming = incomingContracts.get(tableName);
    if (incoming) return incoming;
  }
  throw new Error(
    `Restore target has no table contract for ${tableName}; include it in the requested schema restore or create it first`,
  );
}

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
  const schemaTables = schemaWillRun ? validateSchemaSection(bundle) : [];
  const incomingContracts = build_incoming_spine_table_contracts(schemaTables);

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
    const targetContracts = await load_spine_target_table_contracts(
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

        const contract = resolveEffectiveContract(
          tableName,
          targetContracts,
          incomingContracts,
          schemaWillRun,
        );
        const identityColumn = resolveRegistryIdentity(
          tableName,
          contract.columns.keys(),
          rows,
        );
        const identities = rows.map((row) => String(row[identityColumn] ?? "").trim());
        const uniqueIdentities = new Set<string>();
        for (const identity of identities) {
          if (!identity) {
            throw new Error(
              `Registry row in ${tableName} is missing ${identityColumn}`,
            );
          }
          if (uniqueIdentities.has(identity)) {
            throw new Error(
              `Bundle contains duplicate ${tableName}.${identityColumn} identity: ${identity}`,
            );
          }
          uniqueIdentities.add(identity);
        }

        const targetMatches = contract.exists
          ? await load_spine_target_identity_counts(
              client,
              tableName,
              identityColumn,
              identities,
            )
          : new Map<string, number>();

        for (let index = 0; index < rows.length; index += 1) {
          const identity = identities[index];
          const matchCount = targetMatches.get(identity) ?? 0;
          if (matchCount > 1) {
            throw new Error(
              `Ambiguous ${tableName}.${identityColumn} target matched ${matchCount} rows for ${identity}`,
            );
          }
          const plannedRow = select_spine_registry_write_row(
            tableName,
            contract.columns.keys(),
            rows[index],
          );
          validate_spine_row_against_target(contract, plannedRow, {
            requireInsertCompleteness: matchCount === 0,
          });
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
        if (!SPINE_STATIC_CIVIC_TABLE_SET.has(tableName)) {
          throw new Error(
            `Data table ${tableName} is outside the static civic Spine policy`,
          );
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

        const contract = resolveEffectiveContract(
          tableName,
          targetContracts,
          incomingContracts,
          schemaWillRun,
        );
        const existingRowCount = contract.exists
          ? await load_spine_target_row_count(client, tableName)
          : 0;
        for (const row of rawTable.rows) {
          if (!isPlainRecord(row) || Object.keys(row).length === 0) {
            throw new Error(`Data table ${tableName} contains a malformed row`);
          }
          validate_spine_row_against_target(contract, row, {
            requireInsertCompleteness: existingRowCount === 0,
          });
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

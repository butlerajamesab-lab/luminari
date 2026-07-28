import type { PoolClient } from "pg";
import { getPool } from "../db";
import {
  parse_spine_bundle_json,
  verify_spine_bundle,
} from "./spine-bundle-contract";
import { preflight_spine_restore_contents } from "./spine-restore-preflight";
import {
  SPINE_CONFIG_TABLE_SET,
  assert_spine_identifier,
  create_spine_missing_tables,
  list_spine_public_tables,
  quote_spine_identifier,
  restore_spine_table_data,
  type spine_table_data,
  type spine_table_schema,
} from "./spine-postgres";
import {
  create_restore_spine_run,
  finish_restore_spine_run,
  get_restore_spine_run,
  list_restore_spine_runs,
  set_restore_spine_run_status,
} from "./spine-run-store";

export interface ValidationResult {
  checksumValid: boolean;
  signatureValid: boolean;
  metadataValid: boolean;
  formatValid: boolean;
  databaseValid: boolean;
  executable: boolean;
  schemaCompatible: boolean;
  migrationCompatible: boolean;
  warnings: string[];
}

export interface RestorePreview {
  bundleName: string;
  bundleType: string;
  createdAt: number;
  appVersion: string;
  tableCount: number;
  configCount: number;
  dataTableCount: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  validation: ValidationResult;
}

type registry_restore_policy = {
  identityColumns: string[];
  writableColumns: string[];
};

const REGISTRY_RESTORE_POLICY: Record<string, registry_restore_policy> = {
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
    // Newer schemas govern patterns by pattern_id. The current Lighthouse live
    // schema predates that column, so pattern_name remains a fail-closed fallback
    // only when it is present and unique in both the bundle and target table.
    identityColumns: ["pattern_id", "pattern_name"],
    writableColumns: [
      "pattern_id", "pattern_name", "pattern_description", "pattern_type",
      "signal_type", "trigger_threshold", "confidence_threshold",
      "jurisdiction_scope", "related_laws", "related_agencies", "harm_domains",
      "metadata", "created_at", "updated_at", "jurisdiction",
    ],
  },
};

export function resolve_registry_identity_column(
  tableName: string,
  targetColumns: Iterable<string>,
  rows: Array<Record<string, unknown>>,
): string {
  const policy = REGISTRY_RESTORE_POLICY[tableName];
  if (!policy) throw new Error(`Unsupported registry restore table: ${tableName}`);
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

export function parseBundleJson(jsonStr: string): { bundle: any; checksum: string } {
  const parsed = parse_spine_bundle_json(jsonStr);
  return { bundle: parsed.bundle, checksum: parsed.computed_checksum };
}

export async function validateBundle(bundleJson: string): Promise<RestorePreview> {
  const { bundle, verification } = verify_spine_bundle(bundleJson);
  const manifest = bundle._manifest ?? {};
  const warnings = [...verification.warnings];
  const currentTables = new Set(
    (await list_spine_public_tables()).map((table) => table.tableName),
  );
  const bundleTables = Array.isArray(bundle.schema?.tables)
    ? bundle.schema.tables
        .map((table: any) => table?.tableName)
        .filter((table: unknown): table is string => typeof table === "string")
    : [];

  const missingInBundle = [...currentTables].filter(
    (table) => !bundleTables.includes(table),
  );
  const newInBundle = bundleTables.filter((table) => !currentTables.has(table));
  if (bundleTables.length > 0 && missingInBundle.length > 0) {
    warnings.push(
      `${missingInBundle.length} current tables are absent from the bundle: ${missingInBundle
        .slice(0, 5)
        .join(", ")}${missingInBundle.length > 5 ? "..." : ""}`,
    );
  }
  if (newInBundle.length > 0) {
    warnings.push(
      `${newInBundle.length} bundle tables are not present in the current database: ${newInBundle
        .slice(0, 5)
        .join(", ")}${newInBundle.length > 5 ? "..." : ""}`,
    );
  }

  const schemaCompatible =
    bundleTables.length === 0 ||
    bundleTables.every((table) => /^[a-z_][a-z0-9_]{0,62}$/i.test(table));
  if (!schemaCompatible) warnings.push("Bundle contains invalid table identifiers");

  const registryTables = Array.isArray(bundle.config?.registryTables)
    ? bundle.config.registryTables
    : [];
  const configCount = registryTables.reduce(
    (sum: number, table: any) => sum + (Array.isArray(table?.rows) ? table.rows.length : 0),
    0,
  );

  let riskLevel: RestorePreview["riskLevel"] = "low";
  if (manifest.bundleType === "full") riskLevel = "critical";
  else if (manifest.bundleType === "schema") riskLevel = "high";
  else if (manifest.bundleType === "deployment") riskLevel = "medium";
  if (!verification.executable || !schemaCompatible) riskLevel = "critical";

  return {
    bundleName: String(manifest.bundleName ?? bundle._meta?.bundleName ?? "unknown-bundle"),
    bundleType: String(manifest.bundleType ?? bundle._meta?.bundleType ?? "unknown"),
    createdAt: Number(manifest.createdAt ?? bundle._meta?.createdAt ?? 0),
    appVersion: String(manifest.appVersion ?? bundle._meta?.appVersion ?? "unknown"),
    tableCount: bundleTables.length,
    configCount,
    dataTableCount: Array.isArray(bundle.data) ? bundle.data.length : 0,
    riskLevel,
    validation: {
      checksumValid: verification.checksumValid,
      signatureValid: verification.signatureValid,
      metadataValid: verification.metadataValid,
      formatValid: verification.formatValid,
      databaseValid: verification.databaseValid,
      executable: verification.executable && schemaCompatible,
      schemaCompatible,
      migrationCompatible: verification.formatValid && verification.databaseValid,
      warnings,
    },
  };
}

async function load_table_columns(
  client: PoolClient,
  tableName: string,
): Promise<Set<string>> {
  const result = await client.query(
    `select column_name from information_schema.columns
     where table_schema='public' and table_name=$1`,
    [tableName],
  );
  return new Set(result.rows.map((row) => row.column_name));
}

async function upsert_registry_table(
  client: PoolClient,
  tableExport: spine_table_data,
): Promise<{ restored: number; identityValues: string[] }> {
  const tableName = assert_spine_identifier(tableExport.tableName, "registry table");
  const policy = REGISTRY_RESTORE_POLICY[tableName];
  if (!policy) throw new Error(`Unsupported registry restore table: ${tableName}`);
  const targetColumns = await load_table_columns(client, tableName);
  const rows = (tableExport.rows ?? []) as Array<Record<string, unknown>>;
  const identityColumn = resolve_registry_identity_column(
    tableName,
    targetColumns,
    rows,
  );
  const writable = new Set(
    policy.writableColumns.filter((column) => targetColumns.has(column)),
  );
  if (!writable.has(identityColumn)) {
    throw new Error(`Identity column ${identityColumn} is unavailable on ${tableName}`);
  }

  const table = quote_spine_identifier(tableName);
  const seenIdentities = new Set<string>();
  let restored = 0;
  const identityValues: string[] = [];

  for (const rawRow of rows) {
    if (!rawRow || typeof rawRow !== "object" || Array.isArray(rawRow)) {
      throw new Error(`Invalid registry row in ${tableName}`);
    }
    const identity = rawRow[identityColumn];
    if (identity === null || identity === undefined || String(identity).trim() === "") {
      throw new Error(`Registry row in ${tableName} is missing ${identityColumn}`);
    }
    const identityValue = String(identity);
    if (seenIdentities.has(identityValue)) {
      throw new Error(
        `Bundle contains duplicate ${tableName}.${identityColumn} identity: ${identityValue}`,
      );
    }
    seenIdentities.add(identityValue);

    const entries = Object.entries(rawRow).filter(([column]) => writable.has(column));
    const updateEntries = entries.filter(([column]) => column !== identityColumn);
    identityValues.push(identityValue);

    const updateValues = updateEntries.map(([, value]) => value ?? null);
    const updateSet = updateEntries.map(
      ([column], index) => `${quote_spine_identifier(column)}=$${index + 1}`,
    );
    const updateResult = updateSet.length > 0
      ? await client.query(
          `update public.${table}
           set ${updateSet.join(", ")}
           where ${quote_spine_identifier(identityColumn)}=$${updateValues.length + 1}`,
          [...updateValues, identity],
        )
      : { rowCount: 0 };

    if ((updateResult.rowCount ?? 0) > 1) {
      throw new Error(
        `Ambiguous ${tableName}.${identityColumn} target matched ${updateResult.rowCount} rows for ${identityValue}`,
      );
    }

    if ((updateResult.rowCount ?? 0) === 0) {
      const names = entries.map(([column]) => quote_spine_identifier(column));
      const values = entries.map(([, value]) => value ?? null);
      const placeholders = values.map((_value, index) => `$${index + 1}`);
      await client.query(
        `insert into public.${table} (${names.join(", ")})
         values (${placeholders.join(", ")})`,
        values,
      );
    }
    restored += 1;
  }
  return { restored, identityValues };
}

async function restoreConfig(config: any): Promise<{
  restoredEngines: string[];
  restoredStreams: string[];
  restoredRegistryRows: number;
}> {
  const registryTables: spine_table_data[] = Array.isArray(config?.registryTables)
    ? config.registryTables
    : [];
  if (registryTables.length === 0) {
    throw new Error("Bundle config does not contain PostgreSQL registryTables");
  }

  const client = await getPool().connect();
  const restoredEngines: string[] = [];
  const restoredStreams: string[] = [];
  let restoredRegistryRows = 0;
  try {
    await client.query("begin");
    for (const table of registryTables) {
      const result = await upsert_registry_table(client, table);
      restoredRegistryRows += result.restored;
      if (table.tableName === "engine_registry") restoredEngines.push(...result.identityValues);
      if (table.tableName === "data_stream_registry") restoredStreams.push(...result.identityValues);
    }
    await client.query("commit");
    return { restoredEngines, restoredStreams, restoredRegistryRows };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function restoreSchema(schema: any): Promise<string[]> {
  if (!Array.isArray(schema?.tables)) return [];
  const enums = Array.isArray(schema?.enums) ? schema.enums : [];
  return create_spine_missing_tables(
    schema.tables as spine_table_schema[],
    enums,
  );
}

export async function executeRestore(
  bundleJson: string,
  restoreType: "full" | "schema" | "config" | "deployment",
  executedBy: string,
): Promise<{ runId: number; summary: string }> {
  const { bundle } = parseBundleJson(bundleJson);
  const preview = await validateBundle(bundleJson);
  const runId = await create_restore_spine_run({
    bundleName: preview.bundleName,
    restoreType,
    executedBy,
    riskLevel: preview.riskLevel,
    manifestChecksum: bundle._manifest?.checksum ?? null,
    validationResult: preview.validation,
    startedAt: Date.now(),
  });

  const restoredTables: string[] = [];
  const restoredEngines: string[] = [];
  const restoredStreams: string[] = [];
  const skippedTables: unknown[] = [];
  const errors: string[] = [];
  let restoredRows = 0;

  try {
    if (!preview.validation.executable) {
      throw new Error(
        `Spine bundle is not executable: ${preview.validation.warnings.join("; ")}`,
      );
    }
    await preflight_spine_restore_contents(
      bundle,
      restoreType,
      resolve_registry_identity_column,
    );
    await set_restore_spine_run_status(runId, "restoring");

    if (["full", "schema", "deployment"].includes(restoreType)) {
      if (!bundle.schema) throw new Error(`Restore type ${restoreType} requires a schema section`);
      restoredTables.push(...(await restoreSchema(bundle.schema)));
    }

    if (["full", "config", "deployment"].includes(restoreType)) {
      if (!bundle.config) throw new Error(`Restore type ${restoreType} requires a config section`);
      const configResult = await restoreConfig(bundle.config);
      restoredEngines.push(...configResult.restoredEngines);
      restoredStreams.push(...configResult.restoredStreams);
      restoredRows += configResult.restoredRegistryRows;
    }

    if (restoreType === "full") {
      if (!Array.isArray(bundle.data)) throw new Error("Full restore requires a data section");
      for (const dataExport of bundle.data as spine_table_data[]) {
        if (dataExport.truncated) {
          errors.push(`Data table ${dataExport.tableName} was truncated in the bundle`);
          continue;
        }
        try {
          const result = await restore_spine_table_data(dataExport);
          if (result.skipped) {
            skippedTables.push({ tableName: result.tableName, reason: result.reason });
          } else {
            restoredRows += result.insertedRows;
            if (!restoredTables.includes(result.tableName)) restoredTables.push(result.tableName);
          }
        } catch (error) {
          errors.push(
            `Data restore failed for ${String(dataExport.tableName)}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }

    const meaningfulWork =
      restoredTables.length + restoredEngines.length + restoredStreams.length + restoredRows;
    const status =
      errors.length === 0
        ? "completed"
        : meaningfulWork > 0
          ? "completed_with_errors"
          : "failed";
    const summary = [
      `Restore ${restoreType} ${status}.`,
      `${restoredTables.length} tables created or populated.`,
      `${restoredEngines.length} engines reconciled.`,
      `${restoredStreams.length} streams reconciled.`,
      `${restoredRows} rows restored or reconciled.`,
      `${skippedTables.length} tables safely skipped.`,
      errors.length > 0 ? `${errors.length} errors recorded.` : "No restore errors.",
    ].join(" ");

    await finish_restore_spine_run({
      id: runId,
      status,
      completedAt: Date.now(),
      restoredTables: [...new Set(restoredTables)].sort(),
      restoredEngines: [...new Set(restoredEngines)].sort(),
      restoredStreams: [...new Set(restoredStreams)].sort(),
      restoredRows,
      skippedTables,
      errors,
      summary,
    });

    if (status === "failed") throw new Error(summary);
    return { runId, summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!errors.includes(message)) errors.push(message);
    const summary = `Restore ${restoreType} failed. ${errors.length} errors recorded.`;
    await finish_restore_spine_run({
      id: runId,
      status: "failed",
      completedAt: Date.now(),
      restoredTables,
      restoredEngines,
      restoredStreams,
      restoredRows,
      skippedTables,
      errors,
      summary,
    }).catch((ledgerError) =>
      console.error("[Sovereign Spine Restore] failed to record restore failure", ledgerError),
    );
    throw error;
  }
}

export async function getRestoreHistory(limit = 20) {
  return list_restore_spine_runs(limit);
}

export async function getRestoreRun(runId: number) {
  return get_restore_spine_run(runId);
}

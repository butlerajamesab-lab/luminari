import type { PoolClient } from "pg";
import { storagePut } from "../storage";
import {
  compute_spine_checksum,
  create_spine_manifest,
  SPINE_BUNDLE_FORMAT,
  stringify_spine_json,
  type spine_bundle_type,
} from "./spine-bundle-contract";
import { export_spine_table_data_consistent } from "./spine-consistent-data-export";
import { create_spine_deployment_manifest } from "./spine-deployment-manifest";
import { with_spine_export_snapshot } from "./spine-export-snapshot";
import {
  type spine_table_data,
  type spine_table_schema,
  type spine_enum_definition,
} from "./spine-postgres";
import { SPINE_STATIC_CIVIC_TABLES } from "./spine-static-table-policy";
import {
  export_spine_database_enums,
  export_spine_database_schema,
} from "./spine-schema-export";
import {
  complete_export_spine_run,
  create_export_spine_run,
  fail_export_spine_run,
  get_export_spine_run,
  get_export_spine_stats,
  list_export_spine_runs,
} from "./spine-run-store";

export type ExportType = spine_bundle_type;

export interface ExportManifest {
  bundleName: string;
  bundleType: ExportType;
  bundleFormat: string;
  databaseType: "postgresql";
  createdAt: number;
  appVersion: string;
  includedDirectories: string[];
  includedTables: string[];
  includedConfigs: string[];
  checksum: string;
  signatureAlgorithm: "HMAC-SHA256";
  signature: string;
}

export interface SchemaExport {
  enums: spine_enum_definition[];
  tables: spine_table_schema[];
  exportedAt: number;
}

export interface ConfigExport {
  engines: any[];
  streams: any[];
  datasets: any[];
  signals: any[];
  patterns: any[];
  registryTables: DataExport[];
  exportedAt: number;
}

export type DataExport = spine_table_data;

const APP_VERSION = "5.0.0-sovereign-spine";
const REGISTRY_TABLES = [
  "engine_registry",
  "data_stream_registry",
  "signal_registry",
  "pattern_registry",
] as const;

const SENSITIVE_OBJECT_KEY_FRAGMENTS = [
  "password",
  "secret",
  "token",
  "apikey",
  "api_key",
  "credential",
  "privatekey",
  "private_key",
  "jwt",
  "authorization",
  "cookie",
];

const SENSITIVE_URL_PARAMETER_NAMES = new Set([
  "key",
  "api_key",
  "apikey",
  "access_key",
  "accesskey",
  "access_token",
  "token",
  "secret",
  "client_secret",
  "clientsecret",
  "password",
  "passwd",
  "pwd",
  "auth",
  "authorization",
]);

function normalizeCredentialKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function isSensitiveObjectKey(value: string): boolean {
  const normalized = normalizeCredentialKey(value);
  return SENSITIVE_OBJECT_KEY_FRAGMENTS.some((candidate) =>
    normalized.includes(candidate),
  );
}

function isSensitiveUrlParameter(value: string): boolean {
  const normalized = normalizeCredentialKey(value);
  return (
    SENSITIVE_URL_PARAMETER_NAMES.has(normalized) ||
    isSensitiveObjectKey(normalized)
  );
}

function sanitizeExportString(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return stringify_spine_json(
        sanitize_spine_export_value(JSON.parse(trimmed)),
        0,
      );
    } catch {
      // Preserve ordinary text that only resembles JSON.
    }
  }

  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    for (const key of [...url.searchParams.keys()]) {
      if (isSensitiveUrlParameter(key)) {
        url.searchParams.set(key, "ENV_PLACEHOLDER");
      }
    }
    return url.toString();
  } catch {
    return value.replace(
      /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      "ENV_PLACEHOLDER",
    );
  }
}

export function sanitize_spine_export_value(value: any): any {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return sanitizeExportString(value);
  if (Array.isArray(value)) return value.map(sanitize_spine_export_value);
  if (value && typeof value === "object") {
    const sanitized: Record<string, any> = {};
    for (const [key, item] of Object.entries(value)) {
      sanitized[key] = isSensitiveObjectKey(key)
        ? "ENV_PLACEHOLDER"
        : sanitize_spine_export_value(item);
    }
    return sanitized;
  }
  return value;
}

function findRegistryRows(
  registryTables: DataExport[],
  tableName: string,
): Record<string, any>[] {
  return (
    registryTables.find((table) => table.tableName === tableName)?.rows ?? []
  ) as Record<string, any>[];
}

async function exportTableDataFromSnapshot(
  client: PoolClient,
  tableName: string,
  limit = 100_000,
): Promise<DataExport> {
  return sanitize_spine_export_value(
    await export_spine_table_data_consistent(tableName, limit, client),
  );
}

async function exportSchemaFromSnapshot(
  client: PoolClient,
): Promise<SchemaExport> {
  const [enums, tables] = await Promise.all([
    export_spine_database_enums(client),
    export_spine_database_schema(client),
  ]);
  return { enums, tables, exportedAt: Date.now() };
}

async function exportConfigFromSnapshot(
  client: PoolClient,
): Promise<ConfigExport> {
  const registryTables: DataExport[] = [];
  for (const tableName of REGISTRY_TABLES) {
    registryTables.push(
      await exportTableDataFromSnapshot(client, tableName, 100_000),
    );
  }

  const engineRows = findRegistryRows(registryTables, "engine_registry");
  const streamRows = findRegistryRows(registryTables, "data_stream_registry");
  const signalRows = findRegistryRows(registryTables, "signal_registry");
  const patternRows = findRegistryRows(registryTables, "pattern_registry");

  return sanitize_spine_export_value({
    engines: engineRows.map((row) => ({
      engineId: row.engine_id_er,
      engineName: row.engine_name_er,
      description: row.description_er,
      category: row.category_er,
      enabled: row.enabled_er,
      sortOrder: Number(row.sort_order_er ?? 0),
      config: row.config_json_er,
      version: row.version_er,
    })),
    streams: streamRows.map((row) => ({
      streamId: row.stream_id_dsr,
      streamName: row.stream_name_dsr,
      streamType: row.stream_type_dsr,
      sourceUrl: row.source_url_dsr,
      apiUrl: row.api_url_dsr,
      source: row.source_dsr,
      updateFrequency: row.update_freq_dsr,
      cronExpression: row.cron_expression_dsr,
      signalWeight: row.signal_weight_dsr,
      confidenceMultiplier: row.confidence_multiplier_dsr,
      enabled: row.enabled_dsr,
      autoDisabled: row.auto_disabled_dsr,
      disabledReason: row.disabled_reason_dsr,
      fieldMapping: row.field_mapping_dsr,
      parserMode: row.parser_mode_dsr,
      postProcessingEngineName: row.post_processing_engine_name_dsr,
      jurisdiction: row.jurisdiction_dsr,
      domain: row.domain_dsr,
    })),
    datasets: streamRows.map((row) => ({
      datasetId: row.stream_id_dsr,
      datasetName: row.stream_name_dsr,
      source: row.source_dsr ?? "unknown",
      apiUrl: row.api_url_dsr ?? row.source_url_dsr ?? "",
      updateFrequency: row.update_freq_dsr,
      jurisdiction: row.jurisdiction_dsr ?? "",
      domain: row.domain_dsr ?? row.stream_type_dsr,
      fieldMapping: row.field_mapping_dsr,
      enabled: row.enabled_dsr,
    })),
    signals: signalRows.map((row) => ({
      signalType: row.signal_type,
      domain: row.domain,
      severity: row.severity,
      triggerPatterns: row.trigger_patterns,
      linkedDoctrine: row.linked_doctrine,
      explanation: row.explanation,
    })),
    patterns: patternRows.map((row) => ({
      patternId: row.pattern_id ?? null,
      patternName: row.pattern_name,
      patternType: row.pattern_type,
      signalType: row.signal_type,
      triggerThreshold: row.trigger_threshold,
      confidenceThreshold: row.confidence_threshold,
      jurisdictionScope: row.jurisdiction_scope,
    })),
    registryTables,
    exportedAt: Date.now(),
  });
}

export async function exportSchema(): Promise<SchemaExport> {
  return with_spine_export_snapshot(exportSchemaFromSnapshot);
}

export async function exportConfig(): Promise<ConfigExport> {
  return with_spine_export_snapshot(exportConfigFromSnapshot);
}

export async function exportTableData(
  tableName: string,
  limit = 100_000,
): Promise<DataExport> {
  return with_spine_export_snapshot((client) =>
    exportTableDataFromSnapshot(client, tableName, limit),
  );
}

export async function runExport(
  exportType: ExportType,
  createdBy: string,
): Promise<{ runId: number; bundleName: string }> {
  const createdAt = Date.now();
  const bundleName = `luminari-${exportType}-${new Date(createdAt)
    .toISOString()
    .replace(/[:.]/g, "-")}`;
  const runId = await create_export_spine_run({
    exportType,
    bundleName,
    createdBy,
    createdAt,
  });

  try {
    const snapshotArtifact = await with_spine_export_snapshot(async (client) => {
      const bundle: Record<string, any> = {
        _meta: {
          bundleName,
          bundleType: exportType,
          bundleFormat: SPINE_BUNDLE_FORMAT,
          databaseType: "postgresql",
          createdAt,
          appVersion: APP_VERSION,
          platform: "Luminari Deterministic Civic Operating Environment",
          restorePolicy: {
            schema: "create_missing_only",
            config: "upsert_canonical_registries",
            data: "allowlisted_empty_tables_only",
            secrets: "never_exported",
          },
        },
      };

      const includedDirectories: string[] = [];
      const includedTables: string[] = [];
      const includedConfigs: string[] = [];
      let schema: SchemaExport | null = null;

      if (exportType !== "config") {
        schema = await exportSchemaFromSnapshot(client);
        bundle.schema = schema;
        includedDirectories.push("schema");
        includedTables.push(...schema.tables.map((table) => table.tableName));
      }

      const config = await exportConfigFromSnapshot(client);
      bundle.config = config;
      includedConfigs.push(
        "engines",
        "streams",
        "datasets",
        "signals",
        "patterns",
      );

      if (exportType === "full") {
        if (!schema) throw new Error("Full Spine export requires snapshot schema");
        const inventory = new Set(
          schema.tables.map((table) => table.tableName),
        );
        const existingConfigTables = SPINE_STATIC_CIVIC_TABLES.filter((table) =>
          inventory.has(table),
        );
        const dataExports: DataExport[] = [];
        for (const tableName of existingConfigTables) {
          dataExports.push(
            await exportTableDataFromSnapshot(client, tableName, 100_000),
          );
        }
        const truncatedTables = dataExports
          .filter((table) => table.truncated)
          .map((table) => table.tableName);
        if (truncatedTables.length > 0) {
          throw new Error(
            `Full Spine export refused an incomplete bundle; row limit exceeded for: ${truncatedTables.join(", ")}`,
          );
        }
        bundle.data = dataExports;
        bundle.dataPolicy = {
          allowlistedTables: existingConfigTables,
          absentAllowlistedTables: SPINE_STATIC_CIVIC_TABLES.filter(
            (table) => !inventory.has(table),
          ),
          rowLimitPerTable: 100_000,
          truncatedTables: [],
        };
        includedDirectories.push("data");
      }

      if (exportType === "deployment" || exportType === "full") {
        bundle.deployment = create_spine_deployment_manifest();
        includedDirectories.push("deployment");
      }

      const checksum = compute_spine_checksum(bundle);
      const manifest: ExportManifest = create_spine_manifest({
        bundleName,
        bundleType: exportType,
        createdAt,
        appVersion: APP_VERSION,
        includedDirectories,
        includedTables,
        includedConfigs,
        checksum,
      });
      bundle._manifest = manifest;

      return {
        finalJson: stringify_spine_json(bundle),
        manifest,
      };
    });

    const filePath = `exports/${bundleName}.json`;
    const { url } = await storagePut(
      filePath,
      snapshotArtifact.finalJson,
      "application/json",
    );

    await complete_export_spine_run({
      id: runId,
      completedAt: Date.now(),
      filePath,
      fileUrl: url,
      bundleSize: Buffer.byteLength(snapshotArtifact.finalJson),
      manifest: snapshotArtifact.manifest,
    });

    return { runId, bundleName };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await fail_export_spine_run({
      id: runId,
      completedAt: Date.now(),
      errorMessage: message,
    }).catch((ledgerError) =>
      console.error(
        "[Sovereign Spine Export] failed to record export failure",
        ledgerError,
      ),
    );
    throw error;
  }
}

export async function getExportHistory(limit = 20) {
  return list_export_spine_runs(limit);
}

export async function getExportRun(runId: number) {
  return get_export_spine_run(runId);
}

export async function getExportStats() {
  return get_export_spine_stats();
}

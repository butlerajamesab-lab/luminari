import {
  engineRegistry,
  dataStreamRegistry,
  signalRegistry,
  patternRegistry,
} from "../../drizzle/schema";
import { db } from "../db";
import { storagePut } from "../storage";
import {
  compute_spine_checksum,
  create_spine_manifest,
  SPINE_BUNDLE_FORMAT,
  stringify_spine_json,
  type spine_bundle_type,
} from "./spine-bundle-contract";
import {
  SPINE_CONFIG_TABLES,
  export_spine_table_data,
  list_spine_public_tables,
  type spine_table_data,
  type spine_table_schema,
  type spine_enum_definition,
} from "./spine-postgres";
import { export_spine_database_enums, export_spine_database_schema } from "./spine-schema-export";
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

const SENSITIVE_EXPORT_KEYS = [
  "password", "secret", "token", "apikey", "api_key", "credential",
  "privatekey", "private_key", "jwt", "authorization", "cookie",
];

function sanitizeExportString(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return stringify_spine_json(sanitizeForExport(JSON.parse(trimmed)), 0);
    } catch {
      // Preserve ordinary text that only resembles JSON.
    }
  }
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (SENSITIVE_EXPORT_KEYS.some((candidate) => normalized.includes(candidate))) {
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

function sanitizeForExport(value: any): any {
  if (typeof value === "string") return sanitizeExportString(value);
  if (Array.isArray(value)) return value.map(sanitizeForExport);
  if (value && typeof value === "object") {
    const sanitized: Record<string, any> = {};
    for (const [key, item] of Object.entries(value)) {
      const normalized = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
      sanitized[key] = SENSITIVE_EXPORT_KEYS.some((candidate) => normalized.includes(candidate))
        ? "ENV_PLACEHOLDER"
        : sanitizeForExport(item);
    }
    return sanitized;
  }
  return value;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  async function runWorker() {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await worker(values[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => runWorker()),
  );
  return results;
}

export async function exportSchema(): Promise<SchemaExport> {
  const [enums, tables] = await Promise.all([
    export_spine_database_enums(),
    export_spine_database_schema(),
  ]);
  return { enums, tables, exportedAt: Date.now() };
}

export async function exportConfig(): Promise<ConfigExport> {
  const [engines, streams, signals] = await Promise.all([
    db.select().from(engineRegistry).orderBy(engineRegistry.sortOrder),
    db.select().from(dataStreamRegistry),
    db.select().from(signalRegistry),
  ]);

  let patterns: any[] = [];
  try {
    patterns = await db.select().from(patternRegistry);
  } catch (error) {
    console.warn(
      "[Sovereign Spine Export] pattern_registry unavailable; preserving explicit empty section",
      error instanceof Error ? error.message.slice(0, 200) : String(error),
    );
  }

  const registryTables = await mapWithConcurrency(
    ["engine_registry", "data_stream_registry", "signal_registry", "pattern_registry"],
    2,
    (table) => exportTableData(table, 100_000),
  );

  return sanitizeForExport({
    engines: engines.map((engine: any) => ({
      engineId: engine.engineId,
      engineName: engine.engineName,
      description: engine.description,
      category: engine.category,
      enabled: engine.enabled,
      sortOrder: Number(engine.sortOrder ?? 0),
      config: engine.configJson,
      version: engine.version,
    })),
    streams: streams.map((stream: any) => ({
      streamId: stream.streamId,
      streamName: stream.streamName,
      streamType: stream.streamType,
      sourceUrl: stream.sourceUrl,
      apiUrl: stream.apiUrl,
      source: stream.source,
      updateFrequency: stream.updateFrequency,
      cronExpression: stream.cronExpression,
      signalWeight: stream.signalWeight,
      confidenceMultiplier: stream.confidenceMultiplier,
      enabled: stream.enabled,
      autoDisabled: stream.autoDisabled,
      disabledReason: stream.disabledReason,
      fieldMapping: stream.fieldMapping,
      parserMode: stream.parserMode,
      postProcessingEngineName: stream.postProcessingEngineName,
      jurisdiction: stream.jurisdiction,
      domain: stream.domain,
    })),
    datasets: streams.map((stream: any) => ({
      datasetId: stream.streamId,
      datasetName: stream.streamName,
      source: stream.source ?? "unknown",
      apiUrl: stream.apiUrl ?? stream.sourceUrl ?? "",
      updateFrequency: stream.updateFrequency,
      jurisdiction: stream.jurisdiction ?? "",
      domain: stream.domain ?? stream.streamType,
      fieldMapping: stream.fieldMapping,
      enabled: stream.enabled,
    })),
    signals: signals.map((signal: any) => ({
      signalType: signal.signalType,
      domain: signal.domain,
      severity: signal.severity,
      triggerPatterns: signal.triggerPatterns,
      linkedDoctrine: signal.linkedDoctrine,
      explanation: signal.explanation,
    })),
    patterns: patterns.map((pattern: any) => ({
      patternId: pattern.patternId,
      patternName: pattern.patternName,
      patternType: pattern.patternType,
      signalType: pattern.signalType,
      triggerThreshold: pattern.triggerThreshold,
      confidenceThreshold: pattern.confidenceThreshold,
      jurisdictionScope: pattern.jurisdictionScope,
    })),
    registryTables,
    exportedAt: Date.now(),
  });
}

export async function exportTableData(
  tableName: string,
  limit = 100_000,
): Promise<DataExport> {
  return sanitizeForExport(await export_spine_table_data(tableName, limit));
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

    if (exportType !== "config") {
      const schema = await exportSchema();
      bundle.schema = schema;
      includedDirectories.push("schema");
      includedTables.push(...schema.tables.map((table) => table.tableName));
    }

    const config = await exportConfig();
    bundle.config = config;
    includedConfigs.push("engines", "streams", "datasets", "signals", "patterns");

    if (exportType === "full") {
      const inventory = new Set(
        (await list_spine_public_tables()).map((table) => table.tableName),
      );
      const existingConfigTables = SPINE_CONFIG_TABLES.filter((table) =>
        inventory.has(table),
      );
      const dataExports = await mapWithConcurrency(
        existingConfigTables,
        2,
        (table) => exportTableData(table, 100_000),
      );
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
        absentAllowlistedTables: SPINE_CONFIG_TABLES.filter(
          (table) => !inventory.has(table),
        ),
        rowLimitPerTable: 100_000,
        truncatedTables: [],
      };
      includedDirectories.push("data");
    }

    if (exportType === "deployment" || exportType === "full") {
      bundle.deployment = {
        requiredEnvVars: [
          "DATABASE_URL",
          "JWT_SECRET",
          "SUPABASE_URL",
          "SUPABASE_ANON_KEY",
          "SUPABASE_SERVICE_ROLE_KEY",
          "BUILT_IN_FORGE_API_URL",
          "BUILT_IN_FORGE_API_KEY",
        ],
        optionalEnvVars: ["SPINE_EXPORT_SIGNING_KEY"],
        nodeVersion: ">=20.0.0",
        packageManager: "npm",
        buildCommand: "npm run build",
        startCommand: "npm start",
        databaseType: "postgresql",
        migrationStrategy: "supabase_sql_migrations",
        secretsIncluded: false,
      };
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

    const finalJson = stringify_spine_json(bundle);
    const filePath = `exports/${bundleName}.json`;
    const { url } = await storagePut(filePath, finalJson, "application/json");

    await complete_export_spine_run({
      id: runId,
      completedAt: Date.now(),
      filePath,
      fileUrl: url,
      bundleSize: Buffer.byteLength(finalJson),
      manifest,
    });

    return { runId, bundleName };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await fail_export_spine_run({
      id: runId,
      completedAt: Date.now(),
      errorMessage: message,
    }).catch((ledgerError) =>
      console.error("[Sovereign Spine Export] failed to record export failure", ledgerError),
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

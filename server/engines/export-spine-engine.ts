/**
 * Export Spine Engine
 * 
 * Generates portable bundles of the Luminari platform:
 * - full: schema + config + data + engine definitions + stream definitions
 * - schema: database schema DDL only
 * - config: engine configs, stream configs, signal weights, system settings
 * - deployment: everything needed to redeploy (schema + config + code manifest)
 * 
 * Security: NEVER exports secrets, API keys, or user credentials.
 * All sensitive values are replaced with ENV_PLACEHOLDER markers.
 */
import { db } from "../db";
import { eq, desc, sql } from "drizzle-orm";
import {
  exportSpineRuns,
  engineRegistry,
  dataStreamRegistry,
  signalRegistry,
  patternRegistry,
  adminChangeLog,
} from "../../drizzle/schema";
import { storagePut } from "../storage";
import crypto from "crypto";

// ─── Types ───
export type ExportType = "full" | "schema" | "config" | "deployment";

export interface ExportManifest {
  bundleName: string;
  bundleType: ExportType;
  createdAt: number;
  appVersion: string;
  includedDirectories: string[];
  includedTables: string[];
  includedConfigs: string[];
  checksum: string;
}

export interface SchemaExport {
  tables: Array<{
    tableName: string;
    createStatement: string;
    rowCount: number;
  }>;
  exportedAt: number;
}

export interface ConfigExport {
  engines: Array<{
    engineId: string;
    engineName: string;
    category: string | null;
    enabled: boolean;
    sortOrder: number;
    config: Record<string, any> | null;
    version: string | null;
  }>;
  streams: Array<{
    streamId: string;
    streamName: string;
    streamType: string;
    sourceUrl: string | null;
    updateFrequency: string;
    signalWeight: number;
    confidenceMultiplier: number;
    enabled: boolean;
    fieldMapping: Record<string, string> | null;
  }>;
  datasets: Array<{
    datasetId: string;
    datasetName: string;
    source: string;
    apiUrl: string;
    updateFrequency: string;
    jurisdiction: string;
    domain: string;
    fieldMapping: Record<string, string> | null;
    enabled: boolean;
  }>;
  signals: Array<{
    signalType: string;
    domain: string;
    severity: string;
    triggerPatterns: string[];
    linkedDoctrine: string[] | null;
    explanation: string;
  }>;
  patterns: Array<{
    patternId: string;
    patternName: string;
    patternType: string | null;
    signalType: string | null;
    triggerThreshold: number | null;
    confidenceThreshold: number | null;
    jurisdictionScope: string | null;
  }>;
  exportedAt: number;
}

export interface DataExport {
  tableName: string;
  rowCount: number;
  rows: any[];
}

// ─── Core Functions ───

/** Get all table names from the database */
async function getAllTableNames(): Promise<string[]> {
  const result = await db.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
  const rows = result[0] as unknown as any[];
  return rows.map((r: any) => Object.values(r)[0] as string).sort();
}

/** Get CREATE TABLE statement for a table */
async function getCreateStatement(tableName: string): Promise<string> {
  try {
    const result = await db.execute(sql.raw(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = \'public\' AND table_name = \'${tableName}\'`));
    const rows = result[0] as unknown as any[];
    if (rows.length > 0) {
      return (rows[0] as any)["Create Table"] || "";
    }
  } catch {
    // table might not exist
  }
  return "";
}

/** Get row count for a table */
async function getRowCount(tableName: string): Promise<number> {
  try {
    const result = await db.execute(sql.raw(`SELECT COUNT(*) as cnt FROM \`${tableName}\``));
    const rows = result[0] as unknown as any[];
    return (rows[0] as any)?.cnt || 0;
  } catch {
    return 0;
  }
}

/** Export schema DDL for all tables */
export async function exportSchema(): Promise<SchemaExport> {
  const tableNames = await getAllTableNames();
  const tables: SchemaExport["tables"] = [];

  for (const tableName of tableNames) {
    const createStatement = await getCreateStatement(tableName);
    const rowCount = await getRowCount(tableName);
    tables.push({ tableName, createStatement, rowCount });
  }

  return { tables, exportedAt: Date.now() };
}

/** Export all configuration data */
export async function exportConfig(): Promise<ConfigExport> {
  // Engine registry
  const engines = await db.select().from(engineRegistry).orderBy(engineRegistry.sortOrder);
  
  // Data stream registry
  const streams = await db.select().from(dataStreamRegistry);
  
  // Datasets are now unified into dataStreamRegistry — no separate query needed
  
  // Signal registry
  const signals = await db.select().from(signalRegistry);
  
  // Pattern registry — guard against schema drift (some columns may not exist in DB yet)
  let patterns: any[] = [];
  try {
    patterns = await db.select().from(patternRegistry);
  } catch (e) {
    console.warn("[Export] pattern_registry query failed (schema drift?), skipping:", (e as Error).message?.slice(0, 120));
  }

  return {
    engines: engines.map((e: any) => ({
      engineId: e.engineId,
      engineName: e.engineName,
      category: e.category,
      enabled: e.enabled,
      sortOrder: e.sortOrder,
      config: e.configJson,
      version: e.version,
    })),
    streams: streams.map((s: any) => ({
      streamId: s.streamId,
      streamName: s.streamName,
      streamType: s.streamType,
      sourceUrl: s.sourceUrl,
      updateFrequency: s.updateFrequency,
      signalWeight: s.signalWeight,
      confidenceMultiplier: s.confidenceMultiplier,
      enabled: s.enabled,
      fieldMapping: s.fieldMapping,
    })),
    datasets: streams.map((s: any) => ({
      datasetId: s.streamId,
      datasetName: s.streamName,
      source: s.source ?? 'unknown',
      apiUrl: s.apiUrl ?? s.sourceUrl ?? '',
      updateFrequency: s.updateFrequency,
      jurisdiction: s.jurisdiction ?? '',
      domain: s.domain ?? s.streamType,
      fieldMapping: s.fieldMapping,
      enabled: s.enabled,
    })),
    signals: signals.map((s: any) => ({
      signalType: s.signalType,
      domain: s.domain,
      severity: s.severity,
      triggerPatterns: s.triggerPatterns,
      linkedDoctrine: s.linkedDoctrine,
      explanation: s.explanation,
    })),
    patterns: patterns.map(p => ({
      patternId: p.patternId,
      patternName: p.patternName,
      patternType: p.patternType,
      signalType: p.signalType,
      triggerThreshold: p.triggerThreshold,
      confidenceThreshold: p.confidenceThreshold,
      jurisdictionScope: p.jurisdictionScope,
    })),
    exportedAt: Date.now(),
  };
}

/** Export table data (for full export) — limited to config/registry tables, NOT user data */
export async function exportTableData(tableName: string, limit = 10000): Promise<DataExport> {
  try {
    const result = await db.execute(sql.raw(`SELECT * FROM \`${tableName}\` LIMIT ${limit}`));
    const rows = result[0] as unknown as any[];
    return { tableName, rowCount: rows.length, rows };
  } catch {
    return { tableName, rowCount: 0, rows: [] };
  }
}

/** Compute SHA-256 checksum of content */
function computeChecksum(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/** Sanitize export — remove any secrets or sensitive data */
function sanitizeForExport(obj: any): any {
  const sensitiveKeys = [
    "password", "secret", "token", "apiKey", "api_key",
    "JWT_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
    "BUILT_IN_FORGE_API_KEY", "OAUTH_SERVER_URL",
  ];
  
  if (typeof obj === "string") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForExport);
  }
  if (obj && typeof obj === "object") {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
        sanitized[key] = "ENV_PLACEHOLDER";
      } else {
        sanitized[key] = sanitizeForExport(value);
      }
    }
    return sanitized;
  }
  return obj;
}

// Config-only tables that are safe to export in full.
// Covers all knowledge backbone, registry, legal, strategy, and procedural tables.
// Excludes: user PII, case data, signal/pattern runtime data, logs, and run history.
const CONFIG_TABLES = [
  // ── Engine & Stream Registry ──
  "engine_registry", "data_stream_registry",

  // ── Signal & Pattern Config ──
  "signal_registry", "pattern_registry", "pattern_types",
  "pattern_creation_thresholds", "pattern_decay_rules", "pattern_confidence_factors",
  "trend_alert_rules",

  // ── Doctrine & FOIA ──
  "doctrine_registry", "foia_statutes", "foia_agencies",
  "foia_record_types", "foia_agency_records",

  // ── Interpreter / Signal Mapping ──
  "interp_signal_templates", "interp_harm_mappings",
  "interp_jurisdiction_guidance", "interp_category_interpretations",
  "interp_status_interpretations", "interp_timeline_expectations",
  "interp_entity_signal_rules", "interp_geographic_signal_rules",
  "interpreter_claim_matches", "interpreter_evidence_guidance",
  "interpreter_question_flow",

  // ── Jurisdiction ──
  "jurisdiction_rules", "jurisdiction_hierarchy",
  "registry_jurisdictions",

  // ── Legal Knowledge ──
  "legal_statutes", "legal_statute_clauses", "legal_case_law",
  "legal_weak_joints", "legal_enforcement_records", "legal_contradictions",
  "regulatory_guidance",

  // ── Knowledge Backbone ──
  "knowledge_entries", "knowledge_modules", "knowledge_cross_refs",
  "claim_validation_rules_v2", "remedy_feasibility_rules_v2",
  "remedy_feasibility_full", "remedy_matrix", "remedy_paths",
  "remedy_templates", "remedy_steps",
  "settlement_formulas", "settlement_calculations",
  "proof_frameworks", "evidence_profiles",
  "weak_joint_triggers",

  // ── Strategy & Procedural ──
  "strategy_selection_rules", "strategy_success_rates",
  "strategy_registry", "strategy_paths", "strategy_steps",
  "strategy_claim_catalog", "strategy_forum_rules",
  "strategy_deadline_engine", "strategy_viability_assessment",
  "sys_strategy_paths",
  "procedural_timelines", "procedural_outputs",
  "node_timeline", "timeline_edges", "timeline_events", "timeline_rules",
  "workflow_definitions", "workflow_steps", "workflow_master",
  "world_nodes",

  // ── Escalation & Enforcement ──
  "escalation_thresholds", "escalation_routes",
  "enforcement_viability_rules",
  "intervention_escalation_rules", "intervention_endpoints",
  "investigation_guidance", "investigative_queries",

  // ── Registry / Programs / Agencies ──
  "registry_programs", "registry_workflows", "registry_signals",
  "registry_oversight_bodies", "registry_contacts",
  "registry_policy_alerts", "registry_source_traceability",
  "institution_registry",

  // ── Coalition & Advocacy ──
  "legislator_contacts", "advocacy_organizations",

  // ── Narrative & Templates ──
  "narrative_templates", "lumensend_templates",
  "intake_document_templates", "paperwork_templates",

  // ── Harm & Outcome Mapping ──
  "harm_map_nodes", "harm_map_edges",
  "outcome_registry", "outcome_metrics",
  "populations_affected",

  // ── Litigation & Barriers ──
  "litigation_registry", "litigation_barriers",

  // ── Unified Resources ──
  "unified_resources", "mental_health_resources",
];

/** Run a full export */
export async function runExport(
  exportType: ExportType,
  createdBy: string,
): Promise<{ runId: number; bundleName: string }> {
  const timestamp = Date.now();
  const bundleName = `luminari-${exportType}-${new Date(timestamp).toISOString().replace(/[:.]/g, "-")}`;

  // Create run record
  const [insertResult] = await db.insert(exportSpineRuns).values({
    exportType,
    bundleName,
    status: "running",
    createdBy,
    createdAt: timestamp,
  });
  const runId = (insertResult as any).insertId;

  try {
    const bundle: Record<string, any> = {
      _meta: {
        bundleName,
        bundleType: exportType,
        createdAt: timestamp,
        appVersion: "4.0.0-luminari",
        platform: "Luminari Forensic Engine",
      },
    };

    const includedDirectories: string[] = [];
    const includedTables: string[] = [];
    const includedConfigs: string[] = [];

    // Schema export (all types except config-only)
    if (exportType !== "config") {
      const schema = await exportSchema();
      bundle.schema = sanitizeForExport(schema);
      includedDirectories.push("schema");
      includedTables.push(...schema.tables.map(t => t.tableName));
    }

    // Config export (all types)
    const config = await exportConfig();
    bundle.config = sanitizeForExport(config);
    includedConfigs.push("engines", "streams", "datasets", "signals", "patterns");

    // Data export (full only — config tables)
    if (exportType === "full") {
      const dataExports: DataExport[] = [];
      for (const tableName of CONFIG_TABLES) {
        const data = await exportTableData(tableName);
        if (data.rowCount > 0) {
          dataExports.push(sanitizeForExport(data));
        }
      }
      bundle.data = dataExports;
      includedDirectories.push("data");
    }

    // Deployment manifest (deployment type)
    if (exportType === "deployment" || exportType === "full") {
      bundle.deployment = {
        requiredEnvVars: [
          "DATABASE_URL", "JWT_SECRET", "VITE_APP_ID",
          "OAUTH_SERVER_URL", "VITE_OAUTH_PORTAL_URL",
          "BUILT_IN_FORGE_API_URL", "BUILT_IN_FORGE_API_KEY",
          "VITE_FRONTEND_FORGE_API_URL", "VITE_FRONTEND_FORGE_API_KEY",
        ],
        nodeVersion: ">=22.0.0",
        packageManager: "pnpm",
        buildCommand: "pnpm build",
        startCommand: "pnpm start",
        databaseType: "mysql",
        migrationStrategy: "drizzle-kit",
      };
      includedDirectories.push("deployment");
    }

    // Compute checksum
    const bundleJson = JSON.stringify(bundle, null, 2);
    const checksum = computeChecksum(bundleJson);

    const manifest: ExportManifest = {
      bundleName,
      bundleType: exportType,
      createdAt: timestamp,
      appVersion: "4.0.0-luminari",
      includedDirectories,
      includedTables,
      includedConfigs,
      checksum,
    };

    bundle._manifest = manifest;

    // Upload to S3
    const finalJson = JSON.stringify(bundle, null, 2);
    const fileKey = `exports/${bundleName}.json`;
    const { url } = await storagePut(fileKey, finalJson, "application/json");

    // Update run record
    await db.update(exportSpineRuns)
      .set({
        status: "completed",
        completedAt: Date.now(),
        filePath: fileKey,
        fileUrl: url,
        bundleSize: Buffer.byteLength(finalJson),
        bundleManifestJson: manifest,
      })
      .where(eq(exportSpineRuns.id, runId));

    return { runId, bundleName };
  } catch (error: any) {
    await db.update(exportSpineRuns)
      .set({
        status: "failed",
        completedAt: Date.now(),
        errorMessage: error.message || "Unknown error",
      })
      .where(eq(exportSpineRuns.id, runId));
    throw error;
  }
}

/** Get export history */
export async function getExportHistory(limit = 20) {
  return db.select().from(exportSpineRuns).orderBy(desc(exportSpineRuns.createdAt)).limit(limit);
}

/** Get a single export run */
export async function getExportRun(runId: number) {
  const [run] = await db.select().from(exportSpineRuns).where(eq(exportSpineRuns.id, runId));
  return run || null;
}

/** Get export stats */
export async function getExportStats() {
  const allRuns = await db.select().from(exportSpineRuns);
  const completed = allRuns.filter((r: any) => r.status === "completed");
  const totalSize = completed.reduce((sum: any, r: any) => sum + (Number(r.bundleSize) || 0), 0);
  
  return {
    totalExports: allRuns.length,
    completedExports: completed.length,
    failedExports: allRuns.filter((r: any) => r.status === "failed").length,
    totalExportSize: totalSize,
    lastExportAt: completed.length > 0 ? Math.max(...completed.map((r: any) => Number(r.createdAt))) : null,
    exportsByType: {
      full: allRuns.filter((r: any) => r.exportType === "full").length,
      schema: allRuns.filter((r: any) => r.exportType === "schema").length,
      config: allRuns.filter((r: any) => r.exportType === "config").length,
      deployment: allRuns.filter((r: any) => r.exportType === "deployment").length,
    },
  };
}

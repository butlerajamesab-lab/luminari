/**
 * Knowledge Freshness Monitoring Service
 * 
 * Tracks the freshness of all Knowledge Backbone tables.
 * Calculates freshness scores based on configurable staleness thresholds.
 * Provides daily job to update all freshness metrics.
 */

import { db } from "./db";
import { sql } from "drizzle-orm";

// ─── Freshness Configuration ───

export interface FreshnessConfig {
  tableName: string;
  displayName: string;
  staleDays: number;
  category: "backbone" | "live_data" | "engine";
  // Column to check for latest update timestamp
  timestampColumn: string;
}

export const FRESHNESS_CONFIGS: FreshnessConfig[] = [
  // Core Knowledge Backbone
  { tableName: "legal_statutes", displayName: "Legal Statutes", staleDays: 180, category: "backbone", timestampColumn: "updatedAt" },
  { tableName: "legal_case_law", displayName: "Case Law", staleDays: 90, category: "backbone", timestampColumn: "updatedAt" },
  { tableName: "agency_authority_map", displayName: "Agency Authorities", staleDays: 180, category: "backbone", timestampColumn: "updatedAt" },
  { tableName: "procedural_paths", displayName: "Procedural Paths", staleDays: 365, category: "backbone", timestampColumn: "updated_at" },
  { tableName: "advocacy_targets", displayName: "Advocacy Targets", staleDays: 180, category: "backbone", timestampColumn: "updated_at" },
  { tableName: "evidence_profiles", displayName: "Evidence Profiles", staleDays: 365, category: "backbone", timestampColumn: "updatedAt" },
  { tableName: "deadline_rules", displayName: "Deadline Rules", staleDays: 365, category: "backbone", timestampColumn: "updatedAt" },
  { tableName: "remedy_feasibility_rules", displayName: "Remedy Templates", staleDays: 365, category: "backbone", timestampColumn: "updated_at" },
  // Extended Backbone
  { tableName: "doctrine_registry", displayName: "Doctrine Registry", staleDays: 180, category: "backbone", timestampColumn: "updatedAt" },
  { tableName: "court_directory", displayName: "Court Directory", staleDays: 365, category: "backbone", timestampColumn: "updatedAt" },
  { tableName: "workflow_master", displayName: "Workflow Master", staleDays: 365, category: "backbone", timestampColumn: "updatedAt" },
  { tableName: "proof_frameworks", displayName: "Proof Frameworks", staleDays: 365, category: "backbone", timestampColumn: "updatedAt" },
  { tableName: "signal_registry", displayName: "Signal Registry", staleDays: 180, category: "engine", timestampColumn: "updatedAt" },
  { tableName: "pattern_registry", displayName: "Pattern Registry", staleDays: 180, category: "engine", timestampColumn: "updatedAt" },
  { tableName: "settlement_formulas", displayName: "Settlement Formulas", staleDays: 365, category: "backbone", timestampColumn: "updatedAt" },
  { tableName: "claim_validation_rules", displayName: "Claim Validation Rules", staleDays: 365, category: "engine", timestampColumn: "updated_at" },
  // Coalition & Campaign
  { tableName: "coalition_legislators", displayName: "Coalition Legislators", staleDays: 180, category: "backbone", timestampColumn: "updatedAt" },
  { tableName: "coalition_agencies", displayName: "Coalition Agencies", staleDays: 180, category: "backbone", timestampColumn: "updatedAt" },
  { tableName: "coalition_advocacy_orgs", displayName: "Coalition Advocacy Orgs", staleDays: 180, category: "backbone", timestampColumn: "updatedAt" },
  { tableName: "coalition_media", displayName: "Coalition Media", staleDays: 180, category: "backbone", timestampColumn: "updatedAt" },
  // Live Data
  { tableName: "consumer_complaints", displayName: "Consumer Complaints", staleDays: 90, category: "live_data", timestampColumn: "date_received" },
  { tableName: "enforcement_records", displayName: "Enforcement Records", staleDays: 90, category: "live_data", timestampColumn: "action_date" },
  { tableName: "campaign_finance_records", displayName: "Campaign Finance", staleDays: 180, category: "live_data", timestampColumn: "contribution_date" },
];

// ─── Freshness Score Calculation ───

/**
 * Calculate freshness score (0-100) based on days since last update.
 * 100 = updated within cycle
 * 50 = halfway to stale
 * 0 = stale (past threshold)
 */
export function calculateFreshnessScore(lastUpdateMs: number | null, staleDays: number): number {
  if (!lastUpdateMs) return 0;
  
  const now = Date.now();
  const daysSinceUpdate = (now - lastUpdateMs) / (1000 * 60 * 60 * 24);
  
  if (daysSinceUpdate <= 0) return 100;
  if (daysSinceUpdate >= staleDays) return 0;
  
  // Linear decay from 100 to 0 over staleDays
  return Math.round(100 * (1 - daysSinceUpdate / staleDays));
}

// ─── Core Operations ───

export interface FreshnessRecord {
  tableName: string;
  displayName: string;
  lastUpdate: number | null;
  recordCount: number;
  freshnessScore: number;
  staleFlag: boolean;
  staleDays: number;
  category: string;
  lastChecked: number | null;
}

/**
 * Get all freshness records from the database
 */
export async function getAllFreshnessRecords(): Promise<FreshnessRecord[]> {
  const [rows]: any = await db.execute(sql.raw(
    `SELECT table_name, display_name, last_update, record_count, freshness_score, 
            stale_flag, stale_days, category_kf, last_checked
     FROM knowledge_freshness ORDER BY category_kf, display_name`
  ));
  return (rows as any[]).map(r => ({
    tableName: r.table_name,
    displayName: r.display_name,
    lastUpdate: r.last_update ? Number(r.last_update) : null,
    recordCount: Number(r.record_count),
    freshnessScore: Number(r.freshness_score),
    staleFlag: Boolean(r.stale_flag),
    staleDays: Number(r.stale_days),
    category: r.category_kf,
    lastChecked: r.last_checked ? Number(r.last_checked) : null,
  }));
}

/**
 * Get freshness summary statistics
 */
export async function getFreshnessSummary(): Promise<{
  totalTables: number;
  healthyCount: number;
  agingCount: number;
  staleCount: number;
  averageScore: number;
  criticalAlerts: string[];
}> {
  const records = await getAllFreshnessRecords();
  
  const healthyCount = records.filter(r => r.freshnessScore >= 80).length;
  const agingCount = records.filter(r => r.freshnessScore >= 50 && r.freshnessScore < 80).length;
  const staleCount = records.filter(r => r.freshnessScore < 50).length;
  const averageScore = records.length > 0
    ? Math.round(records.reduce((s, r) => s + r.freshnessScore, 0) / records.length)
    : 0;
  
  // Critical alerts: backbone tables below 50
  const criticalAlerts = records
    .filter(r => r.category === "backbone" && r.freshnessScore < 50)
    .map(r => `${r.displayName} (score: ${r.freshnessScore})`);
  
  return {
    totalTables: records.length,
    healthyCount,
    agingCount,
    staleCount,
    averageScore,
    criticalAlerts,
  };
}

/**
 * Run the daily freshness check job.
 * Queries each tracked table for record count and latest update timestamp,
 * then recalculates freshness scores.
 */
export async function runFreshnessCheck(): Promise<{
  tablesChecked: number;
  tablesUpdated: number;
  errors: string[];
}> {
  const now = Date.now();
  let tablesChecked = 0;
  let tablesUpdated = 0;
  const errors: string[] = [];

  for (const config of FRESHNESS_CONFIGS) {
    try {
      // Get record count
      let recordCount = 0;
      let lastUpdate: number | null = null;

      try {
        const [countRows]: any = await db.execute(sql.raw(
          `SELECT COUNT(*) as cnt FROM "${config.tableName}"`
        ));
        recordCount = Number((countRows as any[])[0]?.cnt) || 0;
      } catch (e) {
        // Table might not exist yet
        errors.push(`${config.tableName}: table not found`);
        continue;
      }

      // Get latest update timestamp
      try {
        const [maxRows]: any = await db.execute(sql.raw(
          `SELECT MAX("${config.timestampColumn}") as maxTs FROM "${config.tableName}"`
        ));
        const maxVal = (maxRows as any[])[0]?.maxTs;
        if (maxVal) {
          // Handle both bigint timestamps and date strings
          if (typeof maxVal === "number" || (typeof maxVal === "string" && /^\d{10,}$/.test(maxVal))) {
            lastUpdate = Number(maxVal);
          } else if (typeof maxVal === "string") {
            lastUpdate = new Date(maxVal).getTime();
          } else if (maxVal instanceof Date) {
            lastUpdate = maxVal.getTime();
          }
        }
      } catch (e) {
        // Column might not exist — use null
        lastUpdate = null;
      }

      const freshnessScore = calculateFreshnessScore(lastUpdate, config.staleDays);
      const staleFlag = freshnessScore < 50;

      // Upsert into knowledge_freshness
      await db.execute(sql.raw(
        `INSERT INTO knowledge_freshness (table_name, display_name, last_update, record_count, freshness_score, stale_flag, stale_days, category_kf, last_checked, created_at_kf, updated_at_kf)
         VALUES ('${config.tableName}', '${config.displayName}', ${lastUpdate ?? 'NULL'}, ${recordCount}, ${freshnessScore}, ${staleFlag ? 1 : 0}, ${config.staleDays}, '${config.category}', ${now}, ${now}, ${now})
         ON DUPLICATE KEY UPDATE
           display_name = VALUES(display_name),
           last_update = VALUES(last_update),
           record_count = VALUES(record_count),
           freshness_score = VALUES(freshness_score),
           stale_flag = VALUES(stale_flag),
           stale_days = VALUES(stale_days),
           category_kf = VALUES(category_kf),
           last_checked = VALUES(last_checked),
           updated_at_kf = VALUES(updated_at_kf)`
      ));

      tablesChecked++;
      tablesUpdated++;
    } catch (err) {
      errors.push(`${config.tableName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { tablesChecked, tablesUpdated, errors };
}

/**
 * Initialize freshness tracking — run on first load to populate the table
 */
export async function initializeFreshness(): Promise<void> {
  const [existing]: any = await db.execute(sql.raw(
    `SELECT COUNT(*) as cnt FROM knowledge_freshness`
  ));
  const count = Number((existing as any[])[0]?.cnt) || 0;
  
  if (count === 0) {
    console.log("[Freshness] Initializing freshness tracking for", FRESHNESS_CONFIGS.length, "tables");
    await runFreshnessCheck();
  }
}

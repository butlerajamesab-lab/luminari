/**
 * Reform Package Enhanced Service
 *
 * T1. Version tracking: snapshot package data before updates, track version history
 * T2. Export logging: record every export with format, timestamp, user
 * T3. Strategy memory: record actions taken on reform packages for learning
 * T4. Package regeneration: create new version from existing package
 * T5. Version comparison: diff two versions of a package
 */

import { db } from "./db";
import { sql } from "drizzle-orm";

// ── Types ──────────────────────────────────────────────────────────────

export interface PackageVersion {
  id: number;
  packageId: string;
  versionNumber: number;
  packageData: any;
  changeSummary: string;
  createdAt: number;
  createdBy: string;
}

export interface PackageExportRecord {
  id: number;
  packageId: string;
  exportFormat: string;
  exportUrl: string | null;
  fileSize: number | null;
  createdAt: number;
  createdBy: string;
}

export interface ReformStrategyMemoryEntry {
  id: number;
  patternId: string;
  reformPackageId: string;
  actionType: string;
  actionData: any;
  outcomeFeedback: string | null;
  effectivenessScore: number | null;
  createdAt: number;
  createdBy: string;
}

// ── T1: Version Tracking ──────────────────────────────────────────────

/**
 * T1.1: Snapshot current package state as a new version before modification.
 * Input: packageId, userId
 * Output: PackageVersion record
 */
export async function snapshotPackageVersion(
  packageId: string,
  changeSummary: string,
  userId: string
): Promise<PackageVersion> {
  const now = Date.now();

  // T1.1.1: Fetch current package data
  const [rows] = await db.execute(
    sql`SELECT * FROM reform_packages WHERE package_id = ${packageId} LIMIT 1`
  );
  const pkg = (rows as unknown as any[])[0];
  if (!pkg) throw new Error(`Package not found: ${packageId}`);

  // T1.1.2: Determine next version number
  const [verRows] = await db.execute(
    sql`SELECT MAX(version_number) as max_ver FROM reform_package_versions WHERE package_id = ${packageId}`
  );
  const nextVersion = ((verRows as unknown as any[])[0]?.max_ver || 0) + 1;

  // T1.1.3: Serialize full package data
  const packageData = JSON.stringify({
    title: pkg.title,
    status: pkg.status,
    jurisdiction: pkg.jurisdiction,
    reformType: pkg.reform_type,
    executiveSummary: pkg.executive_summary,
    evidenceSection: pkg.evidence_section,
    rootCauseSection: pkg.root_cause_section,
    interventionHistorySection: pkg.intervention_history_section,
    recommendedReformsSection: pkg.recommended_reforms_section,
    implementationRoadmapSection: pkg.implementation_roadmap_section,
    supportingDataSection: pkg.supporting_data_section,
    submittedTo: pkg.submitted_to,
    adoptedDate: pkg.adopted_date,
  });

  // T1.1.4: Insert version record
  await db.execute(sql`
    INSERT INTO reform_package_versions (package_id, version_number, package_data, change_summary, created_at, created_by)
    VALUES (${packageId}, ${nextVersion}, ${packageData}, ${changeSummary}, ${now}, ${userId})
  `);

  return {
    id: 0,
    packageId,
    versionNumber: nextVersion,
    packageData: JSON.parse(packageData),
    changeSummary,
    createdAt: now,
    createdBy: userId,
  };
}

/**
 * T1.2: List all versions of a package.
 */
export async function listPackageVersions(packageId: string): Promise<PackageVersion[]> {
  const [rows] = await db.execute(
    sql`SELECT * FROM reform_package_versions WHERE package_id = ${packageId} ORDER BY version_number DESC`
  );
  return (rows as unknown as any[]).map(mapVersionRow);
}

/**
 * T1.3: Get a specific version.
 */
export async function getPackageVersion(packageId: string, versionNumber: number): Promise<PackageVersion | null> {
  const [rows] = await db.execute(
    sql`SELECT * FROM reform_package_versions WHERE package_id = ${packageId} AND version_number = ${versionNumber} LIMIT 1`
  );
  if (!(rows as unknown as any[]).length) return null;
  return mapVersionRow((rows as unknown as any[])[0]);
}

/**
 * T1.4: Compare two versions and return a diff summary.
 */
export async function compareVersions(
  packageId: string,
  versionA: number,
  versionB: number
): Promise<{ changes: { field: string; versionA: any; versionB: any }[] }> {
  const a = await getPackageVersion(packageId, versionA);
  const b = await getPackageVersion(packageId, versionB);
  if (!a || !b) throw new Error("One or both versions not found");

  const changes: { field: string; versionA: any; versionB: any }[] = [];
  const dataA = typeof a.packageData === "string" ? JSON.parse(a.packageData) : a.packageData;
  const dataB = typeof b.packageData === "string" ? JSON.parse(b.packageData) : b.packageData;

  const allKeys = new Set([...Object.keys(dataA), ...Object.keys(dataB)]);
  for (const key of allKeys) {
    const valA = JSON.stringify(dataA[key]);
    const valB = JSON.stringify(dataB[key]);
    if (valA !== valB) {
      changes.push({ field: key, versionA: dataA[key], versionB: dataB[key] });
    }
  }

  return { changes };
}

function mapVersionRow(r: any): PackageVersion {
  let pd = r.package_data;
  if (typeof pd === "string") { try { pd = JSON.parse(pd); } catch { /* keep string */ } }
  return {
    id: r.id,
    packageId: r.package_id,
    versionNumber: r.version_number,
    packageData: pd,
    changeSummary: r.change_summary || "",
    createdAt: Number(r.created_at),
    createdBy: r.created_by || "",
  };
}

// ── T2: Export Logging ────────────────────────────────────────────────

/**
 * T2.1: Record an export event.
 */
export async function recordExport(
  packageId: string,
  exportFormat: string,
  userId: string,
  exportUrl?: string,
  fileSize?: number
): Promise<PackageExportRecord> {
  const now = Date.now();
  const [result] = await db.execute(sql`
    INSERT INTO reform_package_exports (package_id, export_format, export_url, file_size, created_at, created_by)
    VALUES (${packageId}, ${exportFormat}, ${exportUrl || null}, ${fileSize || null}, ${now}, ${userId})
  `);
  const insertId = (result as any).insertId || 0;

  return {
    id: insertId,
    packageId,
    exportFormat,
    exportUrl: exportUrl || null,
    fileSize: fileSize || null,
    createdAt: now,
    createdBy: userId,
  };
}

/**
 * T2.2: List export history for a package.
 */
export async function listExportHistory(packageId: string): Promise<PackageExportRecord[]> {
  const [rows] = await db.execute(
    sql`SELECT * FROM reform_package_exports WHERE package_id = ${packageId} ORDER BY created_at DESC`
  );
  return (rows as unknown as any[]).map(r => ({
    id: r.id,
    packageId: r.package_id,
    exportFormat: r.export_format,
    exportUrl: r.export_url,
    fileSize: r.file_size ? Number(r.file_size) : null,
    createdAt: Number(r.created_at),
    createdBy: r.created_by || "",
  }));
}

/**
 * T2.3: Get export statistics for a package.
 */
export async function getExportStats(packageId: string): Promise<{
  totalExports: number;
  byFormat: Record<string, number>;
  lastExport: number | null;
}> {
  const [rows] = await db.execute(
    sql`SELECT export_format, COUNT(*) as cnt, MAX(created_at) as last_at
        FROM reform_package_exports WHERE package_id = ${packageId}
        GROUP BY export_format`
  );
  const byFormat: Record<string, number> = {};
  let totalExports = 0;
  let lastExport: number | null = null;
  for (const r of rows as unknown as any[]) {
    byFormat[r.export_format] = Number(r.cnt);
    totalExports += Number(r.cnt);
    const la = Number(r.last_at);
    if (!lastExport || la > lastExport) lastExport = la;
  }
  return { totalExports, byFormat, lastExport };
}

// ── T3: Strategy Memory ───────────────────────────────────────────────

/**
 * T3.1: Record a strategy action related to a reform package.
 */
export async function recordReformAction(params: {
  patternId: string;
  reformPackageId: string;
  actionType: string;
  actionData?: any;
  userId: string;
}): Promise<ReformStrategyMemoryEntry> {
  const now = Date.now();
  const actionDataStr = JSON.stringify(params.actionData || {});

  const [result] = await db.execute(sql`
    INSERT INTO reform_strategy_memory (pattern_id, reform_package_id, action_type, action_data, created_at, created_by)
    VALUES (${params.patternId}, ${params.reformPackageId}, ${params.actionType}, ${actionDataStr}, ${now}, ${params.userId})
  `);
  const insertId = (result as any).insertId || 0;

  return {
    id: insertId,
    patternId: params.patternId,
    reformPackageId: params.reformPackageId,
    actionType: params.actionType,
    actionData: params.actionData || {},
    outcomeFeedback: null,
    effectivenessScore: null,
    createdAt: now,
    createdBy: params.userId,
  };
}

/**
 * T3.2: Update outcome feedback for a strategy action.
 */
export async function updateActionOutcome(
  actionId: number,
  outcomeFeedback: string,
  effectivenessScore: number
): Promise<void> {
  await db.execute(sql`
    UPDATE reform_strategy_memory
    SET outcome_feedback = ${outcomeFeedback}, effectiveness_score = ${effectivenessScore}
    WHERE id = ${actionId}
  `);
}

/**
 * T3.3: List strategy memory for a pattern.
 */
export async function listReformStrategyMemory(patternId: string): Promise<ReformStrategyMemoryEntry[]> {
  const [rows] = await db.execute(
    sql`SELECT * FROM reform_strategy_memory WHERE pattern_id = ${patternId} ORDER BY created_at DESC`
  );
  return (rows as unknown as any[]).map(mapStrategyMemoryRow);
}

/**
 * T3.4: List strategy memory for a specific reform package.
 */
export async function listPackageStrategyMemory(reformPackageId: string): Promise<ReformStrategyMemoryEntry[]> {
  const [rows] = await db.execute(
    sql`SELECT * FROM reform_strategy_memory WHERE reform_package_id = ${reformPackageId} ORDER BY created_at DESC`
  );
  return (rows as unknown as any[]).map(mapStrategyMemoryRow);
}

/**
 * T3.5: Get strategy effectiveness summary for a pattern.
 */
export async function getStrategyEffectivenessSummary(patternId: string): Promise<{
  totalActions: number;
  byActionType: Record<string, { count: number; avgEffectiveness: number | null }>;
  mostEffectiveAction: string | null;
  recentActions: ReformStrategyMemoryEntry[];
}> {
  const [rows] = await db.execute(
    sql`SELECT action_type, COUNT(*) as cnt, AVG(effectiveness_score) as avg_eff
        FROM reform_strategy_memory WHERE pattern_id = ${patternId}
        GROUP BY action_type`
  );

  const byActionType: Record<string, { count: number; avgEffectiveness: number | null }> = {};
  let totalActions = 0;
  let bestType: string | null = null;
  let bestScore = -1;

  for (const r of rows as unknown as any[]) {
    const cnt = Number(r.cnt);
    const avgEff = r.avg_eff !== null ? Number(r.avg_eff) : null;
    byActionType[r.action_type] = { count: cnt, avgEffectiveness: avgEff };
    totalActions += cnt;
    if (avgEff !== null && avgEff > bestScore) {
      bestScore = avgEff;
      bestType = r.action_type;
    }
  }

  const recent = await listReformStrategyMemory(patternId);

  return {
    totalActions,
    byActionType,
    mostEffectiveAction: bestType,
    recentActions: recent.slice(0, 10),
  };
}

function mapStrategyMemoryRow(r: any): ReformStrategyMemoryEntry {
  let ad = r.action_data;
  if (typeof ad === "string") { try { ad = JSON.parse(ad); } catch { /* keep string */ } }
  return {
    id: r.id,
    patternId: r.pattern_id || "",
    reformPackageId: r.reform_package_id || "",
    actionType: r.action_type || "",
    actionData: ad,
    outcomeFeedback: r.outcome_feedback,
    effectivenessScore: r.effectiveness_score !== null ? Number(r.effectiveness_score) : null,
    createdAt: Number(r.created_at),
    createdBy: r.created_by || "",
  };
}

// ── T4: Enhanced Generate with Version Tracking ───────────────────────

/**
 * T4.1: Regenerate a reform package, creating a version snapshot of the old one first.
 */
export async function regenerateReformPackage(
  packageId: string,
  userId: string
): Promise<{ versionCreated: PackageVersion; newPackageId: string }> {
  // T4.1.1: Get current package to find its patternId
  const [rows] = await db.execute(
    sql`SELECT * FROM reform_packages WHERE package_id = ${packageId} LIMIT 1`
  );
  const pkg = (rows as unknown as any[])[0];
  if (!pkg) throw new Error(`Package not found: ${packageId}`);

  // T4.1.2: Snapshot current state
  const version = await snapshotPackageVersion(packageId, "Pre-regeneration snapshot", userId);

  // T4.1.3: Record the regeneration action in strategy memory
  await recordReformAction({
    patternId: pkg.pattern_id,
    reformPackageId: packageId,
    actionType: "regenerate_package",
    actionData: { previousVersion: version.versionNumber, reason: "User-initiated regeneration" },
    userId,
  });

  // T4.1.4: Import and call the generate function (creates a new package)
  const { generateReformPackage } = await import("./reform-package-export-service");
  const newPkg = await generateReformPackage(pkg.pattern_id);

  return { versionCreated: version, newPackageId: newPkg.packageId };
}

// ── T5: Export with Logging ───────────────────────────────────────────

/**
 * T5.1: Export a reform package and log the export event.
 */
export async function exportWithLogging(
  packageId: string,
  format: "markdown" | "html" | "json",
  userId: string
): Promise<{ content: string; mimeType: string; filename: string }> {
  const { exportReformPackage } = await import("./reform-package-export-service");
  const result = await exportReformPackage(packageId, format);

  // Record the export
  await recordExport(packageId, format, userId, undefined, result.content.length);

  // Record in strategy memory
  const [rows] = await db.execute(
    sql`SELECT pattern_id FROM reform_packages WHERE package_id = ${packageId} LIMIT 1`
  );
  const pkg = (rows as unknown as any[])[0];
  if (pkg) {
    await recordReformAction({
      patternId: pkg.pattern_id,
      reformPackageId: packageId,
      actionType: "export_package",
      actionData: { format, fileSize: result.content.length },
      userId,
    });
  }

  return result;
}

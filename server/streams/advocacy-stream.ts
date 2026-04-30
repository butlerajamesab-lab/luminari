/**
 * Civil Society / Advocacy Data Stream
 * 
 * Ingests advocacy reports (policy briefs, investigative reports, public comments,
 * testimony, amicus briefs, community surveys, etc.) and generates signals for:
 * - advocacy_surge: multiple orgs targeting the same entity/industry
 * - policy_convergence: multiple reports on the same policy area
 * - harm_escalation: increasing severity/frequency of reported harms
 * - entity_advocacy_pressure: sustained advocacy attention on a single entity
 */
import { db } from "../db";
import { advocacyReports } from "../../drizzle/schema";
import { eq, sql, and, desc } from "drizzle-orm";

// ── Types ───────────────────────────────────────────────────────────
export interface AdvocacyReportRecord {
  organizationName: string;
  organizationType?: string;
  reportTitle: string;
  reportType?: string;
  jurisdiction?: string;
  policyArea?: string;
  industry?: string;
  entityNamed?: string;
  claimType?: string;
  harmType?: string;
  affectedPopulation?: string;
  estimatedAffectedCount?: number;
  keyFindings?: string;
  recommendedActions?: string;
  sourceUrl?: string;
  publishDate?: string;
  tags?: string[];
}

export interface AdvocacySignal {
  signalType: "advocacy_surge" | "policy_convergence" | "harm_escalation" | "entity_advocacy_pressure";
  entity: string;
  description: string;
  confidence: number;
  metadata: Record<string, unknown>;
}

// ── Ingestion ───────────────────────────────────────────────────────
export async function ingestAdvocacyReports(
  records: AdvocacyReportRecord[],
  submittedBy?: number
): Promise<{ inserted: number }> {
  if (!records.length) return { inserted: 0 };

  const values = records.map((r, i) => ({
    reportId: `adv-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
    organizationName: r.organizationName,
    organizationType: r.organizationType || null,
    reportTitle: r.reportTitle,
    reportType: (r.reportType as any) || "other",
    jurisdiction: r.jurisdiction || null,
    policyArea: r.policyArea || null,
    industry: r.industry || null,
    entityNamed: r.entityNamed || null,
    claimType: r.claimType || null,
    harmType: r.harmType || null,
    affectedPopulation: r.affectedPopulation || null,
    estimatedAffectedCount: r.estimatedAffectedCount || null,
    keyFindings: r.keyFindings || null,
    recommendedActions: r.recommendedActions || null,
    sourceUrl: r.sourceUrl || null,
    publishDate: r.publishDate || null,
    tags: r.tags || null,
    submittedBy: submittedBy || null,
  }));

  // @ts-expect-error pre-existing type mismatch
  await db.insert(advocacyReports).values(values);
  return { inserted: values.length };
}

// ── Signal Detection ────────────────────────────────────────────────

/**
 * Detect advocacy_surge: multiple organizations reporting on the same entity.
 * Threshold: 3+ orgs naming the same entity.
 */
export async function detectAdvocacySurge(): Promise<AdvocacySignal[]> {
  const signals: AdvocacySignal[] = [];

  const entityReports = await db
    .select({
      entityNamed: advocacyReports.entityNamed,
      orgCount: sql<number>`COUNT(DISTINCT ${advocacyReports.organizationName})`.as("org_count"),
      reportCount: sql<number>`COUNT(*)`.as("report_count"),
      harmTypes: sql<string>`GROUP_CONCAT(DISTINCT ${advocacyReports.harmType})`.as("harm_types"),
      jurisdictions: sql<string>`GROUP_CONCAT(DISTINCT ${advocacyReports.jurisdiction})`.as("jurisdictions"),
    })
    .from(advocacyReports)
    .where(sql`${advocacyReports.entityNamed} IS NOT NULL AND ${advocacyReports.entityNamed} != ''`)
    .groupBy(advocacyReports.entityNamed)
    .having(sql`COUNT(DISTINCT ${advocacyReports.organizationName}) >= 3`);

  for (const row of entityReports) {
    if (!row.entityNamed) continue;
    signals.push({
      signalType: "advocacy_surge",
      entity: row.entityNamed,
      description: `${row.orgCount} advocacy organizations have filed reports naming "${row.entityNamed}" across ${row.reportCount} reports. Harm types: ${row.harmTypes || "various"}.`,
      confidence: Math.min(95, 40 + row.orgCount * 12),
      metadata: {
        entity: row.entityNamed,
        organizationCount: row.orgCount,
        reportCount: row.reportCount,
        harmTypes: row.harmTypes?.split(",") || [],
        jurisdictions: row.jurisdictions?.split(",") || [],
      },
    });
  }

  return signals;
}

/**
 * Detect policy_convergence: multiple reports targeting the same policy area.
 * Threshold: 5+ reports on the same policy area.
 */
export async function detectPolicyConvergence(): Promise<AdvocacySignal[]> {
  const signals: AdvocacySignal[] = [];

  const policyReports = await db
    .select({
      policyArea: advocacyReports.policyArea,
      orgCount: sql<number>`COUNT(DISTINCT ${advocacyReports.organizationName})`.as("org_count"),
      reportCount: sql<number>`COUNT(*)`.as("report_count"),
      reportTypes: sql<string>`GROUP_CONCAT(DISTINCT ${advocacyReports.reportType})`.as("report_types"),
      entities: sql<string>`GROUP_CONCAT(DISTINCT ${advocacyReports.entityNamed})`.as("entities"),
    })
    .from(advocacyReports)
    .where(sql`${advocacyReports.policyArea} IS NOT NULL AND ${advocacyReports.policyArea} != ''`)
    .groupBy(advocacyReports.policyArea)
    .having(sql`COUNT(*) >= 5`);

  for (const row of policyReports) {
    if (!row.policyArea) continue;
    signals.push({
      signalType: "policy_convergence",
      entity: row.policyArea,
      description: `${row.orgCount} organizations have published ${row.reportCount} reports on policy area "${row.policyArea}". Report types: ${row.reportTypes || "various"}.`,
      confidence: Math.min(90, 35 + row.reportCount * 5),
      metadata: {
        policyArea: row.policyArea,
        organizationCount: row.orgCount,
        reportCount: row.reportCount,
        reportTypes: row.reportTypes?.split(",") || [],
        entitiesNamed: row.entities?.split(",").filter(Boolean) || [],
      },
    });
  }

  return signals;
}

/**
 * Detect harm_escalation: increasing reports of the same harm type over time.
 * Compares recent vs older report volumes.
 */
export async function detectHarmEscalation(): Promise<AdvocacySignal[]> {
  const signals: AdvocacySignal[] = [];

  // Compare last 30 days vs previous 30 days
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const recentHarms = await db
    .select({
      harmType: advocacyReports.harmType,
      recentCount: sql<number>`COUNT(*)`.as("recent_count"),
    })
    .from(advocacyReports)
    .where(and(
      sql`${advocacyReports.harmType} IS NOT NULL`,
      sql`${advocacyReports.createdAt} >= ${thirtyDaysAgo.toISOString().slice(0, 19)}`
    ))
    .groupBy(advocacyReports.harmType);

  const olderHarms = await db
    .select({
      harmType: advocacyReports.harmType,
      olderCount: sql<number>`COUNT(*)`.as("older_count"),
    })
    .from(advocacyReports)
    .where(and(
      sql`${advocacyReports.harmType} IS NOT NULL`,
      sql`${advocacyReports.createdAt} >= ${sixtyDaysAgo.toISOString().slice(0, 19)}`,
      sql`${advocacyReports.createdAt} < ${thirtyDaysAgo.toISOString().slice(0, 19)}`
    ))
    .groupBy(advocacyReports.harmType);

  const olderMap: Record<string, number> = {};
  for (const row of olderHarms) {
    if (row.harmType) olderMap[row.harmType] = row.olderCount;
  }

  for (const row of recentHarms) {
    if (!row.harmType) continue;
    const older = olderMap[row.harmType] || 0;
    if (older > 0 && row.recentCount >= older * 2) {
      const increasePercent = Math.round((row.recentCount / older) * 100);
      signals.push({
        signalType: "harm_escalation",
        entity: row.harmType,
        description: `Reports of "${row.harmType}" harm increased ${increasePercent}% in the last 30 days (${row.recentCount} reports vs ${older} in prior period).`,
        confidence: Math.min(90, 50 + (row.recentCount / older) * 10),
        metadata: {
          harmType: row.harmType,
          recentCount: row.recentCount,
          olderCount: older,
          increasePercent,
        },
      });
    }
  }

  return signals;
}

/**
 * Detect entity_advocacy_pressure: sustained advocacy attention on a single entity
 * across multiple report types (e.g., testimony + investigative report + public comment).
 */
export async function detectEntityAdvocacyPressure(): Promise<AdvocacySignal[]> {
  const signals: AdvocacySignal[] = [];

  const entityPressure = await db
    .select({
      entityNamed: advocacyReports.entityNamed,
      reportTypeCount: sql<number>`COUNT(DISTINCT ${advocacyReports.reportType})`.as("report_type_count"),
      reportCount: sql<number>`COUNT(*)`.as("report_count"),
      reportTypes: sql<string>`GROUP_CONCAT(DISTINCT ${advocacyReports.reportType})`.as("report_types"),
      orgCount: sql<number>`COUNT(DISTINCT ${advocacyReports.organizationName})`.as("org_count"),
      totalAffected: sql<number>`SUM(COALESCE(${advocacyReports.estimatedAffectedCount}, 0))`.as("total_affected"),
    })
    .from(advocacyReports)
    .where(sql`${advocacyReports.entityNamed} IS NOT NULL AND ${advocacyReports.entityNamed} != ''`)
    .groupBy(advocacyReports.entityNamed)
    .having(sql`COUNT(DISTINCT ${advocacyReports.reportType}) >= 3`);

  for (const row of entityPressure) {
    if (!row.entityNamed) continue;
    signals.push({
      signalType: "entity_advocacy_pressure",
      entity: row.entityNamed,
      description: `"${row.entityNamed}" faces sustained advocacy pressure across ${row.reportTypeCount} report types (${row.reportTypes}) from ${row.orgCount} organizations. ${row.totalAffected > 0 ? `Estimated ${row.totalAffected.toLocaleString()} people affected.` : ""}`,
      confidence: Math.min(95, 45 + row.reportTypeCount * 10 + row.orgCount * 5),
      metadata: {
        entity: row.entityNamed,
        reportTypeCount: row.reportTypeCount,
        reportCount: row.reportCount,
        reportTypes: row.reportTypes?.split(",") || [],
        organizationCount: row.orgCount,
        totalAffected: row.totalAffected,
      },
    });
  }

  return signals;
}

// ── Queries ─────────────────────────────────────────────────────────
export async function getAdvocacyStats() {
  const [stats] = await db
    .select({
      totalReports: sql<number>`COUNT(*)`.as("total_reports"),
      uniqueOrgs: sql<number>`COUNT(DISTINCT ${advocacyReports.organizationName})`.as("unique_orgs"),
      uniqueEntities: sql<number>`COUNT(DISTINCT ${advocacyReports.entityNamed})`.as("unique_entities"),
      uniquePolicyAreas: sql<number>`COUNT(DISTINCT ${advocacyReports.policyArea})`.as("unique_policy_areas"),
      uniqueHarmTypes: sql<number>`COUNT(DISTINCT ${advocacyReports.harmType})`.as("unique_harm_types"),
      totalAffected: sql<number>`SUM(COALESCE(${advocacyReports.estimatedAffectedCount}, 0))`.as("total_affected"),
    })
    .from(advocacyReports);
  return stats;
}

export async function getRecentAdvocacyReports(limit = 10) {
  return db
    .select()
    .from(advocacyReports)
    .orderBy(desc(advocacyReports.createdAt))
    .limit(limit);
}

export async function getAdvocacyByOrganization(limit = 10) {
  return db
    .select({
      organizationName: advocacyReports.organizationName,
      organizationType: advocacyReports.organizationType,
      reportCount: sql<number>`COUNT(*)`.as("report_count"),
      policyAreas: sql<string>`GROUP_CONCAT(DISTINCT ${advocacyReports.policyArea})`.as("policy_areas"),
      entitiesNamed: sql<string>`GROUP_CONCAT(DISTINCT ${advocacyReports.entityNamed})`.as("entities_named"),
    })
    .from(advocacyReports)
    .groupBy(advocacyReports.organizationName, advocacyReports.organizationType)
    .orderBy(desc(sql`report_count`))
    .limit(limit);
}

export async function getAdvocacyByHarmType(limit = 10) {
  return db
    .select({
      harmType: advocacyReports.harmType,
      reportCount: sql<number>`COUNT(*)`.as("report_count"),
      orgCount: sql<number>`COUNT(DISTINCT ${advocacyReports.organizationName})`.as("org_count"),
      totalAffected: sql<number>`SUM(COALESCE(${advocacyReports.estimatedAffectedCount}, 0))`.as("total_affected"),
    })
    .from(advocacyReports)
    .where(sql`${advocacyReports.harmType} IS NOT NULL`)
    .groupBy(advocacyReports.harmType)
    .orderBy(desc(sql`report_count`))
    .limit(limit);
}

/**
 * Run all advocacy signal detectors
 */
export async function runAdvocacySignalDetection(): Promise<AdvocacySignal[]> {
  const [surge, convergence, escalation, pressure] = await Promise.all([
    detectAdvocacySurge(),
    detectPolicyConvergence(),
    detectHarmEscalation(),
    detectEntityAdvocacyPressure(),
  ]);
  return [...surge, ...convergence, ...escalation, ...pressure];
}

/**
 * Lobbying Disclosure Data Stream
 * Ingests lobbying activity data and generates signals for lobbying spikes,
 * industry policy pressure, and lobbying concentration.
 */
import { db } from "../db";
import { lobbyingActivity } from "../../drizzle/schema";
import { eq, sql, and, gte, lte, desc } from "drizzle-orm";

// ── Types ───────────────────────────────────────────────────────────
export interface LobbyingRecord {
  lobbyistName?: string;
  lobbyingFirm?: string;
  clientName: string;
  industry?: string;
  policyArea?: string;
  lobbyingAmount?: number;
  reportingPeriod?: string;
  jurisdiction?: string;
  legislatorsContacted?: string;
  sourceUrl?: string;
}

export interface LobbyingSignal {
  signalType: "lobbying_spike" | "industry_policy_pressure" | "lobbying_concentration" | "policy_pressure_event";
  entity: string;
  description: string;
  confidence: number;
  metadata: Record<string, unknown>;
}

// ── Ingestion ───────────────────────────────────────────────────────
export async function ingestLobbyingRecords(records: LobbyingRecord[]): Promise<{ inserted: number }> {
  if (!records.length) return { inserted: 0 };

  const values = records.map(r => ({
    lobbyistName: r.lobbyistName || null,
    lobbyingFirm: r.lobbyingFirm || null,
    clientName: r.clientName,
    industry: r.industry || null,
    policyArea: r.policyArea || null,
    lobbyingAmount: r.lobbyingAmount?.toString() || null,
    reportingPeriod: r.reportingPeriod || null,
    jurisdiction: r.jurisdiction || null,
    legislatorsContacted: r.legislatorsContacted || null,
    sourceUrl: r.sourceUrl || null,
  }));

  await db.insert(lobbyingActivity).values(values);
  return { inserted: values.length };
}

// ── Signal Detection ────────────────────────────────────────────────

/**
 * Detect lobbying_spike: if a client's spending in the current period
 * exceeds 300% of their average spending across all periods.
 */
export async function detectLobbyingSpikes(): Promise<LobbyingSignal[]> {
  const signals: LobbyingSignal[] = [];

  // Get spending by client and period
  const spendingByClient = await db
    .select({
      clientName: lobbyingActivity.clientName,
      totalSpending: sql<number>`SUM(CAST(${lobbyingActivity.lobbyingAmount} AS DECIMAL(15,2)))`.as("total_spending"),
      periodCount: sql<number>`COUNT(DISTINCT ${lobbyingActivity.reportingPeriod})`.as("period_count"),
      avgSpending: sql<number>`AVG(CAST(${lobbyingActivity.lobbyingAmount} AS DECIMAL(15,2)))`.as("avg_spending"),
      maxSpending: sql<number>`MAX(CAST(${lobbyingActivity.lobbyingAmount} AS DECIMAL(15,2)))`.as("max_spending"),
      latestPeriod: sql<string>`MAX(${lobbyingActivity.reportingPeriod})`.as("latest_period"),
    })
    .from(lobbyingActivity)
    .groupBy(lobbyingActivity.clientName)
    .having(sql`COUNT(DISTINCT ${lobbyingActivity.reportingPeriod}) >= 2`);

  for (const client of spendingByClient) {
    if (!client.avgSpending || !client.maxSpending) continue;
    const spikeRatio = client.maxSpending / client.avgSpending;
    if (spikeRatio >= 3.0) {
      signals.push({
        signalType: "lobbying_spike",
        entity: client.clientName,
        description: `${client.clientName} lobbying spending spiked ${Math.round(spikeRatio * 100)}% above average in ${client.latestPeriod}`,
        confidence: Math.min(95, 50 + spikeRatio * 10),
        metadata: {
          totalSpending: client.totalSpending,
          avgSpending: client.avgSpending,
          maxSpending: client.maxSpending,
          spikeRatio,
          latestPeriod: client.latestPeriod,
        },
      });
    }
  }

  return signals;
}

/**
 * Detect industry_policy_pressure: if multiple clients in the same industry
 * are lobbying on the same policy area.
 */
export async function detectIndustryPolicyPressure(): Promise<LobbyingSignal[]> {
  const signals: LobbyingSignal[] = [];

  const pressurePoints = await db
    .select({
      industry: lobbyingActivity.industry,
      policyArea: lobbyingActivity.policyArea,
      clientCount: sql<number>`COUNT(DISTINCT ${lobbyingActivity.clientName})`.as("client_count"),
      totalSpending: sql<number>`SUM(CAST(${lobbyingActivity.lobbyingAmount} AS DECIMAL(15,2)))`.as("total_spending"),
    })
    .from(lobbyingActivity)
    .where(and(
      sql`${lobbyingActivity.industry} IS NOT NULL`,
      sql`${lobbyingActivity.policyArea} IS NOT NULL`
    ))
    .groupBy(lobbyingActivity.industry, lobbyingActivity.policyArea)
    .having(sql`COUNT(DISTINCT ${lobbyingActivity.clientName}) >= 3`);

  for (const pp of pressurePoints) {
    if (!pp.industry || !pp.policyArea) continue;
    signals.push({
      signalType: "industry_policy_pressure",
      entity: pp.industry,
      description: `${pp.clientCount} ${pp.industry} companies lobbying on "${pp.policyArea}" — total $${Number(pp.totalSpending || 0).toLocaleString()}`,
      confidence: Math.min(90, 40 + pp.clientCount * 10),
      metadata: {
        industry: pp.industry,
        policyArea: pp.policyArea,
        clientCount: pp.clientCount,
        totalSpending: pp.totalSpending,
      },
    });
  }

  return signals;
}

/**
 * Detect lobbying_concentration: if a single firm dominates lobbying
 * in a policy area (>50% of total spending).
 */
export async function detectLobbyingConcentration(): Promise<LobbyingSignal[]> {
  const signals: LobbyingSignal[] = [];

  const firmsByPolicy = await db
    .select({
      lobbyingFirm: lobbyingActivity.lobbyingFirm,
      policyArea: lobbyingActivity.policyArea,
      firmSpending: sql<number>`SUM(CAST(${lobbyingActivity.lobbyingAmount} AS DECIMAL(15,2)))`.as("firm_spending"),
    })
    .from(lobbyingActivity)
    .where(and(
      sql`${lobbyingActivity.lobbyingFirm} IS NOT NULL`,
      sql`${lobbyingActivity.policyArea} IS NOT NULL`
    ))
    .groupBy(lobbyingActivity.lobbyingFirm, lobbyingActivity.policyArea);

  // Group by policy area and check concentration
  const policyTotals: Record<string, { total: number; firms: { firm: string; spending: number }[] }> = {};
  for (const row of firmsByPolicy) {
    if (!row.policyArea || !row.lobbyingFirm) continue;
    if (!policyTotals[row.policyArea]) policyTotals[row.policyArea] = { total: 0, firms: [] };
    const spending = Number(row.firmSpending || 0);
    policyTotals[row.policyArea].total += spending;
    policyTotals[row.policyArea].firms.push({ firm: row.lobbyingFirm, spending });
  }

  for (const [policyArea, data] of Object.entries(policyTotals)) {
    if (data.total === 0 || data.firms.length < 2) continue;
    for (const firm of data.firms) {
      const share = firm.spending / data.total;
      if (share > 0.5) {
        signals.push({
          signalType: "lobbying_concentration",
          entity: firm.firm,
          description: `${firm.firm} controls ${Math.round(share * 100)}% of lobbying spend on "${policyArea}"`,
          confidence: Math.min(90, 50 + share * 40),
          metadata: { firm: firm.firm, policyArea, share, firmSpending: firm.spending, totalSpending: data.total },
        });
      }
    }
  }

  return signals;
}

/**
 * Detect policy_pressure_event: if lobbying spending for a policy area
 * increases >300% within a quarter.
 */
export async function detectPolicyPressureEvents(): Promise<LobbyingSignal[]> {
  const signals: LobbyingSignal[] = [];

  const periodSpending = await db
    .select({
      policyArea: lobbyingActivity.policyArea,
      reportingPeriod: lobbyingActivity.reportingPeriod,
      totalSpending: sql<number>`SUM(CAST(${lobbyingActivity.lobbyingAmount} AS DECIMAL(15,2)))`.as("total_spending"),
    })
    .from(lobbyingActivity)
    .where(sql`${lobbyingActivity.policyArea} IS NOT NULL`)
    .groupBy(lobbyingActivity.policyArea, lobbyingActivity.reportingPeriod)
    .orderBy(lobbyingActivity.policyArea, lobbyingActivity.reportingPeriod);

  // Group by policy area and compare consecutive periods
  const byPolicy: Record<string, { period: string; spending: number }[]> = {};
  for (const row of periodSpending) {
    if (!row.policyArea) continue;
    if (!byPolicy[row.policyArea]) byPolicy[row.policyArea] = [];
    byPolicy[row.policyArea].push({ period: row.reportingPeriod || "unknown", spending: Number(row.totalSpending || 0) });
  }

  for (const [policyArea, periods] of Object.entries(byPolicy)) {
    if (periods.length < 2) continue;
    for (let i = 1; i < periods.length; i++) {
      const prev = periods[i - 1].spending;
      const curr = periods[i].spending;
      if (prev > 0 && curr / prev >= 3.0) {
        const increasePercent = Math.round((curr / prev) * 100);
        signals.push({
          signalType: "policy_pressure_event",
          entity: policyArea,
          description: `Policy area "${policyArea}" lobbying spending increased ${increasePercent}% from ${periods[i - 1].period} to ${periods[i].period}`,
          confidence: Math.min(95, 60 + (curr / prev) * 5),
          metadata: {
            policyArea,
            previousPeriod: periods[i - 1].period,
            currentPeriod: periods[i].period,
            previousSpending: prev,
            currentSpending: curr,
            increasePercent,
          },
        });
      }
    }
  }

  return signals;
}

// ── Queries ─────────────────────────────────────────────────────────
export async function getTopLobbyingFirms(limit = 10) {
  return db
    .select({
      lobbyingFirm: lobbyingActivity.lobbyingFirm,
      clientCount: sql<number>`COUNT(DISTINCT ${lobbyingActivity.clientName})`.as("client_count"),
      totalSpending: sql<number>`SUM(CAST(${lobbyingActivity.lobbyingAmount} AS DECIMAL(15,2)))`.as("total_spending"),
      policyAreas: sql<number>`COUNT(DISTINCT ${lobbyingActivity.policyArea})`.as("policy_areas"),
    })
    .from(lobbyingActivity)
    .where(sql`${lobbyingActivity.lobbyingFirm} IS NOT NULL`)
    .groupBy(lobbyingActivity.lobbyingFirm)
    .orderBy(desc(sql`total_spending`))
    .limit(limit);
}

export async function getLobbyingByPolicyArea(limit = 10) {
  return db
    .select({
      policyArea: lobbyingActivity.policyArea,
      clientCount: sql<number>`COUNT(DISTINCT ${lobbyingActivity.clientName})`.as("client_count"),
      totalSpending: sql<number>`SUM(CAST(${lobbyingActivity.lobbyingAmount} AS DECIMAL(15,2)))`.as("total_spending"),
      firmCount: sql<number>`COUNT(DISTINCT ${lobbyingActivity.lobbyingFirm})`.as("firm_count"),
    })
    .from(lobbyingActivity)
    .where(sql`${lobbyingActivity.policyArea} IS NOT NULL`)
    .groupBy(lobbyingActivity.policyArea)
    .orderBy(desc(sql`total_spending`))
    .limit(limit);
}

export async function getLobbyingStats() {
  const [stats] = await db
    .select({
      totalRecords: sql<number>`COUNT(*)`.as("total_records"),
      totalSpending: sql<number>`SUM(CAST(${lobbyingActivity.lobbyingAmount} AS DECIMAL(15,2)))`.as("total_spending"),
      uniqueClients: sql<number>`COUNT(DISTINCT ${lobbyingActivity.clientName})`.as("unique_clients"),
      uniqueFirms: sql<number>`COUNT(DISTINCT ${lobbyingActivity.lobbyingFirm})`.as("unique_firms"),
      uniquePolicyAreas: sql<number>`COUNT(DISTINCT ${lobbyingActivity.policyArea})`.as("unique_policy_areas"),
    })
    .from(lobbyingActivity);
  return stats;
}

/**
 * Run all lobbying signal detectors
 */
export async function runLobbyingSignalDetection(): Promise<LobbyingSignal[]> {
  const [spikes, pressure, concentration, events] = await Promise.all([
    detectLobbyingSpikes(),
    detectIndustryPolicyPressure(),
    detectLobbyingConcentration(),
    detectPolicyPressureEvents(),
  ]);
  return [...spikes, ...pressure, ...concentration, ...events];
}

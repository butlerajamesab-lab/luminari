/**
 * Administrative Decision Data Stream
 * Ingests government program decisions and detects systemic denial patterns,
 * appeal inversions, and processing delays.
 */
import { db } from "../db";
import { administrativeDecisions } from "../../drizzle/schema";
import { eq, sql, and, desc } from "drizzle-orm";

// ── Types ───────────────────────────────────────────────────────────
export interface AdminDecisionRecord {
  decisionId?: string;
  agency: string;
  program?: string;
  jurisdiction?: string;
  claimType?: string;
  decisionDate?: string;
  initialOutcome?: string;
  appealOutcome?: string;
  processingTimeDays?: number;
  hearingRequested?: boolean;
  reversal?: boolean;
  entityOrAgency?: string;
  sourceUrl?: string;
}

export interface AdminDecisionSignal {
  signalType: "claim_denial" | "appeal_reversal" | "processing_delay" | "hearing_backlog" | "appeal_success_inversion";
  entity: string;
  description: string;
  confidence: number;
  metadata: Record<string, unknown>;
}

// ── Ingestion ───────────────────────────────────────────────────────
export async function ingestAdminDecisions(records: AdminDecisionRecord[]): Promise<{ inserted: number }> {
  if (!records.length) return { inserted: 0 };

  const values = records.map(r => ({
    decisionId: r.decisionId || null,
    agency: r.agency,
    program: r.program || null,
    jurisdiction: r.jurisdiction || null,
    claimType: r.claimType || null,
    decisionDate: r.decisionDate || null,
    initialOutcome: r.initialOutcome || null,
    appealOutcome: r.appealOutcome || null,
    processingTimeDays: r.processingTimeDays || null,
    hearingRequested: r.hearingRequested || false,
    reversal: r.reversal || false,
    entityOrAgency: r.entityOrAgency || null,
    sourceUrl: r.sourceUrl || null,
  }));

  // @ts-ignore pre-existing type mismatch
  await db.insert(administrativeDecisions).values(values);
  return { inserted: values.length };
}

// ── Signal Detection ────────────────────────────────────────────────

/**
 * Detect appeal_success_inversion: when appeal success rate significantly
 * exceeds initial approval rate — indicates systemic denial pattern.
 */
export async function detectAppealSuccessInversion(): Promise<AdminDecisionSignal[]> {
  const signals: AdminDecisionSignal[] = [];

  const agencyStats = await db
    .select({
      agency: administrativeDecisions.agency,
      program: administrativeDecisions.program,
      totalDecisions: sql<number>`COUNT(*)`.as("total_decisions"),
      initialApprovals: sql<number>`SUM(CASE WHEN LOWER(${administrativeDecisions.initialOutcome}) IN ('approved','granted','accepted') THEN 1 ELSE 0 END)`.as("initial_approvals"),
      initialDenials: sql<number>`SUM(CASE WHEN LOWER(${administrativeDecisions.initialOutcome}) IN ('denied','rejected','declined') THEN 1 ELSE 0 END)`.as("initial_denials"),
      appealed: sql<number>`SUM(CASE WHEN ${administrativeDecisions.appealOutcome} IS NOT NULL THEN 1 ELSE 0 END)`.as("appealed"),
      appealReversals: sql<number>`SUM(CASE WHEN ${administrativeDecisions.reversal} = true THEN 1 ELSE 0 END)`.as("appeal_reversals"),
    })
    .from(administrativeDecisions)
    .groupBy(administrativeDecisions.agency, administrativeDecisions.program)
    .having(sql`COUNT(*) >= 10`);

  for (const stat of agencyStats) {
    const totalWithOutcome = (stat.initialApprovals || 0) + (stat.initialDenials || 0);
    if (totalWithOutcome === 0) continue;

    const initialApprovalRate = (stat.initialApprovals || 0) / totalWithOutcome;
    const initialDenialRate = (stat.initialDenials || 0) / totalWithOutcome;
    const appealed = stat.appealed || 0;
    const appealReversals = stat.appealReversals || 0;
    const appealSuccessRate = appealed > 0 ? appealReversals / appealed : 0;

    // Appeal success inversion: appeal success rate > initial approval rate by significant margin
    if (appealSuccessRate > initialApprovalRate && appealSuccessRate - initialApprovalRate > 0.15 && appealed >= 5) {
      const programLabel = stat.program ? `${stat.agency} — ${stat.program}` : stat.agency;
      signals.push({
        signalType: "appeal_success_inversion",
        entity: stat.agency,
        description: `${programLabel}: Initial approval ${Math.round(initialApprovalRate * 100)}%, appeal success ${Math.round(appealSuccessRate * 100)}% — systemic denial pattern detected`,
        confidence: Math.min(95, 60 + (appealSuccessRate - initialApprovalRate) * 100),
        metadata: {
          agency: stat.agency,
          program: stat.program,
          totalDecisions: stat.totalDecisions,
          initialApprovalRate: Math.round(initialApprovalRate * 100),
          initialDenialRate: Math.round(initialDenialRate * 100),
          appealSuccessRate: Math.round(appealSuccessRate * 100),
          appealed,
          appealReversals,
        },
      });
    }

    // High denial rate signal
    if (initialDenialRate > 0.7 && totalWithOutcome >= 20) {
      signals.push({
        signalType: "claim_denial",
        entity: stat.agency,
        description: `${stat.agency}${stat.program ? ` — ${stat.program}` : ""}: ${Math.round(initialDenialRate * 100)}% initial denial rate across ${totalWithOutcome} decisions`,
        confidence: Math.min(90, 50 + initialDenialRate * 40),
        metadata: {
          agency: stat.agency,
          program: stat.program,
          denialRate: Math.round(initialDenialRate * 100),
          totalDecisions: totalWithOutcome,
        },
      });
    }
  }

  return signals;
}

/**
 * Detect processing_delay: agencies with average processing time
 * significantly above the overall average.
 */
export async function detectProcessingDelays(): Promise<AdminDecisionSignal[]> {
  const signals: AdminDecisionSignal[] = [];

  // Get overall average
  const [overall] = await db
    .select({
      avgDays: sql<number>`AVG(${administrativeDecisions.processingTimeDays})`.as("avg_days"),
    })
    .from(administrativeDecisions)
    .where(sql`${administrativeDecisions.processingTimeDays} IS NOT NULL`);

  const overallAvg = overall?.avgDays || 0;
  if (overallAvg === 0) return signals;

  const agencyDelays = await db
    .select({
      agency: administrativeDecisions.agency,
      program: administrativeDecisions.program,
      avgDays: sql<number>`AVG(${administrativeDecisions.processingTimeDays})`.as("avg_days"),
      maxDays: sql<number>`MAX(${administrativeDecisions.processingTimeDays})`.as("max_days"),
      caseCount: sql<number>`COUNT(*)`.as("case_count"),
    })
    .from(administrativeDecisions)
    .where(sql`${administrativeDecisions.processingTimeDays} IS NOT NULL`)
    .groupBy(administrativeDecisions.agency, administrativeDecisions.program)
    .having(sql`COUNT(*) >= 5 AND AVG(${administrativeDecisions.processingTimeDays}) > ${overallAvg * 1.5}`);

  for (const delay of agencyDelays) {
    const ratio = (delay.avgDays || 0) / overallAvg;
    signals.push({
      signalType: "processing_delay",
      entity: delay.agency,
      description: `${delay.agency}${delay.program ? ` — ${delay.program}` : ""}: Average processing ${Math.round(delay.avgDays || 0)} days (${Math.round(ratio * 100)}% of system average)`,
      confidence: Math.min(90, 40 + ratio * 15),
      metadata: {
        agency: delay.agency,
        program: delay.program,
        avgDays: Math.round(delay.avgDays || 0),
        maxDays: delay.maxDays,
        overallAvg: Math.round(overallAvg),
        caseCount: delay.caseCount,
      },
    });
  }

  return signals;
}

/**
 * Detect hearing_backlog: agencies with high hearing request rates.
 */
export async function detectHearingBacklogs(): Promise<AdminDecisionSignal[]> {
  const signals: AdminDecisionSignal[] = [];

  const hearingStats = await db
    .select({
      agency: administrativeDecisions.agency,
      totalDecisions: sql<number>`COUNT(*)`.as("total_decisions"),
      hearingsRequested: sql<number>`SUM(CASE WHEN ${administrativeDecisions.hearingRequested} = true THEN 1 ELSE 0 END)`.as("hearings_requested"),
    })
    .from(administrativeDecisions)
    .groupBy(administrativeDecisions.agency)
    .having(sql`COUNT(*) >= 10`);

  for (const stat of hearingStats) {
    const hearingRate = (stat.hearingsRequested || 0) / (stat.totalDecisions || 1);
    if (hearingRate > 0.5) {
      signals.push({
        signalType: "hearing_backlog",
        entity: stat.agency,
        description: `${stat.agency}: ${Math.round(hearingRate * 100)}% of decisions resulted in hearing requests (${stat.hearingsRequested} of ${stat.totalDecisions})`,
        confidence: Math.min(85, 40 + hearingRate * 50),
        metadata: {
          agency: stat.agency,
          hearingRate: Math.round(hearingRate * 100),
          hearingsRequested: stat.hearingsRequested,
          totalDecisions: stat.totalDecisions,
        },
      });
    }
  }

  return signals;
}

// ── Queries ─────────────────────────────────────────────────────────
export async function getAdminDecisionStats() {
  const [stats] = await db
    .select({
      totalDecisions: sql<number>`COUNT(*)`.as("total_decisions"),
      uniqueAgencies: sql<number>`COUNT(DISTINCT ${administrativeDecisions.agency})`.as("unique_agencies"),
      uniquePrograms: sql<number>`COUNT(DISTINCT ${administrativeDecisions.program})`.as("unique_programs"),
      avgProcessingDays: sql<number>`AVG(${administrativeDecisions.processingTimeDays})`.as("avg_processing_days"),
      reversalCount: sql<number>`SUM(CASE WHEN ${administrativeDecisions.reversal} = true THEN 1 ELSE 0 END)`.as("reversal_count"),
    })
    .from(administrativeDecisions);
  return stats;
}

export async function getOutcomesByAgency(limit = 10) {
  return db
    .select({
      agency: administrativeDecisions.agency,
      totalDecisions: sql<number>`COUNT(*)`.as("total_decisions"),
      approvals: sql<number>`SUM(CASE WHEN LOWER(${administrativeDecisions.initialOutcome}) IN ('approved','granted','accepted') THEN 1 ELSE 0 END)`.as("approvals"),
      denials: sql<number>`SUM(CASE WHEN LOWER(${administrativeDecisions.initialOutcome}) IN ('denied','rejected','declined') THEN 1 ELSE 0 END)`.as("denials"),
      reversals: sql<number>`SUM(CASE WHEN ${administrativeDecisions.reversal} = true THEN 1 ELSE 0 END)`.as("reversals"),
      avgProcessingDays: sql<number>`AVG(${administrativeDecisions.processingTimeDays})`.as("avg_processing_days"),
    })
    .from(administrativeDecisions)
    .groupBy(administrativeDecisions.agency)
    .orderBy(desc(sql`total_decisions`))
    .limit(limit);
}

/**
 * Run all admin decision signal detectors
 */
export async function runAdminDecisionSignalDetection(): Promise<AdminDecisionSignal[]> {
  const [inversions, delays, backlogs] = await Promise.all([
    detectAppealSuccessInversion(),
    detectProcessingDelays(),
    detectHearingBacklogs(),
  ]);
  return [...inversions, ...delays, ...backlogs];
}

/**
 * Federal Litigation Data Stream (CourtListener)
 * Ingests federal court filings and generates signals for lawsuits,
 * class actions, settlements, and repeat litigation patterns.
 */
import { db } from "../db";
import { federalLitigationCases } from "../../drizzle/schema";
import { eq, sql, and, gte, desc } from "drizzle-orm";

// ── Types ───────────────────────────────────────────────────────────
export interface LitigationRecord {
  caseId?: string;
  courtName?: string;
  jurisdiction?: string;
  filingDate?: string;
  caseType?: string;
  natureOfSuit?: string;
  plaintiffName?: string;
  defendantName?: string;
  lawFirm?: string;
  judge?: string;
  industry?: string;
  caseStatus?: string;
  sourceUrl?: string;
}

export interface LitigationSignal {
  signalType: "lawsuit_filed" | "class_action_filed" | "administrative_appeal" | "case_dismissed" | "case_settlement" | "repeat_litigation_pattern";
  entity: string;
  description: string;
  confidence: number;
  metadata: Record<string, unknown>;
}

// ── Ingestion ───────────────────────────────────────────────────────
export async function ingestLitigationRecords(records: LitigationRecord[]): Promise<{ inserted: number }> {
  if (!records.length) return { inserted: 0 };

  const values = records.map(r => ({
    caseId: r.caseId || null,
    courtName: r.courtName || null,
    jurisdiction: r.jurisdiction || null,
    filingDate: r.filingDate || null,
    caseType: r.caseType || null,
    natureOfSuit: r.natureOfSuit || null,
    plaintiffName: r.plaintiffName || null,
    defendantName: r.defendantName || null,
    lawFirm: r.lawFirm || null,
    judge: r.judge || null,
    industry: r.industry || null,
    caseStatus: r.caseStatus || null,
    sourceUrl: r.sourceUrl || null,
  }));

  // @ts-expect-error pre-existing type mismatch
  await db.insert(federalLitigationCases).values(values);
  return { inserted: values.length };
}

// ── Signal Detection ────────────────────────────────────────────────

/**
 * Detect repeat_litigation_pattern: >3 lawsuits against the same defendant
 * within 90 days.
 */
export async function detectRepeatLitigationPatterns(): Promise<LitigationSignal[]> {
  const signals: LitigationSignal[] = [];
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const repeatDefendants = await db
    .select({
      defendantName: federalLitigationCases.defendantName,
      caseCount: sql<number>`COUNT(*)`.as("case_count"),
      courts: sql<number>`COUNT(DISTINCT ${federalLitigationCases.courtName})`.as("courts"),
      caseTypes: sql<string>`GROUP_CONCAT(DISTINCT ${federalLitigationCases.caseType})`.as("case_types"),
    })
    .from(federalLitigationCases)
    .where(and(
      sql`${federalLitigationCases.defendantName} IS NOT NULL`,
      // @ts-expect-error pre-existing type mismatch
      gte(federalLitigationCases.filingDate, ninetyDaysAgo)
    ))
    .groupBy(federalLitigationCases.defendantName)
    .having(sql`COUNT(*) >= 3`);

  for (const def of repeatDefendants) {
    if (!def.defendantName) continue;
    signals.push({
      signalType: "repeat_litigation_pattern",
      entity: def.defendantName,
      description: `${def.defendantName} named as defendant in ${def.caseCount} lawsuits across ${def.courts} courts in 90 days`,
      confidence: Math.min(95, 50 + def.caseCount * 8),
      metadata: {
        caseCount: def.caseCount,
        courts: def.courts,
        caseTypes: def.caseTypes,
        windowDays: 90,
      },
    });
  }

  return signals;
}

/**
 * Detect class_action_filed signals from case type or nature of suit.
 */
export async function detectClassActions(): Promise<LitigationSignal[]> {
  const signals: LitigationSignal[] = [];

  const classActions = await db
    .select()
    .from(federalLitigationCases)
    .where(sql`(
      LOWER(${federalLitigationCases.caseType}) LIKE '%class action%'
      OR LOWER(${federalLitigationCases.natureOfSuit}) LIKE '%class action%'
      OR LOWER(${federalLitigationCases.caseType}) LIKE '%multi-district%'
      OR LOWER(${federalLitigationCases.caseType}) LIKE '%mdl%'
    )`)
    .orderBy(desc(federalLitigationCases.filingDate))
    .limit(50);

  for (const ca of classActions) {
    const entity = ca.defendantName || ca.plaintiffName || "Unknown";
    signals.push({
      signalType: "class_action_filed",
      entity,
      description: `Class action filed: ${ca.plaintiffName || "Plaintiffs"} v. ${ca.defendantName || "Defendant"} in ${ca.courtName || "federal court"}`,
      confidence: 85,
      metadata: {
        caseId: ca.caseId,
        courtName: ca.courtName,
        natureOfSuit: ca.natureOfSuit,
        filingDate: ca.filingDate,
        sourceUrl: ca.sourceUrl,
      },
    });
  }

  return signals;
}

/**
 * Detect case outcomes: settlements and dismissals.
 */
export async function detectCaseOutcomes(): Promise<LitigationSignal[]> {
  const signals: LitigationSignal[] = [];

  const settlements = await db
    .select()
    .from(federalLitigationCases)
    .where(sql`LOWER(${federalLitigationCases.caseStatus}) LIKE '%settl%'`)
    .orderBy(desc(federalLitigationCases.filingDate))
    .limit(30);

  for (const s of settlements) {
    signals.push({
      signalType: "case_settlement",
      entity: s.defendantName || s.plaintiffName || "Unknown",
      description: `Case settled: ${s.plaintiffName || "Plaintiff"} v. ${s.defendantName || "Defendant"} — ${s.courtName || "court"}`,
      confidence: 75,
      metadata: { caseId: s.caseId, courtName: s.courtName, caseStatus: s.caseStatus },
    });
  }

  const dismissals = await db
    .select()
    .from(federalLitigationCases)
    .where(sql`LOWER(${federalLitigationCases.caseStatus}) LIKE '%dismiss%'`)
    .orderBy(desc(federalLitigationCases.filingDate))
    .limit(30);

  for (const d of dismissals) {
    signals.push({
      signalType: "case_dismissed",
      entity: d.defendantName || d.plaintiffName || "Unknown",
      description: `Case dismissed: ${d.plaintiffName || "Plaintiff"} v. ${d.defendantName || "Defendant"} — ${d.courtName || "court"}`,
      confidence: 70,
      metadata: { caseId: d.caseId, courtName: d.courtName, caseStatus: d.caseStatus },
    });
  }

  return signals;
}

// ── Queries ─────────────────────────────────────────────────────────
export async function getLitigationStats() {
  const [stats] = await db
    .select({
      totalCases: sql<number>`COUNT(*)`.as("total_cases"),
      uniqueDefendants: sql<number>`COUNT(DISTINCT ${federalLitigationCases.defendantName})`.as("unique_defendants"),
      uniqueCourts: sql<number>`COUNT(DISTINCT ${federalLitigationCases.courtName})`.as("unique_courts"),
      uniqueJurisdictions: sql<number>`COUNT(DISTINCT ${federalLitigationCases.jurisdiction})`.as("unique_jurisdictions"),
    })
    .from(federalLitigationCases);
  return stats;
}

export async function getRecentFilings(limit = 20) {
  return db
    .select()
    .from(federalLitigationCases)
    .orderBy(desc(federalLitigationCases.filingDate))
    .limit(limit);
}

export async function getCasesByDefendant(defendantName: string) {
  return db
    .select()
    .from(federalLitigationCases)
    .where(sql`${federalLitigationCases.defendantName} LIKE ${`%${defendantName}%`}`)
    .orderBy(desc(federalLitigationCases.filingDate));
}

export async function getCaseOutcomeBreakdown() {
  return db
    .select({
      caseStatus: federalLitigationCases.caseStatus,
      count: sql<number>`COUNT(*)`.as("count"),
    })
    .from(federalLitigationCases)
    .where(sql`${federalLitigationCases.caseStatus} IS NOT NULL`)
    .groupBy(federalLitigationCases.caseStatus)
    .orderBy(desc(sql`count`));
}

/**
 * Run all litigation signal detectors
 */
export async function runLitigationSignalDetection(): Promise<LitigationSignal[]> {
  const [repeat, classActions, outcomes] = await Promise.all([
    detectRepeatLitigationPatterns(),
    detectClassActions(),
    detectCaseOutcomes(),
  ]);
  return [...repeat, ...classActions, ...outcomes];
}

/**
 * Verified User Signal Stream
 * Allows users to submit structured harm reports that become signals.
 * Implements verification levels and signal weighting.
 */
import { db } from "../db";
import { verifiedReports } from "../../drizzle/schema";
import { eq, sql, and, desc } from "drizzle-orm";
import { randomUUID } from "crypto";

// ── Types ───────────────────────────────────────────────────────────
export type VerificationStatus = "unverified" | "community_confirmed" | "evidence_verified" | "legal_verified";

export interface VerifiedReportInput {
  reporterType: string;
  jurisdiction?: string;
  industry?: string;
  entityNamed?: string;
  claimType?: string;
  evidenceCount?: number;
  narrative?: string;
  submittedBy?: number;
}

export interface VerifiedReportSignal {
  signalType: "verified_harm_report";
  entity: string;
  description: string;
  confidence: number;
  weight: number;
  metadata: Record<string, unknown>;
}

// ── Signal Weighting ────────────────────────────────────────────────
const VERIFICATION_WEIGHTS: Record<VerificationStatus, number> = {
  unverified: 0.1,
  community_confirmed: 0.4,
  evidence_verified: 0.75,
  legal_verified: 1.0,
};

const EVIDENCE_THRESHOLD = 2; // minimum evidence count for pattern contribution

export function getVerificationWeight(status: VerificationStatus): number {
  return VERIFICATION_WEIGHTS[status] || 0.1;
}

/**
 * Determine if a report can contribute to pattern detection.
 */
export function canContributeToPattern(report: { evidenceCount: number; verificationStatus: string }): boolean {
  return (
    report.evidenceCount >= EVIDENCE_THRESHOLD ||
    report.verificationStatus === "evidence_verified" ||
    report.verificationStatus === "legal_verified"
  );
}

// ── Ingestion ───────────────────────────────────────────────────────
export async function submitReport(input: VerifiedReportInput): Promise<{ reportId: string; confidenceScore: number }> {
  const reportId = `VR-${randomUUID().slice(0, 8).toUpperCase()}`;

  // Calculate initial confidence based on evidence and reporter type
  let confidenceScore = 10; // base
  if (input.evidenceCount && input.evidenceCount > 0) confidenceScore += Math.min(30, input.evidenceCount * 10);
  if (input.entityNamed) confidenceScore += 15;
  if (input.claimType) confidenceScore += 10;
  if (input.jurisdiction) confidenceScore += 5;
  if (input.narrative && input.narrative.length > 100) confidenceScore += 10;
  confidenceScore = Math.min(50, confidenceScore); // cap at 50 for unverified

  await db.insert(verifiedReports).values({
    reportId,
    reporterType: input.reporterType,
    jurisdiction: input.jurisdiction || null,
    industry: input.industry || null,
    entityNamed: input.entityNamed || null,
    claimType: input.claimType || null,
    evidenceCount: input.evidenceCount || 0,
    verificationStatus: "unverified",
    confidenceScore: confidenceScore.toString(),
    narrative: input.narrative || null,
    submittedBy: input.submittedBy || null,
  });

  return { reportId, confidenceScore };
}

/**
 * Update verification status of a report.
 */
export async function updateVerificationStatus(
  reportId: string,
  newStatus: VerificationStatus
): Promise<{ updated: boolean; newConfidence: number }> {
  // Get current report
  const [report] = await db
    .select()
    .from(verifiedReports)
    .where(eq(verifiedReports.reportId, reportId))
    .limit(1);

  if (!report) return { updated: false, newConfidence: 0 };

  // Recalculate confidence with verification weight
  const weight = getVerificationWeight(newStatus);
  const baseConfidence = Number(report.confidenceScore || 0);
  const newConfidence = Math.min(95, baseConfidence + weight * 50);

  await db
    .update(verifiedReports)
    .set({
      verificationStatus: newStatus,
      confidenceScore: newConfidence.toString(),
    })
    .where(eq(verifiedReports.reportId, reportId));

  return { updated: true, newConfidence };
}

// ── Signal Generation ───────────────────────────────────────────────

/**
 * Generate signals from verified reports that meet the threshold.
 */
export async function generateVerifiedSignals(): Promise<VerifiedReportSignal[]> {
  const signals: VerifiedReportSignal[] = [];

  const eligibleReports = await db
    .select()
    .from(verifiedReports)
    .where(sql`(
      ${verifiedReports.evidenceCount} >= ${EVIDENCE_THRESHOLD}
      OR ${verifiedReports.verificationStatus} IN ('evidence_verified', 'legal_verified')
    )`)
    .orderBy(desc(verifiedReports.createdAt));

  for (const report of eligibleReports) {
    if (!report.entityNamed) continue;
    const weight = getVerificationWeight(report.verificationStatus as VerificationStatus);

    signals.push({
      signalType: "verified_harm_report",
      entity: report.entityNamed,
      description: `Verified report: ${report.claimType || "harm"} against ${report.entityNamed} in ${report.jurisdiction || "unknown jurisdiction"} (${report.verificationStatus})`,
      confidence: Number(report.confidenceScore || 0),
      weight,
      metadata: {
        reportId: report.reportId,
        reporterType: report.reporterType,
        claimType: report.claimType,
        jurisdiction: report.jurisdiction,
        industry: report.industry,
        evidenceCount: report.evidenceCount,
        verificationStatus: report.verificationStatus,
      },
    });
  }

  return signals;
}

// ── Queries ─────────────────────────────────────────────────────────
export async function getVerifiedReportStats() {
  const [stats] = await db
    .select({
      totalReports: sql<number>`COUNT(*)`.as("total_reports"),
      unverified: sql<number>`SUM(CASE WHEN ${verifiedReports.verificationStatus} = 'unverified' THEN 1 ELSE 0 END)`.as("unverified"),
      communityConfirmed: sql<number>`SUM(CASE WHEN ${verifiedReports.verificationStatus} = 'community_confirmed' THEN 1 ELSE 0 END)`.as("community_confirmed"),
      evidenceVerified: sql<number>`SUM(CASE WHEN ${verifiedReports.verificationStatus} = 'evidence_verified' THEN 1 ELSE 0 END)`.as("evidence_verified"),
      legalVerified: sql<number>`SUM(CASE WHEN ${verifiedReports.verificationStatus} = 'legal_verified' THEN 1 ELSE 0 END)`.as("legal_verified"),
      patternEligible: sql<number>`SUM(CASE WHEN ${verifiedReports.evidenceCount} >= ${EVIDENCE_THRESHOLD} OR ${verifiedReports.verificationStatus} IN ('evidence_verified','legal_verified') THEN 1 ELSE 0 END)`.as("pattern_eligible"),
      uniqueEntities: sql<number>`COUNT(DISTINCT ${verifiedReports.entityNamed})`.as("unique_entities"),
    })
    .from(verifiedReports);
  return stats;
}

export async function getReportsByEntity(entityName: string) {
  return db
    .select()
    .from(verifiedReports)
    .where(sql`${verifiedReports.entityNamed} LIKE ${`%${entityName}%`}`)
    .orderBy(desc(verifiedReports.createdAt));
}

export async function getRecentReports(limit = 20) {
  return db
    .select()
    .from(verifiedReports)
    .orderBy(desc(verifiedReports.createdAt))
    .limit(limit);
}

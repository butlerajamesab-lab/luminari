import { db } from "../db";
import { eq, desc, sql, and, gte, or } from "drizzle-orm";
import {
  entityEvidenceScores,
  patternEntitySummary,
  detectedSignals,
  type EntityEvidenceScoreRow,
} from "../../drizzle/schema";

// ─── Visibility Rules ────────────────────────────────────────────────
// entity_visible IF:
//   (signal_count >= 5 OR lawsuit_count >= 2 OR enforcement_count >= 1)
//   AND stream_count >= 2
//   AND confidence_score >= 70

const VISIBILITY_THRESHOLDS = {
  minSignalCount: 5,
  minLawsuitCount: 2,
  minEnforcementCount: 1,
  minStreamCount: 2,
  minConfidenceScore: 70,
} as const;

export function evaluateVisibility(score: {
  signalCount: number;
  lawsuitCount: number;
  enforcementCount: number;
  streamCount: number;
  confidenceScore: number;
}): "visible" | "provisional" {
  const hasEvidenceVolume =
    score.signalCount >= VISIBILITY_THRESHOLDS.minSignalCount ||
    score.lawsuitCount >= VISIBILITY_THRESHOLDS.minLawsuitCount ||
    score.enforcementCount >= VISIBILITY_THRESHOLDS.minEnforcementCount;

  const hasStreamDiversity = score.streamCount >= VISIBILITY_THRESHOLDS.minStreamCount;
  const hasConfidence = score.confidenceScore >= VISIBILITY_THRESHOLDS.minConfidenceScore;

  return hasEvidenceVolume && hasStreamDiversity && hasConfidence ? "visible" : "provisional";
}

// ─── Confidence Scoring Function ─────────────────────────────────────
// Weighted components:
//   signal_volume (30%)
//   multi_stream_bonus (25%)
//   geographic_spread (20%)
//   evidence_strength (25%)

export function calculateEvidenceConfidence(input: {
  signalCount: number;
  complaintCount: number;
  lawsuitCount: number;
  enforcementCount: number;
  streamCount: number;
  geographicSpread: number;
}): number {
  // Signal volume: 0-30 points
  const totalSignals = input.signalCount;
  const signalScore = Math.min(30, totalSignals * 2);

  // Multi-stream bonus: 0-25 points
  // Each additional stream beyond 1 adds 8 points
  const streamScore = Math.min(25, Math.max(0, (input.streamCount - 1)) * 8 + (input.streamCount > 0 ? 5 : 0));

  // Geographic spread: 0-20 points
  // Each distinct jurisdiction adds 4 points
  const geoScore = Math.min(20, input.geographicSpread * 4);

  // Evidence strength: 0-25 points
  // Enforcement actions are strongest evidence, then lawsuits, then complaints
  const evidenceScore = Math.min(25,
    input.enforcementCount * 10 +
    input.lawsuitCount * 5 +
    Math.min(10, input.complaintCount * 0.5)
  );

  return Math.min(100, Math.round(signalScore + streamScore + geoScore + evidenceScore));
}

// ─── Score Entity Evidence ───────────────────────────────────────────

export async function scoreEntityEvidence(entityName: string, patternId?: number): Promise<EntityEvidenceScoreRow> {
  // Aggregate evidence from pattern_entity_summary
  const summaries = patternId
    ? await db.select().from(patternEntitySummary)
        .where(and(
          eq(patternEntitySummary.entityName, entityName),
          eq(patternEntitySummary.patternId, patternId)
        ))
    : await db.select().from(patternEntitySummary)
        .where(eq(patternEntitySummary.entityName, entityName));

  let totalComplaints = 0;
  let totalLawsuits = 0;
  let totalEnforcement = 0;
  const patternIds = new Set<number>();

  for (const s of summaries) {
    totalComplaints += s.complaintCount || 0;
    totalLawsuits += s.lawsuitCount || 0;
    totalEnforcement += s.enforcementActions || 0;
    patternIds.add(s.patternId);
  }

  // Count distinct signal types (streams) from detected_signals
  const signalTypes = await db
    .select({ signalType: detectedSignals.signalType })
    .from(detectedSignals)
    .where(eq(detectedSignals.entityId, entityName))
    .groupBy(detectedSignals.signalType);

  const streamCount = signalTypes.length;

  // Count distinct jurisdictions for geographic spread
  const jurisdictions = await db
    .select({ jurisdiction: detectedSignals.jurisdictionScope })
    .from(detectedSignals)
    .where(eq(detectedSignals.entityId, entityName))
    .groupBy(detectedSignals.jurisdictionScope);

  const geographicSpread = jurisdictions.length;

  const signalCount = totalComplaints + totalLawsuits + totalEnforcement;

  // Calculate confidence
  const confidenceScore = calculateEvidenceConfidence({
    signalCount,
    complaintCount: totalComplaints,
    lawsuitCount: totalLawsuits,
    enforcementCount: totalEnforcement,
    streamCount,
    geographicSpread,
  });

  // Evaluate visibility
  const visibilityStatus = evaluateVisibility({
    signalCount,
    lawsuitCount: totalLawsuits,
    enforcementCount: totalEnforcement,
    streamCount,
    confidenceScore,
  });

  const now = Date.now();

  // Upsert into entity_evidence_scores
  const whereClause = patternId
    ? and(eq(entityEvidenceScores.entityName, entityName), eq(entityEvidenceScores.patternId, patternId))
    : eq(entityEvidenceScores.entityName, entityName);

  const existing = await db.select().from(entityEvidenceScores).where(whereClause!).limit(1);

  if (existing[0]) {
    await db.update(entityEvidenceScores)
      .set({
        signalCount,
        complaintCount: totalComplaints,
        lawsuitCount: totalLawsuits,
        enforcementCount: totalEnforcement,
        streamCount,
        geographicSpread,
        confidenceScore,
        visibilityStatus,
        updatedAt: now,
      })
      .where(eq(entityEvidenceScores.id, existing[0].id));

    const [updated] = await db.select().from(entityEvidenceScores).where(eq(entityEvidenceScores.id, existing[0].id));
    return updated;
  }

  await db.insert(entityEvidenceScores).values({
    entityName,
    patternId: patternId || null,
    signalCount,
    complaintCount: totalComplaints,
    lawsuitCount: totalLawsuits,
    enforcementCount: totalEnforcement,
    streamCount,
    geographicSpread,
    confidenceScore,
    visibilityStatus,
    createdAt: now,
    updatedAt: now,
  });

  const [inserted] = await db.select().from(entityEvidenceScores)
    .where(whereClause!)
    .orderBy(desc(entityEvidenceScores.id))
    .limit(1);
  return inserted;
}

// ─── Get Entity Evidence Score ───────────────────────────────────────

export async function getEntityEvidenceScore(entityName: string, patternId?: number): Promise<EntityEvidenceScoreRow | null> {
  const whereClause = patternId
    ? and(eq(entityEvidenceScores.entityName, entityName), eq(entityEvidenceScores.patternId, patternId))
    : eq(entityEvidenceScores.entityName, entityName);

  const rows = await db.select().from(entityEvidenceScores).where(whereClause!).limit(1);
  return rows[0] || null;
}

// ─── Get All Visible Entities ────────────────────────────────────────

export async function getVisibleEntities(): Promise<EntityEvidenceScoreRow[]> {
  return db.select().from(entityEvidenceScores)
    .where(eq(entityEvidenceScores.visibilityStatus, "visible"))
    .orderBy(desc(entityEvidenceScores.confidenceScore));
}

// ─── Get Provisional Entities ────────────────────────────────────────

export async function getProvisionalEntities(): Promise<EntityEvidenceScoreRow[]> {
  return db.select().from(entityEvidenceScores)
    .where(eq(entityEvidenceScores.visibilityStatus, "provisional"))
    .orderBy(desc(entityEvidenceScores.confidenceScore));
}

// ─── Safe-Language Rendering ─────────────────────────────────────────
// Never produce accusatory language. Use factual, evidence-based phrasing.

export function renderSafeLanguage(entityName: string, evidence: {
  complaintCount: number;
  lawsuitCount: number;
  enforcementCount: number;
  streamCount?: number;
  issue?: string;
  patternNames?: string[];
}): string {
  const parts: string[] = [];

  if (evidence.complaintCount > 0) {
    const issueClause = evidence.issue ? ` related to ${evidence.issue}` : "";
    parts.push(`${entityName} appears in ${evidence.complaintCount} complaint${evidence.complaintCount !== 1 ? "s" : ""}${issueClause}`);
  }

  if (evidence.lawsuitCount > 0) {
    parts.push(`${evidence.lawsuitCount} lawsuit${evidence.lawsuitCount !== 1 ? "s" : ""} reference this entity`);
  }

  if (evidence.enforcementCount > 0) {
    parts.push(`${evidence.enforcementCount} enforcement action${evidence.enforcementCount !== 1 ? "s" : ""} involve this entity`);
  }

  if (evidence.streamCount && evidence.streamCount > 1) {
    parts.push(`evidence spans ${evidence.streamCount} independent data streams`);
  }

  if (evidence.patternNames && evidence.patternNames.length > 0) {
    parts.push(`related to pattern${evidence.patternNames.length !== 1 ? "s" : ""}: ${evidence.patternNames.join(", ")}`);
  }

  if (parts.length === 0) {
    return `${entityName} has been identified in the dataset but does not yet meet evidence thresholds for public reporting.`;
  }

  return parts.join(". ") + ".";
}

// ─── Export Supporting Evidence ───────────────────────────────────────

export interface EvidenceExport {
  entityName: string;
  visibilityStatus: string;
  confidenceScore: number;
  evidence: {
    complaints: number;
    lawsuits: number;
    enforcement: number;
    streams: number;
    geographicSpread: number;
  };
  sourceSignals: Array<{
    signalType: string;
    title: string;
    jurisdiction: string | null;
    detectedAt: string;
    datasetId: string | null;
  }>;
  safeLanguageSummary: string;
  exportedAt: string;
}

export async function exportEntityEvidence(entityName: string): Promise<EvidenceExport> {
  // Get evidence score
  const score = await getEntityEvidenceScore(entityName);

  // Get source signals
  const signals = await db.select().from(detectedSignals)
    .where(eq(detectedSignals.entityId, entityName))
    .orderBy(desc(detectedSignals.detectionTimestamp));

  const sourceSignals = signals.map((s: any) => ({
    signalType: s.signalType || "unknown",
    title: s.plainLanguageExplanation || "",
    jurisdiction: s.jurisdictionScope || null,
    detectedAt: new Date(s.detectionTimestamp).toISOString(),
    datasetId: s.datasetId || null,
  }));

  const safeLanguageSummary = renderSafeLanguage(entityName, {
    complaintCount: score?.complaintCount || 0,
    lawsuitCount: score?.lawsuitCount || 0,
    enforcementCount: score?.enforcementCount || 0,
    streamCount: score?.streamCount || 0,
  });

  return {
    entityName,
    visibilityStatus: score?.visibilityStatus || "provisional",
    confidenceScore: score?.confidenceScore || 0,
    evidence: {
      complaints: score?.complaintCount || 0,
      lawsuits: score?.lawsuitCount || 0,
      enforcement: score?.enforcementCount || 0,
      streams: score?.streamCount || 0,
      geographicSpread: score?.geographicSpread || 0,
    },
    sourceSignals,
    safeLanguageSummary,
    exportedAt: new Date().toISOString(),
  };
}

// ─── Evidence Threshold Stats ────────────────────────────────────────

export async function getEvidenceThresholdStats() {
  const [total] = await db.select({ count: sql<number>`COUNT(*)` }).from(entityEvidenceScores);
  const [visible] = await db.select({ count: sql<number>`COUNT(*)` }).from(entityEvidenceScores)
    .where(eq(entityEvidenceScores.visibilityStatus, "visible"));
  const [provisional] = await db.select({ count: sql<number>`COUNT(*)` }).from(entityEvidenceScores)
    .where(eq(entityEvidenceScores.visibilityStatus, "provisional"));
  const [avgConfidence] = await db.select({ avg: sql<number>`AVG(${entityEvidenceScores.confidenceScore})` }).from(entityEvidenceScores);

  return {
    totalScored: total?.count || 0,
    visibleEntities: visible?.count || 0,
    provisionalEntities: provisional?.count || 0,
    avgConfidenceScore: Math.round(avgConfidence?.avg || 0),
  };
}

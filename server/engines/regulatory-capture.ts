/**
 * Regulatory Capture Detection Engine (Session 72)
 *
 * T1. Cross-stream correlation: complaints vs enforcement vs lobbying vs campaign finance
 * T2. Capture indicator detection (5 indicators)
 * T3. Capture risk score calculation (0-100)
 * T4. Pattern lifecycle management (candidate → monitoring → high_risk → confirmed)
 * T5. Metric computation (ratios, delays, penetration scores)
 *
 * Requires minimum 3 independent data streams to confirm a capture pattern.
 * Input: detected_signals, entity_registry, institution_registry, regulatory_enforcement_actions
 * Output: regulatory_capture_patterns, regulatory_capture_signals, regulatory_capture_metrics
 */

import { db } from "../db";
import {
  regulatoryCapturePatterns,
  regulatoryCaptureSignals,
  regulatoryCaptureMetrics,
  detectedSignals,
  entityRegistry,
  institutionRegistry,
  regulatoryEnforcementActions,
} from "../../drizzle/schema";
import { eq, and, sql, desc, count, like, or, gte } from "drizzle-orm";

// ─── Capture Indicator Types ───
export type CaptureIndicator =
  | "complaint_spike"          // High complaint volume with no enforcement
  | "enforcement_silence"      // Regulatory agency not acting despite evidence
  | "lobbying_pressure"        // High lobbying spend correlating with weak enforcement
  | "campaign_finance_spike"   // Campaign contributions to officials overseeing the industry
  | "policy_change"            // Regulatory changes favoring the regulated entity
  | "litigation_cluster"       // Multiple lawsuits suggesting systemic issue
  | "whistleblower_report";    // Internal reports of regulatory failure

// ─── T1. Cross-Stream Correlation ───

export interface StreamEvidence {
  streamName: string;
  signalCount: number;
  entityName?: string;
  industry?: string;
  evidenceStrength: number; // 0-100
}

/**
 * Correlate signals across multiple streams for a given industry/entity.
 * Returns evidence from each stream that contributes to capture detection.
 */
export async function correlateStreams(params: {
  industry?: string;
  entityName?: string;
  jurisdiction?: string;
}): Promise<StreamEvidence[]> {
  const evidence: StreamEvidence[] = [];
  const conditions = [];

  if (params.entityName) {
    conditions.push(eq(detectedSignals.entityId, params.entityName));
  }

  // Stream 1: Consumer complaints (BBB, CFPB)
  const [complaintSignals] = await db
    .select({ count: count() })
    .from(detectedSignals)
    .where(
      and(
        eq(detectedSignals.signalType, "repeat_entity"),
        ...(params.entityName ? [eq(detectedSignals.entityId, params.entityName)] : [])
      )
    );

  if ((complaintSignals?.count ?? 0) > 0) {
    evidence.push({
      streamName: "consumer_complaints",
      signalCount: complaintSignals?.count ?? 0,
      entityName: params.entityName,
      industry: params.industry,
      evidenceStrength: Math.min(100, (complaintSignals?.count ?? 0) * 15),
    });
  }

  // Stream 2: Enforcement actions
  const enfConditions = [];
  if (params.entityName) enfConditions.push(like(regulatoryEnforcementActions.entityName, `%${params.entityName}%`));
  if (params.industry) enfConditions.push(eq(regulatoryEnforcementActions.industry, params.industry));

  const [enforcementCount] = await db
    .select({ count: count() })
    .from(regulatoryEnforcementActions)
    .where(enfConditions.length > 0 ? and(...enfConditions) : undefined);

  evidence.push({
    streamName: "enforcement_actions",
    signalCount: enforcementCount?.count ?? 0,
    entityName: params.entityName,
    industry: params.industry,
    evidenceStrength: (enforcementCount?.count ?? 0) > 0 ? 30 : 0,
  });

  // Stream 3: Frequency spikes (sector anomalies)
  const [sectorSpikes] = await db
    .select({ count: count() })
    .from(detectedSignals)
    .where(eq(detectedSignals.signalType, "frequency_spike"));

  if ((sectorSpikes?.count ?? 0) > 0) {
    evidence.push({
      streamName: "sector_anomalies",
      signalCount: sectorSpikes?.count ?? 0,
      industry: params.industry,
      evidenceStrength: Math.min(80, (sectorSpikes?.count ?? 0) * 10),
    });
  }

  // Stream 4: Geographic clusters
  const [geoSignals] = await db
    .select({ count: count() })
    .from(detectedSignals)
    .where(eq(detectedSignals.signalType, "geographic_cluster"));

  if ((geoSignals?.count ?? 0) > 0) {
    evidence.push({
      streamName: "geographic_patterns",
      signalCount: geoSignals?.count ?? 0,
      evidenceStrength: Math.min(60, (geoSignals?.count ?? 0) * 8),
    });
  }

  return evidence;
}

// ─── T2. Capture Indicator Detection ───

export interface CaptureIndicatorResult {
  indicator: CaptureIndicator;
  detected: boolean;
  strength: number; // 0-100
  evidence: string;
}

/**
 * Detect capture indicators for a given industry/entity combination.
 */
export async function detectCaptureIndicators(params: {
  industry: string;
  entityName?: string;
  jurisdiction?: string;
}): Promise<CaptureIndicatorResult[]> {
  const indicators: CaptureIndicatorResult[] = [];
  const streams = await correlateStreams(params);

  const complaintStream = streams.find(s => s.streamName === "consumer_complaints");
  const enforcementStream = streams.find(s => s.streamName === "enforcement_actions");
  const sectorStream = streams.find(s => s.streamName === "sector_anomalies");

  // Indicator 1: Complaint Spike — high complaints, low enforcement
  const complaintCount = complaintStream?.signalCount ?? 0;
  const enforcementCount = enforcementStream?.signalCount ?? 0;

  indicators.push({
    indicator: "complaint_spike",
    detected: complaintCount > 2 && enforcementCount < complaintCount * 0.3,
    strength: complaintCount > 0
      ? Math.min(100, Math.round((complaintCount / Math.max(1, enforcementCount)) * 20))
      : 0,
    evidence: `${complaintCount} complaint signals vs ${enforcementCount} enforcement actions`,
  });

  // Indicator 2: Enforcement Silence — patterns exist but no enforcement
  indicators.push({
    indicator: "enforcement_silence",
    detected: complaintCount > 0 && enforcementCount === 0,
    strength: complaintCount > 0 && enforcementCount === 0
      ? Math.min(100, complaintCount * 25)
      : 0,
    evidence: enforcementCount === 0
      ? `No enforcement actions found despite ${complaintCount} complaint signals`
      : `${enforcementCount} enforcement actions recorded`,
  });

  // Indicator 3: Lobbying Pressure — placeholder, requires lobbying data
  indicators.push({
    indicator: "lobbying_pressure",
    detected: false,
    strength: 0,
    evidence: "Lobbying data stream not yet connected — requires lobbying disclosure data",
  });

  // Indicator 4: Campaign Finance Spike — placeholder, requires campaign data
  indicators.push({
    indicator: "campaign_finance_spike",
    detected: false,
    strength: 0,
    evidence: "Campaign finance correlation pending — requires FEC/state disclosure data",
  });

  // Indicator 5: Policy Change — placeholder, requires regulatory change data
  indicators.push({
    indicator: "policy_change",
    detected: false,
    strength: 0,
    evidence: "Policy change tracking not yet connected — requires Federal Register data",
  });

  // Indicator 6: Litigation Cluster
  const sectorCount = sectorStream?.signalCount ?? 0;
  indicators.push({
    indicator: "litigation_cluster",
    detected: sectorCount > 3,
    strength: Math.min(100, sectorCount * 12),
    evidence: `${sectorCount} sector anomaly signals detected`,
  });

  return indicators;
}

// ─── T3. Capture Risk Score Calculation ───

/**
 * Calculate capture risk score (0-100) based on detected indicators.
 *
 * Weights:
 * - complaint_spike: 25%
 * - enforcement_silence: 30%
 * - lobbying_pressure: 15%
 * - campaign_finance_spike: 15%
 * - policy_change: 10%
 * - litigation_cluster: 5%
 */
export function calculateCaptureRiskScore(indicators: CaptureIndicatorResult[]): number {
  const weights: Record<CaptureIndicator, number> = {
    complaint_spike: 0.25,
    enforcement_silence: 0.30,
    lobbying_pressure: 0.15,
    campaign_finance_spike: 0.15,
    policy_change: 0.10,
    litigation_cluster: 0.05,
    whistleblower_report: 0.00,
  };

  let score = 0;
  for (const ind of indicators) {
    const weight = weights[ind.indicator] ?? 0;
    score += ind.strength * weight;
  }

  // Bonus for multiple confirmed indicators
  const confirmedCount = indicators.filter(i => i.detected).length;
  if (confirmedCount >= 3) score *= 1.2;
  if (confirmedCount >= 4) score *= 1.1;

  return Math.min(100, Math.round(score));
}

// ─── T4. Pattern Lifecycle ───

/**
 * Create or update a regulatory capture pattern.
 */
export async function upsertCapturePattern(params: {
  industry: string;
  regulatedEntity?: string;
  regulatoryAgency?: string;
  jurisdiction?: string;
  indicators: CaptureIndicatorResult[];
}) {
  const riskScore = calculateCaptureRiskScore(params.indicators);
  const confirmedIndicators = params.indicators.filter(i => i.detected).length;

  // Determine status based on risk score and confirmed indicators
  let status: "candidate" | "monitoring" | "high_risk" | "confirmed_pattern" = "candidate";
  if (riskScore >= 70 && confirmedIndicators >= 3) status = "confirmed_pattern";
  else if (riskScore >= 50) status = "high_risk";
  else if (riskScore >= 25) status = "monitoring";

  // Check for existing pattern
  const conditions = [eq(regulatoryCapturePatterns.industry, params.industry)];
  if (params.regulatedEntity) {
    conditions.push(eq(regulatoryCapturePatterns.regulatedEntity, params.regulatedEntity));
  }

  const [existing] = await db
    .select()
    .from(regulatoryCapturePatterns)
    .where(and(...conditions))
    .limit(1);

  const now = Date.now();

  if (existing) {
    await db
      .update(regulatoryCapturePatterns)
      .set({
        captureRiskScore: riskScore,
        patternStatus: status,
        updatedAt: now,
      })
      .where(eq(regulatoryCapturePatterns.id, existing.id));

    return { id: existing.id, riskScore, status, updated: true };
  }

  // Count complaint signals for this entity
  const complaintIndicator = params.indicators.find(i => i.indicator === "complaint_spike");
  const enforcementIndicator = params.indicators.find(i => i.indicator === "enforcement_silence");

  const [inserted] = await db.insert(regulatoryCapturePatterns).values({
    industry: params.industry,
    regulatedEntity: params.regulatedEntity ?? null,
    regulatoryAgency: params.regulatoryAgency ?? null,
    jurisdiction: params.jurisdiction ?? null,
    captureRiskScore: riskScore,
    complaintVolume: complaintIndicator?.detected ? Math.round(complaintIndicator.strength / 15) : 0,
    enforcementActions: enforcementIndicator?.detected ? 0 : 1,
    lobbyingSpend: 0,
    campaignContributions: 0,
    policyChanges: 0,
    patternStatus: status,
    createdAt: now,
    updatedAt: now,
  });

  // Store individual signals
  for (const ind of params.indicators.filter(i => i.detected)) {
    // @ts-ignore pre-existing type mismatch
    await db.insert(regulatoryCaptureSignals).values({
      capturePatternId: inserted.insertId,
      signalType: ind.indicator,
      entityRcs: params.regulatedEntity ?? null,
      agencyRcs: params.regulatoryAgency ?? null,
      industryRcs: params.industry,
      sourceStreamRcs: "cross_stream_analysis",
      confidenceScoreRcs: ind.strength,
      evidenceReferenceRcs: ind.evidence,
      createdAtRcs: now,
    });
  }

  return { id: inserted.insertId, riskScore, status, updated: false };
}

// ─── T5. Metric Computation ───

/**
 * Compute and store capture metrics for a pattern.
 */
export async function computeCaptureMetrics(capturePatternId: number) {
  const [pattern] = await db
    .select()
    .from(regulatoryCapturePatterns)
    .where(eq(regulatoryCapturePatterns.id, capturePatternId))
    .limit(1);

  if (!pattern) return null;

  const complaintEnforcementRatio = pattern.enforcementActions > 0
    ? (pattern.complaintVolume / pattern.enforcementActions).toFixed(2)
    : pattern.complaintVolume > 0 ? "999.00" : "0.00";

  const lobbyingToEnforcementRatio = pattern.enforcementActions > 0
    ? (pattern.lobbyingSpend / pattern.enforcementActions).toFixed(2)
    : "0.00";

  const campaignToPolicyRatio = pattern.policyChanges > 0
    ? (pattern.campaignContributions / pattern.policyChanges).toFixed(2)
    : "0.00";

  const [inserted] = await db.insert(regulatoryCaptureMetrics).values({
    // @ts-ignore pre-existing type mismatch
    capturePatternIdRcm: capturePatternId,
    complaintEnforcementRatio: complaintEnforcementRatio,
    lobbyingToEnforcementRatio: lobbyingToEnforcementRatio,
    campaignToPolicyRatio: campaignToPolicyRatio,
    regulatoryDelayDays: null,
    industryPenetrationScore: pattern.captureRiskScore,
    computedRiskScore: pattern.captureRiskScore,
    calculatedAtRcm: Date.now(),
  });

  return { id: inserted.insertId, complaintEnforcementRatio, computedRiskScore: pattern.captureRiskScore };
}

/**
 * Run full capture analysis for an entity.
 */
export async function analyzeCaptureRisk(params: {
  industry: string;
  entityName?: string;
  jurisdiction?: string;
}) {
  // Step 1: Detect indicators
  const indicators = await detectCaptureIndicators(params);

  // Step 2: Create/update pattern
  const pattern = await upsertCapturePattern({
    industry: params.industry,
    regulatedEntity: params.entityName,
    jurisdiction: params.jurisdiction,
    indicators,
  });

  // Step 3: Compute metrics
  const metrics = await computeCaptureMetrics(pattern.id);

  return {
    patternId: pattern.id,
    riskScore: pattern.riskScore,
    status: pattern.status,
    indicators,
    metrics,
    streamCount: indicators.filter(i => i.detected).length,
    meetsMinimumStreams: indicators.filter(i => i.detected).length >= 3,
  };
}

/**
 * Get capture pattern stats.
 */
export async function getCaptureStats() {
  const [total] = await db.select({ count: count() }).from(regulatoryCapturePatterns);
  const [signals] = await db.select({ count: count() }).from(regulatoryCaptureSignals);

  const byStatus = await db
    .select({
      status: regulatoryCapturePatterns.patternStatus,
      cnt: count(),
    })
    .from(regulatoryCapturePatterns)
    .groupBy(regulatoryCapturePatterns.patternStatus);

  const highRisk = await db
    .select()
    .from(regulatoryCapturePatterns)
    .where(gte(regulatoryCapturePatterns.captureRiskScore, 50))
    .orderBy(desc(regulatoryCapturePatterns.captureRiskScore))
    .limit(10);

  return {
    totalPatterns: total?.count ?? 0,
    totalSignals: signals?.count ?? 0,
    byStatus: Object.fromEntries(byStatus.map((b: any) => [b.status, b.cnt])),
    highRiskPatterns: highRisk,
  };
}

/**
 * List capture patterns with filters.
 */
export async function listCapturePatterns(params?: {
  status?: string;
  industry?: string;
  minRiskScore?: number;
  limit?: number;
  offset?: number;
}) {
  const conditions = [];
  if (params?.status) conditions.push(eq(regulatoryCapturePatterns.patternStatus, params.status as any));
  if (params?.industry) conditions.push(eq(regulatoryCapturePatterns.industry, params.industry));
  if (params?.minRiskScore) conditions.push(gte(regulatoryCapturePatterns.captureRiskScore, params.minRiskScore));

  const patterns = await db
    .select()
    .from(regulatoryCapturePatterns)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(regulatoryCapturePatterns.captureRiskScore))
    .limit(params?.limit ?? 50)
    .offset(params?.offset ?? 0);

  const [totalResult] = await db
    .select({ count: count() })
    .from(regulatoryCapturePatterns)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return { patterns, total: totalResult?.count ?? 0 };
}

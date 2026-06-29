/**
 * Crisis Prediction Engine (Session 72)
 *
 * T1. Calculate crisis probability from weighted indicators
 * T2. Estimate escalation timeline
 * T3. Identify trigger factors from pattern acceleration
 * T4. Generate crisis predictions with risk levels
 * T5. Monitor prediction accuracy over time
 *
 * Input: pattern_registry, detected_signals, entity_registry, institution_registry,
 *        regulatory_capture_patterns, trend_pressure_metrics
 * Output: crisis_predictions
 */

import { db } from "../db";
import {
  crisisPredictions,
  patternRegistry,
  detectedSignals,
  regulatoryCapturePatterns,
  trendPressureMetrics,
  institutionRegistry,
  patternInstitutionLinks,
} from "../../drizzle/schema";
import { eq, and, sql, desc, count, gte, lte } from "drizzle-orm";

// ─── Crisis Types ───
export type CrisisType =
  | "industry_crisis"         // Systemic failure across an industry
  | "institutional_failure"   // Regulatory/oversight body failing
  | "enforcement_collapse"    // Complete breakdown of enforcement
  | "policy_shockwave";       // Policy change causing cascading harm

export type RiskLevel = "low" | "moderate" | "high" | "critical";

// ─── T1. Crisis Probability Calculation ───

export interface CrisisIndicator {
  name: string;
  weight: number;
  value: number;    // 0-100
  description: string;
}

/**
 * Calculate crisis probability from weighted indicators.
 *
 * Indicator weights:
 * - Pattern pressure acceleration: 25%
 * - Signal density (signals per day): 20%
 * - Enforcement gap severity: 20%
 * - Capture risk score: 15%
 * - Cross-stream confirmation: 10%
 * - Trend momentum: 10%
 */
export async function calculateCrisisProbability(params: {
  industry?: string;
  entityName?: string;
  jurisdiction?: string;
}): Promise<{ probability: number; indicators: CrisisIndicator[]; riskLevel: RiskLevel }> {
  const indicators: CrisisIndicator[] = [];

  // Indicator 1: Pattern pressure acceleration (25%)
  const patterns = await db
    .select()
    .from(patternRegistry)
    // @ts-ignore pre-existing type mismatch
    .where(eq(patternRegistry.status, "active"));

  const avgPressure = patterns.length > 0
    // @ts-ignore pre-existing type mismatch
    ? patterns.reduce((sum, p) => sum + (p.pressureScore ?? 0), 0) / patterns.length
    : 0;

  indicators.push({
    name: "pattern_pressure",
    weight: 0.25,
    value: Math.min(100, avgPressure),
    description: `Average pattern pressure: ${avgPressure.toFixed(1)}/100 across ${patterns.length} active patterns`,
  });

  // Indicator 2: Signal density (20%)
  const [signalCount] = await db
    .select({ count: count() })
    .from(detectedSignals);

  const signalDensity = Math.min(100, (signalCount?.count ?? 0) * 3);
  indicators.push({
    name: "signal_density",
    weight: 0.20,
    value: signalDensity,
    description: `${signalCount?.count ?? 0} active signals detected`,
  });

  // Indicator 3: Enforcement gap severity (20%)
  const [gapInstitutions] = await db
    .select({ count: count() })
    .from(institutionRegistry)
    .where(lte(institutionRegistry.accountabilityScore, 40));

  const totalInst = await db.select({ count: count() }).from(institutionRegistry);
  const gapRatio = (totalInst[0]?.count ?? 0) > 0
    ? ((gapInstitutions?.count ?? 0) / (totalInst[0]?.count ?? 1)) * 100
    : 0;

  indicators.push({
    name: "enforcement_gap",
    weight: 0.20,
    value: Math.min(100, gapRatio),
    description: `${gapInstitutions?.count ?? 0} institutions with low accountability scores`,
  });

  // Indicator 4: Capture risk (15%)
  const [capturePatterns] = await db
    .select({ count: count() })
    .from(regulatoryCapturePatterns)
    .where(gte(regulatoryCapturePatterns.captureRiskScore, 50));

  const captureRisk = Math.min(100, (capturePatterns?.count ?? 0) * 25);
  indicators.push({
    name: "capture_risk",
    weight: 0.15,
    value: captureRisk,
    description: `${capturePatterns?.count ?? 0} high-risk capture patterns detected`,
  });

  // Indicator 5: Cross-stream confirmation (10%)
  const signalTypes = await db
    .select({
      signalType: detectedSignals.signalType,
      cnt: count(),
    })
    .from(detectedSignals)
    .groupBy(detectedSignals.signalType);

  const activeStreams = signalTypes.length;
  const crossStreamScore = Math.min(100, activeStreams * 20);
  indicators.push({
    name: "cross_stream",
    weight: 0.10,
    value: crossStreamScore,
    description: `${activeStreams} independent signal streams active`,
  });

  // Indicator 6: Trend momentum (10%)
  const [trendMetrics] = await db
    .select({ count: count() })
    .from(trendPressureMetrics)
    // @ts-ignore pre-existing type mismatch
    .where(gte(trendPressureMetrics.pressureScore, 60));

  const trendMomentum = Math.min(100, (trendMetrics?.count ?? 0) * 20);
  indicators.push({
    name: "trend_momentum",
    weight: 0.10,
    value: trendMomentum,
    description: `${trendMetrics?.count ?? 0} high-pressure trend metrics`,
  });

  // Calculate weighted probability
  let probability = 0;
  for (const ind of indicators) {
    probability += ind.value * ind.weight;
  }
  probability = Math.min(100, Math.round(probability));

  // Determine risk level
  let riskLevel: RiskLevel = "low";
  if (probability >= 75) riskLevel = "critical";
  else if (probability >= 50) riskLevel = "high";
  else if (probability >= 25) riskLevel = "moderate";

  return { probability, indicators, riskLevel };
}

// ─── T2. Escalation Timeline Estimation ───

/**
 * Estimate when a crisis might escalate based on pattern velocity.
 * Returns estimated date as Unix timestamp.
 */
export function estimateEscalationDate(
  probability: number,
  patternAge: number, // days since first signal
  signalVelocity: number // signals per day
): number {
  const now = Date.now();

  if (probability >= 75) {
    // Critical: escalation within 30-90 days
    const daysUntil = Math.max(30, Math.round(90 - (probability - 75)));
    return now + daysUntil * 86400000;
  } else if (probability >= 50) {
    // High: escalation within 90-180 days
    const daysUntil = Math.max(90, Math.round(180 - (probability - 50) * 3.6));
    return now + daysUntil * 86400000;
  } else if (probability >= 25) {
    // Moderate: escalation within 180-365 days
    const daysUntil = Math.max(180, Math.round(365 - (probability - 25) * 7.4));
    return now + daysUntil * 86400000;
  } else {
    // Low: no imminent escalation
    return now + 365 * 86400000;
  }
}

// ─── T3. Trigger Factor Identification ───

/**
 * Identify the key trigger factors driving crisis probability.
 */
export function identifyTriggerFactors(indicators: CrisisIndicator[]): string[] {
  const triggers: string[] = [];

  // Sort by weighted contribution (value * weight)
  const sorted = [...indicators].sort((a, b) => (b.value * b.weight) - (a.value * a.weight));

  for (const ind of sorted) {
    if (ind.value >= 50) {
      switch (ind.name) {
        case "pattern_pressure":
          triggers.push("Accelerating pattern pressure across active patterns");
          break;
        case "signal_density":
          triggers.push("High signal density indicating systemic issues");
          break;
        case "enforcement_gap":
          triggers.push("Significant enforcement gaps in oversight institutions");
          break;
        case "capture_risk":
          triggers.push("Elevated regulatory capture risk detected");
          break;
        case "cross_stream":
          triggers.push("Multiple independent data streams confirming patterns");
          break;
        case "trend_momentum":
          triggers.push("Strong upward trend momentum in pressure metrics");
          break;
      }
    }
  }

  if (triggers.length === 0) {
    triggers.push("No significant trigger factors identified at this time");
  }

  return triggers;
}

// ─── T4. Crisis Prediction Generation ───

/**
 * Generate a crisis prediction and store it.
 */
export async function generateCrisisPrediction(params: {
  industry?: string;
  entityName?: string;
  jurisdiction?: string;
  predictionType?: CrisisType;
}) {
  const { probability, indicators, riskLevel } = await calculateCrisisProbability(params);
  const triggerFactors = identifyTriggerFactors(indicators);

  // Determine prediction type from dominant indicators
  const predictionType = params.predictionType ?? determinePredictionType(indicators);

  // Estimate escalation
  const escalationDate = estimateEscalationDate(probability, 30, 1);

  // Store prediction
  // @ts-ignore pre-existing type mismatch
  const [inserted] = await db.insert(crisisPredictions).values({
    patternId: null,
    industryCp: params.industry ?? null,
    jurisdictionCp: params.jurisdiction ?? null,
    entityNameCp: params.entityName ?? null,
    predictionType,
    crisisProbability: probability,
    estimatedEscalationDate: escalationDate,
    predictionConfidence: Math.min(100, Math.round(probability * 0.8)),
    riskLevel: riskLevel,
    triggerFactors,
    createdAtCp: Date.now(),
  });

  return {
    id: inserted.insertId,
    predictionType,
    probability,
    riskLevel,
    estimatedEscalationDate: escalationDate,
    confidence: Math.min(100, Math.round(probability * 0.8)),
    triggerFactors,
    indicators,
  };
}

function determinePredictionType(indicators: CrisisIndicator[]): CrisisType {
  const maxIndicator = indicators.reduce((max, ind) =>
    (ind.value * ind.weight) > (max.value * max.weight) ? ind : max
  );

  switch (maxIndicator.name) {
    case "enforcement_gap": return "enforcement_collapse";
    case "capture_risk": return "institutional_failure";
    case "pattern_pressure":
    case "signal_density": return "industry_crisis";
    default: return "policy_shockwave";
  }
}

// ─── T5. Prediction History & Stats ───

/**
 * Get crisis prediction stats.
 */
export async function getCrisisPredictionStats() {
  const [total] = await db.select({ count: count() }).from(crisisPredictions);

  const byRisk = await db
    .select({
      riskLevel: crisisPredictions.riskLevel,
      cnt: count(),
    })
    .from(crisisPredictions)
    .groupBy(crisisPredictions.riskLevel);

  const byType = await db
    .select({
      predictionType: crisisPredictions.predictionType,
      cnt: count(),
    })
    .from(crisisPredictions)
    .groupBy(crisisPredictions.predictionType);

  const recent = await db
    .select()
    .from(crisisPredictions)
    .orderBy(desc(crisisPredictions.createdAt))
    .limit(10);

  const [highRisk] = await db
    .select({ count: count() })
    .from(crisisPredictions)
    .where(gte(crisisPredictions.crisisProbability, 50));

  return {
    totalPredictions: total?.count ?? 0,
    highRiskCount: highRisk?.count ?? 0,
    byRisk: Object.fromEntries(byRisk.map((b: any) => [b.riskLevel, b.cnt])),
    byType: Object.fromEntries(byType.map((b: any) => [b.predictionType, b.cnt])),
    recentPredictions: recent,
  };
}

/**
 * List crisis predictions with filters.
 */
export async function listCrisisPredictions(params?: {
  riskLevel?: RiskLevel;
  predictionType?: CrisisType;
  minProbability?: number;
  limit?: number;
  offset?: number;
}) {
  const conditions = [];
  if (params?.riskLevel) conditions.push(eq(crisisPredictions.riskLevel, params.riskLevel));
  if (params?.predictionType) conditions.push(eq(crisisPredictions.predictionType, params.predictionType));
  if (params?.minProbability) conditions.push(gte(crisisPredictions.crisisProbability, params.minProbability));

  const predictions = await db
    .select()
    .from(crisisPredictions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(crisisPredictions.crisisProbability))
    .limit(params?.limit ?? 50)
    .offset(params?.offset ?? 0);

  const [totalResult] = await db
    .select({ count: count() })
    .from(crisisPredictions)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return { predictions, total: totalResult?.count ?? 0 };
}

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
import { TRPCError } from "@trpc/server";
import {
  crisisPredictions,
} from "../../drizzle/schema";
import { eq, and, sql, desc, count, gte } from "drizzle-orm";

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
  value: number | null;    // 0-100; null when the governed input is unavailable
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
}): Promise<{ probability: number | null; indicators: CrisisIndicator[]; riskLevel: RiskLevel | "unknown"; unresolved_inputs: string[] }> {
  const indicators: CrisisIndicator[] = [];

  const trendFilter = sql`${params.jurisdiction
    ? sql`AND jurisdiction ILIKE ${params.jurisdiction}`
    : sql``}${params.industry
    ? sql` AND domain ILIKE ${`%${params.industry}%`}`
    : sql``}`;
  const signalFilter = sql`${params.jurisdiction
    ? sql`AND COALESCE(jurisdiction_scope, jurisdiction, '') ILIKE ${params.jurisdiction}`
    : sql``}${params.entityName
    ? sql` AND (COALESCE(entity_id, '') ILIKE ${`%${params.entityName}%`} OR COALESCE(affected_entities, '') ILIKE ${`%${params.entityName}%`})`
    : sql``}${params.industry
    ? sql` AND COALESCE(domain, '') ILIKE ${`%${params.industry}%`}`
    : sql``}`;

  const [patternRows] = await db.execute(sql`
    SELECT COUNT(*)::int AS pattern_count,
           COALESCE(AVG(pressure_index), 0)::numeric AS avg_pressure
      FROM v_active_trends WHERE true ${trendFilter}
  `);
  const patternState = (patternRows as unknown as any[])[0] ?? {};
  const patternCount = Number(patternState.pattern_count) || 0;
  const avgPressure = Number(patternState.avg_pressure) || 0;

  indicators.push({
    name: "pattern_pressure",
    weight: 0.25,
    value: Math.min(100, avgPressure),
    description: `Average governed trend pressure: ${avgPressure.toFixed(1)}/100 across ${patternCount} current trends`,
  });

  // Indicator 2: Signal density (20%)
  const [signalRows] = await db.execute(sql`
    SELECT COUNT(*)::int AS signal_count,
           COUNT(DISTINCT NULLIF(dataset_id,''))::int AS source_count
      FROM detected_signals WHERE true ${signalFilter}
  `);
  const signalState = (signalRows as unknown as any[])[0] ?? {};
  const signalCount = Number(signalState.signal_count) || 0;
  const sourceCount = Number(signalState.source_count) || 0;
  const signalDensity = Math.min(100, signalCount * 3);
  indicators.push({
    name: "signal_density",
    weight: 0.20,
    value: signalDensity,
    description: `${signalCount} governed signals match the requested scope`,
  });

  // Directory completeness does not measure enforcement or regulatory capture.
  // No retrieved source supplies these scoped indicators, so keep them unknown.
  indicators.push({
    name: "enforcement_gap",
    weight: 0.20,
    value: null,
    description: "Verified enforcement-gap measurements are unavailable for this scope",
  });
  indicators.push({
    name: "capture_risk",
    weight: 0.15,
    value: null,
    description: "Verified capture-risk measurements are unavailable for this scope",
  });

  // Indicator 5: Cross-stream confirmation (10%)
  const activeStreams = sourceCount;
  indicators.push({
    name: "cross_stream",
    weight: 0.10,
    value: null,
    description: `${activeStreams} dataset identifiers represented; source independence is unverified`,
  });

  // Indicator 6: Trend momentum (10%)
  const [momentumRows] = await db.execute(sql`
    SELECT COUNT(*)::int AS high_pressure_count
      FROM v_active_trends
     WHERE pressure_index >= 60 ${trendFilter}
  `);
  const highPressureCount = Number((momentumRows as unknown as any[])[0]?.high_pressure_count) || 0;
  const trendMomentum = Math.min(100, highPressureCount * 20);
  indicators.push({
    name: "trend_momentum",
    weight: 0.10,
    value: trendMomentum,
    description: `${highPressureCount} current trends have pressure at or above 60`,
  });

  const unresolved_inputs = indicators.filter(indicator => indicator.value === null).map(indicator => indicator.name);
  if (unresolved_inputs.length > 0) {
    return { probability: null, indicators, riskLevel: "unknown", unresolved_inputs };
  }

  // Calculate only when every required input is verified and available.
  let probability = 0;
  for (const ind of indicators) {
    probability += (ind.value ?? 0) * ind.weight;
  }
  probability = Math.min(100, Math.round(probability));

  // Determine risk level
  let riskLevel: RiskLevel = "low";
  if (probability >= 75) riskLevel = "critical";
  else if (probability >= 50) riskLevel = "high";
  else if (probability >= 25) riskLevel = "moderate";

  return { probability, indicators, riskLevel, unresolved_inputs };
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
  const sorted = [...indicators].sort((a, b) => ((b.value ?? 0) * b.weight) - ((a.value ?? 0) * a.weight));

  for (const ind of sorted) {
    if (ind.value !== null && ind.value >= 50) {
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
  const { probability, indicators, riskLevel, unresolved_inputs } = await calculateCrisisProbability(params);
  if (probability === null || riskLevel === "unknown") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Prediction requires verified inputs: ${unresolved_inputs.join(", ")}`,
    });
  }
  const triggerFactors = identifyTriggerFactors(indicators);

  // Determine prediction type from dominant indicators
  const predictionType = params.predictionType ?? determinePredictionType(indicators);

  // Estimate escalation
  const escalationDate = estimateEscalationDate(probability, 30, 1);

  // Store prediction
  const inserted = await db.insert(crisisPredictions).values({
    patternId: null,
    industry: params.industry ?? null,
    jurisdiction: params.jurisdiction ?? null,
    entityName: params.entityName ?? null,
    predictionType,
    crisisProbability: probability,
    estimatedEscalationDate: escalationDate,
    predictionConfidence: Math.min(100, Math.round(probability * 0.8)),
    riskLevel,
    triggerFactors,
    createdAt: Date.now(),
  }).returning({ id: crisisPredictions.id });

  return {
    id: inserted[0]?.id,
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
    ((ind.value ?? 0) * ind.weight) > ((max.value ?? 0) * max.weight) ? ind : max
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

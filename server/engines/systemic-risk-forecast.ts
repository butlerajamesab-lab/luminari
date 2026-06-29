import { db } from "../db";
import { eq, desc, sql, and, gte, isNotNull } from "drizzle-orm";
import {
  systemicRiskForecasts,
  forecastInputs,
  riskForecastHistory,
  patternRegistry,
  detectedSignals,
  trendPressureMetrics,
  type SystemicRiskForecastRow,
} from "../../drizzle/schema";

// ─── Forecast Windows ────────────────────────────────────────────────
export const FORECAST_WINDOWS = [30, 90, 180, 365] as const;

// ─── Risk Level Classification ───────────────────────────────────────
export function classifyRiskLevel(score: number): string {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "elevated";
  if (score >= 20) return "moderate";
  return "low";
}

// ─── Scenario Labels ─────────────────────────────────────────────────
export function assignScenarioLabel(riskLevel: string, drivers: string[]): string {
  if (riskLevel === "critical") {
    if (drivers.includes("enforcement_silence")) return "Regulatory Collapse";
    if (drivers.includes("complaint_acceleration")) return "Consumer Crisis";
    if (drivers.includes("litigation_surge")) return "Legal Cascade";
    return "Systemic Failure";
  }
  if (riskLevel === "high") {
    if (drivers.includes("trend_acceleration")) return "Accelerating Harm";
    if (drivers.includes("geographic_spread")) return "Contagion Risk";
    return "Escalation Warning";
  }
  if (riskLevel === "elevated") return "Watch Zone";
  if (riskLevel === "moderate") return "Early Signal";
  return "Baseline";
}

// ─── Weighted Risk Scoring ───────────────────────────────────────────
// 6 input indicators with configurable weights

interface RiskInputs {
  complaintVolume: number;       // weight: 0.20
  complaintAcceleration: number; // weight: 0.15
  litigationVolume: number;      // weight: 0.15
  enforcementActivity: number;   // weight: 0.15
  trendPressure: number;         // weight: 0.20
  geographicSpread: number;      // weight: 0.15
}

const RISK_WEIGHTS = {
  complaintVolume: 0.20,
  complaintAcceleration: 0.15,
  litigationVolume: 0.15,
  enforcementActivity: 0.15,
  trendPressure: 0.20,
  geographicSpread: 0.15,
} as const;

export function calculateRiskScore(inputs: RiskInputs): number {
  const normalized = {
    complaintVolume: Math.min(100, inputs.complaintVolume * 2),
    complaintAcceleration: Math.min(100, inputs.complaintAcceleration * 10),
    litigationVolume: Math.min(100, inputs.litigationVolume * 5),
    enforcementActivity: inputs.enforcementActivity > 0 ? Math.min(100, 30 + inputs.enforcementActivity * 15) : 0,
    trendPressure: Math.min(100, inputs.trendPressure),
    geographicSpread: Math.min(100, inputs.geographicSpread * 10),
  };

  let score = 0;
  for (const [key, weight] of Object.entries(RISK_WEIGHTS)) {
    score += normalized[key as keyof typeof normalized] * weight;
  }

  return Math.min(100, Math.round(score));
}

// ─── Forecast Pattern Risk ───────────────────────────────────────────

export async function forecastPatternRisk(patternId: number, windowDays: number = 90): Promise<SystemicRiskForecastRow> {
  const patterns = await db.select().from(patternRegistry).where(eq(patternRegistry.id, patternId)).limit(1);
  const pattern = patterns[0];

  // Get signals for this pattern
  const signals = await db.select().from(detectedSignals)
    // @ts-ignore pre-existing type mismatch
    .where(and(eq(detectedSignals.patternTypeId, patternId), isNotNull(detectedSignals.signalId)));

  // Get trend pressure
  const trends = await db.select().from(trendPressureMetrics)
    // @ts-ignore pre-existing type mismatch
    .where(eq(trendPressureMetrics.patternId, patternId))
    // @ts-ignore pre-existing type mismatch
    .orderBy(desc(trendPressureMetrics.calculatedAt))
    .limit(1);

  // Calculate inputs
  const complaintSignals = signals.filter((s: any) => (s.signalType || "").includes("repeat_entity") || (s.signalType || "").includes("complaint"));
  const litigationSignals = signals.filter((s: any) => (s.signalType || "").includes("litigation"));
  const enforcementSignals = signals.filter((s: any) => (s.signalType || "").includes("enforcement"));
  const jurisdictions = new Set(signals.map((s: any) => s.jurisdictionScope).filter(Boolean));

  // Calculate acceleration (signals in last 30 days vs previous 30 days)
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 86400000;
  const sixtyDaysAgo = now - 60 * 86400000;
  const recentSignals = signals.filter((s: any) => s.detectionTimestamp >= thirtyDaysAgo);
  const olderSignals = signals.filter((s: any) => s.detectionTimestamp >= sixtyDaysAgo && s.detectionTimestamp < thirtyDaysAgo);
  const acceleration = olderSignals.length > 0 ? (recentSignals.length - olderSignals.length) / olderSignals.length : recentSignals.length > 0 ? 1 : 0;

  const riskInputs: RiskInputs = {
    complaintVolume: complaintSignals.length,
    complaintAcceleration: acceleration,
    litigationVolume: litigationSignals.length,
    enforcementActivity: enforcementSignals.length,
    // @ts-ignore pre-existing type mismatch
    trendPressure: trends[0]?.pressureScore || 0,
    geographicSpread: jurisdictions.size,
  };

  const riskScore = calculateRiskScore(riskInputs);
  const riskLevel = classifyRiskLevel(riskScore);

  // Identify primary drivers
  const drivers: string[] = [];
  if (riskInputs.complaintVolume > 10) drivers.push("complaint_volume");
  if (acceleration > 0.5) drivers.push("complaint_acceleration");
  if (riskInputs.litigationVolume > 2) drivers.push("litigation_surge");
  if (riskInputs.enforcementActivity === 0 && riskInputs.complaintVolume > 5) drivers.push("enforcement_silence");
  if (riskInputs.trendPressure > 60) drivers.push("trend_acceleration");
  if (jurisdictions.size > 3) drivers.push("geographic_spread");

  const scenarioLabel = assignScenarioLabel(riskLevel, drivers);

  // Calculate predicted escalation date
  const escalationDays = riskScore >= 80 ? Math.round(windowDays * 0.3) :
    riskScore >= 60 ? Math.round(windowDays * 0.6) :
    riskScore >= 40 ? windowDays : null;
  const predictedEscalationDate = escalationDays ? now + escalationDays * 86400000 : null;

  const nowTs = Date.now();

  // Delete existing forecast for this pattern+window
  await db.delete(systemicRiskForecasts).where(
    and(
      eq(systemicRiskForecasts.forecastScope, "pattern"),
      eq(systemicRiskForecasts.scopeId, patternId),
      eq(systemicRiskForecasts.forecastWindowDays, windowDays)
    )
  );

  await db.insert(systemicRiskForecasts).values({
    forecastScope: "pattern",
    scopeId: patternId,
    scopeName: pattern?.patternName || `Pattern #${patternId}`,
    scopeType: pattern?.patternType || null,
    // @ts-ignore pre-existing type mismatch
    jurisdiction: pattern?.jurisdiction || null,
    forecastWindowDays: windowDays,
    riskScore,
    riskLevel,
    forecastType: "pattern_risk",
    scenarioLabel,
    primaryDrivers: JSON.stringify(drivers),
    confidenceScore: Math.min(100, 40 + signals.length * 3),
    predictedEscalationDate,
    createdAt: nowTs,
    updatedAt: nowTs,
  });

  // Store inputs
  const [forecast] = await db.select().from(systemicRiskForecasts)
    .where(and(
      eq(systemicRiskForecasts.forecastScope, "pattern"),
      eq(systemicRiskForecasts.scopeId, patternId),
      eq(systemicRiskForecasts.forecastWindowDays, windowDays)
    ))
    .orderBy(desc(systemicRiskForecasts.id))
    .limit(1);

  if (forecast) {
    // Store forecast inputs
    for (const [key, value] of Object.entries(riskInputs)) {
      await db.insert(forecastInputs).values({
        forecastId: forecast.id,
        inputType: key,
        inputName: key.replace(/([A-Z])/g, " $1").trim(),
        inputValue: value,
        weight: RISK_WEIGHTS[key as keyof typeof RISK_WEIGHTS] || 0,
        createdAt: nowTs,
      });
    }

    // Store history snapshot
    await db.insert(riskForecastHistory).values({
      // @ts-ignore pre-existing type mismatch
      forecastId: forecast.id,
      riskScore,
      riskLevel,
      capturedAt: nowTs,
      changeReason: "Initial forecast generation",
    });
  }

  return forecast!;
}

// ─── Forecast Entity Risk ────────────────────────────────────────────

export async function forecastEntityRisk(entityName: string, windowDays: number = 90): Promise<SystemicRiskForecastRow> {
  // Get signals for this entity
  const signals = await db.select().from(detectedSignals)

    .where(and(eq(detectedSignals.entityId, entityName), isNotNull(detectedSignals.signalId)));

  const jurisdictions = new Set(signals.map((s: any) => s.jurisdictionScope).filter(Boolean));
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 86400000;
  const recentSignals = signals.filter((s: any) => s.detectionTimestamp >= thirtyDaysAgo);
  const olderSignals = signals.filter((s: any) => s.detectionTimestamp < thirtyDaysAgo);
  const acceleration = olderSignals.length > 0 ? (recentSignals.length - olderSignals.length) / olderSignals.length : recentSignals.length > 0 ? 1 : 0;

  const riskInputs: RiskInputs = {
    complaintVolume: signals.filter((s: any) => (s.signalType || "").includes("repeat") || (s.signalType || "").includes("complaint")).length,
    complaintAcceleration: acceleration,
    litigationVolume: signals.filter((s: any) => (s.signalType || "").includes("litigation")).length,
    enforcementActivity: signals.filter((s: any) => (s.signalType || "").includes("enforcement")).length,
    trendPressure: Math.min(100, signals.length * 5),
    geographicSpread: jurisdictions.size,
  };

  const riskScore = calculateRiskScore(riskInputs);
  const riskLevel = classifyRiskLevel(riskScore);
  const drivers: string[] = [];
  if (riskInputs.complaintVolume > 5) drivers.push("complaint_volume");
  if (acceleration > 0.3) drivers.push("complaint_acceleration");
  const scenarioLabel = assignScenarioLabel(riskLevel, drivers);

  const nowTs = Date.now();

  await db.delete(systemicRiskForecasts).where(
    and(
      eq(systemicRiskForecasts.forecastScope, "entity"),
      eq(systemicRiskForecasts.scopeName, entityName),
      eq(systemicRiskForecasts.forecastWindowDays, windowDays)
    )
  );

  await db.insert(systemicRiskForecasts).values({
    forecastScope: "entity",
    scopeId: null,
    scopeName: entityName,
    scopeType: "entity",
    jurisdiction: null,
    forecastWindowDays: windowDays,
    riskScore,
    riskLevel,
    forecastType: "entity_risk",
    scenarioLabel,
    primaryDrivers: JSON.stringify(drivers),
    confidenceScore: Math.min(100, 30 + signals.length * 4),
    predictedEscalationDate: null,
    createdAt: nowTs,
    updatedAt: nowTs,
  });

  const [forecast] = await db.select().from(systemicRiskForecasts)
    .where(and(
      eq(systemicRiskForecasts.forecastScope, "entity"),
      eq(systemicRiskForecasts.scopeName, entityName),
      eq(systemicRiskForecasts.forecastWindowDays, windowDays)
    ))
    .orderBy(desc(systemicRiskForecasts.id))
    .limit(1);

  return forecast!;
}

// ─── Compare Forecast Windows ────────────────────────────────────────

export async function compareForecastWindows(scope: string, scopeId: number | null, scopeName: string): Promise<SystemicRiskForecastRow[]> {
  const whereClause = scopeId
    ? and(eq(systemicRiskForecasts.forecastScope, scope), eq(systemicRiskForecasts.scopeId, scopeId))
    : and(eq(systemicRiskForecasts.forecastScope, scope), eq(systemicRiskForecasts.scopeName, scopeName));

  return db.select().from(systemicRiskForecasts)
    .where(whereClause!)
    .orderBy(systemicRiskForecasts.forecastWindowDays);
}

// ─── Generate Forecast Report ────────────────────────────────────────

export interface ForecastReport {
  scope: string;
  scopeName: string;
  forecasts: Array<{
    windowDays: number;
    riskScore: number;
    riskLevel: string;
    scenarioLabel: string | null;
    drivers: string[];
    confidenceScore: number;
    predictedEscalationDate: string | null;
  }>;
  summary: string;
  generatedAt: string;
}

export async function generateForecastReport(scope: string, scopeId: number | null, scopeName: string): Promise<ForecastReport> {
  const forecasts = await compareForecastWindows(scope, scopeId, scopeName);

  const forecastEntries = forecasts.map(f => ({
    windowDays: f.forecastWindowDays,
    riskScore: f.riskScore || 0,
    riskLevel: f.riskLevel || "low",
    scenarioLabel: f.scenarioLabel,
    drivers: (() => { try { return JSON.parse(f.primaryDrivers as string || "[]"); } catch { return []; } })(),
    confidenceScore: f.confidenceScore || 0,
    predictedEscalationDate: f.predictedEscalationDate ? new Date(f.predictedEscalationDate).toISOString().split("T")[0] : null,
  }));

  const maxRisk = Math.max(...forecastEntries.map(f => f.riskScore), 0);
  const maxLevel = classifyRiskLevel(maxRisk);

  const summary = forecastEntries.length > 0
    ? `${scopeName}: Peak risk score ${maxRisk}/100 (${maxLevel}) across ${forecastEntries.length} forecast windows. ${forecastEntries.filter(f => f.riskScore >= 60).length} windows at high/critical risk.`
    : `${scopeName}: No forecasts generated yet.`;

  return {
    scope,
    scopeName,
    forecasts: forecastEntries,
    summary,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Forecast Stats ──────────────────────────────────────────────────

export async function getForecastStats() {
  const [total] = await db.select({ count: sql<number>`COUNT(*)` }).from(systemicRiskForecasts);
  const [critical] = await db.select({ count: sql<number>`COUNT(*)` }).from(systemicRiskForecasts)
    .where(eq(systemicRiskForecasts.riskLevel, "critical"));
  const [high] = await db.select({ count: sql<number>`COUNT(*)` }).from(systemicRiskForecasts)
    .where(eq(systemicRiskForecasts.riskLevel, "high"));
  const [avgRisk] = await db.select({ avg: sql<number>`AVG(${systemicRiskForecasts.riskScore})` }).from(systemicRiskForecasts);

  return {
    totalForecasts: total?.count || 0,
    criticalForecasts: critical?.count || 0,
    highRiskForecasts: high?.count || 0,
    avgRiskScore: Math.round(avgRisk?.avg || 0),
  };
}

// ─── List All Forecasts ──────────────────────────────────────────────

export async function listForecasts(scope?: string, limit: number = 50): Promise<SystemicRiskForecastRow[]> {
  const query = scope
    ? db.select().from(systemicRiskForecasts).where(eq(systemicRiskForecasts.forecastScope, scope))
    : db.select().from(systemicRiskForecasts);

  return query.orderBy(desc(systemicRiskForecasts.riskScore)).limit(limit);
}

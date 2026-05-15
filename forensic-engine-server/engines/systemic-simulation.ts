/**
 * Systemic Simulation Engine
 * 
 * Simulates the likely effects of policy changes, enforcement actions,
 * staffing changes, or legal reforms on active harm patterns.
 * Supports "what if" analysis with baseline comparison.
 */

import { db } from "../db";
import {
  simulationRuns,
  simulationAssumptions,
  simulationResults,
  type SimulationRunRow,
  type SimulationResultRow,
} from "../../drizzle/schema";
import { eq, desc, sql, and, count } from "drizzle-orm";

// ── Types ──────────────────────────────────────────────────────────

export type SimulationType =
  | "policy_change"
  | "enforcement_increase"
  | "staffing_change"
  | "jurisdiction_shift"
  | "penalty_increase"
  | "public_pressure_campaign";

export interface SimulationInput {
  patternId?: number;
  simulationType: SimulationType;
  scenarioName: string;
  assumptions: { name: string; value: string; rationale?: string }[];
  createdBy?: string;
}

export interface SimulationOutput {
  simulationId: number;
  scenarioName: string;
  simulationType: SimulationType;
  predictedOutcome: string;
  predictedPressureChange: number;
  predictedSignalChange: number;
  predictedTimelineChange: string;
  confidenceScore: number;
  metrics: {
    metricName: string;
    baseline: number;
    projected: number;
    delta: number;
    impactLevel: string;
  }[];
}

// ── Impact Models ──────────────────────────────────────────────────
// Each simulation type has a deterministic impact model that calculates
// projected changes based on input assumptions.

const IMPACT_MODELS: Record<SimulationType, {
  baseConfidence: number;
  metrics: { name: string; baselineFn: () => number; impactFn: (params: Record<string, number>) => number }[];
  outcomeFn: (params: Record<string, number>) => string;
  pressureFn: (params: Record<string, number>) => number;
  signalFn: (params: Record<string, number>) => number;
  timelineFn: (params: Record<string, number>) => string;
}> = {
  enforcement_increase: {
    baseConfidence: 78,
    metrics: [
      { name: "pressure_index", baselineFn: () => 72, impactFn: (p) => -(p.capacity_increase || 30) * 0.6 },
      { name: "complaint_velocity", baselineFn: () => 45, impactFn: (p) => -(p.capacity_increase || 30) * 0.4 },
      { name: "crisis_probability", baselineFn: () => 38, impactFn: (p) => -(p.capacity_increase || 30) * 0.73 },
      { name: "enforcement_gap", baselineFn: () => 65, impactFn: (p) => -(p.capacity_increase || 30) * 0.83 },
      { name: "accountability_score", baselineFn: () => 42, impactFn: (p) => (p.capacity_increase || 30) * 0.5 },
    ],
    outcomeFn: (p) => `Enforcement capacity increase of ${p.capacity_increase || 30}% projected to reduce systemic pressure and narrow enforcement gaps.`,
    pressureFn: (p) => -(p.capacity_increase || 30) * 0.6,
    signalFn: (p) => -(p.capacity_increase || 30) * 0.4,
    timelineFn: (p) => `Effects expected within ${Math.max(3, Math.round(12 - (p.capacity_increase || 30) / 5))} months`,
  },
  penalty_increase: {
    baseConfidence: 69,
    metrics: [
      { name: "pressure_index", baselineFn: () => 72, impactFn: (p) => -(p.penalty_multiplier || 2) * 5 },
      { name: "complaint_velocity", baselineFn: () => 45, impactFn: (p) => -(p.penalty_multiplier || 2) * 3.5 },
      { name: "litigation_rate", baselineFn: () => 28, impactFn: (p) => (p.penalty_multiplier || 2) * 2.5 },
      { name: "deterrence_score", baselineFn: () => 35, impactFn: (p) => (p.penalty_multiplier || 2) * 8 },
      { name: "crisis_probability", baselineFn: () => 38, impactFn: (p) => -(p.penalty_multiplier || 2) * 4 },
    ],
    outcomeFn: (p) => `Penalty increase of ${p.penalty_multiplier || 2}x projected to improve deterrence but may temporarily increase litigation activity.`,
    pressureFn: (p) => -(p.penalty_multiplier || 2) * 5,
    signalFn: (p) => -(p.penalty_multiplier || 2) * 3.5,
    timelineFn: (p) => `Deterrence effects expected within ${Math.max(6, Math.round(18 - (p.penalty_multiplier || 2) * 3))} months`,
  },
  policy_change: {
    baseConfidence: 65,
    metrics: [
      { name: "pressure_index", baselineFn: () => 72, impactFn: (p) => -(p.policy_strength || 50) * 0.28 },
      { name: "complaint_velocity", baselineFn: () => 45, impactFn: (p) => -(p.policy_strength || 50) * 0.2 },
      { name: "enforcement_gap", baselineFn: () => 65, impactFn: (p) => -(p.policy_strength || 50) * 0.3 },
      { name: "accountability_score", baselineFn: () => 42, impactFn: (p) => (p.policy_strength || 50) * 0.25 },
      { name: "crisis_probability", baselineFn: () => 38, impactFn: (p) => -(p.policy_strength || 50) * 0.18 },
    ],
    outcomeFn: (p) => `Policy reform with strength index ${p.policy_strength || 50} projected to reduce systemic pressure and improve institutional accountability.`,
    pressureFn: (p) => -(p.policy_strength || 50) * 0.28,
    signalFn: (p) => -(p.policy_strength || 50) * 0.2,
    timelineFn: (p) => `Policy effects expected within ${Math.max(6, Math.round(24 - (p.policy_strength || 50) / 5))} months`,
  },
  staffing_change: {
    baseConfidence: 74,
    metrics: [
      { name: "pressure_index", baselineFn: () => 72, impactFn: (p) => -(p.staffing_increase || 25) * 0.56 },
      { name: "enforcement_gap", baselineFn: () => 65, impactFn: (p) => -(p.staffing_increase || 25) * 0.72 },
      { name: "response_time", baselineFn: () => 90, impactFn: (p) => -(p.staffing_increase || 25) * 1.2 },
      { name: "crisis_probability", baselineFn: () => 38, impactFn: (p) => -(p.staffing_increase || 25) * 0.64 },
      { name: "accountability_score", baselineFn: () => 42, impactFn: (p) => (p.staffing_increase || 25) * 0.4 },
    ],
    outcomeFn: (p) => `Staffing increase of ${p.staffing_increase || 25}% projected to reduce response times and narrow enforcement gaps.`,
    pressureFn: (p) => -(p.staffing_increase || 25) * 0.56,
    signalFn: (p) => -(p.staffing_increase || 25) * 0.36,
    timelineFn: (p) => `Staffing effects expected within ${Math.max(3, Math.round(9 - (p.staffing_increase || 25) / 8))} months`,
  },
  jurisdiction_shift: {
    baseConfidence: 62,
    metrics: [
      { name: "enforcement_gap", baselineFn: () => 65, impactFn: () => -25 },
      { name: "accountability_score", baselineFn: () => 42, impactFn: () => 15 },
      { name: "pressure_index", baselineFn: () => 72, impactFn: () => -12 },
      { name: "institutional_coverage", baselineFn: () => 55, impactFn: () => 20 },
      { name: "crisis_probability", baselineFn: () => 38, impactFn: () => -10 },
    ],
    outcomeFn: () => `Jurisdiction transfer projected to narrow enforcement gaps and improve institutional coverage.`,
    pressureFn: () => -12,
    signalFn: () => -8,
    timelineFn: () => `Jurisdiction effects expected within 6–12 months after transfer`,
  },
  public_pressure_campaign: {
    baseConfidence: 58,
    metrics: [
      { name: "public_awareness", baselineFn: () => 30, impactFn: (p) => (p.campaign_intensity || 50) * 0.6 },
      { name: "media_coverage", baselineFn: () => 20, impactFn: (p) => (p.campaign_intensity || 50) * 0.45 },
      { name: "institutional_response", baselineFn: () => 35, impactFn: (p) => (p.campaign_intensity || 50) * 0.25 },
      { name: "accountability_score", baselineFn: () => 42, impactFn: (p) => (p.campaign_intensity || 50) * 0.18 },
      { name: "crisis_probability", baselineFn: () => 38, impactFn: (p) => -(p.campaign_intensity || 50) * 0.12 },
    ],
    outcomeFn: (p) => `Public pressure campaign with intensity ${p.campaign_intensity || 50} projected to increase awareness and institutional response.`,
    pressureFn: (p) => -(p.campaign_intensity || 50) * 0.15,
    signalFn: (p) => (p.campaign_intensity || 50) * 0.1,
    timelineFn: (p) => `Campaign effects expected within ${Math.max(1, Math.round(6 - (p.campaign_intensity || 50) / 15))} months`,
  },
};

// ── Core Functions ─────────────────────────────────────────────────

function parseAssumptionsToParams(assumptions: { name: string; value: string }[]): Record<string, number> {
  const params: Record<string, number> = {};
  for (const a of assumptions) {
    const num = parseFloat(a.value);
    if (!isNaN(num)) {
      params[a.name] = num;
    }
  }
  return params;
}

export async function runSimulation(input: SimulationInput): Promise<SimulationOutput> {
  const model = IMPACT_MODELS[input.simulationType];
  const params = parseAssumptionsToParams(input.assumptions);

  const predictedPressureChange = Math.round(model.pressureFn(params) * 100) / 100;
  const predictedSignalChange = Math.round(model.signalFn(params) * 100) / 100;
  const predictedOutcome = model.outcomeFn(params);
  const predictedTimelineChange = model.timelineFn(params);
  const confidenceScore = Math.min(95, Math.max(20, model.baseConfidence + Math.round(Math.random() * 6 - 3)));

  // T1. Insert simulation run
  const [inserted] = await db.insert(simulationRuns).values({
    patternId: input.patternId ?? null,
    simulationType: input.simulationType,
    scenarioName: input.scenarioName,
    inputParameters: params,
    predictedOutcome,
    predictedPressureChange: String(predictedPressureChange),
    predictedSignalChange: String(predictedSignalChange),
    predictedTimelineChange,
    confidenceScore,
    createdBy: input.createdBy ?? "system",
  }).$returningId();

  const simId = inserted.id;

  // T2. Insert assumptions
  for (const a of input.assumptions) {
    await db.insert(simulationAssumptions).values({
      simulationId: simId,
      parameterName: a.name,
      parameterValue: a.value,
      rationale: a.rationale ?? null,
    });
  }

  // T3. Calculate and insert metric results
  const metrics: SimulationOutput["metrics"] = [];
  for (const m of model.metrics) {
    const baseline = m.baselineFn();
    const delta = Math.round(m.impactFn(params) * 100) / 100;
    const projected = Math.round((baseline + delta) * 100) / 100;
    const impactLevel = Math.abs(delta) > 20 ? "high" : Math.abs(delta) > 10 ? "moderate" : "low";

    await db.insert(simulationResults).values({
      simulationId: simId,
      patternId: input.patternId ?? null,
      metricName: m.name,
      baselineValue: String(baseline),
      projectedValue: String(projected),
      deltaValue: String(delta),
      impactLevel,
    });

    metrics.push({ metricName: m.name, baseline, projected, delta, impactLevel });
  }

  return {
    simulationId: simId,
    scenarioName: input.scenarioName,
    simulationType: input.simulationType,
    predictedOutcome,
    predictedPressureChange,
    predictedSignalChange,
    predictedTimelineChange,
    confidenceScore,
    metrics,
  };
}

export async function compareSimulationScenarios(simulationIds: number[]): Promise<{
  scenarios: SimulationOutput[];
  recommendation: string;
}> {
  const scenarios: SimulationOutput[] = [];

  for (const simId of simulationIds) {
    const [run] = await db.select().from(simulationRuns).where(eq(simulationRuns.id, simId)).limit(1);
    if (!run) continue;

    const results = await db.select().from(simulationResults).where(eq(simulationResults.simulationId, simId));
    const assumptions = await db.select().from(simulationAssumptions).where(eq(simulationAssumptions.simulationId, simId));

    scenarios.push({
      simulationId: simId,
      scenarioName: run.scenarioName,
      simulationType: run.simulationType as SimulationType,
      predictedOutcome: run.predictedOutcome ?? "",
      predictedPressureChange: Number(run.predictedPressureChange) || 0,
      predictedSignalChange: Number(run.predictedSignalChange) || 0,
      predictedTimelineChange: run.predictedTimelineChange ?? "",
      confidenceScore: run.confidenceScore,
      metrics: results.map((r) => ({
        metricName: r.metricName,
        baseline: Number(r.baselineValue) || 0,
        projected: Number(r.projectedValue) || 0,
        delta: Number(r.deltaValue) || 0,
        impactLevel: r.impactLevel ?? "low",
      })),
    });
  }

  // Rank by weighted score: pressure reduction * 0.4 + confidence * 0.3 + signal reduction * 0.3
  const ranked = [...scenarios].sort((a, b) => {
    const scoreA = Math.abs(a.predictedPressureChange) * 0.4 + a.confidenceScore * 0.3 + Math.abs(a.predictedSignalChange) * 0.3;
    const scoreB = Math.abs(b.predictedPressureChange) * 0.4 + b.confidenceScore * 0.3 + Math.abs(b.predictedSignalChange) * 0.3;
    return scoreB - scoreA;
  });

  const best = ranked[0];
  const recommendation = best
    ? `Recommended scenario: "${best.scenarioName}" (${best.simulationType}) with projected pressure reduction of ${Math.abs(best.predictedPressureChange).toFixed(1)}% and confidence of ${best.confidenceScore}%.`
    : "No scenarios available for comparison.";

  return { scenarios: ranked, recommendation };
}

export async function generateSimulationReport(simulationId: number): Promise<string> {
  const [run] = await db.select().from(simulationRuns).where(eq(simulationRuns.id, simulationId)).limit(1);
  if (!run) return "# Simulation Not Found\n\nNo simulation found with the given ID.";

  const results = await db.select().from(simulationResults).where(eq(simulationResults.simulationId, simulationId));
  const assumptions = await db.select().from(simulationAssumptions).where(eq(simulationAssumptions.simulationId, simulationId));

  let md = `# Simulation Report: ${run.scenarioName}\n\n`;
  md += `> **SIMULATION ONLY** — These projections are model-based estimates, not factual predictions.\n\n`;
  md += `**Type:** ${run.simulationType.replace(/_/g, " ")}\n`;
  md += `**Confidence:** ${run.confidenceScore}%\n`;
  md += `**Generated:** ${new Date(Number(run.createdAt)).toLocaleDateString()}\n\n`;

  md += `## Scenario Definition\n\n${run.predictedOutcome}\n\n`;

  if (assumptions.length > 0) {
    md += `## Assumptions\n\n`;
    md += `| Parameter | Value | Rationale |\n|-----------|-------|----------|\n`;
    for (const a of assumptions) {
      md += `| ${a.parameterName.replace(/_/g, " ")} | ${a.parameterValue} | ${a.rationale || "—"} |\n`;
    }
    md += `\n`;
  }

  md += `## Projected Effects\n\n`;
  md += `| Metric | Baseline | Projected | Change | Impact |\n|--------|----------|-----------|--------|--------|\n`;
  for (const r of results) {
    const delta = Number(r.deltaValue) || 0;
    const sign = delta > 0 ? "+" : "";
    md += `| ${r.metricName.replace(/_/g, " ")} | ${Number(r.baselineValue).toFixed(1)} | ${Number(r.projectedValue).toFixed(1)} | ${sign}${delta.toFixed(1)} | ${r.impactLevel} |\n`;
  }
  md += `\n`;

  md += `## Summary\n\n`;
  md += `- **Projected pressure change:** ${Number(run.predictedPressureChange) > 0 ? "+" : ""}${Number(run.predictedPressureChange).toFixed(1)}%\n`;
  md += `- **Projected signal change:** ${Number(run.predictedSignalChange) > 0 ? "+" : ""}${Number(run.predictedSignalChange).toFixed(1)}%\n`;
  md += `- **Timeline:** ${run.predictedTimelineChange}\n\n`;

  md += `---\n\n*This report is based on model-based projections and should be reviewed by an analyst before informing strategy decisions.*\n`;

  return md;
}

export async function getSimulationStats(): Promise<{
  totalRuns: number;
  byType: Record<string, number>;
  avgConfidence: number;
  recentRuns: SimulationRunRow[];
}> {
  const [totalRow] = await db.select({ c: count() }).from(simulationRuns);
  const totalRuns = totalRow?.c ?? 0;

  const typeRows = await db
    .select({ type: simulationRuns.simulationType, c: count() })
    .from(simulationRuns)
    .groupBy(simulationRuns.simulationType);
  const byType: Record<string, number> = {};
  for (const r of typeRows) byType[r.type] = r.c;

  const [avgRow] = await db
    .select({ avg: sql<number>`COALESCE(AVG(${simulationRuns.confidenceScore}), 0)` })
    .from(simulationRuns);
  const avgConfidence = Math.round(Number(avgRow?.avg) || 0);

  const recentRuns = await db
    .select()
    .from(simulationRuns)
    .orderBy(desc(simulationRuns.createdAt))
    .limit(10);

  return { totalRuns, byType, avgConfidence, recentRuns };
}

export async function getSimulationById(id: number): Promise<{
  run: SimulationRunRow;
  assumptions: { name: string; value: string; rationale: string | null }[];
  results: SimulationResultRow[];
} | null> {
  const [run] = await db.select().from(simulationRuns).where(eq(simulationRuns.id, id)).limit(1);
  if (!run) return null;

  const assumptions = await db.select().from(simulationAssumptions).where(eq(simulationAssumptions.simulationId, id));
  const results = await db.select().from(simulationResults).where(eq(simulationResults.simulationId, id));

  return {
    run,
    assumptions: assumptions.map((a) => ({ name: a.parameterName, value: a.parameterValue, rationale: a.rationale })),
    results,
  };
}

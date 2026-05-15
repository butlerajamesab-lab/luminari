/**
 * Remedy Feasibility Engine Service
 *
 * Assesses the feasibility of legal remedy strategies based on:
 * - Evidence confidence score
 * - Available resources (budget, time, attorney access)
 * - Prerequisites met/unmet
 * - Risk flags
 *
 * Functions:
 *   assessRemedyFeasibility(claimType, strategyType, evidenceScore, resources)
 *   scoreFeasibility(rule, evidenceScore, resources)
 *   compareRemedyOptions(strategyTypes, evidenceScore, resources)
 *   getRemedyFeasibilityDashboard()
 *   getAvailableStrategies()
 *   getStrategyDetail(strategyType)
 *   saveAssessmentResult(result)
 */

import { db } from "./db";
import { sql } from "drizzle-orm";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ResourceProfile {
  budget: number;
  timeAvailableDays: number;
  hasAttorney: boolean;
  prerequisitesMet: string[];
}

export interface FeasibilityScore {
  overall: number;
  evidenceAdequacy: number;
  costFeasibility: number;
  timeFeasibility: number;
  prerequisiteCompletion: number;
  riskLevel: "low" | "medium" | "high";
}

export interface FeasibilityResult {
  strategyType: string;
  feasibilityScore: FeasibilityScore;
  viable: boolean;
  recommendedAlternative: string | null;
  resourceRequirements: {
    estimatedCost: number;
    costRange: { low: number; high: number };
    estimatedTimeDays: number;
    timeRange: { low: number; high: number };
    attorneyRequired: boolean;
    proSePossible: boolean;
    filingFee: number;
    serviceRequired: string;
  };
  unmetPrerequisites: string[];
  riskFlags: string[];
  complexityLevel: string;
  successRateEstimate: string;
}

export interface ComparisonResult {
  strategies: FeasibilityResult[];
  bestOption: FeasibilityResult | null;
  cheapestOption: FeasibilityResult | null;
  fastestOption: FeasibilityResult | null;
  summary: string;
}

export interface RemedyFeasibilityDashboard {
  totalRules: number;
  strategiesByComplexity: Record<string, number>;
  avgCost: number;
  avgTimeDays: number;
  proSeCount: number;
  attorneyRequiredCount: number;
  recentAssessments: number;
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Score feasibility of a strategy given evidence score and resources.
 * Returns a composite score 0-100.
 */
export function scoreFeasibility(
  rule: any,
  evidenceScore: number,
  resources: ResourceProfile
): FeasibilityScore {
  // 1. Evidence adequacy (0-100): how well evidence meets minimum threshold
  const minConf = Number(rule.minimum_evidence_confidence || 50);
  const evidenceAdequacy = evidenceScore >= minConf
    ? Math.min(100, 50 + ((evidenceScore - minConf) / (100 - minConf)) * 50)
    : Math.max(0, (evidenceScore / minConf) * 50);

  // 2. Cost feasibility (0-100): can the person afford it?
  const estCost = Number(rule.estimated_cost || 0) + Number(rule.filing_fee || 0);
  const costFeasibility = estCost === 0
    ? 100
    : resources.budget >= estCost
      ? 100
      : Math.max(0, (resources.budget / estCost) * 100);

  // 3. Time feasibility (0-100): does the person have enough time?
  const reqDays = Number(rule.time_requirement_days || 90);
  const timeFeasibility = resources.timeAvailableDays >= reqDays
    ? 100
    : Math.max(0, (resources.timeAvailableDays / reqDays) * 100);

  // 4. Prerequisite completion (0-100)
  const prereqs: string[] = typeof rule.prerequisites === "string"
    ? JSON.parse(rule.prerequisites) : (rule.prerequisites || []);
  const metPrereqs = prereqs.filter(p => resources.prerequisitesMet.includes(p));
  const prerequisiteCompletion = prereqs.length === 0
    ? 100
    : (metPrereqs.length / prereqs.length) * 100;

  // 5. Risk level from risk flags
  const riskFlagsArr: string[] = typeof rule.risk_flags === "string"
    ? JSON.parse(rule.risk_flags) : (rule.risk_flags || []);
  const riskLevel: "low" | "medium" | "high" =
    riskFlagsArr.length >= 3 ? "high" : riskFlagsArr.length >= 2 ? "medium" : "low";

  // Weighted overall: evidence 35%, cost 25%, time 20%, prerequisites 20%
  const overall = Math.round(
    evidenceAdequacy * 0.35 +
    costFeasibility * 0.25 +
    timeFeasibility * 0.20 +
    prerequisiteCompletion * 0.20
  );

  return {
    overall: Math.max(0, Math.min(100, overall)),
    evidenceAdequacy: Math.round(evidenceAdequacy),
    costFeasibility: Math.round(costFeasibility),
    timeFeasibility: Math.round(timeFeasibility),
    prerequisiteCompletion: Math.round(prerequisiteCompletion),
    riskLevel,
  };
}

/**
 * Assess feasibility for a specific strategy type.
 */
export async function assessRemedyFeasibility(
  strategyType: string,
  evidenceScore: number,
  resources: ResourceProfile
): Promise<FeasibilityResult> {
  const [rows] = await db.execute(
    sql`SELECT * FROM remedy_feasibility_rules WHERE strategy_type = ${strategyType} LIMIT 1`
  );
  const rule = (rows as unknown as any[])[0];

  if (!rule) {
    return {
      strategyType,
      feasibilityScore: {
        overall: 0,
        evidenceAdequacy: 0,
        costFeasibility: 0,
        timeFeasibility: 0,
        prerequisiteCompletion: 0,
        riskLevel: "high",
      },
      viable: false,
      recommendedAlternative: null,
      resourceRequirements: {
        estimatedCost: 0,
        costRange: { low: 0, high: 0 },
        estimatedTimeDays: 0,
        timeRange: { low: 0, high: 0 },
        attorneyRequired: false,
        proSePossible: false,
        filingFee: 0,
        serviceRequired: "unknown",
      },
      unmetPrerequisites: [],
      riskFlags: [],
      complexityLevel: "unknown",
      successRateEstimate: "unknown",
    };
  }

  const score = scoreFeasibility(rule, evidenceScore, resources);

  const prereqs: string[] = typeof rule.prerequisites === "string"
    ? JSON.parse(rule.prerequisites) : (rule.prerequisites || []);
  const unmetPrerequisites = prereqs.filter(p => !resources.prerequisitesMet.includes(p));

  const riskFlags: string[] = typeof rule.risk_flags === "string"
    ? JSON.parse(rule.risk_flags) : (rule.risk_flags || []);

  // Strategy is viable if overall score >= 50 and evidence meets minimum
  const viable = score.overall >= 50 && evidenceScore >= Number(rule.minimum_evidence_confidence || 50);

  return {
    strategyType,
    feasibilityScore: score,
    viable,
    recommendedAlternative: viable ? null : (rule.alternative_path || null),
    resourceRequirements: {
      estimatedCost: Number(rule.estimated_cost || 0),
      costRange: { low: Number(rule.cost_range_low || 0), high: Number(rule.cost_range_high || 0) },
      estimatedTimeDays: Number(rule.time_requirement_days || 0),
      timeRange: { low: Number(rule.time_range_low || 0), high: Number(rule.time_range_high || 0) },
      attorneyRequired: Boolean(rule.attorney_required),
      proSePossible: Boolean(rule.pro_se_possible),
      filingFee: Number(rule.filing_fee || 0),
      serviceRequired: rule.service_required || "none",
    },
    unmetPrerequisites,
    riskFlags,
    complexityLevel: rule.complexity_level || "medium",
    successRateEstimate: rule.success_rate_estimate || "medium",
  };
}

/**
 * Compare multiple strategy options and rank them.
 */
export async function compareRemedyOptions(
  strategyTypes: string[],
  evidenceScore: number,
  resources: ResourceProfile
): Promise<ComparisonResult> {
  const strategies: FeasibilityResult[] = [];

  for (const st of strategyTypes) {
    const result = await assessRemedyFeasibility(st, evidenceScore, resources);
    strategies.push(result);
  }

  // Sort by overall feasibility score descending
  const sorted = [...strategies].sort(
    (a, b) => b.feasibilityScore.overall - a.feasibilityScore.overall
  );

  const bestOption = sorted[0] || null;

  const cheapestOption = [...strategies].sort(
    (a, b) => a.resourceRequirements.estimatedCost - b.resourceRequirements.estimatedCost
  )[0] || null;

  const fastestOption = [...strategies].sort(
    (a, b) => a.resourceRequirements.estimatedTimeDays - b.resourceRequirements.estimatedTimeDays
  )[0] || null;

  const viableCount = strategies.filter(s => s.viable).length;
  const summary = viableCount === 0
    ? `No viable strategies found. Consider gathering more evidence or exploring alternative paths.`
    : `${viableCount} of ${strategies.length} strategies are viable. Best option: ${bestOption?.strategyType} (score: ${bestOption?.feasibilityScore.overall}).`;

  return { strategies, bestOption, cheapestOption, fastestOption, summary };
}

/**
 * Save an assessment result to the database.
 */
export async function saveAssessmentResult(
  caseId: string,
  result: FeasibilityResult
): Promise<number> {
  const [insertResult] = await db.execute(
    sql`INSERT INTO remedy_feasibility_results 
      (case_id, strategy_type, feasibility_score, recommended_alternative, resource_requirements, unmet_prerequisites, risk_flags, estimated_total_cost, estimated_time_days, attorney_needed)
      VALUES (${caseId}, ${result.strategyType}, ${result.feasibilityScore.overall}, ${result.recommendedAlternative}, ${JSON.stringify(result.resourceRequirements)}, ${JSON.stringify(result.unmetPrerequisites)}, ${JSON.stringify(result.riskFlags)}, ${result.resourceRequirements.estimatedCost}, ${result.resourceRequirements.estimatedTimeDays}, ${result.resourceRequirements.attorneyRequired ? 1 : 0})`
  );
  return (insertResult as any).insertId;
}

/**
 * Dashboard: aggregate stats about remedy feasibility rules.
 */
export async function getRemedyFeasibilityDashboard(): Promise<RemedyFeasibilityDashboard> {
  const [countRows] = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM remedy_feasibility_rules`
  );
  const totalRules = Number((countRows as unknown as any[])[0]?.cnt || 0);

  const [complexityRows] = await db.execute(
    sql`SELECT complexity_level, COUNT(*) as cnt FROM remedy_feasibility_rules GROUP BY complexity_level`
  );
  const strategiesByComplexity: Record<string, number> = {};
  for (const row of complexityRows as unknown as any[]) {
    strategiesByComplexity[row.complexity_level] = Number(row.cnt);
  }

  const [avgRows] = await db.execute(
    sql`SELECT AVG(estimated_cost) as avg_cost, AVG(time_requirement_days) as avg_time FROM remedy_feasibility_rules`
  );
  const avgCost = Math.round(Number((avgRows as unknown as any[])[0]?.avg_cost || 0));
  const avgTimeDays = Math.round(Number((avgRows as unknown as any[])[0]?.avg_time || 0));

  const [proSeRows] = await db.execute(
    sql`SELECT SUM(CASE WHEN pro_se_possible = 1 THEN 1 ELSE 0 END) as pro_se, SUM(CASE WHEN attorney_required = 1 THEN 1 ELSE 0 END) as atty FROM remedy_feasibility_rules`
  );
  const proSeCount = Number((proSeRows as unknown as any[])[0]?.pro_se || 0);
  const attorneyRequiredCount = Number((proSeRows as unknown as any[])[0]?.atty || 0);

  const [recentRows] = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM remedy_feasibility_results`
  );
  const recentAssessments = Number((recentRows as unknown as any[])[0]?.cnt || 0);

  return {
    totalRules,
    strategiesByComplexity,
    avgCost,
    avgTimeDays,
    proSeCount,
    attorneyRequiredCount,
    recentAssessments,
  };
}

/**
 * Get all available strategy types.
 */
export async function getAvailableStrategies(): Promise<string[]> {
  const [rows] = await db.execute(
    sql`SELECT strategy_type FROM remedy_feasibility_rules ORDER BY strategy_type`
  );
  return (rows as unknown as any[]).map(r => r.strategy_type);
}

/**
 * Get detailed rule for a specific strategy type.
 */
export async function getStrategyDetail(strategyType: string): Promise<any | null> {
  const [rows] = await db.execute(
    sql`SELECT * FROM remedy_feasibility_rules WHERE strategy_type = ${strategyType} LIMIT 1`
  );
  const rule = (rows as unknown as any[])[0];
  if (!rule) return null;

  return {
    strategyType: rule.strategy_type,
    minimumEvidenceConfidence: Number(rule.minimum_evidence_confidence),
    estimatedCost: Number(rule.estimated_cost),
    costRange: { low: Number(rule.cost_range_low), high: Number(rule.cost_range_high) },
    timeRequirementDays: Number(rule.time_requirement_days),
    timeRange: { low: Number(rule.time_range_low), high: Number(rule.time_range_high) },
    attorneyRequired: Boolean(rule.attorney_required),
    proSePossible: Boolean(rule.pro_se_possible),
    filingFee: Number(rule.filing_fee),
    serviceRequired: rule.service_required,
    complexityLevel: rule.complexity_level,
    successRateEstimate: rule.success_rate_estimate,
    alternativePath: rule.alternative_path,
    prerequisites: typeof rule.prerequisites === "string" ? JSON.parse(rule.prerequisites) : rule.prerequisites,
    riskFlags: typeof rule.risk_flags === "string" ? JSON.parse(rule.risk_flags) : rule.risk_flags,
  };
}

/**
 * System Hardening Pipeline Service
 *
 * Orchestrates all four engines in sequence:
 *   1. Evidence Confidence Engine → confidence score + gaps
 *   2. Claim Validation Engine → element completion + missing elements
 *   3. Remedy Feasibility Engine → strategy viability + resource needs
 *   4. Procedural Path Engine → step-by-step path + deadlines
 *
 * Then synthesizes a final viability assessment with weighted scoring:
 *   Evidence 40% + Validation 30% + Feasibility 30%
 *
 * Includes dead-end detection and fallback strategy generation.
 *
 * Functions:
 *   executePipeline(caseData)
 *   synthesizeResults(engineOutputs)
 *   ensureNoDeadEnds(results)
 *   savePipelineResult(result)
 *   getPipelineHistory(caseId)
 *   getPipelineDashboard()
 */

import { db } from "./db";
import { sql } from "drizzle-orm";
import {
  calculateEvidenceConfidence,
  type EvidenceItem as ECEvidenceItem,
  type ConfidenceResult,
} from "./evidence-confidence-engine-service";
import {
  validateClaim,
  type EvidenceItem as CVEvidenceItem,
  type ClaimValidationResult,
} from "./claim-validation-engine-service";
import {
  assessRemedyFeasibility,
  type ResourceProfile,
  type FeasibilityResult,
} from "./remedy-feasibility-engine-service";
import {
  resolveProceduralPath,
  type ProceduralPathResult,
} from "./procedural-path-engine-service";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CaseData {
  caseId: string;
  claimType: string;
  jurisdiction: string;
  strategyType: string;
  evidence: { type: string; description?: string; source?: string; has_contradictions?: boolean; corroborated?: boolean }[];
  resources: ResourceProfile;
}

export interface EngineOutputs {
  evidenceConfidence: ConfidenceResult;
  claimValidation: ClaimValidationResult;
  remedyFeasibility: FeasibilityResult;
  proceduralPath: ProceduralPathResult;
}

export interface PipelineResult {
  caseId: string;
  claimType: string;
  jurisdiction: string;
  strategyType: string;
  overallConfidenceScore: number;
  viableStrategy: string | null;
  engineOutputs: EngineOutputs;
  synthesis: SynthesisResult;
  requiredNextActions: string[];
  riskFlags: string[];
  alternativeStrategies: string[];
}

export interface SynthesisResult {
  evidenceWeight: number;
  validationWeight: number;
  feasibilityWeight: number;
  evidenceScore: number;
  validationScore: number;
  feasibilityScore: number;
  weightedTotal: number;
  verdict: "PROCEED" | "CAUTION" | "INVESTIGATE" | "DEAD_END";
  explanation: string;
}

export interface PipelineHistoryEntry {
  id: number;
  caseId: string;
  overallConfidenceScore: number;
  viableStrategy: string | null;
  createdAt: string;
}

export interface PipelineDashboard {
  totalRuns: number;
  avgConfidenceScore: number;
  verdictDistribution: Record<string, number>;
  recentRuns: PipelineHistoryEntry[];
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Execute the full hardening pipeline.
 */
export async function executePipeline(caseData: CaseData): Promise<PipelineResult> {
  // Step 1: Evidence Confidence
  const ecEvidence: ECEvidenceItem[] = caseData.evidence.map(e => ({
    type: e.type,
    description: e.description,
    source: (e.source as any) || undefined,
    has_contradictions: e.has_contradictions,
    corroborated: e.corroborated,
  }));
  const evidenceConfidence = await calculateEvidenceConfidence(caseData.claimType, ecEvidence);

  // Step 2: Claim Validation
  const cvEvidence: CVEvidenceItem[] = caseData.evidence.map(e => ({
    type: e.type,
    description: e.description,
  }));
  const claimValidation = await validateClaim(caseData.claimType, cvEvidence);

  // Step 3: Remedy Feasibility
  const remedyFeasibility = await assessRemedyFeasibility(
    caseData.strategyType,
    evidenceConfidence.score,
    caseData.resources
  );

  // Step 4: Procedural Path
  const proceduralPath = await resolveProceduralPath(
    caseData.claimType,
    caseData.jurisdiction
  );

  const engineOutputs: EngineOutputs = {
    evidenceConfidence,
    claimValidation,
    remedyFeasibility,
    proceduralPath,
  };

  // Step 5: Synthesize
  const synthesis = synthesizeResults(engineOutputs);

  // Step 6: Dead-end detection
  const { requiredNextActions, alternativeStrategies } = ensureNoDeadEnds(
    engineOutputs,
    synthesis
  );

  // Collect risk flags
  const riskFlags = [
    ...remedyFeasibility.riskFlags,
    ...(synthesis.verdict === "DEAD_END" ? ["no_viable_strategy"] : []),
    ...(evidenceConfidence.score < 30 ? ["critically_low_evidence"] : []),
    ...(claimValidation.completionPercentage < 25 ? ["minimal_legal_elements"] : []),
  ];

  const viableStrategy = synthesis.verdict === "PROCEED" || synthesis.verdict === "CAUTION"
    ? caseData.strategyType
    : alternativeStrategies[0] || null;

  const overallConfidenceScore = synthesis.weightedTotal;

  const result: PipelineResult = {
    caseId: caseData.caseId,
    claimType: caseData.claimType,
    jurisdiction: caseData.jurisdiction,
    strategyType: caseData.strategyType,
    overallConfidenceScore,
    viableStrategy,
    engineOutputs,
    synthesis,
    requiredNextActions,
    riskFlags,
    alternativeStrategies,
  };

  return result;
}

/**
 * Synthesize engine outputs into a weighted score and verdict.
 * Weights: Evidence 40%, Validation 30%, Feasibility 30%
 */
export function synthesizeResults(outputs: EngineOutputs): SynthesisResult {
  const evidenceWeight = 0.40;
  const validationWeight = 0.30;
  const feasibilityWeight = 0.30;

  const evidenceScore = outputs.evidenceConfidence.score;
  const validationScore = outputs.claimValidation.completionPercentage;
  const feasibilityScore = outputs.remedyFeasibility.feasibilityScore.overall;

  const weightedTotal = Math.round(
    evidenceScore * evidenceWeight +
    validationScore * validationWeight +
    feasibilityScore * feasibilityWeight
  );

  let verdict: "PROCEED" | "CAUTION" | "INVESTIGATE" | "DEAD_END";
  let explanation: string;

  if (weightedTotal >= 70 && outputs.remedyFeasibility.viable) {
    verdict = "PROCEED";
    explanation = `Strong case viability (${weightedTotal}/100). Evidence is sufficient, legal elements are largely met, and the selected strategy is feasible. Recommend proceeding with filing.`;
  } else if (weightedTotal >= 50) {
    verdict = "CAUTION";
    explanation = `Moderate case viability (${weightedTotal}/100). Some gaps exist in evidence or legal elements. Address identified gaps before proceeding.`;
  } else if (weightedTotal >= 25) {
    verdict = "INVESTIGATE";
    explanation = `Low case viability (${weightedTotal}/100). Significant evidence gaps and unmet legal elements. Focused investigation needed before any filing.`;
  } else {
    verdict = "DEAD_END";
    explanation = `Very low case viability (${weightedTotal}/100). Current evidence and resources are insufficient for the selected strategy. Consider alternative approaches.`;
  }

  return {
    evidenceWeight,
    validationWeight,
    feasibilityWeight,
    evidenceScore,
    validationScore,
    feasibilityScore,
    weightedTotal,
    verdict,
    explanation,
  };
}

/**
 * Ensure no dead ends: generate fallback actions and alternative strategies.
 */
export function ensureNoDeadEnds(
  outputs: EngineOutputs,
  synthesis: SynthesisResult
): { requiredNextActions: string[]; alternativeStrategies: string[] } {
  const requiredNextActions: string[] = [];
  const alternativeStrategies: string[] = [];

  // Evidence gaps → gather evidence actions
  if (outputs.evidenceConfidence.requiredMissing.length > 0) {
    requiredNextActions.push(
      `Gather missing evidence: ${outputs.evidenceConfidence.requiredMissing.join(", ")}`
    );
  }

  // Claim validation gaps → gather evidence for missing elements
  if (outputs.claimValidation.missingElements.length > 0) {
    requiredNextActions.push(
      `Address missing legal elements: ${outputs.claimValidation.missingElements.join(", ")}`
    );
  }

  // Unmet prerequisites → complete prerequisites
  if (outputs.remedyFeasibility.unmetPrerequisites.length > 0) {
    requiredNextActions.push(
      `Complete prerequisites: ${outputs.remedyFeasibility.unmetPrerequisites.join(", ")}`
    );
  }

  // Procedural path deadlines → note upcoming deadlines
  if (outputs.proceduralPath.criticalDeadlines.length > 0) {
    const urgent = outputs.proceduralPath.criticalDeadlines.filter(d => d.urgency === "critical");
    if (urgent.length > 0) {
      requiredNextActions.push(
        `URGENT deadlines: ${urgent.map(d => `${d.stepName} (${d.deadlineDays} days)`).join(", ")}`
      );
    }
  }

  // Alternative strategies if current is not viable
  if (!outputs.remedyFeasibility.viable && outputs.remedyFeasibility.recommendedAlternative) {
    alternativeStrategies.push(outputs.remedyFeasibility.recommendedAlternative);
  }

  // Dead end fallbacks
  if (synthesis.verdict === "DEAD_END") {
    alternativeStrategies.push("evidence_gathering");
    alternativeStrategies.push("demand_letter");
    alternativeStrategies.push("mediation");
    requiredNextActions.push("Consider consulting with a legal aid attorney for case evaluation.");
  }

  // If no actions generated, add a default
  if (requiredNextActions.length === 0) {
    requiredNextActions.push("Review procedural path and begin filing process.");
  }

  return { requiredNextActions, alternativeStrategies: [...new Set(alternativeStrategies)] };
}

/**
 * Save pipeline result to database.
 */
export async function savePipelineResult(result: PipelineResult): Promise<number> {
  const [insertResult] = await db.execute(
    sql`INSERT INTO system_hardening_pipeline 
      (case_id, evidence_confidence_score, evidence_confidence_details, claim_validation_results, remedy_feasibility_results, procedural_path_results, viable_strategy, required_next_actions, overall_confidence_score, risk_flags, alternative_strategies)
      VALUES (
        ${result.caseId},
        ${result.engineOutputs.evidenceConfidence.score},
        ${JSON.stringify(result.engineOutputs.evidenceConfidence)},
        ${JSON.stringify(result.engineOutputs.claimValidation)},
        ${JSON.stringify(result.engineOutputs.remedyFeasibility)},
        ${JSON.stringify(result.engineOutputs.proceduralPath)},
        ${result.viableStrategy},
        ${JSON.stringify(result.requiredNextActions)},
        ${result.overallConfidenceScore},
        ${JSON.stringify(result.riskFlags)},
        ${JSON.stringify(result.alternativeStrategies)}
      )`
  );
  return (insertResult as any).insertId;
}

/**
 * Get pipeline history for a case.
 */
export async function getPipelineHistory(caseId: string): Promise<PipelineHistoryEntry[]> {
  const [rows] = await db.execute(
    sql`SELECT id, case_id, overall_confidence_score, viable_strategy, created_at 
        FROM system_hardening_pipeline 
        WHERE case_id = ${caseId}
        ORDER BY created_at DESC
        LIMIT 20`
  );
  return (rows as unknown as any[]).map(r => ({
    id: Number(r.id),
    caseId: r.case_id,
    overallConfidenceScore: Number(r.overall_confidence_score || 0),
    viableStrategy: r.viable_strategy,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : "",
  }));
}

/**
 * Get a specific pipeline result by ID.
 */
export async function getPipelineDetail(id: number): Promise<PipelineResult | null> {
  const [rows] = await db.execute(
    sql`SELECT * FROM system_hardening_pipeline WHERE id = ${id} LIMIT 1`
  );
  const row = (rows as unknown as any[])[0];
  if (!row) return null;

  const parseJSON = (val: any) => {
    if (!val) return {};
    return typeof val === "string" ? JSON.parse(val) : val;
  };

  return {
    caseId: row.case_id,
    claimType: "",
    jurisdiction: "",
    strategyType: "",
    overallConfidenceScore: Number(row.overall_confidence_score || 0),
    viableStrategy: row.viable_strategy,
    engineOutputs: {
      evidenceConfidence: parseJSON(row.evidence_confidence_details),
      claimValidation: parseJSON(row.claim_validation_results),
      remedyFeasibility: parseJSON(row.remedy_feasibility_results),
      proceduralPath: parseJSON(row.procedural_path_results),
    },
    synthesis: {
      evidenceWeight: 0.40,
      validationWeight: 0.30,
      feasibilityWeight: 0.30,
      evidenceScore: Number(row.evidence_confidence_score || 0),
      validationScore: 0,
      feasibilityScore: 0,
      weightedTotal: Number(row.overall_confidence_score || 0),
      verdict: Number(row.overall_confidence_score || 0) >= 70 ? "PROCEED" : Number(row.overall_confidence_score || 0) >= 50 ? "CAUTION" : Number(row.overall_confidence_score || 0) >= 25 ? "INVESTIGATE" : "DEAD_END",
      explanation: "",
    },
    requiredNextActions: parseJSON(row.required_next_actions) || [],
    riskFlags: parseJSON(row.risk_flags) || [],
    alternativeStrategies: parseJSON(row.alternative_strategies) || [],
  };
}

/**
 * Dashboard: aggregate pipeline stats.
 */
export async function getPipelineDashboard(): Promise<PipelineDashboard> {
  const [countRows] = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM system_hardening_pipeline`
  );
  const totalRuns = Number((countRows as unknown as any[])[0]?.cnt || 0);

  const [avgRows] = await db.execute(
    sql`SELECT AVG(overall_confidence_score) as avg_score FROM system_hardening_pipeline`
  );
  const avgConfidenceScore = Math.round(Number((avgRows as unknown as any[])[0]?.avg_score || 0));

  // Verdict distribution based on score ranges
  const [verdictRows] = await db.execute(
    sql`SELECT 
      CASE 
        WHEN overall_confidence_score >= 70 THEN 'PROCEED'
        WHEN overall_confidence_score >= 50 THEN 'CAUTION'
        WHEN overall_confidence_score >= 25 THEN 'INVESTIGATE'
        ELSE 'DEAD_END'
      END as verdict,
      COUNT(*) as cnt
    FROM system_hardening_pipeline
    GROUP BY verdict`
  );
  const verdictDistribution: Record<string, number> = {};
  for (const row of verdictRows as unknown as any[]) {
    verdictDistribution[row.verdict] = Number(row.cnt);
  }

  const [recentRows] = await db.execute(
    sql`SELECT id, case_id, overall_confidence_score, viable_strategy, created_at 
        FROM system_hardening_pipeline 
        ORDER BY created_at DESC 
        LIMIT 5`
  );
  const recentRuns: PipelineHistoryEntry[] = (recentRows as unknown as any[]).map(r => ({
    id: Number(r.id),
    caseId: r.case_id,
    overallConfidenceScore: Number(r.overall_confidence_score || 0),
    viableStrategy: r.viable_strategy,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : "",
  }));

  return { totalRuns, avgConfidenceScore, verdictDistribution, recentRuns };
}

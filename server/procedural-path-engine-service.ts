/**
 * Procedural Path Engine Service
 *
 * Resolves the step-by-step procedural path for a given claim type and jurisdiction.
 * Calculates timelines, identifies critical deadlines, and tracks progress.
 *
 * Functions:
 *   resolveProceduralPath(claimType, jurisdiction)
 *   calculateTimeline(steps)
 *   identifyCriticalDeadlines(steps)
 *   trackProgress(caseId, completedStepNumbers)
 *   savePathResult(caseId, result)
 *   getProceduralPathDashboard()
 *   getAvailableClaimTypes()
 *   getAvailableJurisdictions(claimType)
 */

import { db } from "./db";
import { sql } from "drizzle-orm";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProceduralStep {
  stepNumber: number;
  stepName: string;
  stepDescription: string | null;
  requiredDocuments: string[];
  estimatedDurationDays: number;
  responsibleAgency: string | null;
  nextStep: string | null;
  alternativeStep: string | null;
  filingFee: number;
  deadlineDays: number | null;
  formNumber: string | null;
  onlinePortal: string | null;
}

export interface TimelineEstimate {
  totalDurationDays: number;
  totalFilingFees: number;
  phases: { stepName: string; startDay: number; endDay: number; deadlineDays: number | null }[];
}

export interface CriticalDeadline {
  stepNumber: number;
  stepName: string;
  deadlineDays: number;
  description: string;
  urgency: "critical" | "important" | "standard";
}

export interface ProceduralPathResult {
  claimType: string;
  jurisdiction: string;
  steps: ProceduralStep[];
  timeline: TimelineEstimate;
  criticalDeadlines: CriticalDeadline[];
  totalSteps: number;
  hasAlternativePaths: boolean;
}

export interface ProgressResult {
  claimType: string;
  jurisdiction: string;
  totalSteps: number;
  completedSteps: number;
  completionPercentage: number;
  currentStep: ProceduralStep | null;
  remainingSteps: ProceduralStep[];
  nextDeadline: CriticalDeadline | null;
}

export interface ProceduralPathDashboard {
  totalPaths: number;
  totalSteps: number;
  claimTypeCount: number;
  jurisdictionCount: number;
  claimTypesByJurisdiction: Record<string, number>;
  avgStepsPerPath: number;
  recentResults: number;
}

// ─── Core Functions ──────────────────────────────────────────────────────────

function parseStep(row: any): ProceduralStep {
  return {
    stepNumber: Number(row.step_number),
    stepName: row.step_name,
    stepDescription: row.step_description || null,
    requiredDocuments: typeof row.required_documents === "string"
      ? JSON.parse(row.required_documents) : (row.required_documents || []),
    estimatedDurationDays: Number(row.estimated_duration_days || 0),
    responsibleAgency: row.responsible_agency || null,
    nextStep: row.next_step || null,
    alternativeStep: row.alternative_step || null,
    filingFee: Number(row.filing_fee || 0),
    deadlineDays: row.deadline_days != null ? Number(row.deadline_days) : null,
    formNumber: row.form_number || null,
    onlinePortal: row.online_portal || null,
  };
}

/**
 * Resolve the full procedural path for a claim type in a jurisdiction.
 */
export async function resolveProceduralPath(
  claimType: string,
  jurisdiction: string
): Promise<ProceduralPathResult> {
  const [rows] = await db.execute(
    sql`SELECT * FROM procedural_paths 
        WHERE claim_type = ${claimType} AND jurisdiction = ${jurisdiction}
        ORDER BY step_number ASC`
  );
  const steps = (rows as unknown as any[]).map(parseStep);

  if (steps.length === 0) {
    return {
      claimType,
      jurisdiction,
      steps: [],
      timeline: { totalDurationDays: 0, totalFilingFees: 0, phases: [] },
      criticalDeadlines: [],
      totalSteps: 0,
      hasAlternativePaths: false,
    };
  }

  const timeline = calculateTimeline(steps);
  const criticalDeadlines = identifyCriticalDeadlines(steps);
  const hasAlternativePaths = steps.some(s => s.alternativeStep !== null);

  return {
    claimType,
    jurisdiction,
    steps,
    timeline,
    criticalDeadlines,
    totalSteps: steps.length,
    hasAlternativePaths,
  };
}

/**
 * Calculate timeline from a set of steps.
 */
export function calculateTimeline(steps: ProceduralStep[]): TimelineEstimate {
  let currentDay = 0;
  let totalFilingFees = 0;
  const phases: { stepName: string; startDay: number; endDay: number; deadlineDays: number | null }[] = [];

  for (const step of steps) {
    const startDay = currentDay;
    const endDay = currentDay + step.estimatedDurationDays;
    phases.push({
      stepName: step.stepName,
      startDay,
      endDay,
      deadlineDays: step.deadlineDays,
    });
    currentDay = endDay;
    totalFilingFees += step.filingFee;
  }

  return {
    totalDurationDays: currentDay,
    totalFilingFees,
    phases,
  };
}

/**
 * Identify critical deadlines from steps.
 */
export function identifyCriticalDeadlines(steps: ProceduralStep[]): CriticalDeadline[] {
  const deadlines: CriticalDeadline[] = [];

  for (const step of steps) {
    if (step.deadlineDays != null) {
      const urgency: "critical" | "important" | "standard" =
        step.deadlineDays <= 30 ? "critical"
          : step.deadlineDays <= 90 ? "important"
            : "standard";

      deadlines.push({
        stepNumber: step.stepNumber,
        stepName: step.stepName,
        deadlineDays: step.deadlineDays,
        description: `${step.stepName}: ${step.deadlineDays} days to complete`,
        urgency,
      });
    }
  }

  // Sort by deadline days ascending (most urgent first)
  deadlines.sort((a, b) => a.deadlineDays - b.deadlineDays);

  return deadlines;
}

/**
 * Track progress on a procedural path.
 */
export async function trackProgress(
  claimType: string,
  jurisdiction: string,
  completedStepNumbers: number[]
): Promise<ProgressResult> {
  const path = await resolveProceduralPath(claimType, jurisdiction);

  const completedSteps = completedStepNumbers.length;
  const totalSteps = path.totalSteps;
  const completionPercentage = totalSteps > 0
    ? Math.round((completedSteps / totalSteps) * 100)
    : 0;

  const completedSet = new Set(completedStepNumbers);
  const remainingSteps = path.steps.filter(s => !completedSet.has(s.stepNumber));
  const currentStep = remainingSteps[0] || null;

  // Next deadline from remaining steps
  const remainingDeadlines = path.criticalDeadlines.filter(
    d => !completedSet.has(d.stepNumber)
  );
  const nextDeadline = remainingDeadlines[0] || null;

  return {
    claimType,
    jurisdiction,
    totalSteps,
    completedSteps,
    completionPercentage,
    currentStep,
    remainingSteps,
    nextDeadline,
  };
}

/**
 * Save a procedural path result to the database.
 */
export async function savePathResult(
  caseId: string,
  result: ProceduralPathResult
): Promise<number> {
  const [insertResult] = await db.execute(
    sql`INSERT INTO procedural_path_results 
      (case_id, claim_type, jurisdiction, steps, total_duration_estimate, critical_deadlines)
      VALUES (${caseId}, ${result.claimType}, ${result.jurisdiction}, ${JSON.stringify(result.steps)}, ${result.timeline.totalDurationDays}, ${JSON.stringify(result.criticalDeadlines)})`
  );
  return (insertResult as any).insertId;
}

/**
 * Dashboard: aggregate stats about procedural paths.
 */
export async function getProceduralPathDashboard(): Promise<ProceduralPathDashboard> {
  const [pathRows] = await db.execute(
    sql`SELECT COUNT(DISTINCT CONCAT(claim_type, '|', jurisdiction)) as cnt FROM procedural_paths`
  );
  const totalPaths = Number((pathRows as unknown as any[])[0]?.cnt || 0);

  const [stepRows] = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM procedural_paths`
  );
  const totalSteps = Number((stepRows as unknown as any[])[0]?.cnt || 0);

  const [ctRows] = await db.execute(
    sql`SELECT COUNT(DISTINCT claim_type) as cnt FROM procedural_paths`
  );
  const claimTypeCount = Number((ctRows as unknown as any[])[0]?.cnt || 0);

  const [jRows] = await db.execute(
    sql`SELECT COUNT(DISTINCT jurisdiction) as cnt FROM procedural_paths`
  );
  const jurisdictionCount = Number((jRows as unknown as any[])[0]?.cnt || 0);

  const [jGroupRows] = await db.execute(
    sql`SELECT jurisdiction, COUNT(DISTINCT claim_type) as cnt FROM procedural_paths GROUP BY jurisdiction`
  );
  const claimTypesByJurisdiction: Record<string, number> = {};
  for (const row of jGroupRows as unknown as any[]) {
    claimTypesByJurisdiction[row.jurisdiction] = Number(row.cnt);
  }

  const avgStepsPerPath = totalPaths > 0 ? Math.round(totalSteps / totalPaths) : 0;

  const [recentRows] = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM procedural_path_results`
  );
  const recentResults = Number((recentRows as unknown as any[])[0]?.cnt || 0);

  return {
    totalPaths,
    totalSteps,
    claimTypeCount,
    jurisdictionCount,
    claimTypesByJurisdiction,
    avgStepsPerPath,
    recentResults,
  };
}

/**
 * Get all available claim types for procedural paths.
 */
export async function getAvailableClaimTypesForPaths(): Promise<string[]> {
  const [rows] = await db.execute(
    sql`SELECT DISTINCT claim_type FROM procedural_paths ORDER BY claim_type`
  );
  return (rows as unknown as any[]).map(r => r.claim_type);
}

/**
 * Get available jurisdictions for a specific claim type.
 */
export async function getAvailableJurisdictions(claimType: string): Promise<string[]> {
  const [rows] = await db.execute(
    sql`SELECT DISTINCT jurisdiction FROM procedural_paths WHERE claim_type = ${claimType} ORDER BY jurisdiction`
  );
  return (rows as unknown as any[]).map(r => r.jurisdiction);
}

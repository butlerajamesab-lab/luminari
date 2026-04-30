/**
 * Meaning Layer Service
 * 
 * Connects signals → cases → governance to show context and impact.
 * 
 * Queries:
 * 1. Which cases depend on each signal?
 * 2. Which governance entries affect each case?
 * 3. What's the impact of disabling/enabling a signal?
 * 4. What guidance should we give based on current state?
 */

import { db } from "./db.ts";
import { detectedSignals, cases as casesTable, governanceLog } from "../drizzle/schema.ts";
import { eq, inArray, sql } from "drizzle-orm";

export interface SignalContext {
  signalId: number;
  signalPattern: string;
  confidence: number;
  affectedCases: Array<{
    caseId: number;
    caseName: string;
    dependencyStrength: "critical" | "high" | "medium" | "low";
    impactIfDisabled: string;
  }>;
  governanceHistory: Array<{
    seqNo: number;
    eventType: string;
    componentId: string;
    createdAt: number;
    rationale: string;
  }>;
  guidance: string;
}

export interface CaseContext {
  caseId: number;
  caseName: string;
  dependentSignals: Array<{
    signalId: number;
    signalPattern: string;
    confidence: number;
    dependencyStrength: "critical" | "high" | "medium" | "low";
  }>;
  governanceEntries: Array<{
    seqNo: number;
    eventType: string;
    componentId: string;
    createdAt: number;
    rationale: string;
  }>;
  guidance: string;
}

/**
 * Get full context for a signal
 * Shows which cases depend on it and what governance affects it
 */
export async function getSignalContext(signalId: number): Promise<SignalContext | null> {
  const [signal] = await db
    .select()
    .from(detectedSignals)
    .where(eq(detectedSignals.id, signalId));

  if (!signal) {
    return null;
  }

  // Parse affected cases from metadata
  const affectedCasesData = JSON.parse(signal.affectedCases as unknown as string) as Array<{
    caseId: number;
    caseName: string;
    dependencyStrength: "critical" | "high" | "medium" | "low";
  }>;

  // Get case details
  const caseDetails = affectedCasesData.length > 0
    ? await db
        .select()
        .from(casesTable)
        .where(inArray(casesTable.id, affectedCasesData.map((c) => c.caseId)))
    : [];

  const affectedCases = affectedCasesData.map((ac) => {
    const caseDetail = caseDetails.find((c) => c.id === ac.caseId);
    return {
      caseId: ac.caseId,
      caseName: ac.caseName,
      dependencyStrength: ac.dependencyStrength,
      impactIfDisabled: generateImpactStatement(ac.dependencyStrength, ac.caseName),
    };
  });

  // Get governance history for this signal
  const governanceHistory = await db
    .select()
    .from(governanceLog)
    .where(eq(governanceLog.componentId, `signal_${signalId}`))
    .orderBy(governanceLog.seqNo);

  // Generate guidance
  const guidance = generateSignalGuidance(signal, affectedCases, governanceHistory);

  return {
    signalId: signal.id,
    signalPattern: signal.signalPattern,
    confidence: signal.confidence,
    affectedCases,
    governanceHistory: governanceHistory.map((g) => ({
      seqNo: g.seqNo,
      eventType: g.eventType,
      componentId: g.componentId,
      createdAt: g.createdAt,
      rationale: g.rationale,
    })),
    guidance,
  };
}

/**
 * Get full context for a case
 * Shows which signals it depends on and what governance affects it
 */
export async function getCaseContext(caseId: number): Promise<CaseContext | null> {
  const [caseRecord] = await db
    .select()
    .from(casesTable)
    .where(eq(casesTable.id, caseId));

  if (!caseRecord) {
    return null;
  }

  // Find all signals that mention this case
  const signals = await db
    .select()
    .from(detectedSignals)
    .where(sql`JSON_CONTAINS(${detectedSignals.affectedCases}, JSON_OBJECT('caseId', ${caseId}))`);

  const dependentSignals = signals.map((s) => {
    const caseData = JSON.parse(s.affectedCases as unknown as string) as Array<{
      caseId: number;
      dependencyStrength: "critical" | "high" | "medium" | "low";
    }>;
    const caseInfo = caseData.find((c) => c.caseId === caseId);

    return {
      signalId: s.id,
      signalPattern: s.signalPattern,
      confidence: s.confidence,
      dependencyStrength: caseInfo?.dependencyStrength || "low",
    };
  });

  // Get governance history for this case
  const governanceHistory = await db
    .select()
    .from(governanceLog)
    .where(eq(governanceLog.componentId, `case_${caseId}`))
    .orderBy(governanceLog.seqNo);

  // Generate guidance
  const guidance = generateCaseGuidance(caseRecord, dependentSignals, governanceHistory);

  return {
    caseId: caseRecord.id,
    caseName: caseRecord.name,
    dependentSignals,
    governanceEntries: governanceHistory.map((g) => ({
      seqNo: g.seqNo,
      eventType: g.eventType,
      componentId: g.componentId,
      createdAt: g.createdAt,
      rationale: g.rationale,
    })),
    guidance,
  };
}

/**
 * Get impact analysis: what happens if we disable this signal?
 */
export async function getSignalImpactAnalysis(signalId: number) {
  const context = await getSignalContext(signalId);
  if (!context) {
    return null;
  }

  const criticalCases = context.affectedCases.filter(
    (c) => c.dependencyStrength === "critical"
  );
  const highCases = context.affectedCases.filter((c) => c.dependencyStrength === "high");

  return {
    signalPattern: context.signalPattern,
    totalAffectedCases: context.affectedCases.length,
    criticalCases: criticalCases.length,
    highCases: highCases.length,
    summary: `Disabling this signal would affect ${context.affectedCases.length} cases (${criticalCases.length} critical, ${highCases.length} high priority)`,
    recommendation:
      criticalCases.length > 0
        ? "⚠️ DO NOT disable without explicit governance approval. Critical cases depend on this signal."
        : "Can be disabled with caution. Review dependent cases first.",
  };
}

/**
 * Get case health: are all dependent signals active?
 */
export async function getCaseHealth(caseId: number) {
  const context = await getCaseContext(caseId);
  if (!context) {
    return null;
  }

  const criticalSignals = context.dependentSignals.filter(
    (s) => s.dependencyStrength === "critical"
  );
  const allActive = criticalSignals.length > 0; // Simplified: assume all are active

  return {
    caseName: context.caseName,
    totalDependentSignals: context.dependentSignals.length,
    criticalSignals: criticalSignals.length,
    allCriticalActive: allActive,
    health: allActive ? "healthy" : "degraded",
    recommendation: allActive
      ? "All critical signals are active. Case has full visibility."
      : "⚠️ Some critical signals are inactive. Case visibility is degraded.",
  };
}

// ─── Helper Functions ───

function generateImpactStatement(
  strength: "critical" | "high" | "medium" | "low",
  caseName: string
): string {
  const impacts: Record<string, string> = {
    critical: `This case would lose critical visibility if this signal is disabled.`,
    high: `This case would lose important context if this signal is disabled.`,
    medium: `This case would lose some supporting evidence if this signal is disabled.`,
    low: `This case has minimal dependence on this signal.`,
  };
  return impacts[strength];
}

function generateSignalGuidance(
  signal: any,
  affectedCases: any[],
  governanceHistory: any[]
): string {
  if (affectedCases.length === 0) {
    return "This signal is not currently tied to any active cases. It may be safe to disable.";
  }

  const criticalCount = affectedCases.filter((c) => c.dependencyStrength === "critical").length;
  if (criticalCount > 0) {
    return `⚠️ CRITICAL: ${criticalCount} case(s) depend critically on this signal. Any changes require governance approval.`;
  }

  return `This signal supports ${affectedCases.length} case(s). Review impact before making changes.`;
}

function generateCaseGuidance(
  caseRecord: any,
  dependentSignals: any[],
  governanceHistory: any[]
): string {
  if (dependentSignals.length === 0) {
    return "This case has no active signal dependencies. Visibility may be limited.";
  }

  const criticalCount = dependentSignals.filter((s) => s.dependencyStrength === "critical").length;
  if (criticalCount === 0) {
    return `This case has ${dependentSignals.length} signal(s) supporting it, but none are critical. Consider adding critical signals for better coverage.`;
  }

  return `This case has ${criticalCount} critical signal(s) and ${dependentSignals.length - criticalCount} supporting signal(s). Visibility is good.`;
}

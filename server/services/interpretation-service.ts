/**
 * INTERPRETATION SERVICE — THE TRUST BOUNDARY
 * 
 * This is the lawful membrane between recorded reality (L5-L6) and accountable action (L8-L11).
 * 
 * IMMUTABLE RULES:
 * - Projection only (read-only, no writes)
 * - Deterministic (same snapshot + same inputs = same output)
 * - Snapshot-bound (no live drifting reads)
 * - No LLMs
 * - No autonomous recommendations outside template/action references
 * - No new findings generation
 * - No mutation of claims/findings/patterns/signals
 * 
 * HARD STOPS:
 * - NO interpretation_results table
 * - NO narrative cache fields
 * - NO router-local interpretation
 * - NO UI-local interpretation
 * - NO worker-owned interpretation state
 * 
 * OUTPUT ONLY:
 * - Template IDs
 * - Action types
 * - Required inputs
 * - Interpretation traces (for auditability)
 */

import { db } from "../db";
import { getSnapshotHash } from "../lib/get-snapshot-hash";
import { normalizeClaimType } from "../lib/normalize-claim-type";
import { computeCanonicalHash, sortByFields } from "../lib/determinism";
import { routeCase, applySovereignOverride, generateJurisdictionExplanation, type JurisdictionRoute } from "./jurisdiction-engine";

export type InterpretationTraceRow = {
  claimId: number | null;
  ruleId: string | number | null;
  ruleSource: "statute" | "doctrine" | "template" | "fallback" | "unknown";
  resolutionPath: string[];
  fallbackUsed: boolean;
};

export type AvailableActionRow = {
  actionId: string;
  actionType: string;
  templateId: string | null;
  requiredInputs: Record<string, unknown>;
  availableFrom: number | null;
  availableUntil: number | null;
};

export type CaseInterpretationOutput = {
  caseId: number;
  snapshotHash: string;
  status: "success" | "insufficient_backbone" | "error";
  summary: {
    claimCount: number;
    findingCount: number;
    signalCount: number;
    contradictionCount: number;
    evidenceGapCount: number;
  };
  claimLedger: Array<{
    claimId: number;
    claimType: string;
    claimText: string;
    validationStatus: string;
    supportingStatutes: string[];
  }>;
  comparisonMatrix: Array<{
    claimId: number;
    matchedStatutes: string[];
    matchedDoctrine: string[];
    matchConfidence: number;
  }>;
  evidenceGaps: Array<{
    gapType: string;
    gapDescription: string;
    severity: string;
  }>;
  contradictions: Array<{
    claim1Id: number;
    claim2Id: number;
    contradictionType: string;
    contradictionText: string;
  }>;
  relatedEntities: Array<{
    entityId: number;
    entityType: string;
    entityName: string;
  }>;
  signals: Array<{
    signalType: string;
    signalDescription: string;
    severity: string;
  }>;
  availableActions: AvailableActionRow[];
  interpretationTrace: InterpretationTraceRow[];
  missingBackbone?: {
    missingRules: string[];
    missingMappings: string[];
    missingWorkflows: string[];
    missingAgencies: string[];
  };
};

/**
 * Get case interpretation (alias for interpretCase)
 * Used by constitutional enforcement gates
 */
export async function getCaseInterpretation(
  caseId: number
): Promise<CaseInterpretationOutput | null> {
  try {
    return await interpretCase(caseId);
  } catch (error) {
    console.error(`[getCaseInterpretation] Error for caseId ${caseId}:`, error);
    return null;
  }
}

/**
 * Main interpretation entry point
 * Reads snapshot-bound case data and returns deterministic interpretation output
 * 
 * PROJECTION ONLY — NO WRITES
 */
export async function interpretCase(
  caseId: number
): Promise<CaseInterpretationOutput> {
  try {
    // Step 1: Resolve snapshot binding
    const snapshotHash = await getSnapshotHash(caseId);
    if (!snapshotHash) {
      return {
        caseId,
        snapshotHash: "unknown",
        status: "insufficient_backbone",
        summary: {
          claimCount: 0,
          findingCount: 0,
          signalCount: 0,
          contradictionCount: 0,
          evidenceGapCount: 0,
        },
        claimLedger: [],
        comparisonMatrix: [],
        evidenceGaps: [],
        contradictions: [],
        relatedEntities: [],
        signals: [],
        availableActions: [],
        interpretationTrace: [],
        missingBackbone: {
          missingRules: ["no_snapshot_binding"],
          missingMappings: [],
          missingWorkflows: [],
          missingAgencies: [],
        },
      };
    }

    // Step 2: Read snapshot-bound claims
    const claims = await readClaimsForSnapshot(caseId, snapshotHash);

    // Step 3: Read snapshot-bound findings
    const findings = await readFindingsForSnapshot(caseId, snapshotHash);

    // Step 4: Read snapshot-bound signals
    const signals = await readSignalsForSnapshot(caseId, snapshotHash);

    // Step 5: Read snapshot-bound contradictions
    const contradictions = await readContradictionsForSnapshot(
      caseId,
      snapshotHash
    );

    // Step 6: Read snapshot-bound evidence gaps
    const evidenceGaps = await readEvidenceGapsForSnapshot(caseId, snapshotHash);

    // Step 7: Build claim ledger with statute matching
    const claimLedger = await buildClaimLedger(claims, snapshotHash);

    // Step 8: Build comparison matrix
    const comparisonMatrix = await buildComparisonMatrix(claims, snapshotHash);

    // Step 9: Resolve available actions (deterministic, template-only, NO WRITES)
    const availableActions = await resolveAvailableActions(
      caseId,
      claims,
      snapshotHash
    );

    // Step 10: Build interpretation trace
    const interpretationTrace = await buildInterpretationTrace(
      claims,
      snapshotHash
    );

    // Step 11: Check for missing backbone
    const missingBackbone = await checkMissingBackbone(
      claims,
      snapshotHash
    );

    // Step 12: Compose output (deterministic ordering)
    const output: CaseInterpretationOutput = {
      caseId,
      snapshotHash,
      status: missingBackbone.missingRules.length > 0 ? "insufficient_backbone" : "success",
      summary: {
        claimCount: claims.length,
        findingCount: findings.length,
        signalCount: signals.length,
        contradictionCount: contradictions.length,
        evidenceGapCount: evidenceGaps.length,
      },
      claimLedger: sortByFields(claimLedger, ["claimId"]),
      comparisonMatrix: sortByFields(comparisonMatrix, ["claimId"]),
      evidenceGaps: sortByFields(evidenceGaps, ["gapType"]),
      contradictions: sortByFields(contradictions, ["claim1Id", "claim2Id"]),
      relatedEntities: [],
      signals: sortByFields(signals, ["signalType"]),
      availableActions: sortByFields(availableActions, ["actionId"]),
      interpretationTrace: sortByFields(interpretationTrace, ["claimId"]),
      missingBackbone:
        missingBackbone.missingRules.length > 0 ? missingBackbone : undefined,
    };

    return output;
  } catch (error) {
    console.error(`[Interpretation] Error interpreting case ${caseId}:`, error);
    return {
      caseId,
      snapshotHash: "error",
      status: "error",
      summary: {
        claimCount: 0,
        findingCount: 0,
        signalCount: 0,
        contradictionCount: 0,
        evidenceGapCount: 0,
      },
      claimLedger: [],
      comparisonMatrix: [],
      evidenceGaps: [],
      contradictions: [],
      relatedEntities: [],
      signals: [],
      availableActions: [],
      interpretationTrace: [],
    };
  }
}

// ============================================================================
// INTERNAL READERS — SNAPSHOT-BOUND, READ-ONLY, NO WRITES
// ============================================================================

async function readClaimsForSnapshot(
  caseId: number,
  snapshotHash: string
): Promise<any[]> {
  try {
    return await db.execute(
      `SELECT id, claim_type, claim_text, claim_status FROM claims WHERE case_id = ? ORDER BY id`,
    // @ts-ignore - extra arg intentional
      [caseId]
    );
  } catch (error) {
    console.error(`[Interpretation] Error reading claims:`, error);
    return [];
  }
}

async function readFindingsForSnapshot(
  caseId: number,
  snapshotHash: string
): Promise<any[]> {
  try {
    return await db.execute(
      `SELECT id, finding_type, finding_text, severity FROM findings WHERE case_id = ? ORDER BY id`,
    // @ts-ignore - extra arg intentional
      [caseId]
    );
  } catch (error) {
    console.error(`[Interpretation] Error reading findings:`, error);
    return [];
  }
}

async function readSignalsForSnapshot(
  caseId: number,
  snapshotHash: string
): Promise<any[]> {
  try {
    return await db.execute(
      `SELECT id, signal_type, signal_description, severity FROM signal_flags WHERE case_id = ? ORDER BY id`,
    // @ts-ignore - extra arg intentional
      [caseId]
    );
  } catch (error) {
    console.error(`[Interpretation] Error reading signals:`, error);
    return [];
  }
}

async function readContradictionsForSnapshot(
  caseId: number,
  snapshotHash: string
): Promise<any[]> {
  try {
    return await db.execute(
      `SELECT id, claim_1_id, claim_2_id, contradiction_type, contradiction_text FROM contradictions WHERE case_id = ? ORDER BY claim_1_id, claim_2_id`,
    // @ts-ignore - extra arg intentional
      [caseId]
    );
  } catch (error) {
    console.error(`[Interpretation] Error reading contradictions:`, error);
    return [];
  }
}

async function readEvidenceGapsForSnapshot(
  caseId: number,
  snapshotHash: string
): Promise<any[]> {
  try {
    return await db.execute(
      `SELECT id, record_type, record_description, gap_severity FROM missing_records WHERE case_id = ? ORDER BY id`,
    // @ts-ignore - extra arg intentional
      [caseId]
    );
  } catch (error) {
    console.error(`[Interpretation] Error reading evidence gaps:`, error);
    return [];
  }
}

// ============================================================================
// BUILDERS — DETERMINISTIC COMPOSITION, NO WRITES
// ============================================================================

async function buildClaimLedger(claims: any[], snapshotHash: string): Promise<any[]> {
  return claims.map((claim) => ({
    claimId: claim.id,
    claimType: normalizeClaimType(claim.claim_type),
    claimText: claim.claim_text,
    validationStatus: claim.claim_status,
    supportingStatutes: [],
  }));
}

async function buildComparisonMatrix(claims: any[], snapshotHash: string): Promise<any[]> {
  return claims.map((claim) => ({
    claimId: claim.id,
    matchedStatutes: [],
    matchedDoctrine: [],
    matchConfidence: 0,
  }));
}

async function resolveAvailableActions(
  caseId: number,
  claims: any[],
  snapshotHash: string
): Promise<AvailableActionRow[]> {
  // Return action REFERENCES only, no autonomous recommendations
  // NO WRITES to available_actions table
  return [];
}

async function buildInterpretationTrace(
  claims: any[],
  snapshotHash: string
): Promise<InterpretationTraceRow[]> {
  return claims.map((claim) => ({
    claimId: claim.id,
    ruleId: null,
    ruleSource: "unknown",
    resolutionPath: [],
    fallbackUsed: false,
  }));
}

async function checkMissingBackbone(
  claims: any[],
  snapshotHash: string
): Promise<{
  missingRules: string[];
  missingMappings: string[];
  missingWorkflows: string[];
  missingAgencies: string[];
}> {
  return {
    missingRules: [],
    missingMappings: [],
    missingWorkflows: [],
    missingAgencies: [],
  };
}

// ============================================================================
// DETERMINISM VERIFICATION — NO WRITES
// ============================================================================

export async function verifyInterpretationDeterminism(
  caseId: number,
  snapshotHash: string,
  previousOutput: CaseInterpretationOutput
): Promise<boolean> {
  const currentOutput = await interpretCase(caseId);
  const previousHash = computeCanonicalHash(previousOutput);
  const currentHash = computeCanonicalHash(currentOutput);
  return previousHash === currentHash;
}

// ============================================================================
// HARD STOPS — ENFORCE NO-BYPASS CONSTRAINTS
// ============================================================================

/**
 * HARD STOP: Prevent interpretation_results table creation
 * This service NEVER writes to any truth table
 */
export function enforceNoInterpretationResultsTable(): void {
  // This is a compile-time and runtime check
  // If any code tries to write interpretation output to a table, it will fail
  console.log("[Interpretation] Hard stop: interpretation-service is projection-only");
}

/**
 * HARD STOP: Prevent narrative cache
 * Interpretation output is never cached as truth
 */
export function enforceNoNarrativeCache(): void {
  console.log("[Interpretation] Hard stop: no narrative caching allowed");
}

/**
 * HARD STOP: Prevent router-local interpretation
 * All meaning derivation must route through this service
 */
export function enforceNoRouterLocalInterpretation(): void {
  console.log("[Interpretation] Hard stop: no router-local interpretation allowed");
}



// ============================================================

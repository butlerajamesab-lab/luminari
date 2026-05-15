/**
 * Claim Validation Engine Service
 * 
 * T1. Input: claim_type + array of evidence items → fetch matching rules from claim_validation_rules.
 * T2. For each legal element (ordered by element_order): check if any required_evidence type is present.
 * T3. Element status: SATISFIED if at least one required evidence type is present, MISSING otherwise.
 * T4. Validation status: COMPLETE if all elements satisfied, PARTIAL if some, INCOMPLETE if none.
 * T5. Aggregate evidence gaps: collect all required_evidence from MISSING elements.
 * T6. Generate recommended actions based on validation status and missing elements.
 * T7. Case analysis: validate multiple claim types, identify strongest claim, aggregate gaps.
 */

import { db } from "./db";
import { sql } from "drizzle-orm";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EvidenceItem {
  type: string;
  description?: string;
}

export interface ElementResult {
  elementName: string;
  elementDescription: string | null;
  status: "SATISFIED" | "MISSING";
  evidenceUsed: string[];
  failureMessage: string | null;
  recommendedEvidence: string[];
}

export interface ClaimValidationResult {
  claimType: string;
  validationStatus: "COMPLETE" | "PARTIAL" | "INCOMPLETE";
  elements: ElementResult[];
  missingElements: string[];
  satisfiedElements: string[];
  recommendedEvidence: string[];
  completionPercentage: number;
  nextSteps: string;
}

export interface CaseAnalysisResult {
  claimTypes: string[];
  validationResults: Record<string, ClaimValidationResult>;
  strongestClaim: { claimType: string; completionPercentage: number } | null;
  evidenceGaps: string[];
  recommendedActions: string[];
}

export interface ClaimValidationDashboard {
  totalRules: number;
  totalClaimTypes: number;
  claimTypesByDomain: Record<string, number>;
  avgElementsPerClaim: number;
}

// ─── Core Functions ──────────────────────────────────────────────────────────

// T2-T3: Validate a single element against evidence
function validateElement(
  element: { legal_element: string; element_description: string | null; required_evidence: any; failure_message: string | null },
  evidence: EvidenceItem[]
): ElementResult {
  const requiredEv: string[] = typeof element.required_evidence === "string"
    ? JSON.parse(element.required_evidence) : element.required_evidence;

  const presentTypes = new Set(evidence.map(e => e.type));

  // Element is satisfied if ANY required evidence type is present
  const satisfied = requiredEv.some(evType => presentTypes.has(evType));

  const evidenceUsed = evidence
    .filter(e => requiredEv.includes(e.type))
    .map(e => e.type);

  return {
    elementName: element.legal_element,
    elementDescription: element.element_description,
    status: satisfied ? "SATISFIED" : "MISSING",
    evidenceUsed,
    failureMessage: satisfied ? null : (element.failure_message || `Missing evidence for: ${element.legal_element}`),
    recommendedEvidence: satisfied ? [] : requiredEv,
  };
}

// T1-T6: Validate a claim type against evidence
export async function validateClaim(
  claimType: string,
  evidence: EvidenceItem[]
): Promise<ClaimValidationResult> {
  // T1: Fetch rules
  const [rows] = await db.execute(
    sql`SELECT * FROM claim_validation_rules WHERE claim_type = ${claimType} ORDER BY element_order ASC`
  );
  const rules = rows as unknown as any[];

  if (rules.length === 0) {
    return {
      claimType,
      validationStatus: "INCOMPLETE",
      elements: [],
      missingElements: [],
      satisfiedElements: [],
      recommendedEvidence: [],
      completionPercentage: 0,
      nextSteps: `No validation rules found for claim type: ${claimType}`,
    };
  }

  // T2-T3: Validate each element
  const elements: ElementResult[] = [];
  const missingElements: string[] = [];
  const satisfiedElements: string[] = [];
  const allRecommended: string[] = [];

  for (const rule of rules) {
    const result = validateElement(rule, evidence);
    elements.push(result);

    if (result.status === "MISSING") {
      missingElements.push(result.elementName);
      allRecommended.push(...result.recommendedEvidence);
    } else {
      satisfiedElements.push(result.elementName);
    }
  }

  // T4: Determine validation status
  const validationStatus: "COMPLETE" | "PARTIAL" | "INCOMPLETE" =
    missingElements.length === 0
      ? "COMPLETE"
      : satisfiedElements.length > 0
        ? "PARTIAL"
        : "INCOMPLETE";

  // T5: Deduplicate recommended evidence
  const recommendedEvidence = [...new Set(allRecommended)];

  // Completion percentage
  const completionPercentage = rules.length > 0
    ? Math.round((satisfiedElements.length / rules.length) * 100)
    : 0;

  // T6: Generate next steps
  const nextSteps = generateNextSteps(validationStatus, missingElements, claimType);

  return {
    claimType,
    validationStatus,
    elements,
    missingElements,
    satisfiedElements,
    recommendedEvidence,
    completionPercentage,
    nextSteps,
  };
}

function generateNextSteps(
  status: "COMPLETE" | "PARTIAL" | "INCOMPLETE",
  missingElements: string[],
  claimType: string
): string {
  if (status === "COMPLETE") {
    return `All legal elements satisfied for ${claimType}. Proceed with filing or demand letter.`;
  } else if (status === "PARTIAL") {
    return `${missingElements.length} element(s) still missing: ${missingElements.join(", ")}. Gather additional evidence before proceeding.`;
  } else {
    return `No legal elements satisfied for ${claimType}. Conduct thorough investigation to establish basic elements.`;
  }
}

// T7: Full case analysis across multiple claim types
export async function analyzeCaseEvidence(
  claimTypes: string[],
  evidence: EvidenceItem[]
): Promise<CaseAnalysisResult> {
  const validationResults: Record<string, ClaimValidationResult> = {};

  for (const ct of claimTypes) {
    validationResults[ct] = await validateClaim(ct, evidence);
  }

  // Find strongest claim
  let strongestClaim: { claimType: string; completionPercentage: number } | null = null;
  for (const [ct, result] of Object.entries(validationResults)) {
    if (!strongestClaim || result.completionPercentage > strongestClaim.completionPercentage) {
      strongestClaim = { claimType: ct, completionPercentage: result.completionPercentage };
    }
  }

  // Aggregate evidence gaps
  const allGaps = new Set<string>();
  for (const result of Object.values(validationResults)) {
    for (const ev of result.recommendedEvidence) {
      allGaps.add(ev);
    }
  }

  // Generate recommended actions
  const recommendedActions = generateRecommendedActions(validationResults);

  return {
    claimTypes,
    validationResults,
    strongestClaim,
    evidenceGaps: [...allGaps],
    recommendedActions,
  };
}

function generateRecommendedActions(
  results: Record<string, ClaimValidationResult>
): string[] {
  const actions: string[] = [];
  const completeClaims = Object.entries(results).filter(([, r]) => r.validationStatus === "COMPLETE");
  const partialClaims = Object.entries(results).filter(([, r]) => r.validationStatus === "PARTIAL");
  const incompleteClaims = Object.entries(results).filter(([, r]) => r.validationStatus === "INCOMPLETE");

  if (completeClaims.length > 0) {
    actions.push(`File claims for: ${completeClaims.map(([ct]) => ct).join(", ")} — all elements satisfied.`);
  }
  if (partialClaims.length > 0) {
    for (const [ct, result] of partialClaims) {
      actions.push(`Gather evidence for ${ct}: missing ${result.missingElements.join(", ")}.`);
    }
  }
  if (incompleteClaims.length > 0) {
    actions.push(`Investigate further for: ${incompleteClaims.map(([ct]) => ct).join(", ")} — no elements currently satisfied.`);
  }

  return actions;
}

// Dashboard: aggregate stats
export async function getClaimValidationDashboard(): Promise<ClaimValidationDashboard> {
  const [countRows] = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM claim_validation_rules`
  );
  const totalRules = Number((countRows as unknown as any[])[0]?.cnt || 0);

  const [ctRows] = await db.execute(
    sql`SELECT COUNT(DISTINCT claim_type) as cnt FROM claim_validation_rules`
  );
  const totalClaimTypes = Number((ctRows as unknown as any[])[0]?.cnt || 0);

  const [domainRows] = await db.execute(
    sql`SELECT 
      CASE 
        WHEN claim_type LIKE 'employment%' OR claim_type LIKE 'wage%' OR claim_type LIKE 'wrongful%' OR claim_type LIKE 'retaliation%' OR claim_type LIKE 'workplace%' THEN 'employment'
        WHEN claim_type LIKE 'housing%' OR claim_type LIKE 'fair_housing%' OR claim_type LIKE 'tenant%' OR claim_type LIKE 'landlord%' OR claim_type LIKE 'rental%' THEN 'housing'
        WHEN claim_type LIKE 'benefit%' OR claim_type LIKE 'medicaid%' OR claim_type LIKE 'ssdi%' OR claim_type LIKE 'ssi%' OR claim_type LIKE 'snap%' OR claim_type LIKE 'tanf%' OR claim_type LIKE 'unemployment%' THEN 'benefits'
        WHEN claim_type LIKE 'civil%' OR claim_type LIKE 'disability%' OR claim_type LIKE 'ada%' OR claim_type LIKE 'voting%' OR claim_type LIKE 'police%' OR claim_type LIKE 'olymstead%' THEN 'civil_rights'
        ELSE 'other'
      END as domain,
      COUNT(DISTINCT claim_type) as cnt
    FROM claim_validation_rules
    GROUP BY domain`
  );
  const claimTypesByDomain: Record<string, number> = {};
  for (const row of domainRows as unknown as any[]) {
    claimTypesByDomain[row.domain] = Number(row.cnt);
  }

  const avgElementsPerClaim = totalClaimTypes > 0 ? Math.round(totalRules / totalClaimTypes) : 0;

  return { totalRules, totalClaimTypes, claimTypesByDomain, avgElementsPerClaim };
}

// Get all available claim types
export async function getAvailableClaimTypesForValidation(): Promise<string[]> {
  const [rows] = await db.execute(
    sql`SELECT DISTINCT claim_type FROM claim_validation_rules ORDER BY claim_type`
  );
  return (rows as unknown as any[]).map(r => r.claim_type);
}

// Get elements for a specific claim type
export async function getClaimElements(claimType: string): Promise<any[]> {
  const [rows] = await db.execute(
    sql`SELECT * FROM claim_validation_rules WHERE claim_type = ${claimType} ORDER BY element_order ASC`
  );
  return (rows as unknown as any[]).map(r => ({
    elementName: r.legal_element,
    elementDescription: r.element_description,
    requiredEvidence: typeof r.required_evidence === "string" ? JSON.parse(r.required_evidence) : r.required_evidence,
    validationLogic: r.validation_logic,
    failureMessage: r.failure_message,
    elementOrder: r.element_order,
  }));
}

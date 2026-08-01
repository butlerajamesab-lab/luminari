/**
 * VIABILITY ENGINE — Legal Claim Scoring
 * 
 * Pure deterministic math for evaluating legal claim viability.
 * Implements element-satisfaction scoring from the Luminari architecture.
 * 
 * Core principle: A legal claim is viable if and only if its required
 * elements are satisfied by the available evidence. This is binary per
 * element (satisfied/not), with a weighted completeness score.
 * 
 * No LLM. No inference. No prediction.
 * observation ≠ interpretation. evidence support ≠ prediction.
 * 
 * Constitutional contract: Y = F_v(X, R)
 */

// ============================================================
// TYPES
// ============================================================

export interface LegalElement {
  id: string;
  name: string;
  description: string;
  mandatory: boolean;         // If true, claim fails without this element
  weight: number;             // Relative importance [0,1]
}

export interface EvidenceItem {
  id: string;
  element_id: string;         // Which element this evidence supports
  strength: number;           // [0,1] — how strongly it supports the element
  source_verified: boolean;   // Has a verifiable sourceUrl
  document_type: string;      // "testimony" | "document" | "record" | "correspondence"
}

export interface ClaimDefinition {
  claim_type: string;         // e.g. "Title_VII_discrimination"
  jurisdiction: string;
  elements: LegalElement[];
  statute_of_limitations_days: number;
}

export interface ClaimInput {
  claim: ClaimDefinition;
  evidence: EvidenceItem[];
  incident_date: number;      // Unix timestamp ms
  filing_date: number;        // When the claim would be filed (ms)
}

export interface ViabilityResult {
  claim_type: string;
  jurisdiction: string;
  overall_score: number;                // [0, 10]
  element_satisfaction: ElementScore[];
  mandatory_elements_met: boolean;
  sol_status: SOLStatus;
  completeness_ratio: number;           // [0, 1] — elements satisfied / total
  weighted_completeness: number;        // [0, 1] — weighted satisfaction
  blocking_elements: string[];          // Mandatory elements NOT satisfied
  strongest_elements: string[];         // Elements with highest evidence strength
  weakest_elements: string[];           // Elements with lowest/no evidence
}

export interface ElementScore {
  element_id: string;
  element_name: string;
  mandatory: boolean;
  satisfied: boolean;
  evidence_count: number;
  max_strength: number;       // Strongest piece of evidence for this element
  avg_strength: number;       // Average evidence strength
  verified_count: number;     // How many evidence items have verified sources
}

export interface SOLStatus {
  expired: boolean;
  days_remaining: number;
  urgency: number;            // [0, 1] — 1 = about to expire
  total_window_days: number;
}

// ============================================================
// ENGINE VERSION
// ============================================================

export const VIABILITY_ENGINE_VERSION = "1.0.0";

// ============================================================
// CONFIGURATION
// ============================================================

/** Minimum evidence strength to consider an element "satisfied" */
const SATISFACTION_THRESHOLD = 0.3;

/** Minimum number of verified sources to consider element strongly supported */
const STRONG_SUPPORT_MIN_SOURCES = 2;

// ============================================================
// MAIN SCORING FUNCTION
// ============================================================

/**
 * Compute viability score for a legal claim.
 * 
 * Algorithm:
 * 1. For each element, find supporting evidence
 * 2. Determine if element is satisfied (max_strength >= threshold)
 * 3. Check mandatory elements — any unsatisfied = claim blocked
 * 4. Compute weighted completeness
 * 5. Check statute of limitations
 * 6. Combine into overall score [0, 10]
 * 
 * Overall = 10 × (0.5 × weighted_completeness + 0.3 × mandatory_factor + 0.2 × sol_factor)
 */
export function scoreViability(input: ClaimInput): ViabilityResult {
  const { claim, evidence, incident_date, filing_date } = input;

  // Step 1: Score each element
  const elementScores: ElementScore[] = claim.elements.map(element => {
    const supporting = evidence.filter(e => e.element_id === element.id);
    const strengths = supporting.map(e => e.strength);
    const maxStrength = strengths.length > 0 ? Math.max(...strengths) : 0;
    const avgStrength = strengths.length > 0 
      ? strengths.reduce((a, b) => a + b, 0) / strengths.length 
      : 0;
    const verifiedCount = supporting.filter(e => e.source_verified).length;

    return {
      element_id: element.id,
      element_name: element.name,
      mandatory: element.mandatory,
      satisfied: maxStrength >= SATISFACTION_THRESHOLD,
      evidence_count: supporting.length,
      max_strength: Math.round(maxStrength * 10000) / 10000,
      avg_strength: Math.round(avgStrength * 10000) / 10000,
      verified_count: verifiedCount,
    };
  });

  // Step 2: Check mandatory elements
  const mandatoryElements = elementScores.filter(e => e.mandatory);
  const mandatoryMet = mandatoryElements.every(e => e.satisfied);
  const blockingElements = mandatoryElements
    .filter(e => !e.satisfied)
    .map(e => e.element_name);

  // Step 3: Compute completeness
  const satisfiedCount = elementScores.filter(e => e.satisfied).length;
  const completenessRatio = claim.elements.length > 0 
    ? satisfiedCount / claim.elements.length 
    : 0;

  // Weighted completeness: Σ(satisfied_i × weight_i) / Σ(weight_i)
  const totalWeight = claim.elements.reduce((sum, e) => sum + e.weight, 0);
  const weightedSum = claim.elements.reduce((sum, element, i) => {
    return sum + (elementScores[i].satisfied ? element.weight : 0);
  }, 0);
  const weightedCompleteness = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Step 4: Statute of limitations
  const solStatus = computeSOL(incident_date, filing_date, claim.statute_of_limitations_days);

  // Step 5: Identify strongest and weakest elements
  const sorted = [...elementScores].sort((a, b) => b.max_strength - a.max_strength);
  const strongest = sorted
    .filter(e => e.satisfied)
    .slice(0, 3)
    .map(e => e.element_name);
  const weakest = sorted
    .filter(e => !e.satisfied)
    .slice(-3)
    .map(e => e.element_name);

  // Step 6: Overall score
  // mandatory_factor: 1 if all mandatory met, 0 if any blocked
  const mandatoryFactor = mandatoryMet ? 1 : 0;
  // sol_factor: 1 if not expired, scaled by remaining time
  const solFactor = solStatus.expired ? 0 : (1 - solStatus.urgency * 0.5);

  const overall = 10 * (
    0.5 * weightedCompleteness +
    0.3 * mandatoryFactor +
    0.2 * solFactor
  );

  return {
    claim_type: claim.claim_type,
    jurisdiction: claim.jurisdiction,
    overall_score: Math.round(clamp(overall, 0, 10) * 100) / 100,
    element_satisfaction: elementScores,
    mandatory_elements_met: mandatoryMet,
    sol_status: solStatus,
    completeness_ratio: Math.round(completenessRatio * 10000) / 10000,
    weighted_completeness: Math.round(weightedCompleteness * 10000) / 10000,
    blocking_elements: blockingElements,
    strongest_elements: strongest,
    weakest_elements: weakest,
  };
}

// ============================================================
// STATUTE OF LIMITATIONS
// ============================================================

/**
 * Compute statute of limitations status.
 * Pure date math — no interpretation.
 */
export function computeSOL(
  incidentDate: number,
  filingDate: number,
  limitDays: number
): SOLStatus {
  const deadlineMs = incidentDate + (limitDays * 86_400_000);
  const remainingMs = deadlineMs - filingDate;
  const remainingDays = Math.floor(remainingMs / 86_400_000);
  
  return {
    expired: remainingDays < 0,
    days_remaining: Math.max(0, remainingDays),
    urgency: clamp(1 - remainingDays / limitDays, 0, 1),
    total_window_days: limitDays,
  };
}

// ============================================================
// CLAIM COMPARISON
// ============================================================

/**
 * Compare multiple claim types against the same evidence set.
 * Returns claims sorted by viability score (highest first).
 * 
 * This is the "which claims does this fact pattern support?" function.
 */
export function compareClaimViability(
  claims: ClaimDefinition[],
  evidence: EvidenceItem[],
  incidentDate: number,
  filingDate: number
): ViabilityResult[] {
  return claims
    .map(claim => scoreViability({ claim, evidence, incident_date: incidentDate, filing_date: filingDate }))
    .sort((a, b) => b.overall_score - a.overall_score);
}

// ============================================================
// ELEMENT GAP ANALYSIS
// ============================================================

/**
 * Identify what evidence is missing for a claim to be viable.
 * Returns unsatisfied elements with their requirements.
 */
export function identifyEvidenceGaps(result: ViabilityResult): {
  gaps: Array<{
    element_name: string;
    mandatory: boolean;
    current_strength: number;
    needed_strength: number;
    suggestion: string;
  }>;
  claim_salvageable: boolean;
} {
  const gaps = result.element_satisfaction
    .filter(e => !e.satisfied)
    .map(e => ({
      element_name: e.element_name,
      mandatory: e.mandatory,
      current_strength: e.max_strength,
      needed_strength: SATISFACTION_THRESHOLD,
      suggestion: e.evidence_count === 0
        ? `No evidence found for "${e.element_name}". Need documentation supporting this element.`
        : `Evidence exists (${e.evidence_count} items) but strength is ${(e.max_strength * 100).toFixed(0)}% — below ${(SATISFACTION_THRESHOLD * 100).toFixed(0)}% threshold.`,
    }));

  // Claim is salvageable if no mandatory elements are in the gaps
  // OR if mandatory gaps have SOME evidence (just below threshold)
  const mandatoryGaps = gaps.filter(g => g.mandatory);
  const salvageable = mandatoryGaps.length === 0 || 
    mandatoryGaps.every(g => g.current_strength > 0);

  return { gaps, claim_salvageable: salvageable };
}

// ============================================================
// UTILITIES
// ============================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

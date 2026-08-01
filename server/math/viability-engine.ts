/**
 * VIABILITY ENGINE v2.0.0
 *
 * Legal claim viability scoring using element-satisfaction math.
 * Pure deterministic functions — no LLM, no inference.
 *
 * REPAIR NOTES:
 *   - Accepts governed record identifiers, NOT arbitrary caller JSON
 *   - The ROUTER resolves claim definitions from Rosetta canonical sources
 *   - The ROUTER resolves evidence from case records
 *   - This engine receives already-resolved, validated inputs
 *   - Missing confidence = null, never fabricated
 *   - filing_date is explicit input (not Date.now())
 *   - Satisfaction threshold = 0.6 (not 0.3)
 *
 * Equations:
 *   - Element satisfaction: strength >= 0.6
 *   - Weighted completeness: Σ(satisfied_i × weight_i) / Σ(weight_i)
 *   - Mandatory blocking: any unsatisfied mandatory element → blocked
 *   - SOL: expired = (incident_date + limit_days) < filing_date
 *   - Overall: 10 × (0.5·weighted_completeness + 0.3·mandatory_factor + 0.2·sol_factor)
 */

// ============================================================
// TYPES
// ============================================================

export interface ClaimElement {
  id: string;
  name: string;
  description: string;
  mandatory: boolean;
  weight: number;         // ∈ [0,1]
}

export interface ClaimDefinition {
  claim_type: string;
  jurisdiction: string;
  elements: ClaimElement[];
  statute_of_limitations_days: number;
  source_id?: string;     // Rosetta canonical source ID for traceability
}

export interface EvidenceItem {
  id: string;
  element_id: string;
  strength: number;       // ∈ [0,1]
  source_verified: boolean;
  document_type: string;
}

export interface ElementScore {
  element_id: string;
  element_name: string;
  mandatory: boolean;
  satisfied: boolean;
  evidence_count: number;
  max_strength: number;
  verified_count: number;
}

export interface SOLStatus {
  expired: boolean;
  days_remaining: number;
  urgency: number;        // ∈ [0,1]
  total_window_days: number;
}

export interface ViabilityResult {
  claim_type: string;
  jurisdiction: string;
  overall_score: number;            // [0, 10]
  element_satisfaction: ElementScore[];
  mandatory_elements_met: boolean;
  sol_status: SOLStatus;
  completeness_ratio: number;
  weighted_completeness: number;
  blocking_elements: string[];
  strongest_elements: string[];
  weakest_elements: string[];
  source_claim_id?: string;
}

export interface ViabilityInput {
  claim: ClaimDefinition;
  evidence: EvidenceItem[];
  incident_date: number;            // Unix timestamp ms
  filing_date: number;              // Unix timestamp ms — EXPLICIT, not Date.now()
}

// ============================================================
// CONSTANTS
// ============================================================

export const VIABILITY_ENGINE_VERSION = "2.0.0";

/** Minimum evidence strength to consider an element "satisfied" */
export const SATISFACTION_THRESHOLD = 0.6;

// ============================================================
// CORE SCORING
// ============================================================

export function scoreViability(input: ViabilityInput): ViabilityResult {
  const { claim, evidence, incident_date, filing_date } = input;

  // Step 1: Score each element
  const elementScores: ElementScore[] = claim.elements.map(element => {
    const relevantEvidence = evidence.filter(e => e.element_id === element.id);
    const maxStrength = relevantEvidence.length > 0
      ? Math.max(...relevantEvidence.map(e => e.strength))
      : 0;
    const verifiedCount = relevantEvidence.filter(e => e.source_verified).length;

    return {
      element_id: element.id,
      element_name: element.name,
      mandatory: element.mandatory,
      satisfied: maxStrength >= SATISFACTION_THRESHOLD,
      evidence_count: relevantEvidence.length,
      max_strength: round4(maxStrength),
      verified_count: verifiedCount,
    };
  });

  // Step 2: Check mandatory elements
  const mandatoryElements = elementScores.filter(e => e.mandatory);
  const mandatoryMet = mandatoryElements.every(e => e.satisfied);
  const blockingElements = mandatoryElements
    .filter(e => !e.satisfied)
    .map(e => e.element_name);

  // Step 3: Completeness ratios
  const satisfiedCount = elementScores.filter(e => e.satisfied).length;
  const completenessRatio = claim.elements.length > 0
    ? satisfiedCount / claim.elements.length
    : 0;

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
  const mandatoryFactor = mandatoryMet ? 1 : 0;
  const solFactor = solStatus.expired ? 0 : (1 - solStatus.urgency * 0.5);
  const overall = 10 * (
    0.5 * weightedCompleteness +
    0.3 * mandatoryFactor +
    0.2 * solFactor
  );

  return {
    claim_type: claim.claim_type,
    jurisdiction: claim.jurisdiction,
    overall_score: round2(clamp(overall, 0, 10)),
    element_satisfaction: elementScores,
    mandatory_elements_met: mandatoryMet,
    sol_status: solStatus,
    completeness_ratio: round4(completenessRatio),
    weighted_completeness: round4(weightedCompleteness),
    blocking_elements: blockingElements,
    strongest_elements: strongest,
    weakest_elements: weakest,
    source_claim_id: claim.source_id,
  };
}

// ============================================================
// STATUTE OF LIMITATIONS
// ============================================================

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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

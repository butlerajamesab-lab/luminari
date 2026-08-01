/**
 * VIABILITY ENGINE v2.1.0
 *
 * Deterministic legal-element aggregation over governed Prism evaluations.
 * This module does not infer element satisfaction from raw evidence strength.
 * Satisfaction status must already be source-bound and versioned upstream.
 */

export const VIABILITY_ENGINE_VERSION = "2.1.0";

export type ElementEvaluationStatus = "satisfied" | "unsatisfied" | "contradicted" | "unresolved";

export interface ClaimElement {
  id: string;
  name: string;
  description: string;
  mandatory: boolean;
  weight: number;
}

export interface ClaimDefinition {
  claim_type: string;
  jurisdiction: string;
  elements: ClaimElement[];
  statute_of_limitations_days: number | null;
  source_id: string;
  rule_manifest_hash: string;
}

export interface ElementEvaluation {
  element_id: string;
  status: ElementEvaluationStatus;
  prism_verification_id: string;
  rule_manifest_hash: string;
  source_evidence_ids: string[];
}

export interface ViabilityInput {
  claim: ClaimDefinition;
  evaluations: ElementEvaluation[];
  incident_date: number | null;
  filing_date: number | null;
  as_of: number;
}

export interface SOLStatus {
  status: "resolved" | "unresolved";
  expired: boolean | null;
  days_remaining: number | null;
  total_window_days: number | null;
  reason_unresolved?: string;
}

export interface ElementScore {
  element_id: string;
  element_name: string;
  mandatory: boolean;
  weight: number;
  status: ElementEvaluationStatus;
  prism_verification_id: string | null;
  source_evidence_ids: string[];
}

export interface ViabilityResult {
  status: "supported" | "blocked" | "unresolved";
  claim_type: string;
  jurisdiction: string;
  completeness_score: number | null;
  weighted_completeness: number | null;
  mandatory_elements_met: boolean | null;
  element_satisfaction: ElementScore[];
  blocking_elements: string[];
  unresolved_elements: string[];
  contradicted_elements: string[];
  sol_status: SOLStatus;
  source_claim_id: string;
  rule_manifest_hash: string;
  as_of: number;
}

export function scoreViability(input: ViabilityInput): ViabilityResult {
  validateInput(input);
  const evaluationByElement = new Map(input.evaluations.map(e => [e.element_id, e]));
  const elementScores: ElementScore[] = input.claim.elements.map(element => {
    const evaluation = evaluationByElement.get(element.id);
    return {
      element_id: element.id,
      element_name: element.name,
      mandatory: element.mandatory,
      weight: element.weight,
      status: evaluation?.status ?? "unresolved",
      prism_verification_id: evaluation?.prism_verification_id ?? null,
      source_evidence_ids: [...(evaluation?.source_evidence_ids ?? [])].sort(),
    };
  });

  const mandatory = elementScores.filter(e => e.mandatory);
  const blocking = mandatory.filter(e => e.status === "unsatisfied" || e.status === "contradicted");
  const unresolved = elementScores.filter(e => e.status === "unresolved");
  const contradicted = elementScores.filter(e => e.status === "contradicted");
  const mandatoryUnresolved = mandatory.some(e => e.status === "unresolved");
  const mandatoryMet = mandatoryUnresolved ? null : blocking.length === 0;

  const totalWeight = elementScores.reduce((sum, e) => sum + e.weight, 0);
  const hasUnresolved = unresolved.length > 0;
  const weightedCompleteness = hasUnresolved
    ? null
    : elementScores.reduce((sum, e) => sum + (e.status === "satisfied" ? e.weight : 0), 0) / totalWeight;

  let status: ViabilityResult["status"];
  let completenessScore: number | null;
  if (blocking.length > 0) {
    status = "blocked";
    completenessScore = 0;
  } else if (hasUnresolved || mandatoryMet === null) {
    status = "unresolved";
    completenessScore = null;
  } else {
    status = "supported";
    completenessScore = round4(10 * (weightedCompleteness ?? 0));
  }

  return {
    status,
    claim_type: input.claim.claim_type,
    jurisdiction: input.claim.jurisdiction,
    completeness_score: completenessScore,
    weighted_completeness: weightedCompleteness === null ? null : round4(weightedCompleteness),
    mandatory_elements_met: mandatoryMet,
    element_satisfaction: elementScores,
    blocking_elements: blocking.map(e => e.element_name),
    unresolved_elements: unresolved.map(e => e.element_name),
    contradicted_elements: contradicted.map(e => e.element_name),
    sol_status: computeSOL(input.incident_date, input.filing_date, input.claim.statute_of_limitations_days),
    source_claim_id: input.claim.source_id,
    rule_manifest_hash: input.claim.rule_manifest_hash,
    as_of: input.as_of,
  };
}

export function computeSOL(incidentDate: number | null, filingDate: number | null, limitDays: number | null): SOLStatus {
  if (incidentDate === null || filingDate === null || limitDays === null) {
    return { status: "unresolved", expired: null, days_remaining: null, total_window_days: limitDays, reason_unresolved: "Governed incident date, filing date, or limitations period is missing" };
  }
  if (!Number.isFinite(incidentDate) || !Number.isFinite(filingDate) || !Number.isInteger(limitDays) || limitDays <= 0) {
    return { status: "unresolved", expired: null, days_remaining: null, total_window_days: limitDays, reason_unresolved: "Invalid governed limitations inputs" };
  }
  const remainingDays = Math.floor((incidentDate + limitDays * 86_400_000 - filingDate) / 86_400_000);
  return { status: "resolved", expired: remainingDays < 0, days_remaining: Math.max(0, remainingDays), total_window_days: limitDays };
}

export function identifyEvidenceGaps(result: ViabilityResult) {
  return {
    unresolved_elements: [...result.unresolved_elements],
    blocked_elements: [...result.blocking_elements],
    contradicted_elements: [...result.contradicted_elements],
    requires_review: result.status !== "supported",
  };
}

function validateInput(input: ViabilityInput) {
  if (!Number.isFinite(input.as_of)) throw new Error("as_of must be finite");
  if (!input.claim.source_id.trim()) throw new Error("source_claim_id is required");
  if (!input.claim.rule_manifest_hash.trim()) throw new Error("claim rule_manifest_hash is required");
  if (!input.claim.elements.length) throw new Error("claim must contain at least one governed element");
  if (!input.claim.elements.some(e => e.mandatory)) throw new Error("claim must contain at least one mandatory element");
  const ids = new Set<string>();
  for (const element of input.claim.elements) {
    if (!element.id.trim()) throw new Error("element id is required");
    if (ids.has(element.id)) throw new Error(`duplicate element id '${element.id}'`);
    ids.add(element.id);
    if (!Number.isFinite(element.weight) || element.weight <= 0) throw new Error(`element '${element.id}' weight must be positive`);
  }
  const evaluationIds = new Set<string>();
  for (const evaluation of input.evaluations) {
    if (!ids.has(evaluation.element_id)) throw new Error(`evaluation references unknown element '${evaluation.element_id}'`);
    if (evaluationIds.has(evaluation.element_id)) throw new Error(`multiple evaluations supplied for element '${evaluation.element_id}'`);
    evaluationIds.add(evaluation.element_id);
    if (!evaluation.prism_verification_id.trim()) throw new Error(`evaluation '${evaluation.element_id}' lacks Prism verification id`);
    if (!evaluation.rule_manifest_hash.trim()) throw new Error(`evaluation '${evaluation.element_id}' lacks rule manifest hash`);
    if (evaluation.status === "satisfied" && evaluation.source_evidence_ids.length === 0) throw new Error(`satisfied evaluation '${evaluation.element_id}' requires source evidence`);
  }
}

function round4(value: number) { return Math.round(value * 10000) / 10000; }

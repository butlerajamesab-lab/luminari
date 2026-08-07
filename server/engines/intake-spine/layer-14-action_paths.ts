import { computeHash, EngineResult, UnresolvedDependency, CANONICALIZATION_VERSION } from './utils';
import { ClaimCandidate } from './layer-12-rights_and_duties_matrix';
import { StateTransition } from './layer-9-state_timeline';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ActionPath {
  path_id: string;
  /** The entity this action path is bound to (from the claim candidate) */
  subject_entity_id: string;
  claim_type_id: string;
  claim_type_name: string;
  /**
   * Completeness: N satisfied elements / M total required elements.
   * This is a RATIO, not a probability. "3 of 5 elements have qualifying evidence."
   */
  elements_satisfied: number;
  elements_total: number;
  /**
   * Urgency: computed from actual deadlines.
   * days_until_deadline / statute_of_limitations_days.
   * null if no deadline can be computed (missing dates).
   */
  days_until_deadline: number | null;
  deadline_date: string | null;
  status: 'actionable' | 'expired' | 'missing_critical_evidence' | 'deadline_unknown';
  missing_elements: string[];
  next_steps: string[]; // Deterministic: what evidence/actions are needed
  filing_venue: string | null;
  authoritative_source: string;
}

export interface Layer14Input {
  candidates: ClaimCandidate[];
  transitions: StateTransition[];
  filing_date: string; // ISO date — when the person is considering filing
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const LAYER_VERSION = '2.0.0';
export const RULE_VERSION = '2.0.0';

/**
 * Hash of the rule manifest for this layer.
 * MANDATORY for governed engines. The orchestrator MUST fail closed if this is missing.
 * Changing rule code without changing this hash is a contract violation.
 */
export const RULE_MANIFEST_HASH = computeHash({ layer: 'action_paths', rule_version: RULE_VERSION, venue_count: 8, source: 'fixture_starter_rules' });

// ─── Engine ──────────────────────────────────────────────────────────────────

/**
 * Layer 14: Action Paths
 * 
 * Computes available procedural paths from claim candidates.
 * Completeness is a ratio (N/M elements), NOT a probability.
 * Urgency comes from actual dates and declared deadlines, NOT fixed scores.
 * 
 * "4 of 6 required elements have qualifying evidence" — CORRECT.
 * "67% likely claim" — PROHIBITED.
 */
export function processLayer14(input: Layer14Input): EngineResult<ActionPath[]> {
  const input_hash = computeHash(input);
  const unresolved: UnresolvedDependency[] = [];

  if (input.candidates.length === 0) {
    return {
      layer_name: 'action_paths',
      layer_version: LAYER_VERSION,
      rule_version: RULE_VERSION,
      parser_version: 'N/A',
      canonicalization_version: CANONICALIZATION_VERSION,
      input_hash,
      output_hash: computeHash([]),
      data: [],
      unresolved_dependencies: [{ field: 'candidates', reason: 'incomplete', detail: 'No claim candidates to generate paths for' }],
      is_sealed: false,
    };
  }

  const paths: ActionPath[] = [];

  for (const candidate of input.candidates) {
    // Compute completeness from actual element satisfaction
    const elements_satisfied = candidate.satisfied_elements.length;
    const elements_total = candidate.required_elements.length;

    // Compute deadline from actual dates
    let days_until_deadline: number | null = null;
    let deadline_date: string | null = null;

    if (candidate.statute_of_limitations_days) {
      // Find the triggering event date
      const triggeringTransition = input.transitions.find(t =>
        candidate.triggering_facts.some(f => f.source_transition_id === t.transition_id)
      );

      if (triggeringTransition?.transition_date) {
        const eventDate = new Date(triggeringTransition.transition_date);
        const deadlineMs = eventDate.getTime() + (candidate.statute_of_limitations_days * 24 * 3600 * 1000);
        const deadlineDateObj = new Date(deadlineMs);
        deadline_date = deadlineDateObj.toISOString().split('T')[0];

        const filingDateObj = new Date(input.filing_date);
        days_until_deadline = Math.round((deadlineMs - filingDateObj.getTime()) / (24 * 3600 * 1000));
      }
    }

    // Determine status
    let status: ActionPath['status'];
    if (days_until_deadline !== null && days_until_deadline < 0) {
      status = 'expired';
    } else if (days_until_deadline === null) {
      status = 'deadline_unknown';
    } else if (candidate.missing_elements.length > elements_total / 2) {
      status = 'missing_critical_evidence';
    } else {
      status = 'actionable';
    }

    // Generate deterministic next steps based on missing elements
    const next_steps: string[] = [];
    for (const missing of candidate.missing_elements) {
      next_steps.push(generateNextStep(missing));
    }
    if (days_until_deadline !== null && days_until_deadline <= 30 && days_until_deadline > 0) {
      next_steps.unshift(`URGENT: Deadline in ${days_until_deadline} days (${deadline_date})`);
    }

    paths.push({
      path_id: `path_${computeHash(`${candidate.subject_entity_id}|${candidate.claim_type_id}|${input.filing_date}`)}`.substring(0, 16),
      subject_entity_id: candidate.subject_entity_id,
      claim_type_id: candidate.claim_type_id,
      claim_type_name: candidate.claim_type_name,
      elements_satisfied,
      elements_total,
      days_until_deadline,
      deadline_date,
      status,
      missing_elements: candidate.missing_elements,
      next_steps,
      filing_venue: getFilingVenue(candidate.claim_type_id, candidate.jurisdiction),
      authoritative_source: candidate.authoritative_source,
    });
  }

  // Sort by: actionable first, then by deadline urgency (nearest first), then by completeness
  const sorted = paths.sort((a, b) => {
    const statusOrder = { actionable: 0, deadline_unknown: 1, missing_critical_evidence: 2, expired: 3 };
    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    if (statusDiff !== 0) return statusDiff;

    // Nearest deadline first (null = unknown = sort last among same status)
    if (a.days_until_deadline !== null && b.days_until_deadline !== null) {
      return a.days_until_deadline - b.days_until_deadline;
    }
    if (a.days_until_deadline !== null) return -1;
    if (b.days_until_deadline !== null) return 1;

    // Higher completeness first
    const aRatio = a.elements_total > 0 ? a.elements_satisfied / a.elements_total : 0;
    const bRatio = b.elements_total > 0 ? b.elements_satisfied / b.elements_total : 0;
    return bRatio - aRatio;
  });

  const output_hash = computeHash(sorted);

  return {
    layer_name: 'action_paths',
    layer_version: LAYER_VERSION,
    rule_version: RULE_VERSION,
    parser_version: 'N/A',
    canonicalization_version: CANONICALIZATION_VERSION,
    input_hash,
    output_hash,
    data: sorted,
    unresolved_dependencies: unresolved,
    is_sealed: false,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateNextStep(missingElement: string): string {
  const steps: Record<string, string> = {
    protected_class_membership: 'Declare protected class status (self-identification required)',
    nexus: 'Document connection between protected status and adverse action',
    illegal_motive_or_violation: 'Identify specific statute, contract term, or policy violated',
    causal_connection: 'Document evidence linking protected activity to adverse action',
    damages: 'Document economic losses (pay stubs, bills) or non-economic harm',
    wages_owed: 'Gather pay stubs, timesheets, or employment records showing unpaid wages',
    employer_obligation: 'Identify employment contract, handbook, or statute requiring payment',
    lack_of_legal_process: 'Verify whether proper legal notice/court order was served',
    covered_loss: 'Review policy terms to confirm loss type is covered',
    eligibility: 'Gather documentation proving program eligibility criteria are met',
    housing_transaction: 'Document the housing application, inquiry, or transaction attempt',
    temporal_proximity: 'Document timeline showing adverse action followed protected activity closely',
  };
  return steps[missingElement] || `Gather evidence for: ${missingElement}`;
}

function getFilingVenue(claimTypeId: string, jurisdiction: string): string | null {
  const venues: Record<string, string> = {
    wrongful_termination: 'State court or EEOC (if discrimination-based)',
    workplace_discrimination: 'EEOC or state human rights commission',
    housing_discrimination: 'HUD or state human rights commission',
    unlawful_eviction: 'State district/superior court',
    insurance_claim_denial: 'State insurance commissioner or state court',
    wage_theft: 'State labor department or state court',
    benefits_wrongful_denial: 'Administrative hearing or state court',
    retaliation: 'EEOC or state court (depending on underlying statute)',
  };
  return venues[claimTypeId] || null;
}

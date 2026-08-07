import { computeHash, EngineResult, UnresolvedDependency, CANONICALIZATION_VERSION } from './utils';
import { StateTransition } from './layer-9-state_timeline';
import { Relationship } from './layer-7-relationship_graph';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A cascade chain records that a declared sequence of transitions
 * occurred in temporal order within declared time windows.
 * 
 * CRITICAL: This is a STRUCTURAL MATCH, not a causal claim.
 * "cascade_match_type" — never "causal_link_type".
 * Temporal sequence + declared rule = structural observation.
 * Only if source text explicitly states causation can causal_stated be true.
 */
export interface CascadeChain {
  cascade_id: string;
  cascade_rule_id: string;
  cascade_match_type: string; // NEVER "causal_link_type"
  entity_id: string;
  transitions_in_chain: CascadeStep[];
  total_time_span_days: number | null;
  causal_stated_in_source: boolean; // true ONLY if source explicitly says "because of" / "as a result of"
  source_artifacts: string[];
}

export interface CascadeStep {
  step_index: number;
  transition_id: string;
  to_state: string;
  date: string | null;
  role_in_cascade: string;
}

export interface Layer11Input {
  transitions: StateTransition[];
  relationships: Relationship[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const LAYER_VERSION = '2.0.0';
export const RULE_VERSION = '2.0.0';

/**
 * Cascade Rule Manifest
 * 
 * Each rule defines a sequence of state transitions that, when occurring
 * in temporal order for the same entity within declared time windows,
 * constitute a structural cascade match.
 */
interface CascadeRule {
  rule_id: string;
  match_type: string;
  description: string;
  steps: Array<{ to_state: string; role: string }>;
  max_window_days: number;
  same_entity: boolean;
}

const CASCADE_RULES: CascadeRule[] = [
  {
    rule_id: 'economic_instability_v1',
    match_type: 'economic_instability_cascade',
    description: 'Job loss followed by housing loss within time window',
    steps: [
      { to_state: 'terminated', role: 'income_loss_event' },
      { to_state: 'eviction_notice_served', role: 'housing_instability_event' },
    ],
    max_window_days: 120,
    same_entity: true,
  },
  {
    rule_id: 'benefit_loss_cascade_v1',
    match_type: 'benefit_loss_cascade',
    description: 'Benefit denial followed by further adverse outcomes',
    steps: [
      { to_state: 'denied', role: 'benefit_denial_event' },
      { to_state: 'eviction_notice_served', role: 'downstream_housing_event' },
    ],
    max_window_days: 180,
    same_entity: true,
  },
  {
    rule_id: 'insurance_loss_cascade_v1',
    match_type: 'insurance_loss_cascade',
    description: 'Employment termination followed by insurance policy cancellation',
    steps: [
      { to_state: 'terminated', role: 'employment_loss_event' },
      { to_state: 'policy_cancelled', role: 'insurance_loss_event' },
    ],
    max_window_days: 90,
    same_entity: true,
  },
];

// Causal language patterns — only these indicate source-stated causation
const CAUSAL_PATTERNS = [
  /\bbecause of\b/i,
  /\bas a result of\b/i,
  /\bdue to\b/i,
  /\bcaused by\b/i,
  /\bconsequently\b/i,
  /\bas a consequence\b/i,
  /\bwhich led to\b/i,
  /\bwhich resulted in\b/i,
];

// ─── Engine ──────────────────────────────────────────────────────────────────

/**
 * Layer 11: Cascade Registry
 * 
 * Identifies when a declared sequence of transitions occurred in temporal
 * order within declared time windows. Reports these as STRUCTURAL matches.
 * 
 * CRITICAL RULE: Temporal sequence alone NEVER proves causation.
 * causal_stated_in_source is true ONLY if the source text contains
 * explicit causal language connecting the transitions.
 */
export function processLayer11(input: Layer11Input): EngineResult<CascadeChain[]> {
  const input_hash = computeHash({
    transitions: input.transitions.map(t => t.transition_id),
    relationships: input.relationships.map(r => r.relationship_id),
  });
  const unresolved: UnresolvedDependency[] = [];

  if (input.transitions.length < 2) {
    return {
      layer_name: 'cascade_registry',
      layer_version: LAYER_VERSION,
      rule_version: RULE_VERSION,
      parser_version: 'N/A',
      canonicalization_version: CANONICALIZATION_VERSION,
      input_hash,
      output_hash: computeHash([]),
      data: [],
      unresolved_dependencies: input.transitions.length === 0
        ? [{ field: 'transitions', reason: 'incomplete', detail: 'Need at least 2 transitions for cascade detection' }]
        : [],
      is_sealed: false,
    };
  }

  // Group transitions by entity
  const byEntity = new Map<string, StateTransition[]>();
  for (const t of input.transitions) {
    const list = byEntity.get(t.entity_id) || [];
    list.push(t);
    byEntity.set(t.entity_id, list);
  }

  const cascades: CascadeChain[] = [];

  for (const rule of CASCADE_RULES) {
    if (rule.same_entity) {
      for (const [entityId, entityTransitions] of byEntity.entries()) {
        const match = matchCascadeSequence(entityTransitions, rule);
        if (match) {
          // Check if source text contains explicit causal language
          const causalStated = checkCausalLanguage(match.matchedTransitions);

          cascades.push({
            cascade_id: `casc_${computeHash(`${rule.rule_id}|${entityId}`)}`.substring(0, 16),
            cascade_rule_id: rule.rule_id,
            cascade_match_type: rule.match_type,
            entity_id: entityId,
            transitions_in_chain: match.steps,
            total_time_span_days: match.time_span_days,
            causal_stated_in_source: causalStated,
            source_artifacts: match.source_artifacts,
          });
        }
      }
    }
  }

  const sorted = cascades.sort((a, b) => a.cascade_id.localeCompare(b.cascade_id));
  const output_hash = computeHash(sorted);

  return {
    layer_name: 'cascade_registry',
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

function matchCascadeSequence(
  transitions: StateTransition[],
  rule: CascadeRule
): { steps: CascadeStep[]; time_span_days: number | null; source_artifacts: string[]; matchedTransitions: StateTransition[] } | null {
  const sorted = [...transitions].sort((a, b) => {
    if (!a.transition_date && !b.transition_date) return 0;
    if (!a.transition_date) return 1;
    if (!b.transition_date) return -1;
    return a.transition_date.localeCompare(b.transition_date);
  });

  const steps: CascadeStep[] = [];
  const matchedTransitions: StateTransition[] = [];
  let searchFrom = 0;

  for (let stepIdx = 0; stepIdx < rule.steps.length; stepIdx++) {
    const required = rule.steps[stepIdx];
    let found = false;
    for (let i = searchFrom; i < sorted.length; i++) {
      if (sorted[i].to_state === required.to_state) {
        steps.push({
          step_index: stepIdx,
          transition_id: sorted[i].transition_id,
          to_state: sorted[i].to_state,
          date: sorted[i].transition_date,
          role_in_cascade: required.role,
        });
        matchedTransitions.push(sorted[i]);
        searchFrom = i + 1;
        found = true;
        break;
      }
    }
    if (!found) return null;
  }

  // Check time window — BOTH dates must be present for a confirmed bounded cascade
  const firstDate = steps[0].date;
  const lastDate = steps[steps.length - 1].date;

  // Missing dates = cannot confirm bounded temporal match
  if (!firstDate || !lastDate) return null;

  const d1 = new Date(firstDate);
  const d2 = new Date(lastDate);
  const time_span_days = Math.round((d2.getTime() - d1.getTime()) / (24 * 3600 * 1000));
  if (time_span_days > rule.max_window_days) return null;

  const source_artifacts = Array.from(new Set(matchedTransitions.map(t => t.source_artifact_key))).sort();

  return { steps, time_span_days, source_artifacts, matchedTransitions };
}

function checkCausalLanguage(transitions: StateTransition[]): boolean {
  // Causal language must appear in a sentence that REFERENCES BOTH transitions.
  // A phrase like "because of" in one transition's text alone doesn't prove
  // it connects transition A to transition B.
  if (transitions.length < 2) return false;

  // Collect all state names involved
  const stateNames = transitions.map(t => t.to_state.replace(/_/g, ' '));

  // Check if any single text span contains a causal phrase AND references
  // at least one other transition's state
  for (let i = 0; i < transitions.length; i++) {
    const text = transitions[i].source_text.toLowerCase();
    const hasCausalPhrase = CAUSAL_PATTERNS.some(p => p.test(text));
    if (!hasCausalPhrase) continue;

    // Check if this text also mentions another transition's state
    for (let j = 0; j < stateNames.length; j++) {
      if (j === i && text.includes(stateNames[j])) continue; // Same transition
      if (j !== i && text.includes(stateNames[j])) {
        return true; // Causal phrase + reference to other transition = stated causation
      }
    }
  }
  return false;
}

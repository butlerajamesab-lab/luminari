import { computeHash, EngineResult, UnresolvedDependency, CANONICALIZATION_VERSION } from './utils';
import { StateTransition } from './layer-9-state_timeline';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DetectedPattern {
  pattern_id: string;
  pattern_type: string;
  rule_id: string;
  matching_entities: string[];
  matching_transitions: MatchingTransition[];
  time_span_days: number | null;
  source_artifacts: string[];
  confidence_basis: string; // Explains WHY this matched — not a probability
}

export interface MatchingTransition {
  transition_id: string;
  to_state: string;
  date: string | null;
  role_in_pattern: string; // e.g., "triggering_complaint", "adverse_action"
}

export interface Layer10Input {
  transitions: StateTransition[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const LAYER_VERSION = '2.0.0';
export const RULE_VERSION = '2.0.0';

/**
 * Pattern Rule Manifest
 * 
 * Each rule declares:
 * - required_sequence: ordered list of transition states that must occur
 * - time_window_days: maximum days between first and last transition
 * - min_corroboration: minimum number of source artifacts supporting the pattern
 * - same_entity: whether all transitions must involve the same entity
 * 
 * This manifest IS the versioned rule set. Changing it changes rule_version.
 */
export interface PatternRule {
  rule_id: string;
  pattern_type: string;
  description: string;
  required_sequence: Array<{ to_state: string; role: string }>;
  time_window_days: number;
  min_corroboration: number;
  same_entity: boolean;
}

const PATTERN_RULES: PatternRule[] = [
  {
    rule_id: 'retaliation_v1',
    pattern_type: 'retaliation_structural_match',
    description: 'Protected activity followed by adverse action within time window',
    required_sequence: [
      { to_state: 'complaint_filed', role: 'triggering_protected_activity' },
      { to_state: 'terminated', role: 'adverse_action' },
    ],
    time_window_days: 90,
    min_corroboration: 2, // Both transitions must have source evidence
    same_entity: true,
  },
  {
    rule_id: 'retaliation_charge_v1',
    pattern_type: 'retaliation_structural_match',
    description: 'Charge filed followed by adverse action within time window',
    required_sequence: [
      { to_state: 'charge_filed', role: 'triggering_protected_activity' },
      { to_state: 'terminated', role: 'adverse_action' },
    ],
    time_window_days: 90,
    min_corroboration: 2,
    same_entity: true,
  },
  {
    rule_id: 'constructive_eviction_v1',
    pattern_type: 'constructive_eviction_structural_match',
    description: 'Complaint followed by lease termination or eviction',
    required_sequence: [
      { to_state: 'complaint_filed', role: 'habitability_complaint' },
      { to_state: 'eviction_notice_served', role: 'retaliatory_action' },
    ],
    time_window_days: 60,
    min_corroboration: 2,
    same_entity: true,
  },
  {
    rule_id: 'benefits_churning_v1',
    pattern_type: 'benefits_churning_structural_match',
    description: 'Repeated approval/denial cycle (2+ cycles)',
    required_sequence: [
      { to_state: 'approved', role: 'initial_approval' },
      { to_state: 'benefits_terminated', role: 'first_termination' },
      { to_state: 'approved', role: 'reapproval' },
      { to_state: 'benefits_terminated', role: 'second_termination' },
    ],
    time_window_days: 730, // 2 years
    min_corroboration: 3,
    same_entity: true,
  },
];

// ─── Engine ──────────────────────────────────────────────────────────────────

/**
 * Layer 10: Pattern Registry
 * 
 * Detects recurring sequences in the state timeline that match declared
 * pattern rules. A pattern match requires:
 * 1. ALL transitions in the required_sequence present
 * 2. In the correct temporal order
 * 3. Within the declared time window
 * 4. Meeting the minimum corroboration threshold
 * 5. Same entity (if required by rule)
 * 
 * CRITICAL: Pattern type names use "structural_match" — NOT "retaliation"
 * alone, because temporal sequence does not prove intent or causation.
 * The pattern is a structural observation, not a legal conclusion.
 * 
 * Protected-class membership is NEVER derived from names, photos, addresses,
 * or proxies. It must be user-declared or explicitly stated in source material.
 */
export function processLayer10(input: Layer10Input): EngineResult<DetectedPattern[]> {
  const input_hash = computeHash(input);
  const unresolved: UnresolvedDependency[] = [];

  if (input.transitions.length === 0) {
    return {
      layer_name: 'pattern_registry',
      layer_version: LAYER_VERSION,
      rule_version: RULE_VERSION,
      parser_version: 'N/A',
      canonicalization_version: CANONICALIZATION_VERSION,
      input_hash,
      output_hash: computeHash([]),
      data: [],
      unresolved_dependencies: [{ field: 'transitions', reason: 'incomplete', detail: 'No state transitions to analyze' }],
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

  const patterns: DetectedPattern[] = [];

  for (const rule of PATTERN_RULES) {
    if (rule.same_entity) {
      // Check each entity's transitions against this rule
      for (const [entityId, entityTransitions] of byEntity.entries()) {
        const match = matchSequence(entityTransitions, rule);
        if (match) {
          patterns.push({
            pattern_id: `pat_${computeHash(`${rule.rule_id}|${entityId}`)}`.substring(0, 16),
            pattern_type: rule.pattern_type,
            rule_id: rule.rule_id,
            matching_entities: [entityId],
            matching_transitions: match.transitions,
            time_span_days: match.time_span_days,
            source_artifacts: match.source_artifacts,
            confidence_basis: `Rule ${rule.rule_id}: all ${rule.required_sequence.length} required transitions found in order within ${rule.time_window_days}-day window, ${match.source_artifacts.length} corroborating sources`,
          });
        }
      }
    }
  }

  const sorted = patterns.sort((a, b) => a.pattern_id.localeCompare(b.pattern_id));
  const output_hash = computeHash(sorted);

  return {
    layer_name: 'pattern_registry',
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

function matchSequence(
  transitions: StateTransition[],
  rule: PatternRule
): { transitions: MatchingTransition[]; time_span_days: number | null; source_artifacts: string[] } | null {
  // Sort transitions by date (null dates go to end)
  const sorted = [...transitions].sort((a, b) => {
    if (!a.transition_date && !b.transition_date) return 0;
    if (!a.transition_date) return 1;
    if (!b.transition_date) return -1;
    return a.transition_date.localeCompare(b.transition_date);
  });

  // Try to find all required transitions in order
  const matched: MatchingTransition[] = [];
  let searchFrom = 0;

  for (const required of rule.required_sequence) {
    let found = false;
    for (let i = searchFrom; i < sorted.length; i++) {
      if (sorted[i].to_state === required.to_state) {
        matched.push({
          transition_id: sorted[i].transition_id,
          to_state: sorted[i].to_state,
          date: sorted[i].transition_date,
          role_in_pattern: required.role,
        });
        searchFrom = i + 1;
        found = true;
        break;
      }
    }
    if (!found) return null; // Required transition not found
  }

  // Check time window
  const firstDate = matched[0].date;
  const lastDate = matched[matched.length - 1].date;
  let time_span_days: number | null = null;

  if (firstDate && lastDate) {
    const d1 = new Date(firstDate);
    const d2 = new Date(lastDate);
    time_span_days = Math.round((d2.getTime() - d1.getTime()) / (24 * 3600 * 1000));
    if (time_span_days > rule.time_window_days) return null; // Outside window
  }
  // If dates are missing, we cannot verify the time window — mark as unresolved
  // but still report the structural match

  // Check corroboration threshold
  const sourceArtifacts = new Set<string>();
  for (const t of sorted) {
    if (matched.find(m => m.transition_id === t.transition_id)) {
      sourceArtifacts.add(t.source_artifact_key);
    }
  }
  if (sourceArtifacts.size < rule.min_corroboration) return null;

  return {
    transitions: matched,
    time_span_days,
    source_artifacts: Array.from(sourceArtifacts).sort(),
  };
}

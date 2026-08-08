import {
  computeHash,
  computeRuleManifestHash,
  EngineResult,
  UnresolvedDependency,
  CANONICALIZATION_VERSION,
} from './utils';
import { StateTransition } from './layer-9-state_timeline';

export interface DetectedPattern {
  pattern_id: string;
  pattern_type: string;
  rule_id: string;
  matching_entities: string[];
  matching_transitions: MatchingTransition[];
  time_span_days: number;
  source_artifacts: string[];
  match_basis: string;
}

export interface MatchingTransition {
  transition_id: string;
  to_state: string;
  date: string;
  role_in_pattern: string;
}

export interface Layer10Input {
  transitions: StateTransition[];
}

export const LAYER_VERSION = '2.1.0';
export const RULE_VERSION = '2.1.0';

export interface PatternRule {
  rule_id: string;
  pattern_type: string;
  description: string;
  required_sequence: Array<{ to_state: string; role: string }>;
  time_window_days: number;
  min_independent_source_artifacts: number;
  same_entity: boolean;
}

/** Exact rule data consumed by this engine. */
export const RULE_MANIFEST: { rules: PatternRule[]; missing_date_policy: 'unresolved_no_match' } = {
  rules: [
    {
      rule_id: 'retaliation_v1',
      pattern_type: 'retaliation_structural_match',
      description: 'Protected complaint activity followed by termination within the declared window',
      required_sequence: [
        { to_state: 'complaint_filed', role: 'triggering_protected_activity' },
        { to_state: 'terminated', role: 'adverse_action' },
      ],
      time_window_days: 90,
      min_independent_source_artifacts: 2,
      same_entity: true,
    },
    {
      rule_id: 'retaliation_charge_v1',
      pattern_type: 'retaliation_structural_match',
      description: 'Charge filed followed by termination within the declared window',
      required_sequence: [
        { to_state: 'charge_filed', role: 'triggering_protected_activity' },
        { to_state: 'terminated', role: 'adverse_action' },
      ],
      time_window_days: 90,
      min_independent_source_artifacts: 2,
      same_entity: true,
    },
    {
      rule_id: 'constructive_eviction_v1',
      pattern_type: 'constructive_eviction_structural_match',
      description: 'Complaint followed by eviction notice within the declared window',
      required_sequence: [
        { to_state: 'complaint_filed', role: 'habitability_complaint' },
        { to_state: 'eviction_notice_served', role: 'retaliatory_action' },
      ],
      time_window_days: 60,
      min_independent_source_artifacts: 2,
      same_entity: true,
    },
    {
      rule_id: 'benefits_churning_v1',
      pattern_type: 'benefits_churning_structural_match',
      description: 'Repeated approval and termination sequence',
      required_sequence: [
        { to_state: 'approved', role: 'initial_approval' },
        { to_state: 'benefits_terminated', role: 'first_termination' },
        { to_state: 'approved', role: 'reapproval' },
        { to_state: 'benefits_terminated', role: 'second_termination' },
      ],
      time_window_days: 730,
      min_independent_source_artifacts: 3,
      same_entity: true,
    },
  ],
  missing_date_policy: 'unresolved_no_match',
};

export const RULE_MANIFEST_HASH = computeRuleManifestHash(RULE_MANIFEST);

export function processLayer10(input: Layer10Input): EngineResult<DetectedPattern[]> {
  const transitions = [...input.transitions].sort((a, b) => a.transition_id.localeCompare(b.transition_id));
  const input_hash = computeHash({ transitions });
  const unresolved: UnresolvedDependency[] = [];

  if (transitions.length === 0) {
    const data: DetectedPattern[] = [];
    return {
      layer_name: 'pattern_registry',
      layer_version: LAYER_VERSION,
      rule_version: RULE_VERSION,
      parser_version: 'N/A',
      canonicalization_version: CANONICALIZATION_VERSION,
      input_hash,
      output_hash: computeHash(data),
      data,
      unresolved_dependencies: [{ field: 'transitions', reason: 'incomplete', detail: 'No state transitions to analyze' }],
      is_sealed: false,
    };
  }

  const byEntity = new Map<string, StateTransition[]>();
  for (const transition of transitions) {
    const list = byEntity.get(transition.entity_id) || [];
    list.push(transition);
    byEntity.set(transition.entity_id, list);
  }

  const patterns: DetectedPattern[] = [];

  for (const rule of RULE_MANIFEST.rules) {
    if (!rule.same_entity) continue;
    for (const [entityId, entityTransitions] of Array.from(byEntity.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      const result = matchSequence(entityTransitions, rule);
      if (result.status === 'unresolved') {
        unresolved.push({
          field: `pattern:${rule.rule_id}:${entityId}`,
          reason: 'unresolved',
          detail: result.detail,
        });
        continue;
      }
      if (result.status !== 'match') continue;

      patterns.push({
        pattern_id: `pat_${computeHash({ rule_id: rule.rule_id, entity_id: entityId, transitions: result.transitions.map(t => t.transition_id) }).substring(0, 16)}`,
        pattern_type: rule.pattern_type,
        rule_id: rule.rule_id,
        matching_entities: [entityId],
        matching_transitions: result.transitions,
        time_span_days: result.time_span_days,
        source_artifacts: result.source_artifacts,
        match_basis: `All ${rule.required_sequence.length} declared transitions occur in order within ${rule.time_window_days} days and are distributed across ${result.source_artifacts.length} independent source artifacts. This is a structural match, not a finding of motive or causation.`,
      });
    }
  }

  const data = patterns.sort((a, b) => a.pattern_id.localeCompare(b.pattern_id));
  return {
    layer_name: 'pattern_registry',
    layer_version: LAYER_VERSION,
    rule_version: RULE_VERSION,
    parser_version: 'N/A',
    canonicalization_version: CANONICALIZATION_VERSION,
    input_hash,
    output_hash: computeHash(data),
    data,
    unresolved_dependencies: unresolved.sort((a, b) => a.field.localeCompare(b.field)),
    is_sealed: false,
  };
}

type SequenceResult =
  | { status: 'no_match' }
  | { status: 'unresolved'; detail: string }
  | { status: 'match'; transitions: MatchingTransition[]; time_span_days: number; source_artifacts: string[] };

function matchSequence(transitions: StateTransition[], rule: PatternRule): SequenceResult {
  const sorted = [...transitions].sort((a, b) => {
    if (!a.transition_date && !b.transition_date) return a.transition_id.localeCompare(b.transition_id);
    if (!a.transition_date) return 1;
    if (!b.transition_date) return -1;
    return a.transition_date.localeCompare(b.transition_date) || a.transition_id.localeCompare(b.transition_id);
  });

  const matchedTransitions: StateTransition[] = [];
  let searchFrom = 0;
  for (const required of rule.required_sequence) {
    let found: StateTransition | undefined;
    let foundIndex = -1;
    for (let i = searchFrom; i < sorted.length; i++) {
      if (sorted[i].to_state === required.to_state) {
        found = sorted[i];
        foundIndex = i;
        break;
      }
    }
    if (!found) return { status: 'no_match' };
    matchedTransitions.push(found);
    searchFrom = foundIndex + 1;
  }

  if (matchedTransitions.some(t => !t.transition_date)) {
    return { status: 'unresolved', detail: 'Required transition sequence exists, but one or more transition dates are missing so the bounded temporal rule cannot be evaluated.' };
  }

  const firstDate = matchedTransitions[0].transition_date as string;
  const lastDate = matchedTransitions[matchedTransitions.length - 1].transition_date as string;
  const time_span_days = Math.round((new Date(lastDate).getTime() - new Date(firstDate).getTime()) / (24 * 3600 * 1000));
  if (time_span_days < 0 || time_span_days > rule.time_window_days) return { status: 'no_match' };

  const source_artifacts = Array.from(new Set(matchedTransitions.map(t => t.source_artifact_key))).sort();
  if (source_artifacts.length < rule.min_independent_source_artifacts) {
    return {
      status: 'unresolved',
      detail: `Required transition sequence exists, but only ${source_artifacts.length} independent source artifact(s) support it; rule requires ${rule.min_independent_source_artifacts}.`,
    };
  }

  const projected: MatchingTransition[] = matchedTransitions.map((transition, index) => ({
    transition_id: transition.transition_id,
    to_state: transition.to_state,
    date: transition.transition_date as string,
    role_in_pattern: rule.required_sequence[index].role,
  }));

  return { status: 'match', transitions: projected, time_span_days, source_artifacts };
}

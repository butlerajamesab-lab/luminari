import {
  computeHash,
  computeRuleManifestHash,
  EngineResult,
  regexFromManifest,
  UnresolvedDependency,
  CANONICALIZATION_VERSION,
} from './utils';
import { StateTransition } from './layer-9-state_timeline';

export interface CascadeChain {
  cascade_id: string;
  cascade_rule_id: string;
  cascade_match_type: string;
  entity_id: string;
  transitions_in_chain: CascadeStep[];
  total_time_span_days: number;
  causal_stated_in_source: boolean;
  source_artifacts: string[];
}

export interface CascadeStep {
  step_index: number;
  transition_id: string;
  to_state: string;
  date: string;
  role_in_cascade: string;
}

export interface Layer11Input {
  transitions: StateTransition[];
}

export const LAYER_VERSION = '2.1.0';
export const RULE_VERSION = '2.1.0';

export interface CascadeRule {
  rule_id: string;
  match_type: string;
  description: string;
  steps: Array<{ to_state: string; role: string }>;
  max_window_days: number;
  same_entity: boolean;
}

export const RULE_MANIFEST: {
  rules: CascadeRule[];
  causal_regexes: Array<{ source: string; flags: string }>;
  missing_date_policy: 'unresolved_no_match';
  temporal_sequence_is_causation: false;
} = {
  rules: [
    {
      rule_id: 'economic_instability_v1',
      match_type: 'economic_instability_cascade',
      description: 'Job loss followed by housing instability within the declared window',
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
      description: 'Benefit denial followed by housing instability within the declared window',
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
      description: 'Employment termination followed by policy cancellation within the declared window',
      steps: [
        { to_state: 'terminated', role: 'employment_loss_event' },
        { to_state: 'policy_cancelled', role: 'insurance_loss_event' },
      ],
      max_window_days: 90,
      same_entity: true,
    },
  ],
  causal_regexes: [
    { source: '\\bbecause of\\b', flags: 'i' },
    { source: '\\bas a result of\\b', flags: 'i' },
    { source: '\\bdue to\\b', flags: 'i' },
    { source: '\\bcaused by\\b', flags: 'i' },
    { source: '\\bconsequently\\b', flags: 'i' },
    { source: '\\bas a consequence\\b', flags: 'i' },
    { source: '\\bwhich led to\\b', flags: 'i' },
    { source: '\\bwhich resulted in\\b', flags: 'i' },
  ],
  missing_date_policy: 'unresolved_no_match',
  temporal_sequence_is_causation: false,
};

export const RULE_MANIFEST_HASH = computeRuleManifestHash(RULE_MANIFEST);
const CAUSAL_PATTERNS = RULE_MANIFEST.causal_regexes.map(regexFromManifest);

export function processLayer11(input: Layer11Input): EngineResult<CascadeChain[]> {
  const transitions = [...input.transitions].sort((a, b) => a.transition_id.localeCompare(b.transition_id));
  const input_hash = computeHash({ transitions });
  const unresolved: UnresolvedDependency[] = [];

  if (transitions.length < 2) {
    const data: CascadeChain[] = [];
    return {
      layer_name: 'cascade_registry',
      layer_version: LAYER_VERSION,
      rule_version: RULE_VERSION,
      parser_version: 'N/A',
      canonicalization_version: CANONICALIZATION_VERSION,
      input_hash,
      output_hash: computeHash(data),
      data,
      unresolved_dependencies: transitions.length === 0
        ? [{ field: 'transitions', reason: 'incomplete', detail: 'Need at least two transitions for cascade evaluation' }]
        : [],
      is_sealed: false,
    };
  }

  const byEntity = new Map<string, StateTransition[]>();
  for (const transition of transitions) {
    const list = byEntity.get(transition.entity_id) || [];
    list.push(transition);
    byEntity.set(transition.entity_id, list);
  }

  const cascades: CascadeChain[] = [];
  for (const rule of RULE_MANIFEST.rules) {
    if (!rule.same_entity) continue;
    for (const [entityId, entityTransitions] of Array.from(byEntity.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      const result = matchCascadeSequence(entityTransitions, rule);
      if (result.status === 'unresolved') {
        unresolved.push({
          field: `cascade:${rule.rule_id}:${entityId}`,
          reason: 'unresolved',
          detail: result.detail,
        });
        continue;
      }
      if (result.status !== 'match') continue;

      cascades.push({
        cascade_id: `casc_${computeHash({ rule_id: rule.rule_id, entity_id: entityId, transitions: result.steps.map(s => s.transition_id) }).substring(0, 16)}`,
        cascade_rule_id: rule.rule_id,
        cascade_match_type: rule.match_type,
        entity_id: entityId,
        transitions_in_chain: result.steps,
        total_time_span_days: result.time_span_days,
        causal_stated_in_source: sourceExplicitlyLinksTransitions(result.matchedTransitions),
        source_artifacts: result.source_artifacts,
      });
    }
  }

  const data = cascades.sort((a, b) => a.cascade_id.localeCompare(b.cascade_id));
  return {
    layer_name: 'cascade_registry',
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

type CascadeMatch =
  | { status: 'no_match' }
  | { status: 'unresolved'; detail: string }
  | {
      status: 'match';
      steps: CascadeStep[];
      time_span_days: number;
      source_artifacts: string[];
      matchedTransitions: StateTransition[];
    };

function matchCascadeSequence(transitions: StateTransition[], rule: CascadeRule): CascadeMatch {
  const sorted = [...transitions].sort((a, b) => {
    if (!a.transition_date && !b.transition_date) return a.transition_id.localeCompare(b.transition_id);
    if (!a.transition_date) return 1;
    if (!b.transition_date) return -1;
    return a.transition_date.localeCompare(b.transition_date) || a.transition_id.localeCompare(b.transition_id);
  });

  const matchedTransitions: StateTransition[] = [];
  let searchFrom = 0;
  for (const required of rule.steps) {
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
    return { status: 'unresolved', detail: 'The declared transition sequence exists, but one or more dates are missing so temporal ordering and the bounded window cannot be proven.' };
  }

  const firstDate = matchedTransitions[0].transition_date as string;
  const lastDate = matchedTransitions[matchedTransitions.length - 1].transition_date as string;
  const time_span_days = Math.round((new Date(lastDate).getTime() - new Date(firstDate).getTime()) / (24 * 3600 * 1000));
  if (time_span_days < 0 || time_span_days > rule.max_window_days) return { status: 'no_match' };

  const steps: CascadeStep[] = matchedTransitions.map((transition, index) => ({
    step_index: index,
    transition_id: transition.transition_id,
    to_state: transition.to_state,
    date: transition.transition_date as string,
    role_in_cascade: rule.steps[index].role,
  }));
  const source_artifacts = Array.from(new Set(matchedTransitions.map(t => t.source_artifact_key))).sort();
  return { status: 'match', steps, time_span_days, source_artifacts, matchedTransitions };
}

function sourceExplicitlyLinksTransitions(transitions: StateTransition[]): boolean {
  if (transitions.length < 2) return false;
  const stateTokens = transitions.map(t => t.to_state.replace(/_/g, ' '));

  for (const transition of transitions) {
    const text = transition.source_text.toLowerCase();
    for (const pattern of CAUSAL_PATTERNS) {
      pattern.lastIndex = 0;
      if (!pattern.test(text)) continue;
      const referencedStates = stateTokens.filter(token => text.includes(token));
      if (new Set(referencedStates).size >= 2) return true;
    }
  }
  return false;
}

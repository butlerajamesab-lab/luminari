import { computeHash, EngineResult } from './utils';
import { StateTransition } from './layer-9-state_timeline';

export interface CascadeChain {
  cause_transition_id: string;
  effect_transition_id: string;
  causal_link_type: string;
}

export const LAYER_VERSION = '1.0.0';
export const RULE_VERSION = '1.0.0';

export function processLayer11(transitions: StateTransition[]): EngineResult<CascadeChain[]> {
  const input_hash = computeHash(transitions);
  const cascades: CascadeChain[] = [];

  // Logic: Job loss -> eviction (within 60 days)
  const entityTransitions = new Map<string, StateTransition[]>();
  for (const t of transitions) {
    const list = entityTransitions.get(t.entity_id) || [];
    list.push(t);
    entityTransitions.set(t.entity_id, list);
  }

  for (const [entityId, tList] of entityTransitions.entries()) {
    const jobLoss = tList.find(t => t.to_state === 'terminated');
    const eviction = tList.find(t => t.to_state === 'evicted');

    if (jobLoss && eviction) {
      const d1 = new Date(jobLoss.transition_date);
      const d2 = new Date(eviction.transition_date);
      if (d2 > d1 && (d2.getTime() - d1.getTime()) <= 60 * 24 * 3600 * 1000) {
        cascades.push({
          cause_transition_id: jobLoss.transition_date,
          effect_transition_id: eviction.transition_date,
          causal_link_type: 'economic_instability'
        });
      }
    }
  }

  const output_hash = computeHash(cascades);

  return {
    layer_version: LAYER_VERSION,
    rule_version: RULE_VERSION,
    canonicalization_version: '1.0.0',
    input_hash,
    output_hash,
    data: cascades,
    unresolved_dependencies: [],
    is_sealed: false
  };
}

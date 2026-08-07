import { computeHash, EngineResult } from './utils';
import { StateTransition } from './layer-9-state_timeline';

export interface PatternMatch {
  pattern_type: string;
  matching_entities: string[];
  matching_transitions: string[];
  time_span_days: number;
  source_artifacts: string[];
}

export const LAYER_VERSION = '1.0.0';
export const RULE_VERSION = '1.0.0';

export function processLayer10(transitions: StateTransition[]): EngineResult<PatternMatch[]> {
  const input_hash = computeHash(transitions);
  const patterns: PatternMatch[] = [];

  // Example: Retaliation pattern (complaint -> termination within 30 days)
  // Note: Simplified logic for the engine
  const entityTransitions = new Map<string, StateTransition[]>();
  for (const t of transitions) {
    const list = entityTransitions.get(t.entity_id) || [];
    list.push(t);
    entityTransitions.set(t.entity_id, list);
  }

  for (const [entityId, tList] of entityTransitions.entries()) {
    tList.sort((a, b) => new Date(a.transition_date).getTime() - new Date(b.transition_date).getTime());
    
    for (let i = 0; i < tList.length - 1; i++) {
      const t1 = tList[i];
      const t2 = tList[i+1];
      
      const d1 = new Date(t1.transition_date);
      const d2 = new Date(t2.transition_date);
      const diffDays = (d2.getTime() - d1.getTime()) / (1000 * 3600 * 24);

      if (diffDays <= 30 && t2.to_state === 'terminated') {
        patterns.push({
          pattern_type: 'retaliation_risk',
          matching_entities: [entityId],
          matching_transitions: [t1.transition_date, t2.transition_date],
          time_span_days: diffDays,
          source_artifacts: Array.from(new Set([t1.source_artifact_id, t2.source_artifact_id]))
        });
      }
    }
  }

  const output_hash = computeHash(patterns);

  return {
    layer_version: LAYER_VERSION,
    rule_version: RULE_VERSION,
    canonicalization_version: '1.0.0',
    input_hash,
    output_hash,
    data: patterns,
    unresolved_dependencies: [],
    is_sealed: false
  };
}

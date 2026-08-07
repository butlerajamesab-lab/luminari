import { computeHash, EngineResult } from './utils';
import { ChronologyEvent } from './layer-4-chronology_reconstruction';
import { Entity } from './layer-6-entity_registry';

export interface StateTransition {
  entity_id: string;
  from_state: string;
  to_state: string;
  transition_date: string;
  source_artifact_id: string;
}

export const LAYER_VERSION = '1.0.0';
export const RULE_VERSION = '1.0.0';

const STATE_VERBS = [
  { verb: 'hired', from: 'unemployed', to: 'employed' },
  { verb: 'terminated', from: 'employed', to: 'terminated' },
  { verb: 'evicted', from: 'housed', to: 'evicted' },
  { verb: 'denied', from: 'applied', to: 'denied' }
];

export function processLayer9(events: ChronologyEvent[], entities: Entity[]): EngineResult<StateTransition[]> {
  const input_hash = computeHash({ events, entities: entities.map(e => e.entity_id) });
  const transitions: StateTransition[] = [];

  for (const event of events) {
    for (const entity of entities) {
      if (event.event_text.toLowerCase().includes(entity.name.toLowerCase())) {
        for (const { verb, from, to } of STATE_VERBS) {
          if (event.event_text.toLowerCase().includes(verb)) {
            transitions.push({
              entity_id: entity.entity_id,
              from_state: from,
              to_state: to,
              transition_date: event.date,
              source_artifact_id: event.source_artifact_id
            });
          }
        }
      }
    }
  }

  const output_hash = computeHash(transitions);

  return {
    layer_version: LAYER_VERSION,
    rule_version: RULE_VERSION,
    canonicalization_version: '1.0.0',
    input_hash,
    output_hash,
    data: transitions,
    unresolved_dependencies: [],
    is_sealed: false
  };
}

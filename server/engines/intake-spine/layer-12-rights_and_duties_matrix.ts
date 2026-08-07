import { computeHash, EngineResult } from './utils';
import { Entity } from './layer-6-entity_registry';

export interface RightsMatrix {
  claim_type: string;
  required_elements: string[];
  statute_of_limitations_days: number;
  jurisdiction: string;
}

export const LAYER_VERSION = '1.0.0';
export const RULE_VERSION = '1.0.0';

const CLAIM_REGISTRY: Record<string, Omit<RightsMatrix, 'jurisdiction'>> = {
  wrongful_termination: {
    claim_type: 'Wrongful Termination',
    required_elements: ['Employment Relationship', 'Termination', 'Illegal Motive'],
    statute_of_limitations_days: 1095 // 3 years
  },
  unlawful_eviction: {
    claim_type: 'Unlawful Eviction',
    required_elements: ['Tenancy', 'Removal', 'Lack of Process'],
    statute_of_limitations_days: 365
  }
};

export function processLayer12(entities: Entity[], jurisdiction: string): EngineResult<RightsMatrix[]> {
  const input_hash = computeHash({ entities: entities.map(e => e.entity_id), jurisdiction });
  const matches: RightsMatrix[] = [];

  // Simple keyword matching against entity roles/context (placeholder)
  if (entities.some(e => e.normalized_name.includes('department'))) {
    matches.push({ ...CLAIM_REGISTRY.wrongful_termination, jurisdiction });
  }

  const output_hash = computeHash(matches);

  return {
    layer_version: LAYER_VERSION,
    rule_version: RULE_VERSION,
    canonicalization_version: '1.0.0',
    input_hash,
    output_hash,
    data: matches,
    unresolved_dependencies: [],
    is_sealed: false
  };
}

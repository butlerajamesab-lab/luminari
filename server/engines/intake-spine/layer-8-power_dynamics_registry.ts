import { computeHash, EngineResult, CANONICALIZATION_VERSION } from './utils';
import { Relationship, RelationshipType } from './layer-7-relationship_graph';

export interface PowerDynamic {
  relationship_id: string;
  relationship_type: RelationshipType;
  power_direction: string;
  asymmetry_level: 'high' | 'medium' | 'low' | 'unresolved';
}

export const LAYER_VERSION = '2.0.0';
export const RULE_VERSION = '2.0.0';

const POWER_TABLE: Record<RelationshipType, { direction: string; level: 'high' | 'medium' | 'low' | 'unresolved' }> = {
  employer_employee: { direction: 'entity_a > entity_b', level: 'high' },
  landlord_tenant: { direction: 'entity_a > entity_b', level: 'high' },
  agency_complainant: { direction: 'entity_a > entity_b', level: 'high' },
  insurer_insured: { direction: 'entity_a > entity_b', level: 'medium' },
  creditor_debtor: { direction: 'entity_a > entity_b', level: 'medium' },
  legal_representative_client: { direction: 'entity_a serves entity_b', level: 'low' },
  family: { direction: 'bidirectional', level: 'unresolved' },
  opposing_party: { direction: 'context_dependent', level: 'unresolved' },
};

export function processLayer8(input: { relationships: Relationship[] }): EngineResult<PowerDynamic[]> {
  const input_hash = computeHash(input.relationships.map(r => r.relationship_id));
  const data: PowerDynamic[] = input.relationships.map(r => {
    const entry = POWER_TABLE[r.type] || { direction: 'unknown', level: 'unresolved' as const };
    return {
      relationship_id: r.relationship_id,
      relationship_type: r.type,
      power_direction: entry.direction,
      asymmetry_level: entry.level,
    };
  }).sort((a, b) => a.relationship_id.localeCompare(b.relationship_id));

  return {
    layer_name: 'power_dynamics_registry',
    layer_version: LAYER_VERSION,
    rule_version: RULE_VERSION,
    parser_version: 'N/A',
    canonicalization_version: CANONICALIZATION_VERSION,
    input_hash,
    output_hash: computeHash(data),
    data,
    unresolved_dependencies: [],
    is_sealed: false,
  };
}

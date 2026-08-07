import { computeHash, EngineResult } from './utils';
import { Relationship, RelationshipType } from './layer-7-relationship_graph';

export type PowerAsymmetry = 'high' | 'medium' | 'low' | 'unresolved';

export interface PowerDynamicsRecord {
  relationship_id: string;
  power_direction: string; // e.g. "A > B"
  asymmetry_level: PowerAsymmetry;
}

export const LAYER_VERSION = '1.0.0';
export const RULE_VERSION = '1.0.0';

const POWER_LOOKUP: Record<RelationshipType, { direction: string, level: PowerAsymmetry }> = {
  employer_employee: { direction: 'employer > employee', level: 'high' },
  landlord_tenant: { direction: 'landlord > tenant', level: 'high' },
  agency_complainant: { direction: 'agency > individual', level: 'high' },
  family: { direction: 'context-dependent', level: 'unresolved' },
  legal_representative: { direction: 'representative > client', level: 'low' },
  opposing_party: { direction: 'context-dependent', level: 'unresolved' },
  unknown: { direction: 'unknown', level: 'unresolved' }
};

export function processLayer8(relationships: Relationship[]): EngineResult<PowerDynamicsRecord[]> {
  const input_hash = computeHash(relationships);
  const records: PowerDynamicsRecord[] = relationships.map(rel => {
    const lookup = POWER_LOOKUP[rel.type] || { direction: 'unknown', level: 'unresolved' };
    return {
      relationship_id: rel.relationship_id,
      power_direction: lookup.direction,
      asymmetry_level: lookup.level
    };
  });

  const output_hash = computeHash(records);

  return {
    layer_version: LAYER_VERSION,
    rule_version: RULE_VERSION,
    canonicalization_version: '1.0.0',
    input_hash,
    output_hash,
    data: records,
    unresolved_dependencies: [],
    is_sealed: false
  };
}

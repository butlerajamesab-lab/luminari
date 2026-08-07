import { computeHash, EngineResult } from './utils';
import { Entity } from './layer-6-entity_registry';
import { ParsedArtifact } from './parsing-substrate';

export type RelationshipType = 
  | 'employer_employee' 
  | 'landlord_tenant' 
  | 'agency_complainant' 
  | 'family' 
  | 'legal_representative' 
  | 'opposing_party'
  | 'unknown';

export interface Relationship {
  relationship_id: string;
  entity_a_id: string;
  entity_b_id: string;
  type: RelationshipType;
  source_ref: string;
}

export const LAYER_VERSION = '1.0.0';
export const RULE_VERSION = '1.0.0';

export function processLayer7(entities: Entity[], artifacts: ParsedArtifact[]): EngineResult<Relationship[]> {
  const input_hash = computeHash({ entities: entities.map(e => e.entity_id), artifacts: artifacts.map(a => a.sha256) });
  const relationships: Relationship[] = [];

  // Simple pattern matching for relationships in source text
  const REL_PATTERNS: Array<{ pattern: RegExp, type: RelationshipType }> = [
    { pattern: /employed by/i, type: 'employer_employee' },
    { pattern: /landlord of/i, type: 'landlord_tenant' },
    { pattern: /represented by/i, type: 'legal_representative' }
  ];

  for (const artifact of artifacts) {
    const text = artifact.extracted_text;
    
    // Check for co-occurrence and relationship markers
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const entA = entities[i];
        const entB = entities[j];

        if (text.includes(entA.name) && text.includes(entB.name)) {
          // Look for patterns between names (simplified)
          for (const { pattern, type } of REL_PATTERNS) {
            if (pattern.test(text)) {
              relationships.push({
                relationship_id: `rel_${computeHash(`${entA.entity_id}|${entB.entity_id}|${type}`).substring(0, 8)}`,
                entity_a_id: entA.entity_id,
                entity_b_id: entB.entity_id,
                type: type,
                source_ref: artifact.artifact_key
              });
              break; // One relationship per pair per artifact for now
            }
          }
        }
      }
    }
  }

  const output_hash = computeHash(relationships);

  return {
    layer_version: LAYER_VERSION,
    rule_version: RULE_VERSION,
    canonicalization_version: '1.0.0',
    input_hash,
    output_hash,
    data: relationships,
    unresolved_dependencies: [],
    is_sealed: false
  };
}

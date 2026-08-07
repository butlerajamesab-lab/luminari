import { computeHash, EngineResult, UnresolvedDependency, CANONICALIZATION_VERSION } from './utils';
import { Entity } from './layer-6-entity_registry';
import { ParsedArtifact, TextSpan } from './parsing-substrate';

// ─── Types ───────────────────────────────────────────────────────────────────

export type RelationshipType =
  | 'employer_employee'
  | 'landlord_tenant'
  | 'agency_complainant'
  | 'insurer_insured'
  | 'creditor_debtor'
  | 'legal_representative_client'
  | 'family'
  | 'opposing_party';

export interface Relationship {
  relationship_id: string;
  entity_a_id: string;
  entity_b_id: string;
  type: RelationshipType;
  direction: 'a_to_b' | 'b_to_a' | 'bidirectional';
  source_artifact_key: string;
  source_span_text: string;
  marker_text: string;
  marker_offset: number;
}

export interface Layer7Input {
  entities: Entity[];
  artifacts: ParsedArtifact[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const LAYER_VERSION = '2.0.0';
export const RULE_VERSION = '2.0.0';

/**
 * Relationship markers with their types and directionality.
 * The marker must appear BETWEEN or ADJACENT TO the two entity mentions
 * within the SAME span (paragraph). Document-wide matching is prohibited.
 */
const RELATIONSHIP_MARKERS: Array<{
  pattern: RegExp;
  type: RelationshipType;
  direction: 'a_to_b' | 'b_to_a' | 'bidirectional';
}> = [
  { pattern: /employed by/i, type: 'employer_employee', direction: 'b_to_a' },
  { pattern: /works for/i, type: 'employer_employee', direction: 'b_to_a' },
  { pattern: /employer/i, type: 'employer_employee', direction: 'a_to_b' },
  { pattern: /terminated from/i, type: 'employer_employee', direction: 'b_to_a' },
  { pattern: /landlord/i, type: 'landlord_tenant', direction: 'a_to_b' },
  { pattern: /tenant of/i, type: 'landlord_tenant', direction: 'b_to_a' },
  { pattern: /rents from/i, type: 'landlord_tenant', direction: 'b_to_a' },
  { pattern: /filed (?:a )?complaint (?:with|against)/i, type: 'agency_complainant', direction: 'b_to_a' },
  { pattern: /represented by/i, type: 'legal_representative_client', direction: 'b_to_a' },
  { pattern: /attorney for/i, type: 'legal_representative_client', direction: 'a_to_b' },
  { pattern: /married to/i, type: 'family', direction: 'bidirectional' },
  { pattern: /spouse/i, type: 'family', direction: 'bidirectional' },
  { pattern: /child of/i, type: 'family', direction: 'b_to_a' },
  { pattern: /parent of/i, type: 'family', direction: 'a_to_b' },
  { pattern: /insured by/i, type: 'insurer_insured', direction: 'b_to_a' },
  { pattern: /policy(?:holder)? (?:with|of)/i, type: 'insurer_insured', direction: 'b_to_a' },
  { pattern: /owes money to/i, type: 'creditor_debtor', direction: 'b_to_a' },
  { pattern: /creditor/i, type: 'creditor_debtor', direction: 'a_to_b' },
];

// ─── Engine ──────────────────────────────────────────────────────────────────

/**
 * Layer 7: Relationship Graph
 * 
 * Records explicitly stated relationships between entities.
 * CRITICAL CONSTRAINT: A relationship marker must appear within the SAME
 * text span (paragraph) as BOTH entity mentions, and must be positionally
 * between or adjacent to them. Document-wide pattern matching is prohibited
 * because it manufactures relationships.
 */
export function processLayer7(input: Layer7Input): EngineResult<Relationship[]> {
  const input_hash = computeHash({
    entities: input.entities.map(e => e.entity_id),
    artifacts: input.artifacts.map(a => a.raw_bytes_sha256),
  });
  const unresolved: UnresolvedDependency[] = [];

  if (input.entities.length < 2) {
    return {
      layer_name: 'relationship_graph',
      layer_version: LAYER_VERSION,
      rule_version: RULE_VERSION,
      parser_version: 'N/A',
      canonicalization_version: CANONICALIZATION_VERSION,
      input_hash,
      output_hash: computeHash([]),
      data: [],
      unresolved_dependencies: input.entities.length === 0
        ? [{ field: 'entities', reason: 'incomplete', detail: 'No entities to relate' }]
        : [],
      is_sealed: false,
    };
  }

  const relationships: Relationship[] = [];
  const seen = new Set<string>(); // Prevent duplicate relationships

  for (const artifact of input.artifacts) {
    if (artifact.extraction_status !== 'success') continue;

    // Process each span (paragraph) independently
    for (const span of artifact.spans) {
      const spanText = span.text;

      // Find which entities are mentioned in THIS span
      const entitiesInSpan: Array<{ entity: Entity; position: number }> = [];
      for (const entity of input.entities) {
        for (const mention of entity.raw_mentions) {
          if (mention.artifact_key !== artifact.artifact_key) continue;
          // Check if this mention falls within this span's boundaries
          if (mention.span_offset >= span.start_offset && mention.span_offset < span.end_offset) {
            entitiesInSpan.push({ entity, position: mention.span_offset - span.start_offset });
          }
        }
        // Also check by name occurrence in span text
        const nameIdx = spanText.indexOf(entity.raw_mentions[0]?.raw_text || '');
        if (nameIdx >= 0 && !entitiesInSpan.find(e => e.entity.entity_id === entity.entity_id)) {
          entitiesInSpan.push({ entity, position: nameIdx });
        }
      }

      if (entitiesInSpan.length < 2) continue;

      // For each pair of entities in this span, check for relationship markers
      // The marker must be positionally between or near the two entity mentions
      for (let i = 0; i < entitiesInSpan.length; i++) {
        for (let j = i + 1; j < entitiesInSpan.length; j++) {
          const entA = entitiesInSpan[i];
          const entB = entitiesInSpan[j];

          // Get the text region between the two entities
          const startPos = Math.min(entA.position, entB.position);
          const endPos = Math.max(entA.position, entB.position) + 
            (entA.position > entB.position ? entA.entity.canonical_name.length : entB.entity.canonical_name.length);
          
          // Include some context around the entities (±20 chars)
          const contextStart = Math.max(0, startPos - 20);
          const contextEnd = Math.min(spanText.length, endPos + 20);
          const contextText = spanText.substring(contextStart, contextEnd);

          for (const marker of RELATIONSHIP_MARKERS) {
            const markerMatch = marker.pattern.exec(contextText);
            if (markerMatch) {
              const relKey = `${entA.entity.entity_id}|${entB.entity.entity_id}|${marker.type}`;
              const relKeyReverse = `${entB.entity.entity_id}|${entA.entity.entity_id}|${marker.type}`;
              
              if (!seen.has(relKey) && !seen.has(relKeyReverse)) {
                seen.add(relKey);
                relationships.push({
                  relationship_id: `rel_${computeHash(relKey)}`.substring(0, 12),
                  entity_a_id: entA.entity.entity_id,
                  entity_b_id: entB.entity.entity_id,
                  type: marker.type,
                  direction: marker.direction,
                  source_artifact_key: artifact.artifact_key,
                  source_span_text: spanText,
                  marker_text: markerMatch[0],
                  marker_offset: span.start_offset + contextStart + markerMatch.index,
                });
              }
              break; // One relationship type per pair per span
            }
          }
        }
      }
    }
  }

  const sortedRelationships = relationships.sort((a, b) => a.relationship_id.localeCompare(b.relationship_id));
  const output_hash = computeHash(sortedRelationships);

  return {
    layer_name: 'relationship_graph',
    layer_version: LAYER_VERSION,
    rule_version: RULE_VERSION,
    parser_version: 'N/A',
    canonicalization_version: CANONICALIZATION_VERSION,
    input_hash,
    output_hash,
    data: sortedRelationships,
    unresolved_dependencies: unresolved,
    is_sealed: false,
  };
}

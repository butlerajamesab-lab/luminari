import {
  computeHash,
  computeRuleManifestHash,
  EngineResult,
  regexFromManifest,
  UnresolvedDependency,
  CANONICALIZATION_VERSION,
} from './utils';
import { Entity } from './layer-6-entity_registry';
import { ParsedArtifact } from './parsing-substrate';

export type RelationshipType =
  | 'employer_employee'
  | 'landlord_tenant'
  | 'agency_complainant'
  | 'insurer_insured'
  | 'creditor_debtor'
  | 'legal_representative_client'
  | 'family'
  | 'opposing_party';

export interface RelationshipSourceRef {
  artifact_key: string;
  span_start_offset: number;
  span_text: string;
  marker_text: string;
  marker_offset: number;
}

export interface Relationship {
  relationship_id: string;
  entity_a_id: string;
  entity_b_id: string;
  type: RelationshipType;
  direction: 'a_to_b' | 'b_to_a' | 'bidirectional';
  role_a: string;
  role_b: string;
  source_refs: RelationshipSourceRef[];
}

export interface Layer7Input {
  entities: Entity[];
  artifacts: ParsedArtifact[];
}

export const LAYER_VERSION = '2.2.0';
export const RULE_VERSION = '2.2.0';

type MarkerDirection = 'a_to_b' | 'b_to_a' | 'bidirectional';
type MarkerManifestRow = {
  regex: { source: string; flags: string };
  type: RelationshipType;
  direction: MarkerDirection;
};

export const RULE_MANIFEST: {
  context_chars: number;
  first_marker_per_pair_per_span: boolean;
  markers: MarkerManifestRow[];
  role_map: Record<RelationshipType, { authority: string; subject: string }>;
  mention_binding: 'exact_extracted_mention_offsets_only';
} = {
  context_chars: 20,
  first_marker_per_pair_per_span: true,
  markers: [
    { regex: { source: 'employed by', flags: 'i' }, type: 'employer_employee', direction: 'b_to_a' },
    { regex: { source: 'works for', flags: 'i' }, type: 'employer_employee', direction: 'b_to_a' },
    { regex: { source: 'employer', flags: 'i' }, type: 'employer_employee', direction: 'a_to_b' },
    { regex: { source: 'terminated from', flags: 'i' }, type: 'employer_employee', direction: 'b_to_a' },
    { regex: { source: 'landlord', flags: 'i' }, type: 'landlord_tenant', direction: 'a_to_b' },
    { regex: { source: 'tenant of', flags: 'i' }, type: 'landlord_tenant', direction: 'b_to_a' },
    { regex: { source: 'rents from', flags: 'i' }, type: 'landlord_tenant', direction: 'b_to_a' },
    { regex: { source: 'filed (?:a )?complaint (?:with|against)', flags: 'i' }, type: 'agency_complainant', direction: 'b_to_a' },
    { regex: { source: 'represented by', flags: 'i' }, type: 'legal_representative_client', direction: 'b_to_a' },
    { regex: { source: 'attorney for', flags: 'i' }, type: 'legal_representative_client', direction: 'a_to_b' },
    { regex: { source: 'married to', flags: 'i' }, type: 'family', direction: 'bidirectional' },
    { regex: { source: 'spouse', flags: 'i' }, type: 'family', direction: 'bidirectional' },
    { regex: { source: 'child of', flags: 'i' }, type: 'family', direction: 'b_to_a' },
    { regex: { source: 'parent of', flags: 'i' }, type: 'family', direction: 'a_to_b' },
    { regex: { source: 'insured by', flags: 'i' }, type: 'insurer_insured', direction: 'b_to_a' },
    { regex: { source: 'policy(?:holder)? (?:with|of)', flags: 'i' }, type: 'insurer_insured', direction: 'b_to_a' },
    { regex: { source: 'owes money to', flags: 'i' }, type: 'creditor_debtor', direction: 'b_to_a' },
    { regex: { source: 'creditor', flags: 'i' }, type: 'creditor_debtor', direction: 'a_to_b' },
  ],
  role_map: {
    employer_employee: { authority: 'employer', subject: 'employee' },
    landlord_tenant: { authority: 'landlord', subject: 'tenant' },
    agency_complainant: { authority: 'agency', subject: 'complainant' },
    insurer_insured: { authority: 'insurer', subject: 'insured' },
    creditor_debtor: { authority: 'creditor', subject: 'debtor' },
    legal_representative_client: { authority: 'representative', subject: 'client' },
    family: { authority: 'family_member', subject: 'family_member' },
    opposing_party: { authority: 'party', subject: 'party' },
  },
  mention_binding: 'exact_extracted_mention_offsets_only',
};

export const RULE_MANIFEST_HASH = computeRuleManifestHash(RULE_MANIFEST);
const RELATIONSHIP_MARKERS = RULE_MANIFEST.markers.map(row => ({
  pattern: regexFromManifest(row.regex),
  type: row.type,
  direction: row.direction,
}));

export function processLayer7(input: Layer7Input): EngineResult<Relationship[]> {
  const artifacts = [...input.artifacts].sort((a, b) => a.artifact_key.localeCompare(b.artifact_key));
  const parser_version = parserVersion(artifacts);
  const input_hash = computeHash({
    entity_ids: input.entities.map(entity => entity.entity_id).sort(),
    artifacts: artifacts.map(artifact => ({
      artifact_key: artifact.artifact_key,
      raw_bytes_sha256: artifact.raw_bytes_sha256,
      parser_version: artifact.parser_version,
      extraction_status: artifact.extraction_status,
      parsed_output_hash: computeHash({ extracted_text: artifact.extracted_text, spans: artifact.spans }),
    })),
  });
  const unresolved: UnresolvedDependency[] = [];

  if (input.entities.length < 2) {
    const data: Relationship[] = [];
    return {
      layer_name: 'relationship_graph',
      layer_version: LAYER_VERSION,
      rule_version: RULE_VERSION,
      parser_version,
      canonicalization_version: CANONICALIZATION_VERSION,
      input_hash,
      output_hash: computeHash(data),
      data,
      unresolved_dependencies: input.entities.length === 0
        ? [{ field: 'entities', reason: 'incomplete', detail: 'No entities to relate' }]
        : [],
      is_sealed: false,
    };
  }

  const relationshipMap = new Map<string, Relationship>();
  for (const artifact of artifacts) {
    if (artifact.extraction_status !== 'success') {
      unresolved.push({
        field: `artifact:${artifact.artifact_key}`,
        reason: artifact.extraction_status === 'unsupported_format' ? 'unsupported_format' : 'incomplete',
        detail: `Relationship extraction skipped artifact state ${artifact.extraction_status}`,
      });
      continue;
    }

    for (const span of [...artifact.spans].sort((a, b) => a.start_offset - b.start_offset)) {
      const spanText = span.text;
      const entitiesInSpan: Array<{ entity: Entity; position: number; mention_text: string }> = [];

      for (const entity of input.entities) {
        const mentions = entity.raw_mentions
          .filter(mention =>
            mention.artifact_key === artifact.artifact_key &&
            mention.span_offset >= span.start_offset &&
            mention.span_offset < span.end_offset,
          )
          .sort((a, b) => a.span_offset - b.span_offset || a.raw_text.localeCompare(b.raw_text));
        if (mentions.length > 0) {
          entitiesInSpan.push({
            entity,
            position: mentions[0].span_offset - span.start_offset,
            mention_text: mentions[0].raw_text,
          });
        }
      }

      entitiesInSpan.sort((a, b) => a.position - b.position || a.entity.entity_id.localeCompare(b.entity.entity_id));
      if (entitiesInSpan.length < 2) continue;

      for (let i = 0; i < entitiesInSpan.length; i++) {
        for (let j = i + 1; j < entitiesInSpan.length; j++) {
          const first = entitiesInSpan[i];
          const second = entitiesInSpan[j];
          const contextStart = Math.max(0, first.position - RULE_MANIFEST.context_chars);
          const contextEnd = Math.min(spanText.length, second.position + second.mention_text.length + RULE_MANIFEST.context_chars);
          const contextText = spanText.substring(contextStart, contextEnd);

          for (const marker of RELATIONSHIP_MARKERS) {
            marker.pattern.lastIndex = 0;
            const markerMatch = marker.pattern.exec(contextText);
            if (!markerMatch) continue;

            const textualRoles = getTextualRoles(marker.type, marker.direction);
            const canonical = canonicalizeRelationshipEndpoints(
              first.entity.entity_id,
              textualRoles.role_first,
              second.entity.entity_id,
              textualRoles.role_second,
              marker.type,
            );
            const identity = `${canonical.entity_a_id}|${canonical.role_a}|${canonical.entity_b_id}|${canonical.role_b}|${marker.type}|${canonical.direction}`;
            const relationship_id = `rel_${computeHash(identity).substring(0, 16)}`;
            const sourceRef: RelationshipSourceRef = {
              artifact_key: artifact.artifact_key,
              span_start_offset: span.start_offset,
              span_text: spanText,
              marker_text: markerMatch[0],
              marker_offset: span.start_offset + contextStart + markerMatch.index,
            };

            const existing = relationshipMap.get(relationship_id);
            if (existing) {
              const sourceKey = `${sourceRef.artifact_key}|${sourceRef.marker_offset}`;
              if (!existing.source_refs.some(ref => `${ref.artifact_key}|${ref.marker_offset}` === sourceKey)) {
                existing.source_refs.push(sourceRef);
                existing.source_refs.sort((a, b) => a.artifact_key.localeCompare(b.artifact_key) || a.marker_offset - b.marker_offset);
              }
            } else {
              relationshipMap.set(relationship_id, {
                relationship_id,
                entity_a_id: canonical.entity_a_id,
                entity_b_id: canonical.entity_b_id,
                type: marker.type,
                direction: canonical.direction,
                role_a: canonical.role_a,
                role_b: canonical.role_b,
                source_refs: [sourceRef],
              });
            }

            if (RULE_MANIFEST.first_marker_per_pair_per_span) break;
          }
        }
      }
    }
  }

  const data = Array.from(relationshipMap.values()).sort((a, b) => a.relationship_id.localeCompare(b.relationship_id));
  return {
    layer_name: 'relationship_graph',
    layer_version: LAYER_VERSION,
    rule_version: RULE_VERSION,
    parser_version,
    canonicalization_version: CANONICALIZATION_VERSION,
    input_hash,
    output_hash: computeHash(data),
    data,
    unresolved_dependencies: unresolved.sort((a, b) => a.field.localeCompare(b.field)),
    is_sealed: false,
  };
}

function getTextualRoles(
  type: RelationshipType,
  direction: MarkerDirection,
): { role_first: string; role_second: string } {
  const roles = RULE_MANIFEST.role_map[type];
  if (direction === 'a_to_b') return { role_first: roles.authority, role_second: roles.subject };
  if (direction === 'b_to_a') return { role_first: roles.subject, role_second: roles.authority };
  return { role_first: roles.subject, role_second: roles.subject };
}

function canonicalizeRelationshipEndpoints(
  firstEntityId: string,
  firstRole: string,
  secondEntityId: string,
  secondRole: string,
  type: RelationshipType,
): {
  entity_a_id: string;
  entity_b_id: string;
  role_a: string;
  role_b: string;
  direction: MarkerDirection;
} {
  const firstIsA = firstEntityId.localeCompare(secondEntityId) <= 0;
  const entity_a_id = firstIsA ? firstEntityId : secondEntityId;
  const entity_b_id = firstIsA ? secondEntityId : firstEntityId;
  const role_a = firstIsA ? firstRole : secondRole;
  const role_b = firstIsA ? secondRole : firstRole;
  const roles = RULE_MANIFEST.role_map[type];

  let direction: MarkerDirection = 'bidirectional';
  if (roles.authority !== roles.subject) {
    if (role_a === roles.authority && role_b === roles.subject) direction = 'a_to_b';
    else if (role_b === roles.authority && role_a === roles.subject) direction = 'b_to_a';
  }
  return { entity_a_id, entity_b_id, role_a, role_b, direction };
}

function parserVersion(artifacts: ParsedArtifact[]): string {
  const versions = Array.from(new Set(artifacts.map(artifact => artifact.parser_version))).sort();
  return versions.length === 0 ? 'N/A' : versions.join('|');
}

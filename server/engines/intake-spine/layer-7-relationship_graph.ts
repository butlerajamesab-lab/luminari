import {
  computeHash,
  computeRuleManifestHash,
  EngineResult,
  regexFromManifest,
  UnresolvedDependency,
  CANONICALIZATION_VERSION,
} from './utils';
import { Entity, EntityType } from './layer-6-entity_registry';
import { ParsedArtifact } from './parsing-substrate';
import {
  isExcludedFromDominantSemanticLane,
  semanticSpansForArtifact,
} from './semantic-substrate';

export type RelationshipType =
  | 'employer_employee'
  | 'landlord_tenant'
  | 'agency_complainant'
  | 'insurer_insured'
  | 'creditor_debtor'
  | 'legal_representative_client'
  | 'caregiver_recipient'
  | 'facility_resident'
  | 'authorized_representative_subject'
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

export const LAYER_VERSION = '2.5.0';
export const RULE_VERSION = '2.5.0';

type MarkerDirection = 'a_to_b' | 'b_to_a' | 'bidirectional';
type MarkerScope = 'between_mentions' | 'post_coordinated_endpoints';
type MarkerManifestRow = {
  regex: { source: string; flags: string };
  type: RelationshipType;
  direction: MarkerDirection;
  scope?: MarkerScope;
};

export const RULE_MANIFEST: {
  context_chars: number;
  first_marker_per_pair_per_span: boolean;
  markers: MarkerManifestRow[];
  role_map: Record<RelationshipType, { authority: string; subject: string }>;
  mention_binding: 'exact_extracted_mention_offsets_only';
  marker_scope: 'bound_regions_in_one_sentence';
  coordinated_endpoint_policy: 'complete_contiguous_list_all_pairs';
  endpoint_type_policy: 'role_compatible';
} = {
  context_chars: 32,
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
    { regex: { source: '(?:is |was )?(?:the )?caregiver for', flags: 'i' }, type: 'caregiver_recipient', direction: 'a_to_b' },
    { regex: { source: '(?:cares|cared|caring) for', flags: 'i' }, type: 'caregiver_recipient', direction: 'a_to_b' },
    { regex: { source: 'provid(?:e|es|ed|ing) care for', flags: 'i' }, type: 'caregiver_recipient', direction: 'a_to_b' },
    { regex: { source: 'cared for by', flags: 'i' }, type: 'caregiver_recipient', direction: 'b_to_a' },
    { regex: { source: '(?:is |was )?(?:a )?resident (?:at|of)', flags: 'i' }, type: 'facility_resident', direction: 'b_to_a' },
    { regex: { source: '(?:resides|resided|lives|lived|stays|stayed) at', flags: 'i' }, type: 'facility_resident', direction: 'b_to_a' },
    { regex: { source: '(?:admitted|transferred) to', flags: 'i' }, type: 'facility_resident', direction: 'b_to_a' },
    { regex: { source: 'authorized representative for', flags: 'i' }, type: 'authorized_representative_subject', direction: 'a_to_b' },
    { regex: { source: '(?:holds |has )?(?:a )?power of attorney for', flags: 'i' }, type: 'authorized_representative_subject', direction: 'a_to_b' },
    { regex: { source: 'married to', flags: 'i' }, type: 'family', direction: 'bidirectional' },
    { regex: { source: 'spouse', flags: 'i' }, type: 'family', direction: 'bidirectional' },
    { regex: { source: '^(?:are|were) family(?: members)?', flags: 'i' }, type: 'family', direction: 'bidirectional', scope: 'post_coordinated_endpoints' },
    { regex: { source: 'child of', flags: 'i' }, type: 'family', direction: 'b_to_a' },
    { regex: { source: 'parent of', flags: 'i' }, type: 'family', direction: 'a_to_b' },
    { regex: { source: '(?:daughter|son|mother|father|sister|brother) of', flags: 'i' }, type: 'family', direction: 'bidirectional' },
    { regex: { source: 'insured by', flags: 'i' }, type: 'insurer_insured', direction: 'b_to_a' },
    { regex: { source: 'policy(?:holder)? (?:with|of)', flags: 'i' }, type: 'insurer_insured', direction: 'b_to_a' },
    { regex: { source: 'owes money to', flags: 'i' }, type: 'creditor_debtor', direction: 'b_to_a' },
    { regex: { source: 'creditor', flags: 'i' }, type: 'creditor_debtor', direction: 'a_to_b' },
    { regex: { source: '^(?:are|were) opposing parties', flags: 'i' }, type: 'opposing_party', direction: 'bidirectional', scope: 'post_coordinated_endpoints' },
  ],
  role_map: {
    employer_employee: { authority: 'employer', subject: 'employee' },
    landlord_tenant: { authority: 'landlord', subject: 'tenant' },
    agency_complainant: { authority: 'agency', subject: 'complainant' },
    insurer_insured: { authority: 'insurer', subject: 'insured' },
    creditor_debtor: { authority: 'creditor', subject: 'debtor' },
    legal_representative_client: { authority: 'representative', subject: 'client' },
    caregiver_recipient: { authority: 'caregiver', subject: 'care_recipient' },
    facility_resident: { authority: 'facility', subject: 'resident' },
    authorized_representative_subject: { authority: 'authorized_representative', subject: 'represented_person' },
    family: { authority: 'family_member', subject: 'family_member' },
    opposing_party: { authority: 'party', subject: 'party' },
  },
  mention_binding: 'exact_extracted_mention_offsets_only',
  marker_scope: 'bound_regions_in_one_sentence',
  coordinated_endpoint_policy: 'complete_contiguous_list_all_pairs',
  endpoint_type_policy: 'role_compatible',
};

export const RULE_MANIFEST_HASH = computeRuleManifestHash(RULE_MANIFEST);
const RELATIONSHIP_MARKERS = RULE_MANIFEST.markers.map(row => ({
  pattern: regexFromManifest(row.regex),
  type: row.type,
  direction: row.direction,
  scope: row.scope ?? 'between_mentions',
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

    if (isExcludedFromDominantSemanticLane(artifact, artifacts)) {
      unresolved.push({
        field: `artifact:${artifact.artifact_key}:semantic_lane`,
        reason: 'unresolved',
        detail: 'Artifact preserved as evidence but excluded from the dominant CMS-2567 semantic lane',
      });
      continue;
    }

    for (const span of semanticSpansForArtifact(artifact, artifacts)) {
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
        for (const mention of mentions) {
          entitiesInSpan.push({
            entity,
            position: mention.span_offset - span.start_offset,
            mention_text: mention.raw_text,
          });
        }
      }

      entitiesInSpan.sort((a, b) => a.position - b.position || a.entity.entity_id.localeCompare(b.entity.entity_id));
      if (entitiesInSpan.length < 2) continue;

      for (let i = 0; i < entitiesInSpan.length; i++) {
        for (let j = i + 1; j < entitiesInSpan.length; j++) {
          const first = entitiesInSpan[i];
          const second = entitiesInSpan[j];
          if (first.entity.entity_id === second.entity.entity_id) continue;
          const markerSearchStart = first.position + first.mention_text.length;
          const markerSearchEnd = second.position;
          if (markerSearchEnd <= markerSearchStart) continue;
          const betweenMentions = spanText.substring(markerSearchStart, markerSearchEnd);

          for (const marker of RELATIONSHIP_MARKERS) {
            const markerBinding = marker.scope === 'post_coordinated_endpoints'
              ? findPostCoordinatedMarkerForPair(
                  spanText,
                  entitiesInSpan,
                  i,
                  j,
                  marker.pattern,
                )
              : findMarkerInRegion(
                  betweenMentions,
                  markerSearchStart,
                  marker.pattern,
                );
            if (!markerBinding) continue;

            const textualRoles = getTextualRoles(marker.type, marker.direction);
            if (
              !isRelationshipRoleTypeCompatible(marker.type, textualRoles.role_first, first.entity.type)
              || !isRelationshipRoleTypeCompatible(marker.type, textualRoles.role_second, second.entity.type)
            ) {
              continue;
            }
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
              marker_text: markerBinding.match[0],
              marker_offset: span.start_offset + markerBinding.marker_offset,
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

type SpanEntityMention = {
  entity: Entity;
  position: number;
  mention_text: string;
};

function findMarkerInRegion(
  text: string,
  regionStart: number,
  pattern: RegExp,
): { match: RegExpExecArray; marker_offset: number } | null {
  pattern.lastIndex = 0;
  const match = pattern.exec(text);
  return match
    ? { match, marker_offset: regionStart + match.index }
    : null;
}

function findPostCoordinatedMarkerForPair(
  spanText: string,
  mentions: SpanEntityMention[],
  pairFirstIndex: number,
  pairSecondIndex: number,
  pattern: RegExp,
): { match: RegExpExecArray; marker_offset: number } | null {
  for (let groupEnd = pairSecondIndex; groupEnd < mentions.length; groupEnd++) {
    const lastMention = mentions[groupEnd];
    const postEndpointStart = lastMention.position + lastMention.mention_text.length;
    const postEndpointText = spanText.substring(postEndpointStart);
    const leadingWhitespace = postEndpointText.search(/\S/);
    if (leadingWhitespace < 0) continue;

    const markerBinding = findMarkerInRegion(
      postEndpointText.substring(leadingWhitespace),
      postEndpointStart + leadingWhitespace,
      pattern,
    );
    if (!markerBinding) continue;

    let groupStart = groupEnd;
    while (groupStart > 0) {
      const previous = mentions[groupStart - 1];
      const current = mentions[groupStart];
      const separator = spanText.substring(
        previous.position + previous.mention_text.length,
        current.position,
      );
      if (!isCoordinatedListSeparator(separator)) break;
      groupStart--;
    }

    if (pairFirstIndex >= groupStart && pairSecondIndex <= groupEnd) {
      return markerBinding;
    }
  }
  return null;
}

function isCoordinatedListSeparator(text: string): boolean {
  return /^\s*(?:,\s*(?:(?:and|or|&)\s*)?|(?:and|or|&)\s*)$/i.test(text);
}

export function isRelationshipRoleTypeCompatible(
  type: RelationshipType,
  role: string,
  entityType: EntityType,
): boolean {
  const personLike = entityType === 'person' || entityType === 'unknown';
  const organizationLike = entityType === 'organization' || entityType === 'unknown';
  const partyLike = personLike || organizationLike;

  switch (type) {
    case 'facility_resident':
      return role === 'facility' ? entityType === 'organization' : personLike;
    case 'caregiver_recipient':
    case 'family':
      return personLike;
    case 'employer_employee':
      return role === 'employer' ? organizationLike : personLike;
    case 'agency_complainant':
      return role === 'agency' ? organizationLike : personLike;
    case 'insurer_insured':
      return role === 'insurer' ? organizationLike : partyLike;
    case 'landlord_tenant':
    case 'creditor_debtor':
    case 'legal_representative_client':
    case 'authorized_representative_subject':
    case 'opposing_party':
      return partyLike;
  }
}

export function isRelationshipTypeCompatible(
  relationship: Relationship,
  entities: Map<string, Entity> | Entity[],
): boolean {
  const entityMap = entities instanceof Map
    ? entities
    : new Map(entities.map(entity => [entity.entity_id, entity]));
  const entityA = entityMap.get(relationship.entity_a_id);
  const entityB = entityMap.get(relationship.entity_b_id);
  return Boolean(
    entityA
    && entityB
    && relationship.entity_a_id !== relationship.entity_b_id
    && isRelationshipRoleTypeCompatible(relationship.type, relationship.role_a, entityA.type)
    && isRelationshipRoleTypeCompatible(relationship.type, relationship.role_b, entityB.type),
  );
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

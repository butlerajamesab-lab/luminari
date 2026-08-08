import {
  computeHash,
  computeRuleManifestHash,
  EngineResult,
  FactStatus,
  UnresolvedDependency,
  CANONICALIZATION_VERSION,
} from './utils';
import { Relationship } from './layer-7-relationship_graph';
import { StateTransition } from './layer-9-state_timeline';

export interface StructuredFact {
  fact_id: string;
  entity_id: string;
  attribute: string;
  value: string;
  applicable_time: string | null;
  source_artifact_key: string;
  source_span_offset: number;
  source_text: string;
}

export interface VerificationRecord {
  fact_key: string;
  verification_state: FactStatus;
  source_refs: SourceRef[];
  contradiction_refs: ContradictionRef[];
}

export interface SourceRef {
  artifact_key: string;
  span_offset: number;
  value_stated: string;
}

export interface ContradictionRef {
  artifact_key_a: string;
  value_a: string;
  artifact_key_b: string;
  value_b: string;
  attribute: string;
}

export interface Layer5Input {
  transitions: StateTransition[];
  relationships: Relationship[];
}

export const LAYER_VERSION = '2.1.0';
export const RULE_VERSION = '2.1.0';

/**
 * Verification owns evidence posture, not extraction. The fact projection is
 * deliberately narrow: state transitions and explicit relationship edges are
 * converted to structured facts without inventing legal meaning or causation.
 */
export const RULE_MANIFEST = {
  fact_projection: {
    state_transition: {
      attribute: 'state',
      value: 'to_state',
      applicable_time: 'transition_date',
    },
    relationship: {
      attribute: 'relationship:<role_a>',
      value: '<entity_b_id>|<role_b>|<relationship_type>',
      applicable_time: null,
    },
  },
  contradiction_policy: 'same_entity_attribute_time_different_value_across_independent_artifacts',
  same_source_conflict_policy: 'disputed',
  one_source_policy: 'document_stated',
  multiple_source_same_value_policy: 'supported_by_multiple_sources',
} as const;

export const RULE_MANIFEST_HASH = computeRuleManifestHash(RULE_MANIFEST);

export function buildStructuredFacts(input: Layer5Input): StructuredFact[] {
  const facts: StructuredFact[] = [];

  for (const transition of [...input.transitions].sort((a, b) => a.transition_id.localeCompare(b.transition_id))) {
    facts.push({
      fact_id: `fact_${computeHash({ type: 'state', transition_id: transition.transition_id }).substring(0, 16)}`,
      entity_id: transition.entity_id,
      attribute: 'state',
      value: transition.to_state,
      applicable_time: transition.transition_date,
      source_artifact_key: transition.source_artifact_key,
      source_span_offset: transition.source_span_offset,
      source_text: transition.source_text,
    });
  }

  for (const relationship of [...input.relationships].sort((a, b) => a.relationship_id.localeCompare(b.relationship_id))) {
    for (const ref of [...relationship.source_refs].sort((a, b) =>
      a.artifact_key.localeCompare(b.artifact_key) || a.marker_offset - b.marker_offset,
    )) {
      facts.push({
        fact_id: `fact_${computeHash({
          type: 'relationship',
          relationship_id: relationship.relationship_id,
          artifact_key: ref.artifact_key,
          marker_offset: ref.marker_offset,
        }).substring(0, 16)}`,
        entity_id: relationship.entity_a_id,
        attribute: `relationship:${relationship.role_a}`,
        value: `${relationship.entity_b_id}|${relationship.role_b}|${relationship.type}`,
        applicable_time: null,
        source_artifact_key: ref.artifact_key,
        source_span_offset: ref.marker_offset,
        source_text: ref.span_text,
      });
    }
  }

  return facts.sort((a, b) => a.fact_id.localeCompare(b.fact_id));
}

export function processLayer5(input: Layer5Input): EngineResult<VerificationRecord[]> {
  const facts = buildStructuredFacts(input);
  const input_hash = computeHash({ facts });
  const unresolved: UnresolvedDependency[] = [];

  if (facts.length === 0) {
    const data: VerificationRecord[] = [];
    return {
      layer_name: 'verification_gate',
      layer_version: LAYER_VERSION,
      rule_version: RULE_VERSION,
      parser_version: 'N/A',
      canonicalization_version: CANONICALIZATION_VERSION,
      input_hash,
      output_hash: computeHash(data),
      data,
      unresolved_dependencies: [{ field: 'facts', reason: 'incomplete', detail: 'No canonical relationship or state-transition facts are available to verify' }],
      is_sealed: false,
    };
  }

  const factGroups = new Map<string, StructuredFact[]>();
  for (const fact of facts) {
    const key = `${fact.entity_id}|${fact.attribute}|${fact.applicable_time || 'TIMELESS'}`;
    const group = factGroups.get(key) || [];
    group.push(fact);
    factGroups.set(key, group);
  }

  const records: VerificationRecord[] = [];

  for (const [factKey, groupedFacts] of Array.from(factGroups.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const source_refs: SourceRef[] = groupedFacts
      .map(f => ({ artifact_key: f.source_artifact_key, span_offset: f.source_span_offset, value_stated: f.value }))
      .sort((a, b) => a.artifact_key.localeCompare(b.artifact_key) || a.span_offset - b.span_offset || a.value_stated.localeCompare(b.value_stated));

    const valuesByArtifact = new Map<string, Set<string>>();
    for (const fact of groupedFacts) {
      const values = valuesByArtifact.get(fact.source_artifact_key) || new Set<string>();
      values.add(fact.value);
      valuesByArtifact.set(fact.source_artifact_key, values);
    }

    const contradiction_refs: ContradictionRef[] = [];
    const artifacts = Array.from(valuesByArtifact.keys()).sort();
    for (let i = 0; i < artifacts.length; i++) {
      for (let j = i + 1; j < artifacts.length; j++) {
        const artifactA = artifacts[i];
        const artifactB = artifacts[j];
        for (const valueA of Array.from(valuesByArtifact.get(artifactA) || []).sort()) {
          for (const valueB of Array.from(valuesByArtifact.get(artifactB) || []).sort()) {
            if (valueA === valueB) continue;
            contradiction_refs.push({
              artifact_key_a: artifactA,
              value_a: valueA,
              artifact_key_b: artifactB,
              value_b: valueB,
              attribute: groupedFacts[0].attribute,
            });
          }
        }
      }
    }

    const sameSourceConflict = Array.from(valuesByArtifact.values()).some(values => values.size > 1);
    const allValues = new Set(groupedFacts.map(f => f.value));
    let verification_state: FactStatus;

    if (contradiction_refs.length > 0) verification_state = 'contradicted';
    else if (sameSourceConflict || allValues.size > 1) verification_state = 'disputed';
    else if (valuesByArtifact.size >= 2) verification_state = 'supported_by_multiple_sources';
    else if (valuesByArtifact.size === 1) verification_state = 'document_stated';
    else verification_state = 'unresolved';

    records.push({
      fact_key: factKey,
      verification_state,
      source_refs,
      contradiction_refs: contradiction_refs.sort((a, b) =>
        a.artifact_key_a.localeCompare(b.artifact_key_a) ||
        a.artifact_key_b.localeCompare(b.artifact_key_b) ||
        a.value_a.localeCompare(b.value_a) ||
        a.value_b.localeCompare(b.value_b),
      ),
    });
  }

  return {
    layer_name: 'verification_gate',
    layer_version: LAYER_VERSION,
    rule_version: RULE_VERSION,
    parser_version: 'N/A',
    canonicalization_version: CANONICALIZATION_VERSION,
    input_hash,
    output_hash: computeHash(records),
    data: records,
    unresolved_dependencies: unresolved,
    is_sealed: false,
  };
}

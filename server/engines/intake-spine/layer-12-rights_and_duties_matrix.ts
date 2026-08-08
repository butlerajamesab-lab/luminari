import {
  computeHash,
  computeRuleManifestHash,
  EngineResult,
  UnresolvedDependency,
  CANONICALIZATION_VERSION,
} from './utils';
import { Entity } from './layer-6-entity_registry';
import { Relationship, RelationshipType } from './layer-7-relationship_graph';
import { StateTransition } from './layer-9-state_timeline';
import { DetectedPattern } from './layer-10-pattern_registry';
import {
  GovernedLegalRegistryManifest,
  computeGovernedLegalRegistryHash,
} from './governed-legal-registry';

export interface ClaimCandidate {
  candidate_id: string;
  claim_type_id: string;
  claim_type_name: string;
  claim_domain: string;
  subject_entity_id: string;
  triggering_relationship_ids: string[];
  triggering_transition_ids: string[];
  triggering_pattern_ids: string[];
  triggering_facts: TriggeringFact[];
  matching_rule: string;
  required_elements: RequiredElement[];
  unresolved_elements: string[];
  jurisdiction: string;
  governing_standards: string[];
  deadline_candidates: DeadlineCandidate[];
  registry_binding: {
    contract_version: string;
    governed_registry_hash: string;
    claim_registry_id: number;
  };
  applicability_status: 'candidate_unverified';
}

export interface TriggeringFact {
  fact_description: string;
  source_transition_id: string | null;
  source_relationship_id: string | null;
  source_pattern_id: string | null;
  source_entity_id: string;
}

export interface RequiredElement {
  registry_id: number;
  element_name: string;
  element_description: string | null;
  required_evidence_types: string[];
  is_required: boolean;
  evaluation_state: 'unresolved';
}

export interface DeadlineCandidate {
  registry_id: string;
  jurisdiction: string;
  deadline_days: number | null;
  deadline_description: string | null;
  filing_body: string | null;
  source_citation: string | null;
  source_url: string | null;
  binding_state: 'domain_candidate_not_claim_specific';
}

export interface Layer12Input {
  entities: Entity[];
  relationships: Relationship[];
  transitions: StateTransition[];
  patterns: DetectedPattern[];
  jurisdiction: string;
  governed_registry: GovernedLegalRegistryManifest;
  governed_registry_hash: string;
}

export const LAYER_VERSION = '3.0.0';
export const RULE_VERSION = '3.0.0';

export interface CandidateTriggerRule {
  rule_id: string;
  claim_type_id: string;
  relationship_type: RelationshipType;
  required_subject_role: string;
  transition_states_any: string[];
  pattern_types_any: string[];
}

/**
 * These are structural routing rules only. They do not define legal elements,
 * limitation periods, statutes, venues, or remedies. Those come exclusively
 * from the frozen governed registry supplied as R at execution time.
 */
export const RULE_MANIFEST: {
  trigger_rules: CandidateTriggerRule[];
  legal_element_evaluation_owner: 'downstream_claim_proof_system';
  claim_candidate_is_legal_conclusion: false;
  domain_deadline_binding_policy: 'candidate_only_not_claim_specific';
} = {
  trigger_rules: [
    {
      rule_id: 'route_wrongful_termination_v1',
      claim_type_id: 'wrongful_termination',
      relationship_type: 'employer_employee',
      required_subject_role: 'employee',
      transition_states_any: ['terminated'],
      pattern_types_any: [],
    },
    {
      rule_id: 'route_unlawful_eviction_v1',
      claim_type_id: 'eviction_unlawful',
      relationship_type: 'landlord_tenant',
      required_subject_role: 'tenant',
      transition_states_any: ['evicted', 'eviction_notice_served'],
      pattern_types_any: [],
    },
    {
      rule_id: 'route_benefits_denial_v1',
      claim_type_id: 'benefits_denial',
      relationship_type: 'agency_complainant',
      required_subject_role: 'complainant',
      transition_states_any: ['denied', 'benefits_terminated'],
      pattern_types_any: [],
    },
    {
      rule_id: 'route_employment_retaliation_v1',
      claim_type_id: 'retaliation_employment',
      relationship_type: 'employer_employee',
      required_subject_role: 'employee',
      transition_states_any: [],
      pattern_types_any: ['retaliation_structural_match'],
    },
  ],
  legal_element_evaluation_owner: 'downstream_claim_proof_system',
  claim_candidate_is_legal_conclusion: false,
  domain_deadline_binding_policy: 'candidate_only_not_claim_specific',
};

export const RULE_MANIFEST_HASH = computeRuleManifestHash(RULE_MANIFEST);

export function computeLayer12ExecutionRuleManifestHash(governed_registry_hash: string): string {
  if (!/^[0-9a-f]{64}$/.test(governed_registry_hash)) {
    throw new Error('layer12_governed_registry_hash_invalid');
  }
  return computeRuleManifestHash({
    engine_rule_manifest: RULE_MANIFEST,
    governed_legal_registry_hash: governed_registry_hash,
  });
}

export function processLayer12(input: Layer12Input): EngineResult<ClaimCandidate[]> {
  const computedRegistryHash = computeGovernedLegalRegistryHash(input.governed_registry);
  if (computedRegistryHash !== input.governed_registry_hash) {
    throw new Error('layer12_governed_registry_hash_mismatch');
  }

  const jurisdiction = input.jurisdiction.trim().toUpperCase();
  if (!jurisdiction) throw new Error('layer12_jurisdiction_required');

  const entities = [...input.entities].sort((a, b) => a.entity_id.localeCompare(b.entity_id));
  const relationships = [...input.relationships].sort((a, b) => a.relationship_id.localeCompare(b.relationship_id));
  const transitions = [...input.transitions].sort((a, b) => a.transition_id.localeCompare(b.transition_id));
  const patterns = [...input.patterns].sort((a, b) => a.pattern_id.localeCompare(b.pattern_id));
  const input_hash = computeHash({
    entity_ids: entities.map(e => e.entity_id),
    relationship_ids: relationships.map(r => r.relationship_id),
    transition_ids: transitions.map(t => t.transition_id),
    pattern_ids: patterns.map(p => p.pattern_id),
    jurisdiction,
    governed_registry_hash: input.governed_registry_hash,
  });

  const unresolved: UnresolvedDependency[] = [];
  const candidates: ClaimCandidate[] = [];
  const claimMap = new Map(input.governed_registry.claims.map(claim => [claim.claim_type_id, claim]));
  const elementsByClaim = new Map<string, typeof input.governed_registry.elements>();
  for (const element of input.governed_registry.elements) {
    const list = elementsByClaim.get(element.claim_type_id) || [];
    list.push(element);
    elementsByClaim.set(element.claim_type_id, list);
  }

  for (const entity of entities) {
    if (entity.type !== 'person') continue;
    const entityTransitions = transitions.filter(t => t.entity_id === entity.entity_id);
    const entityPatterns = patterns.filter(p => p.matching_entities.includes(entity.entity_id));

    for (const rule of RULE_MANIFEST.trigger_rules) {
      const relationship = relationships.find(rel => relationshipMatchesSubject(rel, entity.entity_id, rule.relationship_type, rule.required_subject_role));
      if (!relationship) continue;

      const transitionMatches = rule.transition_states_any.length === 0
        ? []
        : entityTransitions.filter(t => rule.transition_states_any.includes(t.to_state));
      if (rule.transition_states_any.length > 0 && transitionMatches.length === 0) continue;

      const patternMatches = rule.pattern_types_any.length === 0
        ? []
        : entityPatterns.filter(pattern => rule.pattern_types_any.includes(pattern.pattern_type));
      if (rule.pattern_types_any.length > 0 && patternMatches.length === 0) continue;

      const claim = claimMap.get(rule.claim_type_id);
      if (!claim) {
        unresolved.push({
          field: `claim_registry:${rule.claim_type_id}`,
          reason: 'referenced_missing',
          detail: `Structural routing rule ${rule.rule_id} matched, but the governed claim registry does not contain ${rule.claim_type_id}.`,
        });
        continue;
      }

      const elements = [...(elementsByClaim.get(claim.claim_type_id) || [])].sort((a, b) =>
        (a.element_order ?? Number.MAX_SAFE_INTEGER) - (b.element_order ?? Number.MAX_SAFE_INTEGER) ||
        a.element_name.localeCompare(b.element_name),
      );
      if (elements.length === 0) {
        unresolved.push({
          field: `claim_elements:${claim.claim_type_id}`,
          reason: 'referenced_missing',
          detail: 'Claim candidate exists, but no governed required-element records are bound to it.',
        });
      }

      const deadlineCandidates: DeadlineCandidate[] = input.governed_registry.deadlines
        .filter(deadline => deadline.claim_domain === claim.domain && (deadline.jurisdiction === jurisdiction || deadline.jurisdiction === 'FEDERAL'))
        .map(deadline => ({
          registry_id: deadline.registry_id,
          jurisdiction: deadline.jurisdiction,
          deadline_days: deadline.deadline_days,
          deadline_description: deadline.deadline_description,
          filing_body: deadline.filing_body,
          source_citation: deadline.source_citation,
          source_url: deadline.source_url,
          binding_state: 'domain_candidate_not_claim_specific' as const,
        }))
        .sort((a, b) => a.jurisdiction.localeCompare(b.jurisdiction) || a.registry_id.localeCompare(b.registry_id));

      const triggeringFacts: TriggeringFact[] = [{
        fact_description: `${relationship.type} relationship with subject role ${rule.required_subject_role}`,
        source_transition_id: null,
        source_relationship_id: relationship.relationship_id,
        source_pattern_id: null,
        source_entity_id: entity.entity_id,
      }];
      for (const transition of transitionMatches) {
        triggeringFacts.push({
          fact_description: `${transition.to_state} state transition`,
          source_transition_id: transition.transition_id,
          source_relationship_id: null,
          source_pattern_id: null,
          source_entity_id: entity.entity_id,
        });
      }
      for (const pattern of patternMatches) {
        triggeringFacts.push({
          fact_description: `${pattern.pattern_type} structural pattern`,
          source_transition_id: null,
          source_relationship_id: null,
          source_pattern_id: pattern.pattern_id,
          source_entity_id: entity.entity_id,
        });
      }

      const triggering_relationship_ids = [relationship.relationship_id];
      const triggering_transition_ids = transitionMatches.map(t => t.transition_id).sort();
      const triggering_pattern_ids = patternMatches.map(p => p.pattern_id).sort();
      const candidate_id = `cand_${computeHash({
        subject_entity_id: entity.entity_id,
        claim_type_id: claim.claim_type_id,
        triggering_relationship_ids,
        triggering_transition_ids,
        triggering_pattern_ids,
        jurisdiction,
      }).substring(0, 16)}`;

      candidates.push({
        candidate_id,
        claim_type_id: claim.claim_type_id,
        claim_type_name: claim.canonical_name,
        claim_domain: claim.domain,
        subject_entity_id: entity.entity_id,
        triggering_relationship_ids,
        triggering_transition_ids,
        triggering_pattern_ids,
        triggering_facts: triggeringFacts,
        matching_rule: rule.rule_id,
        required_elements: elements.map(element => ({
          registry_id: element.registry_id,
          element_name: element.element_name,
          element_description: element.element_description,
          required_evidence_types: [...element.required_evidence_types].sort(),
          is_required: element.is_required,
          evaluation_state: 'unresolved' as const,
        })),
        unresolved_elements: elements.filter(element => element.is_required).map(element => element.element_name),
        jurisdiction,
        governing_standards: [...claim.governing_standards].sort(),
        deadline_candidates: deadlineCandidates,
        registry_binding: {
          contract_version: input.governed_registry.contract_version,
          governed_registry_hash: input.governed_registry_hash,
          claim_registry_id: claim.registry_id,
        },
        applicability_status: 'candidate_unverified',
      });
    }
  }

  const data = candidates.sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));
  return {
    layer_name: 'rights_and_duties_matrix',
    layer_version: LAYER_VERSION,
    rule_version: RULE_VERSION,
    parser_version: 'N/A',
    canonicalization_version: CANONICALIZATION_VERSION,
    input_hash,
    output_hash: computeHash(data),
    data,
    unresolved_dependencies: unresolved.sort((a, b) => a.field.localeCompare(b.field)),
    is_sealed: false,
  };
}

function relationshipMatchesSubject(
  relationship: Relationship,
  entity_id: string,
  relationship_type: RelationshipType,
  required_subject_role: string,
): boolean {
  if (relationship.type !== relationship_type) return false;
  if (relationship.entity_a_id === entity_id) return relationship.role_a === required_subject_role;
  if (relationship.entity_b_id === entity_id) return relationship.role_b === required_subject_role;
  return false;
}

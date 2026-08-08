import {
  computeHash,
  computeRuleManifestHash,
  EngineResult,
  UnresolvedDependency,
  CANONICALIZATION_VERSION,
} from './utils';
import { Relationship, RelationshipType } from './layer-7-relationship_graph';

export interface PowerDynamic {
  relationship_id: string;
  relationship_type: RelationshipType;
  authority_entity_id: string | null;
  subject_entity_id: string | null;
  power_direction: string;
  asymmetry_level: 'high' | 'medium' | 'low' | 'unresolved';
}

export const LAYER_VERSION = '2.1.0';
export const RULE_VERSION = '2.1.0';

type PowerRule = {
  authority_role: string | null;
  subject_role: string | null;
  direction_mode: 'authority_over_subject' | 'service_fiduciary' | 'bidirectional' | 'context_dependent';
  level: 'high' | 'medium' | 'low' | 'unresolved';
};

export const RULE_MANIFEST: { rules: Record<RelationshipType, PowerRule> } = {
  rules: {
    employer_employee: { authority_role: 'employer', subject_role: 'employee', direction_mode: 'authority_over_subject', level: 'high' },
    landlord_tenant: { authority_role: 'landlord', subject_role: 'tenant', direction_mode: 'authority_over_subject', level: 'high' },
    agency_complainant: { authority_role: 'agency', subject_role: 'complainant', direction_mode: 'authority_over_subject', level: 'high' },
    insurer_insured: { authority_role: 'insurer', subject_role: 'insured', direction_mode: 'authority_over_subject', level: 'medium' },
    creditor_debtor: { authority_role: 'creditor', subject_role: 'debtor', direction_mode: 'authority_over_subject', level: 'medium' },
    legal_representative_client: { authority_role: 'representative', subject_role: 'client', direction_mode: 'service_fiduciary', level: 'low' },
    family: { authority_role: null, subject_role: null, direction_mode: 'bidirectional', level: 'unresolved' },
    opposing_party: { authority_role: null, subject_role: null, direction_mode: 'context_dependent', level: 'unresolved' },
  },
};
export const RULE_MANIFEST_HASH = computeRuleManifestHash(RULE_MANIFEST);

export function processLayer8(input: { relationships: Relationship[] }): EngineResult<PowerDynamic[]> {
  const relationships = [...input.relationships].sort((a, b) => a.relationship_id.localeCompare(b.relationship_id));
  const input_hash = computeHash({
    relationships: relationships.map(relationship => ({
      relationship_id: relationship.relationship_id,
      type: relationship.type,
      entity_a_id: relationship.entity_a_id,
      role_a: relationship.role_a,
      entity_b_id: relationship.entity_b_id,
      role_b: relationship.role_b,
    })),
  });
  const unresolved: UnresolvedDependency[] = [];

  const data: PowerDynamic[] = relationships.map(relationship => {
    const rule = RULE_MANIFEST.rules[relationship.type];
    if (rule.direction_mode === 'bidirectional') {
      return {
        relationship_id: relationship.relationship_id,
        relationship_type: relationship.type,
        authority_entity_id: null,
        subject_entity_id: null,
        power_direction: 'bidirectional',
        asymmetry_level: rule.level,
      };
    }
    if (rule.direction_mode === 'context_dependent') {
      return {
        relationship_id: relationship.relationship_id,
        relationship_type: relationship.type,
        authority_entity_id: null,
        subject_entity_id: null,
        power_direction: 'context_dependent',
        asymmetry_level: rule.level,
      };
    }

    const roleToEntity = new Map<string, string>([
      [relationship.role_a, relationship.entity_a_id],
      [relationship.role_b, relationship.entity_b_id],
    ]);
    const authority = rule.authority_role ? roleToEntity.get(rule.authority_role) || null : null;
    const subject = rule.subject_role ? roleToEntity.get(rule.subject_role) || null : null;
    if (!authority || !subject) {
      unresolved.push({
        field: `power_dynamic:${relationship.relationship_id}`,
        reason: 'unresolved',
        detail: `Relationship roles ${relationship.role_a}/${relationship.role_b} do not satisfy declared ${rule.authority_role}/${rule.subject_role} power rule.`,
      });
      return {
        relationship_id: relationship.relationship_id,
        relationship_type: relationship.type,
        authority_entity_id: authority,
        subject_entity_id: subject,
        power_direction: 'unresolved_role_binding',
        asymmetry_level: 'unresolved' as const,
      };
    }

    return {
      relationship_id: relationship.relationship_id,
      relationship_type: relationship.type,
      authority_entity_id: authority,
      subject_entity_id: subject,
      power_direction: rule.direction_mode === 'service_fiduciary'
        ? `${authority} serves ${subject}`
        : `${authority} > ${subject}`,
      asymmetry_level: rule.level,
    };
  });

  return {
    layer_name: 'power_dynamics_registry',
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

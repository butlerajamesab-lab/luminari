import { computeHash, EngineResult, UnresolvedDependency, CANONICALIZATION_VERSION } from './utils';
import { Entity } from './layer-6-entity_registry';
import { Relationship, RelationshipType } from './layer-7-relationship_graph';
import { StateTransition } from './layer-9-state_timeline';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A CANDIDATE claim type — not "rights that apply."
 * Full applicability requires jurisdiction + effective dates + actor type +
 * required facts + exclusions + authoritative source.
 * 
 * This layer produces candidates. Downstream systems (Prism, Esquire)
 * determine actual applicability.
 */
export interface ClaimCandidate {
  candidate_id: string;
  claim_type_id: string;
  claim_type_name: string;
  triggering_facts: TriggeringFact[];
  matching_rule: string;
  required_elements: RequiredElement[];
  missing_elements: string[];
  satisfied_elements: string[];
  jurisdiction: string;
  statute_of_limitations_days: number | null;
  effective_date: string | null; // When this statute became effective
  authoritative_source: string; // Citation or registry reference
  applicability_status: 'candidate' | 'jurisdiction_mismatch' | 'expired' | 'elements_incomplete';
}

export interface TriggeringFact {
  fact_description: string;
  source_transition_id?: string;
  source_relationship_id?: string;
  source_entity_id?: string;
}

export interface RequiredElement {
  element_name: string;
  element_description: string;
  satisfied: boolean;
  evidence_source?: string;
}

export interface Layer12Input {
  entities: Entity[];
  relationships: Relationship[];
  transitions: StateTransition[];
  jurisdiction: string;
  filing_date?: string; // ISO date for SOL computation
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const LAYER_VERSION = '2.0.0';
export const RULE_VERSION = '2.0.0';

/**
 * Claim Type Registry
 * 
 * This is the declared, versioned registry of claim types.
 * Each entry defines:
 * - What relationship/transition patterns trigger candidacy
 * - What elements must be proven
 * - What jurisdiction applies
 * - SOL in days
 * - Authoritative source citation
 * 
 * In production, this would be populated from the procedural_engine tables
 * (the 11 core tables shown in Command Board). For now, this is the
 * declared starter set matching the 18 Personal Crisis categories.
 */
interface ClaimTypeDefinition {
  id: string;
  name: string;
  triggering_relationship?: RelationshipType;
  triggering_transition?: string;
  required_elements: Array<{ name: string; description: string }>;
  sol_days: number;
  jurisdictions: string[]; // 'federal' or state codes
  authoritative_source: string;
}

const CLAIM_TYPE_REGISTRY: ClaimTypeDefinition[] = [
  {
    id: 'wrongful_termination',
    name: 'Wrongful Termination',
    triggering_relationship: 'employer_employee',
    triggering_transition: 'terminated',
    required_elements: [
      { name: 'employment_relationship', description: 'Documented employer-employee relationship' },
      { name: 'termination_event', description: 'Documented termination or constructive discharge' },
      { name: 'illegal_motive_or_violation', description: 'Termination violated statute, contract, or public policy' },
      { name: 'damages', description: 'Documented economic or non-economic harm' },
    ],
    sol_days: 1095,
    jurisdictions: ['federal', 'wa', 'ca', 'or', 'ny'],
    authoritative_source: 'State employment statutes; 42 USC § 2000e (Title VII)',
  },
  {
    id: 'unlawful_eviction',
    name: 'Unlawful Eviction',
    triggering_relationship: 'landlord_tenant',
    triggering_transition: 'evicted',
    required_elements: [
      { name: 'tenancy', description: 'Documented landlord-tenant relationship' },
      { name: 'removal_or_constructive_eviction', description: 'Documented removal, lockout, or uninhabitable conditions' },
      { name: 'lack_of_legal_process', description: 'No valid court order or improper notice' },
    ],
    sol_days: 365,
    jurisdictions: ['federal', 'wa', 'ca', 'or', 'ny'],
    authoritative_source: 'RCW 59.18 (WA); state landlord-tenant acts',
  },
  {
    id: 'housing_discrimination',
    name: 'Housing Discrimination',
    triggering_relationship: 'landlord_tenant',
    triggering_transition: 'denied',
    required_elements: [
      { name: 'housing_transaction', description: 'Attempted rental, purchase, or financing' },
      { name: 'adverse_action', description: 'Denial, different terms, or harassment' },
      { name: 'protected_class_membership', description: 'User-declared protected class status' },
      { name: 'nexus', description: 'Connection between protected status and adverse action' },
    ],
    sol_days: 365,
    jurisdictions: ['federal', 'wa', 'ca', 'or', 'ny'],
    authoritative_source: '42 USC § 3604 (Fair Housing Act)',
  },
  {
    id: 'workplace_discrimination',
    name: 'Workplace Discrimination',
    triggering_relationship: 'employer_employee',
    triggering_transition: 'terminated',
    required_elements: [
      { name: 'employment_relationship', description: 'Documented employer-employee relationship' },
      { name: 'adverse_employment_action', description: 'Termination, demotion, or hostile environment' },
      { name: 'protected_class_membership', description: 'User-declared protected class status' },
      { name: 'nexus', description: 'Connection between protected status and adverse action' },
    ],
    sol_days: 300,
    jurisdictions: ['federal', 'wa', 'ca', 'or', 'ny'],
    authoritative_source: '42 USC § 2000e (Title VII); state civil rights acts',
  },
  {
    id: 'insurance_claim_denial',
    name: 'Insurance Claim Denial',
    triggering_relationship: 'insurer_insured',
    triggering_transition: 'claim_denied',
    required_elements: [
      { name: 'valid_policy', description: 'Active insurance policy at time of loss' },
      { name: 'covered_loss', description: 'Loss falls within policy coverage terms' },
      { name: 'proper_claim_submission', description: 'Claim submitted per policy requirements' },
      { name: 'wrongful_denial', description: 'Denial without valid coverage exclusion' },
    ],
    sol_days: 1095,
    jurisdictions: ['federal', 'wa', 'ca', 'or', 'ny'],
    authoritative_source: 'State insurance codes; ERISA (29 USC § 1132)',
  },
  {
    id: 'wage_theft',
    name: 'Wage Theft',
    triggering_relationship: 'employer_employee',
    triggering_transition: undefined,
    required_elements: [
      { name: 'employment_relationship', description: 'Documented employer-employee relationship' },
      { name: 'wages_owed', description: 'Documented unpaid wages, overtime, or deductions' },
      { name: 'employer_obligation', description: 'Legal obligation to pay (statute, contract, or policy)' },
    ],
    sol_days: 1095,
    jurisdictions: ['federal', 'wa', 'ca', 'or', 'ny'],
    authoritative_source: '29 USC § 201 (FLSA); state wage acts',
  },
  {
    id: 'benefits_wrongful_denial',
    name: 'Benefits Wrongful Denial',
    triggering_relationship: 'agency_complainant',
    triggering_transition: 'denied',
    required_elements: [
      { name: 'eligibility', description: 'Meets statutory eligibility criteria' },
      { name: 'proper_application', description: 'Application submitted per program requirements' },
      { name: 'denial_without_basis', description: 'Denial contradicts eligibility criteria or lacks stated reason' },
    ],
    sol_days: 90,
    jurisdictions: ['federal', 'wa', 'ca', 'or', 'ny'],
    authoritative_source: 'Program-specific statutes; 42 USC § 1983 (due process)',
  },
  {
    id: 'retaliation',
    name: 'Retaliation',
    triggering_relationship: 'employer_employee',
    triggering_transition: 'terminated',
    required_elements: [
      { name: 'protected_activity', description: 'Documented complaint, charge, or testimony' },
      { name: 'adverse_action', description: 'Termination, demotion, or other adverse action' },
      { name: 'temporal_proximity', description: 'Adverse action within reasonable time of protected activity' },
      { name: 'causal_connection', description: 'Evidence connecting protected activity to adverse action' },
    ],
    sol_days: 300,
    jurisdictions: ['federal', 'wa', 'ca', 'or', 'ny'],
    authoritative_source: '42 USC § 2000e-3 (Title VII anti-retaliation); state whistleblower acts',
  },
];

// ─── Engine ──────────────────────────────────────────────────────────────────

/**
 * Layer 12: Rights and Duties Matrix
 * 
 * Produces CANDIDATE claim types based on deterministic predicates:
 * - Relationship type matches
 * - Transition type matches
 * - Jurisdiction applicability
 * - Element satisfaction from available evidence
 * 
 * Does NOT produce "rights that apply" — only candidates for further analysis.
 * Full applicability determination belongs to downstream systems (Prism, Esquire).
 */
export function processLayer12(input: Layer12Input): EngineResult<ClaimCandidate[]> {
  const input_hash = computeHash({
    entities: input.entities.map(e => e.entity_id),
    relationships: input.relationships.map(r => r.relationship_id),
    transitions: input.transitions.map(t => t.transition_id),
    jurisdiction: input.jurisdiction,
    filing_date: input.filing_date || null,
  });
  const unresolved: UnresolvedDependency[] = [];

  const candidates: ClaimCandidate[] = [];
  const normalizedJurisdiction = input.jurisdiction.toLowerCase().trim();

  for (const claimDef of CLAIM_TYPE_REGISTRY) {
        // Check jurisdiction applicability
    // Federal claims are available everywhere, but state-specific claims require matching jurisdiction
    const jurisdictionMatch = claimDef.jurisdictions.includes(normalizedJurisdiction);
    if (!jurisdictionMatch) continue;

        // Check if triggering relationship exists (required if declared)
    let hasRelationship = true;
    if (claimDef.triggering_relationship) {
      hasRelationship = input.relationships.some(r => r.type === claimDef.triggering_relationship);
      if (!hasRelationship) continue; // Required relationship missing — skip
    }
    // Check if triggering transition exists (required if declared)
    let hasTransition = true;
    let triggeringTransition: StateTransition | undefined;
    if (claimDef.triggering_transition) {
      triggeringTransition = input.transitions.find(t => t.to_state === claimDef.triggering_transition);
      hasTransition = !!triggeringTransition;
      if (!hasTransition) continue; // Required transition missing — skip
    }

    // Evaluate elements
    const satisfiedElements: string[] = [];
    const missingElements: string[] = [];
    const requiredElements: RequiredElement[] = [];

    for (const elem of claimDef.required_elements) {
      const satisfied = evaluateElement(elem.name, input);
      requiredElements.push({
        element_name: elem.name,
        element_description: elem.description,
        satisfied,
        evidence_source: satisfied ? 'structured_evidence' : undefined,
      });
      if (satisfied) {
        satisfiedElements.push(elem.name);
      } else {
        missingElements.push(elem.name);
      }
    }

    // Build triggering facts
    const triggeringFacts: TriggeringFact[] = [];
    if (hasRelationship && claimDef.triggering_relationship) {
      const rel = input.relationships.find(r => r.type === claimDef.triggering_relationship);
      if (rel) {
        triggeringFacts.push({
          fact_description: `${claimDef.triggering_relationship} relationship detected`,
          source_relationship_id: rel.relationship_id,
        });
      }
    }
    if (triggeringTransition) {
      triggeringFacts.push({
        fact_description: `${triggeringTransition.to_state} transition detected`,
        source_transition_id: triggeringTransition.transition_id,
      });
    }

    // Determine applicability status
    let status: ClaimCandidate['applicability_status'] = 'candidate';
    if (!jurisdictionMatch) {
      status = 'jurisdiction_mismatch';
    } else if (input.filing_date && triggeringTransition?.transition_date && claimDef.sol_days) {
      const eventDate = new Date(triggeringTransition.transition_date);
      const filingDate = new Date(input.filing_date);
      const daysSince = Math.round((filingDate.getTime() - eventDate.getTime()) / (24 * 3600 * 1000));
      if (daysSince > claimDef.sol_days) {
        status = 'expired';
      }
    }

    candidates.push({
      candidate_id: `cand_${computeHash(`${claimDef.id}|${input.jurisdiction}`)}`.substring(0, 16),
      claim_type_id: claimDef.id,
      claim_type_name: claimDef.name,
      triggering_facts: triggeringFacts,
      matching_rule: `claim_registry:${claimDef.id}`,
      required_elements: requiredElements,
      missing_elements: missingElements,
      satisfied_elements: satisfiedElements,
      jurisdiction: input.jurisdiction,
      statute_of_limitations_days: claimDef.sol_days,
      effective_date: null, // Would come from Rosetta in production
      authoritative_source: claimDef.authoritative_source,
      applicability_status: status,
    });
  }

  const sorted = candidates.sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));
  const output_hash = computeHash(sorted);

  return {
    layer_name: 'rights_and_duties_matrix',
    layer_version: LAYER_VERSION,
    rule_version: RULE_VERSION,
    parser_version: 'N/A',
    canonicalization_version: CANONICALIZATION_VERSION,
    input_hash,
    output_hash,
    data: sorted,
    unresolved_dependencies: unresolved,
    is_sealed: false,
  };
}

// ─── Element Evaluation ──────────────────────────────────────────────────────

function evaluateElement(elementName: string, input: Layer12Input): boolean {
  switch (elementName) {
    case 'employment_relationship':
      return input.relationships.some(r => r.type === 'employer_employee');
    case 'tenancy':
      return input.relationships.some(r => r.type === 'landlord_tenant');
    case 'termination_event':
      return input.transitions.some(t => t.to_state === 'terminated');
    case 'removal_or_constructive_eviction':
      return input.transitions.some(t => t.to_state === 'evicted' || t.to_state === 'eviction_notice_served');
    case 'adverse_employment_action':
      return input.transitions.some(t => ['terminated', 'demoted', 'suspended'].includes(t.to_state));
    case 'protected_activity':
      return input.transitions.some(t => ['complaint_filed', 'charge_filed', 'lawsuit_filed'].includes(t.to_state));
    case 'adverse_action':
      return input.transitions.some(t => ['terminated', 'demoted', 'evicted', 'eviction_notice_served', 'denied', 'benefits_terminated'].includes(t.to_state));
    case 'valid_policy':
      return input.relationships.some(r => r.type === 'insurer_insured');
    case 'proper_claim_submission':
      return input.transitions.some(t => t.to_state === 'claim_filed');
    case 'wrongful_denial':
      return input.transitions.some(t => t.to_state === 'claim_denied');
    case 'proper_application':
      return input.transitions.some(t => t.to_state === 'applied');
    case 'denial_without_basis':
      return input.transitions.some(t => t.to_state === 'denied');
    // These require user-declared information — cannot be satisfied from document extraction alone
    case 'protected_class_membership':
    case 'nexus':
    case 'illegal_motive_or_violation':
    case 'causal_connection':
    case 'damages':
    case 'wages_owed':
    case 'employer_obligation':
    case 'lack_of_legal_process':
    case 'covered_loss':
    case 'eligibility':
    case 'housing_transaction':
    case 'temporal_proximity':
      return false; // Cannot be determined from extraction alone — requires user input or further evidence
    default:
      return false;
  }
}

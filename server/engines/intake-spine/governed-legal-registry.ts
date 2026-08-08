import { computeHash } from './utils';

export const GOVERNED_LEGAL_REGISTRY_CONTRACT_VERSION = 'luminari.intake.governed-legal-registry.v1';

export interface GovernedClaimRecord {
  registry_id: number;
  claim_type_id: string;
  domain: string;
  canonical_name: string;
  description: string | null;
  governing_standards: string[];
  required_evidence_types: string[];
  allowed_evidence_types: string[];
  jurisdiction_layer: string | null;
}

export interface GovernedClaimElementRecord {
  registry_id: number;
  claim_type_id: string;
  element_name: string;
  element_description: string | null;
  element_order: number | null;
  required_evidence_types: string[];
  is_required: boolean;
}

export interface GovernedDeadlineRecord {
  registry_id: string;
  jurisdiction: string;
  claim_domain: string;
  deadline_days: number | null;
  deadline_description: string | null;
  filing_body: string | null;
  source_citation: string | null;
  source_url: string | null;
  verification_status: 'verified';
}

export interface GovernedWorkflowStep {
  registry_id: number;
  step_number: number;
  action: string;
  owner: string | null;
  due_rule: string | null;
  required_document: string | null;
  output: string | null;
  escalation_if_failed: string | null;
}

export interface GovernedWorkflowRecord {
  registry_id: number;
  workflow_key: string;
  workflow_name: string;
  issue_types: string[];
  primary_agency: string | null;
  initial_deadline_rule: string | null;
  entry_forms: string[];
  exhaustion_required: boolean | null;
  appeal_chain: string[];
  remedies: string[];
  steps: GovernedWorkflowStep[];
}

export interface GovernedLegalRegistryManifest {
  contract_version: typeof GOVERNED_LEGAL_REGISTRY_CONTRACT_VERSION;
  source_tables: Array<{
    table_name: 'claim_catalog' | 'claim_validation_rules' | 'legal_workflow_deadlines' | 'workflow_master' | 'workflow_steps';
    posture: 'structural_claim_registry' | 'required_element_registry' | 'verified_deadline_registry' | 'procedural_workflow_registry';
  }>;
  claims: GovernedClaimRecord[];
  elements: GovernedClaimElementRecord[];
  deadlines: GovernedDeadlineRecord[];
  workflows: GovernedWorkflowRecord[];
}

/**
 * Normalize all set-like collections before hashing. Workflow steps remain
 * step-number ordered because their sequence is semantically meaningful.
 */
export function normalizeGovernedLegalRegistry(
  manifest: GovernedLegalRegistryManifest,
): GovernedLegalRegistryManifest {
  return {
    contract_version: GOVERNED_LEGAL_REGISTRY_CONTRACT_VERSION,
    source_tables: [...manifest.source_tables].sort((a, b) => a.table_name.localeCompare(b.table_name)),
    claims: manifest.claims
      .map(claim => ({
        ...claim,
        governing_standards: [...claim.governing_standards].sort(),
        required_evidence_types: [...claim.required_evidence_types].sort(),
        allowed_evidence_types: [...claim.allowed_evidence_types].sort(),
      }))
      .sort((a, b) => a.claim_type_id.localeCompare(b.claim_type_id) || a.registry_id - b.registry_id),
    elements: manifest.elements
      .map(element => ({ ...element, required_evidence_types: [...element.required_evidence_types].sort() }))
      .sort((a, b) =>
        a.claim_type_id.localeCompare(b.claim_type_id) ||
        (a.element_order ?? Number.MAX_SAFE_INTEGER) - (b.element_order ?? Number.MAX_SAFE_INTEGER) ||
        a.element_name.localeCompare(b.element_name) ||
        a.registry_id - b.registry_id,
      ),
    deadlines: [...manifest.deadlines].sort((a, b) =>
      a.claim_domain.localeCompare(b.claim_domain) ||
      a.jurisdiction.localeCompare(b.jurisdiction) ||
      a.registry_id.localeCompare(b.registry_id),
    ),
    workflows: manifest.workflows
      .map(workflow => ({
        ...workflow,
        issue_types: [...workflow.issue_types].sort(),
        entry_forms: [...workflow.entry_forms].sort(),
        appeal_chain: [...workflow.appeal_chain].sort(),
        remedies: [...workflow.remedies].sort(),
        steps: [...workflow.steps].sort((a, b) => a.step_number - b.step_number || a.registry_id - b.registry_id),
      }))
      .sort((a, b) => a.workflow_key.localeCompare(b.workflow_key) || a.registry_id - b.registry_id),
  };
}

export function computeGovernedLegalRegistryHash(
  manifest: GovernedLegalRegistryManifest,
): string {
  return computeHash(normalizeGovernedLegalRegistry(manifest));
}

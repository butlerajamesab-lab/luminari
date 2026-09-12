import { computeHash } from './utils';

export const GOVERNED_LEGAL_REGISTRY_CONTRACT_VERSION = 'luminari.intake.governed-legal-registry.v2';

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
  registry_id: number | string;
  step_number: number;
  action: string;
  owner: string | null;
  due_rule: string | null;
  required_document: string | null;
  output: string | null;
  escalation_if_failed: string | null;
}

export interface GovernedWorkflowRecord {
  registry_id: number | string;
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
  jurisdiction?: string | null;
  source_binding?: WorkflowSourceBinding;
}

export interface WorkflowSourceBinding {
  source_table: 'workflow_registry';
  source_id: string;
  promotion_group_id: string;
  reassembly_run_id: string;
  source_logical_record_ids: string[];
  source_stage_row_ids: number[];
  source_files: string[];
  record_fingerprint: string;
  content_hash: string;
  verification_status: string | null;
  deadline_state: 'source_text_only';
}

export interface WorkflowRegistryHold {
  source_table: 'workflow_registry';
  source_id: string;
  reason: string;
}

export interface GovernedLegalRegistryManifest {
  contract_version: typeof GOVERNED_LEGAL_REGISTRY_CONTRACT_VERSION | 'luminari.intake.governed-legal-registry.v1';
  source_tables: Array<{
    table_name: 'claim_catalog' | 'claim_validation_rules' | 'legal_workflow_deadlines' | 'workflow_master' | 'workflow_steps' | 'workflow_registry' | 'state_directory_workflow_promotion' | 'state_directory_logical_record';
    posture: 'structural_claim_registry' | 'required_element_registry' | 'verified_deadline_registry' | 'procedural_workflow_registry';
  }>;
  claims: GovernedClaimRecord[];
  elements: GovernedClaimElementRecord[];
  deadlines: GovernedDeadlineRecord[];
  workflows: GovernedWorkflowRecord[];
  workflow_holds?: WorkflowRegistryHold[];
}

/**
 * Normalize all set-like collections before hashing. Workflow steps remain
 * step-number ordered because their sequence is semantically meaningful.
 */
export function normalizeGovernedLegalRegistry(
  manifest: GovernedLegalRegistryManifest,
): GovernedLegalRegistryManifest {
  return {
    contract_version: manifest.contract_version,
    ...(manifest.workflow_holds ? { workflow_holds: [...manifest.workflow_holds].sort((a, b) => a.source_id.localeCompare(b.source_id) || a.reason.localeCompare(b.reason)) } : {}),
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
        steps: [...workflow.steps].sort((a, b) => a.step_number - b.step_number || compareWorkflowIds(a.registry_id, b.registry_id)),
      }))
      .sort((a, b) => a.workflow_key.localeCompare(b.workflow_key) || compareWorkflowIds(a.registry_id, b.registry_id)),
  };
}

function compareWorkflowIds(a: string | number, b: string | number): number {
  return typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));
}

export function computeGovernedLegalRegistryHash(
  manifest: GovernedLegalRegistryManifest,
): string {
  return computeHash(normalizeGovernedLegalRegistry(manifest));
}

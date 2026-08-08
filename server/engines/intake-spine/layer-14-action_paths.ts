import {
  computeHash,
  computeRuleManifestHash,
  EngineResult,
  UnresolvedDependency,
  CANONICALIZATION_VERSION,
} from './utils';
import { ClaimCandidate } from './layer-12-rights_and_duties_matrix';
import {
  GovernedLegalRegistryManifest,
  GovernedWorkflowRecord,
  computeGovernedLegalRegistryHash,
} from './governed-legal-registry';

export interface ActionPath {
  path_id: string;
  subject_entity_id: string;
  claim_candidate_id: string;
  claim_type_id: string;
  claim_type_name: string;
  workflow_registry_id: number;
  workflow_key: string;
  workflow_name: string;
  authority: string | null;
  filing_destination: string | null;
  deadline_candidates: ClaimCandidate['deadline_candidates'];
  workflow_deadline_rule: string | null;
  prerequisites: string[];
  required_evidence_types: string[];
  expected_burden: string | null;
  entry_forms: string[];
  next_steps: Array<{
    step_number: number;
    action: string;
    owner: string | null;
    due_rule: string | null;
    required_document: string | null;
    output: string | null;
    failure_route: string | null;
  }>;
  confirmation_state: 'not_started';
  failure_routes: string[];
  appeal_chain: string[];
  remedies: string[];
  unresolved_facts: string[];
  foothold_complete: boolean;
  status: 'candidate_unverified';
  governed_registry_hash: string;
}

export interface Layer14Input {
  candidates: ClaimCandidate[];
  governed_registry: GovernedLegalRegistryManifest;
  governed_registry_hash: string;
}

export const LAYER_VERSION = '3.0.0';
export const RULE_VERSION = '3.0.0';

/** Structural aliases only; these do not define legal applicability. */
export const RULE_MANIFEST: {
  workflow_issue_aliases: Record<string, string[]>;
  no_workflow_policy: 'unresolved_no_path';
  no_expected_burden_policy: 'incomplete_foothold';
  ranking_policy: 'none_present_all_deterministically';
} = {
  workflow_issue_aliases: {
    wrongful_termination: ['wrongful_termination'],
    eviction_unlawful: ['eviction'],
    benefits_denial: ['benefits_denial'],
    retaliation_employment: ['retaliation'],
    discrimination_employment: ['workplace_discrimination'],
    discrimination_housing: ['housing_discrimination'],
    wage_theft: ['wage_theft'],
    overtime_violation: ['wage_theft'],
  },
  no_workflow_policy: 'unresolved_no_path',
  no_expected_burden_policy: 'incomplete_foothold',
  ranking_policy: 'none_present_all_deterministically',
};

export const RULE_MANIFEST_HASH = computeRuleManifestHash(RULE_MANIFEST);

export function computeLayer14ExecutionRuleManifestHash(governed_registry_hash: string): string {
  if (!/^[0-9a-f]{64}$/.test(governed_registry_hash)) {
    throw new Error('layer14_governed_registry_hash_invalid');
  }
  return computeRuleManifestHash({
    engine_rule_manifest: RULE_MANIFEST,
    governed_legal_registry_hash: governed_registry_hash,
  });
}

export function processLayer14(input: Layer14Input): EngineResult<ActionPath[]> {
  const computedRegistryHash = computeGovernedLegalRegistryHash(input.governed_registry);
  if (computedRegistryHash !== input.governed_registry_hash) {
    throw new Error('layer14_governed_registry_hash_mismatch');
  }

  const candidates = [...input.candidates].sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));
  const input_hash = computeHash({
    candidate_ids: candidates.map(candidate => candidate.candidate_id),
    governed_registry_hash: input.governed_registry_hash,
  });
  const unresolved: UnresolvedDependency[] = [];
  const paths: ActionPath[] = [];

  if (candidates.length === 0) {
    return {
      layer_name: 'action_paths',
      layer_version: LAYER_VERSION,
      rule_version: RULE_VERSION,
      parser_version: 'N/A',
      canonicalization_version: CANONICALIZATION_VERSION,
      input_hash,
      output_hash: computeHash([]),
      data: [],
      unresolved_dependencies: [{ field: 'candidates', reason: 'incomplete', detail: 'No claim candidates are available for procedural routing' }],
      is_sealed: false,
    };
  }

  for (const candidate of candidates) {
    const workflows = matchingWorkflows(candidate.claim_type_id, input.governed_registry.workflows);
    if (workflows.length === 0) {
      unresolved.push({
        field: `action_path:${candidate.candidate_id}:workflow`,
        reason: 'referenced_missing',
        detail: `No governed workflow is bound to claim candidate ${candidate.claim_type_id}; no action path was emitted.`,
      });
      continue;
    }

    for (const workflow of workflows) {
      const requiredEvidence = Array.from(new Set(
        candidate.required_elements.flatMap(element => element.required_evidence_types),
      )).sort();
      const prerequisites = candidate.required_elements
        .filter(element => element.is_required)
        .map(element => element.element_name)
        .sort();
      const failureRoutes = Array.from(new Set([
        ...workflow.appeal_chain,
        ...workflow.steps.map(step => step.escalation_if_failed).filter((value): value is string => Boolean(value)),
      ])).sort();
      const unresolvedFacts = [...candidate.unresolved_elements].sort();

      // The current governed workflow substrate does not contain a deterministic
      // burden field. Do not manufacture one from step counts, fees, or labels.
      const expectedBurden: string | null = null;
      const footholdComplete = Boolean(
        workflow.primary_agency &&
        workflow.steps.length > 0 &&
        expectedBurden !== null &&
        candidate.deadline_candidates.length > 0,
      );
      if (!footholdComplete) {
        unresolved.push({
          field: `action_path:${candidate.candidate_id}:${workflow.workflow_key}:foothold`,
          reason: 'incomplete',
          detail: 'Candidate workflow is preserved, but at least one mandatory foothold field is unresolved (authority, deadline binding, expected burden, or procedural steps). It must not be presented as a completed recommendation.',
        });
      }

      const path_id = `path_${computeHash({
        candidate_id: candidate.candidate_id,
        workflow_key: workflow.workflow_key,
        governed_registry_hash: input.governed_registry_hash,
      }).substring(0, 16)}`;

      paths.push({
        path_id,
        subject_entity_id: candidate.subject_entity_id,
        claim_candidate_id: candidate.candidate_id,
        claim_type_id: candidate.claim_type_id,
        claim_type_name: candidate.claim_type_name,
        workflow_registry_id: workflow.registry_id,
        workflow_key: workflow.workflow_key,
        workflow_name: workflow.workflow_name,
        authority: workflow.primary_agency,
        filing_destination: workflow.primary_agency,
        deadline_candidates: [...candidate.deadline_candidates],
        workflow_deadline_rule: workflow.initial_deadline_rule,
        prerequisites,
        required_evidence_types: requiredEvidence,
        expected_burden: expectedBurden,
        entry_forms: [...workflow.entry_forms].sort(),
        next_steps: workflow.steps.map(step => ({
          step_number: step.step_number,
          action: step.action,
          owner: step.owner,
          due_rule: step.due_rule,
          required_document: step.required_document,
          output: step.output,
          failure_route: step.escalation_if_failed,
        })),
        confirmation_state: 'not_started',
        failure_routes: failureRoutes,
        appeal_chain: [...workflow.appeal_chain].sort(),
        remedies: [...workflow.remedies].sort(),
        unresolved_facts: unresolvedFacts,
        foothold_complete: footholdComplete,
        status: 'candidate_unverified',
        governed_registry_hash: input.governed_registry_hash,
      });
    }
  }

  const data = paths.sort((a, b) => a.path_id.localeCompare(b.path_id));
  return {
    layer_name: 'action_paths',
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

function matchingWorkflows(
  claim_type_id: string,
  workflows: GovernedWorkflowRecord[],
): GovernedWorkflowRecord[] {
  const acceptedIssueTypes = new Set<string>([
    claim_type_id,
    ...(RULE_MANIFEST.workflow_issue_aliases[claim_type_id] || []),
  ]);
  return workflows
    .filter(workflow => workflow.issue_types.some(issueType => acceptedIssueTypes.has(issueType)))
    .sort((a, b) => a.workflow_key.localeCompare(b.workflow_key) || a.registry_id - b.registry_id);
}

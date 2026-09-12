import { load_governed_legal_registry, type governed_legal_registry_snapshot } from './intake-governed-legal-registry';
import { RULE_MANIFEST } from './engines/intake-spine/layer-14-action_paths';

export type workflow_coverage_status = 'claim_type_matched' | 'missing_claim_binding' | 'held';
export type workflow_coverage_input = {
  status?: 'all' | workflow_coverage_status;
  search?: string;
  limit?: number;
  offset?: number;
};

type workflow_coverage_row = {
  source_table: 'workflow_registry';
  source_id: string;
  workflow_key: string | null;
  workflow_name: string | null;
  issue_types: string[];
  jurisdiction: string | null;
  status: workflow_coverage_status;
  reason: string;
  matching_claim_type_ids: string[];
  ordered_step_count: number | null;
  source_files: string[] | null;
  source_logical_record_ids: string[] | null;
  source_stage_row_ids: number[] | null;
  verification_status: string | null;
  deadline_state: 'source_text_only' | null;
};

/** A read of Intake's actual manifest; no guessed mappings or second registry. */
export function project_workflow_coverage(
  snapshot: governed_legal_registry_snapshot,
  input: workflow_coverage_input = {},
) {
  const { manifest, rule_manifest_hash } = snapshot;
  const source_workflows = manifest.workflows.filter(workflow => workflow.source_binding);
  const records: workflow_coverage_row[] = source_workflows.map(workflow => {
    const binding = workflow.source_binding!;
    // Exactly the claim-ID / explicit issue-alias rule used by Layer 14.
    // This global coverage read does not evaluate a case or its jurisdiction.
    const matching_claim_type_ids = manifest.claims.filter(claim => {
      const issue_types = [claim.claim_type_id, ...(RULE_MANIFEST.workflow_issue_aliases[claim.claim_type_id] ?? [])];
      return workflow.issue_types.some(issue => issue_types.includes(issue));
    }).map(claim => claim.claim_type_id).sort();
    const matched = matching_claim_type_ids.length > 0;
    return {
      source_table: binding.source_table,
      source_id: binding.source_id,
      workflow_key: workflow.workflow_key,
      workflow_name: workflow.workflow_name,
      issue_types: workflow.issue_types,
      jurisdiction: workflow.jurisdiction ?? null,
      status: matched ? 'claim_type_matched' : 'missing_claim_binding',
      reason: matched ? 'existing_claim_type_or_explicit_issue_alias' : 'no_existing_claim_type_or_explicit_issue_alias',
      matching_claim_type_ids,
      ordered_step_count: workflow.steps.length,
      source_files: binding.source_files,
      source_logical_record_ids: binding.source_logical_record_ids,
      source_stage_row_ids: binding.source_stage_row_ids,
      verification_status: binding.verification_status,
      deadline_state: binding.deadline_state,
    };
  });
  for (const hold of manifest.workflow_holds ?? []) {
    records.push({
      ...hold,
      workflow_key: null,
      workflow_name: null,
      issue_types: [],
      jurisdiction: null,
      status: 'held',
      matching_claim_type_ids: [],
      ordered_step_count: null,
      source_files: null,
      source_logical_record_ids: null,
      source_stage_row_ids: null,
      verification_status: null,
      deadline_state: null,
    });
  }
  records.sort((a, b) => a.source_id.localeCompare(b.source_id));
  const holds_by_reason: Record<string, number> = {};
  for (const hold of manifest.workflow_holds ?? []) {
    holds_by_reason[hold.reason] = (holds_by_reason[hold.reason] ?? 0) + 1;
  }
  const search = (input.search ?? '').trim().toLowerCase();
  const filtered = records.filter(record =>
    (!input.status || input.status === 'all' || record.status === input.status)
    && (!search || [record.source_id, record.workflow_name, record.jurisdiction, record.reason,
      ...record.issue_types, ...record.matching_claim_type_ids, ...(record.source_files ?? []),
      ...(record.source_logical_record_ids ?? [])].some(value => value?.toLowerCase().includes(search))));
  const limit = Math.max(1, Math.min(100, Math.trunc(input.limit ?? 50)));
  const offset = Math.max(0, Math.trunc(input.offset ?? 0));
  return {
    contract_version: 'luminari.intake.workflow-coverage.v1' as const,
    registry_contract_version: manifest.contract_version,
    registry_hash: rule_manifest_hash,
    availability: records.length ? 'available' as const : 'empty' as const,
    case_applicability_evaluated: false as const,
    summary: {
      existing_master_workflows: manifest.workflows.length - source_workflows.length,
      source_registry_records: records.length,
      source_bound_workflows: source_workflows.length,
      claim_type_matched: records.filter(record => record.status === 'claim_type_matched').length,
      missing_claim_binding: records.filter(record => record.status === 'missing_claim_binding').length,
      held_registry_records: (manifest.workflow_holds ?? []).length,
      source_workflow_steps: source_workflows.reduce((count, workflow) => count + workflow.steps.length, 0),
      source_jurisdictions: new Set(source_workflows.map(workflow => workflow.jurisdiction).filter(Boolean)).size,
      holds_by_reason,
    },
    filtered_count: filtered.length,
    limit,
    offset,
    has_more: offset + limit < filtered.length,
    records: filtered.slice(offset, offset + limit),
  };
}

export async function read_workflow_coverage(
  input: workflow_coverage_input = {},
  pool?: Parameters<typeof load_governed_legal_registry>[0],
) {
  // Loader failures propagate. An unavailable database must never become zero coverage.
  return project_workflow_coverage(await load_governed_legal_registry(pool), input);
}

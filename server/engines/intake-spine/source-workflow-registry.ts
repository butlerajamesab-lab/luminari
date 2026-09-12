import { US_STATES, US_TERRITORIES, DISTRICT_OF_COLUMBIA } from '../../../shared/jurisdiction-substrate';
import { computeHash } from './utils';
import type { GovernedWorkflowRecord, GovernedWorkflowStep, WorkflowRegistryHold } from './governed-legal-registry';

/** Read the existing identities and their actual promotion/source bindings. No re-import. */
export const SOURCE_WORKFLOW_QUERY = `
  select w.uuid, w.workflow_type, w.jurisdiction, w.verification_status,
         w.escalation_pathways->'steps' as registry_steps,
         p.candidate_group_id, p.run_id, p.jurisdiction_code,
         p.workflow_type as promoted_workflow_type, p.preferred_steps,
         p.source_logical_record_ids, p.source_files, p.record_fingerprint,
         p.disposition, preferred.normalized_payload->'rows' as preferred_source_steps,
         (select array_agg(distinct stage_id order by stage_id)
            from public.state_directory_logical_record l
            cross join lateral unnest(l.source_stage_row_ids) stage_id
           where l.logical_record_id = any(p.source_logical_record_ids)
             and l.run_id = p.run_id) as source_stage_row_ids,
         (select count(*)::int from public.state_directory_logical_record l
           where l.logical_record_id = any(p.source_logical_record_ids)
             and l.run_id = p.run_id
             and l.canonical_target = 'workflow_registry'
             and l.canonical_record_id = w.uuid) as bound_source_count
  from public.workflow_registry w
  left join public.state_directory_workflow_promotion p on p.target_uuid = w.uuid
  left join public.state_directory_logical_record preferred
    on preferred.logical_record_id = p.preferred_logical_record_id
   and preferred.logical_record_id = any(p.source_logical_record_ids)
   and preferred.run_id = p.run_id
  order by w.uuid, p.candidate_group_id
`;

export interface SourceWorkflowRow {
  uuid: string;
  workflow_type: string | null;
  jurisdiction: string | null;
  verification_status: string | null;
  registry_steps: unknown;
  candidate_group_id: string | null;
  run_id: string | null;
  jurisdiction_code: string | null;
  promoted_workflow_type: string | null;
  preferred_steps: unknown;
  preferred_source_steps: unknown;
  source_logical_record_ids: string[] | null;
  source_stage_row_ids: number[] | null;
  source_files: string[] | null;
  record_fingerprint: string | null;
  disposition: string | null;
  bound_source_count: number;
}

export const WORKFLOW_JURISDICTIONS = [...US_STATES, ...US_TERRITORIES, DISTRICT_OF_COLUMBIA];
export function workflowJurisdictionCode(value: string | null | undefined): string | null {
  const normalized = (value ?? '').trim().toUpperCase();
  return WORKFLOW_JURISDICTIONS.find(item => item.code === normalized || item.name.toUpperCase() === normalized)?.code ?? null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stepsFromSource(value: unknown, id: string): GovernedWorkflowStep[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const seen = new Set<number>();
  const steps: GovernedWorkflowStep[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const rawNumber = String(item.step ?? '');
    const number = /^\d+$/.test(rawNumber) ? Number(rawNumber) : NaN;
    const action = text(item.action_required);
    if (!Number.isSafeInteger(number) || number < 1 || seen.has(number) || !action) return null;
    seen.add(number);
    steps.push({
      registry_id: `${id}:step:${number}`,
      step_number: number,
      action,
      owner: text(item.agency___contact),
      due_rule: text(item.deadline),
      required_document: text(item.documents_needed),
      output: null,
      escalation_if_failed: null,
    });
  }
  return steps.sort((a, b) => a.step_number - b.step_number);
}

/** Source text is a procedural candidate, never a verified deadline or legal conclusion. */
export function connectSourceWorkflows(rows: SourceWorkflowRow[]): {
  workflows: GovernedWorkflowRecord[];
  holds: WorkflowRegistryHold[];
} {
  const workflows: GovernedWorkflowRecord[] = [];
  const holds: WorkflowRegistryHold[] = [];
  const groups = new Map<string, SourceWorkflowRow[]>();
  for (const row of rows) groups.set(row.uuid, [...(groups.get(row.uuid) ?? []), row]);
  for (const [id, matches] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const row = matches[0];
    const hold = (reason: string) => holds.push({ source_table: 'workflow_registry', source_id: id, reason });
    if (matches.length !== 1) { hold('ambiguous_promotion_binding'); continue; }
    if (!row.candidate_group_id || !row.run_id || row.disposition !== 'inserted') {
      hold('missing_source_workflow_binding'); continue;
    }
    if (/(rejected|withdrawn|retired|superseded|invalid)/i.test(row.verification_status ?? '')) {
      hold('workflow_not_current'); continue;
    }
    const sourceIds = [...new Set(row.source_logical_record_ids ?? [])].sort();
    const stageIds = [...new Set((row.source_stage_row_ids ?? []).map(Number))].sort((a, b) => a - b);
    const sourceFiles = [...new Set(row.source_files ?? [])].sort();
    if (!sourceIds.length || sourceIds.length !== Number(row.bound_source_count) || !sourceFiles.length || !stageIds.length || stageIds.some(id => !Number.isSafeInteger(id)) || !row.record_fingerprint) {
      hold('incomplete_source_lineage'); continue;
    }
    const jurisdiction = workflowJurisdictionCode(row.jurisdiction);
    if (!jurisdiction || jurisdiction !== workflowJurisdictionCode(row.jurisdiction_code)) {
      hold('jurisdiction_binding_mismatch'); continue;
    }
    if (!text(row.workflow_type) || row.workflow_type !== row.promoted_workflow_type) {
      hold('workflow_type_binding_mismatch'); continue;
    }
    const steps = stepsFromSource(row.preferred_steps, id);
    const registrySteps = stepsFromSource(row.registry_steps, id);
    const sourceSteps = stepsFromSource(row.preferred_source_steps, id);
    if (!steps || !registrySteps || !sourceSteps) { hold('invalid_or_missing_ordered_steps'); continue; }
    if (computeHash(steps) !== computeHash(registrySteps) || computeHash(steps) !== computeHash(sourceSteps)) { hold('source_steps_conflict'); continue; }
    workflows.push({
      registry_id: id,
      workflow_key: `workflow_registry:${id}`,
      workflow_name: `${jurisdiction} ${row.workflow_type!.replace(/_/g, ' ')}`,
      issue_types: [row.workflow_type!],
      jurisdiction,
      // The promotion's entry_agency may be "Personal records". Do not make
      // the first step's owner into a filing authority or destination.
      primary_agency: null,
      initial_deadline_rule: null,
      entry_forms: [],
      exhaustion_required: null,
      appeal_chain: [],
      remedies: [],
      steps,
      source_binding: {
        source_table: 'workflow_registry', source_id: id,
        promotion_group_id: row.candidate_group_id, reassembly_run_id: row.run_id,
        source_logical_record_ids: sourceIds, source_files: sourceFiles,
        source_stage_row_ids: stageIds,
        record_fingerprint: row.record_fingerprint,
        content_hash: computeHash({ id, jurisdiction, workflow_type: row.workflow_type, steps, sourceIds, stageIds, sourceFiles, verification_status: row.verification_status }),
        verification_status: row.verification_status,
        deadline_state: 'source_text_only',
      },
    });
  }
  return { workflows, holds };
}

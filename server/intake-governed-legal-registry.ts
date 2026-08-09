import { getPool } from './db';
import {
  GOVERNED_LEGAL_REGISTRY_CONTRACT_VERSION,
  GovernedClaimElementRecord,
  GovernedClaimRecord,
  GovernedDeadlineRecord,
  GovernedLegalRegistryManifest,
  GovernedWorkflowRecord,
  GovernedWorkflowStep,
  computeGovernedLegalRegistryHash,
  normalizeGovernedLegalRegistry,
} from './engines/intake-spine/governed-legal-registry';

export type governed_legal_registry_snapshot = {
  manifest: GovernedLegalRegistryManifest;
  rule_manifest_hash: string;
};

function parse_string_array(
  value: unknown,
  field: string,
  record_id: string | number,
): string[] {
  if (value === null || value === undefined || value === '') return [];
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error(`governed_legal_registry_invalid_json:${field}:${record_id}`);
    }
  }
  if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string')) {
    throw new Error(`governed_legal_registry_invalid_string_array:${field}:${record_id}`);
  }
  return Array.from(new Set(parsed.map(item => item.trim()).filter(Boolean))).sort();
}

function parse_deadline_days(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function require_text(value: unknown, field: string, record_id: string | number): string {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`governed_legal_registry_missing_${field}:${record_id}`);
  return text;
}

/**
 * Load only deterministic structural/procedural fields needed by Intake.
 *
 * Deliberately NOT selected: claim_detection_rules.weight,
 * claim_element_matrix.confidence_threshold, workflow_master.success_rate,
 * canonical_claim_catalog win-probability metadata, or any other probabilistic
 * or legacy scoring field. The resulting frozen manifest is the R input to the
 * pure Intake layers and is hashed before execution.
 */
export async function load_governed_legal_registry(): Promise<governed_legal_registry_snapshot> {
  const pool = getPool();
  const [claims_result, elements_result, deadlines_result, workflows_result, steps_result] = await Promise.all([
    pool.query(`
      select id, claim_type_id, domain, canonical_name, description,
             governing_standards, required_evidence, allowed_evidence,
             jurisdiction_layer
      from public.claim_catalog
      where coalesce(deprecated, 0) = 0
        and claim_type_id is not null
        and btrim(claim_type_id) <> ''
      order by claim_type_id, id
    `),
    pool.query(`
      select id, claim_type, legal_element, element_description,
             element_order, required_evidence, is_required
      from public.claim_validation_rules
      where claim_type is not null
        and btrim(claim_type) <> ''
        and legal_element is not null
        and btrim(legal_element) <> ''
      order by claim_type, element_order nulls last, legal_element, id
    `),
    pool.query(`
      select id::text as id, jurisdiction, claim_type, deadline_source_citation,
             deadline_days, deadline_description, filing_body, source_url,
             verification_status
      from public.legal_workflow_deadlines
      where lower(coalesce(verification_status, '')) = 'verified'
      order by claim_type, jurisdiction, id
    `),
    pool.query(`
      select id,
             'workflow_' || id::text as workflow_key,
             title as workflow_name,
             issue_types, primary_agency,
             initial_deadline_rule, entry_forms,
             null::integer as exhaustion_required,
             appeal_chain, remedies
      from public.workflow_master
      where lower(coalesce(workflow_status, 'active')) = 'active'
      order by id
    `),
    pool.query(`
      select id, workflow_id, step_number, step_order,
             action_description as action,
             null::text as owner,
             deadline_rule as due_rule,
             null::text as required_document,
             null::text as output,
             null::text as escalation_if_failed
      from public.workflow_steps
      where workflow_id is not null
      order by workflow_id, coalesce(step_order, step_number, id), id
    `),
  ]);

  const claims: GovernedClaimRecord[] = [];
  const claim_type_ids = new Set<string>();
  for (const row of claims_result.rows as any[]) {
    const claim_type_id = require_text(row.claim_type_id, 'claim_type_id', row.id);
    if (claim_type_ids.has(claim_type_id)) {
      throw new Error(`governed_legal_registry_duplicate_claim_type:${claim_type_id}`);
    }
    claim_type_ids.add(claim_type_id);
    claims.push({
      registry_id: Number(row.id),
      claim_type_id,
      domain: require_text(row.domain, 'domain', row.id).toLowerCase(),
      canonical_name: require_text(row.canonical_name, 'canonical_name', row.id),
      description: row.description ? String(row.description) : null,
      governing_standards: parse_string_array(row.governing_standards, 'governing_standards', row.id),
      required_evidence_types: parse_string_array(row.required_evidence, 'required_evidence', row.id),
      allowed_evidence_types: parse_string_array(row.allowed_evidence, 'allowed_evidence', row.id),
      jurisdiction_layer: row.jurisdiction_layer ? String(row.jurisdiction_layer).trim().toLowerCase() : null,
    });
  }

  const elements_by_key = new Map<string, GovernedClaimElementRecord>();
  for (const row of elements_result.rows as any[]) {
    const claim_type_id = require_text(row.claim_type, 'element_claim_type', row.id);
    if (!claim_type_ids.has(claim_type_id)) continue;
    const element_name = require_text(row.legal_element, 'element_name', row.id);
    const element_order = row.element_order === null || row.element_order === undefined ? null : Number(row.element_order);
    const element: GovernedClaimElementRecord = {
      registry_id: Number(row.id),
      claim_type_id,
      element_name,
      element_description: row.element_description ? String(row.element_description) : null,
      element_order: Number.isSafeInteger(element_order) ? element_order : null,
      required_evidence_types: parse_string_array(row.required_evidence, 'element_required_evidence', row.id),
      is_required: Number(row.is_required ?? 0) === 1,
    };
    const key = `${claim_type_id}|${element_order ?? 'null'}|${element_name}`;
    const existing = elements_by_key.get(key);
    if (existing) {
      const comparable_existing = { ...existing, registry_id: 0 };
      const comparable_next = { ...element, registry_id: 0 };
      if (JSON.stringify(comparable_existing) !== JSON.stringify(comparable_next)) {
        throw new Error(`governed_legal_registry_conflicting_element:${key}`);
      }
      continue;
    }
    elements_by_key.set(key, element);
  }

  const deadlines: GovernedDeadlineRecord[] = (deadlines_result.rows as any[]).map(row => ({
    registry_id: require_text(row.id, 'deadline_id', row.id),
    jurisdiction: require_text(row.jurisdiction, 'deadline_jurisdiction', row.id).toUpperCase(),
    claim_domain: require_text(row.claim_type, 'deadline_claim_domain', row.id).toLowerCase(),
    deadline_days: parse_deadline_days(row.deadline_days),
    deadline_description: row.deadline_description ? String(row.deadline_description) : null,
    filing_body: row.filing_body ? String(row.filing_body) : null,
    source_citation: row.deadline_source_citation ? String(row.deadline_source_citation) : null,
    source_url: row.source_url ? String(row.source_url) : null,
    verification_status: 'verified' as const,
  }));

  const steps_by_workflow = new Map<number, GovernedWorkflowStep[]>();
  for (const row of steps_result.rows as any[]) {
    const workflow_id = Number(row.workflow_id);
    const step_number = row.step_order ?? row.step_number ?? row.id;
    if (row.step_order !== null && row.step_order !== undefined && row.step_number !== null && row.step_number !== undefined && Number(row.step_order) !== Number(row.step_number)) {
      throw new Error(`governed_legal_registry_conflicting_step_order:${row.id}`);
    }
    const step: GovernedWorkflowStep = {
      registry_id: Number(row.id),
      step_number: Number(step_number),
      action: require_text(row.action, 'workflow_step_action', row.id),
      owner: row.owner ? String(row.owner) : null,
      due_rule: row.due_rule ? String(row.due_rule) : null,
      required_document: row.required_document ? String(row.required_document) : null,
      output: row.output ? String(row.output) : null,
      escalation_if_failed: row.escalation_if_failed ? String(row.escalation_if_failed) : null,
    };
    const list = steps_by_workflow.get(workflow_id) || [];
    list.push(step);
    steps_by_workflow.set(workflow_id, list);
  }

  const workflows: GovernedWorkflowRecord[] = (workflows_result.rows as any[]).map(row => ({
    registry_id: Number(row.id),
    workflow_key: require_text(row.workflow_key, 'workflow_key', row.id),
    workflow_name: require_text(row.workflow_name, 'workflow_name', row.id),
    issue_types: parse_string_array(row.issue_types, 'workflow_issue_types', row.id),
    primary_agency: row.primary_agency ? String(row.primary_agency) : null,
    initial_deadline_rule: row.initial_deadline_rule ? String(row.initial_deadline_rule) : null,
    entry_forms: parse_string_array(row.entry_forms, 'workflow_entry_forms', row.id),
    exhaustion_required: row.exhaustion_required === null || row.exhaustion_required === undefined
      ? null
      : Number(row.exhaustion_required) === 1,
    appeal_chain: parse_string_array(row.appeal_chain, 'workflow_appeal_chain', row.id),
    remedies: parse_string_array(row.remedies, 'workflow_remedies', row.id),
    steps: steps_by_workflow.get(Number(row.id)) || [],
  }));

  const manifest = normalizeGovernedLegalRegistry({
    contract_version: GOVERNED_LEGAL_REGISTRY_CONTRACT_VERSION,
    source_tables: [
      { table_name: 'claim_catalog', posture: 'structural_claim_registry' },
      { table_name: 'claim_validation_rules', posture: 'required_element_registry' },
      { table_name: 'legal_workflow_deadlines', posture: 'verified_deadline_registry' },
      { table_name: 'workflow_master', posture: 'procedural_workflow_registry' },
      { table_name: 'workflow_steps', posture: 'procedural_workflow_registry' },
    ],
    claims,
    elements: Array.from(elements_by_key.values()),
    deadlines,
    workflows,
  });

  return {
    manifest,
    rule_manifest_hash: computeGovernedLegalRegistryHash(manifest),
  };
}

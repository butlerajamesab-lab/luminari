import { describe, expect, it } from 'vitest';
import { connectSourceWorkflows, workflowJurisdictionCode, type SourceWorkflowRow } from './source-workflow-registry';
import { computeGovernedLegalRegistryHash, type GovernedLegalRegistryManifest, normalizeGovernedLegalRegistry } from './governed-legal-registry';
import { processLayer14 } from './layer-14-action_paths';
import type { ClaimCandidate } from './layer-12-rights_and_duties_matrix';
import { computeHash } from './utils';

const steps = [
  { step: '2', action_required: 'Submit the source form', deadline: 'See notice', agency___contact: 'Source office', documents_needed: 'Notice' },
  { step: '1', action_required: 'Read the notice', deadline: 'Source deadline wording', agency___contact: 'Personal records', documents_needed: 'Envelope' },
];

function row(overrides: Partial<SourceWorkflowRow> = {}): SourceWorkflowRow {
  return {
    uuid: 'sdw_wa_wage_theft', workflow_type: 'wage_theft', jurisdiction: 'WA',
    verification_status: 'source_attached', registry_steps: steps,
    candidate_group_id: 'sdwg-source', run_id: 'reassembly-source', jurisdiction_code: 'WA',
    promoted_workflow_type: 'wage_theft', preferred_steps: steps, preferred_source_steps: steps,
    source_stage_row_ids: [2, 1],
    source_logical_record_ids: ['logical-2', 'logical-1'], source_files: ['source.docx'],
    record_fingerprint: 'source-fingerprint', disposition: 'inserted', bound_source_count: 2,
    ...overrides,
  };
}

function registry(rows: SourceWorkflowRow[]): GovernedLegalRegistryManifest {
  const connected = connectSourceWorkflows(rows);
  return {
    contract_version: 'luminari.intake.governed-legal-registry.v2', source_tables: [],
    claims: [], elements: [], deadlines: [], workflows: connected.workflows, workflow_holds: connected.holds,
  };
}

function candidate(jurisdiction: string, claim_type_id = 'wage_theft'): ClaimCandidate {
  return {
    candidate_id: 'test-candidate', claim_type_id, claim_type_name: 'Test claim', claim_domain: 'employment',
    subject_entity_id: 'test-person', triggering_relationship_ids: [], triggering_transition_ids: [],
    triggering_pattern_ids: [], triggering_facts: [], matching_rule: 'test', required_elements: [],
    unresolved_elements: [], jurisdiction, governing_standards: [], deadline_candidates: [],
    registry_binding: { contract_version: 'test', governed_registry_hash: 'test', claim_registry_id: 1 },
    applicability_status: 'candidate_unverified',
  };
}

function paths(manifest: GovernedLegalRegistryManifest, jurisdiction: string, claim_type_id = 'wage_theft') {
  return processLayer14({ candidates: [candidate(jurisdiction, claim_type_id)], governed_registry: manifest,
    governed_registry_hash: computeGovernedLegalRegistryHash(manifest) });
}

describe('existing registry to case procedural candidates', () => {
  it('preserves existing IDs, ordered steps, source lineage, and verification through Layer 14', () => {
    const manifest = registry([row()]);
    const result = paths(manifest, 'Washington');
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      workflow_registry_id: 'sdw_wa_wage_theft', workflow_key: 'workflow_registry:sdw_wa_wage_theft',
      workflow_jurisdiction: 'WA', status: 'candidate_unverified', foothold_complete: false,
      authority: null, filing_destination: null, deadline_candidates: [], workflow_deadline_rule: null,
      workflow_source_binding: { source_id: 'sdw_wa_wage_theft', verification_status: 'source_attached',
        source_logical_record_ids: ['logical-1', 'logical-2'], deadline_state: 'source_text_only' },
    });
    expect(result.data[0].next_steps.map(step => step.step_number)).toEqual([1, 2]);
    expect(result.data[0].next_steps[0].due_rule).toBe('Source deadline wording');
    expect(result.data[0].next_steps[0].owner).toBe('Personal records');
  });

  it.each(['CA', 'Federal', '', 'unknown', 'WA-NAVAJO', 'Washington County'])('does not apply a WA workflow to %s', jurisdiction => {
    expect(paths(registry([row()]), jurisdiction).data).toEqual([]);
  });

  it('normalizes every supported state and territory without collapsing tribal jurisdiction to state', () => {
    expect(workflowJurisdictionCode('District of Columbia')).toBe('DC');
    expect(workflowJurisdictionCode('Puerto Rico')).toBe('PR');
    expect(workflowJurisdictionCode('AZ-NAVAJO')).toBeNull();
  });

  it('matches the explicit employment-discrimination alias, without guessing insurance or other claims', () => {
    const manifest = registry([row({ workflow_type: 'employment_discrimination', promoted_workflow_type: 'employment_discrimination' })]);
    expect(paths(manifest, 'WA', 'discrimination_employment').data).toHaveLength(1);
    expect(paths(manifest, 'WA', 'insurance_denial').data).toEqual([]);
  });

  it('deduplicates at the existing UUID and holds conflicting promotion bindings', () => {
    const connected = connectSourceWorkflows([row(), row({ candidate_group_id: 'another' })]);
    expect(connected.workflows).toEqual([]);
    expect(connected.holds).toEqual([{ source_table: 'workflow_registry', source_id: 'sdw_wa_wage_theft', reason: 'ambiguous_promotion_binding' }]);
  });

  it.each([
    [{ candidate_group_id: null }, 'missing_source_workflow_binding'],
    [{ verification_status: 'superseded' }, 'workflow_not_current'],
    [{ bound_source_count: 1 }, 'incomplete_source_lineage'],
    [{ jurisdiction_code: 'CA' }, 'jurisdiction_binding_mismatch'],
    [{ workflow_type: 'other' }, 'workflow_type_binding_mismatch'],
    [{ registry_steps: [{ ...steps[0], action_required: 'Changed' }, steps[1]] }, 'source_steps_conflict'],
    [{ preferred_source_steps: [{ ...steps[0], deadline: 'Changed deadline' }, steps[1]] }, 'source_steps_conflict'],
    [{ preferred_steps: [steps[0], steps[0]] }, 'invalid_or_missing_ordered_steps'],
    [{ preferred_steps: [{ ...steps[0], step: '2nd' }] }, 'invalid_or_missing_ordered_steps'],
  ] as Array<[Partial<SourceWorkflowRow>, string]>)('holds mismatched source data without losing valid workflows: %j', (override, reason) => {
    const connected = connectSourceWorkflows([row({ uuid: 'valid' }), row(override)]);
    expect(connected.workflows.map(workflow => workflow.registry_id)).toEqual(['valid']);
    expect(connected.holds[0].reason).toBe(reason);
  });

  it('produces stable hashes on replay and changes the hash for source changes', () => {
    const original = registry([row()]);
    const reordered = registry([row({ source_logical_record_ids: ['logical-1', 'logical-2'],
      preferred_steps: [...steps].reverse(), registry_steps: [...steps].reverse() })]);
    expect(computeGovernedLegalRegistryHash(original)).toBe(computeGovernedLegalRegistryHash(reordered));
    expect(computeGovernedLegalRegistryHash(registry([row({ verification_status: 'reviewed' })]))).not.toBe(computeGovernedLegalRegistryHash(original));
  });

  it('preserves the legacy manifest shape and numeric workflow behavior', () => {
    const old: GovernedLegalRegistryManifest = { contract_version: 'luminari.intake.governed-legal-registry.v1', source_tables: [],
      claims: [], elements: [], deadlines: [], workflows: [{ registry_id: 4, workflow_key: 'workflow_4', workflow_name: 'Existing',
        issue_types: ['wage_theft'], primary_agency: 'Existing agency', initial_deadline_rule: null,
        entry_forms: [], exhaustion_required: null, appeal_chain: [], remedies: [], steps: [] }] };
    expect(normalizeGovernedLegalRegistry(old)).toEqual(old);
    expect(computeGovernedLegalRegistryHash(old)).toBe(computeHash(old));
    expect(paths(old, 'WA').data[0].workflow_registry_id).toBe(4);
  });
});

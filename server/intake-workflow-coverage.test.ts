import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SOURCE_WORKFLOW_QUERY } from './engines/intake-spine/source-workflow-registry';
import { processLayer14 } from './engines/intake-spine/layer-14-action_paths';
import type { ClaimCandidate } from './engines/intake-spine/layer-12-rights_and_duties_matrix';
import type { TrpcContext } from './_core/context';

const query = vi.hoisted(() => vi.fn());
vi.mock('./db', () => ({ getPool: () => ({ query }) }));
vi.mock('./intake-spine-orchestrator', () => ({ execute_intake_spine_session: vi.fn(), INTAKE_SPINE_LAYER_NAMES: [] }));
vi.mock('./intake-case-layer-reader', () => ({ read_canonical_case_layer_outputs: vi.fn() }));
vi.mock('./intake-case-integrity-projection', () => ({ read_case_intake_integrity_projection: vi.fn() }));
vi.mock('./intake-signal-promotion', () => ({ promoteCaseIntakeSignals: vi.fn() }));

import { read_workflow_coverage, project_workflow_coverage } from './intake-workflow-coverage';
import { load_governed_legal_registry } from './intake-governed-legal-registry';
import { analyzeRouter } from './routers/analyze';

function source_row(uuid: string, workflow_type: string) {
  const steps = [{ step: '1', action_required: 'Preserve the source record', deadline: 'Source deadline text' }];
  return {
    uuid, workflow_type, jurisdiction: 'WA', verification_status: 'source_attached',
    registry_steps: steps, preferred_steps: steps, preferred_source_steps: steps,
    candidate_group_id: `promotion:${uuid}`, run_id: 'source-run', jurisdiction_code: 'WA',
    promoted_workflow_type: workflow_type, source_logical_record_ids: [`logical:${uuid}`],
    source_stage_row_ids: [11], source_files: ['Washington source.docx'],
    record_fingerprint: 'source-fingerprint', disposition: 'inserted', bound_source_count: 1,
  };
}

beforeEach(() => {
  query.mockReset();
  query.mockImplementation(async (sql: string) => {
    if (sql === SOURCE_WORKFLOW_QUERY) return { rows: [
      source_row('w-1', 'eviction'), source_row('w-2', 'unbound_procedure'),
      { ...source_row('w-3', 'wage_theft'), candidate_group_id: null },
    ] };
    if (sql.includes('from public.claim_catalog')) return { rows: [{
      id: 1, claim_type_id: 'eviction_unlawful', domain: 'housing', canonical_name: 'Unlawful eviction',
    }] };
    if (sql.includes('from public.workflow_master')) return { rows: [{ id: 7, workflow_key: 'workflow_7', workflow_name: 'Existing master', issue_types: [] }] };
    return { rows: [] };
  });
});

describe('workflow coverage from the existing intake reader', () => {
  it('accounts for admitted, unmatched and held records without inventing a connection', async () => {
    const coverage = await read_workflow_coverage();
    expect(coverage.summary).toMatchObject({
      existing_master_workflows: 1, source_registry_records: 3, source_bound_workflows: 2,
      claim_type_matched: 1, missing_claim_binding: 1, held_registry_records: 1,
      holds_by_reason: { missing_source_workflow_binding: 1 },
    });
    expect(coverage.case_applicability_evaluated).toBe(false);
    expect(coverage.records[0]).toMatchObject({ source_id: 'w-1', matching_claim_type_ids: ['eviction_unlawful'],
      source_files: ['Washington source.docx'], source_logical_record_ids: ['logical:w-1'],
      source_stage_row_ids: [11], deadline_state: 'source_text_only' });
    expect(coverage.records[1]).toMatchObject({ status: 'missing_claim_binding', matching_claim_type_ids: [] });
    expect(coverage.records[2]).toMatchObject({ status: 'held', source_id: 'w-3', source_files: null, ordered_step_count: null });
    expect(query.mock.calls.every(([sql]) => /^\s*select\b/i.test(sql))).toBe(true);
  });

  it('matches the actual Layer 14 alias rule and keeps case jurisdiction evaluation separate', async () => {
    const loaded = await load_governed_legal_registry();
    const coverage = project_workflow_coverage(loaded);
    const candidate = {
      candidate_id: 'test', claim_type_id: 'eviction_unlawful', claim_type_name: 'Test', claim_domain: 'housing',
      subject_entity_id: 'fixture-only', triggering_relationship_ids: [], triggering_transition_ids: [],
      triggering_pattern_ids: [], triggering_facts: [], matching_rule: 'fixture-only', required_elements: [],
      unresolved_elements: [], jurisdiction: 'WA', governing_standards: [], deadline_candidates: [],
      registry_binding: { contract_version: loaded.manifest.contract_version, governed_registry_hash: loaded.rule_manifest_hash, claim_registry_id: 1 },
      applicability_status: 'candidate_unverified',
    } satisfies ClaimCandidate;
    const paths = (jurisdiction: string) => processLayer14({ candidates: [{ ...candidate, jurisdiction }],
      governed_registry: loaded.manifest, governed_registry_hash: loaded.rule_manifest_hash }).data;
    expect(paths('WA').map(path => path.workflow_registry_id)).toEqual(coverage.records.filter(row => row.status === 'claim_type_matched').map(row => row.source_id));
    expect(paths('OR')).toEqual([]);
  });

  it('filters and paginates identities while preserving global accounting and registry hash', async () => {
    const first = await read_workflow_coverage({ limit: 1 });
    const second = await read_workflow_coverage({ limit: 1, offset: 1 });
    expect(first.records[0].source_id).toBe('w-1');
    expect(second.records[0].source_id).toBe('w-2');
    expect(second.registry_hash).toBe(first.registry_hash);
    expect(second.summary).toEqual(first.summary);
    expect((await read_workflow_coverage({ status: 'held' })).records.map(row => row.source_id)).toEqual(['w-3']);
    expect((await read_workflow_coverage({ search: 'Washington source' })).filtered_count).toBe(2);
    const no_match = await read_workflow_coverage({ search: 'missing' });
    expect(no_match.filtered_count).toBe(1); // The explicit hold reason remains searchable.
    const empty_filter = await read_workflow_coverage({ search: 'does-not-exist' });
    expect(empty_filter.filtered_count).toBe(0);
    expect(empty_filter.availability).toBe('available');
  });

  it('propagates unavailable reads and distinguishes genuine empty coverage', async () => {
    query.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(read_workflow_coverage()).rejects.toThrow('database unavailable');
    query.mockResolvedValue({ rows: [] });
    const empty = await read_workflow_coverage();
    expect(empty.availability).toBe('empty');
    expect(empty.summary.source_registry_records).toBe(0);
  });
});

function caller(role: 'admin' | 'user' | null) {
  return analyzeRouter.createCaller({ user: role ? { id: 1, role } : null,
    auth: { auth_status: role ? 'authenticated_profile_resolved' : 'unauthenticated' },
  } as TrpcContext);
}

describe('workflow coverage admin boundary', () => {
  it.each([null, 'user'] as const)('rejects %s before reading the database', async role => {
    await expect(caller(role).get_workflow_coverage()).rejects.toMatchObject({ code: role ? 'FORBIDDEN' : 'UNAUTHORIZED' });
    expect(query).not.toHaveBeenCalled();
  });

  it('reads the actual projection for an administrator without requiring a case', async () => {
    const result = await caller('admin').get_workflow_coverage({ status: 'held', limit: 20, offset: 0 });
    expect(result.records.map(row => row.source_id)).toEqual(['w-3']);
    expect(result.summary.source_registry_records).toBe(3);
  });

  it('rejects unbounded pagination before the database read', async () => {
    await expect(caller('admin').get_workflow_coverage({ limit: 101 })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(query).not.toHaveBeenCalled();
  });
});

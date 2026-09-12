import { describe, expect, it, vi } from 'vitest';
import { SOURCE_WORKFLOW_QUERY } from './engines/intake-spine/source-workflow-registry';
const query = vi.hoisted(() => vi.fn());
vi.mock('./db', () => ({ getPool: () => ({ query }) }));
import { load_governed_legal_registry } from './intake-governed-legal-registry';

describe('intake registry connection', () => {
  it('loads existing registry rows with the same identity/source query used by live verification', async () => {
    query.mockImplementation(async (sql: string) => ({ rows: sql === SOURCE_WORKFLOW_QUERY ? [{
      uuid: 'registry-1', workflow_type: 'wage_theft', jurisdiction: 'WA', verification_status: 'source_attached',
      registry_steps: [{ step: '1', action_required: 'Source action' }], preferred_steps: [{ step: '1', action_required: 'Source action' }],
      preferred_source_steps: [{ step: '1', action_required: 'Source action' }], source_stage_row_ids: [1],
      candidate_group_id: 'promotion-1', run_id: 'run-1', jurisdiction_code: 'WA', promoted_workflow_type: 'wage_theft',
      source_logical_record_ids: ['logical-1'], source_files: ['source.docx'], record_fingerprint: 'fingerprint', disposition: 'inserted', bound_source_count: 1,
    }] : [] }));
    const loaded = await load_governed_legal_registry();
    expect(query).toHaveBeenCalledWith(SOURCE_WORKFLOW_QUERY);
    expect(loaded.manifest.workflows[0].registry_id).toBe('registry-1');
    expect(loaded.manifest.workflows[0].source_binding?.source_logical_record_ids).toEqual(['logical-1']);
    expect(loaded.manifest.workflow_holds).toEqual([]);
    expect(loaded.manifest.deadlines).toEqual([]);
  });
});

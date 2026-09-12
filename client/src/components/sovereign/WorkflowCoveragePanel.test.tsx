import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ query: { data: undefined as any, error: null as any, isFetching: false, isLoading: false, refetch: vi.fn() } }));
vi.mock('@/lib/trpc', () => ({ trpc: { analyze: { get_workflow_coverage: { useQuery: () => state.query } } } }));
import WorkflowCoveragePanel from './WorkflowCoveragePanel';

describe('workflow coverage investigation surface', () => {
  it('shows native identities, explicit holds and disjoint accounting', () => {
    state.query.error = null;
    state.query.data = {
      summary: { existing_master_workflows: 6, source_registry_records: 3, source_bound_workflows: 2,
        claim_type_matched: 1, missing_claim_binding: 1, held_registry_records: 1,
        source_workflow_steps: 2, source_jurisdictions: 1, holds_by_reason: { missing_source_workflow_binding: 1 } },
      filtered_count: 1, offset: 0, has_more: false,
      registry_contract_version: 'registry.v2', registry_hash: 'current-reader-hash',
      records: [{ source_id: 'original-id', source_table: 'workflow_registry', workflow_name: null,
        jurisdiction: null, status: 'held', reason: 'missing_source_workflow_binding', source_files: null }],
    };
    const html = renderToStaticMarkup(<WorkflowCoveragePanel />);
    expect(html).toContain('workflow_registry:original-id');
    expect(html).toContain('missing_source_workflow_binding');
    expect(html).toContain('3 records = 2 source-bound + 1 held');
    expect(html).toContain('current-reader-hash');
    expect(html).toContain('Source bindings were not admitted by Intake.');
    expect(html).toContain('aria-label="Workflow connection status"');
    expect(html).toContain('aria-label="Search workflows"');
  });

  it('shows an unavailable read without stale counts or an empty-registry claim', () => {
    state.query.error = { message: 'Database unavailable' };
    const html = renderToStaticMarkup(<WorkflowCoveragePanel />);
    expect(html).toContain('Counts are unavailable.');
    expect(html).not.toContain('Registry accounting:');
    expect(html).not.toContain('No records match these filters.');
  });
});

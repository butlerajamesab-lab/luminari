import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), legal: vi.fn(), resources: vi.fn(), registry: vi.fn(), resolve: vi.fn() }));
vi.mock('./db-legacy', () => ({ query_with_diagnostics: mocks.query }));
vi.mock('./services/current-legal-authority-reader', () => ({ read_current_legal_authorities: mocks.legal }));
vi.mock('./services/resource-directory-publishable', () => ({ searchPublishableResourceDirectory: mocks.resources }));
vi.mock('./intake-governed-legal-registry', () => ({ load_governed_legal_registry: mocks.registry }));
vi.mock('./legal-reference-runtime', () => ({ resolve_legal_reference: mocks.resolve }));
import { get_case_action_context } from './services/case-action-context';

function database(sql: string) {
  if (sql.includes('from public.cases ')) return { rows: [{ id: 41, name: 'Case', domain: 'housing', pipeline_type: 'housing' }] };
  if (sql.includes('from public.case_state ')) return { rows: [{ jurisdiction: 'WA', claim_type: 'test_claim', committed_statute_ids: ['case_law:abc'] }] };
  if (sql.includes('case_resource_links')) return { rows: [{ resource_ref: 'saved_resource' }] };
  if (sql.includes('signal_artifact_case_links_v1')) return { rows: [{ link_id: 'link', artifact_source_hash: 'preserved', relationship_type: 'context' }] };
  return { rows: [] };
}
beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.query.mockImplementation(async (sql: string) => database(sql));
  mocks.legal.mockResolvedValue({ items: [{ object_ref: 'source', source_content_sha256: 'original' }] });
  mocks.resources.mockResolvedValue({ items: [] });
  mocks.resolve.mockResolvedValue({ committed_ref: 'case_law:abc', status: 'unresolved', record: null });
  mocks.registry.mockResolvedValue({ rule_manifest_hash: 'rules', manifest: { claims: [{ claim_type_id: "test_claim", domain: "housing" }], workflows: [], deadlines: [] } });
});

describe('owned public case action context', () => {
  it('rejects missing identity before any database read', async () => {
    await expect(get_case_action_context({ case_id: 41 }, undefined as unknown as number)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('rejects another owner and never reads case links or registry data', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });
    await expect(get_case_action_context({ case_id: 41 }, 7)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('public.cases where id = $1 and user_id = $2'), [41,7], expect.any(Object));
    expect(mocks.registry).not.toHaveBeenCalled();
    expect(mocks.legal).not.toHaveBeenCalled();
  });
  it('preserves exact source identities and explicit relationship meaning in the canonical case namespace', async () => {
    const result = await get_case_action_context({ case_id: 41 }, 7);
    expect(result.case_namespace).toBe('public.cases');
    expect(result.legal_authorities.items).toEqual([{ object_ref: 'source', source_content_sha256: 'original' }]);
    expect(result.signals.items?.[0]).toMatchObject({ artifact_source_hash: 'preserved', relationship_type: 'context' });
    expect(result.legal_attachments.items?.[0]).toMatchObject({ status: 'unresolved', committed_ref: 'case_law:abc' });
    expect(mocks.query.mock.calls.every(([sql]) => !sql.includes('luminari_cases'))).toBe(true);
  });
  it('does not broaden an empty text search or infer an issue from shared words', async () => {
    mocks.legal.mockResolvedValue({ items: [] });
    const result = await get_case_action_context({ case_id: 41, problem_context: 'unmatched words' }, 7);
    expect(mocks.legal).toHaveBeenCalledTimes(1);
    expect(mocks.legal).toHaveBeenCalledWith(expect.objectContaining({ query: 'unmatched words', jurisdiction: 'WA' }));
    expect(result.legal_authorities.availability.status).toBe('empty');
  });
  it('keeps missing jurisdiction unavailable while preserving saved links', async () => {
    mocks.query.mockImplementation(async (sql: string) => sql.includes('public.case_state') ? { rows: [] } : database(sql));
    const result = await get_case_action_context({ case_id: 41 }, 7);
    expect(result.legal_authorities.items).toBeNull();
    expect(result.workflows.availability.status).toBe('unavailable');
    expect(result.attached_resources.items).toHaveLength(1);
    expect(mocks.registry).not.toHaveBeenCalled();
    expect(mocks.legal).not.toHaveBeenCalled();
  });
  it('applies bounds and exact declared jurisdiction/claim filters to workflows and source deadline rules', async () => {
    mocks.registry.mockResolvedValue({ rule_manifest_hash: 'rules', manifest: {
      claims: [{ claim_type_id: 'test_claim', domain: 'housing' }],
      workflows: [
        { workflow_key: 'right', jurisdiction: 'Washington', issue_types: ['test_claim'], steps: [{ action: 'Preserve records' }] },
        { workflow_key: 'other_state', jurisdiction: 'OR', issue_types: ['test_claim'], steps: [] },
        { workflow_key: 'other_claim', jurisdiction: 'WA', issue_types: ['other'], steps: [] },
      ],
      deadlines: [
        { registry_id: 'rule1', jurisdiction: 'WA', claim_domain: 'housing' },
        { registry_id: 'rule2', jurisdiction: 'WA', claim_domain: 'housing' },
        { registry_id: 'wrong', jurisdiction: 'OR', claim_domain: 'housing' },
      ],
    } });
    const result = await get_case_action_context({ case_id: 41, limit_per_surface: 1 }, 7);
    expect(result.workflows.items?.map(row => row.workflow_key)).toEqual(['right']);
    expect(result.deadlines.items).toEqual([{ registry_id: 'rule1', jurisdiction: 'WA', claim_domain: 'housing', binding_state: 'domain_candidate_not_claim_specific', calculation_state: 'not_calculated', registry_hash: 'rules' }]);
    expect(result.deadlines.has_more).toBe(true);
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes('agency_forms'))).toBe(false);
  });
  it('keeps a failed surface distinct from empty without erasing successful reads', async () => {
    mocks.resources.mockRejectedValue(Object.assign(new Error('timeout'), { code: '57014' }));
    mocks.registry.mockRejectedValue(Object.assign(new Error('missing table'), { code: '42P01' }));
    const result = await get_case_action_context({ case_id: 41 }, 7);
    expect(result.resources.items).toBeNull();
    expect(result.resources.availability.status).toBe('error');
    expect(result.workflows.availability.status).toBe('unavailable');
    expect(result.legal_authorities.items).toHaveLength(1);
    expect(result.signals.items).toHaveLength(1);
  });
});

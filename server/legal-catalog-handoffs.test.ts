import { beforeEach, describe, expect, it, vi } from 'vitest';
import { writeFileSync, readFileSync } from 'node:fs';
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('./db-legacy', () => ({ query_with_diagnostics: query }));
vi.mock('./db', () => ({ getPool: () => ({ query }) }));
import { read_current_legal_authorities, read_current_legal_authority } from './services/current-legal-authority-reader';
import { searchRuntimeStatutes, searchRuntimeCaseLaw, getRuntimeLegalLibraryStats } from './legal-library-runtime-db';
import { legal_commit_ref, parse_legal_commit_ref, resolve_legal_reference } from './legal-reference-runtime';

beforeEach(() => { query.mockReset(); });
describe('legal catalog identities and handoffs', () => {
  it('preserves filtered totals beyond the final page and treats missing totals as unavailable', async () => {
    query.mockResolvedValueOnce({ rows: [{ inventory_total:1939, filtered_total:1762, held_total:177, jurisdiction_conflict_total:121, jurisdiction_unresolved_total:56, items:[] }] });
    const page = await read_current_legal_authorities({ offset: 2000 });
    expect(page.items).toEqual([]); expect(page.total).toBe(1762);
    query.mockResolvedValueOnce({ rows: [] });
    await expect(read_current_legal_authorities()).rejects.toThrow('did not return a result');
  });
  it('preserves original hashes on an exact source detail and binds its run and source locator', async () => {
    query.mockResolvedValue({ rows: [{ object_ref: 'original-id', source_content_sha256: 'source-hash', source_candidate_hash: 'candidate-hash' }] });
    const item = await read_current_legal_authority('original-id');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('p.run_id::text=c.run_id and p.source_locator=c.source_locator'), ['original-id'], expect.any(Object));
    expect(item).toMatchObject({ object_ref: 'original-id', source_content_sha256: 'source-hash', source_candidate_hash: 'candidate-hash' });
  });
  it.each(['statute','runtime_statute','case_law','legal_authority'] as const)('round trips the %s reference without numeric coercion', kind => {
    const ref = legal_commit_ref(kind,'00123');
    expect(parse_legal_commit_ref(ref)).toEqual({ kind, id:'00123' });
  });
  it.each(['case_law:', 'runtime_statute:', 'legal_authority:'])('never broadens malformed %s into a catalog browse', async ref => {
    await expect(resolve_legal_reference(ref)).resolves.toMatchObject({ status:'unresolved', record:null });
    expect(query).not.toHaveBeenCalled();
  });
  it('resolves exactly the source identity and preserves unmatched or ambiguous saved references', async () => {
    query.mockResolvedValueOnce({ rows: [{ object_ref:'source', name:'Source', filtered_total:1 }] });
    await expect(resolve_legal_reference('legal_authority:source')).resolves.toMatchObject({ status:'resolved', record:{object_ref:'source'} });
    query.mockResolvedValueOnce({ rows: [] });
    await expect(resolve_legal_reference('case_law:missing')).resolves.toMatchObject({ status:'unresolved', committed_ref:'case_law:missing', record:null });
    query.mockResolvedValueOnce({ rows: [{id:'same'}, {id:'same'}] });
    await expect(resolve_legal_reference('runtime_statute:same')).resolves.toMatchObject({ status:'unresolved', record:null });
  });
  it('keeps both public-case routers and model dispatch bound to caller identity', () => {
    const router = readFileSync('server/routers/luminari-router.ts','utf8');
    expect(router).toContain('get_case_action_context({ ...input, user_id: ctx.user.id })');
    const executor = readFileSync('server/engines/sunam-executor.ts','utf8');
    expect(executor).toContain('case "get_case_action_context":');
    expect(executor).toContain('dispatchServiceTool(toolName, args, Number(executedBy))');
    const dispatcher = readFileSync('server/engines/sunam-service-dispatcher.ts','utf8');
    expect(dispatcher).not.toContain('user_id: args.user_id');
  });
  it('records actual emitted queries for the optional read-only database verification', async () => {
    const captured: Array<{sql:string;params:unknown[]}> = [];
    query.mockImplementation(async (sql:string,params:unknown[]) => {
      captured.push({sql,params});
      if(sql.includes('as inventory_total')) return {rows:[{inventory_total:0,filtered_total:0,held_total:0,jurisdiction_conflict_total:0,jurisdiction_unresolved_total:0,items:[]}]};
      if(sql.includes('as enforcement_records')) return {rows:[{enforcement_records:0,weak_joints:0,contradictions:0,held_legal_references:0}]};
      if(sql.includes('count(*)::int as count from combined')) return {rows:[{count:0}]};
      return {rows:[]};
    });
    await read_current_legal_authorities({jurisdiction:'WA',query:'labor',limit:2});
    await searchRuntimeStatutes({jurisdiction:'WA',query:'housing',limit:2});
    await searchRuntimeCaseLaw({record_id:'00000000-0000-0000-0000-000000000001',limit:2});
    await getRuntimeLegalLibraryStats();
    expect(captured).toHaveLength(7);
    expect(captured[1].sql).toContain('p.run_id = c.run_id and p.source_locator = c.source_locator');
    if(process.env.LEGAL_QUERY_CAPTURE_PATH) writeFileSync(process.env.LEGAL_QUERY_CAPTURE_PATH,JSON.stringify(captured));
  });
});

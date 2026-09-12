import { initTRPC } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('./db', () => ({ pool: { query } }));
vi.mock('./registry-db', () => ({}));
vi.mock('./_core/trpc', () => {
  const t = initTRPC.create();
  return { router: t.router, publicProcedure: t.procedure, protectedProcedure: t.procedure };
});
import { registryRouter } from './routers/registry-router';

beforeEach(() => {
  query.mockReset().mockImplementation(async (text: string) =>
    ({ rows: text.includes('COUNT(*)') ? [{ total: 0 }] : [] }));
});

describe('canonical program search jurisdiction scope', () => {
  const caller = registryRouter.createCaller({} as any);
  it('uses the same exact federal scope for rows and counts', async () => {
    expect(await caller.searchPrograms({ query: 'help', federal_only: true })).toEqual({ programs: [], total: 0 });
    expect(query).toHaveBeenCalledTimes(2);
    for (const [text, params] of query.mock.calls) {
      expect(text).toContain("LOWER(BTRIM(COALESCE(NULLIF(p.jurisdiction_id, ''), p.jurisdiction_id_rp))) = ANY($5::text[])");
      expect(params[4]).toEqual(['federal', 'us-federal']);
      expect(text).not.toContain('j.abbreviation =');
    }
  });

  it('retains selected-state filtering without federal or other-state admission', async () => {
    await caller.searchPrograms({ query: 'Atrium', state_code: 'nc' });
    for (const [text, params] of query.mock.calls) {
      expect(text).toContain('j.abbreviation = $5');
      expect(params[4]).toBe('NC');
      expect(params).not.toContainEqual(['federal', 'us-federal']);
    }
  });

  it('normalizes the legacy state input only at the router boundary', async () => {
    await caller.searchPrograms({ query: 'Atrium', stateCode: 'nc' });
    expect(query.mock.calls[0][1][4]).toBe('NC');
    query.mockClear();
    await expect(caller.searchPrograms({ query: 'Atrium', state_code: 'NC', stateCode: 'WA' }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects contradictory federal-only and state scopes before reading', async () => {
    await expect(caller.searchPrograms({ query: 'help', state_code: 'NC', federal_only: true }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(query).not.toHaveBeenCalled();
  });

  it('preserves the unfiltered default for existing callers that request no scope', async () => {
    await caller.searchPrograms({ query: 'help' });
    expect(query.mock.calls[0][1]).toEqual(['%help%', '%help%', '%help%', '%help%', 20, 0]);
    expect(query.mock.calls[1][1]).toEqual(['%help%', '%help%', '%help%', '%help%']);
  });
});

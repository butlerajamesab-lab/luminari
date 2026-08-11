import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const router = readFileSync(new URL('./routers/knowledge-backbone.ts', import.meta.url), 'utf8');
const hook = readFileSync(new URL('../client/src/hooks/mission/useMissionControlData.ts', import.meta.url), 'utf8');

describe('Mission Control Knowledge Backbone Explorer', () => {
  it('uses PostgreSQL-native parameterized reads on the registered knowledgeBackbone router', () => {
    expect(router).toContain('getPool().query');
    expect(router).toContain('browseStatutes: protectedProcedure');
    expect(router).toContain('browseCaseLaw: protectedProcedure');
    expect(router).toContain('browseAgencies: protectedProcedure');
    expect(router).toContain('browseCourts: protectedProcedure');
    expect(router).toContain('browseAdvocacyTargets: protectedProcedure');
    expect(router).toContain('browseSettlementFormulas: protectedProcedure');
    expect(router).toContain('limit $4 offset $5');
    expect(router).not.toContain('const [rows] = await db.execute');
  });

  it('uses live registry_programs columns rather than stale *_rp browse names', () => {
    expect(router).toContain('name as target_name');
    expect(router).toContain('category as target_type');
    expect(router).toContain('contact as contact_info');
    expect(router).not.toContain('name_rp as target_name');
    expect(router).not.toContain('agency_rp');
    expect(router).not.toContain('eligibility_rp');
    expect(router).not.toContain('category_rp');
    expect(router).not.toContain('contact_rp');
    expect(router).not.toContain('created_at_rp');
  });

  it('routes the Mission Control explorer away from the stale bulk-ingestion browse procedures', () => {
    for (const procedure of [
      'getJurisdictions',
      'getDomains',
      'browseStatutes',
      'browseCaseLaw',
      'browseAgencies',
      'browseCourts',
      'browseAdvocacyTargets',
      'browseSettlementFormulas',
    ]) {
      expect(hook).toContain(`trpc.knowledgeBackbone.${procedure}`);
      expect(hook).not.toContain(`trpc.knowledgeIngestion.${procedure}`);
    }
  });
});

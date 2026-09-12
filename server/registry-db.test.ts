import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('./db', () => ({ db: { execute } }));
import * as registry from './registry-db';

const dialect = new PgDialect();
const queryAt = (index = 0) => dialect.sqlToQuery(execute.mock.calls[index][0]);
const jurisdictionId = '544e3ed9-c07e-534c-b771-5d8592affcdf';

beforeEach(() => execute.mockReset().mockResolvedValue({ rows: [] }));

describe('canonical registry live schema readers', () => {
  it('preserves UUID jurisdiction identity and the database response', async () => {
    const row = { id: jurisdictionId, name: 'North Carolina (NC)', abbreviation: 'NC' };
    execute.mockResolvedValue({ rows: [row] });
    expect(await registry.getJurisdiction(jurisdictionId)).toBe(row);
    expect(queryAt().params).toEqual([jurisdictionId]);
    expect(await registry.getJurisdiction('0001')).toBe(row);
    expect(queryAt(1).params).toEqual(['0001']);
  });

  it('applies category-only filters and keeps hostile values bound', async () => {
    const category = "organization' OR true --";
    await registry.listPrograms(undefined, category);
    const query = queryAt();
    expect(query.params).toEqual([category]);
    expect(query.sql).not.toContain(category);
    expect(query.sql).toMatch(/WHERE p.category = \$1/);
  });

  it.each([
    ['programs', registry.listPrograms, 'p.*', 'p.name'],
    ['policy alerts', registry.listPolicyAlerts, 'a.*', 'a.created_at_rpa'],
    ['workflows', registry.listWorkflows, 'w.*', 'w.workflow_type_rw'],
    ['oversight', registry.listOversightBodies, 'o.*', 'o.agency_name_rob'],
    ['signals', registry.getSignals, 's.*', 's.created_at_rs'],
  ] as const)('preserves %s source rows while binding text jurisdiction IDs', async (_name, read, projection, order) => {
    const row = { id: 'original-source-id', source_field: 'unchanged' };
    execute.mockResolvedValue({ rows: [row] });
    expect(await read(jurisdictionId)).toEqual([row]);
    const query = queryAt();
    expect(query.params).toEqual([jurisdictionId, jurisdictionId]);
    expect(query.sql).toContain(`SELECT ${projection}`);
    expect(query.sql).toContain(`ORDER BY ${order}`);
    expect(query.sql).toContain('EXISTS');
    expect(query.sql).toContain('matched_j.abbreviation = selected_j.abbreviation');
    expect(query.sql).not.toContain(jurisdictionId);
  });

  it('uses live signal type and timestamp fields for type-only filters', async () => {
    await registry.getSignals(undefined, 'deadline');
    const query = queryAt();
    expect(query.params).toEqual(['deadline']);
    expect(query.sql).toContain('s.signal_type_rs = $1');
    expect(query.sql).toContain('ORDER BY s.created_at_rs');
  });

  it('returns categories without replacing source identities', async () => {
    execute.mockResolvedValue({ rows: [{ category: 'organization' }] });
    expect(await registry.getProgramCategories(jurisdictionId)).toEqual(['organization']);
    expect(queryAt().params).toEqual([jurisdictionId, jurisdictionId]);
    expect(queryAt().sql).toContain('p.jurisdiction_id_rp');
  });

  it('returns null for an unknown jurisdiction', async () => {
    expect(await registry.getJurisdiction('unknown-id')).toBeNull();
  });
});

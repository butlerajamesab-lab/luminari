import { beforeEach, describe, expect, it, vi } from 'vitest';
const query = vi.hoisted(() => vi.fn());
vi.mock('../db', () => ({ getPool: () => ({ query }) }));
import { connect_discovery_office_records, readCurrentDiscoveryFacts } from './current-discovery-facts';
import { getGovOfficeDetail } from './resource-directory';

const office_id = 'gof_07c46cecd10c4191006b';
const office = {
  office_id, source_id: 'va_vha_facilities_arcgis', source_hash8: '6a262fa0',
  provenance: 'Source includes facility identity and has no phone field.',
};
const fact = { fact_id: 'discovery-id', source_lane: 'gov_offices', source_id: office_id, title: 'Everett Vet Center' };

beforeEach(() => { query.mockReset(); });

describe('native office identity from discovery to detail', () => {
  it('preserves the exact office/source keys without creating a resource relationship', async () => {
    query.mockResolvedValue({ rows: [office] });
    const [linked] = await connect_discovery_office_records([fact], { query } as any);
    expect(linked.record_link).toEqual({
      record_type: 'government_office', record_id: office_id, source_table: 'gov_offices',
      href: `/resource/${office_id}`, link_basis: 'exact_source_lane_and_office_id',
      locator_source_id: office.source_id, source_hash8: office.source_hash8, provenance: office.provenance,
    });
    expect(linked.source_id).toBe(office_id);
    expect(linked.fact_id).toBe('discovery-id');
    expect(query.mock.calls[0][1]).toEqual([[office_id]]);
    expect(query.mock.calls[0][0]).toContain('superseded_by is null');
    expect(query.mock.calls[0][0]).not.toContain('resource_office_xwalk');
  });

  it('does not bind matching names, domains, numeric candidate IDs or another source lane', async () => {
    query.mockResolvedValue({ rows: [office] });
    const result = await connect_discovery_office_records([
      fact,
      { ...fact, source_lane: 'normalized_civic_resource' },
      { ...fact, source_id: '11805' },
      { ...fact, source_id: '../../other-record' },
    ], { query } as any);
    expect(result.map(row => row.record_link_state)).toEqual([
      'available', 'not_applicable', 'unresolved_current_office', 'unresolved_current_office',
    ]);
    expect(result.slice(1).every(row => row.record_link === null)).toBe(true);
    expect(query.mock.calls[0][1]).toEqual([[office_id]]);
  });

  it('preserves missing provenance without inventing a verification or source narrative', async () => {
    query.mockResolvedValue({ rows: [{ ...office, provenance: null }] });
    const [linked] = await connect_discovery_office_records([fact], { query } as any);
    expect(linked.record_link?.provenance).toBeNull();
    expect(linked.record_link?.locator_source_id).toBe(office.source_id);
    expect(linked.record_link?.source_hash8).toBe(office.source_hash8);
    expect(linked.record_link_state).toBe('available');
    expect(linked.record_link).not.toHaveProperty('verification_status');
  });

  it('holds absent or superseded office identities and propagates failed reads', async () => {
    query.mockResolvedValue({ rows: [] });
    const [held] = await connect_discovery_office_records([fact], { query } as any);
    expect(held.record_link_state).toBe('unresolved_current_office');
    expect(held.record_link).toBeNull();
    query.mockRejectedValue(new Error('office read unavailable'));
    await expect(connect_discovery_office_records([fact], { query } as any)).rejects.toThrow('office read unavailable');
  });

  it('does not query the office table for a page without office identities', async () => {
    const [record] = await connect_discovery_office_records([{ ...fact, source_lane: 'registry_programs' }], { query } as any);
    expect(record.record_link).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('carries links through the actual discovery reader and daily record', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('from public.gov_offices')) return { rows: [office] };
      if (sql.includes('select fact_id')) return { rows: [{ ...fact, fact_kind: 'resource_listing', filtered_total: 1 }] };
      return { rows: [] };
    });
    const result = await readCurrentDiscoveryFacts({ limit: 1 });
    expect(result.items[0].record_link?.record_id).toBe(office_id);
    expect(result.daily?.record_link?.href).toBe(`/resource/${office_id}`);
    expect(result.total).toBe(1);
    expect(query.mock.calls.every(([sql]) => /^\s*select\b/.test(sql))).toBe(true);
  });

  it('keeps native office/source identifiers and provenance in the existing detail query', async () => {
    query.mockResolvedValue({ rows: [{ payload: { office_id, source_table: 'gov_offices' } }] });
    expect(await getGovOfficeDetail(office_id)).toEqual({ office_id, source_table: 'gov_offices' });
    const sql = query.mock.calls[0][0];
    for (const field of ['office_id', 'office_type', 'agency_key', 'locator_source_id', 'source_hash8', 'source_provenance']) expect(sql).toContain(`'${field}'`);
    expect(sql).toContain('g.superseded_by is null');
    expect(query.mock.calls[0][1]).toEqual([office_id]);
  });
});

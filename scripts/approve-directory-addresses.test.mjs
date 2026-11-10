// Pure-helper tests for the address approval wave runner.
// Written in vitest style: the repository suite (vitest.config.ts)
// collects scripts/**/*.test.mjs, so this file must register its tests
// with vitest — node:test registrations are invisible to the suite and
// fail its collection. Run: pnpm vitest run scripts/approve-directory-addresses.test.mjs
import { describe, expect, it } from 'vitest';
import {
  isMailingAddress,
  streetForGeocoder,
  buildBatchCsv,
  parseGeocodeResults,
  buildResolutionValues,
} from './approve-directory-addresses.mjs';

describe('address approval wave helpers', () => {
  it('treats PO Box variants as mailing addresses; street addresses are not', () => {
    expect(isMailingAddress('P.O. Box 85200')).toBe(true);
    expect(isMailingAddress('PO Box 12')).toBe(true);
    expect(isMailingAddress('311 W Washington St Ste 300')).toBe(false);
    expect(isMailingAddress('116 Mouache Dr')).toBe(false);
  });

  it('drops a duplicated trailing City, ST ZIP from the street field', () => {
    expect(
      streetForGeocoder('311 W Washington St Ste 300, Indianapolis, IN 46204', null),
    ).toBe('311 W Washington St Ste 300');
    expect(streetForGeocoder('116 Mouache Dr', null)).toBe('116 Mouache Dr');
    expect(streetForGeocoder('100 Main St', 'Suite 5')).toBe('100 Main St Suite 5');
  });

  it('quotes batch CSV fields containing commas', () => {
    const csv = buildBatchCsv([{ street: '100 Main St, Apt 2', city: 'Seattle', state: 'WA', postalCode: '98101' }]);
    expect(csv).toBe('1,"100 Main St, Apt 2",Seattle,WA,98101\n');
  });

  it('labels exact, non-exact, tie and no-match geocode results honestly', () => {
    const text = [
      '1,"100 Main St, Seattle, WA, 98101",Match,Exact,"100 MAIN ST, SEATTLE, WA, 98101","-122.33,47.60",123,L',
      '2,"200 Pine St, Seattle, WA, 98101",Match,Non_Exact,"200 PINE ST, SEATTLE, WA, 98101","-122.34,47.61",124,R',
      '3,"300 Tie Rd, Seattle, WA, 98101",Tie,Non_Exact,"300 TIE RD, SEATTLE, WA, 98101","-122.35,47.62",125,L',
      '3,"300 Tie Rd, Seattle, WA, 98101",Tie,Non_Exact,"300 TIE RD S, SEATTLE, WA, 98101","-122.36,47.63",126,L',
      '4,"999 Nowhere Ln, Seattle, WA, 98101",No_Match,,,,,',
    ].join('\n');
    const byId = parseGeocodeResults(text);
    expect(byId.get(1).quality).toBe('census_match_exact');
    expect(byId.get(1).latitude).toBe(47.6);
    expect(byId.get(2).quality).toBe('census_match_non_exact');
    expect(byId.get(3).quality).toBe('census_match_non_exact');
    expect(byId.get(4).quality).toBe('census_no_match');
    expect(byId.get(4).latitude).toBe(null);
  });

  it('builds resolution values that conform to the ledger schema contract', () => {
    // Contract: supabase/migrations/20260731001606_v3_13_manual_location_reconciliation.sql
    const base = {
      resource_entity_id: 'res-1', resource_name: 'Example Org', street: '100 Main St',
      city: 'Seattle', state: 'WA', postalCode: '98101', mailing: false,
      source_location_id: 'loc-1', malformed_location_ids: ['loc-1'],
    };
    const v = buildResolutionValues(base, 'manifest', '11111111-1111-1111-1111-111111111111');
    expect(v[0]).toBe('11111111-1111-1111-1111-111111111111'); // resolution_id supplied — the PK has no default
    expect(v[6]).toBe('replace_with_physical');
    expect(JSON.parse(v[7])).toBe('100 Main St, Seattle, WA 98101'); // reviewed_address is jsonb (JSON string)
    expect(v[9]).toBe(true); // map_eligible == (disposition = 'replace_with_physical')
    expect(Array.isArray(v[13]) && v[13].length >= 1).toBe(true); // malformed_location_ids cardinality >= 1

    const m = buildResolutionValues(
      { ...base, mailing: true, street: 'PO Box 12' },
      'manifest',
      '22222222-2222-2222-2222-222222222222',
    );
    expect(m[6]).toBe('replace_with_mailing'); // closed vocabulary — 'mailing_address_only' is not in it
    expect(m[9]).toBe(false);
    expect(JSON.parse(m[7])).toBe('PO Box 12, Seattle, WA 98101');
  });
});

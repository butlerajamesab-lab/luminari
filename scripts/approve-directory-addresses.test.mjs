// Pure-helper tests for the address approval wave runner.
// Run: node --test scripts/approve-directory-addresses.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isMailingAddress,
  streetForGeocoder,
  buildBatchCsv,
  parseGeocodeResults,
} from './approve-directory-addresses.mjs';

test('PO Box variants are mailing addresses; street addresses are not', () => {
  assert.equal(isMailingAddress('P.O. Box 85200'), true);
  assert.equal(isMailingAddress('PO Box 12'), true);
  assert.equal(isMailingAddress('311 W Washington St Ste 300'), false);
  assert.equal(isMailingAddress('116 Mouache Dr'), false);
});

test('street field drops a duplicated trailing City, ST ZIP', () => {
  assert.equal(
    streetForGeocoder('311 W Washington St Ste 300, Indianapolis, IN 46204', null),
    '311 W Washington St Ste 300',
  );
  assert.equal(streetForGeocoder('116 Mouache Dr', null), '116 Mouache Dr');
  assert.equal(streetForGeocoder('100 Main St', 'Suite 5'), '100 Main St Suite 5');
});

test('batch CSV quotes fields containing commas', () => {
  const csv = buildBatchCsv([{ street: '100 Main St, Apt 2', city: 'Seattle', state: 'WA', postalCode: '98101' }]);
  assert.equal(csv, '1,"100 Main St, Apt 2",Seattle,WA,98101\n');
});

test('geocode results: exact, non-exact, tie and no-match are labeled honestly', () => {
  const text = [
    '1,"100 Main St, Seattle, WA, 98101",Match,Exact,"100 MAIN ST, SEATTLE, WA, 98101","-122.33,47.60",123,L',
    '2,"200 Pine St, Seattle, WA, 98101",Match,Non_Exact,"200 PINE ST, SEATTLE, WA, 98101","-122.34,47.61",124,R',
    '3,"300 Tie Rd, Seattle, WA, 98101",Tie,Non_Exact,"300 TIE RD, SEATTLE, WA, 98101","-122.35,47.62",125,L',
    '3,"300 Tie Rd, Seattle, WA, 98101",Tie,Non_Exact,"300 TIE RD S, SEATTLE, WA, 98101","-122.36,47.63",126,L',
    '4,"999 Nowhere Ln, Seattle, WA, 98101",No_Match,,,,,',
  ].join('\n');
  const byId = parseGeocodeResults(text);
  assert.equal(byId.get(1).quality, 'census_match_exact');
  assert.equal(byId.get(1).latitude, 47.6);
  assert.equal(byId.get(2).quality, 'census_match_non_exact');
  assert.equal(byId.get(3).quality, 'census_match_non_exact');
  assert.equal(byId.get(4).quality, 'census_no_match');
  assert.equal(byId.get(4).latitude, null);
});

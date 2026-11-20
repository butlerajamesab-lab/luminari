import { describe, it, expect } from 'vitest';
import { applyPlans, BATCH_ID } from './apply-dedupe-merges.mjs';

// Stub pg client: routes by SQL prefix and captures writes.
function stubClient(survivorPoints) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('select contact_point_id, contact_type, is_primary, created_at')) return { rows: survivorPoints };
      if (sql.includes('insert into public.luminari_resource_contact_points')) return { rows: [{ contact_point_id: 'pNew' }] };
      return { rows: [] };
    },
  };
}

describe('applyPlans primary-repair snapshot (Codex P2 round 2)', () => {
  it('records prior is_primary flags into the cluster ledger row', async () => {
    const client = stubClient([
      { contact_point_id: 'pS', contact_type: 'phone', is_primary: true, created_at: '2026-01-01' },
      { contact_point_id: 'pM', contact_type: 'phone', is_primary: true, created_at: '2026-01-02' },
    ]);
    const plan = {
      cluster_id: 'dmc_test', survivor: 'S', evidence: [], fills: {}, survivor_prior: {},
      absorbed: [{ entity_id: 'B', move_points: ['pM'], delete_points: [], move_locations: [], delete_locations: [], move_anchors: [], prior_resolution: null }],
    };
    const result = await applyPlans(client, [plan]);
    expect(result.absorbedCount).toBe(1);
    const demote = client.calls.find((c) => c.sql.includes('is_primary = false'));
    expect(demote.params).toEqual(['pM']);
    const snap = client.calls.find((c) => c.sql.includes('survivor_primary_repairs'));
    expect(snap).toBeTruthy();
    expect(snap.params[1]).toBe(BATCH_ID);
    expect(snap.params[2]).toBe('dmc_test');
    expect(snap.params[3]).toBe('B');
    expect(JSON.parse(snap.params[0])).toEqual([{ contact_point_id: 'pM', prior_is_primary: true, new_is_primary: false }]);
  });
  it('writes deleted-location pin snapshots into the ledger moved payload', async () => {
    const client = stubClient([]);
    const pin = { location_id: 'loc_B', resource_entity_id: 'B', pin_class: 'exact', manifest_sha256: 'abc' };
    const plan = {
      cluster_id: 'dmc_test3', survivor: 'S', evidence: [], fills: {}, survivor_prior: {},
      absorbed: [{
        entity_id: 'B', move_points: [], delete_points: [], move_locations: [],
        delete_locations: [{ location_id: 'loc_B', resource_entity_id: 'B' }],
        delete_location_pins: [{ location_id: 'loc_B', pins: [pin] }],
        move_anchors: [], prior_resolution: null,
      }],
    };
    const result = await applyPlans(client, [plan]);
    expect(result.locationsDeleted).toBe(1);
    const insert = client.calls.find((c) => c.sql.includes('insert into public.luminari_dedupe_merges'));
    expect(insert).toBeTruthy();
    const moved = JSON.parse(insert.params[5]);
    expect(moved.location_pins_deleted).toEqual([{ location_id: 'loc_B', pins: [pin] }]);
    expect(moved.locations_deleted.map((l) => l.location_id)).toEqual(['loc_B']);
  });
  it('materializes planned gov contacts and records them for reversal (Codex P2 round 4)', async () => {
    const client = stubClient([
      { contact_point_id: 'pS', contact_type: 'phone', is_primary: true, created_at: '2026-01-01' },
    ]);
    const plan = {
      cluster_id: 'dmc_test4', survivor: 'S', evidence: [], fills: {}, survivor_prior: {},
      materialize_points: [{ contact_type: 'email', contact_value: 'help@county.gov', office_id: 'off1', from_entity_id: 'B' }],
      absorbed: [{ entity_id: 'B', move_points: [], delete_points: [], move_locations: [], delete_locations: [], move_anchors: [], prior_resolution: null }],
    };
    const result = await applyPlans(client, [plan]);
    expect(result.pointsMaterialized).toBe(1);
    const insert = client.calls.find((c) => c.sql.includes('insert into public.luminari_resource_contact_points'));
    expect(insert.params).toEqual(['S', 'email', 'help@county.gov', 'off1']);
    const snap = client.calls.find((c) => c.sql.includes('survivor_materialized_points'));
    expect(snap).toBeTruthy();
    expect(snap.params[2]).toBe('dmc_test4');
    expect(JSON.parse(snap.params[0])).toEqual([
      { contact_point_id: 'pNew', contact_type: 'email', contact_value: 'help@county.gov', from_entity_id: 'B' },
    ]);
  });
  it('snapshots the promotion branch too (prior false)', async () => {
    const client = stubClient([
      { contact_point_id: 'pS', contact_type: 'email', is_primary: false, created_at: '2026-01-01' },
    ]);
    const plan = {
      cluster_id: 'dmc_test2', survivor: 'S', evidence: [], fills: {}, survivor_prior: {},
      absorbed: [{ entity_id: 'B', move_points: [], delete_points: [], move_locations: [], delete_locations: [], move_anchors: [], prior_resolution: null }],
    };
    await applyPlans(client, [plan]);
    const snap = client.calls.find((c) => c.sql.includes('survivor_primary_repairs'));
    expect(JSON.parse(snap.params[0])).toEqual([{ contact_point_id: 'pS', prior_is_primary: false, new_is_primary: true }]);
  });
});

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

import { describe, it, expect } from 'vitest';
import {
  normAddr, normPhone, normDomain, normUrl, contactKey,
  buildEffectiveContacts, buildClusters, clusterIdFor,
  pickSurvivor, planCluster, planManifest,
} from './dedupe-merge-core.mjs';

const loc = (id, line1 = '100 Main St', city = 'Yakima', state = 'WA', lat = null, lng = null) =>
  ({ location_id: 'loc_' + id, resource_entity_id: id, address_line1: line1, city, state, latitude: lat, longitude: lng });
const pt = (id, eid, type, value) => ({ contact_point_id: id, resource_entity_id: eid, contact_type: type, contact_value: value });

describe('normalization', () => {
  it('normalizes phones to 10 digits', () => {
    expect(normPhone('+1 (509) 555-0100')).toBe('5095550100');
    expect(normPhone('509-555-0100')).toBe('5095550100');
    expect(normPhone('555-0100')).toBe(null);
  });
  it('strips suite designators from addresses', () => {
    expect(normAddr('100 Main St, Suite 200')).toBe('100 main st');
    expect(normAddr('100 Main St.')).toBe('100 main st');
  });
  it('normalizes domains and urls distinctly', () => {
    expect(normDomain('https://www.Example.org/apply')).toBe('example.org');
    expect(normUrl('https://www.Example.org/Apply/')).toBe('example.org/apply');
    expect(contactKey('website', 'https://a.org/x')).not.toBe(contactKey('website', 'https://a.org/y'));
  });
});

describe('buildClusters', () => {
  it('clusters two records sharing address + phone', () => {
    const contacts = buildEffectiveContacts({ points: [pt('p1', 'A', 'phone', '509-555-0100'), pt('p2', 'B', 'phone', '(509) 555-0100')], links: [], govById: new Map() });
    const { clusters } = buildClusters({ locations: [loc('A'), loc('B')], contacts });
    expect(clusters).toHaveLength(1);
    expect(clusters[0].memberIds).toEqual(['A', 'B']);
  });
  it('does not cluster on address alone', () => {
    const contacts = buildEffectiveContacts({ points: [pt('p1', 'A', 'phone', '509-555-0100'), pt('p2', 'B', 'phone', '509-555-9999')], links: [], govById: new Map() });
    const { clusters } = buildClusters({ locations: [loc('A'), loc('B')], contacts });
    expect(clusters).toHaveLength(0);
  });
  it('treats a phone shared by >50 entities as infrastructure', () => {
    const points = [], locations = [];
    for (let i = 0; i < 51; i++) { points.push(pt('p' + i, 'E' + i, 'phone', '800-555-0100')); locations.push(loc('E' + i)); }
    const contacts = buildEffectiveContacts({ points, links: [], govById: new Map() });
    const { clusters } = buildClusters({ locations, contacts });
    expect(clusters).toHaveLength(0);
  });
  it('uses gov-synthesized contacts from anchor links', () => {
    const govById = new Map([['off1', { phone_raw: '509-555-0100', email: null, url: null }], ['off2', { phone_raw: '(509) 555-0100', email: null, url: null }]]);
    const contacts = buildEffectiveContacts({ points: [], links: [{ resource_entity_id: 'A', office_id: 'off1' }, { resource_entity_id: 'B', office_id: 'off2' }], govById });
    const { clusters } = buildClusters({ locations: [loc('A'), loc('B')], contacts });
    expect(clusters).toHaveLength(1);
  });
  it('chains transitively', () => {
    const points = [pt('p1', 'A', 'phone', '509-555-0100'), pt('p2', 'B', 'phone', '509-555-0100'),
      pt('p3', 'B', 'email', 'x@a.org'), pt('p4', 'C', 'email', 'x@a.org')];
    const contacts = buildEffectiveContacts({ points, links: [], govById: new Map() });
    const { clusters } = buildClusters({ locations: [loc('A'), loc('B'), loc('C')], contacts });
    expect(clusters).toHaveLength(1);
    expect(clusters[0].memberIds).toEqual(['A', 'B', 'C']);
  });
});

function makeCtx(entities, points, locations, resolutionsByPoint = new Map(), resolutionsById = new Map()) {
  const entityById = new Map(entities.map((e) => [e.resource_entity_id, e]));
  const pointsByEntity = new Map(), locationsByEntity = new Map();
  for (const p of points) { if (!pointsByEntity.has(p.resource_entity_id)) pointsByEntity.set(p.resource_entity_id, []); pointsByEntity.get(p.resource_entity_id).push(p); }
  for (const l of locations) { if (!locationsByEntity.has(l.resource_entity_id)) locationsByEntity.set(l.resource_entity_id, []); locationsByEntity.get(l.resource_entity_id).push(l); }
  const contacts = buildEffectiveContacts({ points, links: [], govById: new Map() });
  const geoEntityIds = new Set(locations.filter((l) => l.latitude != null).map((l) => l.resource_entity_id));
  return { entityById, pointsByEntity, locationsByEntity, anchorsByEntity: new Map(), contacts, geoEntityIds, inactiveIds: new Set(), resolutionsByPoint, resolutionsById };
}
const ent = (id, over = {}) => ({ resource_entity_id: id, resource_name: id, source_table: 'catalog_site_projection_v1', resource_category: null, service_categories: [], description: null, eligibility_summary: null, apply_notes: null, ...over });

describe('pickSurvivor + planCluster', () => {
  it('prefers the record with a real description', () => {
    const ctx = makeCtx([ent('A'), ent('B', { description: 'A real description that is longer than forty characters for sure.' })], [], [loc('A'), loc('B')]);
    expect(pickSurvivor(['A', 'B'], ctx)).toBe('B');
  });
  it('dedupes identical contact points and moves distinct ones', () => {
    const points = [pt('p1', 'A', 'phone', '509-555-0100'), pt('p2', 'B', 'phone', '(509) 555-0100'), pt('p3', 'B', 'email', 'help@a.org')];
    const ctx = makeCtx([ent('A', { description: 'A real description that is longer than forty characters for sure.' }), ent('B')], points, [loc('A'), loc('B')]);
    const plan = planCluster({ memberIds: ['A', 'B'], edges: [{ a: 'A', b: 'B', via: ['phone'] }] }, ctx);
    expect(plan.survivor).toBe('A');
    expect(plan.absorbed[0].delete_points.map((p) => p.contact_point_id)).toEqual(['p2']);
    expect(plan.absorbed[0].move_points).toEqual(['p3']);
  });
  it('fills empty survivor fields from the absorbed record', () => {
    const ctx = makeCtx([
      ent('A', { description: 'A real description that is longer than forty characters for sure.' }),
      ent('B', { eligibility_summary: 'Open to all residents.', resource_category: 'housing', service_categories: ['shelter'] }),
    ], [], [loc('A'), loc('B')]);
    const plan = planCluster({ memberIds: ['A', 'B'], edges: [] }, ctx);
    expect(plan.fills.eligibility_summary).toBe('Open to all residents.');
    expect(plan.fills.resource_category).toBe('housing');
    expect(plan.fills.service_categories).toEqual(['shelter']);
    expect(plan.survivor_prior.eligibility_summary).toBe(null);
  });
  it('holds oversized clusters and clusters with inactive members', () => {
    const ids = Array.from({ length: 11 }, (_, i) => 'E' + i);
    const ctx = makeCtx(ids.map((id) => ent(id)), [], ids.map((id) => loc(id)));
    expect(planCluster({ memberIds: ids, edges: [] }, ctx).hold).toBe('cluster_too_large');
    const ctx2 = makeCtx([ent('A'), ent('B')], [], [loc('A'), loc('B')]);
    ctx2.inactiveIds.add('B');
    expect(planCluster({ memberIds: ['A', 'B'], edges: [] }, ctx2).hold).toBe('member_inactive');
  });
  it('swaps a coordinate-less survivor location for the geocoded twin', () => {
    const locations = [loc('A'), loc('B', '100 Main St', 'Yakima', 'WA', 46.6, -120.5)];
    const ctx = makeCtx([ent('A', { description: 'A real description that is longer than forty characters for sure.' }), ent('B')], [], locations);
    const plan = planCluster({ memberIds: ['A', 'B'], edges: [] }, ctx);
    expect(plan.absorbed[0].move_locations).toEqual(['loc_B']);
    expect(plan.absorbed[0].delete_locations.map((l) => l.location_id)).toEqual(['loc_A']);
  });
});

describe('reviewed contact values (Codex P1)', () => {
  it('does not delete an absorbed point whose replace resolution makes it distinct', () => {
    const points = [pt('p1', 'A', 'phone', '509-555-0100'), pt('p2', 'B', 'phone', '509-555-0100')];
    const res = new Map([['p2', { contact_point_id: 'p2', resource_entity_id: 'B', resolution_action: 'replace', replacement_contact_type: 'phone', replacement_contact_value: '509-555-7777' }]]);
    const ctx = makeCtx([ent('A', { description: 'A real description that is longer than forty characters for sure.' }), ent('B')], points, [loc('A'), loc('B')], res);
    const plan = planCluster({ memberIds: ['A', 'B'], edges: [{ a: 'A', b: 'B', via: ['phone'] }] }, ctx);
    expect(plan.absorbed[0].delete_points).toHaveLength(0);
    expect(plan.absorbed[0].move_points).toEqual(['p2']);
  });
  it('moves a usable absorbed point when the survivor twin is suppressed', () => {
    const points = [pt('p1', 'A', 'phone', '509-555-0100'), pt('p2', 'B', 'phone', '509-555-0100')];
    const res = new Map([['p1', { contact_point_id: 'p1', resource_entity_id: 'A', resolution_action: 'suppress', replacement_contact_type: null, replacement_contact_value: null }]]);
    const ctx = makeCtx([ent('A', { description: 'A real description that is longer than forty characters for sure.' }), ent('B')], points, [loc('A'), loc('B')], res);
    const plan = planCluster({ memberIds: ['A', 'B'], edges: [{ a: 'A', b: 'B', via: ['phone'] }] }, ctx);
    expect(plan.absorbed[0].delete_points).toHaveLength(0);
    expect(plan.absorbed[0].move_points).toEqual(['p2']);
  });
});

describe('category membership union (Codex P2)', () => {
  it('carries the absorbed primary category into survivor memberships', () => {
    const ctx = makeCtx([
      ent('A', { description: 'A real description that is longer than forty characters for sure.', resource_category: 'housing' }),
      ent('B', { resource_category: 'food_nutrition' }),
    ], [], [loc('A'), loc('B')]);
    const plan = planCluster({ memberIds: ['A', 'B'], edges: [] }, ctx);
    expect(plan.fills.service_categories).toEqual(['food_nutrition']);
    expect(plan.fills.resource_category).toBeUndefined();
  });
  it('snapshots the absorbed record prior publication resolution into the plan', () => {
    const priorRes = new Map([['B', { resource_entity_id: 'B', publication_status: 'active', source_reference: 'review_2026', review_note: 'keep', review_version: 'v9', reviewed_at: '2026-01-01', updated_at: '2026-01-01' }]]);
    const ctx = makeCtx([ent('A', { description: 'A real description that is longer than forty characters for sure.' }), ent('B')], [], [loc('A'), loc('B')], new Map(), priorRes);
    const plan = planCluster({ memberIds: ['A', 'B'], edges: [] }, ctx);
    expect(plan.absorbed[0].prior_resolution.source_reference).toBe('review_2026');
  });
});

describe('survivor visibility guard (Codex P1 round 2)', () => {
  it('keeps a directory-visible record as survivor over a higher-scored malformed name', () => {
    const ctx = makeCtx([
      ent('A', { resource_name: '100 Main Street', description: 'A real description that is longer than forty characters for sure.' }),
      ent('B', { resource_name: 'Community Food Bank' }),
    ], [], [loc('A'), loc('B')]);
    ctx.visibleIds = new Set(['B']);
    expect(pickSurvivor(['A', 'B'], ctx)).toBe('B');
    const plan = planCluster({ memberIds: ['A', 'B'], edges: [] }, ctx);
    expect(plan.survivor).toBe('B');
  });
  it('falls back to scoring when no member is directory-visible', () => {
    const ctx = makeCtx([
      ent('A', { resource_name: '100 Main Street', description: 'A real description that is longer than forty characters for sure.' }),
      ent('B', { resource_name: '200 Oak Avenue' }),
    ], [], [loc('A'), loc('B')]);
    ctx.visibleIds = new Set();
    expect(pickSurvivor(['A', 'B'], ctx)).toBe('A');
  });
});

describe('planManifest', () => {
  it('is stable and membership-sensitive', () => {
    const p1 = [{ cluster_id: 'dmc_x', survivor: 'A', absorbed: [{ entity_id: 'B' }] }];
    const p2 = [{ cluster_id: 'dmc_x', survivor: 'A', absorbed: [{ entity_id: 'C' }] }];
    expect(planManifest(p1)).toBe(planManifest(p1.map((x) => ({ ...x }))));
    expect(planManifest(p1)).not.toBe(planManifest(p2));
    expect(clusterIdFor(['B', 'A'])).toBe(clusterIdFor(['A', 'B']));
  });
});

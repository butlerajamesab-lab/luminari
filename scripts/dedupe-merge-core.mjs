// Dedupe merge core: pure planning logic for the duplicate-merge pass.
// Correlation rule (Alexander, 2026-11-15): same normalized address AND
// >=1 shared contact key (phone / email / website domain) over the
// EFFECTIVE contact set (contact points UNION gov_offices-synthesized
// contacts via anchor rows). Phones shared by >50 entities catalog-wide
// are infrastructure, not identity. Clusters >10 are review, not apply.
import { createHash } from 'node:crypto';

export const INFRA_PHONE_MAX = 50;
export const MAX_AUTO_CLUSTER = 10;
export const FAMILY_PRECEDENCE = {
  state_directory_logical_record: 0,
  catalog_site_projection_v1: 1,
  catalog_remainder_projection_v1: 2,
  registry_entity_staging_programs: 3,
  gov_office_projection_v1: 4,
  bundle_decomposition_v1: 5,
};
export const CANONICAL_CATEGORIES = new Set([
  'housing', 'healthcare', 'legal_civil_rights', 'cash_assistance',
  'food_nutrition', 'tribal', 'safety_crisis', 'utilities', 'employment_labor',
]);

export const normAddr = (s) => (s || '').toLowerCase().replace(/[.,#]/g, ' ')
  .replace(/\b(suite|ste|apt|unit|bldg|building|floor|fl|rm|room)\b.*$/, '')
  .replace(/\s+/g, ' ').trim();
export const normPhone = (s) => {
  const d = (s || '').replace(/\D/g, '');
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : (d.length === 10 ? d : null);
};
export const normDomain = (s) => {
  const m = (s || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  return m.includes('.') ? m : null;
};
export const normUrl = (s) => {
  let u = (s || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
  if (u.endsWith('/')) u = u.slice(0, -1);
  return u || null;
};
export const normEmail = (s) => (s || '').toLowerCase().trim() || null;
export const contactKey = (type, value) => {
  if (type === 'phone') return normPhone(value);
  if (type === 'email') return normEmail(value);
  if (type === 'website' || type === 'portal') return normUrl(value);
  return (value || '').trim().toLowerCase() || null;
};
export const addressKeyOf = (loc) => {
  const a = normAddr(loc.address_line1);
  if (!a) return null;
  return a + '|' + (loc.city || '').toLowerCase().trim() + '|' + (loc.state || '');
};

// Build the effective contact map: entityId -> {phone:Set, email:Set, website:Set}
export function buildEffectiveContacts({ points, links, govById }) {
  const contacts = new Map();
  const add = (id, type, key) => {
    if (!key) return;
    if (!contacts.has(id)) contacts.set(id, { phone: new Set(), email: new Set(), website: new Set() });
    contacts.get(id)[type].add(key);
  };
  for (const p of points || []) {
    if (p.contact_type === 'phone') add(p.resource_entity_id, 'phone', normPhone(p.contact_value));
    else if (p.contact_type === 'email') add(p.resource_entity_id, 'email', normEmail(p.contact_value));
    else if (p.contact_type === 'website') add(p.resource_entity_id, 'website', normDomain(p.contact_value));
  }
  for (const l of links || []) {
    const g = govById.get(l.office_id);
    if (!g) continue;
    add(l.resource_entity_id, 'phone', normPhone(g.phone_raw));
    add(l.resource_entity_id, 'email', normEmail(g.email));
    add(l.resource_entity_id, 'website', normDomain(g.url));
  }
  return contacts;
}

// Union-find clustering over address groups. Returns { clusters, heldPairs }
// where clusters = [{ memberIds: [...sorted], edges: [{a,b,via:[...] }] }].
export function buildClusters({ locations, contacts }) {
  const phoneFreq = new Map();
  for (const [, c] of contacts) for (const ph of c.phone) phoneFreq.set(ph, (phoneFreq.get(ph) || 0) + 1);
  const groups = new Map();
  for (const l of locations || []) {
    const k = addressKeyOf(l);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, new Set());
    groups.get(k).add(l.resource_entity_id);
  }
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const edgeMap = new Map();
  for (const [, members] of groups) {
    const arr = [...members];
    if (arr.length < 2) continue;
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const A = contacts.get(arr[i]), B = contacts.get(arr[j]);
      if (!A || !B) continue;
      const via = [];
      if ([...A.phone].some((x) => B.phone.has(x) && (phoneFreq.get(x) || 0) <= INFRA_PHONE_MAX)) via.push('phone');
      if ([...A.email].some((x) => B.email.has(x))) via.push('email');
      if ([...A.website].some((x) => B.website.has(x))) via.push('website');
      if (via.length) {
        union(arr[i], arr[j]);
        edgeMap.set([arr[i], arr[j]].sort().join('~'), { a: arr[i], b: arr[j], via });
      }
    }
  }
  const byRoot = new Map();
  for (const id of parent.keys()) {
    const r = find(id);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r).push(id);
  }
  const clusters = [];
  for (const memberIds of byRoot.values()) {
    if (memberIds.length < 2) continue;
    memberIds.sort();
    const inCluster = new Set(memberIds);
    const edges = [...edgeMap.values()].filter((e) => inCluster.has(e.a) && inCluster.has(e.b));
    clusters.push({ memberIds, edges });
  }
  clusters.sort((x, y) => (x.memberIds[0] < y.memberIds[0] ? -1 : 1));
  return { clusters };
}

export function clusterIdFor(memberIds) {
  return 'dmc_' + createHash('sha256').update([...memberIds].sort().join('|')).digest('hex').slice(0, 16);
}

export function survivorScore(entity, ctx) {
  const c = ctx.contacts.get(entity.resource_entity_id);
  const n = c ? c.phone.size + c.email.size + c.website.size : 0;
  return (entity.description && entity.description.trim().length > 40 ? 4 : 0)
    + (ctx.geoEntityIds.has(entity.resource_entity_id) ? 2 : 0)
    + ((entity.eligibility_summary || entity.apply_notes) ? 1 : 0)
    + Math.min(n, 3);
}

export function pickSurvivor(memberIds, ctx) {
  const scored = memberIds.map((id) => ({
    id,
    score: survivorScore(ctx.entityById.get(id), ctx),
    fam: FAMILY_PRECEDENCE[ctx.entityById.get(id).source_table] ?? 9,
  }));
  scored.sort((x, y) => (y.score - x.score) || (x.fam - y.fam) || (x.id < y.id ? -1 : 1));
  return scored[0].id;
}

// Plan one cluster's merge. ctx carries live rows:
// entityById, pointsByEntity, locationsByEntity, anchorsByEntity (office_ids),
// inactiveIds (publication-inactive entities — any presence holds the cluster).
export function planCluster(cluster, ctx) {
  const cluster_id = clusterIdFor(cluster.memberIds);
  if (cluster.memberIds.length > MAX_AUTO_CLUSTER) return { cluster_id, hold: 'cluster_too_large', size: cluster.memberIds.length };
  const inactive = cluster.memberIds.filter((id) => ctx.inactiveIds.has(id));
  if (inactive.length) return { cluster_id, hold: 'member_inactive', inactive };
  const survivor = pickSurvivor(cluster.memberIds, ctx);
  const surv = ctx.entityById.get(survivor);
  const absorbedIds = cluster.memberIds.filter((id) => id !== survivor);
  // order absorbed by score desc for field-fill priority
  absorbedIds.sort((a, b) => survivorScore(ctx.entityById.get(b), ctx) - survivorScore(ctx.entityById.get(a), ctx));
  // survivor contact keys by type
  const survKeys = new Map();
  for (const p of ctx.pointsByEntity.get(survivor) || []) {
    const k = contactKey(p.contact_type, p.contact_value);
    if (k) survKeys.set(p.contact_type + '|' + k, p.contact_point_id);
  }
  const survLocKeys = new Map();
  for (const l of ctx.locationsByEntity.get(survivor) || []) {
    const k = addressKeyOf(l);
    if (k) survLocKeys.set(k, l);
  }
  const absorbed = [];
  for (const id of absorbedIds) {
    const move_points = [], delete_points = [];
    for (const p of ctx.pointsByEntity.get(id) || []) {
      const k = contactKey(p.contact_type, p.contact_value);
      const key = p.contact_type + '|' + k;
      if (k && survKeys.has(key)) delete_points.push(p);
      else { move_points.push(p.contact_point_id); if (k) survKeys.set(key, p.contact_point_id); }
    }
    const move_locations = [], delete_locations = [];
    for (const l of ctx.locationsByEntity.get(id) || []) {
      const k = addressKeyOf(l);
      const existing = k ? survLocKeys.get(k) : null;
      if (existing) {
        // keep the geocoded row; if survivor's twin lacks coords and this one has them, swap
        if (existing.latitude == null && l.latitude != null) { delete_locations.push(existing); move_locations.push(l.location_id); survLocKeys.set(k, l); }
        else delete_locations.push(l);
      } else { move_locations.push(l.location_id); if (k) survLocKeys.set(k, l); }
    }
    absorbed.push({
      entity_id: id,
      move_points, delete_points,
      move_locations, delete_locations,
      move_anchors: ctx.anchorsByEntity.get(id) || [],
    });
  }
  // field fills on the survivor
  const fills = {};
  const prior = {};
  for (const field of ['description', 'eligibility_summary', 'apply_notes']) {
    if (!surv[field] || !String(surv[field]).trim()) {
      const donor = absorbedIds.map((id) => ctx.entityById.get(id)).find((e) => e[field] && String(e[field]).trim());
      if (donor) { fills[field] = donor[field]; prior[field] = surv[field] ?? null; }
    }
  }
  if (!surv.resource_category) {
    const donors = absorbedIds.map((id) => ctx.entityById.get(id)).filter((e) => e.resource_category);
    const canonical = donors.find((e) => CANONICAL_CATEGORIES.has(e.resource_category));
    const donor = canonical || donors[0];
    if (donor) { fills.resource_category = donor.resource_category; prior.resource_category = null; }
  }
  const serviceUnion = new Set(surv.service_categories || []);
  for (const id of absorbedIds) for (const c of ctx.entityById.get(id).service_categories || []) serviceUnion.add(c);
  if (serviceUnion.size !== (surv.service_categories || []).length) {
    fills.service_categories = [...serviceUnion].sort();
    prior.service_categories = surv.service_categories || [];
  }
  return {
    cluster_id,
    survivor,
    absorbed,
    fills,
    survivor_prior: prior,
    evidence: cluster.edges,
    member_count: cluster.memberIds.length,
  };
}

export function planManifest(plans) {
  const canonical = plans
    .filter((p) => !p.hold)
    .map((p) => ({ c: p.cluster_id, s: p.survivor, a: p.absorbed.map((x) => x.entity_id).sort() }))
    .sort((x, y) => (x.c < y.c ? -1 : 1));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

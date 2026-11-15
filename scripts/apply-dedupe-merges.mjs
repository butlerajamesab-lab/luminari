// Dedupe merge runner. Dry run by default; --apply requires
// --expected-manifest equal to the recomputed plan manifest.
// One transaction for the whole apply: ledger-first per absorbed
// entity, counts verified in-transaction, commit only on exact match.
import pg from 'pg';
import { readFileSync } from 'node:fs';
import {
  buildEffectiveContacts, buildClusters, planCluster, planManifest, contactKey, clusterIdFor,
} from './dedupe-merge-core.mjs';

export const BATCH_ID = 'dedupe_merge_v1';
const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const expectedManifest = (process.argv.find((a) => a.startsWith('--expected-manifest=')) || '').split('=')[1] || null;
const rehearseArg = process.argv.find((a) => a.startsWith('--rehearse-entities=')) || null;
const migrationPath = (process.argv.find((a) => a.startsWith('--migration-path=')) || '').split('=')[1] || null;

async function loadState(client) {
  const state0 = {};
  const q = async (sql) => (await client.query(sql)).rows;
  const entities = await q(`select resource_entity_id, resource_name, source_table, resource_category,
    service_categories, description, eligibility_summary, apply_notes from public.luminari_resource_entities`);
  const locations = await q(`select * from public.luminari_resource_locations`);
  const points = await q(`select * from public.luminari_resource_contact_points`);
  const links = await q(`select resource_entity_id, office_id from public.luminari_anchor_office_source_rows`);
  const govs = await q(`select office_id, phone_raw, email, url from public.gov_offices where superseded_by is null`);
  const resolutions = await q(`select * from public.luminari_resource_publication_resolutions`);
  const contactResolutions = await q(`select * from public.luminari_resource_contact_resolutions`);
  state0.resolutionsByPoint = new Map(contactResolutions.map((r) => [r.contact_point_id, r]));
  state0.resolutionsById = new Map(resolutions.map((r) => [r.resource_entity_id, r]));
  const ledger = await client.query(
    `select absorbed_entity_id from public.luminari_dedupe_merges where batch_id = $1`, [BATCH_ID],
  ).then((r) => r.rows).catch(() => []);
  return { entities, locations, points, links, govs, resolutions, ledger, resolutionsByPoint: state0.resolutionsByPoint, resolutionsById: state0.resolutionsById };
}

export function buildContext(state) {
  state.resolutionsByPoint = state.resolutionsByPoint || new Map();
  state.resolutionsById = state.resolutionsById || new Map();
  const entityById = new Map(state.entities.map((e) => [e.resource_entity_id, e]));
  const pointsByEntity = new Map(), locationsByEntity = new Map(), anchorsByEntity = new Map();
  for (const p of state.points) { if (!pointsByEntity.has(p.resource_entity_id)) pointsByEntity.set(p.resource_entity_id, []); pointsByEntity.get(p.resource_entity_id).push(p); }
  for (const l of state.locations) { if (!locationsByEntity.has(l.resource_entity_id)) locationsByEntity.set(l.resource_entity_id, []); locationsByEntity.get(l.resource_entity_id).push(l); }
  for (const l of state.links) { if (!anchorsByEntity.has(l.resource_entity_id)) anchorsByEntity.set(l.resource_entity_id, []); anchorsByEntity.get(l.resource_entity_id).push(l.office_id); }
  const govById = new Map(state.govs.map((g) => [g.office_id, g]));
  const contacts = buildEffectiveContacts({ points: state.points, links: state.links, govById, resolutionsByPoint: state.resolutionsByPoint });
  const resolutionsById = state.resolutionsById;
  const geoEntityIds = new Set(state.locations.filter((l) => l.latitude != null && l.longitude != null).map((l) => l.resource_entity_id));
  const inactiveIds = new Set(state.resolutions.filter((r) => r.publication_status === 'inactive').map((r) => r.resource_entity_id));
  return { entityById, pointsByEntity, locationsByEntity, anchorsByEntity, contacts, geoEntityIds, inactiveIds, resolutionsByPoint: state.resolutionsByPoint, resolutionsById };
}

export function buildPlan(state) {
  const ctx = buildContext(state);
  const { clusters } = buildClusters({ locations: state.locations, contacts: ctx.contacts });
  const alreadyAbsorbed = new Set((state.ledger || []).map((r) => r.absorbed_entity_id));
  const plans = [], holds = [], already = [];
  for (const cluster of clusters) {
    if (cluster.memberIds.every((id) => id !== undefined) && cluster.memberIds.some((id) => alreadyAbsorbed.has(id))) {
      // a cluster touched by a prior apply of this batch: skip whole cluster
      const survivorGuess = cluster.memberIds.find((id) => !alreadyAbsorbed.has(id));
      if (cluster.memberIds.filter((id) => alreadyAbsorbed.has(id)).length === cluster.memberIds.length - (survivorGuess ? 1 : 0)) { already.push(cluster); continue; }
    }
    const plan = planCluster(cluster, ctx);
    if (plan.hold) holds.push(plan); else plans.push(plan);
  }
  return { plans, holds, already, manifest: planManifest(plans), ctx };
}

async function applyPlans(client, plans) {
  let absorbedCount = 0, pointsDeleted = 0, locationsDeleted = 0;
  for (const plan of plans) {
    const surv = plan.survivor;
    for (const ab of plan.absorbed) {
      const deletedPointRows = ab.delete_points;
      const deletedPointIds = deletedPointRows.map((p) => p.contact_point_id);
      const deletedResolutions = deletedPointIds.length
        ? (await client.query(`select * from public.luminari_resource_contact_resolutions where contact_point_id = any($1)`, [deletedPointIds])).rows : [];
      const moved = {
        points_moved: ab.move_points,
        points_deleted: deletedPointRows,
        point_resolutions_deleted: deletedResolutions,
        locations_moved: ab.move_locations,
        locations_deleted: ab.delete_locations,
        anchors_moved: ab.move_anchors,
        survivor_prior: plan.survivor_prior,
        prior_publication_resolution: ab.prior_resolution ?? null,
      };
      await client.query(
        `insert into public.luminari_dedupe_merges (batch_id, cluster_id, survivor_entity_id, absorbed_entity_id, evidence, moved)
         values ($1,$2,$3,$4,$5,$6)`,
        [BATCH_ID, plan.cluster_id, surv, ab.entity_id, JSON.stringify(plan.evidence), JSON.stringify(moved)]);
      if (ab.move_points.length) {
        await client.query(`update public.luminari_resource_contact_points set resource_entity_id = $1 where contact_point_id = any($2)`, [surv, ab.move_points]);
        await client.query(`update public.luminari_resource_contact_resolutions set resource_entity_id = $1 where contact_point_id = any($2)`, [surv, ab.move_points]);
      }
      if (deletedPointIds.length) {
        await client.query(`delete from public.luminari_resource_contact_resolutions where contact_point_id = any($1)`, [deletedPointIds]);
        await client.query(`delete from public.luminari_resource_contact_points where contact_point_id = any($1)`, [deletedPointIds]);
        pointsDeleted += deletedPointIds.length;
      }
      if (ab.move_locations.length) {
        await client.query(`update public.luminari_resource_locations set resource_entity_id = $1 where location_id = any($2)`, [surv, ab.move_locations]);
      }
      if (ab.delete_locations.length) {
        const ids = ab.delete_locations.map((l) => l.location_id);
        await client.query(`delete from public.luminari_resource_locations where location_id = any($1)`, [ids]);
        locationsDeleted += ids.length;
      }
      if (ab.move_anchors.length) {
        await client.query(`update public.luminari_anchor_office_source_rows set resource_entity_id = $1 where office_id = any($2)`, [surv, ab.move_anchors]);
      }
      await client.query(
        `insert into public.luminari_resource_publication_resolutions
           (resource_entity_id, publication_status, source_reference, review_note, review_version, reviewed_at, updated_at)
         values ($1, 'inactive', $2, $3, 'dedupe_merge_v1', now(), now())
         on conflict (resource_entity_id) do update set publication_status = 'inactive',
           source_reference = excluded.source_reference, review_note = excluded.review_note,
           review_version = excluded.review_version, reviewed_at = now(), updated_at = now()`,
        [ab.entity_id, 'dedupe_merge_v1:' + plan.cluster_id, 'Merged into ' + surv + ' — dedupe_merge_v1']);
      absorbedCount++;
    }
    // survivor field fills
    const fillKeys = Object.keys(plan.fills || {});
    if (fillKeys.length) {
      const sets = fillKeys.map((k, i) => `${k} = $${i + 1}`).join(', ');
      await client.query(`update public.luminari_resource_entities set ${sets} where resource_entity_id = $${fillKeys.length + 1}`,
        [...fillKeys.map((k) => plan.fills[k]), surv]);
    }
    // primary repair: exactly one primary per contact type on the survivor
    const survPoints = (await client.query(
      `select contact_point_id, contact_type, is_primary, created_at from public.luminari_resource_contact_points
        where resource_entity_id = $1 order by created_at, contact_point_id`, [surv])).rows;
    const byType = new Map();
    for (const p of survPoints) { if (!byType.has(p.contact_type)) byType.set(p.contact_type, []); byType.get(p.contact_type).push(p); }
    for (const [, rows] of byType) {
      const primaries = rows.filter((r) => r.is_primary);
      if (primaries.length === 0 && rows.length) {
        await client.query(`update public.luminari_resource_contact_points set is_primary = true where contact_point_id = $1`, [rows[0].contact_point_id]);
      } else if (primaries.length > 1) {
        for (const extra of primaries.slice(1)) {
          await client.query(`update public.luminari_resource_contact_points set is_primary = false where contact_point_id = $1`, [extra.contact_point_id]);
        }
      }
    }
  }
  return { absorbedCount, pointsDeleted, locationsDeleted };
}

// Rehearsal: install the migration + apply ONE named cluster inside a
// transaction, verify in-transaction, then ALWAYS roll back.
async function rehearse(client, memberIds) {
  const cluster_id = clusterIdFor(memberIds);
  await client.query('begin');
  try {
    if (migrationPath) await client.query(readFileSync(migrationPath, 'utf8'));
    const state = await loadState(client);
    const { plans } = buildPlan(state);
    const plan = plans.find((p) => p.cluster_id === cluster_id);
    if (!plan) throw new Error('cluster ' + cluster_id + ' is not in the auto-apply plan');
    const result = await applyPlans(client, [plan]);
    const ledgerRows = (await client.query(
      `select count(*)::int as n from public.luminari_dedupe_merges where batch_id = $1 and cluster_id = $2`, [BATCH_ID, cluster_id])).rows[0].n;
    const inactive = (await client.query(
      `select count(*)::int as n from public.luminari_resource_publication_resolutions
        where publication_status = 'inactive' and resource_entity_id = any($1)`, [plan.absorbed.map((a) => a.entity_id)])).rows[0].n;
    const survPoints = (await client.query(
      `select contact_type, contact_value from public.luminari_resource_contact_points where resource_entity_id = $1`, [plan.survivor])).rows;
    const survKeys = new Set(survPoints.map((p) => p.contact_type + '|' + contactKey(p.contact_type, p.contact_value)));
    console.log(JSON.stringify({
      REHEARSAL: 'in-transaction state before rollback',
      cluster_id, survivor: plan.survivor,
      absorbed_applied: result.absorbedCount, ledger_rows: ledgerRows,
      absorbed_inactive: inactive, survivor_contact_keys: [...survKeys].sort(),
      points_deleted: result.pointsDeleted, locations_deleted: result.locationsDeleted,
    }));
    if (result.absorbedCount !== plan.absorbed.length || ledgerRows !== plan.absorbed.length || inactive !== plan.absorbed.length) {
      throw new Error('rehearsal count mismatch');
    }
  } finally {
    await client.query('rollback');
  }
  // post-rollback proof: nothing persisted
  const ledgerExists = (await client.query(
    `select to_regclass('public.luminari_dedupe_merges') as t`)).rows[0].t;
  const resolutions = (await client.query(
    `select count(*)::int as n from public.luminari_resource_publication_resolutions where resource_entity_id = any($1)`,
    [memberIds])).rows[0].n;
  console.log(JSON.stringify({ REHEARSAL_OK: true, rolled_back: true, ledger_table_after_rollback: ledgerExists, resolution_rows_for_members: resolutions }));
}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    if (rehearseArg) {
      const memberIds = rehearseArg.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean);
      await rehearse(client, memberIds);
      return;
    }
    const state = await loadState(client);
    const { plans, holds, already, manifest } = buildPlan(state);
    const summary = {
      batch: BATCH_ID,
      clusters_planned: plans.length,
      absorbed_planned: plans.reduce((a, p) => a + p.absorbed.length, 0),
      holds: holds.reduce((acc, h) => { acc[h.hold] = (acc[h.hold] || 0) + 1; return acc; }, {}),
      already_applied_clusters: already.length,
      manifest,
    };
    console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', ...summary }));
    if (!APPLY) return;
    if (!expectedManifest || expectedManifest !== manifest) {
      throw new Error('manifest mismatch: --expected-manifest is required and must equal the recomputed manifest');
    }
    await client.query('begin');
    await client.query(`select pg_catalog.pg_advisory_xact_lock($1::integer, $2::integer)`, [20261115, 300000]);
    const result = await applyPlans(client, plans);
    const ledgerCount = (await client.query(`select count(*)::int as n from public.luminari_dedupe_merges where batch_id = $1`, [BATCH_ID])).rows[0].n;
    if (ledgerCount !== result.absorbedCount + (state.ledger ? state.ledger.length : 0)) {
      throw new Error(`ledger count ${ledgerCount} != absorbed ${result.absorbedCount} + prior ${(state.ledger || []).length}`);
    }
    if (result.absorbedCount !== summary.absorbed_planned) {
      throw new Error(`absorbed ${result.absorbedCount} != planned ${summary.absorbed_planned}`);
    }
    await client.query('commit');
    console.log(JSON.stringify({ applied: true, ...result, ledger_rows: ledgerCount }));
  } catch (err) {
    try { await client.query('rollback'); } catch {}
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();

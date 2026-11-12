// Content projection v1 — project the descriptions and contacts
// that sit on catalog entities' own linked source rows onto the
// records themselves.
//
// Why: the content census (luminari-recovery/content-census/
// REPORT.md, 2026-11-11) found that the site / remainder / bundle
// projections minted entities, locations, and categories but never
// copied the text and contacts from the transcribed rows those
// entities are identity-linked to: 95.8% of the catalog served the
// boilerplate fallback blurb and 14,163 entities served zero
// contacts. The person test (Alexander, 2026-11-12) is the
// acceptance standard: a person who knows nothing has to find a
// real resource and trust it — a name and a number is not a
// resource, and neither is a name with no words behind it.
//
// The repair is identity-linked and fidelity-gated (design:
// luminari-recovery/content-repair-c2/DESIGN.md; pure planning in
// scripts/content-projection-core.mjs):
//   - Only an entity's OWN linked transcribed rows contribute —
//     no name matching, no cross-record borrowing, no heuristics.
//   - The fidelity gate mirrors the naming repair (PR #801):
//     DOCX-generation rows (transcriptions of the source documents
//     themselves) and v3_13 rows on FAITHFUL workbook sheets may
//     contribute; the (9) generation never contributes; LOSSY and
//     UNVERIFIABLE sheets never contribute.
//   - Values are shape-validated: NANP extraction for phones
//     (fax-labeled candidates skipped), whole-cell URL/email
//     shapes, markup / 'undefined' / bare-filename rejection for
//     text. Rejected values and gate-held entities are ledgered
//     with their reasons — a named queue, not a silent skip.
//
// Declared rules:
//   - Drift guard: a text field is written only when its CURRENT
//     value is still null/blank at write time (the wave never
//     overwrites); a contact type is minted only for entities
//     that still have no contact point of that type — re-checked
//     INSIDE the write transaction, because the plan was computed
//     minutes earlier against a state that may have moved.
//     Applies are serialized with a transaction-scoped advisory
//     lock so two overlapping runs cannot interleave; the second
//     run's re-check then sees the first run's points and rolls
//     back on drift instead of duplicating them. Counts are
//     verified per kind; any mismatch rolls the transaction back.
//   - Write order: ledger rows into
//     public.luminari_content_projection_repairs FIRST
//     (conflict-guarded), then the entity updates / contact
//     inserts, in one transaction per action kind. The ledger is
//     the receipt and the rollback source.
//   - Manifest: sha256 over the sorted plan lines (text sets,
//     contact mints, held rows, value rejections). The dry run
//     prints it; --apply refuses to proceed unless it is passed
//     back verbatim as --expected-manifest, so what applies is
//     exactly the plan that was reviewed.
//
// Dry run by default; --apply writes.

import { createHash } from "node:crypto";
import process from "node:process";
import {
  REPAIR_VERSION,
  TEXT_FIELDS,
  planEntity,
} from "./content-projection-core.mjs";

function loadPg() {
  return import("pg").catch(() => {
    throw new Error(
      "The 'pg' package is unavailable. Run inside the luminari service environment (Render job) where pg is installed.",
    );
  });
}

export { REPAIR_VERSION };

export const FAMILIES = [
  {
    source_table: "catalog_site_projection_v1",
    link_table: "luminari_catalog_site_source_rows",
    link_key: "site_entity_id",
  },
  {
    source_table: "catalog_remainder_projection_v1",
    link_table: "luminari_catalog_remainder_source_rows",
    link_key: "resource_entity_id",
  },
  {
    source_table: "bundle_decomposition_v1",
    link_table: "luminari_bundle_decomposition_source_rows",
    link_key: "minted_entity_id",
  },
];

const SOURCE_FIELD_BY_TYPE = {
  phone: "phone",
  website: "website_url",
  email: "email",
  portal: "filing_portal_url",
};

// Widened person-facing name test — the corpus filter, mirrored
// from server/services/resource-directory-unified.ts
// (person_facing_name_sql, post PR #810) so the runner repairs
// exactly the records a person can see.
export const CORPUS_NAME_TEST_SQL = `
    and e.resource_name !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and e.resource_name !~* '^[0-9a-f]{24,}$'
    and e.resource_name !~* '^luminari[-_]'
    and e.resource_name !~* '(^|[-_])enriched([-_]|$)'
    and e.resource_name !~ '^[[:space:]]*[0-9]{5}(-[0-9]{4})?[[:space:]]*(—|–|\\||-|[A-Z])'
    and e.resource_name !~ '^[[:space:]]*\\{'
    and e.resource_name !~ '\\[[A-Za-z0-9][A-Za-z0-9.-]*\\]'
    and e.resource_name !~* '(verify remaining fields|—[[:space:]]*verify|\\(verify\\)|not confirmed from|not published for|no dedicated hotline|shortest in|critical:|warning:)'
    and not ( (e.resource_name ~ '^[0-9]{1,6}[[:space:]]' and e.resource_name ~* '(^|[^a-z])(street|avenue|road|boulevard|drive|lane|court|plaza|highway|parkway|circle|terrace|place|trail|square|way)([^a-z]|$)')
              or e.resource_name ~ ',[[:space:]][A-Za-z][A-Za-z ]+[[:space:]][A-Z]{2}[[:space:]][0-9]{5}' )
    and e.resource_name !~ '^[[:space:]]*(1-[0-9]{3}-[A-Z0-9-]+|\\(?[0-9]{3}\\)?[-. ][0-9]{3}[-. ][0-9]{4})'`;

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

// ---------------------------------------------------------------------------
// Ledger row construction (pure; unit-tested)
// ---------------------------------------------------------------------------

export function ledgerRowForTextSet(item, oldValue) {
  return {
    resource_entity_id: item.entity_id,
    repair_kind: "text_set",
    repair_key: `text_set:${item.field}`,
    field_name: item.field,
    old_value: oldValue ?? null,
    new_value: item.new_value,
    rule: item.rule,
    source_civic_object_uid: item.source_civic_object_uid,
    source_artifact_key: item.source_artifact_key,
    source_section_name: item.source_section_name,
    source_value: null,
    repair_version: REPAIR_VERSION,
  };
}

export function ledgerRowForContactMint(item) {
  return {
    resource_entity_id: item.entity_id,
    repair_kind: "contact_mint",
    repair_key: `contact_mint:${item.contact_type}:${item.contact_value}`,
    field_name: item.contact_type,
    old_value: null,
    new_value: item.contact_value,
    rule: item.rule,
    source_civic_object_uid: item.source_civic_object_uid,
    source_artifact_key: item.source_artifact_key,
    source_section_name: item.source_section_name,
    source_value: item.source_value,
    repair_version: REPAIR_VERSION,
  };
}

export function ledgerRowForHeld(item) {
  return {
    resource_entity_id: item.entity_id,
    repair_kind: "held",
    repair_key: "held",
    field_name: "",
    old_value: null,
    new_value: null,
    rule: item.rule,
    source_civic_object_uid: null,
    source_artifact_key: null,
    source_section_name: null,
    source_value: null,
    repair_version: REPAIR_VERSION,
  };
}

export function ledgerRowForRejection(item) {
  return {
    resource_entity_id: item.entity_id,
    repair_kind: "value_rejected",
    repair_key: `value_rejected:${item.field}:${sha256(item.source_value ?? "").slice(0, 16)}`,
    field_name: item.field,
    old_value: null,
    new_value: null,
    rule: item.rule,
    source_civic_object_uid: item.source_civic_object_uid,
    source_artifact_key: item.source_artifact_key,
    source_section_name: item.source_section_name,
    source_value: item.source_value,
    repair_version: REPAIR_VERSION,
  };
}

/** sha256 over the sorted plan lines — the reviewed-plan pin. */
export function manifestFor(plan) {
  const lines = [
    ...(plan.textSets ?? []).map(
      (t) => `text_set|${t.entity_id}|${t.field}|${sha256(t.new_value)}`,
    ),
    ...(plan.contactMints ?? []).map(
      (m) => `contact_mint|${m.entity_id}|${m.contact_type}|${m.contact_value}`,
    ),
    ...(plan.helds ?? []).map((h) => `held|${h.entity_id}|${h.rule}`),
    ...(plan.rejections ?? []).map(
      (r) =>
        `value_rejected|${r.entity_id}|${r.field}|${r.rule}|${sha256(r.source_value ?? "").slice(0, 16)}`,
    ),
  ].sort();
  return sha256(lines.join("\n"));
}

export function summarizePlan(plan, scopeCount) {
  const byType = {};
  for (const m of plan.contactMints ?? []) {
    byType[m.contact_type] = (byType[m.contact_type] ?? 0) + 1;
  }
  const heldByRule = {};
  for (const h of plan.helds ?? []) heldByRule[h.rule] = (heldByRule[h.rule] ?? 0) + 1;
  const rejectedByRule = {};
  for (const r of plan.rejections ?? []) {
    rejectedByRule[r.rule] = (rejectedByRule[r.rule] ?? 0) + 1;
  }
  return {
    repair_version: REPAIR_VERSION,
    entities_in_scope: scopeCount,
    entities_with_text: new Set((plan.textSets ?? []).map((t) => t.entity_id)).size,
    text_fields_set: (plan.textSets ?? []).length,
    entities_with_contacts: new Set((plan.contactMints ?? []).map((m) => m.entity_id)).size,
    contact_points_minted: (plan.contactMints ?? []).length,
    contact_points_by_type: byType,
    held_entities: (plan.helds ?? []).length,
    held_by_rule: heldByRule,
    rejected_values: (plan.rejections ?? []).length,
    rejected_by_rule: rejectedByRule,
  };
}

// ---------------------------------------------------------------------------
// Write-path builders (pure; unit-tested)
// ---------------------------------------------------------------------------

export const LEDGER_COLUMNS = [
  "resource_entity_id",
  "repair_kind",
  "repair_key",
  "field_name",
  "old_value",
  "new_value",
  "rule",
  "source_civic_object_uid",
  "source_artifact_key",
  "source_section_name",
  "source_value",
  "repair_version",
];

export function buildLedgerInsert(rows) {
  if (!rows || rows.length === 0) return null;
  const values = [];
  const params = [];
  rows.forEach((r, i) => {
    const b = i * LEDGER_COLUMNS.length;
    values.push(
      `($${b + 1}::uuid,$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12})`,
    );
    params.push(
      r.resource_entity_id, r.repair_kind, r.repair_key, r.field_name,
      r.old_value, r.new_value, r.rule, r.source_civic_object_uid,
      r.source_artifact_key, r.source_section_name, r.source_value,
      r.repair_version,
    );
  });
  const text = `
    insert into public.luminari_content_projection_repairs
       (${LEDGER_COLUMNS.join(", ")})
     values ${values.join(",")}
     on conflict (resource_entity_id, repair_key) do nothing`;
  return { text, params };
}

/**
 * Text update for one field; the WHERE clause re-checks the drift
 * guard at write time (only a still-blank field is written). The
 * field name comes only from TEXT_FIELDS, never from plan data.
 */
export function buildTextUpdate(field, rows) {
  if (!TEXT_FIELDS.includes(field)) {
    throw new Error(`field ${field} is not a projectable text field`);
  }
  if (!rows || rows.length === 0) return null;
  const values = [];
  const params = [];
  rows.forEach((r, i) => {
    const b = i * 2;
    values.push(`($${b + 1}::uuid,$${b + 2})`);
    params.push(r.entity_id, r.new_value);
  });
  const text = `
    update public.luminari_resource_entities e
       set ${field} = v.new_value
      from (values ${values.join(",")})
        as v(resource_entity_id, new_value)
     where e.resource_entity_id = v.resource_entity_id
       and coalesce(btrim(e.${field}), '') = ''`;
  return { text, params };
}

/** Contact point insert, in the shape the current view serves. */
export function buildContactInsert(rows, entityCanonicalIds) {
  if (!rows || rows.length === 0) return null;
  const columns = [
    "resource_entity_id", "canonical_id", "contact_type", "contact_value",
    "label", "is_primary", "contact_quality", "source_table", "source_pk",
    "source_hash", "metadata",
  ];
  const values = [];
  const params = [];
  rows.forEach((r, i) => {
    const b = i * columns.length;
    values.push(
      `($${b + 1}::uuid,$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11}::jsonb)`,
    );
    params.push(
      r.entity_id,
      entityCanonicalIds?.get(r.entity_id) ?? null,
      r.contact_type,
      r.contact_value,
      r.label,
      r.is_primary,
      "source_attached",
      "v_lighthouse_resource_program_transcribed_v1",
      r.source_civic_object_uid,
      r.source_content_sha256,
      JSON.stringify({
        repair_version: REPAIR_VERSION,
        artifact_key: r.source_artifact_key,
        section_name: r.source_section_name,
        source_field: SOURCE_FIELD_BY_TYPE[r.contact_type] ?? null,
      }),
    );
  });
  const text = `
    insert into public.luminari_resource_contact_points
       (${columns.join(", ")})
     values ${values.join(",")}`;
  return { text, params };
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// Loading + planning
// ---------------------------------------------------------------------------

async function loadScope(client) {
  const res = await client.query(
    `select e.resource_entity_id, e.source_table, e.canonical_id,
            e.description, e.eligibility_summary, e.apply_notes
       from public.luminari_resource_entities e
       left join public.luminari_resource_publication_resolutions p
         on p.resource_entity_id = e.resource_entity_id
      where coalesce(p.publication_status, 'active') <> 'inactive'
        and e.source_table = any($1::text[])
        and e.resource_name is not null and btrim(e.resource_name) <> ''
        ${CORPUS_NAME_TEST_SQL}`,
    [FAMILIES.map((f) => f.source_table)],
  );
  return res.rows;
}

async function loadLinkedRows(client, family, entityIds) {
  const rows = [];
  for (const batch of chunk(entityIds, 500)) {
    const res = await client.query(
      `select l.${family.link_key} as resource_entity_id,
              v.civic_object_uid, v.artifact_key, v.section_name,
              v.source_locator, v.source_content_sha256,
              v.description, v.eligibility_summary, v.apply_notes,
              v.phone, v.website_url, v.email, v.filing_portal_url
         from public.${family.link_table} l
         join public.v_lighthouse_resource_program_transcribed_v1 v
           on v.civic_object_uid = l.civic_object_uid
        where l.${family.link_key} = any($1::uuid[])`,
      [batch],
    );
    rows.push(...res.rows);
  }
  return rows;
}

async function loadExistingTypes(client, entityIds) {
  const byEntity = new Map();
  for (const batch of chunk(entityIds, 500)) {
    const res = await client.query(
      `select resource_entity_id, contact_type
         from public.luminari_resource_contact_points
        where resource_entity_id = any($1::uuid[])
        group by 1, 2`,
      [batch],
    );
    for (const row of res.rows) {
      const set = byEntity.get(row.resource_entity_id) ?? new Set();
      set.add(row.contact_type);
      byEntity.set(row.resource_entity_id, set);
    }
  }
  return byEntity;
}

async function buildPlan(client) {
  const scope = await loadScope(client);
  const byFamily = new Map(FAMILIES.map((f) => [f.source_table, []]));
  for (const e of scope) byFamily.get(e.source_table)?.push(e);

  const plan = { textSets: [], contactMints: [], helds: [], rejections: [] };
  const entityById = new Map(scope.map((e) => [e.resource_entity_id, e]));

  for (const family of FAMILIES) {
    const entities = byFamily.get(family.source_table) ?? [];
    if (entities.length === 0) continue;
    const ids = entities.map((e) => e.resource_entity_id);
    const linked = await loadLinkedRows(client, family, ids);
    const existingTypes = await loadExistingTypes(client, ids);
    const rowsByEntity = new Map();
    for (const row of linked) {
      const list = rowsByEntity.get(row.resource_entity_id) ?? [];
      list.push(row);
      rowsByEntity.set(row.resource_entity_id, list);
    }
    for (const e of entities) {
      const result = planEntity(
        e,
        rowsByEntity.get(e.resource_entity_id) ?? [],
        existingTypes.get(e.resource_entity_id) ?? [],
      );
      plan.textSets.push(...result.textSets);
      plan.contactMints.push(...result.contactMints);
      if (result.held) plan.helds.push(result.held);
      plan.rejections.push(...result.rejections);
    }
  }
  return { plan, scope, entityById };
}

// ---------------------------------------------------------------------------
// Apply serialization + drift recheck (pure parts unit-tested)
// ---------------------------------------------------------------------------

/** Advisory-lock keys serializing concurrent applies of this repair. */
export const APPLY_LOCK_KEY_1 = 20261112;
export const APPLY_LOCK_KEY_2 = 270000;

/** Take the apply lock for the current transaction (released at commit/rollback). */
export async function acquireApplyLock(client) {
  await client.query("select pg_advisory_xact_lock($1, $2)", [
    APPLY_LOCK_KEY_1,
    APPLY_LOCK_KEY_2,
  ]);
}

/**
 * Planned contact mints whose entity has SINCE gained a contact
 * point of the same type (a concurrent apply or another writer
 * landed first). Any drift aborts the contact transaction: the
 * plan was computed against a state that no longer holds, and
 * inserting anyway would serve duplicate points — the contact
 * table carries no entity/type/value uniqueness constraint.
 */
export function contactDrift(contactMints, existingTypesByEntity) {
  const drift = [];
  for (const m of contactMints ?? []) {
    const existing = existingTypesByEntity?.get(m.entity_id);
    if (existing && existing.has(m.contact_type)) {
      drift.push({ entity_id: m.entity_id, contact_type: m.contact_type });
    }
  }
  return drift;
}

// ---------------------------------------------------------------------------
// Apply (one transaction per action kind; ledger first)
// ---------------------------------------------------------------------------

async function applyTextSets(client, textSets, entityById) {
  let ledger = 0;
  let updated = 0;
  await client.query("begin");
  try {
    await acquireApplyLock(client);
    const ledgerRows = textSets.map((t) =>
      ledgerRowForTextSet(t, entityById.get(t.entity_id)?.[t.field] ?? null),
    );
    for (const batch of chunk(ledgerRows, 500)) {
      const built = buildLedgerInsert(batch);
      ledger += (await client.query(built.text, built.params)).rowCount;
    }
    for (const field of TEXT_FIELDS) {
      const fieldRows = textSets.filter((t) => t.field === field);
      for (const batch of chunk(fieldRows, 500)) {
        const built = buildTextUpdate(field, batch);
        updated += (await client.query(built.text, built.params)).rowCount;
      }
    }
    if (updated !== textSets.length) {
      throw new Error(
        `text sets: updated ${updated} of ${textSets.length} planned fields — a value changed between planning and writing; transaction rolled back`,
      );
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
  return { ledger, updated };
}

async function applyContactMints(client, contactMints, entityById) {
  let ledger = 0;
  let inserted = 0;
  await client.query("begin");
  try {
    await acquireApplyLock(client);
    const drift = contactDrift(
      contactMints,
      await loadExistingTypes(
        client,
        [...new Set(contactMints.map((m) => m.entity_id))],
      ),
    );
    if (drift.length) {
      throw new Error(
        `contact mints: ${drift.length} planned point(s) drifted — an entity already has that contact type at write time (first: ${drift[0].entity_id} / ${drift[0].contact_type}); a concurrent writer landed first; transaction rolled back`,
      );
    }
    for (const batch of chunk(contactMints.map(ledgerRowForContactMint), 500)) {
      const built = buildLedgerInsert(batch);
      ledger += (await client.query(built.text, built.params)).rowCount;
    }
    const canonicalIds = new Map(
      [...entityById.entries()].map(([id, e]) => [id, e.canonical_id]),
    );
    for (const batch of chunk(contactMints, 500)) {
      const built = buildContactInsert(batch, canonicalIds);
      inserted += (await client.query(built.text, built.params)).rowCount;
    }
    if (inserted !== contactMints.length) {
      throw new Error(
        `contact mints: inserted ${inserted} of ${contactMints.length} planned points; transaction rolled back`,
      );
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
  return { ledger, inserted };
}

async function applyRecords(client, helds, rejections) {
  let ledger = 0;
  await client.query("begin");
  try {
    await acquireApplyLock(client);
    const rows = [
      ...helds.map(ledgerRowForHeld),
      ...rejections.map(ledgerRowForRejection),
    ];
    for (const batch of chunk(rows, 500)) {
      const built = buildLedgerInsert(batch);
      if (built) ledger += (await client.query(built.text, built.params)).rowCount;
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
  return { ledger };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const apply = process.argv.includes("--apply");
  const expectedArg = process.argv.find((a) => a.startsWith("--expected-manifest="));
  const expectedManifest = expectedArg ? expectedArg.split("=")[1] : null;

  const { default: pgDefault } = await loadPg();
  const Pool = pgDefault?.Pool ?? (await loadPg()).Pool;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("set statement_timeout = '600s'");
    const { plan, scope, entityById } = await buildPlan(client);
    const manifest = manifestFor(plan);
    console.log(
      JSON.stringify({ ...summarizePlan(plan, scope.length), plan_manifest_sha256: manifest }),
    );
    if (!apply) {
      console.log(
        "DRY RUN ONLY — pass --apply --expected-manifest=<the manifest above> to write ledger rows and apply the projection.",
      );
      return;
    }
    if (!expectedManifest || expectedManifest !== manifest) {
      throw new Error(
        `apply refused: --expected-manifest ${expectedManifest ?? "(missing)"} does not equal the recomputed plan manifest ${manifest} — the live plan has drifted from the reviewed dry run; re-run the dry run and review again`,
      );
    }
    const results = {};
    if (plan.textSets.length) results.text = await applyTextSets(client, plan.textSets, entityById);
    if (plan.contactMints.length) results.contacts = await applyContactMints(client, plan.contactMints, entityById);
    results.records = await applyRecords(client, plan.helds, plan.rejections);
    console.log(JSON.stringify({ applied: results, plan_manifest_sha256: manifest }));
  } finally {
    client.release();
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

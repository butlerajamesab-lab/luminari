// Title hygiene v1 — repair the person-facing titles the content
// census measured as non-names, and clear filename-valued text fields.
//
// Why: the content census (luminari-recovery/content-census/REPORT.md,
// 2026-11-11) found catalog titles that are not names at all: ZIP
// codes baked into agency names, serialized objects stored as titles,
// workbook bracket codes and "PARTIAL — verify remaining fields"
// riders, street addresses, and process text. The person test
// (Alexander, 2026-11-12) is the acceptance standard: somebody who
// knows nothing has to find a real resource and trust it — a title
// that isn't a name fails that on sight.
//
// The repair is DETERMINISTIC ONLY (design:
// luminari-recovery/content-repair-c1/DESIGN.md). Every rename is
// re-derived here from the title's own text by the shipped transform
// module (scripts/title-hygiene-transforms.mjs) and must equal the
// embedded proposal exactly — rule id and resulting name — or the row
// is excluded. No identity is inferred; nothing is renamed from
// another record's data. Proposals live in
// scripts/title-hygiene-proposals-v1.json:
//   - 416 title renames (ZIP-prefix strip, serialized-english parse,
//     bracket-code strip incl. citation-style court codes, editorial
//     strips, the QUIT-NOW inversion).
//   - 233 filename clears: a text field (description /
//     eligibility_summary / apply_notes) whose whole value is a bare
//     source filename is set to NULL — honest empty over a filename
//     masquerading as a description.
// Held by design (never in the apply set): titles whose residue still
// fails the residue gate or that no rule restores — a bare street
// address, an address+phone line, a helpline closure warning, pure
// process text, and two bracketed qualifiers with spaces (content,
// not codes). The widened person-facing name test in
// server/services/resource-directory-unified.ts holds the repairable
// residue out of person-facing results until a sourced repair exists.
//
// Declared deterministic rules:
//   - Drift guard: a row is planned only when the entity's CURRENT
//     value still equals the planned old value. A row already at the
//     new value counts as already_applied (the wave is re-runnable);
//     any other current value counts as drift and is skipped, never
//     overwritten.
//   - Name-test guard: every proposed new_name must pass the widened
//     person-facing name test mirrored below from
//     server/services/resource-directory-unified.ts.
//   - Write order: ledger rows into
//     public.luminari_title_hygiene_repairs FIRST (conflict-guarded),
//     then the entity updates, in one transaction per repair kind.
//     The ledger is the receipt and the rollback source.
//   - Manifest: sha256 over the sorted repair lines of the approved
//     set; the dry run prints it and the runner refuses to proceed
//     unless it equals EXPECTED_PLAN_MANIFEST below. (The planning
//     artifact's own manifest, over the plan JSON, is
//     35c6531012ccf363ca51633eec4b00a0960296f7a115447073a953c039c7bc32
//     in luminari-recovery/content-repair-c1/plan.json.)
//
// Dry run by default; --apply writes.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import process from "node:process";
import { plan_title, is_bare_filename } from "./title-hygiene-transforms.mjs";

function loadPg() {
  return import("pg").catch(() => {
    throw new Error(
      "The 'pg' package is unavailable. Run inside the luminari service environment (Render job) where pg is installed.",
    );
  });
}

export const REPAIR_VERSION = "title_hygiene_v1";
export const EXPECTED_PLAN_MANIFEST =
  "ab549102591922d7fbd345c050396f807806b1d26bc05a2dcd574cd110d0f717";
export const CLEARABLE_FIELDS = [
  "description",
  "eligibility_summary",
  "apply_notes",
];

// ---------------------------------------------------------------------------
// Widened person-facing name test — mirrored from
// server/services/resource-directory-unified.ts (is_human_display_name),
// title-hygiene clauses included. Kept as a local mirror so the runner
// has no service imports; the unit tests re-check every embedded
// proposal against it.
// ---------------------------------------------------------------------------

const UUID_NAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BARE_HEX_NAME_PATTERN = /^[0-9a-f]{24,}$/i;
const ARTIFACT_PREFIX_PATTERN = /^luminari[-_]/i;
const ARTIFACT_ENRICHED_PATTERN = /(^|[-_])enriched([-_]|$)/i;
const ZIP_PREFIX_NAME_PATTERN = /^\s*\d{5}(-\d{4})?\s*(—|–|\||-|[A-Z])/;
const SERIALIZED_NAME_PATTERN = /^\s*\{|'[a-z_]+':\s*'/;
const BRACKET_CODE_NAME_PATTERN = /\[[A-Za-z0-9][A-Za-z0-9.-]*\]/;
const PROCESS_TEXT_NAME_PATTERN =
  /(verify remaining fields|—\s*verify|\(verify\)|not confirmed from|not published for|no dedicated hotline|shortest in|critical:|warning:)/i;
const ADDRESS_LEADING_PATTERN = /^[0-9]{1,6}\s/;
const STREET_WORD_PATTERN =
  /(^|[^a-z])(street|avenue|road|boulevard|drive|lane|court|plaza|highway|parkway|circle|terrace|place|trail|square|way)([^a-z]|$)/i;
const CITY_STATE_ZIP_PATTERN = /,\s*[A-Za-z][A-Za-z ]+\s+[A-Z]{2}\s+\d{5}/;
const PHONE_LEADING_NAME_PATTERN =
  /^\s*(1-\d{3}-[A-Z0-9-]+|\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4})/;

export function passesPersonFacingNameTest(value) {
  if (value == null) return false;
  const name = String(value).trim();
  if (!name) return false;
  if (UUID_NAME_PATTERN.test(name)) return false;
  if (BARE_HEX_NAME_PATTERN.test(name)) return false;
  if (ARTIFACT_PREFIX_PATTERN.test(name)) return false;
  if (ARTIFACT_ENRICHED_PATTERN.test(name)) return false;
  if (ZIP_PREFIX_NAME_PATTERN.test(name)) return false;
  if (SERIALIZED_NAME_PATTERN.test(name)) return false;
  if (BRACKET_CODE_NAME_PATTERN.test(name)) return false;
  if (PROCESS_TEXT_NAME_PATTERN.test(name)) return false;
  if (
    (ADDRESS_LEADING_PATTERN.test(name) && STREET_WORD_PATTERN.test(name)) ||
    CITY_STATE_ZIP_PATTERN.test(name)
  )
    return false;
  if (PHONE_LEADING_NAME_PATTERN.test(name)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Pure planning (unit-tested)
// ---------------------------------------------------------------------------

/**
 * Filter the embedded proposals to the apply set. A rename is approved
 * only when the shipped transform re-derives it exactly (same rule,
 * same new name) from the old name, the rename is not a no-op, and the
 * new name passes the widened name test. A clear is approved only when
 * the field is clearable and its planned old value is a bare filename.
 */
export function filterApprovedProposals(proposals) {
  const approvedRenames = [];
  const approvedClears = [];
  const excluded = [];
  for (const row of proposals?.renames ?? []) {
    const entity_id = row?.entity_id ?? null;
    if (!entity_id || !row?.old_name || !row?.new_name) {
      excluded.push({ entity_id, kind: "rename", reason: "missing_fields" });
      continue;
    }
    if (row.new_name === row.old_name) {
      excluded.push({ entity_id, kind: "rename", reason: "noop_name" });
      continue;
    }
    const derived = plan_title(row.old_name);
    if (
      derived.action !== "rename" ||
      derived.new_name !== row.new_name ||
      derived.rule !== row.rule
    ) {
      excluded.push({ entity_id, kind: "rename", reason: "rederivation_mismatch" });
      continue;
    }
    if (!passesPersonFacingNameTest(row.new_name)) {
      excluded.push({ entity_id, kind: "rename", reason: "new_name_fails_name_test" });
      continue;
    }
    approvedRenames.push({
      entity_id,
      old_name: row.old_name,
      new_name: row.new_name,
      rule: row.rule,
    });
  }
  for (const row of proposals?.clears ?? []) {
    const entity_id = row?.entity_id ?? null;
    for (const f of row?.fields ?? []) {
      if (!entity_id || !CLEARABLE_FIELDS.includes(f?.field) || !f?.old_value) {
        excluded.push({ entity_id, kind: "clear", reason: "missing_fields" });
        continue;
      }
      if (!is_bare_filename(f.old_value)) {
        excluded.push({ entity_id, kind: "clear", reason: "old_value_not_bare_filename" });
        continue;
      }
      approvedClears.push({
        entity_id,
        field: f.field,
        old_value: f.old_value,
      });
    }
  }
  return { approvedRenames, approvedClears, excluded };
}

/**
 * Plan against CURRENT entity values (the drift guard).
 * currentRows: [{ resource_entity_id, resource_name, description,
 * eligibility_summary, apply_notes }].
 */
export function planRepairs(approvedRenames, approvedClears, currentRows) {
  const currentById = new Map(
    (currentRows ?? []).map((r) => [r.resource_entity_id, r]),
  );
  const renames = { planned: [], alreadyApplied: [], drift: [], missing: [] };
  for (const row of approvedRenames) {
    const cur = currentById.get(row.entity_id);
    if (!cur) { renames.missing.push(row.entity_id); continue; }
    if (cur.resource_name === row.new_name) renames.alreadyApplied.push(row.entity_id);
    else if (cur.resource_name === row.old_name) renames.planned.push(row);
    else renames.drift.push({ entity_id: row.entity_id, expected_old_name: row.old_name, found_name: cur.resource_name });
  }
  const clears = { planned: [], alreadyApplied: [], drift: [], missing: [] };
  for (const row of approvedClears) {
    const cur = currentById.get(row.entity_id);
    if (!cur) { clears.missing.push(row.entity_id); continue; }
    const value = cur[row.field];
    if (value == null) clears.alreadyApplied.push(row.entity_id);
    else if (value === row.old_value) clears.planned.push(row);
    else clears.drift.push({ entity_id: row.entity_id, field: row.field, expected_old_value: row.old_value, found_value: value });
  }
  return { renames, clears };
}

/** sha256 over the sorted repair lines of the approved set. */
export function manifestFor(approvedRenames, approvedClears) {
  const lines = [
    ...(approvedRenames ?? []).map(
      (r) => `rename|${r.entity_id}|${r.old_name}|${r.new_name}`,
    ),
    ...(approvedClears ?? []).map(
      (r) => `clear|${r.entity_id}|${r.field}|${r.old_value}`,
    ),
  ].sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

// ---------------------------------------------------------------------------
// Write path (builders are pure and unit-tested)
// ---------------------------------------------------------------------------

export const LEDGER_COLUMNS = [
  "resource_entity_id",
  "repair_kind",
  "field_name",
  "old_value",
  "new_value",
  "rule",
  "repair_version",
];

/** Ledger insert for rename rows (pure; unit-tested). */
export function buildRenameLedgerInsert(rows) {
  if (!rows || rows.length === 0) return null;
  const values = [];
  const params = [];
  rows.forEach((r, i) => {
    const b = i * LEDGER_COLUMNS.length;
    values.push(
      `($${b + 1}::uuid,$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`,
    );
    params.push(r.entity_id, "title_rename", "", r.old_name, r.new_name, r.rule, REPAIR_VERSION);
  });
  const text = `
    insert into public.luminari_title_hygiene_repairs
       (${LEDGER_COLUMNS.join(", ")})
     values ${values.join(",")}
     on conflict (resource_entity_id, repair_kind, field_name) do nothing`;
  return { text, params };
}

/** Ledger insert for clear rows (pure; unit-tested). */
export function buildClearLedgerInsert(rows) {
  if (!rows || rows.length === 0) return null;
  const values = [];
  const params = [];
  rows.forEach((r, i) => {
    const b = i * LEDGER_COLUMNS.length;
    values.push(
      `($${b + 1}::uuid,$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`,
    );
    params.push(r.entity_id, "filename_clear", r.field, r.old_value, null, "F1-filename-clear", REPAIR_VERSION);
  });
  const text = `
    insert into public.luminari_title_hygiene_repairs
       (${LEDGER_COLUMNS.join(", ")})
     values ${values.join(",")}
     on conflict (resource_entity_id, repair_kind, field_name) do nothing`;
  return { text, params };
}

/** Entity rename update; WHERE re-checks the drift guard at write time. */
export function buildNameUpdate(rows) {
  if (!rows || rows.length === 0) return null;
  const values = [];
  const params = [];
  rows.forEach((r, i) => {
    const b = i * 3;
    values.push(`($${b + 1}::uuid,$${b + 2},$${b + 3})`);
    params.push(r.entity_id, r.old_name, r.new_name);
  });
  const text = `
    update public.luminari_resource_entities e
       set resource_name = v.new_name
      from (values ${values.join(",")})
        as v(resource_entity_id, old_name, new_name)
     where e.resource_entity_id = v.resource_entity_id
       and e.resource_name = v.old_name`;
  return { text, params };
}

/**
 * Field-clear update for one field; WHERE re-checks the drift guard.
 * The field name comes only from CLEARABLE_FIELDS (checked by the
 * caller), never from proposal data.
 */
export function buildClearUpdate(field, rows) {
  if (!CLEARABLE_FIELDS.includes(field)) {
    throw new Error(`field ${field} is not clearable`);
  }
  if (!rows || rows.length === 0) return null;
  const values = [];
  const params = [];
  rows.forEach((r, i) => {
    const b = i * 2;
    values.push(`($${b + 1}::uuid,$${b + 2})`);
    params.push(r.entity_id, r.old_value);
  });
  const text = `
    update public.luminari_resource_entities e
       set ${field} = null
      from (values ${values.join(",")})
        as v(resource_entity_id, old_value)
     where e.resource_entity_id = v.resource_entity_id
       and e.${field} = v.old_value`;
  return { text, params };
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function applyRenames(client, rows) {
  let ledger = 0;
  let renamed = 0;
  await client.query("begin");
  try {
    for (const batch of chunk(rows, 500)) {
      const built = buildRenameLedgerInsert(batch);
      ledger += (await client.query(built.text, built.params)).rowCount;
    }
    for (const batch of chunk(rows, 500)) {
      const built = buildNameUpdate(batch);
      renamed += (await client.query(built.text, built.params)).rowCount;
    }
    if (renamed !== rows.length) {
      throw new Error(
        `renames: updated ${renamed} of ${rows.length} planned rows — a name changed between planning and writing; transaction rolled back`,
      );
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
  return { ledger, renamed };
}

async function applyClears(client, rows) {
  let ledger = 0;
  let cleared = 0;
  await client.query("begin");
  try {
    for (const batch of chunk(rows, 500)) {
      const built = buildClearLedgerInsert(batch);
      ledger += (await client.query(built.text, built.params)).rowCount;
    }
    for (const field of CLEARABLE_FIELDS) {
      const fieldRows = rows.filter((r) => r.field === field);
      for (const batch of chunk(fieldRows, 500)) {
        const built = buildClearUpdate(field, batch);
        cleared += (await client.query(built.text, built.params)).rowCount;
      }
    }
    if (cleared !== rows.length) {
      throw new Error(
        `clears: updated ${cleared} of ${rows.length} planned rows — a value changed between planning and writing; transaction rolled back`,
      );
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
  return { ledger, cleared };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function loadEmbeddedProposals() {
  const url = new URL("./title-hygiene-proposals-v1.json", import.meta.url);
  return JSON.parse(readFileSync(url, "utf-8"));
}

async function main() {
  const apply = process.argv.includes("--apply");
  const { approvedRenames, approvedClears, excluded } =
    filterApprovedProposals(loadEmbeddedProposals());
  const manifest = manifestFor(approvedRenames, approvedClears);
  if (manifest !== EXPECTED_PLAN_MANIFEST) {
    throw new Error(
      `approved-set manifest ${manifest} does not equal the embedded plan manifest ${EXPECTED_PLAN_MANIFEST} — the proposal file or the transform module has drifted from the reviewed plan; refusing to proceed`,
    );
  }

  const { default: pgDefault } = await loadPg();
  const Pool = pgDefault?.Pool ?? (await loadPg()).Pool;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("set statement_timeout = '240s'");
    const ids = [
      ...new Set([
        ...approvedRenames.map((r) => r.entity_id),
        ...approvedClears.map((r) => r.entity_id),
      ]),
    ];
    const currentRows = [];
    for (const batch of chunk(ids, 500)) {
      const res = await client.query(
        `select resource_entity_id, resource_name, description,
                eligibility_summary, apply_notes
           from public.luminari_resource_entities
          where resource_entity_id = any($1::uuid[])`,
        [batch],
      );
      currentRows.push(...res.rows);
    }
    const plan = planRepairs(approvedRenames, approvedClears, currentRows);
    console.log(
      JSON.stringify({
        repair_version: REPAIR_VERSION,
        approved_renames: approvedRenames.length,
        approved_clears: approvedClears.length,
        excluded_by_filter: excluded.length,
        renames_planned: plan.renames.planned.length,
        renames_already_applied: plan.renames.alreadyApplied.length,
        renames_drift: plan.renames.drift.length,
        renames_missing: plan.renames.missing.length,
        clears_planned: plan.clears.planned.length,
        clears_already_applied: plan.clears.alreadyApplied.length,
        clears_drift: plan.clears.drift.length,
        clears_missing: plan.clears.missing.length,
        plan_manifest_sha256: manifest,
      }),
    );
    if (plan.renames.drift.length || plan.renames.missing.length ||
        plan.clears.drift.length || plan.clears.missing.length) {
      console.log(JSON.stringify({ renames_drift: plan.renames.drift, renames_missing: plan.renames.missing, clears_drift: plan.clears.drift, clears_missing: plan.clears.missing }));
    }
    if (!apply) {
      console.log("DRY RUN ONLY — pass --apply to write ledger rows and apply the repairs.");
      return;
    }
    const results = {};
    if (plan.renames.planned.length) results.renames = await applyRenames(client, plan.renames.planned);
    if (plan.clears.planned.length) results.clears = await applyClears(client, plan.clears.planned);
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

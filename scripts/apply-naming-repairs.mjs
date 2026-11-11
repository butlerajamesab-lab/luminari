// Naming repair v1 — rename the held-for-naming catalog entities
// whose own source rows carry a proven human name.
//
// Why: the U3 human-surface ruling (Alexander, 2026-11-10) holds any
// catalog entity whose resource_name is a UUID, a bare hash, or a
// pipeline artifact label out of person-facing results entirely. The
// naming-repair census (luminari-recovery/naming-repair/REPORT.md)
// measured 3,282 such entities and recovered a proven name for 2,316
// of them from the entity's OWN workbook source rows — the classified
// view dropped the name; the workbook row behind the view row's
// source_locator still carries it, proven by identity (for UUID-named
// rows the workbook's program_uuid cell at the locator row equals the
// view row's UUID name in 1,208 of 1,208 checked cases).
//
// The approved set is embedded in this repository as
// scripts/naming-repair-proposals-v1.json so the run is reproducible
// from the repo alone:
//   - identity_direct (2,139): the entity's locator rows in the
//     v3_13 workbook agree on one passing program_name.
//   - identity_uuid (103): the entity's UUID name IS the workbook's
//     benefit/program UUID, found verbatim in the v3_13 sheet.
//   - identity_mirror (73): (9)-workbook rows corroborated in v3_13
//     by exact phone or website agreement.
//   - c_strong (1): the single reviewed (c) cascade survivor.
// NEVER in the apply set (held by the census, excluded here by tier):
//   - conflict_identity (122): bundle entities whose own rows name
//     several distinct programs — decomposition, not a rename.
//   - unresolved (843): registry shells no accessible source names.
//   - special_gov (1): Westchester Enriched Sciences Magnets — its
//     genuine name EQUALS its current name and still fails the
//     person-facing test's blanket 'enriched' clause; a rename cannot
//     surface it. It is the subject of the separate name-test
//     precision fix, not of this wave.
//
// Declared deterministic rules:
//   - Drift guard: a row is planned only when the entity's CURRENT
//     resource_name still equals the census old_name. A row whose
//     current name already equals the proposed new_name counts as
//     already_applied (the wave is re-runnable); any other current
//     value counts as drift and is skipped, never overwritten.
//   - Name-test guard: a proposed new_name must pass the person-
//     facing name test mirrored below from
//     server/services/resource-directory-unified.ts (is_human_
//     display_name). A name-test precision fix that only NARROWS the
//     artifact clauses widens acceptance, so this stricter mirror
//     stays safe regardless of which lands first.
//   - Write order per tier, one transaction per tier: ledger rows
//     into public.luminari_naming_repairs FIRST (conflict-guarded on
//     the entity PK), then the entity update, itself guarded by
//     resource_name still equal to the census old_name. The ledger
//     is the receipt and the rollback source.
//   - Manifest: sha256 over the sorted "entity_id|old_name|new_name"
//     lines of the approved set. The dry run prints it; the staged
//     census expects
//     09ea44ecc09568a4ccf08ab3f602e520cb6fc0930be780ffdde34f2455c4fa7d
//     for the embedded v1 set (2,316 rows).
//
// Dry run by default; --apply writes. Re-runnable: ledger inserts
// are conflict-guarded and already-renamed entities classify as
// already_applied instead of drift.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import process from "node:process";

function loadPg() {
  return import("pg").catch(() => {
    throw new Error(
      "The 'pg' package is unavailable. Run inside the luminari service environment (Render job) where pg is installed.",
    );
  });
}

export const REPAIR_VERSION = "naming_repair_v1";

/** Tiers the census approved for application, in apply order. */
export const APPROVED_TIERS = [
  "identity_direct",
  "identity_uuid",
  "identity_mirror",
  "c_strong",
];

// ---------------------------------------------------------------------------
// Person-facing name test — mirrored from
// server/services/resource-directory-unified.ts (is_human_display_name).
// Kept as a local mirror so the runner has no service imports; the
// unit tests re-check every embedded proposal against it.
// ---------------------------------------------------------------------------

const UUID_NAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BARE_HEX_NAME_PATTERN = /^[0-9a-f]{24,}$/i;
const ARTIFACT_PREFIX_PATTERN = /^luminari[-_]/i;
const ARTIFACT_ENRICHED_PATTERN = /enriched/i;

export function passesPersonFacingNameTest(value) {
  if (value == null) return false;
  const name = String(value).trim();
  if (!name) return false;
  if (UUID_NAME_PATTERN.test(name)) return false;
  if (BARE_HEX_NAME_PATTERN.test(name)) return false;
  if (ARTIFACT_PREFIX_PATTERN.test(name)) return false;
  if (ARTIFACT_ENRICHED_PATTERN.test(name)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Pure planning (unit-tested)
// ---------------------------------------------------------------------------

/**
 * Filter raw proposal rows to the apply set. A row is approved only
 * when its tier is approved, its fields are present, the rename is
 * not a no-op, and the proposed name passes the person-facing name
 * test. Everything else is returned with its exclusion reason.
 */
export function filterApprovedProposals(proposals) {
  const approved = [];
  const excluded = [];
  for (const row of proposals ?? []) {
    const entity_id = row?.entity_id ?? null;
    const old_name = row?.old_name ?? null;
    const new_name = row?.new_name ?? null;
    const tier = row?.tier ?? null;
    if (!APPROVED_TIERS.includes(tier)) {
      excluded.push({ entity_id, reason: "tier_not_approved" });
      continue;
    }
    if (!entity_id || !old_name || !new_name) {
      excluded.push({ entity_id, reason: "missing_fields" });
      continue;
    }
    if (new_name === old_name) {
      excluded.push({ entity_id, reason: "noop_name" });
      continue;
    }
    if (!passesPersonFacingNameTest(new_name)) {
      excluded.push({ entity_id, reason: "new_name_fails_name_test" });
      continue;
    }
    approved.push({
      entity_id,
      old_name,
      new_name,
      tier,
      evidence: row.evidence ?? null,
    });
  }
  return { approved, excluded };
}

/**
 * Plan the wave against the entities' CURRENT names (the drift
 * guard). currentRows: [{ resource_entity_id, resource_name }].
 * Pure and deterministic: output lists follow the approved order.
 */
export function planRepairs(approved, currentRows) {
  const currentById = new Map(
    (currentRows ?? []).map((r) => [r.resource_entity_id, r.resource_name]),
  );
  const planned = [];
  const alreadyApplied = [];
  const drift = [];
  const missing = [];
  for (const row of approved) {
    if (!currentById.has(row.entity_id)) {
      missing.push(row.entity_id);
      continue;
    }
    const current = currentById.get(row.entity_id);
    if (current === row.new_name) {
      alreadyApplied.push(row.entity_id);
    } else if (current === row.old_name) {
      planned.push(row);
    } else {
      drift.push({
        entity_id: row.entity_id,
        expected_old_name: row.old_name,
        found_name: current,
      });
    }
  }
  return { planned, alreadyApplied, drift, missing };
}

/** sha256 over the sorted "entity_id|old_name|new_name" lines. */
export function manifestFor(rows) {
  const lines = (rows ?? [])
    .map((r) => `${r.entity_id}|${r.old_name}|${r.new_name}`)
    .sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

// ---------------------------------------------------------------------------
// Write path (builders are pure and unit-tested)
// ---------------------------------------------------------------------------

export const LEDGER_COLUMNS = [
  "resource_entity_id",
  "old_name",
  "new_name",
  "match_tier",
  "evidence",
  "repair_version",
];

/** Build the ledger insert for planned rows (pure; unit-tested). */
export function buildLedgerInsert(rows) {
  if (!rows || rows.length === 0) return null;
  const values = [];
  const params = [];
  rows.forEach((r, i) => {
    const b = i * LEDGER_COLUMNS.length;
    values.push(
      `($${b + 1}::uuid,$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6})`,
    );
    params.push(
      r.entity_id,
      r.old_name,
      r.new_name,
      r.tier,
      r.evidence,
      REPAIR_VERSION,
    );
  });
  const text = `
    insert into public.luminari_naming_repairs
       (${LEDGER_COLUMNS.join(", ")})
     values ${values.join(",")}
     on conflict (resource_entity_id) do nothing`;
  return { text, params };
}

/**
 * Build the entity rename update for planned rows (pure;
 * unit-tested). The WHERE clause re-checks the drift guard at write
 * time: a row whose current name no longer equals the census
 * old_name is not renamed, and the caller treats a short rowCount
 * as a failed tier.
 */
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

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function applyTier(client, tier, rows) {
  let ledger = 0;
  let renamed = 0;
  await client.query("begin");
  try {
    for (const batch of chunk(rows, 500)) {
      const built = buildLedgerInsert(batch);
      const res = await client.query(built.text, built.params);
      ledger += res.rowCount;
    }
    for (const batch of chunk(rows, 500)) {
      const built = buildNameUpdate(batch);
      const res = await client.query(built.text, built.params);
      renamed += res.rowCount;
    }
    if (renamed !== rows.length) {
      throw new Error(
        `tier ${tier}: renamed ${renamed} of ${rows.length} planned rows — a name changed between planning and writing; tier rolled back`,
      );
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
  return { tier, ledger, renamed };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function loadEmbeddedProposals() {
  const url = new URL("./naming-repair-proposals-v1.json", import.meta.url);
  return JSON.parse(readFileSync(url, "utf-8"));
}

async function main() {
  const apply = process.argv.includes("--apply");
  const { approved, excluded } = filterApprovedProposals(loadEmbeddedProposals());
  const censusManifest = manifestFor(approved);

  const { default: pgDefault } = await loadPg();
  const Pool = pgDefault?.Pool ?? (await loadPg()).Pool;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("set statement_timeout = '240s'");
    const currentRows = [];
    for (const batch of chunk(approved, 500)) {
      const ids = batch.map((r) => r.entity_id);
      const res = await client.query(
        `select resource_entity_id, resource_name
           from public.luminari_resource_entities
          where resource_entity_id = any($1::uuid[])`,
        [ids],
      );
      currentRows.push(...res.rows);
    }
    const { planned, alreadyApplied, drift, missing } = planRepairs(
      approved,
      currentRows,
    );
    const byTier = {};
    for (const tier of APPROVED_TIERS) {
      byTier[tier] = planned.filter((r) => r.tier === tier).length;
    }
    console.log(
      JSON.stringify({
        repair_version: REPAIR_VERSION,
        approved: approved.length,
        excluded_by_filter: excluded.length,
        planned: planned.length,
        planned_by_tier: byTier,
        already_applied: alreadyApplied.length,
        drift: drift.length,
        missing: missing.length,
        census_manifest_sha256: censusManifest,
        plan_manifest_sha256: manifestFor(planned),
      }),
    );
    if (drift.length > 0 || missing.length > 0) {
      console.log(
        JSON.stringify({ drift, missing }),
      );
    }
    if (!apply) {
      console.log(
        "DRY RUN ONLY — pass --apply to write ledger rows and rename entities.",
      );
      return;
    }
    const applied = [];
    for (const tier of APPROVED_TIERS) {
      const rows = planned.filter((r) => r.tier === tier);
      if (rows.length === 0) continue;
      applied.push(await applyTier(client, tier, rows));
    }
    console.log(
      JSON.stringify({ applied, census_manifest_sha256: censusManifest }),
    );
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

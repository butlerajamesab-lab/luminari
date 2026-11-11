// Step-3 Wave A — pin the step-3 held locations the evidence resolves.
//
// Why: step 3 (2026-11-10) geocoded 4,514 of 5,963 step-1 catalog
// locations via the Census batch geocoder and held 1,449 (768 PO Box
// mailing, 638 No_Match, 42 Tie, 1 state-conflict). The held-queue
// triage (luminari-recovery/step3-triage, 2026-11-11) classified all
// 1,449 and PROVED its repair rules on a stratified 50-row sample:
// R-SPLIT-SEGMENT recovered 57% and R-DROP-PREFIX 47%; R-STRIP-UNIT,
// R-REPARSE-TRAILING and R-STRIP-PAREN recovered 0% — those rules do
// not run in this wave. Wave A applies only what the evidence
// supports, in four classes:
//
//   census_repair (72) — the two proven rules' 155 rows, minus 1
//     already resolved by DC MAR (below), re-batched through the
//     Census batch geocoder (Public_AR_Current / Current_Current,
//     2026-11-11). A match is accepted only when the returned state
//     FIPS agrees with the input state, and a Non_Exact match only
//     when it passes a street-name sanity check (shared street-name
//     token; spelled-out ordinals normalized to numeric form — an
//     exact equivalence, no fuzz). 82 of the 154 batched rows stay
//     held (70 still No_Match, 7 fuzzy wrong-street Non_Exact —
//     incl. "120 N Front Ave" -> "120 FROST DR", the triage's own
//     cautionary case — and 5 that degraded to Tie).
//   census_tie_zip_state (3) — batch Ties from step 3 whose single-
//     address candidates are resolved by exactly one candidate
//     agreeing on ZIP+state (the Salisbury MD compound, ×3 rows).
//   dc_mar (25) — DC Master Address Repository matches staged from
//     the anchor pull (MAR is the District's own address authority;
//     every row a unique candidate with ZIP agreement). One of the
//     25 (DOL ETA, 200 Constitution Ave NW) is ALSO an R-DROP-PREFIX
//     repair candidate: MAR precedence — it is planned exactly once,
//     here, and was excluded from the Census batch.
//   hhs_state_conflict_correction (1) — location
//     0d6b9e0c-e503-4eaa-92ad-68297c0ed296 (HHS OCR HQ). Its own
//     source rows read "200 Independence Avenue, SW … Washington,
//     D.C. 20201" but the parsed location carries state 'WA' and a
//     NULL city (inherited from the WA workbook sheet). This wave
//     corrects the LOCATION (state -> 'DC', city -> 'Washington')
//     and pins it with the DC MAR coordinates for that address
//     (38.886876, -77.014394; MAR_ID 291713) — MAR outranks the
//     Census-computed sibling value. The ENTITY's canonical_id and
//     jurisdiction are NOT touched: that semantics call is
//     Alexander's, separately.
//
// NEVER in this wave (held by construction, enumerated in the
// derivation report): all 768 PO Box locations; No_Match classes
// (b) mailing/admin (19), (c) absent/insufficient (7), and (d)
// well-formed (339, except the 24 DC rows the dc_mar class pins on
// MAR's authority, not Census's); the unproven repair rules' rows
// (R-STRIP-UNIT 95, R-REPARSE-TRAILING 14, R-STRIP-PAREN 9); the
// unresolved tie classes (16 same-site variants — Wave B, behind
// the deterministic pick rule; 12 genuinely ambiguous; 10
// candidates unrecoverable; 1 single-candidate ZIP conflict).
//
// The apply set is embedded in this repository as
// scripts/step3-wave-a-proposals-v1.json, reproducible by the staged
// derivation (luminari-recovery/step3-apply/derivation/derive_plan.py
// — run twice, byte-identical plan; the Census raw return is a saved
// artifact the derivation reuses). Accounting: 155 repair-classified
// = 1 MAR overlap + 154 batched = 72 planned + 82 held; plus 3 ties
// + 25 MAR + 1 correction = 101 planned pins.
//
// Declared deterministic rules:
//   - Drift guard: a row is planned only when the location's CURRENT
//     latitude is still NULL (the correction row must additionally
//     still carry state 'WA' and city NULL). A row whose current
//     coordinates already equal the plan (and, for the correction,
//     state 'DC' / city 'Washington') counts as already_applied —
//     the wave is re-runnable. Any other state is drift: skipped,
//     never forced. Both UPDATEs re-check their guard in the WHERE
//     clause, and a short rowCount aborts the class transaction.
//   - Write order per class, one transaction per class: ledger rows
//     into public.luminari_step3_wavea_pins FIRST (conflict-guarded
//     on the location PK), then the location updates. The ledger is
//     the receipt and the rollback source — it records the prior
//     coordinate_quality / geocode_source / state / city.
//   - Manifest: sha256 over the sorted
//     "location_id|latitude|longitude|provenance" lines of the plan
//     set. Expected for the embedded v1 set (101 rows):
//     533d14170c8cf3ac52754d9d96081774ec92ba4fde03699c492d864afff3a831
//
// Dry run by default; --apply writes. --apply refuses to run until
// the wave ledger exists (migration 20261110250000 installed).

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

export const PLAN_VERSION = "step3_wave_a_v1";

/** Classes in apply order. */
export const PIN_CLASSES = [
  "census_repair",
  "census_tie_zip_state",
  "dc_mar",
  "hhs_state_conflict_correction",
];

export const HHS_LOCATION_ID = "0d6b9e0c-e503-4eaa-92ad-68297c0ed296";

export function loadEmbeddedProposals() {
  const url = new URL("./step3-wave-a-proposals-v1.json", import.meta.url);
  return JSON.parse(readFileSync(url, "utf-8"));
}

/** sha256 over the sorted "location_id|lat|lng|provenance" lines. */
export function manifestFor(rows) {
  const lines = (rows ?? [])
    .map((r) => `${r.location_id}|${r.latitude}|${r.longitude}|${r.provenance}`)
    .sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

const PROVENANCE_BY_CLASS = {
  census_repair: /^census_batch_repair:(R-SPLIT-SEGMENT|R-DROP-PREFIX)$/,
  census_tie_zip_state: /^census_tie_zip_state$/,
  dc_mar: /^dc_master_address_repository$/,
  hhs_state_conflict_correction: /^dc_mar_state_conflict_correction$/,
};
const QUALITY_BY_CLASS = {
  census_repair: ["census_match_exact", "census_match_non_exact"],
  census_tie_zip_state: ["census_tie_resolved"],
  dc_mar: ["dc_mar_match"],
  hhs_state_conflict_correction: ["dc_mar_match"],
};

/**
 * Structural validation of an apply plan (pure; unit-tested).
 * Returns a list of problems — empty means the plan is sound.
 * Checks: every row's id belongs to its class's declared input set
 * (exclusion by construction: nothing outside the four classes'
 * inputs can be planned); each location appears exactly once;
 * the MAR/repair overlap row is planned once, as dc_mar; the HHS
 * row is present exactly once and carries its correction; per-class
 * provenance/quality vocabularies; coordinates parse and are in
 * range; accounting reconciles with the plan's own counts.
 */
export function validatePlan(doc) {
  const errors = [];
  const rows = doc?.rows ?? [];
  const inputs = doc?.inputs ?? {};
  const inputSets = {
    census_repair: new Set(inputs.repair_ids ?? []),
    census_tie_zip_state: new Set(inputs.tie_ids ?? []),
    dc_mar: new Set(inputs.mar_ids ?? []),
    hhs_state_conflict_correction: new Set(inputs.hhs_id ? [inputs.hhs_id] : []),
  };
  const seen = new Map();
  for (const r of rows) {
    if (seen.has(r.location_id)) {
      errors.push(`duplicate location in plan: ${r.location_id}`);
    }
    seen.set(r.location_id, r);
    const set = inputSets[r.pin_class];
    if (!set) {
      errors.push(`unknown pin_class ${r.pin_class} for ${r.location_id}`);
      continue;
    }
    if (!set.has(r.location_id)) {
      errors.push(
        `${r.location_id} planned as ${r.pin_class} but is not in that class's input set`,
      );
    }
    if (!PROVENANCE_BY_CLASS[r.pin_class]?.test(r.provenance ?? "")) {
      errors.push(`${r.location_id}: provenance ${r.provenance} does not match class ${r.pin_class}`);
    }
    if (!QUALITY_BY_CLASS[r.pin_class]?.includes(r.coordinate_quality)) {
      errors.push(`${r.location_id}: coordinate_quality ${r.coordinate_quality} not allowed for ${r.pin_class}`);
    }
    if (r.pin_class === "census_repair") {
      if (!["R-SPLIT-SEGMENT", "R-DROP-PREFIX"].includes(r.repair_rule)) {
        errors.push(`${r.location_id}: census_repair row without a proven repair rule`);
      }
      if (!/^census_batch_repair:/.test(r.provenance) || !r.provenance.endsWith(r.repair_rule)) {
        errors.push(`${r.location_id}: repair provenance does not carry its rule tag`);
      }
    } else if (r.repair_rule != null) {
      errors.push(`${r.location_id}: non-repair row carries repair_rule ${r.repair_rule}`);
    }
    const lat = Number(r.latitude);
    const lng = Number(r.longitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      errors.push(`${r.location_id}: latitude out of range: ${r.latitude}`);
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      errors.push(`${r.location_id}: longitude out of range: ${r.longitude}`);
    }
  }
  // The MAR/repair overlap: planned exactly once, as dc_mar.
  for (const id of inputs.mar_overlap_repair_ids ?? []) {
    const r = seen.get(id);
    if (!r) errors.push(`overlap location ${id} missing from plan`);
    else if (r.pin_class !== "dc_mar") {
      errors.push(`overlap location ${id} planned as ${r.pin_class}, expected dc_mar (MAR precedence)`);
    }
  }
  // The HHS correction row: exactly once, with the correction shape.
  const hhs = rows.filter((r) => r.pin_class === "hhs_state_conflict_correction");
  if (hhs.length !== 1) {
    errors.push(`expected exactly 1 hhs_state_conflict_correction row, found ${hhs.length}`);
  } else {
    const c = hhs[0].correction ?? {};
    if (
      hhs[0].location_id !== HHS_LOCATION_ID ||
      c.old_state !== "WA" ||
      c.new_state !== "DC" ||
      c.old_city !== null ||
      c.new_city !== "Washington"
    ) {
      errors.push("hhs correction row has the wrong location or correction shape");
    }
  }
  // Held repair rows never enter the plan; counts reconcile.
  const heldIds = new Set((doc?.held ?? []).map((h) => h.location_id));
  for (const id of heldIds) {
    if (seen.has(id)) errors.push(`held location ${id} also appears in the plan`);
  }
  const acc = doc?.accounting ?? {};
  const repairIds = inputs.repair_ids ?? [];
  if (
    acc.repair_classified_rows !== repairIds.length ||
    acc.planned_total !== rows.length ||
    acc.repair_planned + acc.repair_held + acc.repair_mar_overlap_rows !==
      acc.repair_classified_rows ||
    acc.tie_planned + acc.mar_planned + acc.hhs_planned + acc.repair_planned !==
      acc.planned_total
  ) {
    errors.push("accounting does not reconcile");
  }
  if (manifestFor(rows) !== doc?.expected_manifest_sha256) {
    errors.push("plan manifest does not reproduce the expected sha256");
  }
  return errors;
}

function coordsEqual(aLat, aLng, bLat, bLng) {
  return Number(aLat) === Number(bLat) && Number(aLng) === Number(bLng);
}

/**
 * Classify plan rows against current DB rows (pure; unit-tested).
 * currentRows: [{location_id, resource_entity_id, latitude,
 * longitude, coordinate_quality, geocode_source, state, city}].
 * Returns {planned (each with .current attached), alreadyApplied,
 * drift, missing}.
 */
export function classifyRows(planRows, currentRows) {
  const byId = new Map((currentRows ?? []).map((r) => [r.location_id, r]));
  const planned = [];
  const alreadyApplied = [];
  const drift = [];
  const missing = [];
  for (const row of planRows ?? []) {
    const cur = byId.get(row.location_id);
    if (!cur) {
      missing.push(row.location_id);
      continue;
    }
    const isHhs = row.pin_class === "hhs_state_conflict_correction";
    if (cur.latitude != null) {
      const samePin = coordsEqual(cur.latitude, cur.longitude, row.latitude, row.longitude);
      const correctionDone =
        !isHhs || (cur.state === "DC" && cur.city === "Washington");
      if (samePin && correctionDone) alreadyApplied.push(row);
      else drift.push({ location_id: row.location_id, reason: "coordinates_present_differ_from_plan" });
      continue;
    }
    if (isHhs && !(cur.state === "WA" && cur.city == null)) {
      drift.push({ location_id: row.location_id, reason: "hhs_state_city_no_longer_wa_null" });
      continue;
    }
    planned.push({ ...row, current: cur });
  }
  return { planned, alreadyApplied, drift, missing };
}

const LEDGER_COLUMNS = [
  "location_id", "resource_entity_id", "pin_class", "repair_rule",
  "latitude", "longitude", "coordinate_quality", "geocode_source",
  "matched_address", "evidence", "old_coordinate_quality",
  "old_geocode_source", "old_state", "new_state", "old_city",
  "new_city", "manifest_sha256", "plan_version",
];

/**
 * Build the ledger insert for planned rows (pure; unit-tested).
 * One VALUES tuple per row with flattened scalar params — the
 * category-pass lesson: no array-typed params anywhere in this
 * write path (every column here is a scalar).
 */
export function buildLedgerInsert(rows, manifest) {
  if (!rows || rows.length === 0) return null;
  const castFor = (col, p) =>
    col === "location_id" || col === "resource_entity_id"
      ? `$${p}::uuid`
      : col === "latitude" || col === "longitude"
        ? `$${p}::numeric`
        : `$${p}`;
  const values = [];
  const params = [];
  rows.forEach((r) => {
    const b = params.length;
    values.push(
      `(${LEDGER_COLUMNS.map((c, i) => castFor(c, b + i + 1)).join(",")})`,
    );
    params.push(
      r.location_id,
      r.resource_entity_id ?? null,
      r.pin_class,
      r.repair_rule ?? null,
      r.latitude,
      r.longitude,
      r.coordinate_quality,
      r.geocode_source,
      r.matched_address ?? null,
      r.evidence ?? null,
      r.current?.coordinate_quality ?? null,
      r.current?.geocode_source ?? null,
      r.correction ? r.correction.old_state : null,
      r.correction ? r.correction.new_state : null,
      r.correction ? r.correction.old_city : null,
      r.correction ? r.correction.new_city : null,
      manifest,
      PLAN_VERSION,
    );
  });
  const text = `
    insert into public.luminari_step3_wavea_pins
      (${LEDGER_COLUMNS.join(", ")})
    values ${values.join(",")}
    on conflict (location_id) do nothing`;
  return { text, params };
}

/**
 * Build the location pin update for planned NON-correction rows
 * (pure; unit-tested). The WHERE clause re-checks the drift guard
 * at write time (latitude still NULL); the caller treats a short
 * rowCount as a failed class.
 */
export function buildLocationUpdate(rows) {
  const pins = (rows ?? []).filter(
    (r) => r.pin_class !== "hhs_state_conflict_correction",
  );
  if (pins.length === 0) return null;
  const values = [];
  const params = [];
  pins.forEach((r) => {
    const b = params.length;
    values.push(`($${b + 1}::uuid,$${b + 2}::numeric,$${b + 3}::numeric,$${b + 4},$${b + 5})`);
    params.push(r.location_id, r.latitude, r.longitude, r.coordinate_quality, r.geocode_source);
  });
  const text = `
    update public.luminari_resource_locations l
       set latitude = v.latitude,
           longitude = v.longitude,
           coordinate_quality = v.coordinate_quality,
           geocode_source = v.geocode_source
      from (values ${values.join(",")})
        as v(location_id, latitude, longitude, coordinate_quality, geocode_source)
     where l.location_id = v.location_id
       and l.latitude is null`;
  return { text, params };
}

/**
 * Build the HHS correction update (pure; unit-tested). Separate
 * from the pin update because it also corrects state/city, guarded
 * on the exact prior state (state 'WA', city NULL).
 */
export function buildCorrectionUpdate(row) {
  if (!row || row.pin_class !== "hhs_state_conflict_correction") return null;
  const text = `
    update public.luminari_resource_locations
       set latitude = $2::numeric,
           longitude = $3::numeric,
           coordinate_quality = $4,
           geocode_source = $5,
           state = $6,
           city = $7
     where location_id = $1::uuid
       and latitude is null
       and state = $8
       and city is null`;
  const params = [
    row.location_id,
    row.latitude,
    row.longitude,
    row.coordinate_quality,
    row.geocode_source,
    row.correction.new_state,
    row.correction.new_city,
    row.correction.old_state,
  ];
  return { text, params };
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function applyClass(client, pinClass, rows, manifest) {
  let ledger = 0;
  let updated = 0;
  await client.query("begin");
  try {
    for (const batch of chunk(rows, 100)) {
      const built = buildLedgerInsert(batch, manifest);
      const res = await client.query(built.text, built.params);
      ledger += res.rowCount;
    }
    if (pinClass === "hhs_state_conflict_correction") {
      const built = buildCorrectionUpdate(rows[0]);
      const res = await client.query(built.text, built.params);
      updated += res.rowCount;
    } else {
      for (const batch of chunk(rows, 100)) {
        const built = buildLocationUpdate(batch);
        if (!built) continue;
        const res = await client.query(built.text, built.params);
        updated += res.rowCount;
      }
    }
    if (updated !== rows.length) {
      throw new Error(
        `class ${pinClass}: updated ${updated} of ${rows.length} planned rows — a location changed between planning and writing; class rolled back`,
      );
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
  return { pin_class: pinClass, ledger, updated };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const apply = process.argv.includes("--apply");
  const doc = loadEmbeddedProposals();
  const problems = validatePlan(doc);
  if (problems.length > 0) {
    console.error(JSON.stringify({ plan_validation_errors: problems }));
    process.exit(1);
  }
  const planRows = doc.rows;
  const expectedManifest = manifestFor(planRows);

  const { default: pgDefault } = await loadPg();
  const Pool = pgDefault?.Pool ?? (await loadPg()).Pool;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("set statement_timeout = '240s'");
    if (apply) {
      const reg = await client.query(
        "select to_regclass('public.luminari_step3_wavea_pins') as t",
      );
      if (!reg.rows[0].t) {
        throw new Error(
          "public.luminari_step3_wavea_pins does not exist — install migration 20261110250000 before --apply.",
        );
      }
    }
    const currentRows = [];
    for (const batch of chunk(planRows, 100)) {
      const ids = batch.map((r) => r.location_id);
      const res = await client.query(
        `select location_id, resource_entity_id, latitude, longitude,
                coordinate_quality, geocode_source, state, city
           from public.luminari_resource_locations
          where location_id = any($1::uuid[])`,
        [ids],
      );
      currentRows.push(...res.rows);
    }
    const { planned, alreadyApplied, drift, missing } = classifyRows(
      planRows,
      currentRows,
    );
    const byClass = {};
    for (const c of PIN_CLASSES) {
      byClass[c] = planned.filter((r) => r.pin_class === c).length;
    }
    console.log(
      JSON.stringify({
        plan_version: PLAN_VERSION,
        approved: planRows.length,
        planned: planned.length,
        planned_by_class: byClass,
        already_applied: alreadyApplied.length,
        drift: drift.length,
        missing: missing.length,
        expected_manifest_sha256: expectedManifest,
        plan_manifest_sha256: manifestFor(planned),
      }),
    );
    if (drift.length > 0 || missing.length > 0) {
      console.log(JSON.stringify({ drift, missing }));
    }
    if (!apply) {
      console.log(
        "DRY RUN ONLY — pass --apply to write ledger rows and pin locations.",
      );
      return;
    }
    const applied = [];
    for (const pinClass of PIN_CLASSES) {
      const rows = planned.filter((r) => r.pin_class === pinClass);
      if (rows.length === 0) continue;
      applied.push(await applyClass(client, pinClass, rows, expectedManifest));
    }
    console.log(
      JSON.stringify({ applied, expected_manifest_sha256: expectedManifest }),
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

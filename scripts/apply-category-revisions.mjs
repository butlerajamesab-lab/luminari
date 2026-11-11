// Category pass v1 — classify the step-4 remainder population's
// clean-tier entities from the deterministic category census.
//
// Why: of the 4,802 step-4 remainder entities, 4,797 carried no
// category at all (resource_category NULL) — step 4 could derive
// almost nothing because the governed mechanism only honors the
// individual-review revision table, the entities carry no text of
// their own, and the workbook's category columns never entered the
// classified view. The category census (luminari-recovery/
// category-pass/REPORT.md) measured what the records' own evidence
// honestly supports, in strict evidence order:
//   R2  section headings on lines:-path records (343 primaries)
//   R3a declared labels — WORKBOOK single-value category columns
//       only in this pass (180 proposed, 51 after the suspect gate)
//   R4  service-text keywords, primary only on single-category
//       concentration (1,383 primaries)
// and the workbook-fidelity audit (luminari-recovery/
// workbook-fidelity/REPORT.md) then governed which workbook-derived
// evidence may be applied at all.
//
// The apply set is embedded in this repository as
// scripts/category-pass-proposals-v1.json so the run is reproducible
// from the repo alone: 1,777 entities (R2 343 / R3a_workbook 51 /
// R4 1,383) with 1,476 membership assignments (1,129 of them
// tag-grade R3b, applied with their tier recorded per the census
// design's "apply but queue" — the queue is the recorded tier).
//
// NEVER in the apply set (quarantined by the derivation filter, each
// with its reason; counts in the census accounting):
//   - conflict_held (69): section and label primaries disagree.
//   - view_prose_label_primary (325): R3a primaries from the view's
//     prose label — sampled 3/3 wrong; the appendix label field is
//     positional. Hand review.
//   - suspect_label (129): workbook-label primaries whose category
//     finds no keyword support in the record's own text.
//   - naming_fidelity_held (161): entities whose naming-repair
//     renames are held on benefits_program_master evidence — do not
//     categorize records whose names are still held.
//   - benefits_anchored_evidence (0 in this set): any primary whose
//     evidence is anchored to benefits_program_master (UNVERIFIABLE
//     sheet) is excluded; the filter below re-checks it.
//   - lossy_sheet_only_evidence (0 in this set): entities whose only
//     evidence sits on LOSSY sheets (bucket_resource,
//     registry_programs, state_enriched_directory_v3_13,
//     markdown_directory).
//   - no_primary_membership_only (1,518) and no_proposal (818):
//     membership-only and unassigned records stay unreviewed —
//     unknown stays unknown.
//
// Why the pass keeps its OWN ledger instead of writing rows into
// public.luminari_resource_category_revision_v1: that table's
// BEFORE INSERT guard (guard_luminari_resource_category_v1) admits
// only paragraph-anchored individual reviews — an exact admitted
// target in v_lighthouse_resource_program_catalog_v2, a
// word/document.xml xpath span, and membership evidence quotes with
// P-paragraph anchors contained in the record text. Deterministic
// workbook/lines evidence cannot honestly satisfy that contract, so
// migration 20261110230000 creates the pass ledger
// public.luminari_category_pass_classifications and this runner
// updates entities directly — the naming-repair pattern. The
// guarded revision table is not touched.
//
// Declared deterministic rules:
//   - Drift guard: a row is planned only when the entity's CURRENT
//     resource_category is still NULL. A row whose current category
//     and service_categories already equal the proposal counts as
//     already_applied (the wave is re-runnable); any other non-NULL
//     current category counts as drift and is skipped, never
//     overwritten. The UPDATE re-checks the guard in its WHERE.
//   - Fidelity guards (re-checked here, not just at derivation):
//     sheet attribution is TOKEN-based — the sheet is the maximal
//     [a-z0-9_] run after 'xlsx:' in an evidence locator, so
//     'benefits_program_master' never matches a check for
//     'program_master'. No applied evidence string may be anchored
//     to benefits_program_master: a benefits-anchored primary
//     excludes the entity; benefits-anchored membership evidence is
//     stripped (a membership left with no evidence is dropped).
//   - Write order per tier, one transaction per tier: ledger rows
//     into public.luminari_category_pass_classifications FIRST
//     (conflict-guarded on the entity PK), then the entity update.
//     The ledger is the receipt and the rollback source.
//   - Manifest: sha256 over the sorted
//     "entity_id|primary_category|membership1,membership2" lines of
//     the approved set. The dry run prints it; the staged derivation
//     expects
//     a0904191747d89a5e8c7c391c17f6c0378bc5f7dc1b9afdee31a401560226dc9
//     for the embedded v1 set (1,777 rows).
//
// Dry run by default; --apply writes. --apply refuses to run until
// the pass ledger exists (migration 20261110230000 installed).

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

export const PASS_VERSION = "category_pass_v1";

/** Tiers the census + fidelity gate approved for application, in apply order. */
export const APPROVED_TIERS = ["R2", "R3a_workbook", "R4"];

/** The canonical nine categories. Legacy labels never enter this set. */
export const CANONICAL_CATEGORIES = [
  "housing",
  "healthcare",
  "legal_civil_rights",
  "cash_assistance",
  "food_nutrition",
  "tribal",
  "safety_crisis",
  "utilities",
  "employment_labor",
];

const BENEFITS_SHEET = "benefits_program_master";
const LOSSY_SHEETS = new Set([
  "bucket_resource",
  "registry_programs",
  "state_enriched_directory_v3_13",
  "markdown_directory",
]);

// ---------------------------------------------------------------------------
// Fidelity attribution (token-based; unit-tested against the trap)
// ---------------------------------------------------------------------------

/**
 * Sheet tokens named by an evidence string: the maximal [a-z0-9_] run
 * after each 'xlsx:' locator prefix. Token equality is exact, so
 * 'xlsx:benefits_program_master:row:9' yields the token
 * 'benefits_program_master' — never 'program_master'.
 */
export function sheetTokensOf(evidence) {
  const tokens = new Set();
  const re = /xlsx:([a-z0-9_]+):row:/g;
  let m;
  const s = String(evidence ?? "");
  while ((m = re.exec(s)) !== null) tokens.add(m[1]);
  return tokens;
}

export function evidenceIsBenefitsAnchored(evidence) {
  return sheetTokensOf(evidence).has(BENEFITS_SHEET);
}

// ---------------------------------------------------------------------------
// Pure planning (unit-tested)
// ---------------------------------------------------------------------------

/**
 * Filter raw proposal rows to the apply set, re-checking the census
 * derivation's gates: approved tier, canonical vocabulary, complete
 * fields, and the fidelity guards (benefits-anchored primaries
 * excluded; benefits-anchored membership evidence stripped, and a
 * membership left evidenceless dropped; LOSSY-only evidence
 * excluded). Returns { approved, excluded, droppedMemberships,
 * strippedEvidenceStrings }.
 */
export function filterApprovedProposals(proposals) {
  const approved = [];
  const excluded = [];
  let droppedMemberships = 0;
  let strippedEvidenceStrings = 0;
  for (const row of proposals ?? []) {
    const entity_id = row?.entity_id ?? null;
    const primary = row?.primary_category ?? null;
    const tier = row?.primary_tier ?? null;
    if (!entity_id || !primary || !tier || !row?.primary_evidence) {
      excluded.push({ entity_id, reason: "missing_fields" });
      continue;
    }
    if (!APPROVED_TIERS.includes(tier)) {
      excluded.push({ entity_id, reason: "tier_not_approved" });
      continue;
    }
    if (!CANONICAL_CATEGORIES.includes(primary)) {
      excluded.push({ entity_id, reason: "primary_not_canonical" });
      continue;
    }
    if (evidenceIsBenefitsAnchored(row.primary_evidence)) {
      excluded.push({ entity_id, reason: "benefits_anchored_evidence" });
      continue;
    }
    // LOSSY attribution is per evidence string: a string counts as
    // LOSSY-anchored only when its locator tokens are non-empty and
    // all LOSSY. Token-less evidence (lines:/docx: paths) is anchored
    // to a raw document, not to a workbook sheet — an entity with any
    // such evidence is not "only evidence on LOSSY sheets".
    const anchorFlags = [];
    const flagEvidence = (ev) => {
      const toks = sheetTokensOf(ev);
      anchorFlags.push(
        toks.size > 0 && [...toks].every((s) => LOSSY_SHEETS.has(s))
          ? "lossy"
          : "other",
      );
    };
    flagEvidence(row.primary_evidence);
    const memberships = [];
    let badMembership = false;
    for (const mem of row.memberships ?? []) {
      const category = mem?.category ?? null;
      if (
        !category ||
        !CANONICAL_CATEGORIES.includes(category) ||
        category === primary ||
        memberships.some((x) => x.category === category)
      ) {
        badMembership = true;
        break;
      }
      const kept = [];
      for (const ev of mem.evidence ?? []) {
        if (evidenceIsBenefitsAnchored(ev)) {
          strippedEvidenceStrings += 1;
        } else {
          kept.push(ev);
          flagEvidence(ev);
        }
      }
      if (kept.length === 0) {
        droppedMemberships += 1;
        continue;
      }
      memberships.push({ ...mem, evidence: kept });
    }
    if (badMembership) {
      excluded.push({ entity_id, reason: "membership_not_canonical" });
      continue;
    }
    if (anchorFlags.length > 0 && anchorFlags.every((f) => f === "lossy")) {
      excluded.push({ entity_id, reason: "lossy_sheet_only_evidence" });
      continue;
    }
    approved.push({ ...row, memberships });
  }
  return { approved, excluded, droppedMemberships, strippedEvidenceStrings };
}

/**
 * Plan the wave against the entities' CURRENT categories (the drift
 * guard). currentRows: [{ resource_entity_id, resource_category,
 * service_categories }]. Pure and deterministic.
 */
export function planClassifications(approved, currentRows) {
  const currentById = new Map(
    (currentRows ?? []).map((r) => [r.resource_entity_id, r]),
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
    const proposedMemberships = (row.memberships ?? [])
      .map((m) => m.category)
      .sort();
    const currentMemberships = [...(current.service_categories ?? [])].sort();
    if (current.resource_category == null) {
      planned.push(row);
    } else if (
      current.resource_category === row.primary_category &&
      JSON.stringify(currentMemberships) === JSON.stringify(proposedMemberships)
    ) {
      alreadyApplied.push(row.entity_id);
    } else {
      drift.push({
        entity_id: row.entity_id,
        proposed_category: row.primary_category,
        found_category: current.resource_category,
        found_memberships: current.service_categories ?? [],
      });
    }
  }
  return { planned, alreadyApplied, drift, missing };
}

/** sha256 over the sorted "entity_id|primary|membership1,membership2" lines. */
export function manifestFor(rows) {
  const lines = (rows ?? [])
    .map(
      (r) =>
        `${r.entity_id}|${r.primary_category}|${(r.memberships ?? [])
          .map((m) => m.category)
          .sort()
          .join(",")}`,
    )
    .sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

// ---------------------------------------------------------------------------
// Write path (builders are pure and unit-tested)
// ---------------------------------------------------------------------------

export const LEDGER_COLUMNS = [
  "resource_entity_id",
  "canonical_id",
  "primary_category",
  "primary_tier",
  "primary_evidence",
  "memberships",
  "civic_object_uid",
  "artifact_key",
  "source_locator",
  "before_category",
  "pass_version",
];

/** Build the ledger insert for planned rows (pure; unit-tested). */
export function buildLedgerInsert(rows) {
  if (!rows || rows.length === 0) return null;
  const values = [];
  const params = [];
  rows.forEach((r, i) => {
    const b = i * LEDGER_COLUMNS.length;
    values.push(
      `($${b + 1}::uuid,$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6}::jsonb,$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11})`,
    );
    params.push(
      r.entity_id,
      r.canonical_id ?? null,
      r.primary_category,
      r.primary_tier,
      r.primary_evidence,
      JSON.stringify(r.memberships ?? []),
      r.civic_object_uid ?? null,
      r.artifact_key ?? null,
      r.source_locator ?? null,
      r.before_category ?? null,
      PASS_VERSION,
    );
  });
  const text = `
    insert into public.luminari_category_pass_classifications
       (${LEDGER_COLUMNS.join(", ")})
     values ${values.join(",")}
     on conflict (resource_entity_id) do nothing`;
  return { text, params };
}

/**
 * Build the entity classification update for planned rows (pure;
 * unit-tested). The WHERE clause re-checks the drift guard at write
 * time: a row whose resource_category is no longer NULL is not
 * classified, and the caller treats a short rowCount as a failed
 * tier. service_categories carries the memberships only — the shape
 * the 5 already-categorized remainder entities carry (primary in
 * resource_category, memberships in service_categories).
 */
export function buildEntityUpdate(rows) {
  if (!rows || rows.length === 0) return null;
  const params = [
    rows.map((r) => r.entity_id),
    rows.map((r) => r.primary_category),
    rows.map((r) => (r.memberships ?? []).map((m) => m.category).sort()),
  ];
  const text = `
    update public.luminari_resource_entities e
       set resource_category = v.primary_category,
           service_categories = v.memberships
      from (select unnest($1::uuid[]) as resource_entity_id,
                   unnest($2::text[]) as primary_category,
                   unnest($3::text[][]) as memberships) v
     where e.resource_entity_id = v.resource_entity_id
       and e.resource_category is null`;
  return { text, params };
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function applyTier(client, tier, rows) {
  let ledger = 0;
  let classified = 0;
  await client.query("begin");
  try {
    for (const batch of chunk(rows, 500)) {
      const built = buildLedgerInsert(batch);
      const res = await client.query(built.text, built.params);
      ledger += res.rowCount;
    }
    if (ledger !== rows.length) {
      throw new Error(
        `tier ${tier}: ledger accepted ${ledger} of ${rows.length} rows — a classification already exists for a planned entity; tier rolled back`,
      );
    }
    for (const batch of chunk(rows, 500)) {
      const built = buildEntityUpdate(batch);
      const res = await client.query(built.text, built.params);
      classified += res.rowCount;
    }
    if (classified !== rows.length) {
      throw new Error(
        `tier ${tier}: classified ${classified} of ${rows.length} planned rows — a category changed between planning and writing; tier rolled back`,
      );
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
  return { tier, ledger, classified };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function loadEmbeddedProposals() {
  const url = new URL("./category-pass-proposals-v1.json", import.meta.url);
  return JSON.parse(readFileSync(url, "utf-8"));
}

async function main() {
  const apply = process.argv.includes("--apply");
  const { approved, excluded, droppedMemberships, strippedEvidenceStrings } =
    filterApprovedProposals(loadEmbeddedProposals());
  const censusManifest = manifestFor(approved);

  const { default: pgDefault } = await loadPg();
  const Pool = pgDefault?.Pool ?? (await loadPg()).Pool;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("set statement_timeout = '240s'");
    if (apply) {
      const reg = await client.query(
        "select to_regclass('public.luminari_category_pass_classifications') as tbl",
      );
      if (!reg.rows[0]?.tbl) {
        throw new Error(
          "public.luminari_category_pass_classifications does not exist — install migration 20261110230000_category_pass_ledger_v1.sql before --apply.",
        );
      }
    }
    const currentRows = [];
    for (const batch of chunk(approved, 500)) {
      const ids = batch.map((r) => r.entity_id);
      const res = await client.query(
        `select resource_entity_id, resource_category, service_categories
           from public.luminari_resource_entities
          where resource_entity_id = any($1::uuid[])`,
        [ids],
      );
      currentRows.push(...res.rows);
    }
    const { planned, alreadyApplied, drift, missing } = planClassifications(
      approved,
      currentRows,
    );
    const byTier = {};
    for (const tier of APPROVED_TIERS) {
      byTier[tier] = planned.filter((r) => r.primary_tier === tier).length;
    }
    const excludedReasons = {};
    for (const e of excluded) {
      excludedReasons[e.reason] = (excludedReasons[e.reason] ?? 0) + 1;
    }
    console.log(
      JSON.stringify({
        pass_version: PASS_VERSION,
        approved: approved.length,
        excluded_by_filter: excluded.length,
        excluded_reasons: excludedReasons,
        dropped_memberships_benefits: droppedMemberships,
        stripped_evidence_strings_benefits: strippedEvidenceStrings,
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
      console.log(JSON.stringify({ drift, missing }));
    }
    if (!apply) {
      console.log(
        "DRY RUN ONLY — pass --apply to write ledger rows and classify entities.",
      );
      return;
    }
    const applied = [];
    for (const tier of APPROVED_TIERS) {
      const rows = planned.filter((r) => r.primary_tier === tier);
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

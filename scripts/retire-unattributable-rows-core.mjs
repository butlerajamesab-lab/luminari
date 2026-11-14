// Core logic for the unattributable-row retirement runner.
// Pure functions only — the runner (apply-unattributable-row-retirements.mjs)
// owns all I/O. The plan is the enumerated set from the bundle-decomposition
// census: every (9)-generation workbook row linked to a bundle entity that
// no identity mechanism could attribute to a program, in bundles whose
// v3_13 constituent set is complete. Alexander's decision (2026-11-14):
// retire-with-shell, ledgered and reversible.

import { createHash } from "node:crypto";

export const REPAIR_VERSION = "unattr_retire_v1";

export const EVIDENCE_TIERS = [
  "zip_consistent",
  "zip_mismatch",
  "zip_unverifiable_no_bundle_zips",
  "no_zip_on_row",
];

export function manifestFor(rows) {
  const lines = rows
    .map((r) => `${r.bundle_entity_id}|${r.row_uid}|${r.sheet}|${r.row_number}`)
    .sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

// Structural validation of the embedded plan. Throws on any violation —
// a malformed plan must never reach the database.
export function validatePlan(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("plan must be a non-empty array");
  }
  const seen = new Set();
  const bundles = new Set();
  const byTier = Object.fromEntries(EVIDENCE_TIERS.map((t) => [t, 0]));
  for (const r of rows) {
    if (!r.bundle_entity_id || !r.row_uid || !r.sheet) {
      throw new Error(`plan row missing identity fields: ${JSON.stringify(r)}`);
    }
    if (!Number.isInteger(r.row_number)) {
      throw new Error(`plan row_number not an integer: ${JSON.stringify(r)}`);
    }
    if (!EVIDENCE_TIERS.includes(r.evidence_tier)) {
      throw new Error(`plan row has unknown evidence_tier: ${r.evidence_tier}`);
    }
    const key = `${r.bundle_entity_id}|${r.row_uid}`;
    if (seen.has(key)) throw new Error(`duplicate plan row: ${key}`);
    seen.add(key);
    bundles.add(r.bundle_entity_id);
    byTier[r.evidence_tier] += 1;
  }
  return { total: rows.length, bundles: bundles.size, byTier };
}

// Partition the plan against the ledger's current state:
// - planned: no ledger row yet — the runner will insert them as 'retired'.
// - alreadyRetired: ledger row exists with status 'retired' (re-runnable).
// - heldByReversal: ledger row exists with status 'restored' — a human
//   reversed this retirement; the runner never re-retires it silently.
export function planInserts(planRows, ledgerRows) {
  const ledger = new Map(
    ledgerRows.map((r) => [`${r.bundle_entity_id}|${r.row_uid}`, r.status]),
  );
  const planned = [];
  const alreadyRetired = [];
  const heldByReversal = [];
  for (const r of planRows) {
    const status = ledger.get(`${r.bundle_entity_id}|${r.row_uid}`);
    if (status === undefined) planned.push(r);
    else if (status === "retired") alreadyRetired.push(r);
    else if (status === "restored") heldByReversal.push(r);
    else throw new Error(`unknown ledger status: ${status}`);
  }
  return { planned, alreadyRetired, heldByReversal };
}

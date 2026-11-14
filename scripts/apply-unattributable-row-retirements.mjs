// Retire-with-shell the 371 unattributable (9)-generation workbook
// rows (Alexander's decision, 2026-11-14, brief item 3).
//
// The enumerated set is embedded as
// scripts/unattributable-row-retirements-v1.json so the run is
// reproducible from the repo alone. Every row is a (9)-generation
// workbook row linked to a bundle entity whose v3_13 constituent
// set is complete; the rows carry no name, phone, or website, so
// nothing person-facing is lost. Retirement is bookkeeping only:
// one ledger row per retired source row in
// public.luminari_unattributable_row_retirements. No entity,
// location, contact, or source row is created, changed, or
// deleted. Reversal is a status flip on the ledger row, which the
// runner honors: a 'restored' row is never re-retired silently.
//
// Dry run by default. --apply requires --expected-manifest equal
// to the recomputed plan manifest. One transaction; inserted count
// is verified against the plan before commit.

import { readFileSync } from "node:fs";
import process from "node:process";

import {
  REPAIR_VERSION,
  manifestFor,
  planInserts,
  validatePlan,
} from "./retire-unattributable-rows-core.mjs";

async function loadPg() {
  return import("pg").catch(() => {
    throw new Error("pg package is required to run this script");
  });
}

export function loadEmbeddedPlan() {
  const url = new URL(
    "./unattributable-row-retirements-v1.json",
    import.meta.url,
  );
  return JSON.parse(readFileSync(url, "utf-8"));
}

async function main() {
  const apply = process.argv.includes("--apply");
  const expectedArg = process.argv.find((a) =>
    a.startsWith("--expected-manifest="),
  );
  const expectedManifest = expectedArg
    ? expectedArg.slice("--expected-manifest=".length)
    : null;

  const plan = loadEmbeddedPlan();
  const census = validatePlan(plan);
  const planManifest = manifestFor(plan);

  const { default: pgDefault } = await loadPg();
  const Pool = pgDefault?.Pool ?? (await loadPg()).Pool;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("set statement_timeout = '240s'");
    const ledgerRes = await client.query(
      `select bundle_entity_id, row_uid, status
         from public.luminari_unattributable_row_retirements`,
    );
    const { planned, alreadyRetired, heldByReversal } = planInserts(
      plan,
      ledgerRes.rows,
    );
    console.log(
      JSON.stringify({
        repair_version: REPAIR_VERSION,
        plan_total: census.total,
        plan_bundles: census.bundles,
        plan_by_tier: census.byTier,
        plan_manifest_sha256: planManifest,
        planned: planned.length,
        already_retired: alreadyRetired.length,
        held_by_reversal: heldByReversal.length,
      }),
    );
    if (heldByReversal.length > 0) {
      console.log(JSON.stringify({ held_by_reversal: heldByReversal }));
    }
    if (!apply) {
      console.log(
        "DRY RUN ONLY — pass --apply --expected-manifest=<sha256> to write ledger rows.",
      );
      return;
    }
    if (!expectedManifest || expectedManifest !== planManifest) {
      throw new Error(
        `--apply requires --expected-manifest equal to the recomputed plan manifest (${planManifest})`,
      );
    }
    await client.query("begin");
    try {
      let inserted = 0;
      for (const r of planned) {
        const res = await client.query(
          `insert into public.luminari_unattributable_row_retirements
             (bundle_entity_id, row_uid, sheet, row_number, evidence_tier,
              address_fragment, repair_version)
           values ($1, $2, $3, $4, $5, $6, $7)
           on conflict (bundle_entity_id, row_uid) do nothing`,
          [
            r.bundle_entity_id,
            r.row_uid,
            r.sheet,
            r.row_number,
            r.evidence_tier,
            r.address_fragment ?? null,
            REPAIR_VERSION,
          ],
        );
        inserted += res.rowCount;
      }
      if (inserted !== planned.length) {
        throw new Error(
          `inserted ${inserted} ledger rows, planned ${planned.length} — rolling back`,
        );
      }
      await client.query("commit");
      console.log(
        JSON.stringify({
          applied: inserted,
          plan_manifest_sha256: planManifest,
        }),
      );
    } catch (err) {
      await client.query("rollback");
      throw err;
    }
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

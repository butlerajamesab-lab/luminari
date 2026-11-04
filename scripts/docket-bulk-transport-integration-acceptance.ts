/**
 * Executable, disposable PostgreSQL transport-wiring acceptance.
 *
 * Executes the REAL tsx ZIP importer and REAL canonical Docket queue-worker
 * TypeScript against a local postgres16 fixture. The fixture supplies minimal
 * registration stubs explicitly: this does NOT certify the actual production
 * registration functions, full Civic Genome projection, Rosetta, or release.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import pg from "pg";

const { Pool } = pg;
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const root = "MT/2025-2025_Regular_Session";
const positiveBillId = 1895956;
const heldBillId = 1895957;
const reportAssertion = (result: ReturnType<typeof spawnSync>, report: string, phase: string) => {
  assert.equal(result.error, undefined, phase + ": process error");
  assert.equal(result.status, 1, phase + ": precisely one reported chronology hold");
  assert.ok(existsSync(report), phase + ": report was not written; stderr=" + String(result.stderr).slice(0,800));
  const parsed = JSON.parse(readFileSync(report, "utf8"));
  assert.deepEqual(parsed.totals.held, 1, phase + ": source event date was not held");
  assert.deepEqual(parsed.totals.invalid, 0, phase + ": invalid source");
  assert.deepEqual(parsed.totals.bill, 2);
  assert.deepEqual(parsed.totals.person, 1);
  assert.deepEqual(parsed.totals.roll_call, 1);
  assert.deepEqual(parsed.archives[0].holds, [{
    bill_id: heldBillId,
    member_path: root + "/bill/HB2.json",
    reason: "missing_source_event_date",
  }]);
  return parsed;
};

if (!process.env.DATABASE_URL || !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL)) {
  throw new Error("ci_docket_bulk_integration_requires_local_disposable_postgres");
}
if (process.env.LEGISCAN_API_KEY) {
  throw new Error("ci_docket_bulk_integration_must_not_have_paid_provider_credential");
}
process.env.DOCKET_BILL_ACTIVATION_SOURCE_SCOPE = "legiscan_bulk_json";
process.env.DOCKET_BILL_ACTIVATION_CONCURRENCY = "1";

const temp = mkdtempSync(join(tmpdir(), "docket-bulk-real-pg-"));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let workerPool: { end(): Promise<void> } | undefined;
try {
  const zip = new JSZip();
  const acceptedBill = {
    bill_id: positiveBillId, state: "MT", session_id: 2159,
    bill_number: "HB1", title: "Actual TypeScript Docket CI bill",
    status_date: "2026-06-01", texts: [{ doc_id: 10, type: "Introduced", state_link: "https://example.invalid/source" }],
  };
  const undatedBill = {
    bill_id: heldBillId, state: "MT", session_id: 2159,
    bill_number: "HB2", title: "Actual TypeScript Docket held bill",
    texts: [],
  };
  zip.file(root + "/bill/HB1.json", JSON.stringify({ bill: acceptedBill }));
  zip.file(root + "/bill/HB2.json", JSON.stringify({ bill: undatedBill }));
  zip.file(root + "/people/7855.json", JSON.stringify({
    person: { people_id: 7855, name: "Synthetic source person" },
  }));
  zip.file(root + "/vote/1481116.json", JSON.stringify({
    roll_call: { roll_call_id: 1481116, bill_id: positiveBillId },
  }));
  const bytes = await zip.generateAsync({ type: "nodebuffer" });
  const archive = "MT_2025-2025_Regular_Session_JSON_20260101_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.zip";
  const archivePath = join(temp, archive);
  const manifestPath = join(temp, "baseline_manifest.json");
  const report = join(temp, "report.json");
  writeFileSync(archivePath, bytes);
  const manifestBytes = Buffer.from(JSON.stringify({
    archives: [{ archive, sha256: sha256(bytes), bytes: bytes.length, jurisdiction: "MT", session_ids: "2159" }],
  }));
  writeFileSync(manifestPath, manifestBytes);
  const approvedHash = sha256(manifestBytes);
  const script = join(process.cwd(), "scripts/legiscan-bulk-docket-intake.ts");
  const tsx = join(process.cwd(), "node_modules/.bin/tsx");
  const runApply = () => spawnSync(tsx, [
    script, "--manifest=" + manifestPath, "--archive=" + archivePath,
    "--report=" + report, "--apply", "--acknowledge-docket-triggers",
  ], {
    cwd: process.cwd(), encoding: "utf8", timeout: 70_000,
    env: {
      ...process.env,
      DOCKET_BULK_ARCHIVE_APPLY_APPROVED_SHA256: approvedHash,
      LEGISCAN_API_KEY: "",
      NODE_ENV: "test",
    },
  });

  const first = reportAssertion(runApply(), report, "initial import");
  // One activated bill and one separately preserved held bill.
  assert.equal(first.totals.inserted, 1);
  assert.equal(first.totals.activated, 1);
  const count = async (sql: string): Promise<number> =>
    Number((await pool.query(sql)).rows[0].count);

  assert.equal(await count("select count(*) from public.docket_bill_detail_cache"), 2);
  assert.equal(await count("select count(*) from public.docket_legiscan_bulk_member_receipt"), 4);
  assert.equal(await count("select count(*) from public.docket_jurisdiction_activation_bill"), 1);
  assert.equal(await count("select count(*) from public.docket_bill_processing_queue"), 1);

  const held = (await pool.query(
    "select disposition from public.docket_legiscan_bulk_member_receipt where bill_id=$1",
    [heldBillId],
  )).rows;
  assert.deepEqual(held.map(row => row.disposition), ["held_chronology"]);

  const duplicate = reportAssertion(runApply(), report, "exact-repeat import");
  assert.equal(duplicate.totals.inserted, 0);
  assert.equal(duplicate.totals.activated, 0);
  assert.equal(await count("select count(*) from public.docket_bill_detail_cache"), 2);
  assert.equal(await count("select count(*) from public.docket_legiscan_bulk_member_receipt"), 4);
  assert.equal(await count("select count(*) from public.docket_bill_processing_queue"), 1);

  // Explicitly supplied downstream readiness; real Genome projection belongs
  // to an independent integration certification, not this Docket transport gate.
  await pool.query("insert into public.civic_genome_bill(structural_dna_json) values ($1::jsonb)", [
    JSON.stringify({ source_bill_id: positiveBillId }),
  ]);
  const { run_docket_bill_activation_queue_cycle } = await import(
    "../server/docket-jurisdiction-activation-queue-worker"
  );
  const { getPool } = await import("../server/db");
  workerPool = getPool();
  await run_docket_bill_activation_queue_cycle();

  const status = async () => (await pool.query(
    "select queue_state,receipt_json->>'terminal_state' as terminal_state,attempt_count from public.docket_bill_processing_queue where source_bill_id=$1",
    [positiveBillId],
  )).rows[0];
  assert.deepEqual(
    { queue_state: (await status()).queue_state, terminal_state: (await status()).terminal_state },
    { queue_state: "completed", terminal_state: "completed" },
  );

  // Simulate a worker crash after claim, then prove the exact stale-lease
  // recovery path reclaims and completes using the same canonical worker.
  await pool.query(`update public.docket_bill_processing_queue
     set queue_state='submitted', locked_at=now()-interval '31 minutes',
         locked_by='synthetic-crashed-worker',completed_at=null
     where source_bill_id=$1`, [positiveBillId]);
  await run_docket_bill_activation_queue_cycle();
  const recovered = await status();
  assert.equal(recovered.queue_state, "completed");
  assert.equal(recovered.terminal_state, "completed");
  assert.equal(recovered.attempt_count, 2);
  assert.equal(await count("select count(*) from public.docket_bill_processing_queue"), 1);

  // An existing canonical bill with divergent state must never be rewritten
  // by an archive member or registered as a second identity.
  const { accept_docket_bill_detail } = await import("../server/docket-bill-detail-acceptance");
  await assert.rejects(
    accept_docket_bill_detail({
      bill_id: positiveBillId, bill: { ...acceptedBill, state: "NV" },
      source: "legiscan_bulk_json",
      archive: {
        archive_sha256: sha256(bytes),
        member_path: root + "/bill/HB1.json",
        member_sha256: sha256(Buffer.from(JSON.stringify({ bill: acceptedBill }))),
      },
    }),
    /docket_bulk_existing_bill_identity_conflict/,
  );
  assert.equal(await count("select count(*) from public.docket_bill_detail_cache"), 2);

  console.log(JSON.stringify({
    acceptance: "passed",
    actual_zip_cli_process: true,
    actual_postgres_queries: true,
    actual_docket_queue_worker: true,
    bill_details: 2,
    immutable_source_receipts: 4,
    jobs: 1,
    chronology_holds: 1,
    duplicate_admission_created_jobs: 0,
    completed_after_first_worker: true,
    completed_after_stale_lease_reclaim: true,
    identity_conflict_rejected: true,
    paid_provider_credentials_present: false,
    downstream_function_implementations: "isolated_ci_stubs_not_production",
  }));
} finally {
  await workerPool?.end();
  await pool.end();
  rmSync(temp, { recursive: true, force: true });
}

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
const canaryBillIds = [2100010001, 2100010002, 2100010003, 2100010004, 2100010005];
const controlBillId = 2100010006;
const positiveBillIds = [...canaryBillIds, controlBillId];
const positiveBillId = canaryBillIds[0];
const heldBillId = 2100010007;
const reportAssertion = (result: ReturnType<typeof spawnSync>, report: string, phase: string) => {
  assert.equal(result.error, undefined, phase + ": process error");
  assert.equal(result.status, 0, phase + ": source-only admission preserves one held bill without error");
  assert.ok(existsSync(report), phase + ": report was not written; stderr=" + String(result.stderr).slice(0,800));
  const parsed = JSON.parse(readFileSync(report, "utf8"));
  assert.deepEqual(parsed.totals.held, 1, phase + ": source event date was not held");
  assert.deepEqual(parsed.totals.invalid, 0, phase + ": invalid source");
  assert.deepEqual(parsed.totals.bill, 7);
  assert.deepEqual(parsed.totals.person, 1);
  assert.deepEqual(parsed.totals.roll_call, 1);
  assert.deepEqual(parsed.archives[0].holds, [{
    bill_id: heldBillId,
    member_path: root + "/bill/HB7.json",
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
if (process.env.DOCKET_QUEUE_FIVE_JOB_TEST_ALLOW_RESET !== "true") {
  throw new Error("ci_docket_five_job_acceptance_requires_explicit_fixture_reset");
}
process.env.DOCKET_BILL_ACTIVATION_SOURCE_SCOPE = "legiscan_bulk_json";
process.env.DOCKET_BILL_ACTIVATION_CONCURRENCY = "5";

const temp = mkdtempSync(join(tmpdir(), "docket-bulk-real-pg-"));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let workerPool: { end(): Promise<void> } | undefined;
try {
  // The preceding transport integration shares this isolated PostgreSQL
  // service and leaves synthetic rows behind. Reset only the disposable
  // Docket fixture tables before this independent acceptance run.
  await pool.query(`truncate table
    public.docket_jurisdiction_activation_bill,
    public.docket_bill_processing_queue,
    public.docket_jurisdiction_activation_run,
    public.civic_genome_bill,
    public.docket_legiscan_bulk_member_receipt,
    public.docket_bill_detail_cache
  `);
  const zip = new JSZip();
  const acceptedBills = positiveBillIds.map((bill_id, index) => ({
    bill_id, state: "MT", session_id: 2159,
    bill_number: `HB${index + 1}`, title: `Synthetic archive CI bill ${index + 1}`,
    status_date: "2026-06-01",
    texts: [{ doc_id: 10 + index, type: "Introduced", state_link: "https://example.invalid/source" }],
  }));
  const acceptedBill = acceptedBills[0]!;
  const undatedBill = {
    bill_id: heldBillId, state: "MT", session_id: 2159,
    bill_number: "HB7", title: "Actual TypeScript Docket held bill",
    texts: [],
  };
  acceptedBills.forEach((bill, index) => {
    zip.file(root + `/bill/HB${index + 1}.json`, JSON.stringify({ bill }));
  });
  zip.file(root + "/bill/HB7.json", JSON.stringify({ bill: undatedBill }));
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
  // Six eligible archive bills and one separately preserved held bill.
  assert.equal(first.totals.inserted, 6);
  assert.equal(first.totals.activated, 6);
  const count = async (sql: string): Promise<number> =>
    Number((await pool.query(sql)).rows[0].count);

  assert.equal(await count("select count(*) from public.docket_bill_detail_cache"), 7);
  assert.equal(await count("select count(*) from public.docket_legiscan_bulk_member_receipt"), 9);
  assert.equal(await count("select count(*) from public.docket_jurisdiction_activation_bill"), 6);
  assert.equal(await count("select count(*) from public.docket_bill_processing_queue"), 6);
  // The held bill is source-preserved, not silently queued for activation.
  assert.equal(await count("select count(*) from public.docket_jurisdiction_activation_bill where source_bill_id=" + heldBillId), 0);
  assert.equal(await count("select count(*) from public.docket_bill_processing_queue where source_bill_id=" + heldBillId), 0);

  const held = (await pool.query(
    "select disposition from public.docket_legiscan_bulk_member_receipt where bill_id=$1",
    [heldBillId],
  )).rows;
  assert.deepEqual(held.map(row => row.disposition), ["held_chronology"]);

  const duplicate = reportAssertion(runApply(), report, "exact-repeat import");
  assert.equal(duplicate.totals.inserted, 0);
  assert.equal(duplicate.totals.activated, 0);
  assert.equal(await count("select count(*) from public.docket_bill_detail_cache"), 7);
  assert.equal(await count("select count(*) from public.docket_legiscan_bulk_member_receipt"), 9);
  assert.equal(await count("select count(*) from public.docket_bill_processing_queue"), 6);

  // Preseed five Genome identities solely to isolate archive queue claim,
  // verified-receipt reads, and version registration in this disposable DB.
  // This does not test new Genome projection/upsert or lifecycle-trigger behavior.
  // The sixth eligible archive job is a negative control.
  const { canonical_docket_bill_uuid } = await import("../server/docket-canonical-bill-id");
  for (const source_bill_id of canaryBillIds) {
    const canonicalUuid = canonical_docket_bill_uuid(source_bill_id);
    await pool.query(
      "insert into public.civic_genome_bill(bill_id, structural_dna_json) values ($1::uuid, $2::jsonb)",
      [canonicalUuid, JSON.stringify({ source_bill_id })],
    );
  }
  const queueRows = (await pool.query(
    "select queue_id::text,source_bill_id from public.docket_bill_processing_queue where source_bill_id=any($1::integer[])",
    [positiveBillIds],
  )).rows as Array<{ queue_id: string; source_bill_id: number }>;
  assert.equal(queueRows.length, 6);
  const allowlistedQueueIds = queueRows
    .filter(row => canaryBillIds.includes(row.source_bill_id))
    .map(row => row.queue_id);
  assert.equal(allowlistedQueueIds.length, 5);
  process.env.DOCKET_BILL_ACTIVATION_CANARY_QUEUE_IDS = allowlistedQueueIds.join(",");

  const { run_docket_bill_activation_queue_cycle } = await import(
    "../server/docket-jurisdiction-activation-queue-worker"
  );
  const { getPool } = await import("../server/db");
  workerPool = getPool();
  const status = async () => (await pool.query(
    "select source_bill_id,queue_state,receipt_json->>'terminal_state' as terminal_state,attempt_count from public.docket_bill_processing_queue order by source_bill_id",
  )).rows;
  await run_docket_bill_activation_queue_cycle();
  const afterFirstCycle = await status();
  for (const source_bill_id of canaryBillIds) {
    assert.ok(afterFirstCycle.some(row =>
      Number(row.source_bill_id) === source_bill_id
      && row.queue_state === "completed"
      && row.terminal_state === "completed"
    ), `allowlisted archive bill ${source_bill_id} did not complete`);
  }
  assert.ok(afterFirstCycle.some(row =>
    Number(row.source_bill_id) === controlBillId
    && row.queue_state === "eligible"
    && row.terminal_state === null
  ), "eligible archive job outside exact five-ID allowlist was claimed");
  // A second cycle must not reprocess completed canary jobs or admit the
  // eligible sixth control job. This proves idempotent completion and scope.
  await run_docket_bill_activation_queue_cycle();
  assert.deepEqual(await status(), afterFirstCycle);

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
  assert.equal(await count("select count(*) from public.docket_bill_detail_cache"), 7);

  console.log(JSON.stringify({
    acceptance: "passed",
    actual_zip_cli_process: true,
    actual_postgres_queries: true,
    actual_docket_queue_worker: true,
    bill_details: 7,
    immutable_source_receipts: 9,
    jobs: 5,
    exact_queue_allowlist: true,
    sixth_eligible_control_untouched: true,
    completed_cycle_rerun_no_change: true,
    chronology_holds: 1,
    duplicate_admission_created_jobs: 0,
    allowlisted_queue_jobs_completed: true,
    genome_readiness_fixture: "five_preseeded_identities",
    new_genome_projections: 0,
    identity_conflict_rejected: true,
    paid_provider_credentials_present: false,
    docket_registration_functions: "isolated_ci_stubs_not_production",
  }));
} finally {
  await workerPool?.end();
  await pool.end();
  rmSync(temp, { recursive: true, force: true });
}

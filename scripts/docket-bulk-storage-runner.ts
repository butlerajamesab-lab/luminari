/**
 * Source-only Storage -> existing canonical Docket CLI.
 *
 * This program NEVER starts a worker, calls LegiScan, runs migrations, changes
 * Docket routing, or publishes anything. --plan is the default. --verify does
 * a full offline archive preflight. --apply requires exact-manifest approval,
 * explicit trigger acknowledgment, and a bounded archive count.
 *
 * Examples:
 *   pnpm exec tsx scripts/docket-bulk-storage-runner.ts --plan
 *   pnpm exec tsx scripts/docket-bulk-storage-runner.ts --verify --max-archives=1
 *   DOCKET_BULK_ARCHIVE_APPLY_APPROVED_SHA256=<verified_sha> \
 *     pnpm exec tsx scripts/docket-bulk-storage-runner.ts \
 *     --apply --acknowledge-docket-triggers --max-archives=1
 */
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import JSZip from "jszip";
import { createClient } from "@supabase/supabase-js";
import {
  DOCKET_QUARANTINE_PREFIX, archiveQuarantinePath, classifyArchiveLocalPreflightFailure,
  makeArchiveQuarantine, validateArchiveQuarantine,
  type ArchiveLocalPreflightFailure, type DocketArchiveQuarantine
} from "./docket-bulk-archive-quarantine";
import { create_database_pool } from "../server/pg-config";
import {
  BASELINE_MANIFEST_SHA256, BASELINE_PILOT_OBJECT, chooseStorageObject,
  receiptState, validateManifest, type BaselineArchive, type ReceiptCounts
} from "./docket-bulk-storage-plan";

const PROJECT_REF = "wepxlinwbjrkqdzkqpar";
const PILOT_BUNDLE_SHA256 =
  "08e7348bdf64f1fa0c1cac41c40b2b1a38a111e2631e1985c635477f31cd5a45";
const args = process.argv.slice(2);
const flag = (name: string) => args.includes("--" + name);
const opt = (name: string) => {
  const arg = args.find(x => x.startsWith("--" + name + "="));
  return arg?.slice(name.length + 3) || null;
};
const modeFlags = ["plan", "verify", "apply"].filter(flag);
if (modeFlags.length > 1) throw new Error("docket_storage_choose_only_one_mode");
const mode = modeFlags[0] || "plan";
const maxArchives = Number(opt("max-archives") || "1");
if (!Number.isInteger(maxArchives) || maxArchives < 1 || maxArchives > 5) {
  throw new Error("docket_storage_max_archives_must_be_1_to_5");
}
const jurisdiction = opt("state");
if (jurisdiction && !/^(?:[A-Z]{2}|US)$/.test(jurisdiction)) {
  throw new Error("docket_storage_invalid_state");
}
if (args.some(x => !["--plan", "--verify", "--apply", "--acknowledge-docket-triggers"].includes(x)
                 && !/^--(?:max-archives|state)=/.test(x))) {
  throw new Error("docket_storage_unknown_argument");
}
const authorized = flag("acknowledge-docket-triggers") &&
  process.env.DOCKET_BULK_ARCHIVE_APPLY_APPROVED_SHA256 === BASELINE_MANIFEST_SHA256;
if (mode === "apply" && !authorized) {
  throw new Error("docket_storage_apply_requires_exact_manifest_approval_and_trigger_acknowledgment");
}
if (mode !== "apply" && flag("acknowledge-docket-triggers")) {
  throw new Error("docket_storage_trigger_acknowledgment_only_for_apply");
}

const storageKey = process.env.LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const storageUrl = (process.env.SUPABASE_URL ||
  "https://" + PROJECT_REF + ".supabase.co").replace(/\/$/, "");
const databaseUrl = process.env.DATABASE_URL;
if (!storageKey || !databaseUrl ||
    new URL(storageUrl).host !== PROJECT_REF + ".supabase.co" ||
    !databaseUrl.includes(PROJECT_REF)) {
  throw new Error("docket_storage_missing_credentials_or_wrong_production_project");
}
const root = storageUrl + "/storage/v1";
const headers = { apikey: storageKey, Authorization: "Bearer " + storageKey };
const docketStorage = createClient(storageUrl, storageKey, {
  auth: { autoRefreshToken: false, persistSession: false },
}).storage.from("Docket");

async function readQuarantineRecord(path: string): Promise<unknown> {
  const { data, error } = await docketStorage.download(path);
  if (error || !data) throw new Error("docket_quarantine_read_failed: " + path);
  const bytes = Buffer.from(await data.arrayBuffer());
  if (bytes.length > 8192) throw new Error("docket_quarantine_oversized_record: " + path);
  return JSON.parse(bytes.toString("utf8"));
}
async function persistArchiveQuarantine(
  archive: BaselineArchive, reason: ArchiveLocalPreflightFailure,
  receipts: ReceiptCounts,
): Promise<DocketArchiveQuarantine> {
  const record = makeArchiveQuarantine(archive, reason, receipts, new Date().toISOString());
  const path = archiveQuarantinePath(archive.sha256);
  const { error } = await docketStorage.upload(
    path, Buffer.from(JSON.stringify(record) + "\n", "utf8"),
    { contentType: "application/json", upsert: false },
  );
  // A preexisting record is NEVER overwritten. If acknowledgement or
  // readback fails, retain the global active latch.
  if (error) throw new Error("docket_quarantine_durable_create_failed: " + path + " " + error.message);
  const readback = validateArchiveQuarantine(
    archive, await readQuarantineRecord(path), receipts,
  );
  if (JSON.stringify(record) !== JSON.stringify(readback)) {
    throw new Error("docket_quarantine_readback_mismatch: " + path);
  }
  return readback;
}
const pool = create_database_pool({ label: "DocketStorage", max: 1, connection_timeout_millis: 10000 });

function sha(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
async function fileHash(file: string): Promise<string> {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest("hex");
}
async function storageDownload(name: string, output: string): Promise<void> {
  const response = await fetch(root + "/object/authenticated/Docket/" + encodeURIComponent(name),
    { headers });
  if (!response.ok || !response.body) {
    throw new Error("docket_storage_download_failed: " + name + " HTTP " + response.status);
  }
  await pipeline(Readable.fromWeb(response.body as any), createWriteStream(output, { flags: "wx" }));
}
type StorageObject = { name: string; metadata?: { size?: number | string } };
async function listObjects(prefix = ""): Promise<StorageObject[]> {
  const result: StorageObject[] = [];
  for (let offset = 0; offset < 10000; offset += 100) {
    const response = await fetch(root + "/object/list/Docket", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: 100, offset,
        sortBy: { column: "name", order: "asc" } })
    });
    if (!response.ok) throw new Error("docket_storage_list_failed_HTTP_" + response.status);
    const page: unknown = await response.json();
    if (!Array.isArray(page) ||
        page.some(x => !x || typeof x.name !== "string")) {
      throw new Error("docket_storage_invalid_list_response");
    }
    result.push(...page as StorageObject[]);
    if (page.length < 100) return result;
  }
  throw new Error("docket_storage_object_listing_exceeds_bound");
}
async function readCounts(entry: BaselineArchive): Promise<ReceiptCounts> {
  const result = await pool.query(
    "select count(*)::int as total, " +
    "count(*) filter(where member_kind='bill')::int as bill, " +
    "count(*) filter(where member_kind='roll_call')::int as roll_call, " +
    "count(*) filter(where member_kind='person')::int as person, " +
    "count(*) filter(where disposition='held_chronology')::int as held, " +
    "count(*) filter(where state is distinct from $2 or " +
    "(member_kind='bill' and (session_id::text = any(string_to_array($3,';'))) is not true))::int as wrong_identity " +
    "from public.docket_legiscan_bulk_member_receipt where archive_sha256=$1",
    [entry.sha256, entry.jurisdiction, entry.session_ids]
  );
  return result.rows[0] as ReceiptCounts;
}
async function assertProductionGuards(): Promise<void> {
  const m = await pool.query(
    "select count(*)::int as n from supabase_migrations.schema_migrations " +
    "where version in ('20261104084300','20261104090500')"
  );
  if (m.rows[0]?.n !== 2) throw new Error("docket_storage_required_migrations_changed");
  const f = await pool.query(
    "select md5(pg_get_functiondef(" +
    "'public.enqueue_docket_current_authoritative_version_v1()'::regprocedure)) as value"
  );
  if (f.rows[0]?.value !== "4315a2fc6e7fe6cb75bd34aeb53ec614") {
    throw new Error("docket_storage_activation_function_changed");
  }
}
async function assertPreexistingBillIdentities(entry: BaselineArchive,
                                               zipped: string): Promise<void> {
  // Check all bill IDs BEFORE the first write so a late collision cannot
  // strand earlier members in a partially committed archive.
  const zip = await JSZip.loadAsync(readFileSync(zipped), { checkCRC32: true });
  const billMembers = Object.values(zip.files).filter(file =>
    !file.dir && file.name.includes("/bill/") && file.name.endsWith(".json"));
  const expected = new Map<number, { state: string; session: string }>();
  for (const file of billMembers) {
    const parsed = JSON.parse((await file.async("nodebuffer")).toString("utf8"));
    const bill = parsed?.bill;
    const billId = Number(bill?.bill_id);
    if (!Number.isSafeInteger(billId) || billId < 1 ||
        bill?.state !== entry.jurisdiction ||
        !entry.session_ids.split(";").includes(String(bill?.session_id)) ||
        expected.has(billId)) {
      throw new Error("docket_storage_invalid_source_bill_identity: " + file.name);
    }
    expected.set(billId, { state: bill.state, session: String(bill.session_id) });
  }
  if (expected.size !== entry.types.bill) {
    throw new Error("docket_storage_source_bill_count_mismatch: " + entry.archive);
  }
  const ids = [...expected.keys()];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const result = await pool.query(
      "select bill_id,bill->>'state' as state,bill->>'session_id' as session " +
      "from public.docket_bill_detail_cache where bill_id=any($1::integer[])",
      [chunk]
    );
    for (const row of result.rows) {
      const identity = expected.get(row.bill_id);
      if (!identity || identity.state !== row.state ||
          identity.session !== row.session) {
        throw new Error("docket_storage_cached_bill_identity_conflict: " + row.bill_id);
      }
    }
  }
}
async function assertBillReceiptCache(entry: BaselineArchive): Promise<void> {
  const result = await pool.query(
    "select count(*)::int as missing from " +
    "public.docket_legiscan_bulk_member_receipt r " +
    "left join public.docket_bill_detail_cache d on d.bill_id=r.bill_id " +
    "where r.archive_sha256=$1 and r.member_kind='bill' and " +
    "(d.bill_id is null or d.bill->>'state' is distinct from $2 or " +
    "(d.bill->>'session_id' = any(string_to_array($3,';'))) is not true)",
    [entry.sha256, entry.jurisdiction, entry.session_ids]
  );
  if (result.rows[0]?.missing !== 0) {
    throw new Error("docket_storage_bill_cache_missing_or_mismatched: " + entry.archive);
  }
}
async function assertExistingMemberHashes(entry: BaselineArchive, zipped: string): Promise<void> {
  const rows = await pool.query(
    "select member_path,member_sha256 from public.docket_legiscan_bulk_member_receipt " +
    "where archive_sha256=$1 order by member_path",
    [entry.sha256]
  );
  if (rows.rowCount === 0) return;
  const zip = await JSZip.loadAsync(readFileSync(zipped), { checkCRC32: true });
  for (const row of rows.rows) {
    const member = zip.file(row.member_path);
    if (!member || sha(await member.async("nodebuffer")) !== row.member_sha256) {
      throw new Error("docket_storage_existing_receipt_hash_conflict: " + row.member_path);
    }
  }
}
class ArchiveLocalPreflightRejection extends Error {
  constructor(readonly evidence: ArchiveLocalPreflightFailure) {
    super("docket_archive_local_preflight_rejected: " + evidence.reason_code);
  }
}
async function runCanonicalImporter(manifestFile: string, archiveFile: string,
                                    reportFile: string, apply: boolean): Promise<void> {
  const command = [
    "exec", "tsx", "scripts/legiscan-bulk-docket-intake.ts",
    "--manifest=" + manifestFile, "--archive=" + archiveFile,
    "--report=" + reportFile
  ];
  if (apply) command.push("--apply", "--acknowledge-docket-triggers");
  let stderrTail = "";
  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn("pnpm", command, {
      cwd: process.cwd(), stdio: ["ignore", "inherit", "pipe"],
      env: { ...process.env, LEGISCAN_API_KEY: "" }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      const output = chunk.toString("utf8");
      process.stderr.write(output);
      stderrTail = (stderrTail + output).slice(-16384);
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) return reject(new Error("docket_storage_cli_signal_" + signal));
      resolve(code ?? 1);
    });
  });
  if (exitCode !== 0) {
    const local = !apply ? classifyArchiveLocalPreflightFailure(stderrTail) : null;
    if (local) throw new ArchiveLocalPreflightRejection(local);
    // A generic exit, signal, deployment problem or DB failure cannot be
    // silently treated as a quarantinable source-member error.
    throw new Error("docket_storage_canonical_cli_failed_exit_" + exitCode);
  }
}
async function main(): Promise<void> {
  const temporary = await mkdtemp(join(tmpdir(), "docket-storage-"));
  try {
    const bundle = join(temporary, "pilot.zip");
    await storageDownload(BASELINE_PILOT_OBJECT, bundle);
    if (await fileHash(bundle) !== PILOT_BUNDLE_SHA256) {
      throw new Error("docket_storage_pilot_bundle_sha256_mismatch");
    }
    const pilot = await JSZip.loadAsync(readFileSync(bundle), { checkCRC32: true });
    const entry = pilot.file("legislative_baseline_manifest.json");
    if (!entry) throw new Error("docket_storage_manifest_not_in_pilot");
    const manifestBytes = await entry.async("nodebuffer");
    if (sha(manifestBytes) !== BASELINE_MANIFEST_SHA256) {
      throw new Error("docket_storage_manifest_sha256_mismatch");
    }
    const manifest = validateManifest(JSON.parse(manifestBytes.toString("utf8")));
    const manifestFile = join(temporary, "baseline.json");
    writeFileSync(manifestFile, manifestBytes, { flag: "wx" });
    await assertProductionGuards();
    const objects = await listObjects();
    const names = objects.map(x => x.name);
    const entries = jurisdiction
      ? manifest.archives.filter(x => x.jurisdiction === jurisdiction)
      : manifest.archives;
    let complete = 0, remaining = 0, processed = 0, quarantined = 0;
    const pending: Array<{
      entry: BaselineArchive; objectName: string | null; state: string;
      sourceIssue: ArchiveLocalPreflightFailure | null;
    }> = [];
    // Supabase Storage lists folder contents by prefix, not recursively from
    // the bucket root. A separate bounded listing is mandatory: otherwise a
    // quarantined ZIP could be selected again on the next scheduled run.
    const quarantineObjects = new Set(
      (await listObjects(DOCKET_QUARANTINE_PREFIX)).map(x => x.name)
    );
    for (const source of entries) {
      const counts = await readCounts(source);
      const state = receiptState(source, counts);
      const quarantinePath = archiveQuarantinePath(source.sha256);
      if (quarantineObjects.has(quarantinePath) ||
          quarantineObjects.has(source.sha256 + ".json")) {
        if (state === "complete") {
          throw new Error("docket_quarantine_archive_appears_complete_requires_review: " + source.archive);
        }
        const evidence = validateArchiveQuarantine(
          source, await readQuarantineRecord(quarantinePath), counts,
        );
        // Quarantined archives are still outstanding, never completed or retried.
        quarantined++;
        remaining++;
        console.log(JSON.stringify({
          archive: source.archive, receipt_state: "quarantined",
          source_receipts: counts.total, expected_json: source.json,
          quarantine_reason: evidence.reason_code,
        }));
        continue;
      }
      if (state === "held") {
        throw new Error("docket_storage_chronology_hold_requires_review: " + source.archive);
      }
      // First thirteen archives were staged in older batch bundles, not
      // necessarily as standalone Storage objects. Do not demand a second
      // upload for an already-complete, receipt-verified archive.
      let objectName: string | null = null;
      let sourceIssue: ArchiveLocalPreflightFailure | null = null;
      if (state === "complete") {
        await assertBillReceiptCache(source);
        complete++;
      } else {
        try {
          objectName = chooseStorageObject(source.archive, names);
        } catch (error) {
          if (!(error instanceof Error) ||
              !error.message.startsWith("docket_storage_ambiguous_or_missing_archive:")) throw error;
          sourceIssue = {
            reason_code: "docket_storage_ambiguous_or_missing_archive",
            member_path: null,
          };
        }
        if (objectName) {
          const object = objects.find(x => x.name === objectName)!;
          if (object.metadata?.size != null && Number(object.metadata.size) !== source.bytes) {
            sourceIssue = { reason_code: "docket_storage_object_size_mismatch", member_path: null };
          }
        }
        remaining++;
        pending.push({ entry: source, objectName, state, sourceIssue });
      }
      console.log(JSON.stringify({
        archive: source.archive, storage_object: objectName,
        expected_json: source.json, receipt_state: state
      }));
    }
    console.log(JSON.stringify({ mode, inventoried: entries.length, complete,
      remaining, quarantined, selected_count: Math.min(maxArchives, pending.length),
      selected_archive_sha256: pending[0]?.entry.sha256 || null }));
    if (mode === "plan") return;
    if (pending.length === 0 && remaining > 0) {
      console.log(JSON.stringify({ result: "waiting_review", mode,
        processed: 0, quarantined, remaining }));
      return;
    }
    const quarantineSelectedArchive = async (
      item: (typeof pending)[number], failure: ArchiveLocalPreflightFailure,
      originalZip: string | null,
    ): Promise<void> => {
      if (mode !== "apply") throw new Error("docket_quarantine_requires_apply_mode");
      const counts = await readCounts(item.entry);
      if (receiptState(item.entry, counts) !== item.state) {
        throw new Error("docket_quarantine_source_receipt_state_drift");
      }
      if (counts.total > 0) {
        // A partial archive can be isolated ONLY if every existing member
        // hash and cache identity is reconciled against the exact original ZIP.
        if (!originalZip) throw new Error("docket_quarantine_partial_missing_original");
        await assertExistingMemberHashes(item.entry, originalZip);
        await assertBillReceiptCache(item.entry);
      }
      const evidence = await persistArchiveQuarantine(item.entry, failure, counts);
      console.log("DOCKET_SOURCE_ARCHIVE_QUARANTINED " + item.entry.archive +
        " reason=" + evidence.reason_code + " source_receipts=" + counts.total);
      console.log(JSON.stringify({ result: "quarantined", mode,
        processed, archive: item.entry.archive, archive_sha256: item.entry.sha256,
        reason_code: evidence.reason_code }));
    };
    for (const item of pending.slice(0, maxArchives)) {
      const local = join(temporary, item.entry.archive);
      const report = join(temporary, item.entry.jurisdiction + "-preflight.json");
      console.log("VALIDATE " + item.entry.archive);
      if (item.sourceIssue) {
        await quarantineSelectedArchive(item, item.sourceIssue, null);
        return;
      }
      if (!item.objectName) throw new Error("docket_storage_selected_archive_object_missing");
      await storageDownload(item.objectName, local);
      if ((await fileHash(local)) !== item.entry.sha256) {
        await quarantineSelectedArchive(item,
          { reason_code: "docket_storage_archive_sha256_mismatch", member_path: null }, null);
        return;
      }
      if (item.state === "partial") await assertExistingMemberHashes(item.entry, local);
      try {
        await runCanonicalImporter(manifestFile, local, report, false);
      } catch (error) {
        if (!(error instanceof ArchiveLocalPreflightRejection) || mode !== "apply") throw error;
        // The canonical CLI ran without --apply; no database writer was loaded.
        await quarantineSelectedArchive(item, error.evidence, local);
        return;
      }
      if (mode === "apply") {
        await assertPreexistingBillIdentities(item.entry, local);
        console.log("APPLY " + item.entry.archive);
        await runCanonicalImporter(manifestFile, local,
          join(temporary, item.entry.jurisdiction + "-apply.json"), true);
        const stats = await readCounts(item.entry);
        const result = receiptState(item.entry, stats);
        if (result !== "complete") {
          throw new Error("docket_storage_postapply_incomplete: " +
            item.entry.archive + " saved=" + stats.total + "/" + item.entry.json);
        }
        await assertBillReceiptCache(item.entry);
        console.log("PASS SOURCE RECEIPTS " + item.entry.archive +
          " " + stats.total + "/" + item.entry.json + " holds=" + stats.held);
        if (stats.held > 0) {
          console.log("DOCKET_SOURCE_CHRONOLOGY_HELD " + item.entry.archive +
            " held=" + stats.held + " source-preserved; downstream activation blocked");
        }
      } else {
        console.log("PASS OFFLINE PREFLIGHT " + item.entry.archive);
      }
      processed++;
      await rm(local, { force: true });
    }
    console.log(JSON.stringify({ result: "complete", mode, processed }));
  } finally {
    await pool.end();
    await rm(temporary, { recursive: true, force: true });
  }
}
await main();

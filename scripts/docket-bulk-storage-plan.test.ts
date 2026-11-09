import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  BASELINE_ARCHIVE_COUNT, BASELINE_MANIFEST_SHA256,
  canonicalArchiveName, chooseStorageObject, receiptState, validateManifest,
  type BaselineArchive, type ReceiptCounts
} from "./docket-bulk-storage-plan";

const entry: BaselineArchive = {
  archive: "MO_2026-2026_Regular_Session_JSON_20260820_deadbeef.zip",
  sha256: "a".repeat(64), bytes: 700, jurisdiction: "MO", session_ids: "100;101",
  json: 6, types: { bill: 2, vote: 3, people: 1 }
};
const receipt = (part: Partial<ReceiptCounts> = {}): ReceiptCounts => ({
  total: 0, bill: 0, roll_call: 0, person: 0, wrong_identity: 0, held: 0, ...part
});

test("normalized Storage object names support upload-only suffix, not new legislative identity", () => {
  const renamed = entry.archive.replace(/\.zip$/, " (1).zip");
  assert.equal(canonicalArchiveName(renamed), entry.archive);
  assert.equal(chooseStorageObject(entry.archive, [renamed]), renamed);
  assert.equal(chooseStorageObject(entry.archive, [entry.archive]), entry.archive);
  assert.throws(() => chooseStorageObject(entry.archive, []), /ambiguous_or_missing/);
  assert.throws(() => chooseStorageObject(entry.archive, [entry.archive, renamed]), /matches=2/);
  assert.equal(canonicalArchiveName("MO_trial (0).zip"), "MO_trial (0).zip");
});

test("receipt states are exact-count based; existing partial receipts are not treated as complete", () => {
  assert.equal(receiptState(entry, receipt()), "not_started");
  assert.equal(receiptState(entry, receipt({ total: 2, bill: 2 })), "partial");
  assert.equal(receiptState(entry, receipt({ total: 6, bill: 2, roll_call: 3, person: 1 })), "complete");
  assert.throws(() => receiptState(entry, receipt({ total: 6, bill: 3, roll_call: 2, person: 1 })), /integrity_mismatch/);
  assert.throws(() => receiptState(entry, receipt({ total: 7, bill: 2, roll_call: 3, person: 2 })), /integrity_mismatch/);
  assert.throws(() => receiptState(entry, receipt({ total: 1, bill: 1, wrong_identity: 1 })), /integrity_mismatch/);
});

test("original manifest guard requires 60 unique, fully attributed archival identities", () => {
  const archives = Array.from({ length: BASELINE_ARCHIVE_COUNT }, (_, i) => ({
    ...entry,
    archive: "MO_session" + i + "_JSON_2026_sample.zip",
    sha256: i.toString(16).padStart(64, "0")
  }));
  const result = validateManifest({ archives });
  assert.equal(result.archives.length, 60);
  assert.match(BASELINE_MANIFEST_SHA256, /^[a-f0-9]{64}$/);
  assert.throws(() => validateManifest({ archives: archives.slice(1) }), /count_mismatch/);
  const duplicate = archives.map(x => ({...x}));
  duplicate[1].archive = duplicate[0].archive;
  assert.throws(() => validateManifest({ archives: duplicate }), /duplicate_manifest_entry/);
  const malformed = archives.map(x => ({...x}));
  malformed[1].json = 500;
  assert.throws(() => validateManifest({ archives: malformed }), /invalid_manifest_entry/);
});

test("Storage runner is opt-in; existing canonical importer and no paid API calls", () => {
  const source = readFileSync("scripts/docket-bulk-storage-runner.ts", "utf8");
  assert.match(source, /const mode = modeFlags\[0\] \|\| "plan"/);
  assert.match(source, /docket_storage_apply_requires_exact_manifest_approval/);
  assert.match(source, /DOCKET_BULK_ARCHIVE_APPLY_APPROVED_SHA256/);
  assert.match(source, /legiscan-bulk-docket-intake\.ts/);
  assert.match(source, /LEGISCAN_API_KEY: ""/);
  assert.match(source, /if \(state === "complete"\)/);
  assert.match(source, /docket_storage_existing_receipt_hash_conflict/);
  assert.doesNotMatch(source, /(?:create_cron_job|trigger_deploy|CREATE TABLE|TRUNCATE|DELETE FROM)/);
});

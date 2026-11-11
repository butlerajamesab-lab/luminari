import { describe, expect, it } from "vitest";
import {
  archiveQuarantinePath, classifyArchiveLocalPreflightFailure,
  makeArchiveQuarantine, validateArchiveQuarantine
} from "./docket-bulk-archive-quarantine";
import type { BaselineArchive, ReceiptCounts } from "./docket-bulk-storage-plan";

const archive: BaselineArchive = {
  archive: "AZ_2026-2026_2nd_Regular_JSON_20260622_test.zip",
  sha256: "a".repeat(64), bytes: 9900591, jurisdiction: "AZ",
  session_ids: "2235", json: 9565,
  types: { bill: 2190, vote: 7283, people: 92 },
};
const counts: ReceiptCounts = {
  total: 0, bill: 0, roll_call: 0, person: 0, held: 0, wrong_identity: 0,
};
const failure = { reason_code: "docket_bulk_wrong_member_wrapper", member_path: "AZ/session/bill/HB1.json" };

describe("Archive-local quarantine preserves strict failure evidence", () => {
  it("recognizes whitelisted source-shape errors and rejects infrastructure failures", () => {
    expect(classifyArchiveLocalPreflightFailure(
      "Error: docket_bulk_wrong_member_wrapper: AZ/session/bill/HB1.json\n  at parse(...)"
    )).toEqual(failure);
    expect(classifyArchiveLocalPreflightFailure(
      "Error: docket_bulk_invalid_json_member: AZ/session/bill/HB9.json\n"
    )?.reason_code).toBe("docket_bulk_invalid_json_member");
    for (const message of [
      "Error: docket_storage_missing_credentials_or_wrong_production_project",
      "Error: docket_bulk_apply_requires_exact_manifest_approval_and_trigger_acknowledgment",
      "Error: docket_bulk_existing_bill_identity_conflict",
      "Error: connection terminated unexpectedly",
      "Killed",
      "Error: docket_storage_canonical_cli_failed_exit_1",
      "Error: docket_bulk_wrong_member_wrappered: AZ/session/bill/HB1.json",
    ]) {
      expect(classifyArchiveLocalPreflightFailure(message)).toBeNull();
    }
  });

  it("pins a durable record to exact manifest and archive SHA, not a filename alone", () => {
    const path = archiveQuarantinePath(archive.sha256);
    expect(path).toBe("_docket_intake_control/quarantine/" + archive.sha256 + ".json");
    expect(() => archiveQuarantinePath("not-a-sha")).toThrow("invalid_archive_sha");
    const record = makeArchiveQuarantine(archive, failure, counts, "2026-11-11T01:02:10Z");
    expect(validateArchiveQuarantine(archive, record, counts)).toEqual(record);
    expect(record.status).toBe("requires_operator_review");
    expect(record.receipt_count).toBe(0);
    expect(() => validateArchiveQuarantine({ ...archive, sha256: "b".repeat(64) }, record, counts))
      .toThrow("record_mismatch");
    expect(() => validateArchiveQuarantine(archive, { ...record, status: "resolved" }, counts))
      .toThrow("record_mismatch");
    expect(() => validateArchiveQuarantine(archive, { ...record, manifest_sha256: "0".repeat(64) }, counts))
      .toThrow("record_mismatch");
    expect(() => validateArchiveQuarantine(archive, record, { ...counts, total: 1, bill: 1 }))
      .toThrow("record_mismatch");
  });

  it("isolates missing and corrupt ZIPs but not Storage outages", () => {
    for (const reason_code of [
      "docket_storage_ambiguous_or_missing_archive",
      "docket_storage_object_size_mismatch",
      "docket_storage_archive_sha256_mismatch",
    ]) {
      const record = makeArchiveQuarantine(archive, {
        reason_code, member_path: null,
      }, counts, "2026-11-11T01:02:10Z");
      expect(validateArchiveQuarantine(archive, record, counts).reason_code).toBe(reason_code);
    }
    expect(() => makeArchiveQuarantine(archive, {
      reason_code: "docket_storage_download_failed", member_path: null,
    }, counts, "2026-11-11T01:02:10Z")).toThrow("unverified_local_failure");
  });
  it("can pin previously imported partial receipts but refuses unverified global errors", () => {
    const partial: ReceiptCounts = {
      total: 120, bill: 100, roll_call: 20, person: 0, held: 1, wrong_identity: 0,
    };
    const record = makeArchiveQuarantine(archive, failure, partial, "2026-11-11T01:02:10Z");
    expect(validateArchiveQuarantine(archive, record, partial)).toEqual(record);
    expect(() => makeArchiveQuarantine(archive, {
      reason_code: "docket_storage_canonical_cli_failed_exit_1", member_path: null,
    }, partial, "2026-11-11T01:02:10Z")).toThrow("unverified_local_failure");
  });
});

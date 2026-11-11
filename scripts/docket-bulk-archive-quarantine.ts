/**
 * An archive-local preflight rejection is not a global Docket outage.
 * The manifest SHA and every archive identity remain immutable. Quarantine
 * records never authorize a retry or certify that an archive was imported.
 */
import { BASELINE_MANIFEST_SHA256, type BaselineArchive, type ReceiptCounts } from "./docket-bulk-storage-plan";

export const DOCKET_QUARANTINE_PREFIX = "_docket_intake_control/quarantine/";

const quarantinableSourceErrors = new Set([
  "docket_bulk_archive_manifest_mismatch",
  "docket_bulk_repeated_bill_id_across_archives",
  "docket_bulk_member_path_mismatch",
  "docket_bulk_unrecognized_json_member",
  "docket_bulk_invalid_json_member",
  "docket_bulk_wrong_member_wrapper",
  "docket_bulk_invalid_member_envelope",
  "docket_bulk_invalid_member_payload",
  "docket_bulk_invalid_member_id",
  "docket_bulk_filename_id_mismatch",
  "docket_bulk_bill_identity_mismatch",
]);

export type ArchiveLocalPreflightFailure = {
  reason_code: string;
  member_path: string | null;
};

export type DocketArchiveQuarantine = {
  version: 1;
  status: "requires_operator_review";
  manifest_sha256: string;
  archive: string;
  archive_sha256: string;
  reason_code: string;
  member_path: string | null;
  receipt_count: number;
  held_count: number;
  created_at: string;
};

export function archiveQuarantinePath(sha256: string): string {
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("docket_quarantine_invalid_archive_sha");
  return DOCKET_QUARANTINE_PREFIX + sha256 + ".json";
}

/**
 * Only an independently classified, deterministic source-member shape error
 * is eligible. Generic process exits, signals, DB failures and permissions
 * errors must retain the global safety latch.
 */
export function classifyArchiveLocalPreflightFailure(stderr: string): ArchiveLocalPreflightFailure | null {
  const match = stderr.match(/(?:^|\n)Error: (docket_bulk_[a-z0-9_]+)(?:: ([^\r\n]*))?(?:\r?\n|$)/);
  if (!match || !quarantinableSourceErrors.has(match[1])) return null;
  return { reason_code: match[1], member_path: match[2]?.trim() || null };
}

export function makeArchiveQuarantine(
  archive: BaselineArchive, reason: ArchiveLocalPreflightFailure,
  receipts: ReceiptCounts, createdAt: string,
): DocketArchiveQuarantine {
  if (!quarantinableSourceErrors.has(reason.reason_code) ||
      !Number.isFinite(Date.parse(createdAt)) ||
      receipts.total < 0 || receipts.held > receipts.bill ||
      receipts.wrong_identity !== 0) throw new Error("docket_quarantine_unverified_local_failure");
  return {
    version: 1,
    status: "requires_operator_review",
    manifest_sha256: BASELINE_MANIFEST_SHA256,
    archive: archive.archive,
    archive_sha256: archive.sha256,
    reason_code: reason.reason_code,
    member_path: reason.member_path,
    receipt_count: receipts.total,
    held_count: receipts.held,
    created_at: createdAt,
  };
}

export function validateArchiveQuarantine(
  archive: BaselineArchive, data: unknown, receipts: ReceiptCounts,
): DocketArchiveQuarantine {
  const q = data as Partial<DocketArchiveQuarantine> | null;
  if (!q || typeof q !== "object" ||
      q.version !== 1 || q.status !== "requires_operator_review" ||
      q.manifest_sha256 !== BASELINE_MANIFEST_SHA256 ||
      q.archive !== archive.archive || q.archive_sha256 !== archive.sha256 ||
      typeof q.reason_code !== "string" || !quarantinableSourceErrors.has(q.reason_code) ||
      (q.member_path !== null && typeof q.member_path !== "string") ||
      !Number.isSafeInteger(q.receipt_count) || q.receipt_count !== receipts.total ||
      !Number.isSafeInteger(q.held_count) || q.held_count !== receipts.held ||
      typeof q.created_at !== "string" || !Number.isFinite(Date.parse(q.created_at))) {
    throw new Error("docket_quarantine_record_mismatch: " + archive.archive);
  }
  return q as DocketArchiveQuarantine;
}

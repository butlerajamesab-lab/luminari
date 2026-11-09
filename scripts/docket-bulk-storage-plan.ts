/**
 * Pure, deterministic planning and guard helpers for source-only LegiScan imports.
 * No network, databases, worker registration, or mutation in this module.
 */
export const BASELINE_MANIFEST_SHA256 =
  "c0fda81b255685a7e9bb55083195cbbeafe922afab78b50a2daa0eab9695bb80";
export const BASELINE_ARCHIVE_COUNT = 60;
export const BASELINE_PILOT_OBJECT = "docket_nv_pilot_bundle.zip";

export type BaselineArchive = {
  archive: string;
  sha256: string;
  bytes: number;
  jurisdiction: string;
  session_ids: string;
  json: number;
  types: { bill: number; vote: number; people: number };
};
export type BaselineManifest = { archives: BaselineArchive[] };
export type ReceiptCounts = {
  total: number;
  bill: number;
  roll_call: number;
  person: number;
  wrong_identity: number;
  held: number;
};

const hash = /^[a-f0-9]{64}$/;
const zipName = /^[A-Z]{2}_.+_JSON_.+\.zip$/;
export function canonicalArchiveName(name: string): string {
  // The (n) suffix is an upload rename, NOT a new legislative archive.
  return name.replace(/ \([1-9][0-9]*\)(?=\.zip$)/, "");
}
export function chooseStorageObject(expected: string, names: string[]): string {
  const matches = names.filter(x => canonicalArchiveName(x) === expected);
  if (matches.length !== 1) {
    throw new Error("docket_storage_ambiguous_or_missing_archive: " + expected + " matches=" + matches.length);
  }
  return matches[0];
}
export function validateManifest(raw: unknown): BaselineManifest {
  if (!raw || typeof raw !== "object") throw new Error("docket_storage_invalid_manifest");
  const manifest = raw as BaselineManifest;
  if (!Array.isArray(manifest.archives) ||
      manifest.archives.length !== BASELINE_ARCHIVE_COUNT) {
    throw new Error("docket_storage_manifest_count_mismatch");
  }
  const names = new Set<string>();
  const shaSet = new Set<string>();
  for (const item of manifest.archives) {
    if (!item || typeof item.archive !== "string" || !zipName.test(item.archive) ||
        typeof item.sha256 !== "string" || !hash.test(item.sha256) ||
        !Number.isSafeInteger(item.bytes) || item.bytes < 1 ||
        !/^(?:[A-Z]{2}|US)$/.test(item.jurisdiction) ||
        !item.archive.startsWith(item.jurisdiction + "_") ||
        typeof item.session_ids !== "string" || !/^[0-9]+(?:;[0-9]+)*$/.test(item.session_ids) ||
        !Number.isSafeInteger(item.json) || item.json < 1 ||
        !item.types || !["bill", "vote", "people"].every(k =>
          Number.isSafeInteger(item.types[k as keyof BaselineArchive["types"]]) &&
          item.types[k as keyof BaselineArchive["types"]] >= 0) ||
        item.json !== item.types.bill + item.types.vote + item.types.people) {
      throw new Error("docket_storage_invalid_manifest_entry: " + String(item?.archive));
    }
    if (names.has(item.archive) || shaSet.has(item.sha256)) {
      throw new Error("docket_storage_duplicate_manifest_entry: " + item.archive);
    }
    names.add(item.archive);
    shaSet.add(item.sha256);
  }
  return manifest;
}
export function receiptState(entry: BaselineArchive, counts: ReceiptCounts):
  "not_started" | "partial" | "complete" | "held" {
  const values = Object.values(counts);
  if (values.some(v => !Number.isSafeInteger(v) || v < 0) ||
      counts.wrong_identity > 0 ||
      counts.total !== counts.bill + counts.roll_call + counts.person ||
      counts.held > counts.bill ||
      counts.total > entry.json ||
      counts.bill > entry.types.bill ||
      counts.roll_call > entry.types.vote ||
      counts.person > entry.types.people) {
    throw new Error("docket_storage_receipt_integrity_mismatch: " + entry.archive);
  }
  if (counts.held > 0) return "held";
  if (counts.total === 0) return "not_started";
  if (counts.total === entry.json) {
    if (counts.bill !== entry.types.bill || counts.roll_call !== entry.types.vote ||
        counts.person !== entry.types.people) {
      throw new Error("docket_storage_receipt_kind_mismatch: " + entry.archive);
    }
    return "complete";
  }
  return "partial";
}

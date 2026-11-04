import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { createHash } from "node:crypto";
import JSZip from "jszip";



import { parse_docket_bulk_json_member } from "../server/docket-bulk-json-member";

type manifest_archive = { archive: string; sha256: string; bytes: number; jurisdiction: string; session_ids: string };
type record_kind = "bill" | "person" | "roll_call";
const sha = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");

function option(name: string): string | null {
  const item = process.argv.find(x => x.startsWith("--" + name + "="));
  return item?.slice(name.length + 3) || null;
}
const archive_arguments = process.argv.filter(x => x.startsWith("--archive=")).map(x => x.slice(10));
const manifest_path = option("manifest");
const report_path = option("report") || "legiscan-bulk-preflight.json";
const applying = process.argv.includes("--apply");

if (!manifest_path || archive_arguments.length === 0) {
  throw new Error("usage: tsx scripts/legiscan-bulk-docket-intake.ts --manifest=<baseline_manifest.json> --archive=<ZIP> [--archive=<ZIP>] [--report=<json>] [--apply]");
}
const manifest_bytes = readFileSync(resolve(manifest_path));
const manifest_sha256 = sha(manifest_bytes);
const manifest = JSON.parse(manifest_bytes.toString("utf8")) as { archives: manifest_archive[] };
if (!Array.isArray(manifest.archives)) throw new Error("docket_bulk_invalid_manifest");
if (applying) {
  if (process.env.DOCKET_BULK_ARCHIVE_APPLY_APPROVED_SHA256 !== manifest_sha256 ||
      !process.argv.includes("--acknowledge-docket-triggers")) {
    throw new Error("docket_bulk_apply_requires_exact_manifest_approval_and_trigger_acknowledgment");
  }
}
// Only load any Docket writer module after the exact manifest approval check.
// Dry-run remains fully offline; unauthorized --apply cannot initialize the DB.
// No Lighthouse DB/worker modules are evaluated during offline dry-run.
// The original ZIP manifest and every JSON member can be verified with no
// database credentials, network transport, or implicit scheduler startup.
const writer_modules = applying ? await Promise.all([
  import("../server/docket-bill-detail-acceptance"),
]) : null;
const inventory = new Map(manifest.archives.map(item => [item.archive, item]));
const result = {
  mode: applying ? "apply" : "dry_run",
  manifest_sha256,
  archives: [] as Array<Record<string, unknown>>,
  totals: { bill: 0, person: 0, roll_call: 0, invalid: 0, inserted: 0, activated: 0, existing_preserved: 0, held: 0 },
};
const seen = new Set<number>();
for (const archive_path of archive_arguments) {
  const bytes = readFileSync(resolve(archive_path));
  const name = basename(archive_path);
  const expected = inventory.get(name);
  if (!expected || bytes.length !== expected.bytes || sha(bytes) !== expected.sha256) {
    throw new Error("docket_bulk_archive_manifest_mismatch: " + name);
  }
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const members = Object.values(zip.files).filter(file => !file.dir && file.name.endsWith(".json"))
    .sort((a,b) => a.name.localeCompare(b.name));
  // Validate the whole archive with one member at a time. Retain only
  // identity and hash metadata, never decoded payloads from every member.
  // US / NY ZIPs can expand to hundreds of megabytes.
  const staged: Array<{
    kind: record_kind; id: number; path: string; member_hash: string;
  }> = [];
  const counts = { bill: 0, person: 0, roll_call: 0, invalid: 0, inserted: 0, activated: 0, existing_preserved: 0, held: 0 };
  for (const file of members) {
    const raw = await file.async("nodebuffer");
    const parsed = parse_docket_bulk_json_member(
      file.name, raw, expected.jurisdiction, expected.session_ids,
    );
    const { kind, payload, id } = parsed;
    if (kind === "bill") {
      if (seen.has(id)) throw new Error("docket_bulk_repeated_bill_id_across_archives: " + id);
      seen.add(id);
    }
    counts[kind] += 1;
    staged.push({ kind, id, path: file.name, member_hash: sha(raw) });
  }
  // Parse and validate the WHOLE archive before making any write for that archive.
  for (const member of staged) {
    if (!applying) continue;
    if (!writer_modules) throw new Error("docket_bulk_writer_modules_unavailable");
    // Re-read a single validated ZIP entry only when applying. The first pass
    // has already accepted every member's shape and archive identity. This
    // second pass is the same source byte stream, bound to its checked hash;
    // interruptions resume idempotently via the canonical cache/receipt path.
    const member_file = zip.file(member.path);
    if (!member_file) throw new Error("docket_bulk_member_missing_after_validation");
    const member_bytes = await member_file.async("nodebuffer");
    if (sha(member_bytes) !== member.member_hash) {
      throw new Error("docket_bulk_member_changed_after_validation");
    }
    const current = parse_docket_bulk_json_member(
      member.path, member_bytes, expected.jurisdiction, expected.session_ids,
    );
    if (current.kind !== member.kind || current.id !== member.id) {
      throw new Error("docket_bulk_member_identity_changed_after_validation");
    }
    const [acceptance] = writer_modules;
    const { accept_docket_bill_detail, preserve_docket_archive_auxiliary } = acceptance;
    const receipt = {
      archive_sha256: expected.sha256.toLowerCase(),
      member_path: member.path,
      member_sha256: member.member_hash.toLowerCase(),
    };
    if (member.kind === "bill") {
      const outcome = await accept_docket_bill_detail({
        bill_id: member.id, bill: current.payload, source: "legiscan_bulk_json", archive: receipt,
      });
      if (outcome.disposition === "inserted") counts.inserted += 1;
      if (outcome.disposition === "existing_preserved") counts.existing_preserved += 1;
      // The canonical Docket activation queue now owns projection,
      // legislative version registration, source holds, and receipts.
      // The archive reader never independently executes those stages.
      if (outcome.disposition === "inserted") {
        if (!outcome.activation_id) {
          throw new Error("docket_bulk_canonical_activation_missing_bill_id_" + member.id);
        }
        counts.activated += 1;
      }
    } else {
      await preserve_docket_archive_auxiliary({
        kind: member.kind, payload: current.payload, provider_record_id: member.id,
        state: expected.jurisdiction, archive: receipt,
      });
    }
  }
  for (const key of Object.keys(counts) as Array<keyof typeof counts>) result.totals[key] += counts[key];
  result.archives.push({ archive: name, sha256: expected.sha256, ...counts });
  console.log(JSON.stringify({ archive: name, ...counts, mode: result.mode }));
}
writeFileSync(resolve(report_path), JSON.stringify(result, null, 2) + "\n");
console.log("report=" + resolve(report_path));
if (result.totals.held > 0) process.exitCode = 1;

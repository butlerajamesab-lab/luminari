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
// No Lighthouse DB/worker modules are evaluated during offline dry-run.
// The original ZIP manifest and every JSON member can be verified with no
// database credentials, network transport, or implicit scheduler startup.
const writer_modules = applying ? await Promise.all([
  import("../server/docket-bill-detail-acceptance"),
  import("../server/civic-genome-projection"),
  import("../server/db"),
]) : null;
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
const inventory = new Map(manifest.archives.map(item => [item.archive, item]));
const result = {
  mode: applying ? "apply" : "dry_run",
  manifest_sha256,
  archives: [] as Array<Record<string, unknown>>,
  totals: { bill: 0, person: 0, roll_call: 0, invalid: 0, inserted: 0, existing_preserved: 0, held: 0 },
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
  const staged: Array<{
    kind: record_kind; payload: Record<string, unknown>; id: number;
    path: string; member_hash: string;
  }> = [];
  const counts = { bill: 0, person: 0, roll_call: 0, invalid: 0, inserted: 0, existing_preserved: 0, held: 0 };
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
    staged.push({ kind, payload, id, path: file.name, member_hash: sha(raw) });
  }
  // Parse and validate the WHOLE archive before making any write for that archive.
  for (const member of staged) {
    if (!applying) continue;
    if (!writer_modules) throw new Error("docket_bulk_writer_modules_unavailable");
    const [acceptance, genome, database] = writer_modules;
    const { accept_docket_bill_detail, preserve_docket_archive_auxiliary } = acceptance;
    const { project_docket_bulk_bill_to_civic_genome } = genome;
    const { query_with_diagnostics } = database;
    const receipt = {
      archive_sha256: expected.sha256.toLowerCase(),
      member_path: member.path,
      member_sha256: member.member_hash.toLowerCase(),
    };
    if (member.kind === "bill") {
      const outcome = await accept_docket_bill_detail({
        bill_id: member.id, bill: member.payload, source: "legiscan_bulk_json", archive: receipt,
      });
      if (outcome.disposition === "inserted") counts.inserted += 1;
      if (outcome.disposition === "existing_preserved") counts.existing_preserved += 1;
      // Completing an interrupted archive ingest is idempotent. No re-fetch.
      // Do not project an old ZIP over an API-owned canonical bill.
      if (outcome.stored_source === "legiscan_bulk_json") {
        try {
          await project_docket_bulk_bill_to_civic_genome({
            bill: member.payload, archive_sha256: receipt.archive_sha256,
            member_path: receipt.member_path,
          });
          const registration = await query_with_diagnostics<{ receipt: Record<string, unknown> }>(
            "select public.register_docket_legislative_version_spine($1::integer, false) as receipt",
            [member.id],
            { label: "docket_bulk_register_official_sources", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 30_000 },
          );
          if (Number(registration.rows[0]?.receipt?.registered_document_count ?? 0) === 0) {
            counts.held += 1;
            console.error("[HOLD] bulk_source_document_unavailable bill_id=" + member.id);
          }
        } catch (error) {
          counts.held += 1;
          console.error("[HOLD] bulk_projection_or_registration_failed bill_id=" + member.id +
            " error=" + (error instanceof Error ? error.message : "unknown"));
        }
      }
    } else {
      await preserve_docket_archive_auxiliary({
        kind: member.kind, payload: member.payload, provider_record_id: member.id,
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

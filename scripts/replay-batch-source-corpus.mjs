#!/usr/bin/env node
// Local original-byte replay. No database access, imports, network requests or source execution.
import { readFile as read_file, writeFile as write_file, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { parse_batch_source } from "./lib/batch-source-adapter.mjs";
import { source_sha256 } from "./lib/corpus-docx-source.mjs";

const [manifest_path, receipt_path] = process.argv.slice(2);
if (!manifest_path || !receipt_path || process.argv.length !== 4) throw new Error("usage: node scripts/replay-batch-source-corpus.mjs manifest.json receipt.json");
const manifest = JSON.parse(await read_file(manifest_path, "utf8"));
if (!Array.isArray(manifest.sources) || !manifest.sources.length) throw new Error("explicit_source_manifest_required");
const output_path = resolve(receipt_path);
if ([manifest_path, ...manifest.sources.map(source => resolve(dirname(manifest_path), source.path))].map(path => resolve(path)).includes(output_path)) {
  throw new Error("source_output_collision");
}
const receipts = [];
for (const source of manifest.sources) {
  const bytes = await read_file(resolve(dirname(manifest_path), source.path));
  const hash = source_sha256(bytes);
  if (hash !== source.sha256) throw new Error(`source_hash_mismatch:${source.source_name}`);
  const parsed = await parse_batch_source(bytes, source.source_name);
  receipts.push({ source_name: source.source_name, source_sha256: hash, byte_size: bytes.length,
    observations: parsed.observations.length, member_receipts: parsed.parts,
    resource_ids: parsed.resources?.map(resource => resource.resource_id) || [],
    native_record_occurrences: parsed.native_records?.length || 0,
    embedded_images: parsed.observations.filter(row => row.source_kind === "docx_embedded_image").length,
    pipeline_candidates: parsed.observations.filter(row => row.source_kind === "pipeline_dossier_review_candidate").length,
    holds: parsed.holds });
}
const result = { contract: "batch_original_source_replay_v1", scope: "explicit_source_manifest", source_count: receipts.length,
  observations: receipts.reduce((total, receipt) => total + receipt.observations, 0),
  production_writes: 0, publication_state: "governed_non_public", ocr_performed: false, receipts };
await mkdir(dirname(output_path), { recursive: true });
await write_file(output_path, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ source_count: result.source_count, observations: result.observations, receipt_path }));

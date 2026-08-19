#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { compile_pipeline_dossier_docx } from "./lib/pipeline-dossier-review-compiler.mjs";

function parse_args(argv) {
  const args = { input: null, out: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--input") args.input = argv[++index] ?? null;
    else if (value === "--out") args.out = argv[++index] ?? null;
    else if (value === "--help" || value === "-h") args.help = true;
    else throw new Error(`pipeline_dossier_compiler_unknown_argument:${value}`);
  }
  return args;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/compile-pipeline-dossier-review.mjs --input <dossier.docx> [--out <review-candidate.json>]",
    "",
    "This compiler is intentionally dry-run only. It parses and validates a pipeline-specific",
    "SAIS dossier and emits a deterministic review-candidate package. It does not write to",
    "Supabase and the resulting package cannot be activated without a separate manual review ledger.",
  ].join("\n");
}

async function main() {
  const args = parse_args(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (!args.input) throw new Error("pipeline_dossier_compiler_input_required");

  const package_data = await compile_pipeline_dossier_docx(resolve(args.input));
  const rendered = `${JSON.stringify(package_data, null, 2)}\n`;
  if (args.out) {
    const out_path = resolve(args.out);
    await mkdir(dirname(out_path), { recursive: true });
    await writeFile(out_path, rendered, "utf8");
    process.stdout.write(
      JSON.stringify({
        valid: true,
        output_path: out_path,
        pipeline_key: package_data.dossier.pipeline_key,
        resource_count: package_data.validation.resource_count,
        jurisdiction_count: package_data.validation.jurisdiction_count,
        integrity_hold_count: package_data.validation.integrity_hold_count,
        package_sha256: package_data.package_sha256,
        production_write_allowed: false,
      }) + "\n",
    );
    return;
  }
  process.stdout.write(rendered);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

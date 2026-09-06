import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  build_receipt_targets,
  render_receipt_writer_sql,
  run_c3_receipt_writer,
  sha256,
} from "./rosetta-c3-receipt-writer";

function metadata(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function manifest_tsv(): string {
  return [
    [
      "ordinal",
      "source_registry_id",
      "host",
      "media_type",
      "extractor_family",
      "source_content_hash",
      "source_byte_hash",
      "source_document_id",
      "source_content_id",
      "source_version",
      "source_metadata_json_base64",
      "source_url",
    ].join("\t"),
    [
      1,
      "50132400-e0e0-466e-8824-d422fba4f294",
      "lawfilesext.leg.wa.gov",
      "application/pdf",
      "wa-official-legislative-version-html-strip-v1",
      "0".repeat(64),
      "1".repeat(64),
      213,
      "98cd2ea4-c763-437d-873c-7c37a925e76f",
      "legiscan_amendment:282370:House Floor Amendment:wa-official-legislative-version-html-strip-v1",
      metadata({
        extraction_text_url: "https://lawfilesext.leg.wa.gov/example.htm",
        extraction_text_byte_hash: "2".repeat(64),
      }),
      "https://lawfilesext.leg.wa.gov/example.pdf",
    ].join("\t"),
    [
      2,
      "3129fe7b-6b8f-466a-b623-5816e7e1e7a2",
      "assembly.state.ny.us",
      "text/html",
      "official-legislative-version-html-strip-v1",
      "3".repeat(64),
      "4".repeat(64),
      214,
      "7d98ea70-130a-4f14-9b09-a20692407447",
      "legiscan_text:3410937:Chaptered:official-legislative-version-html-strip-v1",
      metadata({}),
      "https://assembly.state.ny.us/example",
    ].join("\t"),
  ].join("\n") + "\n";
}

function results_tsv(): string {
  return [
    [
      "ordinal",
      "source_registry_id",
      "host",
      "media_type",
      "extractor_family",
      "source_content_hash",
      "expected_source_byte_hash",
      "http_code",
      "fetch_status",
      "fetched_bytes",
      "fetched_sha256",
      "extractor_status",
      "text_sha256",
      "text_char_count",
      "warning_code",
      "result_status",
      "error_code",
      "error_message",
      "fetched_at",
      "url",
    ].join("\t"),
    [
      1,
      "50132400-e0e0-466e-8824-d422fba4f294",
      "lawfilesext.leg.wa.gov",
      "application/pdf",
      "wa-official-legislative-version-html-strip-v1",
      "0".repeat(64),
      "1".repeat(64),
      200,
      "byte_match",
      100,
      "1".repeat(64),
      "reproduced",
      "0".repeat(64),
      200,
      "",
      "byte_match_and_text_reproduced",
      "",
      "",
      "2026-09-06T00:00:00.000Z",
      "https://lawfilesext.leg.wa.gov/example.pdf",
    ].join("\t"),
    [
      2,
      "3129fe7b-6b8f-466a-b623-5816e7e1e7a2",
      "assembly.state.ny.us",
      "text/html",
      "official-legislative-version-html-strip-v1",
      "3".repeat(64),
      "4".repeat(64),
      200,
      "byte_drift",
      100,
      "5".repeat(64),
      "not_attempted",
      "",
      "",
      "",
      "byte_drift",
      "",
      "",
      "2026-09-06T00:00:00.000Z",
      "https://assembly.state.ny.us/example",
    ].join("\t"),
  ].join("\n") + "\n";
}

describe("Rosetta C3 receipt writer", () => {
  it("targets only double-proven rows", () => {
    const targets = build_receipt_targets(
      [
        {
          ordinal: 1,
          source_registry_id: "50132400-e0e0-466e-8824-d422fba4f294",
          host: "lawfilesext.leg.wa.gov",
          media_type: "application/pdf",
          extractor_family: "wa-official-legislative-version-html-strip-v1",
          source_content_hash: "0".repeat(64),
          source_byte_hash: "1".repeat(64),
          source_document_id: 213,
          source_content_id: "98cd2ea4-c763-437d-873c-7c37a925e76f",
          source_version: "v1",
          source_metadata: {},
          source_url: "https://example.test/a.pdf",
        },
      ],
      [
        {
          ordinal: 1,
          source_registry_id: "50132400-e0e0-466e-8824-d422fba4f294",
          source_content_hash: "0".repeat(64),
          expected_source_byte_hash: "1".repeat(64),
          fetch_status: "byte_match",
          fetched_sha256: "1".repeat(64),
          extractor_status: "reproduced",
          text_sha256: "0".repeat(64),
          result_status: "byte_match_and_text_reproduced",
        },
      ],
      1,
    );

    expect(targets).toHaveLength(1);
    expect(targets[0].receipt).toMatchObject({
      contract: "rosetta-content-extraction-v1",
      extractor_version: "wa-official-legislative-version-html-strip-v1",
      raw_source_sha256: "1".repeat(64),
      extracted_text_sha256: "0".repeat(64),
      projection_verified: true,
      residue_check_passed: true,
    });
  });

  it("emits idempotent SQL that updates receipt and text_extractor_version together", () => {
    const targets = build_receipt_targets(
      [
        {
          ordinal: 1,
          source_registry_id: "50132400-e0e0-466e-8824-d422fba4f294",
          host: "assembly.state.ny.us",
          media_type: "text/html",
          extractor_family: "official-legislative-version-html-strip-v1",
          source_content_hash: "0".repeat(64),
          source_byte_hash: "1".repeat(64),
          source_document_id: 213,
          source_content_id: "98cd2ea4-c763-437d-873c-7c37a925e76f",
          source_version: "v1",
          source_metadata: {},
          source_url: "https://example.test/a",
        },
      ],
      [
        {
          ordinal: 1,
          source_registry_id: "50132400-e0e0-466e-8824-d422fba4f294",
          source_content_hash: "0".repeat(64),
          expected_source_byte_hash: "1".repeat(64),
          fetch_status: "byte_match",
          fetched_sha256: "1".repeat(64),
          extractor_status: "reproduced",
          text_sha256: "0".repeat(64),
          result_status: "byte_match_and_text_reproduced",
        },
      ],
      1,
    );
    const sql = render_receipt_writer_sql(targets, {
      manifest_tsv_sha256: "2".repeat(64),
      results_tsv_sha256: "3".repeat(64),
    });

    expect(sql).toContain("rosetta-c3-backfill-receipt-writer-v1");
    expect(sql).toContain("rosetta_v2513.source_document_content");
    expect(sql).toContain("'{text_extractor_version}'");
    expect(sql).toContain("'{content_extraction_receipt}'");
    expect(sql).toContain("c3_receipt_writer_postcondition_failed");
    expect(sql).not.toContain("byte_drift");
  });

  it("writes SQL only when the bound input file hashes match", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "c3-receipt-writer-"));
    try {
      const manifest = path.join(directory, "manifest.tsv");
      const results = path.join(directory, "results.tsv");
      const out = path.join(directory, "receipt-writer.sql");
      const manifest_content = manifest_tsv();
      const result_content = results_tsv();
      writeFileSync(manifest, manifest_content);
      writeFileSync(results, result_content);

      await run_c3_receipt_writer({
        manifest_tsv: manifest,
        results_tsv: results,
        out_sql: out,
        expected_manifest_sha256: sha256(manifest_content),
        expected_results_sha256: sha256(result_content),
        expected_proven_rows: 1,
      });

      expect(readFileSync(out, "utf8")).toContain("verified % rows");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

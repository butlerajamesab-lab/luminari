import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  classify_fetch_failure,
  compute_manifest_hashes,
  derive_extractor_family,
  render_manifest_tsv,
  sha256,
  type source_manifest_row,
} from "./rosetta-c3-backfill-census-worker";

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function manifest_row(overrides: Partial<source_manifest_row>): source_manifest_row {
  return {
    ordinal: 1,
    source_registry_id: "50132400-e0e0-466e-8824-d422fba4f294",
    host: "lawfilesext.leg.wa.gov",
    media_type: "application/pdf",
    extractor_family: "wa-official-legislative-version-html-strip-v1",
    source_content_hash: "7567aca08382f76cbbc6dba65d686e5fa3494c2c0ec1febd43bb13689abc47de",
    source_byte_hash: "7567aca08382f76cbbc6dba65d686e5fa3494c2c0ec1febd43bb13689abc47de",
    source_url: "https://lawfilesext.leg.wa.gov/example.pdf",
    source_version: "legiscan_text:1:Enrolled:wa-official-legislative-version-html-strip-v1",
    source_metadata: {},
    source_document_id: 42,
    source_content_id: "00000000-0000-0000-0000-000000000001",
    ...overrides,
  };
}

describe("Rosetta C3 backfill census worker", () => {
  it("uses byte-exact manifest hash recipes with no trailing terminator", () => {
    const rows = [
      manifest_row({ ordinal: 2, source_registry_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" }),
      manifest_row({ ordinal: 1, source_registry_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" }),
    ];

    const hashes = compute_manifest_hashes(rows);

    expect(hashes.membership_sha256).toBe(hash([
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    ].join("\n")));
    expect(hashes.membership_sha256).not.toBe(hash([
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    ].join("\n") + "\n"));
    expect(hashes.manifest_sha256).toBe(hash([
      [
        1,
        "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "lawfilesext.leg.wa.gov",
        "application/pdf",
        "wa-official-legislative-version-html-strip-v1",
        "7567aca08382f76cbbc6dba65d686e5fa3494c2c0ec1febd43bb13689abc47de",
      ].join("|"),
      [
        2,
        "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        "lawfilesext.leg.wa.gov",
        "application/pdf",
        "wa-official-legislative-version-html-strip-v1",
        "7567aca08382f76cbbc6dba65d686e5fa3494c2c0ec1febd43bb13689abc47de",
      ].join("|"),
    ].join("\n")));
  });

  it("derives known historical extractor families from source_version tails", () => {
    expect(derive_extractor_family(
      "legiscan_text:3408600:Chaptered:pdf-parse-2.4.5-legislative-version-v1",
    )).toBe("pdf-parse-2.4.5-legislative-version-v1");
    expect(derive_extractor_family(
      "legiscan_amendment:123:HFA:official-legislative-version-html-strip-v1",
    )).toBe("official-legislative-version-html-strip-v1");
    expect(derive_extractor_family(
      "legiscan_text:456:Bill:wa-official-legislative-version-html-strip-v1",
    )).toBe("wa-official-legislative-version-html-strip-v1");
  });

  it("keeps unmatched source versions literal for legacy classification", () => {
    const literal = "legiscan_text:3408600:Chaptered";
    expect(derive_extractor_family(literal)).toBe(literal);
  });

  it("classifies transport failures without declaring provenance failure", () => {
    expect(classify_fetch_failure(403, null)).toBe("fetch_blocked");
    expect(classify_fetch_failure(429, null)).toBe("fetch_blocked");
    expect(classify_fetch_failure(404, null)).toBe("fetch_missing");
    expect(classify_fetch_failure(null, "Error:getaddrinfo EAI_AGAIN olis.oregonlegislature.gov"))
      .toBe("fetch_error");
  });

  it("does not contain database mutation or migration machinery", () => {
    const source = readFileSync("server/workers/rosetta-c3-backfill-census-worker.ts", "utf8");
    expect(source).not.toMatch(/\binsert\s+into\b/i);
    expect(source).not.toMatch(/\bupdate\s+\w+/i);
    expect(source).not.toMatch(/\bdelete\s+from\b/i);
    expect(source).not.toContain("apply_migration");
    expect(source).not.toContain("receipt_writer");
  });

  it("does not hard-fail tiny PDF or WA text before hash comparison", () => {
    const source = readFileSync("server/workers/rosetta-c3-backfill-census-worker.ts", "utf8");
    expect(source).not.toContain("pdf_text_incomplete");
    expect(source).not.toContain("wa_html_text_incomplete");
    expect(source).toContain("source_text_below_200_chars");
  });

  it("replays WA HTML from recorded extraction-text receipts", () => {
    const source = readFileSync("server/workers/rosetta-c3-backfill-census-worker.ts", "utf8");
    expect(source).toContain('metadata_string(row, "extraction_text_url")');
    expect(source).toContain('metadata_string(row, "extraction_text_byte_hash")');
    expect(source).toContain("wa_extraction_text_receipt_missing");
    expect(source).toContain("auxiliary_byte_hash_mismatch");
  });

  it("hashes buffers and strings through the same SHA-256 contract", () => {
    expect(sha256("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256(Buffer.from("receipt"))).toBe(hash("receipt"));
  });

  it("renders a frozen manifest TSV without changing the canonical hash recipe", () => {
    const rows = [
      manifest_row({ ordinal: 2, source_registry_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" }),
      manifest_row({ ordinal: 1, source_registry_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" }),
    ];

    const manifest_tsv = render_manifest_tsv(rows);

    expect(manifest_tsv).toContain("ordinal\tsource_registry_id\thost\tmedia_type");
    expect(manifest_tsv).toContain("\n1\taaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\t");
    expect(manifest_tsv.endsWith("\n")).toBe(true);
    expect(sha256(manifest_tsv)).not.toBe(compute_manifest_hashes(rows).manifest_sha256);
  });
});

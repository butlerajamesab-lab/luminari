import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { normalize_wa_official_html } from "./civic-genome-rosetta-extraction";

const extraction_source = readFileSync(
  new URL("./civic-genome-rosetta-extraction.ts", import.meta.url),
  "utf8",
);
const handoff_source = readFileSync(
  new URL("./civic-genome-rosetta-source-ingestion.ts", import.meta.url),
  "utf8",
);

describe("deterministic Docket -> Rosetta extraction boundary", () => {
  it("normalizes official Washington HTML without semantic rewriting", () => {
    const source = "\uFEFF<html>\r\n<body><p>Sec. 1.&nbsp;There shall be a license &amp; review.</p>\n<p>\"Board\" means the agency.</p></body></html>";
    expect(normalize_wa_official_html(source)).toBe(
      "\uFEFFSec. 1. There shall be a license & review. \"Board\" means the agency.",
    );
  });

  it("hashes official bytes and text before invoking the service-only Rosetta RPC", () => {
    expect(extraction_source).toContain("source_byte_hash = sha256(pdf.bytes)");
    expect(extraction_source).toContain("source_content_hash = sha256(source_text)");
    expect(extraction_source).toContain("/rest/v1/rpc/run_rosetta_v3_extraction");
    expect(extraction_source).toContain("p_expected_source_content_hash: source.source_content_hash");
    expect(extraction_source).toContain("p_source_byte_hash: source.source_byte_hash");
  });

  it("contains no runtime AI or nondeterministic classification path", () => {
    expect(extraction_source).not.toMatch(/openai|anthropic|gemini|llm|prompt|completion/i);
    expect(extraction_source).not.toContain("Math.random");
    expect(extraction_source).not.toContain("Date.now()");
  });

  it("does not manufacture a blank extraction run after a completed run", () => {
    expect(handoff_source).toContain("if (latest?.id !== undefined)");
    expect(handoff_source).toContain("The deterministic\n * extractor owns replay identity");
    expect(handoff_source).not.toContain("reusable_run_statuses");
  });
});

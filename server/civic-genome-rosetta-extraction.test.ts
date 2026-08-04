import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  normalize_official_html,
  normalize_wa_official_html,
  select_official_document,
} from "./civic-genome-rosetta-extraction";

const extraction_source = readFileSync(
  new URL("./civic-genome-rosetta-extraction.ts", import.meta.url),
  "utf8",
);
const handoff_source = readFileSync(
  new URL("./civic-genome-rosetta-source-ingestion.ts", import.meta.url),
  "utf8",
);

// Lock source identity, wrapper preservation, normalization, and attempt ordering before any live Rosetta retry.
describe("deterministic Docket -> Rosetta extraction boundary", () => {
  it("normalizes official Washington HTML without semantic rewriting", () => {
    const source = "\uFEFF<html>\r\n<body><p>Sec. 1.&nbsp;There shall be a license &amp; review.</p>\n<p>\"Board\" means the agency.</p></body></html>";
    expect(normalize_wa_official_html(source)).toBe(
      "\uFEFFSec. 1. There shall be a license & review. \"Board\" means the agency.",
    );
  });

  it("hashes official bytes and text before invoking the service-only Rosetta RPC", () => {
    expect(extraction_source).toContain("source_byte_hash = sha256(official.bytes)");
    expect(extraction_source).toContain("source_content_hash = sha256(source_text)");
    expect(extraction_source).toContain("/rest/v1/rpc/run_rosetta_v3_extraction");
    expect(extraction_source).toContain("p_expected_source_content_hash: source.source_content_hash");
    expect(extraction_source).toContain("p_source_byte_hash: source.source_byte_hash");
  });

  it("validates and hashes the source before creating or reusing an extraction attempt", () => {
    const source_preparation_index = extraction_source.indexOf(
      "const source = await extract_source(source_bill_id, cached, document)",
    );
    const ingestion_index = extraction_source.indexOf(
      "const ingestion = await ingest_docket_bill_to_rosetta_source(source_bill_id)",
    );
    expect(source_preparation_index).toBeGreaterThan(-1);
    expect(ingestion_index).toBeGreaterThan(source_preparation_index);
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

  it("preserves bill text inside form and header wrappers while excluding executable chrome", () => {
    const source = `
      <!doctype html>
      <html>
        <head><style>.hidden { display: none }</style></head>
        <body>
          <nav>Search Bills</nav>
          <script>window.secret = "not law";</script>
          <form id="bill-form">
            <header><h1>S.B.&nbsp;No.&nbsp;268</h1></header>
            <button type="button">Print bill</button>
            <main>
            <p>AN ACT relating to health care practitioners.</p>
            <p>SECTION 1. A licensing entity shall promptly forward the complaint.</p>
            <p>SECTION 2. This Act takes effect September 1, 2025. The licensing entity shall preserve the complaint, identify the receiving authority, record the transfer date, and maintain the official referral record for inspection.</p>
            </main>
          </form>
          <footer>Website footer</footer>
        </body>
      </html>`;

    const normalized = normalize_official_html(source);
    expect(normalized).toContain("S.B. No. 268");
    expect(normalized).toContain("shall promptly forward the complaint");
    expect(normalized).not.toContain("window.secret");
    expect(normalized).not.toContain("Search Bills");
    expect(normalized).not.toContain("Print bill");
    expect(normalized).not.toContain("Website footer");
  });

  it("chooses the highest terminal official document deterministically", () => {
    const selected = select_official_document({
      texts: [
        {
          doc_id: 10,
          type: "Introduced",
          state_link: "https://example.gov/introduced.pdf",
        },
        {
          doc_id: 20,
          type: "Enrolled",
          state_link: "https://example.gov/enrolled.html",
        },
        {
          doc_id: 30,
          type: "Engrossed",
          state_link: "https://example.gov/engrossed.pdf",
        },
      ],
    });

    expect(selected.doc_id).toBe(20);
    expect(selected.type).toBe("Enrolled");
  });
});

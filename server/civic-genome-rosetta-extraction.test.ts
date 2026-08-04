import { describe, expect, it } from "vitest";

import {
  normalize_official_html,
  normalize_wa_official_html,
  select_official_document,
} from "./civic-genome-rosetta-extraction";

// Lock source normalization and terminal-document selection before any live Rosetta retry.
describe("Rosetta official source extraction contracts", () => {
  it("preserves the locked Washington HTML normalization contract", () => {
    expect(normalize_wa_official_html("\uFEFF<p>SECTION&nbsp;1 &amp; duty</p>\r\n")).toBe(
      "\uFEFFSECTION 1 & duty",
    );
  });

  it("extracts visible legislative HTML while excluding executable page chrome", () => {
    const source = `
      <!doctype html>
      <html>
        <head><style>.hidden { display: none }</style></head>
        <body>
          <nav>Search Bills</nav>
          <script>window.secret = "not law";</script>
          <main>
            <h1>S.B.&nbsp;No.&nbsp;268</h1>
            <p>AN ACT relating to health care practitioners.</p>
            <p>SECTION 1. A licensing entity shall promptly forward the complaint.</p>
            <p>SECTION 2. This Act takes effect September 1, 2025. The licensing entity shall preserve the complaint, identify the receiving authority, record the transfer date, and maintain the official referral record for inspection.</p>
          </main>
          <footer>Website footer</footer>
        </body>
      </html>`;

    const normalized = normalize_official_html(source);
    expect(normalized).toContain("S.B. No. 268");
    expect(normalized).toContain("shall promptly forward the complaint");
    expect(normalized).not.toContain("window.secret");
    expect(normalized).not.toContain("Search Bills");
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

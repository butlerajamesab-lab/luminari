import { describe, expect, it } from "vitest";

import {
  louisiana_official_document_sequence,
  parse_amendment_target_reference,
  resolve_amendment_base,
  type amendment_base_candidate,
} from "./civic-genome-amendment-attachment";

const hash = (digit: string) => digit.repeat(64);
const candidate = (
  key: string,
  version_type: string,
  source_url: string,
  source_content_hash: string | null,
  provider_sequence = 1,
): amendment_base_candidate => ({
  bill_version_id: `00000000-0000-4000-8000-${String(provider_sequence).padStart(12, "0")}`,
  source_document_key: key,
  version_type,
  provider_document_type: version_type,
  provider_sequence,
  source_url,
  source_content_hash,
});

describe("Civic Genome amendment attachment resolver", () => {
  it("parses the amendment's explicit legislative target instead of inferring from bill identity", () => {
    expect(parse_amendment_target_reference(
      "Amendments proposed by Representative Horton to Engrossed House Bill No. 953 by Representative Fontenot",
    )).toMatchObject({
      target_form: "engrossed",
      chamber: "H",
      bill_number: "HB953",
      expected_version_type: "engrossed",
    });
  });

  it("uses Louisiana official chronology to bind HB953 amendment 291247 to the earlier Engrossed text", () => {
    const result = resolve_amendment_base({
      source_text: [
        "HFLBHB953 2395 1521",
        "HOUSE FLOOR AMENDMENTS",
        "Amendments proposed by Representative Horton on behalf of the Legislative Bureau to",
        "Engrossed House Bill No. 953 by Representative Fontenot",
      ].join("\n"),
      source_bill_number: "HB953",
      state_code: "LA",
      amendment_source_document_key: "amendment:2127296:291247",
      amendment_source_content_hash: hash("a"),
      amendment_source_url: "https://www.legis.la.gov/Legis/ViewDocument.aspx?d=1456692",
      candidates: [
        candidate(
          "text:2127296:3402357",
          "engrossed",
          "https://www.legis.la.gov/Legis/ViewDocument.aspx?d=1452932",
          hash("b"),
          2,
        ),
        candidate(
          "text:2127296:3416117",
          "engrossed",
          "https://www.legis.la.gov/Legis/ViewDocument.aspx?d=1461003",
          hash("c"),
          3,
        ),
      ],
    });
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") throw new Error("expected resolved");
    expect(result.base.source_document_key).toBe("text:2127296:3402357");
    expect(result.evidence_method).toBe("louisiana_official_document_sequence_v1");
    expect(result.attachment_evidence_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.evidence).toMatchObject({
      amendment_official_sequence: 1456692,
      base_official_sequence: 1452932,
    });
  });

  it("chooses the later Engrossed text for an amendment filed after that text", () => {
    const result = resolve_amendment_base({
      source_text: "Amendments proposed by a senator to Engrossed House Bill No. 953 by Representative Fontenot",
      source_bill_number: "HB953",
      state_code: "LA",
      amendment_source_document_key: "amendment:2127296:298031",
      amendment_source_content_hash: hash("d"),
      amendment_source_url: "https://www.legis.la.gov/Legis/ViewDocument.aspx?d=1469337",
      candidates: [
        candidate("text:2127296:3402357", "engrossed", "https://www.legis.la.gov/Legis/ViewDocument.aspx?d=1452932", hash("b"), 2),
        candidate("text:2127296:3416117", "engrossed", "https://www.legis.la.gov/Legis/ViewDocument.aspx?d=1461003", hash("c"), 3),
      ],
    });
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") throw new Error("expected resolved");
    expect(result.base.source_document_key).toBe("text:2127296:3416117");
  });

  it("uses a unique explicitly targeted Original version without chronology inference", () => {
    const result = resolve_amendment_base({
      source_text: "Amendments proposed by the committee to Original House Bill No. 953 by Representative Fontenot",
      source_bill_number: "HB953",
      state_code: "LA",
      amendment_source_document_key: "amendment:2127296:288882",
      amendment_source_content_hash: hash("e"),
      amendment_source_url: "https://www.legis.la.gov/Legis/ViewDocument.aspx?d=1452396",
      candidates: [
        candidate("text:2127296:3380147", "introduced", "https://www.legis.la.gov/Legis/ViewDocument.aspx?d=1447774", hash("f"), 1),
      ],
    });
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") throw new Error("expected resolved");
    expect(result.base.source_document_key).toBe("text:2127296:3380147");
    expect(result.evidence_method).toBe("unique_explicit_target_version_v1");
  });

  it("does not guess between multiple target versions outside a proved chronology adapter", () => {
    const result = resolve_amendment_base({
      source_text: "Amendments proposed to Engrossed House Bill No. 10",
      source_bill_number: "HB10",
      state_code: "XX",
      amendment_source_document_key: "amendment:10:2",
      amendment_source_content_hash: hash("1"),
      amendment_source_url: "https://legislature.example/amendment/2.pdf",
      candidates: [
        candidate("text:10:1", "engrossed", "https://legislature.example/text/1.pdf", hash("2"), 1),
        candidate("text:10:2", "engrossed", "https://legislature.example/text/2.pdf", hash("3"), 2),
      ],
    });
    expect(result).toMatchObject({
      status: "unresolved",
      reason: "exact_target_version_ambiguous",
    });
  });

  it("parks when the explicit amendment target names a different bill", () => {
    const result = resolve_amendment_base({
      source_text: "Amendments proposed to Original House Bill No. 954",
      source_bill_number: "HB953",
      state_code: "LA",
      amendment_source_document_key: "amendment:2127296:1",
      amendment_source_content_hash: hash("4"),
      amendment_source_url: "https://www.legis.la.gov/Legis/ViewDocument.aspx?d=1450000",
      candidates: [
        candidate("text:2127296:3380147", "introduced", "https://www.legis.la.gov/Legis/ViewDocument.aspx?d=1447774", hash("5")),
      ],
    });
    expect(result).toMatchObject({
      status: "unresolved",
      reason: "explicit_target_bill_mismatch",
    });
  });

  it("resolves the base identity but waits when exact base content has not yet been preserved", () => {
    const result = resolve_amendment_base({
      source_text: "Amendments proposed to Original Senate Bill No. 42",
      source_bill_number: "SB42",
      state_code: "LA",
      amendment_source_document_key: "amendment:42:2",
      amendment_source_content_hash: hash("6"),
      amendment_source_url: "https://www.legis.la.gov/Legis/ViewDocument.aspx?d=200",
      candidates: [
        candidate("text:42:1", "introduced", "https://www.legis.la.gov/Legis/ViewDocument.aspx?d=100", null),
      ],
    });
    expect(result).toMatchObject({
      status: "awaiting_base_content",
      reason: "exact_base_content_not_preserved",
      base: { source_document_key: "text:42:1" },
    });
  });

  it("accepts only Louisiana official ViewDocument sequence identifiers", () => {
    expect(louisiana_official_document_sequence(
      "https://www.legis.la.gov/Legis/ViewDocument.aspx?d=1456692",
    )).toBe(1456692);
    expect(louisiana_official_document_sequence(
      "https://legiscan.com/LA/amendment/HB953/id/291247",
    )).toBeNull();
  });
});

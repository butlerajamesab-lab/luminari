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


describe("Washington evidence-only explicit SHB/ESHB header target", () => {
  it("binds the real WA HB1533 Senate amendment to its unique ESHB print", () => {
    const result = resolve_amendment_base({
      source_text: "\ufeff1533-S.E AMS LC S2640.1 ESHB 1533 - S COMM AMD By Committee on Labor & Commerce ADOPTED 04/11/2025 Strike everything after the enacting clause",
      source_bill_number: "HB1533",
      state_code: "WA",
      amendment_source_document_key: "amendment:1935474:244618",
      amendment_source_content_hash: "eed88888ce2d198cdcba55cb2c35275c9dc1d1c98887071bfb8c601ca4c0ff3a",
      amendment_source_url: "https://lawfilesext.leg.wa.gov/biennium/2025-26/Pdf/Amendments/Senate/1533-S.E%20AMS%20LC%20S2640.1.pdf",
      candidates: [
        candidate("text:1935474:3133746", "committee_substitute", "https://lawfilesext.leg.wa.gov/biennium/2025-26/Pdf/Bills/House%20Bills/1533-S.pdf", hash("a"), 2),
        candidate("text:1935474:3171964", "engrossed", "https://lawfilesext.leg.wa.gov/biennium/2025-26/Pdf/Bills/House%20Bills/1533-S.E.pdf", "d180979a995ff7e089228b76f6bb7178b201f829602eb571c017c458e66acbcb", 3),
      ],
    });
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") throw new Error("expected resolved");
    expect(result.base.source_document_key).toBe("text:1935474:3171964");
    expect(result.evidence_method).toBe("washington_amendment_header_v1");
    expect(result.evidence).toMatchObject({
      target_phrase: "ESHB 1533 - S COMM AMD",
      target_form: "engrossed",
      base_source_content_hash: "d180979a995ff7e089228b76f6bb7178b201f829602eb571c017c458e66acbcb",
    });
  });

  it("recovers the real WA HB1533 House amendment even after flattened CSS furniture", () => {
    const css = "span { white-space: pre-wrap; } ".repeat(130);
    const result = resolve_amendment_base({
      source_text: "1533-S AMH SCHM LEON 940 " + css + "1533-S AMH SCHM LEON 940 SHB 1533 - H AMD 81 By Representative Schmidt ADOPTED 03/11/2025",
      source_bill_number: "HB1533",
      state_code: "WA",
      amendment_source_document_key: "amendment:1935474:233591",
      amendment_source_content_hash: "355c52b5e90c9e666700cdea121fd1a0e896d4dddc453810becc6441d68154a3",
      amendment_source_url: "https://lawfilesext.leg.wa.gov/biennium/2025-26/Pdf/Amendments/House/1533-S%20AMH%20SCHM%20LEON%20940.pdf",
      candidates: [candidate("text:1935474:3133746", "committee_substitute", "https://lawfilesext.leg.wa.gov/biennium/2025-26/Pdf/Bills/House%20Bills/1533-S.pdf", "1a6c1534ee443991fb47f48d1797cc6ee8a2935d6d2e91cf5aaf96c505981749", 2)],
    });
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") throw new Error("expected resolved");
    expect(result.base.source_document_key).toBe("text:1935474:3133746");
    expect(result.evidence_method).toBe("washington_amendment_header_v1");
    expect(result.evidence.target_phrase).toBe("SHB 1533 - H AMD");
  });

  it("holds when header names another bill, even with a matching base candidate", () => {
    const result = resolve_amendment_base({
      source_text: "ESHB 1534 - S COMM AMD By Committee",
      source_bill_number: "HB1533",
      state_code: "WA",
      amendment_source_document_key: "amendment:1935474:244618",
      amendment_source_content_hash: hash("c"),
      amendment_source_url: "https://lawfilesext.leg.wa.gov/amendment.pdf",
      candidates: [candidate("text:1935474:3171964", "engrossed", "https://lawfilesext.leg.wa.gov/text.pdf", hash("d"))],
    });
    expect(result).toMatchObject({ status: "unresolved", reason: "explicit_target_bill_mismatch" });
  });

  it("holds two contradictory printed target forms instead of picking one", () => {
    expect(parse_amendment_target_reference(
      "SHB 1533 - H AMD and ESHB 1533 - S COMM AMD", "WA",
    )).toBeNull();
  });

  it("accepts repeated identical printed covers without treating them as competing bases", () => {
    const target = parse_amendment_target_reference(
      "ESHB 1533 - S COMM AMD some text ESHB 1533 - S COMM AMD", "WA",
    );
    expect(target).toMatchObject({ bill_number: "HB1533", expected_version_type: "engrossed" });
  });

  it("holds ambiguous exact-version candidates even for an explicit Washington header", () => {
    const result = resolve_amendment_base({
      source_text: "ESHB 1533 - S COMM AMD",
      source_bill_number: "HB1533",
      state_code: "WA",
      amendment_source_document_key: "amendment:1935474:244618",
      amendment_source_content_hash: hash("e"),
      amendment_source_url: "https://lawfilesext.leg.wa.gov/amendment.pdf",
      candidates: [
        candidate("text:1", "engrossed", "https://lawfilesext.leg.wa.gov/1.pdf", hash("f"), 2),
        candidate("text:2", "engrossed", "https://lawfilesext.leg.wa.gov/2.pdf", hash("9"), 3),
      ],
    });
    expect(result).toMatchObject({ status: "unresolved", reason: "exact_target_version_ambiguous" });
  });

  it("requires preserved base hash before attaching an otherwise unique target", () => {
    const result = resolve_amendment_base({
      source_text: "SHB 1533 - H AMD",
      source_bill_number: "HB1533",
      state_code: "WA",
      amendment_source_document_key: "amendment:1935474:233591",
      amendment_source_content_hash: hash("e"),
      amendment_source_url: "https://lawfilesext.leg.wa.gov/amendment.pdf",
      candidates: [candidate("text:1", "committee_substitute", "https://lawfilesext.leg.wa.gov/1.pdf", null)],
    });
    expect(result).toMatchObject({ status: "awaiting_base_content", reason: "exact_base_content_not_preserved" });
  });

  it("does not interpret a WA shorthand header in another state or an unmarked mention", () => {
    expect(parse_amendment_target_reference("ESHB 1533 - S COMM AMD", "LA")).toBeNull();
    expect(parse_amendment_target_reference("A summary mentions ESHB 1533", "WA")).toBeNull();
  });

  it("holds conflicting expanded and shorthand targets in the same source", () => {
    expect(parse_amendment_target_reference(
      "ESHB 1533 - S COMM AMD Amendments to Original House Bill No. 1533", "WA",
    )).toBeNull();
  });
});

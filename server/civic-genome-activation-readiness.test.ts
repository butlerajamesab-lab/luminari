import { describe, expect, it } from "vitest";

import {
  classify_activation_candidate,
  load_rosetta_exports_with_fetch,
  normalize_legislative_identifier,
} from "./civic-genome-activation-readiness";

const bills = [
  {
    genome_bill_id: "11111111-1111-4111-8111-111111111111",
    state_code: "US",
    session_key: "119",
    source_bill_number: "H.R. 1",
    source_bill_title: "Example",
    source_bill_id: "1",
  },
];

const base_row = {
  extraction_run_id: 8,
  source_document_id: 1,
  document_name: "HR1",
  document_type: "bill",
  document_identifier: "HR1",
  jurisdiction_code: "US",
  session_key: "119",
  source_bill_id: null,
  run_version: 1,
  run_status: "completed",
  provenance_state: "complete",
  objects: [{ layer: "help" }],
};

describe("Civic Genome activation readiness", () => {
  it("normalizes legislative identifiers without fuzzy title matching", () => {
    expect(normalize_legislative_identifier("H.R. 1")).toBe("HR1");
    expect(normalize_legislative_identifier(" HB-123 ")).toBe("HB123");
    expect(normalize_legislative_identifier(null)).toBeNull();
  });

  it("requires compatible jurisdiction and session for identifier matching", () => {
    expect(classify_activation_candidate(base_row, bills)).toMatchObject({
      candidate_status: "exact_unique",
      genome_bill_ids: ["11111111-1111-4111-8111-111111111111"],
      match_basis: "jurisdiction_session_identifier",
      object_count: 1,
    });
  });

  it("keeps identifier-only matches unresolved", () => {
    expect(
      classify_activation_candidate(
        { ...base_row, jurisdiction_code: null, session_key: null },
        bills,
      ),
    ).toMatchObject({
      candidate_status: "exact_ambiguous",
      genome_bill_ids: ["11111111-1111-4111-8111-111111111111"],
      match_basis: "identifier_only_unresolved",
    });
  });

  it("does not cross-bind the same bill number across jurisdictions", () => {
    expect(
      classify_activation_candidate(
        { ...base_row, jurisdiction_code: "WA" },
        bills,
      ),
    ).toMatchObject({
      candidate_status: "no_exact_match",
      genome_bill_ids: [],
      match_basis: "none",
    });
  });

  it("uses an authoritative source bill id when present", () => {
    expect(
      classify_activation_candidate(
        { ...base_row, jurisdiction_code: null, session_key: null, source_bill_id: "1" },
        bills,
      ),
    ).toMatchObject({
      candidate_status: "exact_unique",
      genome_bill_ids: ["11111111-1111-4111-8111-111111111111"],
      match_basis: "authoritative_source_id",
    });
  });

  it("does not offer statutes or acts as Genome bill bindings", () => {
    expect(classify_activation_candidate({ ...base_row, document_type: "statute" }, bills)).toMatchObject({
      candidate_status: "not_bill_material",
      genome_bill_ids: [],
      match_basis: "none",
    });
  });

  it("preserves unmatched bill material as unresolved", () => {
    expect(classify_activation_candidate({ ...base_row, document_identifier: "SB999" }, bills)).toMatchObject({
      candidate_status: "no_exact_match",
      genome_bill_ids: [],
      match_basis: "none",
    });
  });

  it("loads every Rosetta page before certifying the audit set", async () => {
    const rows = Array.from({ length: 501 }, (_, index) => ({
      ...base_row,
      source_document_id: index + 1,
      extraction_run_id: index + 1,
    }));
    let calls = 0;
    const fetch_impl: typeof fetch = async (_input, init) => {
      calls += 1;
      const range = String((init?.headers as Record<string, string>).range);
      const [start, requested_end] = range.split("-").map(Number);
      const end = Math.min(requested_end, rows.length - 1);
      return new Response(JSON.stringify(rows.slice(start, end + 1)), {
        status: 200,
        headers: { "content-range": `${start}-${end}/${rows.length}` },
      });
    };

    const result = await load_rosetta_exports_with_fetch("https://example.supabase.co", "key", fetch_impl);
    expect(result).toHaveLength(501);
    expect(calls).toBe(2);
  });

  it("fails closed when a paginated response is truncated", async () => {
    const fetch_impl: typeof fetch = async () =>
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-range": "0-0/2" },
      });

    await expect(
      load_rosetta_exports_with_fetch("https://example.supabase.co", "key", fetch_impl),
    ).rejects.toThrow("rosetta_activation_audit_truncated_response");
  });
});

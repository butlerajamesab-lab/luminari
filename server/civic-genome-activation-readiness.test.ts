import { describe, expect, it, vi } from "vitest";

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
    source_bill_id: "1979531",
  },
];

const base_row = {
  extraction_run_id: 8,
  source_document_id: 1,
  document_name: "HR1",
  document_type: "bill",
  document_identifier: "HR1",
  run_version: 1,
  run_status: "completed",
  provenance_state: "complete",
  objects: [{ layer: "help" }],
};

function response(rows: unknown[], content_range: string): Response {
  return new Response(JSON.stringify(rows), {
    status: 200,
    headers: { "content-type": "application/json", "content-range": content_range },
  });
}

describe("Civic Genome activation readiness", () => {
  it("normalizes legislative identifiers without fuzzy title matching", () => {
    expect(normalize_legislative_identifier("H.R. 1")).toBe("HR1");
    expect(normalize_legislative_identifier(" HB-123 ")).toBe("HB123");
    expect(normalize_legislative_identifier(null)).toBeNull();
  });

  it("keeps bill-number-only matches unresolved even when only one bill is loaded", () => {
    expect(classify_activation_candidate(base_row, bills)).toMatchObject({
      candidate_status: "exact_ambiguous",
      genome_bill_ids: ["11111111-1111-4111-8111-111111111111"],
      match_basis: "identifier_only_unresolved",
      object_count: 1,
    });
  });

  it("does not confuse identical bill numbers across jurisdictions", () => {
    const duplicate = {
      ...bills[0],
      genome_bill_id: "22222222-2222-4222-8222-222222222222",
      state_code: "WA",
      session_key: "2025",
      source_bill_id: "2000000",
    };
    expect(classify_activation_candidate(base_row, [...bills, duplicate])).toMatchObject({
      candidate_status: "exact_ambiguous",
      genome_bill_ids: [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      ],
      match_basis: "identifier_only_unresolved",
    });
  });

  it("allows an authoritative numeric source bill ID to produce a unique candidate", () => {
    expect(classify_activation_candidate({ ...base_row, document_identifier: "1979531" }, bills)).toMatchObject({
      candidate_status: "exact_unique",
      genome_bill_ids: ["11111111-1111-4111-8111-111111111111"],
      match_basis: "authoritative_source_bill_id",
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

  it("loads every Rosetta page before deduplication", async () => {
    const row1 = { ...base_row, source_document_id: 1, extraction_run_id: 9, run_version: 2 };
    const row1Older = { ...base_row, source_document_id: 1, extraction_run_id: 8, run_version: 1 };
    const row2 = { ...base_row, source_document_id: 2, extraction_run_id: 10, document_identifier: "HB2" };
    const fetch_impl = vi
      .fn()
      .mockResolvedValueOnce(response([row1, row1Older], "0-1/3"))
      .mockResolvedValueOnce(response([row2], "2-2/3"));

    const rows = await load_rosetta_exports_with_fetch("https://example.supabase.co", "secret", fetch_impl, 2);

    expect(fetch_impl).toHaveBeenCalledTimes(2);
    expect(rows).toEqual([row1, row2]);
    expect(fetch_impl.mock.calls[0][1]?.headers).toMatchObject({ range: "0-1", prefer: "count=exact" });
    expect(fetch_impl.mock.calls[1][1]?.headers).toMatchObject({ range: "2-3", prefer: "count=exact" });
  });

  it("fails closed when a short page claims more rows remain", async () => {
    const fetch_impl = vi.fn().mockResolvedValue(response([base_row], "0-0/3"));

    await expect(
      load_rosetta_exports_with_fetch("https://example.supabase.co", "secret", fetch_impl, 2),
    ).rejects.toThrow("rosetta_activation_audit_truncated_response");
  });

  it("fails closed when the total changes between pages", async () => {
    const fetch_impl = vi
      .fn()
      .mockResolvedValueOnce(response([base_row, { ...base_row, source_document_id: 2 }], "0-1/3"))
      .mockResolvedValueOnce(response([{ ...base_row, source_document_id: 3 }], "2-2/4"));

    await expect(
      load_rosetta_exports_with_fetch("https://example.supabase.co", "secret", fetch_impl, 2),
    ).rejects.toThrow("rosetta_activation_audit_count_changed_during_read");
  });
});

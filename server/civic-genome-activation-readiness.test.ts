import { describe, expect, it } from "vitest";

import {
  classify_activation_candidate,
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

  it("surfaces exactly one identity candidate without creating a binding", () => {
    expect(classify_activation_candidate(base_row, bills)).toMatchObject({
      candidate_status: "exact_unique",
      genome_bill_ids: ["11111111-1111-4111-8111-111111111111"],
      match_basis: "normalized_identifier",
      object_count: 1,
    });
  });

  it("preserves ambiguity when multiple bills share the same displayed identifier", () => {
    const duplicate = {
      ...bills[0],
      genome_bill_id: "22222222-2222-4222-8222-222222222222",
      state_code: "XX",
    };
    expect(classify_activation_candidate(base_row, [...bills, duplicate])).toMatchObject({
      candidate_status: "exact_ambiguous",
      genome_bill_ids: [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      ],
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
});

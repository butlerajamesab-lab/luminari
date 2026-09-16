import { beforeEach, describe, expect, it, vi } from "vitest";

const { query, load_review } = vi.hoisted(() => ({
  query: vi.fn(),
  load_review: vi.fn(),
}));

vi.mock("./db", () => ({
  getPool: () => ({ query }),
}));

vi.mock("./civic-genome-rosetta-evaluation", () => ({
  load_rosetta_review_detail_for_docket_binding: load_review,
}));

import { assert_exact_docket_source_binding_for_assembly } from "./civic-genome-rosetta-assembly";

const request = {
  genome_bill_id: "00000000-0000-4000-8000-000000000001",
  source_document_id: 5631,
  extraction_run_id: 9821,
  source_document_key: "text:5631:9821",
  source_content_hash: "a".repeat(64),
};

const source_document_key = request.source_document_key;
const source_content_hash = request.source_content_hash;

beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue({
    rows: [{ source_document_key, source_content_hash }],
  });
  load_review.mockResolvedValue({ current_docket_bound_result: {} });
});

describe("Civic Genome Rosetta assembly gate", () => {
  it("accepts only the exact Docket source key and hash for assembly", async () => {
    await expect(assert_exact_docket_source_binding_for_assembly(
      request,
      { source_content_hash } as any,
    )).resolves.toEqual({
      source_document_key,
      source_content_hash,
    });
    expect(String(query.mock.calls[0][0])).toContain("source_document_key");
    expect(String(query.mock.calls[0][0])).toContain("source_document_key = $2::text");
    expect(String(query.mock.calls[0][0])).toContain(
      "receipt_json ->> 'source_content_hash' = $3::text",
    );
    expect(load_review).toHaveBeenCalledWith({
      source_document_key,
      source_content_hash,
    });
    expect(load_review.mock.calls[0][0]).not.toHaveProperty("source_document_id");
  });

  it("rejects a hash mismatch before assembly proceeds", async () => {
    await expect(assert_exact_docket_source_binding_for_assembly(
      request,
      { source_content_hash: "b".repeat(64) } as any,
    )).rejects.toThrow("rosetta_current_docket_bound_result_source_content_hash_mismatch");
    expect(load_review).not.toHaveBeenCalled();
  });

  it("rejects a missing local Docket source key binding", async () => {
    query.mockResolvedValueOnce({ rows: [{ source_document_key: null, source_content_hash }] });
    await expect(assert_exact_docket_source_binding_for_assembly(
      request,
      { source_content_hash } as any,
    )).rejects.toThrow("rosetta_current_docket_bound_result_source_document_key_missing");
  });

  it("does not allow document-id-only assembly fallback", async () => {
    await expect(assert_exact_docket_source_binding_for_assembly(
      {
        genome_bill_id: request.genome_bill_id,
        source_document_id: request.source_document_id,
      },
      { source_content_hash } as any,
    )).rejects.toThrow("rosetta_current_docket_bound_result_exact_selector_missing");
    expect(query).not.toHaveBeenCalled();
    expect(load_review).not.toHaveBeenCalled();
  });
});

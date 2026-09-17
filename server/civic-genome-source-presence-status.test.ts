import { beforeEach, describe, expect, it, vi } from "vitest";

const { query, get_bill, get_by_source, get_by_identifier } = vi.hoisted(() => ({
  query: vi.fn(),
  get_bill: vi.fn(),
  get_by_source: vi.fn(),
  get_by_identifier: vi.fn(),
}));

vi.mock("./db", () => ({ getPool: () => ({ query }) }));
vi.mock("./civic-genome-source-id", () => ({
  get_genome_bill_by_source_id: get_bill,
}));
vi.mock("./civic-genome-rosetta-contract", () => ({
  get_latest_rosetta_law_view_by_source_document: get_by_source,
  get_latest_rosetta_law_view_by_document_identifier: get_by_identifier,
}));
vi.mock("./civic-genome-kaleidoscope-contract", () => ({
  get_kaleidoscope_civic_genome_contract: vi.fn(),
}));
vi.mock("./civic-genome-rosetta-evaluation", () => ({
  get_rosetta_review_base_url: () => "https://rosetta.example.test",
}));

import { get_civic_genome_rosetta_pipeline_status } from "./civic-genome-operating-contracts";

function version(current_source_document_id: number | null, published_source_document_id: number | null = null) {
  return {
    current_version_type: "engrossed",
    current_processing_state: current_source_document_id == null ? "registered" : "source_ingested",
    current_source_document_id,
    published_version_type: published_source_document_id == null ? null : "introduced",
    published_processing_state: published_source_document_id == null ? null : "verified",
    published_source_document_id,
    published_extraction_run_id: published_source_document_id == null ? null : "81",
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  query.mockResolvedValue({ rows: [] });
  get_bill.mockResolvedValue({ genome_bill_id: "11111111-1111-4111-8111-111111111111" });
  get_by_source.mockResolvedValue(null);
  get_by_identifier.mockResolvedValue(null);
});

describe("Civic Genome source presence without a Rosetta result", () => {
  it("retains the exact source ID while waiting, without asserting active processing", async () => {
    query.mockResolvedValueOnce({ rows: [version(19604)] });
    const result = await get_civic_genome_rosetta_pipeline_status(2034656);
    expect(get_by_source).toHaveBeenCalledWith(19604);
    expect(get_by_identifier).not.toHaveBeenCalled();
    expect(result.source_document_id).toBe(19604);
    expect(result.contract_state).toBe("waiting_for_extraction");
    expect(result.extraction_run_id).toBeNull();
    expect(result.run_status).toBeNull();
    expect(result.can_assemble).toBe(false);
    expect(result.contract_message).toContain("exact source is preserved");
    expect(result.contract_message).toContain("Active execution is not established by source acquisition");
    expect(result.contract_message).not.toContain("processing automatically");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("retains a registered source ID on a failed result lookup", async () => {
    query.mockResolvedValueOnce({ rows: [version(19605)] });
    get_by_source.mockRejectedValue(new Error("current_result_unavailable"));
    const result = await get_civic_genome_rosetta_pipeline_status(2034656);
    expect(result.source_document_id).toBe(19605);
    expect(result.contract_state).toBe("contract_error");
    expect(result.extraction_run_id).toBeNull();
    expect(result.can_assemble).toBe(false);
    expect(result.contract_message).toContain("source binding is recorded");
    expect(result.contract_message).not.toContain("No exact Rosetta source");
  });

  it("keeps current and prior source identities distinct while a current result is missing", async () => {
    query.mockResolvedValueOnce({ rows: [version(19606, 44)] });
    const result = await get_civic_genome_rosetta_pipeline_status(2034656);
    expect(result.source_document_id).toBe(19606);
    expect(result.published_source_document_id).toBe(44);
    expect(result.published_extraction_run_id).toBe(81);
    expect(result.extraction_run_id).toBeNull();
    expect(result.contract_state).toBe("current_pending");
    expect(result.contract_message).toContain("remains published");
    expect(result.contract_message).toContain("not a current-version result");
    expect(result.can_assemble).toBe(false);
  });

  it("does not treat the same source as an older published fallback", async () => {
    query.mockResolvedValueOnce({ rows: [version(19607, 19607)] });
    const result = await get_civic_genome_rosetta_pipeline_status(2034656);
    expect(result.source_document_id).toBe(19607);
    expect(result.contract_state).toBe("waiting_for_extraction");
    expect(result.contract_message).not.toContain("prior");
    expect(get_by_source).toHaveBeenCalledTimes(1);
    expect(result.can_assemble).toBe(false);
  });

  it("reports absent attachment rather than asserting no source exists anywhere", async () => {
    query.mockResolvedValueOnce({ rows: [version(null)] });
    const result = await get_civic_genome_rosetta_pipeline_status(2034656);
    expect(result.source_document_id).toBeNull();
    expect(result.contract_state).toBe("not_handed_off");
    expect(result.contract_message).toContain("No exact Rosetta source binding was observed for the selected Docket version");
    expect(result.contract_message).not.toContain("exists for this Docket bill");
    expect(get_by_source).not.toHaveBeenCalled();
    expect(get_by_identifier).not.toHaveBeenCalled();
    expect(result.can_assemble).toBe(false);
  });

  it("preserves prior publication when the current source is not attached", async () => {
    query.mockResolvedValueOnce({ rows: [version(null, 44)] });
    const result = await get_civic_genome_rosetta_pipeline_status(2034656);
    expect(result.source_document_id).toBeNull();
    expect(result.published_source_document_id).toBe(44);
    expect(result.contract_state).toBe("current_pending");
    expect(result.contract_message).toContain("remains published");
    expect(result.contract_message).not.toContain("processing automatically");
    expect(result.can_assemble).toBe(false);
  });

  it("retains legacy identifier lookup only when no version record is available", async () => {
    const result = await get_civic_genome_rosetta_pipeline_status(2034656);
    expect(get_by_identifier).toHaveBeenCalledWith("2034656");
    expect(get_by_source).not.toHaveBeenCalled();
    expect(result.source_document_id).toBeNull();
    expect(result.contract_state).toBe("not_handed_off");
    expect(result.can_assemble).toBe(false);
  });

  it("does not invent source identity when the legacy result lookup fails", async () => {
    get_by_identifier.mockRejectedValue(new Error("lookup_failed"));
    const result = await get_civic_genome_rosetta_pipeline_status(2034656);
    expect(result.source_document_id).toBeNull();
    expect(result.contract_state).toBe("contract_error");
    expect(result.contract_message).not.toContain("source binding is recorded");
    expect(result.can_assemble).toBe(false);
  });
});

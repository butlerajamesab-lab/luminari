import { beforeEach, describe, expect, it, vi } from "vitest";

const { query, get_bill, get_by_source, get_by_identifier } = vi.hoisted(() => ({
  query: vi.fn(),
  get_bill: vi.fn(),
  get_by_source: vi.fn(),
  get_by_identifier: vi.fn(),
}));
vi.mock("./db", () => ({ getPool: () => ({ query }) }));
vi.mock("./civic-genome-source-id", () => ({ get_genome_bill_by_source_id: get_bill }));
vi.mock("./civic-genome-rosetta-contract", () => ({
  get_latest_rosetta_law_view_by_source_document: get_by_source,
  get_latest_rosetta_law_view_by_document_identifier: get_by_identifier,
}));
vi.mock("./civic-genome-kaleidoscope-contract", () => ({ get_kaleidoscope_civic_genome_contract: () => ({}) }));
vi.mock("./civic-genome-rosetta-evaluation", () => ({ get_rosetta_review_base_url: () => "https://review.example.test" }));

import {
  get_civic_genome_operating_contracts,
  get_civic_genome_rosetta_pipeline_status,
} from "./civic-genome-operating-contracts";

const genome_bill_id = "11111111-1111-4111-8111-111111111111";
function selection(current_source_document_id: number | null, published_source_document_id: number | null = null) {
  return {
    current_version_type: "introduced",
    current_processing_state: current_source_document_id == null ? "registered" : "source_ingested",
    current_source_document_id,
    published_version_type: published_source_document_id == null ? null : "introduced",
    published_processing_state: published_source_document_id == null ? null : "verified",
    published_source_document_id,
    published_extraction_run_id: published_source_document_id == null ? null : "700",
  };
}
function view(source_document_id: number, run_status = "completed") {
  return {
    source_document_id, extraction_run_id: 700, run_status,
    law_view: { objects: [{ layer: "help" }], coverage: { help: 1 }, provenanceState: "complete" },
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  query.mockResolvedValue({ rows: [] });
  get_bill.mockResolvedValue({ genome_bill_id });
  get_by_source.mockResolvedValue(null);
  get_by_identifier.mockResolvedValue(null);
});

describe("Rosetta source presence is independent from result availability", () => {
  it("preserves an acquired exact source when no extraction view exists", async () => {
    query.mockResolvedValueOnce({ rows: [selection(101)] });
    const result = await get_civic_genome_rosetta_pipeline_status(9001);
    expect(result.source_document_id).toBe(101);
    expect(result.contract_state).toBe("waiting_for_extraction");
    expect(result.contract_message).toContain("source is preserved");
    expect(result.contract_message).toContain("Active execution is not established");
    expect(result.can_assemble).toBe(false);
    expect(result.extraction_run_id).toBeNull();
    expect(result.run_status).toBeNull();
    expect(get_by_source).toHaveBeenCalledWith(101);
    expect(get_by_identifier).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("retains the acquired source even when its RPC cannot be observed", async () => {
    query.mockResolvedValueOnce({ rows: [selection(102)] });
    get_by_source.mockRejectedValueOnce(new Error("temporary_rpc_failure"));
    const result = await get_civic_genome_rosetta_pipeline_status(9002);
    expect(result.source_document_id).toBe(102);
    expect(result.contract_state).toBe("contract_error");
    expect(result.can_assemble).toBe(false);
    expect(result.extraction_run_id).toBeNull();
  });
  it("keeps missing acquisition distinct and never falls back across a known version", async () => {
    query.mockResolvedValueOnce({ rows: [selection(null)] });
    const result = await get_civic_genome_rosetta_pipeline_status(9003);
    expect(result.source_document_id).toBeNull();
    expect(result.contract_state).toBe("not_handed_off");
    expect(result.contract_message).toContain("binding is recorded");
    expect(result.contract_message).not.toContain("document exists");
    expect(get_by_source).not.toHaveBeenCalled();
    expect(get_by_identifier).not.toHaveBeenCalled();
    expect(result.can_assemble).toBe(false);
  });
  it("preserves both current and prior identities without borrowing a prior result", async () => {
    query.mockResolvedValueOnce({ rows: [selection(103, 99)] });
    get_by_source.mockImplementation(async (id: number) => id === 99 ? view(99) : null);
    const result = await get_civic_genome_rosetta_pipeline_status(9004);
    expect(result.source_document_id).toBe(103);
    expect(result.extraction_run_id).toBeNull();
    expect(result.published_source_document_id).toBe(99);
    expect(result.published_extraction_run_id).toBe(700);
    expect(result.contract_state).toBe("current_pending");
    expect(result.contract_message).toContain("source is preserved");
    expect(result.contract_message).toContain("remains published");
    expect(result.contract_message).not.toContain("processing automatically");
    expect(result.can_assemble).toBe(false);
  });
  it("does not imply a current source exists just because a prior version is published", async () => {
    query.mockResolvedValueOnce({ rows: [selection(null, 99)] });
    get_by_source.mockResolvedValue(view(99));
    const result = await get_civic_genome_rosetta_pipeline_status(9005);
    expect(result.source_document_id).toBeNull();
    expect(result.published_source_document_id).toBe(99);
    expect(result.contract_state).toBe("current_pending");
    expect(result.contract_message).toContain("No exact source binding");
    expect(result.contract_message).not.toContain("processing automatically");
    expect(result.can_assemble).toBe(false);
  });
  it("does not label a failed current run as automatically processing when a prior result exists", async () => {
    query.mockResolvedValueOnce({ rows: [selection(104, 99)] });
    get_by_source.mockImplementation(async (id: number) => view(id, id === 104 ? "failed" : "completed"));
    const result = await get_civic_genome_rosetta_pipeline_status(9006);
    expect(result.run_status).toBe("failed");
    expect(result.contract_state).toBe("current_pending");
    expect(result.contract_message).not.toContain("processing automatically");
    expect(result.can_assemble).toBe(false);
  });
  it("preserves the existing complete-result assembly gate", async () => {
    query.mockResolvedValueOnce({ rows: [selection(105)] });
    get_by_source.mockResolvedValue(view(105));
    const result = await get_civic_genome_rosetta_pipeline_status(9007);
    expect(result.source_document_id).toBe(105);
    expect(result.contract_state).toBe("ready_for_assembly");
    expect(result.can_assemble).toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
  });
  it("leaves unrelated operating-contract rendering intact", async () => {
    const result = await get_civic_genome_operating_contracts();
    expect(result.contracts.find(contract => contract.service_key === "rosetta")?.detail)
      .toBe("0 explicit source bindings and 0 completed assemblies are materialized.");
  });
});

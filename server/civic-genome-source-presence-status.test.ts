import { beforeEach, describe, expect, it, vi } from "vitest";

const { query, get_bill, get_current } = vi.hoisted(() => ({
  query: vi.fn(),
  get_bill: vi.fn(),
  get_current: vi.fn(),
}));

vi.mock("./db", () => ({ getPool: () => ({ query }) }));
vi.mock("./civic-genome-source-id", () => ({
  get_genome_bill_by_source_id: get_bill,
}));
vi.mock("./civic-genome-kaleidoscope-contract", () => ({
  get_kaleidoscope_civic_genome_contract: vi.fn(),
}));
vi.mock("./civic-genome-rosetta-evaluation", () => ({
  get_rosetta_review_base_url: () => "https://rosetta.example.test",
  load_rosetta_current_docket_result_for_binding: get_current,
}));

import { get_civic_genome_rosetta_pipeline_status } from "./civic-genome-operating-contracts";

const source_document_key = "text:2034656:19604";
const source_content_hash = "a".repeat(64);
function version(source_document_id: number | null, extra: Record<string, unknown> = {}) {
  return {
    current_version_type: "engrossed",
    current_processing_state: source_document_id == null ? "registered" : "source_ingested",
    current_source_document_id: source_document_id,
    current_source_document_key: source_document_id == null ? null : source_document_key,
    current_source_content_hash: source_document_id == null ? null : source_content_hash,
    ...extra,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  query.mockResolvedValue({ rows: [] });
  get_bill.mockResolvedValue({ genome_bill_id: "11111111-1111-4111-8111-111111111111" });
  get_current.mockResolvedValue(null);
});

describe("Docket source observation independent of Rosetta interpretation", () => {
  it("retains exact source identity, but never infers a decomposition", async () => {
    query.mockResolvedValueOnce({ rows: [version(19604)] });
    const result = await get_civic_genome_rosetta_pipeline_status(2034656);
    expect(get_current).toHaveBeenCalledWith({ source_document_key, source_content_hash });
    expect(result.source_document_id).toBe(19604);
    expect(result.contract_state).toBe("waiting_for_extraction");
    expect(result.extraction_run_id).toBeNull();
    expect(result.run_status).toBeNull();
    expect(result.can_assemble).toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("preserves source identity without publication when the current API fails", async () => {
    query.mockResolvedValueOnce({ rows: [version(19605)] });
    get_current.mockRejectedValue(new Error("selected_runtime_unavailable"));
    const result = await get_civic_genome_rosetta_pipeline_status(2034656);
    expect(result.source_document_id).toBe(19605);
    expect(result.contract_state).toBe("contract_error");
    expect(result.extraction_run_id).toBeNull();
    expect(result.can_assemble).toBe(false);
    expect(result.contract_message).toContain("No historical result is substituted");
  });

  it("does not expose obsolete prior-engine receipt metadata", async () => {
    query.mockResolvedValueOnce({ rows: [version(19606, {
      published_source_document_id: 44,
      published_extraction_run_id: "81",
      published_processing_state: "verified",
    })] });
    const result = await get_civic_genome_rosetta_pipeline_status(2034656);
    expect(result.source_document_id).toBe(19606);
    expect(result.published_source_document_id).toBeNull();
    expect(result.published_extraction_run_id).toBeNull();
    expect(result.published_object_count).toBeNull();
    expect(result.extraction_run_id).toBeNull();
    expect(result.contract_message).not.toContain("remains published");
  });

  it("never uses a bare numeric bill identifier as a legacy Rosetta fallback", async () => {
    const result = await get_civic_genome_rosetta_pipeline_status(2034656);
    expect(result.source_document_id).toBeNull();
    expect(result.contract_state).toBe("not_handed_off");
    expect(result.can_assemble).toBe(false);
    expect(get_current).not.toHaveBeenCalled();
  });

  it("reports missing source-content hashes without calling Rosetta", async () => {
    query.mockResolvedValueOnce({ rows: [version(19607, { current_source_content_hash: null })] });
    const result = await get_civic_genome_rosetta_pipeline_status(2034656);
    expect(result.contract_state).toBe("waiting_for_extraction");
    expect(result.contract_message).toContain("exact source key and content-hash binding");
    expect(get_current).not.toHaveBeenCalled();
  });

  it("does not claim external Docket source bytes are absent from a missing binding", async () => {
    query.mockResolvedValueOnce({ rows: [version(null)] });
    const result = await get_civic_genome_rosetta_pipeline_status(2034656);
    expect(result.source_document_id).toBeNull();
    expect(result.contract_state).toBe("not_handed_off");
    expect(result.contract_message).toContain("does not establish that the source bytes are absent elsewhere");
    expect(get_current).not.toHaveBeenCalled();
  });
});

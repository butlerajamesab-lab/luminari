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
vi.mock("./civic-genome-rosetta-evaluation", () => ({ get_rosetta_review_base_url: () => null }));

import { get_civic_genome_rosetta_pipeline_status } from "./civic-genome-operating-contracts";

const source_id = 19607;
const prior_source_id = 44;
const source_bill_id = 2093644;
const selection = {
  current_version_type: "introduced",
  current_processing_state: "source_ingested",
  current_source_document_id: source_id as number | null,
  published_version_type: null as string | null,
  published_processing_state: null as string | null,
  published_source_document_id: null as number | null,
  published_extraction_run_id: null as string | null,
};
const prior = {
  published_source_document_id: prior_source_id,
  published_version_type: "introduced",
  published_processing_state: "verified",
  published_extraction_run_id: "11",
};
const completed_view = {
  source_document_id: source_id,
  extraction_run_id: 11,
  run_status: "completed",
  law_view: { provenanceState: "complete", objects: [{ key: "test" }], coverage: { help: 1 } },
};

beforeEach(() => {
  vi.resetAllMocks();
  query.mockResolvedValue({ rows: [] });
  query.mockResolvedValueOnce({ rows: [{ ...selection }] });
  get_bill.mockResolvedValue({ genome_bill_id: "11111111-1111-4111-8111-111111111111" });
  get_by_source.mockResolvedValue(null);
  get_by_identifier.mockResolvedValue(null);
});

function select_version(overrides: Partial<typeof selection>) {
  query.mockReset();
  query.mockResolvedValue({ rows: [] });
  query.mockResolvedValueOnce({ rows: [{ ...selection, ...overrides }] });
}

describe("preserved Rosetta source status", () => {
  it("retains a known source while its extraction view is absent", async () => {
    const result = await get_civic_genome_rosetta_pipeline_status(source_bill_id);
    expect(result).toMatchObject({ source_document_id: source_id, contract_state: "waiting_for_extraction", can_assemble: false, extraction_run_id: null, run_status: null, object_count: 0 });
    expect(result.contract_message).toContain("source is preserved");
    expect(get_by_source).toHaveBeenCalledWith(source_id);
    expect(get_by_identifier).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("retains the source identity when the exact export request fails", async () => {
    get_by_source.mockRejectedValue(new Error("private_dependency_error"));
    const result = await get_civic_genome_rosetta_pipeline_status(source_bill_id);
    expect(result).toMatchObject({ source_document_id: source_id, contract_state: "contract_error", can_assemble: false });
    expect(result.contract_message).not.toContain("private_dependency_error");
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("keeps current and prior identities separate without claiming execution", async () => {
    select_version(prior);
    const result = await get_civic_genome_rosetta_pipeline_status(source_bill_id);
    expect(result).toMatchObject({ source_document_id: source_id, published_source_document_id: prior_source_id, contract_state: "current_pending", can_assemble: false });
    expect(result.contract_message).toContain("remains published");
    expect(result.contract_message).not.toContain("processing automatically");
    expect(get_by_source.mock.calls).toEqual([[source_id], [prior_source_id]]);
  });

  it("reports an unrecorded binding without asserting that source bytes do not exist", async () => {
    select_version({ current_source_document_id: null });
    const result = await get_civic_genome_rosetta_pipeline_status(source_bill_id);
    expect(result).toMatchObject({ source_document_id: null, contract_state: "not_handed_off", can_assemble: false });
    expect(result.contract_message).toContain("binding is not yet recorded");
    expect(get_by_source).not.toHaveBeenCalled();
  });

  it("never substitutes a prior published identity for an absent current binding", async () => {
    select_version({ ...prior, current_source_document_id: null });
    const result = await get_civic_genome_rosetta_pipeline_status(source_bill_id);
    expect(result).toMatchObject({ source_document_id: null, published_source_document_id: prior_source_id, contract_state: "current_pending", can_assemble: false });
    expect(result.contract_message).not.toContain("processing automatically");
  });

  it("keeps the no-version identifier fallback read-only and unbound", async () => {
    query.mockReset();
    query.mockResolvedValue({ rows: [] });
    const result = await get_civic_genome_rosetta_pipeline_status(source_bill_id);
    expect(result).toMatchObject({ source_document_id: null, can_assemble: false });
    expect(get_by_identifier).toHaveBeenCalledWith(String(source_bill_id));
  });

  it("preserves existing assembly eligibility for a completed unassembled result", async () => {
    get_by_source.mockResolvedValue(completed_view);
    const result = await get_civic_genome_rosetta_pipeline_status(source_bill_id);
    expect(result).toMatchObject({ contract_state: "ready_for_assembly", can_assemble: true });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("does not enable assembly for a nonterminal extraction", async () => {
    get_by_source.mockResolvedValue({ ...completed_view, run_status: "in_progress" });
    const result = await get_civic_genome_rosetta_pipeline_status(source_bill_id);
    expect(result).toMatchObject({ contract_state: "waiting_for_extraction", can_assemble: false });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("preserves the already-assembled state", async () => {
    select_version({ current_processing_state: "verified" });
    query.mockResolvedValueOnce({ rows: [{ assembly_run_id: "fixture-assembly" }] });
    get_by_source.mockResolvedValue(completed_view);
    const result = await get_civic_genome_rosetta_pipeline_status(source_bill_id);
    expect(result).toMatchObject({ contract_state: "assembled", can_assemble: false });
  });

  it("does not claim execution when a completed current result still awaits Genome verification", async () => {
    select_version(prior);
    get_by_source.mockResolvedValue(completed_view);
    const result = await get_civic_genome_rosetta_pipeline_status(source_bill_id);
    expect(result).toMatchObject({ contract_state: "current_pending", can_assemble: false });
    expect(result.contract_message).not.toContain("processing automatically");
  });
});

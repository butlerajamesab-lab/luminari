import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  query,
  get_bill,
  get_rosetta_view,
} = vi.hoisted(() => ({
  query: vi.fn(),
  get_bill: vi.fn(),
  get_rosetta_view: vi.fn(),
}));

vi.mock("./db", () => ({
  getPool: () => ({ query }),
}));

vi.mock("./civic-genome-source-id", () => ({
  get_genome_bill_by_source_id: get_bill,
}));

vi.mock("./civic-genome-rosetta-contract", () => ({
  get_latest_rosetta_law_view_by_document_identifier: get_rosetta_view,
  get_latest_rosetta_law_view_by_source_document: get_rosetta_view,
}));

import {
  get_civic_genome_operating_contracts,
  get_civic_genome_rosetta_pipeline_status,
} from "./civic-genome-operating-contracts";

const genome_bill_id = "11111111-1111-4111-8111-111111111111";

function completed_view() {
  return {
    extraction_run_id: 11,
    source_document_id: 4,
    corpus_id: 1,
    document_name: "HB 2681",
    document_type: "bill",
    document_identifier: "2093644",
    run_version: 1,
    run_status: "completed",
    confidence_threshold: 0.75,
    created_at: "2026-07-31T00:00:00.000Z",
    completed_at: "2026-07-31T00:01:00.000Z",
    law_view: {
      objects: [{
        layer: "help",
        key: "eligible_person",
        normalizedValue: { class: "resident" },
        sourceObjectType: "eligibility_rule",
        sourceObjectId: "object-1",
        sourceBlockId: "block-1",
        extractionRunId: "11",
        confidence: 0.95,
        confirmed: true,
      }],
      coverage: { help: 1, workflow: 0, accountability: 0, override: 0, definition: 0 },
      provenanceState: "partial",
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue({ rows: [] });
  get_bill.mockResolvedValue({ genome_bill_id });
});

describe("Civic Genome operating contracts", () => {
  it("reports Atlas as unbound, active deep Prism verification, and only Rosetta with a standalone external service", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          bill_count: "813",
          latest_bill_observed_at: "2026-07-31T00:00:00.000Z",
          rosetta_binding_count: "31",
          rosetta_assembly_count: "1",
          relationship_count: "0",
          comparison_matrix_count: "0",
          comparison_state_cell_count: "0",
          prism_deep_binding_count: "31",
          prism_deep_run_count: "1",
          prism_legacy_binding_count: "31",
          latest_prism_deep_bound_at: "2026-08-05T16:54:44.000Z",
        }],
      })
      .mockResolvedValueOnce({
        rows: [{ signal_count: "63", latest_bridged_at: "2026-07-30T00:00:00.000Z" }],
      });

    const result = await get_civic_genome_operating_contracts();
    const rosetta = result.contracts.find(contract => contract.service_key === "rosetta");
    const atlas = result.contracts.find(contract => contract.service_key === "atlas");
    const prism = result.contracts.find(contract => contract.service_key === "prism");
    const local_query = query.mock.calls[0]?.[0] as string;
    const local_params = query.mock.calls[0]?.[1] as string[];

    expect(rosetta?.external_url).toBe("https://rosetta-v3-platform.onrender.com");
    expect(rosetta?.detail).not.toContain("https://");
    expect(rosetta?.boundary).toContain("without duplicating it");
    expect(result.contracts.filter(contract => contract.external_url !== null)).toEqual([rosetta]);
    expect(atlas?.state).toBe("available_unbound");
    expect(atlas?.observed_count).toBe(63);
    expect(atlas?.bound_count).toBe(0);
    expect(prism?.state).toBe("operational");
    expect(prism?.role).toBe("Deterministic source replay and structural verification");
    expect(prism?.observed_count).toBe(31);
    expect(prism?.bound_count).toBe(31);
    expect(prism?.detail).toContain("31 legacy binding-only receipts remain preserved");
    expect(prism?.boundary).toContain("independently replays immutable Rosetta source snapshots");
    expect(prism?.boundary).toContain("without rewriting Rosetta-owned extraction output");
    expect(local_query).toContain("prism_rule_set_version = $2");
    expect(local_params).toEqual([
      "prism-rosetta-structural-binding",
      "2.0.0",
    ]);
  });

  it("never enables assembly for an in-progress Rosetta run", async () => {
    const view = completed_view();
    view.run_status = "in_progress";
    view.completed_at = null;
    view.law_view.objects = [];
    get_rosetta_view.mockResolvedValue(view);

    const result = await get_civic_genome_rosetta_pipeline_status(2093644);
    expect(result.contract_state).toBe("waiting_for_extraction");
    expect(result.can_assemble).toBe(false);
  });

  it("enables only an unassembled completed provenance-valid run", async () => {
    get_rosetta_view.mockResolvedValue(completed_view());
    query.mockResolvedValueOnce({ rows: [] });

    const result = await get_civic_genome_rosetta_pipeline_status(2093644);
    expect(result.contract_state).toBe("ready_for_assembly");
    expect(result.can_assemble).toBe(true);
  });

  it("reports a Rosetta contract failure without failing the whole page", async () => {
    get_rosetta_view.mockRejectedValue(new Error("missing_rosetta_supabase_url"));

    const result = await get_civic_genome_rosetta_pipeline_status(2093644);
    expect(result.contract_state).toBe("contract_error");
    expect(result.can_assemble).toBe(false);
  });

  it("resolves the newest version by its exact Rosetta source document", async () => {
    query.mockResolvedValueOnce({ rows: [{ rosetta_source_document_id: 44 }] });
    get_rosetta_view.mockResolvedValue(completed_view());

    await get_civic_genome_rosetta_pipeline_status(2093644);

    expect(get_rosetta_view).toHaveBeenCalledWith(44);
    expect(query.mock.calls[0]?.[0]).toContain("civic_genome_bill_version");
    expect(query.mock.calls[0]?.[0]).toContain("order by stage_rank desc");
  });

  it("does not substitute an older legacy run while the current version is pending", async () => {
    query.mockResolvedValueOnce({ rows: [{ rosetta_source_document_id: null }] });

    const result = await get_civic_genome_rosetta_pipeline_status(2093644);

    expect(get_rosetta_view).not.toHaveBeenCalled();
    expect(result.contract_state).toBe("not_handed_off");
  });
});

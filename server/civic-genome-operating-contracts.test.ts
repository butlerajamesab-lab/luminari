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
  get_bill.mockResolvedValue({ genome_bill_id });
});

describe("Civic Genome operating contracts", () => {
  it("reports retrieved Atlas signals as available but explicitly unbound", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          bill_count: "813",
          latest_bill_observed_at: "2026-07-31T00:00:00.000Z",
          rosetta_binding_count: "0",
          rosetta_assembly_count: "0",
          relationship_count: "0",
          comparison_matrix_count: "0",
          comparison_state_cell_count: "0",
        }],
      })
      .mockResolvedValueOnce({
        rows: [{ signal_count: "63", latest_bridged_at: "2026-07-30T00:00:00.000Z" }],
      });

    const result = await get_civic_genome_operating_contracts();
    const atlas = result.contracts.find(contract => contract.service_key === "atlas");
    const prism = result.contracts.find(contract => contract.service_key === "prism");

    expect(atlas?.state).toBe("available_unbound");
    expect(atlas?.observed_count).toBe(63);
    expect(atlas?.bound_count).toBe(0);
    expect(prism?.state).toBe("not_established");
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
});

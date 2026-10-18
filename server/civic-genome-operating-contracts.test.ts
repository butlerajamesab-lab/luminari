import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  query,
  get_bill,
  get_current,
  get_kaleidoscope,
  is_quarantined,
} = vi.hoisted(() => ({
  query: vi.fn(),
  get_bill: vi.fn(),
  get_current: vi.fn(),
  get_kaleidoscope: vi.fn(),
  is_quarantined: vi.fn(() => true),
}));

vi.mock("./db", () => ({
  getPool: () => ({ query }),
}));

vi.mock("./civic-genome-source-id", () => ({
  get_genome_bill_by_source_id: get_bill,
}));

vi.mock("./civic-genome-rosetta-evaluation", async import_original => ({
  ...await import_original<typeof import("./civic-genome-rosetta-evaluation")>(),
  load_rosetta_current_docket_result_for_binding: get_current,
}));

vi.mock("./civic-genome-kaleidoscope-contract", () => ({
  get_kaleidoscope_civic_genome_contract: get_kaleidoscope,
}));

vi.mock("./civic-genome-rosetta-publication-quarantine", () => ({
  is_genome_rosetta_publication_quarantined: is_quarantined,
}));

import {
  get_civic_genome_operating_contracts,
  get_civic_genome_rosetta_pipeline_status,
} from "./civic-genome-operating-contracts";

const genome_bill_id = "11111111-1111-4111-8111-111111111111";

const exact_source_key = "text:2093644:3456";
const exact_source_hash = "a".repeat(64);
function selected_result() {
  return {
    docket_source_key: exact_source_key,
    source_content_hash: exact_source_hash,
    status: "complete",
    current_result: {
      extraction_run_id: 11,
      output_content_hash: "b".repeat(64),
      engine_version: "runtime-selected-new-generation",
      rule_set_version: "runtime-selected-rules",
      rule_manifest_hash: "c".repeat(64),
      configuration_hash: "d".repeat(64),
      admissibility_state: "admissible",
    },
  };
}
function selected_version(extra: Record<string, unknown> = {}) {
  return {
    current_version_type: "chaptered",
    current_processing_state: "source_ingested",
    current_source_document_id: 44,
    current_source_document_key: exact_source_key,
    current_source_content_hash: exact_source_hash,
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  is_quarantined.mockReturnValue(true);
  query.mockResolvedValue({ rows: [] });
  get_bill.mockResolvedValue({ genome_bill_id });
  get_kaleidoscope.mockResolvedValue({
    service_key: "kaleidoscope",
    display_name: "Kaleidoscope",
    external_url: null,
    role: "Authenticated immutable baseline consumer",
    state: "bound_not_projected",
    state_label: "Source bound, projection not executed",
    detail: "18 durable bindings; no projection executed.",
    observed_count: 18,
    bound_count: 18,
    last_observed_at: null,
    boundary: "Projection state is separate from binding state.",
  });
});

describe("Civic Genome operating contracts", () => {
  it("advertises the configured Rosetta review host for all navigation", async () => {
    vi.stubEnv("ROSETTA_REVIEW_BASE_URL", "https://review.example.org/");
    query.mockResolvedValue({ rows: [] });
    try {
      const result = await get_civic_genome_operating_contracts();
      expect(result.contracts.find(contract => contract.service_key === "rosetta")?.external_url).toBe("https://review.example.org");
    } finally {
      vi.unstubAllEnvs();
    }
  });
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
        rows: [{
          signal_count: "63",
          latest_bridged_at: "2026-07-30T00:00:00.000Z",
          latest_current_atlas_observation_at: "2026-10-07T06:51:58.596Z",
        }],
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
    expect(atlas?.state).toBe("stale");
    expect(atlas?.state_label).toBe("Lighthouse bridge stale");
    expect(atlas?.detail).toContain("Lighthouse bridge is behind current Atlas observation truth");
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
      "2.5.0",
    ]);
  });

  it("keeps a fresh Atlas bridge distinct from a stale bridge", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          bill_count: "1",
          latest_bill_observed_at: "2026-10-07T00:00:00.000Z",
          rosetta_binding_count: "0",
          rosetta_assembly_count: "0",
          relationship_count: "0",
          comparison_matrix_count: "0",
          comparison_state_cell_count: "0",
          prism_deep_binding_count: "0",
          prism_deep_run_count: "0",
          prism_legacy_binding_count: "0",
          latest_prism_deep_bound_at: null,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          signal_count: "63",
          latest_bridged_at: "2026-10-07T06:51:58.596Z",
          latest_current_atlas_observation_at: "2026-10-07T06:51:58.596Z",
        }],
      });

    const result = await get_civic_genome_operating_contracts();
    const atlas = result.contracts.find(contract => contract.service_key === "atlas");
    expect(atlas?.state).toBe("available_unbound");
  });

  it("does not claim a current result when the exact binding is absent", async () => {
    query.mockResolvedValueOnce({ rows: [selected_version({ current_source_content_hash: null })] });
    const result = await get_civic_genome_rosetta_pipeline_status(2093644);
    expect(result.contract_state).toBe("waiting_for_extraction");
    expect(result.can_assemble).toBe(false);
    expect(get_current).not.toHaveBeenCalled();
    expect(result.object_count).toBeNull();
  });

  it("observes an exact selected-runtime result without bypassing publication quarantine", async () => {
    query.mockResolvedValueOnce({ rows: [selected_version()] });
    get_current.mockResolvedValue(selected_result());
    const result = await get_civic_genome_rosetta_pipeline_status(2093644);
    expect(get_current).toHaveBeenCalledWith({
      source_document_key: exact_source_key,
      source_content_hash: exact_source_hash,
    });
    expect(result.source_document_id).toBe(44);
    expect(result.extraction_run_id).toBe(11);
    expect(result.run_status).toBe("completed");
    expect(result.object_count).toBeNull();
    expect(result.coverage).toBeNull();
    expect(result.contract_state).toBe("awaiting_current_result");
    expect(result.can_assemble).toBe(false);
  });

  it("refuses a selected result that disagrees with the exact Docket key", async () => {
    query.mockResolvedValueOnce({ rows: [selected_version()] });
    get_current.mockResolvedValue({
      ...selected_result(), docket_source_key: "text:someone-else:0001",
    });
    const result = await get_civic_genome_rosetta_pipeline_status(2093644);
    expect(result.contract_state).toBe("contract_error");
    expect(result.extraction_run_id).toBeNull();
    expect(result.can_assemble).toBe(false);
  });

  it("reports selected-runtime read errors without reading historical results", async () => {
    query.mockResolvedValueOnce({ rows: [selected_version()] });
    get_current.mockRejectedValue(new Error("rosetta_result_read_unavailable"));
    const result = await get_civic_genome_rosetta_pipeline_status(2093644);
    expect(result.contract_state).toBe("contract_error");
    expect(result.can_assemble).toBe(false);
    expect(result.contract_message).toContain("No historical result is substituted");
  });

  it("never resurrects previously verified versions from old receipts", async () => {
    query.mockResolvedValueOnce({ rows: [selected_version({
      published_source_document_id: 33,
      published_extraction_run_id: "7",
      published_processing_state: "verified_with_findings",
    })] });
    get_current.mockResolvedValue(null);
    const result = await get_civic_genome_rosetta_pipeline_status(2093644);
    expect(result.published_source_document_id).toBeNull();
    expect(result.published_extraction_run_id).toBeNull();
    expect(result.published_object_count).toBeNull();
    expect(result.contract_state).toBe("waiting_for_extraction");
    expect(result.contract_message).not.toContain("remains published");
  });
  it("recognizes an exact completed current assembly without resubmitting it after readmission", async () => {
    is_quarantined.mockReturnValue(false);
    query
      .mockResolvedValueOnce({ rows: [selected_version()] })
      .mockResolvedValueOnce({ rows: [{
        engine_version: "runtime-selected-new-generation",
        rule_set_version: "runtime-selected-rules",
        rule_manifest_hash: "c".repeat(64),
      }] })
      .mockResolvedValueOnce({ rows: [{ assembled: true }] });
    get_current.mockResolvedValue(selected_result());

    const result = await get_civic_genome_rosetta_pipeline_status(2093644);
    expect(result.contract_state).toBe("assembled");
    expect(result.can_assemble).toBe(false);
    expect(result.extraction_run_id).toBe(11);
    expect(query).toHaveBeenCalledTimes(3);
    const [sql, args] = query.mock.calls[2] as [string, unknown[]];
    expect(sql).toContain("from public.civic_genome_assembly_run");
    expect(sql).toContain("verification_state = 'complete'");
    expect(sql).toContain("malformed_object_count = 0");
    expect(sql).toContain("rosetta_output_content_hash");
    expect(args).toEqual([
      genome_bill_id, 44, "11",
      "runtime-selected-new-generation", "runtime-selected-rules",
      "c".repeat(64), exact_source_hash, "b".repeat(64),
    ]);
  });

  it("requires an exact existing assembly match; an old assembly cannot suppress new work", async () => {
    is_quarantined.mockReturnValue(false);
    query
      .mockResolvedValueOnce({ rows: [selected_version()] })
      .mockResolvedValueOnce({ rows: [{
        engine_version: "runtime-selected-new-generation",
        rule_set_version: "runtime-selected-rules",
        rule_manifest_hash: "c".repeat(64),
      }] })
      .mockResolvedValueOnce({ rows: [{ assembled: false }] });
    get_current.mockResolvedValue(selected_result());

    const result = await get_civic_genome_rosetta_pipeline_status(2093644);
    expect(result.contract_state).toBe("ready_for_assembly");
    expect(result.can_assemble).toBe(true);
  });

  it("does not consult historical assembly records while publication remains quarantined", async () => {
    query.mockResolvedValueOnce({ rows: [selected_version()] });
    get_current.mockResolvedValue(selected_result());

    const result = await get_civic_genome_rosetta_pipeline_status(2093644);
    expect(result.contract_state).toBe("awaiting_current_result");
    expect(result.can_assemble).toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
  });


});

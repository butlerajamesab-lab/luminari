import { beforeEach, describe, expect, it, vi } from "vitest";

const { query, load_current, load_exact_view, load_latest_view } = vi.hoisted(() => ({
  query: vi.fn(),
  load_current: vi.fn(),
  load_exact_view: vi.fn(),
  load_latest_view: vi.fn(),
}));

vi.mock("./civic-genome-rosetta-contract", async import_original => ({
  ...await import_original<typeof import("./civic-genome-rosetta-contract")>(),
  get_rosetta_current_docket_structure: load_exact_view,
  get_latest_rosetta_law_view_by_source_document: load_latest_view,
}));

vi.mock("./db", () => ({
  getPool: () => ({ query }),
}));

vi.mock("./civic-genome-rosetta-evaluation", () => ({
  load_rosetta_current_docket_result_for_binding: load_current,
}));

import { assert_current_result_publication_target, assemble_rosetta_structural_dna, assert_exact_docket_source_binding_for_assembly, assert_view_identity, resolve_assembly_contract } from "./civic-genome-rosetta-assembly";

const request = {
  genome_bill_id: "00000000-0000-4000-8000-000000000001",
  source_document_id: 5631,
  extraction_run_id: 9821,
  source_document_key: "text:5631:9821",
  source_content_hash: "a".repeat(64),
};

const source_document_key = request.source_document_key;
const source_content_hash = request.source_content_hash;
const output_content_hash = "d".repeat(64);
const engine_version = "rosetta-v3-deterministic-sql-2.5.33";
const rule_set_version = "rules-2.5.33";
const rule_manifest_hash = "b".repeat(64);
const configuration_hash = "c".repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue({
    rows: [{ source_document_key, source_content_hash, document_family: "text" }],
  });
  load_current.mockResolvedValue({
    contract: "rosetta-public-current-docket-result-v1",
    docket_source_key: source_document_key,
    source_content_hash,
    source_registry_id: "00000000-0000-4000-8000-000000000999",
    status: "complete",
    current_result: {
      extraction_run_id: request.extraction_run_id,
      output_content_hash,
      engine_version,
      rule_set_version,
      rule_manifest_hash,
      configuration_hash,
      completed_at: "2026-09-15T06:00:00Z",
      admissibility_state: "admissible",
    },
    coverage: {},
    validation_summary: {},
    public_reason: "Current result is assembly-ready.",
  });
});


describe("engine-agnostic assembly acceptance (pure, even under publication quarantine)", () => {
  function candidate(overrides: Record<string, unknown> = {}): any {
    return {
      source_document_id: request.source_document_id,
      extraction_run_id: request.extraction_run_id,
      handoff_contract_version: "rosetta-civic-genome-handoff-v2",
      engine_version: "future-certified-engine-selected-at-runtime",
      rule_set_version: "future-rules-selected-at-runtime",
      rule_manifest_hash: "b".repeat(64),
      configuration_hash: "c".repeat(64),
      source_identity_hash: "e".repeat(64),
      source_content_hash,
      output_content_hash,
      source_url: "https://legislature.example.gov/bill",
      source_version: "source-version:verified",
      document_type: "bill_amendment",
      run_status: "completed",
      admissibility_state: "admissible",
      structural_representations: [],
      law_view: {
        provenanceState: "complete",
        coverage: { help: 1, workflow: 1, accountability: 1, override: 1, definition: 1 },
        objects: [],
      },
      ...overrides,
    };
  }

  it("accepts a supported handoff independent of the originating engine name", () => {
    const v = candidate({
      law_view: {
        provenanceState: "complete",
        coverage: { help: 1, workflow: 1, accountability: 1, override: 1, definition: 1 },
        objects: [{
          extractionRunId: String(request.extraction_run_id),
          sourceObjectType: "operative_clause",
          sourceBlockId: "source-block-1",
          metadata: { source_span: { char_offset_start: 0, char_offset_end: 10, block_content_hash: "f".repeat(64) } },
        }],
      },
    });
    expect(() => assert_view_identity(request, v)).not.toThrow();
    expect(resolve_assembly_contract(v).structural_evidence).toBe(true);
  });

  it.each([
    "rosetta-v3-deterministic-sql-2.5.11",
    "rosetta-rule-ref-v12",
    "future-certified-engine-selected-at-runtime",
  ])("refuses an evidence-empty completed candidate regardless of engine (%s)", engine => {
    expect(() => assert_view_identity(request, candidate({ engine_version: engine })))
      .toThrow("rosetta_completed_run_has_no_operative_or_structural_evidence");
  });

  it.each(["rosetta-civic-genome-handoff-v1", null, undefined])(
    "refuses unsupported or missing contracts without a legacy v1 fallback (%s)", contract => {
      expect(() => resolve_assembly_contract(candidate({ handoff_contract_version: contract })))
        .toThrow("rosetta_assembly_handoff_contract_unsupported");
    },
  );

  it("fails closed when a supposedly complete structural view has no source-content hash", () => {
    const v = candidate({
      source_content_hash: null,
      structural_representations: [{
        extraction_run_id: String(request.extraction_run_id),
        representation_type: "source_stated_amendment_operation",
        normalized_value: { operative_effect_applied: false },
        source_block_id: "block-a",
        metadata: { source_span: { char_offset_start: 1, char_offset_end: 12, block_content_hash: "f".repeat(64) } },
      }],
    });
    expect(() => assert_view_identity(request, v)).toThrow("rosetta_admissible_run_missing_receipt");
  });

  it("retains structural-only amendment evidence when specifically source-bound", () => {
    const v = candidate({
      structural_representations: [{
        extraction_run_id: String(request.extraction_run_id),
        representation_type: "source_stated_amendment_operation",
        normalized_value: { operative_effect_applied: false },
        source_block_id: "block-a",
        metadata: { source_span: { char_offset_start: 1, char_offset_end: 12, block_content_hash: "f".repeat(64) } },
      }],
    });
    expect(() => assert_view_identity(request, v)).not.toThrow();
  });
});

describe("Civic Genome Rosetta assembly gate", () => {
  function current_response(overrides: Record<string, unknown> = {}) {
    return {
      contract: "rosetta-public-current-docket-result-v1",
      docket_source_key: source_document_key,
      source_content_hash,
      source_registry_id: "00000000-0000-4000-8000-000000000999",
      status: "complete",
      current_result: {
        extraction_run_id: request.extraction_run_id,
        output_content_hash,
        engine_version,
        rule_set_version,
        rule_manifest_hash,
        configuration_hash,
        completed_at: "2026-09-15T06:00:00Z",
        admissibility_state: "admissible",
      },
      coverage: {},
      validation_summary: {},
      public_reason: "Current result is assembly-ready.",
      ...overrides,
    };
  }

  function view(overrides: Record<string, unknown> = {}) {
    return {
      source_document_id: request.source_document_id,
      extraction_run_id: request.extraction_run_id,
      source_content_hash,
      output_content_hash,
      engine_version,
      rule_set_version,
      rule_manifest_hash,
      configuration_hash,
      ...overrides,
    } as any;
  }

  it("accepts only the exact Docket source key and hash for assembly", async () => {
    await expect(assert_exact_docket_source_binding_for_assembly(request, view())).resolves.toEqual({
      source_document_key,
      source_content_hash,
      document_family: "text",
    });
    expect(String(query.mock.calls[0][0])).toContain("source_document_key = $2::text");
    expect(String(query.mock.calls[0][0])).toContain("receipt_json ->> 'source_content_hash' = $3::text");
    expect(load_current).toHaveBeenCalledWith({
      source_document_key,
      source_content_hash,
    });
    expect(load_current.mock.calls[0][0]).not.toHaveProperty("source_document_id");
  });

  it("allows an exact key-and-hash selector without an extraction run id", async () => {
    await expect(assert_exact_docket_source_binding_for_assembly(
      {
        genome_bill_id: request.genome_bill_id,
        source_document_id: request.source_document_id,
        source_document_key,
        source_content_hash: source_content_hash.toUpperCase(),
      },
      view(),
    )).resolves.toEqual({
      source_document_key,
      source_content_hash,
      document_family: "text",
    });
    expect(query.mock.calls[0][1]).toHaveLength(3);
    expect(String(query.mock.calls[0][0])).not.toContain("rosetta_extraction_run_id =");
  });

  it("maps explicit non-assembly statuses without fallback or retry work", async () => {
    load_current.mockResolvedValueOnce(current_response({
      status: "awaiting_analysis",
      current_result: null,
    }));
    await expect(assert_exact_docket_source_binding_for_assembly(request, view())).rejects.toThrow(
      "rosetta_public_current_docket_result_awaiting_analysis",
    );
    expect(load_current).toHaveBeenCalledTimes(1);
  });

  it("rejects a hash mismatch before assembly proceeds", async () => {
    await expect(assert_exact_docket_source_binding_for_assembly(
      request,
      view({ source_content_hash: "b".repeat(64) }),
    )).rejects.toThrow("rosetta_public_current_docket_result_source_content_hash_mismatch");
    expect(load_current).not.toHaveBeenCalled();
  });

  it("rejects a source-document mismatch before assembly proceeds", async () => {
    await expect(assert_exact_docket_source_binding_for_assembly(
      request,
      view({ source_document_id: request.source_document_id + 1 }),
    )).rejects.toThrow("rosetta_source_document_identity_mismatch");
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects a missing local Docket source key binding", async () => {
    query.mockResolvedValueOnce({ rows: [{ source_document_key: null, source_content_hash, document_family: "text" }] });
    await expect(assert_exact_docket_source_binding_for_assembly(request, view())).rejects.toThrow(
      "rosetta_public_current_docket_result_source_document_key_missing",
    );
  });

  it("rejects a non-unique local Docket binding", async () => {
    query.mockResolvedValueOnce({
      rows: [
        { source_document_key, source_content_hash, document_family: "text" },
        { source_document_key, source_content_hash, document_family: "text" },
      ],
    });
    await expect(assert_exact_docket_source_binding_for_assembly(request, view())).rejects.toThrow(
      "rosetta_public_current_docket_result_local_binding_not_unique",
    );
  });

  it("does not allow document-id-only assembly fallback", async () => {
    await expect(assert_exact_docket_source_binding_for_assembly(
      {
        genome_bill_id: request.genome_bill_id,
        source_document_id: request.source_document_id,
      },
      view(),
    )).rejects.toThrow("rosetta_public_current_docket_result_exact_selector_missing");
    expect(query).not.toHaveBeenCalled();
    expect(load_current).not.toHaveBeenCalled();
  });

  it.each(["requires_review", "awaiting_analysis", "unavailable"])(
    "does not read assembly data when current result is %s", async status => {
      load_current.mockResolvedValueOnce(current_response({ status, current_result: null }));
      await expect(assert_exact_docket_source_binding_for_assembly(request, view())).rejects.toThrow(
        `rosetta_public_current_docket_result_${status}`,
      );
      expect(load_exact_view).not.toHaveBeenCalled();
      expect(load_latest_view).not.toHaveBeenCalled();
      expect(query).toHaveBeenCalledOnce();
    },
  );

  it("cannot use an extraction run to infer a missing key and hash", async () => {
    await expect(assert_exact_docket_source_binding_for_assembly({
      genome_bill_id: request.genome_bill_id,
      source_document_id: request.source_document_id,
      extraction_run_id: request.extraction_run_id,
    } as any, view())).rejects.toThrow("rosetta_public_current_docket_result_exact_selector_missing");
    expect(query).not.toHaveBeenCalled();
    expect(load_current).not.toHaveBeenCalled();
    expect(load_exact_view).not.toHaveBeenCalled();
    expect(load_latest_view).not.toHaveBeenCalled();
  });

  it("blocks structural assembly at the entry point before any legacy read or write", async () => {
    await expect(assemble_rosetta_structural_dna({
      ...request, extraction_run_id: undefined,
    })).rejects.toThrow("civic_genome_rosetta_publication_quarantined_pending_independent_selected_runtime_attestation");
    expect(query).not.toHaveBeenCalled();
    expect(load_current).not.toHaveBeenCalled();
    expect(load_exact_view).not.toHaveBeenCalled();
    expect(load_latest_view).not.toHaveBeenCalled();
  });

  it("requires a current result to assemble", async () => {
    load_current.mockResolvedValueOnce(current_response({
      status: "complete",
      current_result: null,
      public_reason: "No current result.",
    }));
    await expect(assert_exact_docket_source_binding_for_assembly(request, view())).rejects.toThrow(
      "rosetta_public_current_docket_result_current_result_missing",
    );
  });

  it("rejects a stale current result extraction or output hash", async () => {
    load_current.mockResolvedValueOnce(current_response({
      current_result: {
        extraction_run_id: request.extraction_run_id + 1,
        output_content_hash,
        engine_version,
        rule_set_version,
        rule_manifest_hash,
        configuration_hash,
        completed_at: "2026-09-15T06:00:00Z",
        admissibility_state: "admissible",
      },
      public_reason: "Stale current result.",
    }));
    await expect(assert_exact_docket_source_binding_for_assembly(request, view())).rejects.toThrow(
      "rosetta_public_current_docket_result_extraction_run_mismatch",
    );
  });
});

it("does not allow a stale target tuple to grant authority", async () => {
  query.mockResolvedValueOnce({ rows: [{ engine_version: "older", rule_set_version, rule_manifest_hash }] });
  await expect(assert_current_result_publication_target({ engine_version, rule_set_version, rule_manifest_hash } as any))
    .rejects.toThrow("civic_genome_rosetta_publication_quarantined_pending_independent_selected_runtime_attestation");
  expect(query).not.toHaveBeenCalled();
});

it("does not treat even an exact stored target match as independent attestation", async () => {
  query.mockResolvedValueOnce({ rows: [{ engine_version, rule_set_version, rule_manifest_hash }] });
  await expect(assert_current_result_publication_target({ engine_version, rule_set_version, rule_manifest_hash } as any))
    .rejects.toThrow("civic_genome_rosetta_publication_quarantined_pending_independent_selected_runtime_attestation");
  expect(query).not.toHaveBeenCalled();
});

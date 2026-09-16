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

import { assemble_rosetta_structural_dna, assert_exact_docket_source_binding_for_assembly } from "./civic-genome-rosetta-assembly";

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
    rows: [{ source_document_key, source_content_hash }],
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
    });
    expect(query.mock.calls[0][1][3]).toBeNull();
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
    query.mockResolvedValueOnce({ rows: [{ source_document_key: null, source_content_hash }] });
    await expect(assert_exact_docket_source_binding_for_assembly(request, view())).rejects.toThrow(
      "rosetta_public_current_docket_result_source_document_key_missing",
    );
  });

  it("rejects a non-unique local Docket binding", async () => {
    query.mockResolvedValueOnce({
      rows: [
        { source_document_key, source_content_hash },
        { source_document_key, source_content_hash },
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
      await expect(assemble_rosetta_structural_dna(request)).rejects.toThrow(
        `rosetta_public_current_docket_result_${status}`,
      );
      expect(load_exact_view).not.toHaveBeenCalled();
      expect(load_latest_view).not.toHaveBeenCalled();
      expect(query).toHaveBeenCalledOnce();
    },
  );

  it("cannot use an extraction run to infer a missing key and hash", async () => {
    await expect(assemble_rosetta_structural_dna({
      genome_bill_id: request.genome_bill_id,
      source_document_id: request.source_document_id,
      extraction_run_id: request.extraction_run_id,
    })).rejects.toThrow("rosetta_public_current_docket_result_exact_selector_missing");
    expect(query).not.toHaveBeenCalled();
    expect(load_current).not.toHaveBeenCalled();
    expect(load_exact_view).not.toHaveBeenCalled();
    expect(load_latest_view).not.toHaveBeenCalled();
  });

  it("selects the authorized exact run before requesting assembly data, without fallback", async () => {
    load_exact_view.mockResolvedValueOnce(null);
    await expect(assemble_rosetta_structural_dna({
      ...request, extraction_run_id: undefined,
    })).rejects.toThrow("rosetta_law_view_not_found");
    expect(load_current).toHaveBeenCalledOnce();
    expect(load_exact_view).toHaveBeenCalledOnce();
    expect(load_exact_view).toHaveBeenCalledWith({
      source_document_key, source_content_hash, extraction_run_id: request.extraction_run_id, output_content_hash,
    });
    expect(load_current.mock.invocationCallOrder[0]).toBeLessThan(load_exact_view.mock.invocationCallOrder[0]);
    expect(load_latest_view).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledOnce();
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

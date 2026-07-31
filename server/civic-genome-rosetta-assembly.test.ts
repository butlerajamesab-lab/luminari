import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  get_view_by_run,
  get_view_by_document,
  query,
  release,
} = vi.hoisted(() => ({
  get_view_by_run: vi.fn(),
  get_view_by_document: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
}));

vi.mock("./civic-genome-rosetta-contract", () => ({
  get_rosetta_law_view_by_extraction_run: get_view_by_run,
  get_latest_rosetta_law_view_by_source_document: get_view_by_document,
}));

vi.mock("./db", () => ({
  getPool: () => ({ connect: async () => ({ query, release }) }),
}));

import {
  assemble_rosetta_structural_dna,
  ROSETTA_GENOME_ENGINE_VERSION,
  ROSETTA_GENOME_RULE_VERSION,
} from "./civic-genome-rosetta-assembly";

const genome_bill_id = "11111111-1111-4111-8111-111111111111";

function law_view() {
  return {
    extraction_run_id: 42,
    source_document_id: 7,
    corpus_id: 3,
    document_name: "HB 100",
    document_type: "bill",
    document_identifier: "WA-HB-100",
    run_version: 1,
    run_status: "completed",
    confidence_threshold: 0.75,
    created_at: "2026-07-23T00:00:00.000Z",
    completed_at: "2026-07-23T00:01:00.000Z",
    law_view: {
      provenanceState: "complete" as "complete" | "partial" | "failed",
      coverage: { help: 1, workflow: 1, accountability: 1, override: 1, definition: 1 },
      objects: [{
        layer: "help" as const,
        key: "eligible_person",
        normalizedValue: { class: "resident" },
        sourceObjectType: "eligibility_rule",
        sourceObjectId: "object-1",
        sourceBlockId: "block-1",
        extractionRunId: "42",
        confidence: 0.95,
        confirmed: true,
      }],
    },
  };
}

function successful_queries(replayed = false) {
  let source_identity_hash = "";
  query.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql === "begin" || sql === "commit" || sql === "rollback") return { rows: [] };
    if (sql.includes("insert into public.civic_genome_rosetta_source_binding")) {
      source_identity_hash = String(params?.[2] ?? "");
      return { rows: [] };
    }
    if (sql.includes("from public.civic_genome_bill") && sql.includes("for update")) {
      return { rows: [{ genome_bill_id }] };
    }
    if (sql.includes("from public.civic_genome_rosetta_source_binding")) {
      return { rows: [{ genome_bill_id, source_identity_hash }] };
    }
    if (sql.includes("from public.civic_genome_assembly_run") && sql.includes("limit 1")) {
      return { rows: replayed ? [{ assembly_run_id: "22222222-2222-4222-8222-222222222222" }] : [] };
    }
    if (sql.includes("returning assembly_run_id")) {
      return { rows: [{ assembly_run_id: "33333333-3333-4333-8333-333333333333" }] };
    }
    return { rows: [] };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  get_view_by_run.mockResolvedValue(law_view());
  get_view_by_document.mockResolvedValue(law_view());
});

describe("Rosetta -> Civic Genome assembly activation", () => {
  it("produces deterministic input and output hashes", async () => {
    successful_queries(false);
    const first = await assemble_rosetta_structural_dna({ genome_bill_id, source_document_id: 7, extraction_run_id: 42 });

    vi.clearAllMocks();
    get_view_by_run.mockResolvedValue(law_view());
    successful_queries(false);
    const second = await assemble_rosetta_structural_dna({ genome_bill_id, source_document_id: 7, extraction_run_id: 42 });

    expect(first.input_hash).toBe(second.input_hash);
    expect(first.output_hash).toBe(second.output_hash);
    expect(first.trait_count).toBe(1);
  });

  it("replays an existing assembly without reinserting traits", async () => {
    successful_queries(true);
    const result = await assemble_rosetta_structural_dna({ genome_bill_id, source_document_id: 7, extraction_run_id: 42 });
    expect(result.replayed).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("insert into public.civic_genome_trait"))).toBe(false);
  });

  it("persists complete object and block provenance plus engine and rule versions", async () => {
    successful_queries(false);
    await assemble_rosetta_structural_dna({ genome_bill_id, source_document_id: 7, extraction_run_id: 42 });
    const trait_insert = query.mock.calls.find(([sql]) => String(sql).includes("insert into public.civic_genome_trait"));
    expect(trait_insert).toBeDefined();
    const params = trait_insert?.[1] as unknown[];
    expect(params).toContain("object-1");
    expect(params).toContain("block-1");
    expect(params).toContain("42");
    expect(params).toContain(ROSETTA_GENOME_ENGINE_VERSION);
    expect(params).toContain(ROSETTA_GENOME_RULE_VERSION);
  });

  it("rejects malformed cross-run object provenance before persistence", async () => {
    const malformed = law_view();
    malformed.law_view.objects[0].extractionRunId = "999";
    get_view_by_run.mockResolvedValue(malformed);
    await expect(assemble_rosetta_structural_dna({ genome_bill_id, source_document_id: 7, extraction_run_id: 42 }))
      .rejects.toThrow("rosetta_object_extraction_run_mismatch");
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects an in-progress Rosetta extraction before persistence", async () => {
    const in_progress = law_view();
    in_progress.run_status = "in_progress";
    in_progress.completed_at = null;
    get_view_by_run.mockResolvedValue(in_progress);

    await expect(assemble_rosetta_structural_dna({
      genome_bill_id,
      source_document_id: 7,
      extraction_run_id: 42,
    })).rejects.toThrow("rosetta_extraction_not_completed");
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects failed provenance and completed empty runs", async () => {
    const failed = law_view();
    failed.law_view.provenanceState = "failed";
    get_view_by_run.mockResolvedValue(failed);
    await expect(assemble_rosetta_structural_dna({
      genome_bill_id,
      source_document_id: 7,
      extraction_run_id: 42,
    })).rejects.toThrow("rosetta_provenance_failed");

    const empty = law_view();
    empty.law_view.objects = [];
    get_view_by_run.mockResolvedValue(empty);
    await expect(assemble_rosetta_structural_dna({
      genome_bill_id,
      source_document_id: 7,
      extraction_run_id: 42,
    })).rejects.toThrow("rosetta_completed_run_has_no_objects");
    expect(query).not.toHaveBeenCalled();
  });

  it("merges Rosetta output without deleting Docket source identity", async () => {
    successful_queries(false);
    await assemble_rosetta_structural_dna({
      genome_bill_id,
      source_document_id: 7,
      extraction_run_id: 42,
    });
    const bill_update = query.mock.calls.find(([sql]) =>
      String(sql).includes("update public.civic_genome_bill")
      && String(sql).includes("'rosetta_assembly'"));
    expect(bill_update).toBeDefined();
    expect(String(bill_update?.[0])).toContain("coalesce(structural_dna_json, '{}'::jsonb)");
  });

  it("preserves partial five-layer coverage without inventing missing traits", async () => {
    const partial = law_view();
    partial.law_view.provenanceState = "partial";
    partial.law_view.coverage.override = 0;
    get_view_by_run.mockResolvedValue(partial);
    successful_queries(false);
    const result = await assemble_rosetta_structural_dna({ genome_bill_id, source_document_id: 7, extraction_run_id: 42 });
    expect(result.verification_state).toBe("partial");
    expect(result.trait_count).toBe(1);
  });
});

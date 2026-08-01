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
const rosetta_engine_version = "rosetta-v3-deterministic-sql-1.0.0";
const rosetta_rule_set_version = "rosetta-five-layer-exact-patterns-1.0.0";
const source_identity_hash = "1".repeat(64);
const source_content_hash = "2".repeat(64);
const source_byte_hash = "3".repeat(64);
const output_content_hash = "4".repeat(64);
const rule_manifest_hash = "5".repeat(64);
const configuration_hash = "6".repeat(64);

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
    confidence_threshold: 1,
    created_at: "2026-07-23T00:00:00.000Z",
    completed_at: "2026-07-23T00:01:00.000Z",
    engine_version: rosetta_engine_version,
    rule_set_version: rosetta_rule_set_version,
    rule_manifest_hash,
    configuration_hash,
    source_identity_hash,
    source_content_hash,
    output_content_hash,
    admissibility_state: "admissible",
    source_url: "https://example.gov/wa/hb100.pdf",
    source_version: "official:1",
    media_type: "application/pdf",
    source_byte_hash,
    source_provider_hash: "provider-receipt",
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
        confidence: 1,
        confirmed: true,
        metadata: {
          source_span: {
            char_offset_start: 100,
            char_offset_end: 240,
            block_content_hash: "7".repeat(64),
            section_number: "Sec. 1",
          },
        },
      }],
    },
  };
}

function successful_queries(replayed = false) {
  let binding: Record<string, unknown> = {};
  query.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql === "begin" || sql === "commit" || sql === "rollback") return { rows: [] };
    if (sql.includes("from public.civic_genome_bill") && sql.includes("for update")) {
      return { rows: [{ genome_bill_id }] };
    }
    if (sql.includes("insert into public.civic_genome_rosetta_source_binding")) {
      binding = {
        genome_bill_id,
        source_identity_hash: params?.[2],
        source_content_hash: params?.[3],
        source_url: params?.[4],
        source_version: params?.[5],
        rosetta_engine_version: params?.[6],
        rosetta_rule_set_version: params?.[7],
        rosetta_rule_manifest_hash: params?.[8],
        rosetta_configuration_hash: params?.[9],
        rosetta_output_content_hash: params?.[10],
      };
      return { rows: [] };
    }
    if (sql.includes("from public.civic_genome_rosetta_source_binding")) {
      return { rows: [binding] };
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

  it("persists exact Rosetta run receipts and source spans on each trait", async () => {
    successful_queries(false);
    await assemble_rosetta_structural_dna({ genome_bill_id, source_document_id: 7, extraction_run_id: 42 });
    const trait_insert = query.mock.calls.find(([sql]) => String(sql).includes("insert into public.civic_genome_trait"));
    expect(trait_insert).toBeDefined();
    const params = trait_insert?.[1] as unknown[];
    const trace = JSON.parse(String(params[12])) as Array<Record<string, unknown>>;
    expect(params[5]).toBe("object-1");
    expect(params[6]).toBe("block-1");
    expect(params[7]).toBe("42");
    expect(params[15]).toBe(rosetta_engine_version);
    expect(params[16]).toBe(rosetta_rule_set_version);
    expect(trace[0]).toMatchObject({
      source_document_id: 7,
      source_object_id: "object-1",
      source_block_id: "block-1",
      extraction_run_id: "42",
      rosetta_rule_manifest_hash: rule_manifest_hash,
      rosetta_source_content_hash: source_content_hash,
      rosetta_output_content_hash: output_content_hash,
      assembly_engine_version: ROSETTA_GENOME_ENGINE_VERSION,
      trait_map_version: ROSETTA_GENOME_RULE_VERSION,
      source_span: {
        char_offset_start: 100,
        char_offset_end: 240,
        block_content_hash: "7".repeat(64),
      },
    });
  });

  it("rejects malformed cross-run object provenance before persistence", async () => {
    const malformed = law_view();
    malformed.law_view.objects[0].extractionRunId = "999";
    get_view_by_run.mockResolvedValue(malformed);
    await expect(assemble_rosetta_structural_dna({ genome_bill_id, source_document_id: 7, extraction_run_id: 42 }))
      .rejects.toThrow("rosetta_object_extraction_run_mismatch");
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects an in-progress or non-admissible extraction before persistence", async () => {
    const in_progress = law_view();
    in_progress.run_status = "in_progress";
    in_progress.completed_at = null;
    get_view_by_run.mockResolvedValue(in_progress);
    await expect(assemble_rosetta_structural_dna({
      genome_bill_id,
      source_document_id: 7,
      extraction_run_id: 42,
    })).rejects.toThrow("rosetta_extraction_not_completed");

    const rejected = law_view();
    rejected.admissibility_state = "rejected";
    get_view_by_run.mockResolvedValue(rejected);
    await expect(assemble_rosetta_structural_dna({
      genome_bill_id,
      source_document_id: 7,
      extraction_run_id: 42,
    })).rejects.toThrow("rosetta_extraction_not_admissible");
    expect(query).not.toHaveBeenCalled();
  });

  it("rejects partial provenance, missing receipts, and missing source spans", async () => {
    const partial = law_view();
    partial.law_view.provenanceState = "partial";
    partial.law_view.coverage.override = 0;
    get_view_by_run.mockResolvedValue(partial);
    await expect(assemble_rosetta_structural_dna({
      genome_bill_id,
      source_document_id: 7,
      extraction_run_id: 42,
    })).rejects.toThrow("rosetta_provenance_not_complete");

    const missing_receipt = law_view();
    missing_receipt.output_content_hash = null;
    get_view_by_run.mockResolvedValue(missing_receipt);
    await expect(assemble_rosetta_structural_dna({
      genome_bill_id,
      source_document_id: 7,
      extraction_run_id: 42,
    })).rejects.toThrow("rosetta_admissible_run_missing_receipt");

    const missing_span = law_view();
    missing_span.law_view.objects[0].metadata = {};
    get_view_by_run.mockResolvedValue(missing_span);
    await expect(assemble_rosetta_structural_dna({
      genome_bill_id,
      source_document_id: 7,
      extraction_run_id: 42,
    })).rejects.toThrow("rosetta_object_source_span_missing");
    expect(query).not.toHaveBeenCalled();
  });

  it("merges Rosetta output without replacing Docket source identity", async () => {
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
    expect(String(bill_update?.[0])).not.toContain("source_bill_id =");
  });
});

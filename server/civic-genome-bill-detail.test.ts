import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("./db", () => ({
  getPool: () => ({ query }),
}));

import { get_civic_genome_bill_detail } from "./civic-genome-bill-detail";

const genome_bill_id = "f17747ae-24c6-40b3-a389-4ca24825ad0c";
const family_id = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

function queue_bill(version: Record<string, unknown>, source_versions: unknown[] = []) {
  query
    .mockResolvedValueOnce({ rows: [{ genome_bill_id, family_id, structural_dna_hash: "legacy-hash", structural_dna_json: { source_bill_id: 1944851, source_provider: "docket", rosetta_source_receipt: { fake: "legacy" }, rosetta_assembly: { fake: "legacy" } } }] })
    .mockResolvedValueOnce({ rows: [version] })
    .mockResolvedValueOnce({ rows: source_versions })
    .mockResolvedValueOnce({ rows: [{ signature_json: {} }] })
    .mockResolvedValueOnce({ rows: [] });
}

describe("Civic Genome contaminated structural read fence", () => {
  it("does not elevate a labeled verified current source into structural proof", async () => {
    queue_bill({
      current_bill_version_id: "version-current",
      current_source_document_key: "legi-snapshot-current",
      current_document_family: "text",
      current_version_type: "enrolled",
      current_source_document_id: 369,
      current_source_content_hash: "a".repeat(64),
      current_extraction_run_id: "legacy-run-current",
      current_processing_state: "verified_with_findings",
      published_bill_version_id: "version-current",
      published_source_document_key: "legi-snapshot-current",
      published_document_family: "text",
      published_version_type: "enrolled",
      published_source_document_id: 369,
      published_source_content_hash: "a".repeat(64),
      published_extraction_run_id: "legacy-run-current",
      published_processing_state: "verified_with_findings",
    }, [{ bill_version_id: "version-current", source_document_key: "legi-snapshot-current" }]);

    const result = await get_civic_genome_bill_detail(genome_bill_id);
    expect(result?.current_version?.source_document_id).toBe(369);
    expect(result?.published_version?.source_document_id).toBe(369);
    expect(result?.source_versions).toHaveLength(1);
    expect(result?.bill.structural_dna_json).toEqual({ source_bill_id: 1944851, source_provider: "docket" });
    expect(result?.bill.structural_dna_hash).toBe("");
    expect(result?.structural_dna.snapshot_state).toBe("unavailable");
    expect(result?.structural_dna.traits).toEqual([]);
    expect(result?.structural_dna.assembly_runs).toEqual([]);
    expect(result?.structural_dna.validation_summary).toEqual({
      supported: 0, contradicted: 0, unresolved: 0, duplicates: 0, missing_section: 0,
    });
    expect(query).toHaveBeenCalledTimes(5);
    const sql = query.mock.calls.map(call => String(call[0])).join("\n");
    expect(sql).not.toContain("from public.civic_genome_trait");
    expect(sql).not.toContain("from public.civic_genome_assembly_run");
  });

  it("does not fall back to a previously published and labeled verified version", async () => {
    queue_bill({
      current_bill_version_id: "version-current",
      current_source_document_key: "text:1944851:3408779",
      current_document_family: "text",
      current_version_type: "chaptered",
      current_source_document_id: null,
      current_source_content_hash: null,
      current_extraction_run_id: null,
      current_processing_state: "registered",
      published_bill_version_id: "version-published",
      published_source_document_key: "text:1944851:274729",
      published_document_family: "text",
      published_version_type: "introduced",
      published_source_document_id: 4725,
      published_source_content_hash: "b".repeat(64),
      published_extraction_run_id: "7023",
      published_processing_state: "verified",
    });
    const result = await get_civic_genome_bill_detail(genome_bill_id);
    expect(result?.current_version?.source_document_id).toBeNull();
    expect(result?.published_version?.source_document_id).toBe(4725);
    expect(result?.structural_dna.snapshot_state).toBe("unavailable");
    expect(result?.structural_dna.traits).toEqual([]);
    expect(result?.structural_dna.assembly_runs).toEqual([]);
    expect(query).toHaveBeenCalledTimes(5);
  });

  it("returns null when the canonical Genome bill does not exist", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(get_civic_genome_bill_detail(genome_bill_id)).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });
});

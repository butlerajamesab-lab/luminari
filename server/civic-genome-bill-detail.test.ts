import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("./db", () => ({
  getPool: () => ({ query }),
}));

import { get_civic_genome_bill_detail } from "./civic-genome-bill-detail";

const genome_bill_id = "f17747ae-24c6-40b3-a389-4ca24825ad0c";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Civic Genome Prism trait projection", () => {
  it("projects Rosetta state and the complete Prism proof receipt separately", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          genome_bill_id,
          family_id: "11111111-1111-4111-8111-111111111111",
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          bill_version_id: "version-current",
          source_document_key: "legi-snapshot-current",
          version_type: "enrolled",
          source_document_id: 369,
          extraction_run_id: "run-current",
          processing_state: "verified_with_findings",
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          trait_id: "0311ab58-e12c-4d41-8034-2a191b88792a",
          genome_bill_id,
          verification_state: "Rosetta confirmed · Prism contradicted",
          rosetta_verification_state: "confirmed",
          prism_verification_status: "contradicted",
          prism_verification_receipt_id: "d0d44dc3-9419-4e8d-828f-948dfe6771b7",
          prism_proof_scope: "independent_source_replay",
          prism_supported_findings: [{ check: "source_snapshot_hash_recomputed" }],
          prism_contradictions: [{ check: "declared_section_matches_source" }],
          prism_missing_evidence: [],
          prism_unresolved_conditions: [{ condition: "independent_authoritative_source_not_supplied" }],
          prism_cited_evidence_identifiers: ["rosetta-object:td-v1-source-001"],
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ signature_json: {} }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await get_civic_genome_bill_detail(genome_bill_id);
    const trait = result?.structural_dna.traits[0];
    const current_version_query = query.mock.calls[1]?.[0] as string;
    const trait_query = query.mock.calls[2]?.[0] as string;

    expect(trait?.rosetta_verification_state).toBe("confirmed");
    expect(trait?.prism_verification_status).toBe("contradicted");
    expect(trait?.prism_proof_scope).toBe("independent_source_replay");
    expect(trait?.prism_supported_findings).toHaveLength(1);
    expect(trait?.prism_contradictions).toEqual([
      { check: "declared_section_matches_source" },
    ]);
    expect(trait?.verification_state).toContain("Rosetta confirmed");
    expect(trait?.verification_state).toContain("Prism contradicted");
    expect(trait_query).toContain("civic_genome_prism_verification_binding");
    expect(trait_query).toContain("lighthouse_prism_verification_receipts");
    expect(trait_query).toContain("independent_source_replay");
    expect(trait_query).toContain("trait.source_document_id = $2::bigint");
    expect(trait_query).toContain("$2::bigint is not null");
    expect(query.mock.calls[2]?.[1]).toEqual([genome_bill_id, 369]);
    expect(query.mock.calls[3]?.[0]).toContain("source_document_id = $2::bigint");
    expect(query.mock.calls[3]?.[1]).toEqual([genome_bill_id, 369]);
    expect(current_version_query).toContain("order by stage_rank desc");
    expect(result?.current_version?.source_document_id).toBe(369);
    expect(result?.structural_dna.validation_summary).toMatchObject({
      contradicted: 1,
      supported: 0,
      unresolved: 0,
      duplicates: 0,
    });
  });

  it("returns null when the Genome bill does not exist", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(get_civic_genome_bill_detail(genome_bill_id)).resolves.toBeNull();
  });
});

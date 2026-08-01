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
  it("projects Rosetta and Prism states as separate fields", async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          genome_bill_id,
          family_id: "11111111-1111-4111-8111-111111111111",
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          trait_id: "0311ab58-e12c-4d41-8034-2a191b88792a",
          genome_bill_id,
          verification_state: "Rosetta confirmed · Prism supported_by_one_source",
          rosetta_verification_state: "confirmed",
          prism_verification_status: "supported_by_one_source",
          prism_verification_receipt_id: "d0d44dc3-9419-4e8d-828f-948dfe6771b7",
        }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ signature_json: {} }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await get_civic_genome_bill_detail(genome_bill_id);
    const trait = result?.structural_dna.traits[0];
    const trait_query = query.mock.calls[1]?.[0] as string;

    expect(trait?.rosetta_verification_state).toBe("confirmed");
    expect(trait?.prism_verification_status).toBe("supported_by_one_source");
    expect(trait?.verification_state).toContain("Rosetta confirmed");
    expect(trait?.verification_state).toContain("Prism supported_by_one_source");
    expect(trait_query).toContain("civic_genome_prism_verification_binding");
    expect(trait_query).toContain("does not").toBe(false);
  });

  it("returns null when the Genome bill does not exist", async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(get_civic_genome_bill_detail(genome_bill_id)).resolves.toBeNull();
  });
});

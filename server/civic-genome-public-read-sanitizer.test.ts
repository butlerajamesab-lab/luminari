import { describe, expect, it } from "vitest";
import { sanitize_genome_bill_public_read } from "./civic-genome-public-read-sanitizer";
import type { GenomeBill } from "./civic-genome-db";

describe("public Genome bill source identity boundary", () => {
  it("preserves Docket identity without publishing unqualified Rosetta derivations", () => {
    const bill = {
      genome_bill_id: "source-bill",
      family_id: "source-family",
      source_bill_number: "HB 12",
      state_code: "WA",
      source_bill_url: "https://leg.wa.gov/",
      bill_status: "introduced",
      rosetta_extraction_run_id: "legacy-run",
      structural_dna_hash: "legacy-interpretation-hash",
      structural_dna_json: {
        source_bill_id: 77,
        source_provider: "LegiScan",
        source_change_hash: "docket-only-hash",
        source_last_action: "Introduced",
        rosetta_source_receipt: { engine_version: "rosetta-v3-deterministic-sql-2.5.11" },
        rosetta_assembly: { trait_count: 17, verification_state: "confirmed" },
      },
    } as unknown as GenomeBill;

    const result = sanitize_genome_bill_public_read(bill);
    expect(result).not.toBe(bill);
    expect(result.structural_dna_hash).toBe("");
    expect(result.rosetta_extraction_run_id).toBeNull();
    expect(result.structural_dna_json).toEqual({
      source_bill_id: 77,
      source_provider: "LegiScan",
      source_change_hash: "docket-only-hash",
      source_last_action: "Introduced",
    });
    expect(result.family_id).toBe(bill.family_id);
    expect(result.source_bill_number).toBe("HB 12");
    expect(result.source_bill_url).toBe(bill.source_bill_url);
    expect(bill.structural_dna_json).toHaveProperty("rosetta_assembly");
    expect(bill.structural_dna_json).toHaveProperty("rosetta_source_receipt");
  });
});

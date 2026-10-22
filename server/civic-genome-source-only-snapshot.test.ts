import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CIVIC_GENOME_SOURCE_ONLY_BILL_RECORD_SQL } from "./civic-genome-source-only-snapshot";

describe("Civic Genome new historical snapshot admission", () => {
  it("preserves Docket identity while suppressing retired Rosetta carriers", () => {
    expect(CIVIC_GENOME_SOURCE_ONLY_BILL_RECORD_SQL).toContain("to_jsonb(bill)");
    expect(CIVIC_GENOME_SOURCE_ONLY_BILL_RECORD_SQL).toContain("bill.structural_dna_json");
    expect(CIVIC_GENOME_SOURCE_ONLY_BILL_RECORD_SQL).toContain("- 'rosetta_assembly'");
    expect(CIVIC_GENOME_SOURCE_ONLY_BILL_RECORD_SQL).toContain("- 'rosetta_source_receipt'");
    expect(CIVIC_GENOME_SOURCE_ONLY_BILL_RECORD_SQL).toContain("'rosetta_extraction_run_id', NULL");
    expect(CIVIC_GENOME_SOURCE_ONLY_BILL_RECORD_SQL).toContain("else bill.structural_dna_hash");
  });

  it("applies the shared expression to Docket and family-resolution version captures", () => {
    for (const path of [
      "server/civic-genome-projection.ts",
      "server/civic-genome-family-resolution.ts",
    ]) {
      const content = readFileSync(join(process.cwd(), path), "utf8");
      expect(content).toContain("CIVIC_GENOME_SOURCE_ONLY_BILL_RECORD_SQL");
      expect(content).toContain('(' + "$" + "{CIVIC_GENOME_SOURCE_ONLY_BILL_RECORD_SQL})");
      expect(content).not.toMatch(/greatest\(bill\.created_at, bill\.updated_at\),\s*to_jsonb\(bill\)/);
    }
  });
});

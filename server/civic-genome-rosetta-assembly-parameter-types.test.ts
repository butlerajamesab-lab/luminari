import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Civic Genome Rosetta assembly SQL parameter types", () => {
  it("casts every parameter passed through jsonb_build_object", () => {
    const source = readFileSync("server/civic-genome-rosetta-assembly.ts", "utf8");
    const start = source.indexOf("update public.civic_genome_bill");
    const end = source.indexOf("where genome_bill_id = $1", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const statement = source.slice(start, end);

    for (const fragment of [
      "rosetta_extraction_run_id = $2::text",
      "structural_dna_hash = $3::text",
      "'engine_version', $4::text",
      "'rule_version', $5::text",
      "'source_document_id', $6::bigint",
      "'extraction_run_id', $2::text",
      "'input_hash', $7::text",
      "'output_hash', $3::text",
      "'verification_state', $8::text",
      "'coverage', $9::jsonb",
      "'trait_count', $10::integer",
      "'rosetta_source_receipt', $11::jsonb",
      "'rosetta_engine_version', $12::text",
      "'rosetta_rule_set_version', $13::text",
      "'rosetta_rule_manifest_hash', $14::text",
      "'rosetta_configuration_hash', $15::text",
      "'rosetta_source_content_hash', $16::text",
      "'rosetta_output_content_hash', $17::text",
    ]) {
      expect(statement).toContain(fragment);
    }
  });
});

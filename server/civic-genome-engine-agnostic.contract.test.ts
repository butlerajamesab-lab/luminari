import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const assembly = readFileSync(new URL("./civic-genome-rosetta-assembly.ts", import.meta.url), "utf8");
const pipeline = readFileSync(new URL("./civic-genome-legislative-version-pipeline.ts", import.meta.url), "utf8");
const quarantine = readFileSync(new URL("./civic-genome-rosetta-publication-quarantine.ts", import.meta.url), "utf8");

describe("Genome independent engine contract and publication protection", () => {
  it("contains no retired 2.5.11 engine-specific acceptance or v1 fallback", () => {
    expect(assembly).not.toMatch(/ROSETTA_V2511|is_v2511_marked_full_text_reprint_handoff|rosetta-v3-deterministic-sql-2\.5\.11/);
    expect(assembly).not.toContain("rosetta-genome-assembly-v1");
    expect(assembly).not.toContain("rosetta-five-layer-trait-map-v1");
    expect(assembly).toContain('throw new Error("rosetta_assembly_handoff_contract_unsupported")');
    expect(assembly).toContain('throw new Error("rosetta_completed_run_has_no_operative_or_structural_evidence")');
  });

  it("continues to require current exact source, target and independent attestation before any write", () => {
    expect(assembly).toContain("assert_genome_rosetta_publication_admitted()");
    expect(assembly).toContain("load_exact_docket_assembly_binding(request)");
    expect(assembly).toContain("assert_current_result_publication_target(current_result)");
    expect(assembly).toContain("assert_current_result_matches_view(current_result, view)");
    expect(quarantine).toContain("return true;");
    expect(quarantine).toContain("throw new Error(GENOME_ROSETTA_PUBLICATION_QUARANTINE_REASON)");
  });

  it("derives the bill-version adapter receipt from the actual persisted assembly", () => {
    const writer = pipeline.slice(pipeline.indexOf("async function record_assembled("),
      pipeline.indexOf("export type verified_docket_authority_refresh"));
    expect(writer).toContain("from public.civic_genome_assembly_run run");
    expect(writer).toContain("'assembly_engine_version', run.engine_version");
    expect(writer).toContain("'assembly_rule_version', run.rule_version");
    expect(writer).toContain("run.genome_bill_id = version.genome_bill_id");
    expect(writer).toContain("run.input_hash = $3::text");
    expect(writer).toContain("run.output_hash = $4::text");
    expect(writer).toContain("result.rows.length !== 1");
    expect(writer).not.toContain("'rosetta-genome-assembly-v1'");
    expect(writer).not.toContain("'rosetta-five-layer-trait-map-v1'");
  });
});

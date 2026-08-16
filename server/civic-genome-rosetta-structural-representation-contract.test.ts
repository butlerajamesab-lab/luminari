import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const contract = readFileSync(resolve(root, "server/civic-genome-rosetta-contract.ts"), "utf8");
const assembly = readFileSync(resolve(root, "server/civic-genome-rosetta-assembly.ts"), "utf8");
const assemblyContract = readFileSync(resolve(root, "server/civic-genome/assembly-contract.ts"), "utf8");
const migration = readFileSync(
  resolve(root, "supabase/migrations/20260816040624_civic_genome_rosetta_structural_representation_evidence.sql"),
  "utf8",
);

describe("Rosetta structural representation handoff", () => {
  it("keeps the five operative layers unchanged", () => {
    expect(assemblyContract).toContain(
      'export type RosettaLayer = "help" | "workflow" | "accountability" | "override" | "definition";',
    );
    expect(assemblyContract).not.toMatch(/RosettaLayer[^\n]*structural/i);
  });

  it("normalizes structural representations outside RosettaLawObject", () => {
    expect(contract).toContain('ROSETTA_HANDOFF_STRUCTURAL_REPRESENTATION_V2 = "rosetta-civic-genome-handoff-v2"');
    expect(contract).toContain("structural_representations: civic_genome_rosetta_structural_representation[]");
    expect(contract).toContain('source_object_type !== "rosetta_structural_representation"');
    expect(contract).toContain("const objects = row.objects.map(normalize_object)");
    expect(contract).toContain("(row.structural_representations ?? []).map(normalize_structural_representation)");
  });

  it("never sends structural representations through the semantic trait adapter", () => {
    expect(assembly).toContain(
      "adaptRosettaToGenomeTraits(request.genome_bill_id, view.law_view.objects)",
    );
    expect(assembly).not.toMatch(/adaptRosettaToGenomeTraits\([^)]*structural_representations/);
    expect(assembly).toContain("rosetta_structural_representation_leaked_into_operative_objects");
  });

  it("allows zero operative traits only for explicit non-operative amendment evidence", () => {
    expect(assembly).toContain("rosetta_completed_run_has_no_operative_or_structural_evidence");
    expect(assembly).toContain("rosetta_zero_operative_objects_only_allowed_for_structural_amendment_handoff");
    expect(assembly).toContain('representation.representation_type !== "source_stated_amendment_operation"');
    expect(assembly).toContain("representation.normalized_value.operative_effect_applied !== false");
  });

  it("uses a new assembly contract only for the v2 structural-evidence handoff", () => {
    expect(assembly).toContain('ROSETTA_GENOME_ENGINE_VERSION = "rosetta-genome-assembly-v1"');
    expect(assembly).toContain('ROSETTA_GENOME_STRUCTURAL_ENGINE_VERSION = "rosetta-genome-assembly-v2"');
    expect(assembly).toContain("source_receipt: legacy_source_receipt");
    expect(assembly).toContain("structural_representations: view.structural_representations");
    expect(assembly).toContain("assembly.structural_evidence ? structural_input : legacy_input");
  });

  it("hashes and persists structural evidence separately from traits", () => {
    expect(assembly).toMatch(/traits:\s*persisted_traits,\s*structural_representations:\s*persisted_structural_representations/);
    expect(assembly).toContain("insert into public.civic_genome_rosetta_structural_representation");
    expect(assembly).toContain("structural_representation_count");
    expect(migration).toContain("Exact non-operative structural evidence received from the Rosetta handoff");
    expect(migration).toContain("enable row level security");
    expect(migration).not.toContain("civic_genome_trait (");
  });

  it("advances generation receipts through the existing guarded source-binding trigger path", () => {
    expect(assembly).toContain("on conflict (source_document_id) do update set");
    expect(assembly).not.toContain("on conflict (source_document_id) do nothing");
    expect(assembly).toContain("rosetta_rule_manifest_hash = excluded.rosetta_rule_manifest_hash");
    expect(assembly).toContain("rosetta_output_content_hash = excluded.rosetta_output_content_hash");
  });
});

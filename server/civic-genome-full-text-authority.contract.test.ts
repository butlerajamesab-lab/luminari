import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const assembly = readFileSync(new URL("./civic-genome-rosetta-assembly.ts", import.meta.url), "utf8");
const billDetail = readFileSync(new URL("./civic-genome-bill-detail.ts", import.meta.url), "utf8");
const operating = readFileSync(new URL("./civic-genome-operating-contracts.ts", import.meta.url), "utf8");
const evaluation = readFileSync(new URL("./civic-genome-rosetta-evaluation.ts", import.meta.url), "utf8");
const generationUpgrade = readFileSync(new URL("./civic-genome-rosetta-generation-upgrade-worker.ts", import.meta.url), "utf8");
const docket = readFileSync(new URL("./routes/docket.ts", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../supabase/migrations/20260918190000_civic_genome_full_text_authority_repair.sql", import.meta.url),
  "utf8",
);

describe("Civic Genome full-text authority contract", () => {
  it("prevents amendment assemblies from overwriting bill-level Rosetta truth", () => {
    expect(assembly).toContain('if (binding.document_family === "text")');
    expect(assembly).toContain("update public.civic_genome_bill");
    expect(migration).toContain("civic_genome_bill_rosetta_authority_requires_full_text");
  });

  it("keeps bill-level current and published selectors on full text", () => {
    expect(billDetail).toMatch(/published_version as[\s\S]*document_family = 'text'/);
    expect(operating).toMatch(/current_version as[\s\S]*document_family = 'text'/);
    expect(operating).toMatch(/published_version as[\s\S]*document_family = 'text'/);
    expect(evaluation).toContain("and ($2::uuid is not null or document_family = 'text')");
    expect(generationUpgrade).toContain("where version.document_family = 'text'");
  });

  it("uses full-text states for Radar structural latest while preserving amendment bases", () => {
    expect(docket).toMatch(/latest as[\s\S]*where document_family = 'text'/);
    expect(migration).toMatch(/latest as[\s\S]*where document_family = 'text'/);
    expect(migration).toContain("where base_bill_version_id is not null");
  });

  it("quarantines historical amendment outputs without deleting provenance", () => {
    expect(migration).toContain("'bill_level_authority', 'non_authoritative_amendment'");
    expect(migration).toContain("'rosetta_authority_state', 'unavailable'");
    expect(migration).not.toMatch(/delete\s+from\s+public\.civic_genome_(bill_version|assembly_run|trait)/i);
  });
});

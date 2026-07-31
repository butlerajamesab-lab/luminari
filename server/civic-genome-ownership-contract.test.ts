import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const projection_source = readFileSync(
  new URL("./civic-genome-projection.ts", import.meta.url),
  "utf8",
);
const resolution_source = readFileSync(
  new URL("./civic-genome-family-resolution.ts", import.meta.url),
  "utf8",
);
const reassignment_migration = readFileSync(
  new URL(
    "../supabase/migrations/20260731091821_civic_genome_family_reassignment_cascade.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Civic Genome ownership contracts", () => {
  it("keeps Docket observations separate from Rosetta structural output", () => {
    expect(projection_source).toContain("docket_observation_hash");
    expect(projection_source).toContain("civic_genome_bill.structural_dna_json");
    expect(projection_source).toContain("|| excluded.structural_dna_json");
    expect(projection_source).toContain("civic_genome_bill.rosetta_extraction_run_id is null");
  });

  it("does not let a Docket refresh undo a structurally resolved family", () => {
    expect(projection_source).toContain("else public.civic_genome_bill.family_id");
    expect(projection_source).toContain("returning genome_bill_id, family_id");
    expect(projection_source).toContain("persisted_family_id");
  });

  it("records successful structural assignment and refreshes both families", () => {
    expect(resolution_source).toContain("'structural_match'");
    expect(resolution_source).toContain("update public.civic_genome_event");
    expect(resolution_source).toContain("refresh_family_rollup(client, bill.family_id)");
    expect(resolution_source).toContain("refresh_family_rollup(client, resolution.familyId)");
  });

  it("moves owned events atomically when a bill changes family", () => {
    expect(reassignment_migration).toContain("on update cascade");
    expect(reassignment_migration).toContain("on delete cascade");
  });
});

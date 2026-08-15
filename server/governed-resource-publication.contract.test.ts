import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260815130000_governed_resource_publication_gate_v1.sql"),
  "utf8",
);

describe("governed resource publication gate", () => {
  it("admits only the four explicitly governed entity lanes", () => {
    expect(migration).toContain("state_directory_logical_record");
    expect(migration).toContain("registry_entity_staging_programs");
    expect(migration).toContain("domain_deep_dive_v3_13_stage");
    expect(migration).toContain("substrate_candidate_disposition");
    expect(migration).toContain("staging_provenance_attached");
    expect(migration).toContain("review_ready");
    expect(migration).toContain("source_attached");
    expect(migration).toContain("source_preserved");
  });

  it("does not admit raw candidates or unverified staging rows", () => {
    expect(migration).not.toContain("v_luminari_resource_source_candidates");
    expect(migration).not.toContain("luminari_corpus_candidate_v1");
    expect(migration).not.toContain("staged_review");
    expect(migration).not.toContain("verification_status='unverified'");
  });

  it("normalizes millisecond registry timestamps without mutating sources", () => {
    expect(migration).toContain("rp.created_at>9999999999");
    expect(migration).toContain("rp.created_at::double precision/1000.0");
    expect(migration).not.toMatch(/update\s+public\.registry_programs/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.registry_programs/i);
  });
});

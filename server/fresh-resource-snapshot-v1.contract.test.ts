import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260811214134_fresh_resource_snapshot_v1.sql"), "utf8");

describe("fresh resource snapshot v1", () => {
  it("keeps quality lanes, sealed snapshots, and activation separate", () => {
    expect(migration).toContain("refresh_luminari_state_enrichment_quality_v1");
    expect(migration).toContain("create_luminari_resource_snapshot_v1");
    expect(migration).toContain("activate_luminari_resource_snapshot_v1");
    expect(migration).toContain("status='sealed'");
    expect(migration).toContain("publication_mutated");
  });

  it("dedupes across selected quality lanes while preserving strong-identifier conflicts", () => {
    expect(migration).toContain("jsonb_to_recordset(p_quality_lanes)");
    expect(migration).toContain("distinct_domains");
    expect(migration).toContain("distinct_phones");
    expect(migration).toContain("unresolved_conflict");
    expect(migration).toContain("source_artifacts");
    expect(migration).toContain("candidate_keys");
  });

  it("does not mutate historical source or legacy resource tables", () => {
    expect(migration).not.toMatch(/delete\s+from\s+public\.luminari_resource_entities/i);
    expect(migration).not.toMatch(/truncate/i);
    expect(migration).not.toMatch(/delete\s+from\s+storage\./i);
  });
});

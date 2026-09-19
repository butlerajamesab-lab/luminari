import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../supabase/migrations/20260919070000_source_first_civic_current_merge_v1.sql", import.meta.url), "utf8");

describe("source-first civic current merge", () => {
  it("does not let one newer partial run erase earlier valid source candidates", () => {
    expect(migration).toContain("not coalesce(result_json ? 'superseded_by_run_id', false)");
    const freshStart = migration.indexOf("fresh as (");
    const enrichmentStart = migration.indexOf("enrichment as (");
    const reviewedStart = migration.indexOf("reviewed_overlays as (");
    expect(freshStart).toBeGreaterThanOrEqual(0);
    expect(enrichmentStart).toBeGreaterThan(freshStart);
    expect(reviewedStart).toBeGreaterThan(enrichmentStart);
    expect(migration.slice(freshStart, enrichmentStart)).not.toContain("limit 1");
    expect(migration.slice(enrichmentStart, reviewedStart)).not.toContain("limit 1");
    expect(migration).toContain("partition by r.source_candidate_hash");
    expect(migration).toContain("order by cr.run_priority desc, cr.completed_at desc nulls last");
    expect(migration).toContain("where exact_source_rank = 1");
  });

  it("keeps reviewed overlays higher priority than ordinary corpus generations", () => {
    expect(migration).toContain("10::int as run_priority");
    expect(migration).toContain("20::int as run_priority");
    expect(migration).toContain("30::int as run_priority");
  });
});

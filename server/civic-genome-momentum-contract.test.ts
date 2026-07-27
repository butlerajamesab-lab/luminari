import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../supabase/migrations/202607270001_civic_genome_momentum_producer_v1.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("Civic Genome momentum producer v1", () => {
  it("uses the nearest snapshot at least seven calendar days old", () => {
    expect(migration).toContain("snapshot.snapshot_date <= p_as_of_date - 7");
    expect(migration).toContain("order by snapshot.snapshot_date desc");
    expect(migration).toContain("limit 1");
  });

  it("bounds acceleration and preserves negative movement for collapse analysis", () => {
    expect(migration).toContain("greatest(p_active_state_count - prior.prior_active_state_count, 0)");
    expect(migration).toContain("least(");
    expect(migration).toContain("1::numeric");
    expect(migration).toContain("/ 10::numeric");
  });

  it("enforces both the family projection and dated snapshot", () => {
    expect(migration).toContain("create trigger civic_genome_family_momentum_v1");
    expect(migration).toContain("create trigger family_momentum_snapshot_v1");
    expect(migration).toContain("new.new_state_count :=");
    expect(migration).toContain("new.acceleration_score :=");
  });

  it("contains no destructive source-data operation", () => {
    expect(migration).not.toMatch(/\bdelete\s+from\b/i);
    expect(migration).not.toMatch(/\btruncate\b/i);
    expect(migration).not.toMatch(/\bdrop\s+table\b/i);
    expect(migration).not.toMatch(/\balter\s+table\b/i);
  });

  it("keeps the producer internal to the governed service path", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public, pg_temp");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });
});

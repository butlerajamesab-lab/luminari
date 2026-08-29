import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260805215620_prism_rosetta_v21_version_state.sql",
  ),
  "utf8",
);

describe("preserved Prism Rosetta 2.1 legislative-version generation", () => {
  it("preserves the governed 2.1 queue generation in source history", () => {
    expect(migration).toContain("'prism-rosetta-structural-binding'");
    expect(migration).toContain("'2.1.0'");
    expect(migration).toContain(
      "on conflict (assembly_run_id, prism_rule_set_id, prism_rule_set_version)",
    );
  });

  it("distinguishes full receipt coverage containing findings", () => {
    expect(migration).toContain("'verified_with_findings'");
    expect(migration).toContain("p_status_counts ->> 'contradicted'");
    expect(migration).toContain("p_status_counts ->> 'incomplete'");
    expect(migration).toContain("p_status_counts ->> 'disputed'");
    expect(migration).toContain("p_status_counts ->> 'unresolved'");
    expect(migration).toContain("then 'verification_partial'");
    expect(migration).toContain("else 'verified'");
  });

  it("preserves completed and permanent legislative-version queue terminals", () => {
    expect(migration).toContain("queue_state in (''completed'', ''permanent_failure'')");
    expect(migration).toContain("processing_state not in (''verified'', ''verified_with_findings'')");
  });

  it("does not delete or rewrite preserved Prism generations", () => {
    expect(migration).not.toMatch(/delete\s+from\s+public\.civic_genome_prism/i);
    expect(migration).not.toMatch(/truncate\s+public\.civic_genome_prism/i);
    expect(migration).not.toMatch(/update\s+public\.civic_genome_prism_verification_run/i);
  });
});

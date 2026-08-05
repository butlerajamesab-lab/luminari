import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260805233000_prism_rosetta_v21_version_state.sql",
  ),
  "utf8",
);
const contract = readFileSync(
  join(process.cwd(), "server", "services", "prism-verification-contract.ts"),
  "utf8",
);
const wrapper = readFileSync(
  join(process.cwd(), "server", "services", "prism-rosetta-contract-v2.ts"),
  "utf8",
);
const queue = readFileSync(
  join(process.cwd(), "server", "services", "prism-rosetta-queue-worker.ts"),
  "utf8",
);

describe("Prism Rosetta 2.1 legislative-version state", () => {
  it("pins the same governed 2.1 contract across Lighthouse boundaries", () => {
    for (const source of [contract, wrapper]) {
      expect(source).toContain('PRISM_ROSETTA_ENGINE_VERSION = "2.1.0"');
      expect(source).toContain('PRISM_ROSETTA_RULE_SET_VERSION = "2.1.0"');
      expect(source).toContain(
        "ea6fd66d1f7475842a74fef09fecc4f728bbaef59ab3f0edae83ec7906f1cf46",
      );
    }
    expect(queue).toContain('from "./prism-rosetta-contract-v2"');
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

  it("queues future completed assemblies under Prism Rosetta 2.1", () => {
    expect(migration).toContain("create or replace function public.enqueue_civic_genome_prism_verification");
    expect(migration).toContain("'prism-rosetta-structural-binding'");
    expect(migration).toContain("'2.1.0'");
    expect(migration).toContain("on conflict (assembly_run_id, prism_rule_set_id, prism_rule_set_version)");
  });

  it("preserves completed and permanent legislative-version queue terminals", () => {
    expect(migration).toContain("queue_state in (''completed'', ''permanent_failure'')");
    expect(migration).toContain("processing_state not in (''verified'', ''verified_with_findings'')");
  });

  it("does not delete preserved Prism 2.0 generations", () => {
    expect(migration).not.toMatch(/delete\s+from\s+public\.civic_genome_prism/i);
    expect(migration).not.toMatch(/truncate\s+public\.civic_genome_prism/i);
    expect(migration).not.toMatch(/update\s+public\.civic_genome_prism_verification_run/i);
  });
});

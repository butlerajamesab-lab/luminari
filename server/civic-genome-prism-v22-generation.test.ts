import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260805241000_prism_rosetta_v22_generation.sql",
  ),
  "utf8",
);
const contract = readFileSync(
  join(process.cwd(), "server", "services", "prism-verification-contract.ts"),
  "utf8",
);
const legacyWrapper = readFileSync(
  join(process.cwd(), "server", "services", "prism-rosetta-contract-v22.ts"),
  "utf8",
);
const queue = readFileSync(
  join(process.cwd(), "server", "services", "prism-rosetta-queue-worker.ts"),
  "utf8",
);

describe("Prism Rosetta 2.2 Civic Genome generation", () => {
  it("preserves the governed 2.2 contract as a replayable legacy generation", () => {
    expect(legacyWrapper).toContain('PRISM_ROSETTA_ENGINE_VERSION = "2.2.0"');
    expect(legacyWrapper).toContain('PRISM_ROSETTA_RULE_SET_VERSION = "2.2.0"');
    expect(legacyWrapper).toContain(
      "16cbe6d89170a5e21efab3cdbac25c7ef01cea7a482f2e9b701967adf6cf1b00",
    );
    expect(contract).toContain('PRISM_ROSETTA_ENGINE_VERSION = "2.3.0"');
    expect(queue).toContain('from "./prism-rosetta-contract-v2"');
  });

  it("queues current and future complete assemblies under 2.2", () => {
    expect(migration).toContain(
      "create or replace function public.enqueue_civic_genome_prism_verification",
    );
    expect(migration).toContain("'prism-rosetta-structural-binding'");
    expect(migration).toContain("'2.2.0'");
    expect(migration).toContain("from public.civic_genome_bill_version version");
    expect(migration).toContain("join public.civic_genome_assembly_run assembly");
    expect(migration).toContain(
      "on conflict (assembly_run_id, prism_rule_set_id, prism_rule_set_version)",
    );
  });

  it("does not delete or rewrite preserved 2.1 runs, bindings, or receipts", () => {
    expect(migration).not.toMatch(/delete\s+from\s+public\.civic_genome_prism/i);
    expect(migration).not.toMatch(/truncate\s+public\.civic_genome_prism/i);
    expect(migration).not.toMatch(/update\s+public\.civic_genome_prism_verification_run/i);
    expect(migration).not.toMatch(/update\s+public\.civic_genome_prism_verification_binding/i);
    expect(migration).not.toMatch(/update\s+public\.lighthouse_prism_verification_receipts/i);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260815110622_prism_rosetta_v23_generation.sql",
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
const context = readFileSync(
  join(process.cwd(), "server", "services", "prism-rosetta-structural-context.ts"),
  "utf8",
);

describe("Prism Rosetta 2.3 Civic Genome generation", () => {
  it("pins one disposition-aware 2.3 contract across active Lighthouse boundaries", () => {
    for (const source of [contract, wrapper]) {
      expect(source).toContain('PRISM_ROSETTA_ENGINE_VERSION = "2.3.0"');
      expect(source).toContain('PRISM_ROSETTA_RULE_SET_VERSION = "2.3.0"');
      expect(source).toContain(
        "5be83f4d0d341685b244cc0d47126293f28072eabf02fc1b4e5b2d0bd41fd157",
      );
    }
  });

  it("binds Prism requests to the exact Docket document disposition", () => {
    expect(contract).toContain("rosetta_document_context_schema");
    expect(contract).toContain("adopted: z.boolean().nullable()");
    expect(context).toContain("load_document_context");
    expect(context).toContain("document.adopted");
    expect(context).toContain("version.assembly_run_id = $2::uuid");
    expect(context).toContain("prism_rosetta_document_context_not_unique");
  });

  it("queues current and future assemblies under 2.3 without rewriting history", () => {
    expect(migration).toContain(
      "create or replace function public.enqueue_civic_genome_prism_verification",
    );
    expect(migration).toContain("'2.3.0'");
    expect(migration).toContain(
      "on conflict (assembly_run_id, prism_rule_set_id, prism_rule_set_version)",
    );
    expect(migration).not.toMatch(/delete\s+from\s+public\.civic_genome_prism/i);
    expect(migration).not.toMatch(/truncate\s+public\.civic_genome_prism/i);
    expect(migration).not.toMatch(/update\s+public\.civic_genome_prism_verification_run/i);
  });
});

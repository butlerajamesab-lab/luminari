import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read_repo_file(relative_path: string): string {
  return readFileSync(fileURLToPath(new URL(relative_path, import.meta.url)), "utf8");
}

describe("Prism bill-version late-binding reconciliation", () => {
  const migration = read_repo_file(
    "../supabase/migrations/20260807125440_prism_version_late_binding_reconciliation.sql",
  );
  const pipeline = read_repo_file("./civic-genome-legislative-version-pipeline.ts");

  it("covers the observed assembly-link race without changing canonical Prism runs", () => {
    const assemblyComplete = pipeline.indexOf("await assemble_rosetta_and_resolve_family");
    const versionBinding = pipeline.indexOf("await record_assembled(bill_version_id, assembly)");
    expect(assemblyComplete).toBeGreaterThanOrEqual(0);
    expect(versionBinding).toBeGreaterThan(assemblyComplete);

    expect(migration).toContain(
      "create trigger civic_genome_bill_version_prism_late_binding",
    );
    expect(migration).toContain("before insert or update of assembly_run_id");
    expect(migration).toContain("on public.civic_genome_bill_version");
    expect(migration).toContain("verification.assembly_run_id = new.assembly_run_id");
    expect(migration).toContain("'prism-rosetta-structural-binding'");
  });

  it("reuses the existing deterministic version-state mapper and receipt fields", () => {
    expect(migration).toContain("public.civic_genome_prism_version_state(");
    expect(migration).toContain("new.prism_verification_run_id := v_verification.verification_run_id");
    expect(migration).toContain("new.processing_state := v_processing_state");
    expect(migration).toContain("'prism_receipt_manifest_hash'");
    expect(migration).toContain("'prism_version_state'");
  });

  it("backfills only the derived bill-version pointer/state and preserves immutable Prism truth", () => {
    expect(migration).toContain("update public.civic_genome_bill_version version");
    expect(migration).toContain("verification.prism_rule_set_version = '2.2.0'");
    expect(migration).toContain("verification.receipt_count = verification.expected_trait_count");
    expect(migration).not.toMatch(/update\s+public\.civic_genome_prism_verification_run/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.civic_genome_prism_verification/i);
    expect(migration).not.toMatch(/update\s+public\.lighthouse_prism_verification_(requests|receipts)/i);
  });
});

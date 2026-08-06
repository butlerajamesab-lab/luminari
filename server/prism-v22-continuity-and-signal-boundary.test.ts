import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read_repo_file(relative_path: string): string {
  return readFileSync(fileURLToPath(new URL(relative_path, import.meta.url)), "utf8");
}

describe("Prism 2.2 continuity and canonical signal boundary", () => {
  const migration = read_repo_file(
    "../supabase/migrations/20260806160000_prism_v22_late_binding_continuity.sql",
  );
  const retired_direct_batch = read_repo_file("./process-signals-batch.ts");
  const retired_startup_backfill = read_repo_file("./sunam-backfill.ts");

  it("queues a completed assembly when its legislative version is linked late", () => {
    expect(migration).toContain(
      "create trigger civic_genome_bill_version_enqueue_prism_v22",
    );
    expect(migration).toContain("after insert or update of assembly_run_id");
    expect(migration).toContain("on public.civic_genome_bill_version");
    expect(migration).toContain("'prism-rosetta-structural-binding'");
    expect(migration).toContain("'2.2.0'");
    expect(migration).toContain("on conflict (assembly_run_id, prism_rule_set_id, prism_rule_set_version)");
  });

  it("backfills only version-linked completed assemblies without rewriting receipts", () => {
    expect(migration).toContain("from public.civic_genome_bill_version version");
    expect(migration).toContain("join public.civic_genome_assembly_run assembly");
    expect(migration).toContain("assembly.run_status = 'completed'");
    expect(migration).toContain("assembly.verification_state = 'complete'");
    expect(migration).not.toMatch(/delete\s+from/i);
    expect(migration).not.toMatch(/update\s+public\.civic_genome_prism_verification_(run|binding)/i);
    expect(migration).not.toMatch(/update\s+public\.lighthouse_prism_verification_(requests|receipts)/i);
  });

  it("fails closed instead of promoting legacy rows record by record", () => {
    expect(retired_direct_batch).toContain("process_signals_batch_retired");
    expect(retired_startup_backfill).toContain("sunam_backfill_retired");

    for (const retired_source of [retired_direct_batch, retired_startup_backfill]) {
      expect(retired_source).toContain(
        "canonical Atlas detection candidate to live_data_signals receipt path",
      );
      expect(retired_source).not.toContain("INSERT INTO detected_signals");
      expect(retired_source).not.toContain("FROM live_signals");
      expect(retired_source).not.toContain("processSignalThroughGate");
    }
  });
});

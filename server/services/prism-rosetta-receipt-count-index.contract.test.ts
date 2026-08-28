import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260828172845_optimize_prism_rosetta_receipt_count.sql",
    import.meta.url,
  ),
  "utf8",
);

const queue_worker = readFileSync(
  new URL("./prism-rosetta-queue-worker.ts", import.meta.url),
  "utf8",
);

describe("Prism Rosetta receipt-count index contract", () => {
  it("indexes the complete equality predicate used by receipt counting", () => {
    expect(migration).toMatch(
      /create index if not exists civic_genome_prism_binding_receipt_count_idx\s+on public\.civic_genome_prism_verification_binding\s*\(\s*assembly_run_id,\s*prism_rule_set_id,\s*prism_rule_set_version\s*\)/i,
    );

    expect(queue_worker).toMatch(
      /where receipt\.assembly_run_id = \$1::uuid\s+and receipt\.prism_rule_set_id = \$2\s+and receipt\.prism_rule_set_version = \$3/i,
    );
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260820063000_civic_genome_prism_rosetta_stale_context_supersession_v1.sql",
  ),
  "utf8",
);
const verification = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "verification",
    "20260820063000_civic_genome_prism_rosetta_stale_context_supersession_verify.sql",
  ),
  "utf8",
);

describe("Civic Genome Prism Rosetta stale-context supersession", () => {
  it("targets only the active Prism Rosetta document-context failure", () => {
    expect(migration).toContain("prism-rosetta-structural-binding");
    expect(migration).toContain("prism_rule_set_version='2.3.0'");
    expect(migration).toContain("queue.queue_state='permanent_failure'");
    expect(migration).toContain("queue.last_failure_class='unknown'");
    expect(migration).toContain("prism_rosetta_document_context_not_unique");
    expect(migration).toContain("exact_version.assembly_run_id=queue.assembly_run_id");
    expect(migration).toContain(
      "exact_version.rosetta_extraction_run_id=stale_assembly.extraction_run_id",
    );
  });

  it("requires a completed same-source successor Rosetta context before superseding stale queue work", () => {
    expect(migration).toContain("replacement_version.rosetta_source_document_id=stale_assembly.source_document_id");
    expect(migration).toContain("replacement_version.assembly_run_id is distinct from queue.assembly_run_id");
    expect(migration).toContain(
      "replacement_version.rosetta_extraction_run_id is distinct from stale_assembly.extraction_run_id",
    );
    expect(migration).toContain("replacement_assembly.run_status='completed'");
    expect(migration).toContain("replacement_assembly.verification_state='complete'");
    expect(migration).toContain("replacement_trait_count=0");
    expect(migration).toContain("replacement_queue_state='completed'");
  });

  it("preserves source data and immutable Prism history while moving only the queue state", () => {
    expect(migration).toContain("queue_state='superseded'");
    expect(migration).toContain("superseded_by_successor_rosetta_document_context");
    expect(migration).toContain("prism_rosetta_stale_document_context_superseded");
    expect(migration).toContain("prism_rosetta_stale_context_supersession_contract");
    expect(migration).toContain("v_target_count>100");
    expect(migration).not.toMatch(/delete\s+from\s+public\.civic_genome/i);
    expect(migration).not.toMatch(/truncate\s+public\.civic_genome/i);
    expect(migration).not.toMatch(/update\s+public\.civic_genome_assembly_run/i);
    expect(migration).not.toMatch(/update\s+public\.civic_genome_prism_verification_run/i);
    expect(migration).not.toMatch(/update\s+public\.civic_genome_prism_verification_binding/i);
  });

  it("ships a post-migration verification query for the stale-context invariant", () => {
    expect(verification).toContain("unresolved_stale_context_count");
    expect(verification).toContain("superseded_queue_count");
    expect(verification).toContain("supersession_receipt_count");
    expect(verification).toContain("prism_rosetta_document_context_not_unique");
    expect(verification).toContain("prism_rosetta_stale_document_context_superseded");
  });
});

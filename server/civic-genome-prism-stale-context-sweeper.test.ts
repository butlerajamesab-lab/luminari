import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260821051200_civic_genome_prism_rosetta_stale_context_sweeper_v2.sql",
  ),
  "utf8",
);
const verification = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "verification",
    "20260821051200_civic_genome_prism_rosetta_stale_context_sweeper_v2_verify.sql",
  ),
  "utf8",
);

describe("Civic Genome Prism Rosetta stale-context sweeper", () => {
  it("installs a bounded internal sweeper for Prism Rosetta 2.3 document-context failures", () => {
    expect(migration).toContain("supersede_civic_genome_prism_rosetta_stale_context_v2");
    expect(migration).toContain("p_limit < 1 or p_limit > 500");
    expect(migration).toContain("queue.queue_state = 'permanent_failure'");
    expect(migration).toContain("queue.prism_rule_set_id = 'prism-rosetta-structural-binding'");
    expect(migration).toContain("queue.prism_rule_set_version = '2.3.0'");
    expect(migration).toContain("queue.last_failure_class = 'unknown'");
    expect(migration).toContain("queue.last_error_code = 'prism_rosetta_document_context_not_unique'");
    expect(migration).toContain("limit p_limit");
  });

  it("supersedes only after a replacement same-source context is safe", () => {
    expect(migration).toContain("replacement_version.rosetta_source_document_id = stale_assembly.source_document_id");
    expect(migration).toContain("replacement_version.assembly_run_id is distinct from queue.assembly_run_id");
    expect(migration).toContain(
      "replacement_version.rosetta_extraction_run_id is distinct from stale_assembly.extraction_run_id",
    );
    expect(migration).toContain("replacement_assembly.run_status = 'completed'");
    expect(migration).toContain("replacement_assembly.verification_state = 'complete'");
    expect(migration).toContain("replacement_trait_count = 0");
    expect(migration).toContain("replacement_queue_state = 'completed'");
  });

  it("runs automatically when replacement verification completes", () => {
    expect(migration).toContain("trigger_civic_genome_prism_rosetta_stale_context_sweeper_v2");
    expect(migration).toContain("after insert or update of queue_state");
    expect(migration).toContain("when (new.queue_state = 'completed')");
    expect(migration).toContain("perform public.supersede_civic_genome_prism_rosetta_stale_context_v2(100)");
  });

  it("does not mutate immutable Prism request, receipt, run, or binding history", () => {
    expect(migration).toContain("queue_state = 'superseded'");
    expect(migration).toContain("superseded_by_successor_rosetta_document_context");
    expect(migration).toContain("prism_rosetta_stale_document_context_superseded");
    expect(migration).toContain("prism_rosetta_stale_context_sweeper_contract");
    expect(migration).not.toMatch(/delete\s+from\s+public\.civic_genome/i);
    expect(migration).not.toMatch(/truncate\s+public\.civic_genome/i);
    expect(migration).not.toMatch(/update\s+public\.civic_genome_assembly_run/i);
    expect(migration).not.toMatch(/update\s+public\.civic_genome_prism_verification_run/i);
    expect(migration).not.toMatch(/update\s+public\.civic_genome_prism_verification_binding/i);
    expect(migration).not.toMatch(/update\s+public\.civic_genome_prism_verification_request/i);
    expect(migration).not.toMatch(/update\s+public\.civic_genome_prism_verification_receipt/i);
  });

  it("ships a verification query for installed function, trigger, and unresolved safe targets", () => {
    expect(verification).toContain("unresolved_safe_supersession_target_count");
    expect(verification).toContain("trigger_count");
    expect(verification).toContain("function_count");
    expect(verification).toContain("superseded_by_v2_queue_count");
    expect(verification).toContain("prism_rosetta_document_context_not_unique");
    expect(verification).toContain("prism_rosetta_stale_document_context_superseded");
  });
});

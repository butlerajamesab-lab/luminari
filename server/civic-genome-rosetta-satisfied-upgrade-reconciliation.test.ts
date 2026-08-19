import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migration_sources/civic_genome_rosetta_satisfied_upgrade_reconciliation_v1.sql",
  ),
  "utf8",
);

function satisfied_reconciliation_segment(): string {
  const marker = "-- Same-target work may become unnecessary";
  const start = source.indexOf(marker);
  const end = source.indexOf("get diagnostics v_satisfied=row_count;", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("Rosetta generation satisfied-upgrade reconciliation", () => {
  it("preserves the six-field monotonic target fence", () => {
    expect(source).toContain(
      "public.civic_genome_observe_rosetta_generation_target_v1(\n  p_contract text,\n  p_engine_version text,\n  p_rule_set_version text,\n  p_rule_manifest_hash text,\n  p_validation_test_name text,\n  p_promoted_at timestamptz",
    );
    expect(source).toContain("if p_promoted_at < v_current.promoted_at then");
    expect(source).toContain("civic_genome_rosetta_generation_target_same_promotion_conflict");
    expect(source).toContain("queue.queue_state in ('eligible','retry','running')");
    expect(source).toContain("rosetta_generation_target_superseded");
  });

  it("reconciles only non-running same-target work", () => {
    const segment = satisfied_reconciliation_segment();
    expect(segment).toContain("queue.queue_state in ('eligible','retry','dead_letter')");
    expect(segment).not.toContain("'running'");
    expect(segment).toContain("queue.target_engine_version=p_engine_version");
    expect(segment).toContain("queue.target_rule_set_version=p_rule_set_version");
    expect(segment).toContain("queue.target_rule_manifest_hash=p_rule_manifest_hash");
    expect(segment).toContain("queue.target_validation_test_name=p_validation_test_name");
    expect(segment).toContain("queue.target_promoted_at=p_promoted_at");
  });

  it("requires the queue source to still be the current bill version source", () => {
    const segment = satisfied_reconciliation_segment();
    expect(segment).toContain("row_number() over(");
    expect(segment).toContain("partition by version.genome_bill_id");
    expect(segment).toContain("version.stage_rank desc");
    expect(segment).toContain("version.provider_sequence desc");
    expect(segment).toContain("version.created_at desc");
    expect(segment).toContain("version.bill_version_id desc");
    expect(segment).toContain("where rn=1");
    expect(segment).toContain("version.genome_bill_id=queue.genome_bill_id");
    expect(segment).toContain("version.rosetta_source_document_id=queue.source_document_id");
  });

  it("requires an exact current source binding and completed verified assembly", () => {
    const segment = satisfied_reconciliation_segment();
    expect(segment).toContain("binding.source_identity_hash=queue.source_identity_hash");
    expect(segment).toContain("binding.rosetta_engine_version=queue.target_engine_version");
    expect(segment).toContain("binding.rosetta_rule_set_version=queue.target_rule_set_version");
    expect(segment).toContain("binding.rosetta_rule_manifest_hash=queue.target_rule_manifest_hash");
    expect(segment).toContain("version.processing_state='assembled'");
    expect(segment).toContain("version.failure_code is null");
    expect(segment).toContain("version.rosetta_extraction_run_id is not null");
    expect(segment).toContain("version.assembly_run_id is not null");
    expect(segment).toContain("assembly.run_status='completed'");
    expect(segment).toContain("assembly.verification_state='complete'");
    expect(segment).toContain("assembly.rosetta_engine_version=queue.target_engine_version");
    expect(segment).toContain("assembly.rosetta_rule_set_version=queue.target_rule_set_version");
    expect(segment).toContain("assembly.rosetta_rule_manifest_hash=queue.target_rule_manifest_hash");
    expect(segment).toContain("assembly.rosetta_source_identity_hash=queue.source_identity_hash");
  });

  it("uses superseded rather than completed and preserves prior failure fields", () => {
    const segment = satisfied_reconciliation_segment();
    expect(segment).toContain("set queue_state='superseded'");
    expect(segment).not.toContain("queue_state='completed'");
    expect(segment).not.toContain("last_error_code=");
    expect(segment).not.toContain("last_error_detail=");
    expect(segment).not.toContain("completed_at=");
    expect(source).toContain("'satisfied_job_count',v_satisfied");
  });

  it("contains no destructive queue or receipt rewrite", () => {
    expect(source).not.toMatch(/delete\s+from\s+public\.civic_genome/i);
    expect(source).not.toMatch(/truncate\s+/i);
    expect(source).not.toMatch(/update\s+public\.civic_genome_bill_version/i);
    expect(source).not.toMatch(/update\s+public\.civic_genome_rosetta_source_binding/i);
    expect(source).not.toMatch(/update\s+public\.civic_genome_assembly_run/i);
  });
});

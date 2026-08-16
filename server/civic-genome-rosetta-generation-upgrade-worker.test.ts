import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const worker = readFileSync(
  join(root, "server", "civic-genome-rosetta-generation-upgrade-worker.ts"),
  "utf8",
);
const targetSync = readFileSync(
  join(root, "server", "civic-genome-rosetta-generation-target-sync.ts"),
  "utf8",
);
const startup = readFileSync(
  join(root, "server", "services", "prism-rosetta-startup-activation.ts"),
  "utf8",
);
const queueMigration = readFileSync(
  join(root, "supabase", "migrations", "20260815194348_civic_genome_rosetta_generation_upgrade_queue.sql"),
  "utf8",
);
const convergenceMigration = readFileSync(
  join(root, "supabase", "migrations", "20260816002307_civic_genome_rosetta_generation_target_v1.sql"),
  "utf8",
);

describe("Civic Genome Rosetta current-generation convergence", () => {
  it("requests current generation and exact-source replay from Rosetta without owning extraction semantics", () => {
    expect(worker).toContain('rosetta_rpc<current_generation>("rosetta_current_generation_v1")');
    expect(worker).toContain('"rosetta_replay_source_identity_current_v1"');
    expect(worker).toContain("p_source_document_id: job.source_document_id");
    expect(worker).toContain("p_source_identity_hash: job.source_identity_hash");
    expect(worker).not.toContain('rpc/run_rosetta_v3_extraction');
    expect(worker).not.toContain('"run_rosetta_v3_extraction"');
  });

  it("recovers a missing downstream source binding only from an exact preserved Rosetta source receipt", () => {
    expect(worker).toContain("source_content_hash: `eq.${candidate.source_content_hash}`");
    expect(worker).toContain("source_version: `eq.${candidate.source_version}`");
    expect(worker).toContain("source_document_id: `eq.${candidate.source_document_id}`");
    expect(worker).toContain("rows.length !== 1");
    expect(worker).toContain("rosetta_upgrade_source_identity_not_unique");
  });

  it("fails replay acceptance unless Rosetta returns the exact queued generation and a complete admissible handoff", () => {
    expect(worker).toContain('receipt.replay_contract !== "rosetta-exact-source-current-generation-replay-v1"');
    expect(worker).toContain("receipt.engine_version !== job.target_engine_version");
    expect(worker).toContain("receipt.rule_set_version !== job.target_rule_set_version");
    expect(worker).toContain('receipt.run_status !== "completed"');
    expect(worker).toContain('receipt.admissibility_state !== "admissible"');
    expect(worker).toContain('receipt.provenance_state !== "complete"');
    expect(worker).toContain("rosetta_generation_upgrade_replay_receipt_rejected");
  });

  it("assembles only after Rosetta replay and advances the current bill-version receipt in the same worker path", () => {
    const replayIndex = worker.indexOf("const receipt = await replay_job(job)");
    const assemblyIndex = worker.indexOf("const assembly = await assemble_rosetta_and_resolve_family", replayIndex);
    const versionIndex = worker.indexOf("await update_current_version_receipt", assemblyIndex);
    const completeIndex = worker.indexOf("await mark_completed", versionIndex);
    expect(replayIndex).toBeGreaterThanOrEqual(0);
    expect(assemblyIndex).toBeGreaterThan(replayIndex);
    expect(versionIndex).toBeGreaterThan(assemblyIndex);
    expect(completeIndex).toBeGreaterThan(versionIndex);
  });

  it("uses a durable fail-closed retry/dead-letter queue", () => {
    expect(queueMigration).toContain("queue_state in ('eligible','running','retry','completed','dead_letter')");
    expect(worker).toContain("MAX_ATTEMPTS = 5");
    expect(worker).toContain('dead_letter ? "dead_letter" : "retry"');
    expect(worker).toContain("for update skip locked");
  });

  it("derives Lighthouse convergence from the generation receipt actually observed from Rosetta", () => {
    expect(convergenceMigration).toContain("civic_genome_rosetta_generation_target");
    expect(convergenceMigration).not.toContain("repeat('0',64)");
    expect(convergenceMigration).toContain("binding.rosetta_engine_version=target.engine_version");
    expect(convergenceMigration).toContain("binding.rosetta_rule_manifest_hash=target.rule_manifest_hash");
    expect(convergenceMigration).toContain("target.rule_manifest_hash target_rule_manifest_hash");
    expect(targetSync).toContain("fetch_rosetta_current_generation");
    expect(targetSync).toContain("on conflict (target_name) do update");
  });

  it("starts target observation and upgrade processing with the other Rosetta/Prism workers", () => {
    expect(startup).toContain("start_rosetta_generation_target_sync();");
    expect(startup).toContain("start_rosetta_generation_upgrade_worker();");
    expect(startup).toContain("start_rosetta_generation_activation_queue_worker();");
    expect(startup).toContain("start_legislative_version_queue_worker();");
  });
});

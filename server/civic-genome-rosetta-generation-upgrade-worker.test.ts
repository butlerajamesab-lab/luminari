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
const manifestIdentityMigration = readFileSync(
  join(root, "supabase", "migrations", "20260816002920_civic_genome_rosetta_generation_upgrade_manifest_identity_v1.sql"),
  "utf8",
);
const convergenceMigration = readFileSync(
  join(root, "supabase", "migrations", "20260816002307_civic_genome_rosetta_generation_target_v1.sql"),
  "utf8",
);
const targetFence = readFileSync(
  join(root, "supabase", "migrations", "20260816042731_civic_genome_rosetta_generation_target_fence_v2.sql"),
  "utf8",
);
const transactionFence = readFileSync(
  join(root, "supabase", "migrations", "20260816042900_civic_genome_rosetta_generation_transaction_fence_v2.sql"),
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

  it("discovers and claims only latest versions from current Docket sessions", () => {
    expect(worker).toContain("select distinct state, session_id::text as session_key");
    expect(worker).toContain("current_session.state = bill.state_code");
    expect(worker).toContain("current_session.session_key = bill.session_key");
    expect(worker).toContain("row_number() over");
    expect(worker).toContain("where version.rn = 1");
    expect(worker).toContain('scope: "current_docket_sessions_latest_version_only"');
    const claimStart = worker.indexOf("async function claim_next_job");
    expect(claimStart).toBeGreaterThanOrEqual(0);
    const claimSource = worker.slice(claimStart, worker.indexOf("async function claim_job_batch", claimStart));
    expect(claimSource).toContain("join public.civic_genome_bill bill");
    expect(claimSource).toContain("join current_sessions current_session");
  });

  it("keeps the exact-source replay request bounded above the observed Rosetta tail", () => {
    expect(worker).toContain("const ROSETTA_REQUEST_TIMEOUT_MS = 150_000");
    expect(worker).not.toContain("const ROSETTA_REQUEST_TIMEOUT_MS = 120_000");
  });

  it("recovers a missing downstream source binding only from an exact preserved Rosetta source receipt", () => {
    expect(worker).toContain("source_content_hash: `eq.${candidate.source_content_hash}`");
    expect(worker).toContain("source_version: `eq.${candidate.source_version}`");
    expect(worker).toContain("source_document_id: `eq.${candidate.source_document_id}`");
    expect(worker).toContain("rows.length !== 1");
    expect(worker).toContain("rosetta_upgrade_source_identity_not_unique");
  });

  it("binds generation identity to engine rule manifest validation contract and monotonic promotion receipt", () => {
    expect(worker).toContain("binding.rosetta_rule_manifest_hash is distinct from $3");
    expect(worker).toContain("queued.target_rule_manifest_hash = $3");
    expect(worker).toContain("receipt.rule_manifest_hash !== job.target_rule_manifest_hash");
    expect(manifestIdentityMigration).toContain("alter column target_rule_manifest_hash set not null");
    expect(targetFence).toContain("target_validation_test_name");
    expect(targetFence).toContain("target_promoted_at");
    expect(targetFence).toContain("if p_promoted_at < v_current.promoted_at then");
    expect(targetSync).toContain("validation_test_name");
    expect(targetSync).toContain("promoted_at");
    expect(targetSync).toContain("$6::timestamptz");
  });

  it("fails replay acceptance unless Rosetta returns the exact queued generation and a complete admissible handoff", () => {
    expect(worker).toContain('receipt.replay_contract !== "rosetta-exact-source-current-generation-replay-v1"');
    expect(worker).toContain("receipt.engine_version !== job.target_engine_version");
    expect(worker).toContain("receipt.rule_set_version !== job.target_rule_set_version");
    expect(worker).toContain("receipt.rule_manifest_hash !== job.target_rule_manifest_hash");
    expect(worker).toContain('receipt.run_status !== "completed"');
    expect(worker).toContain('receipt.admissibility_state !== "admissible"');
    expect(worker).toContain('receipt.provenance_state !== "complete"');
    expect(worker).toContain("rosetta_generation_upgrade_replay_receipt_rejected");
  });

  it("assembles only after Rosetta replay and leaves activation protected by database target fences", () => {
    const replayIndex = worker.indexOf("const receipt = await replay_job(job)");
    const assemblyIndex = worker.indexOf("const assembly = await assemble_rosetta_and_resolve_family", replayIndex);
    const versionIndex = worker.indexOf("await update_current_version_receipt", assemblyIndex);
    const completeIndex = worker.indexOf("await mark_completed", versionIndex);
    expect(replayIndex).toBeGreaterThanOrEqual(0);
    expect(assemblyIndex).toBeGreaterThan(replayIndex);
    expect(versionIndex).toBeGreaterThan(assemblyIndex);
    expect(completeIndex).toBeGreaterThan(versionIndex);
    expect(transactionFence).toContain("civic_genome_guard_rosetta_assembly_target_v1");
    expect(transactionFence).toContain("civic_genome_guard_rosetta_generation_upgrade_version_v1");
    expect(transactionFence).toContain("for share");
  });

  it("uses bounded parallelism plus a durable fail-closed retry/dead-letter queue", () => {
    expect(queueMigration).toContain("queue_state in ('eligible','running','retry','completed','dead_letter')");
    expect(worker).toContain("MAX_ATTEMPTS = 5");
    expect(worker).toContain("MAX_JOBS_PER_CYCLE = 3");
    expect(worker).toContain("for update of queue skip locked");
    expect(worker).toContain("await Promise.all(jobs.map(job => process_rosetta_generation_upgrade_job(job)))");
    expect(worker).toContain('dead_letter ? "dead_letter" : "retry"');
    expect(transactionFence).toContain("civic_genome_guard_rosetta_upgrade_queue_claim_v1");
  });

  it("derives Lighthouse convergence from the generation receipt actually observed from Rosetta", () => {
    expect(convergenceMigration).toContain("civic_genome_rosetta_generation_target");
    expect(convergenceMigration).not.toContain("repeat('0',64)");
    expect(convergenceMigration).toContain("binding.rosetta_engine_version=target.engine_version");
    expect(convergenceMigration).toContain("binding.rosetta_rule_manifest_hash=target.rule_manifest_hash");
    expect(convergenceMigration).toContain("target.rule_manifest_hash target_rule_manifest_hash");
    expect(targetSync).toContain("fetch_rosetta_current_generation");
    expect(targetSync).toContain("civic_genome_observe_rosetta_generation_target_v1");
    expect(targetSync).not.toContain("on conflict (target_name) do update");
  });

  it("starts target observation and upgrade processing with the other Rosetta/Prism workers", () => {
    expect(startup).toContain("start_rosetta_generation_target_sync();");
    expect(startup).toContain("start_rosetta_generation_upgrade_worker();");
    expect(startup).toContain("start_rosetta_generation_activation_queue_worker();");
    expect(startup).toContain("start_legislative_version_queue_worker();");
  });
});

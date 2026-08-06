import {
  produce_civic_genome_family_snapshot_v1,
  summarize_civic_genome_external_snapshot_v1,
} from "./civic-genome-external-snapshot-producer";
import { run_civic_genome_kaleidoscope_handoff_from_environment } from "./civic-genome-kaleidoscope-handoff-startup";
import { run_civic_genome_prism_snapshot_handoff_from_environment } from "./civic-genome-prism-snapshot-handoff-startup";
import { run_civic_genome_atlas_handoff_from_environment } from "./civic-genome-atlas-handoff-startup";

const FAMILY_ENV = "CIVIC_GENOME_EXTERNAL_SNAPSHOT_PROOF_FAMILY_ID";
const AS_OF_ENV = "CIVIC_GENOME_EXTERNAL_SNAPSHOT_PROOF_AS_OF";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function required_pair(): { family_id: string; as_of: string } | null {
  const family_id = process.env[FAMILY_ENV]?.trim() ?? "";
  const as_of = process.env[AS_OF_ENV]?.trim() ?? "";
  if (!family_id && !as_of) return null;
  if (!family_id || !as_of) {
    throw new Error("civic_genome_external_snapshot_proof_requires_family_and_as_of");
  }
  if (!UUID.test(family_id)) {
    throw new Error("invalid_civic_genome_external_snapshot_proof_family_id");
  }
  const parsed = new Date(as_of);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("invalid_civic_genome_external_snapshot_proof_as_of");
  }
  return { family_id, as_of: parsed.toISOString() };
}

/**
 * Optional bounded production acceptance lane.
 *
 * Each external consumer has its own complete environment contract and runs
 * through this no-op-by-default startup lane. These paths produce immutable
 * read-only snapshots and perform no Civic Genome database write.
 */
export async function run_civic_genome_external_snapshot_proof_from_environment(): Promise<void> {
  const configured = required_pair();
  if (configured) {
    const source_commit_sha = process.env.RENDER_GIT_COMMIT?.trim() || null;
    console.log("[CivicGenomeExternalSnapshotProof] started", configured);

    const first = await produce_civic_genome_family_snapshot_v1({
      ...configured,
      source_commit_sha,
      generated_at: new Date().toISOString(),
    });
    const second = await produce_civic_genome_family_snapshot_v1({
      ...configured,
      source_commit_sha,
      generated_at: new Date().toISOString(),
      prior_snapshot_hash: first.snapshot_hash,
    });

    const identical = {
      snapshot_id: first.snapshot_id === second.snapshot_id,
      snapshot_hash: first.snapshot_hash === second.snapshot_hash,
      export_receipt_id: first.export_receipt.export_receipt_id === second.export_receipt.export_receipt_id,
      export_receipt_hash: first.export_receipt.export_receipt_hash === second.export_receipt.export_receipt_hash,
      deterministic_replay_key:
        first.export_receipt.deterministic_replay_key === second.export_receipt.deterministic_replay_key,
      component_count: first.component_count === second.component_count,
    };

    if (Object.values(identical).some(value => value !== true)) {
      throw new Error("civic_genome_external_snapshot_replay_mismatch");
    }
    if (first.export_receipt.replay_state !== "original"
        || second.export_receipt.replay_state !== "identical_replay") {
      throw new Error("civic_genome_external_snapshot_replay_state_mismatch");
    }

    console.log("[CivicGenomeExternalSnapshotProof] completed", {
      family_id: configured.family_id,
      as_of: configured.as_of,
      source_commit_sha,
      first: summarize_civic_genome_external_snapshot_v1(first),
      second: summarize_civic_genome_external_snapshot_v1(second),
      identical,
      database_write_count: 0,
    });
  }

  await run_civic_genome_kaleidoscope_handoff_from_environment();
  await run_civic_genome_prism_snapshot_handoff_from_environment();
  await run_civic_genome_atlas_handoff_from_environment();
}

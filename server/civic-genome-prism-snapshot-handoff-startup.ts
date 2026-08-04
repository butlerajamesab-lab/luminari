import {
  produce_civic_genome_family_snapshot_v1,
  summarize_civic_genome_external_snapshot_v1,
} from "./civic-genome-external-snapshot-producer";
import {
  deliver_civic_genome_snapshot_to_prism_v1,
} from "./civic-genome-prism-snapshot-handoff";

export async function run_civic_genome_prism_snapshot_handoff_from_environment(): Promise<void> {
  if (process.env.PRISM_CIVIC_GENOME_SNAPSHOT_PROOF_ENABLED?.trim().toLowerCase() !== "true") {
    return;
  }
  const family_id = process.env.PRISM_CIVIC_GENOME_SNAPSHOT_FAMILY_ID?.trim();
  const as_of = process.env.PRISM_CIVIC_GENOME_SNAPSHOT_AS_OF?.trim();
  const source_commit_sha = process.env.RENDER_GIT_COMMIT?.trim() || null;
  if (!family_id) throw new Error("prism_civic_genome_snapshot_family_id_missing");
  if (!as_of || !Number.isFinite(Date.parse(as_of))) {
    throw new Error("prism_civic_genome_snapshot_as_of_missing");
  }
  const generated_at = new Date().toISOString();
  const first = await produce_civic_genome_family_snapshot_v1({
    family_id,
    as_of,
    generated_at,
    source_commit_sha,
  });
  const replay = await produce_civic_genome_family_snapshot_v1({
    family_id,
    as_of,
    generated_at,
    source_commit_sha,
    prior_snapshot_hash: first.snapshot_hash,
  });
  const first_summary = summarize_civic_genome_external_snapshot_v1(first);
  const replay_summary = summarize_civic_genome_external_snapshot_v1(replay);
  const identity_fields = [
    "snapshot_id",
    "snapshot_hash",
    "export_receipt_id",
    "export_receipt_hash",
    "deterministic_replay_key",
    "component_count",
  ] as const;
  for (const field of identity_fields) {
    if (first_summary[field] !== replay_summary[field]) {
      throw new Error(`prism_civic_genome_snapshot_replay_mismatch:${field}`);
    }
  }
  if (replay.export_receipt.replay_state !== "identical_replay") {
    throw new Error("prism_civic_genome_snapshot_replay_state_mismatch");
  }

  const first_receipt = await deliver_civic_genome_snapshot_to_prism_v1({ snapshot: first });
  const replay_receipt = await deliver_civic_genome_snapshot_to_prism_v1({ snapshot: replay });
  if (
    first_receipt.intake_receipt_id !== replay_receipt.intake_receipt_id
    || first_receipt.intake_receipt_hash !== replay_receipt.intake_receipt_hash
  ) {
    throw new Error("prism_civic_genome_intake_receipt_replay_mismatch");
  }

  console.log("[PrismCivicGenomeSnapshot] validated_unbound", {
    family_id,
    snapshot_id: first.snapshot_id,
    snapshot_hash: first.snapshot_hash,
    export_receipt_id: first.export_receipt.export_receipt_id,
    export_receipt_hash: first.export_receipt.export_receipt_hash,
    deterministic_replay_key: first.export_receipt.deterministic_replay_key,
    component_count: first.component_count,
    completeness_state: first.completeness_state,
    unresolved_condition_count: first.unresolved_conditions.length,
    intake_receipt_id: first_receipt.intake_receipt_id,
    intake_receipt_hash: first_receipt.intake_receipt_hash,
    validation_state: first_receipt.validation_state,
    mapping_state: first_receipt.mapping_state,
    persisted: first_receipt.persisted,
    correlation_executed: first_receipt.correlation_executed,
    verification_executed: first_receipt.verification_executed,
    no_mutation: first_receipt.no_mutation,
    identical_replay: true,
  });
}

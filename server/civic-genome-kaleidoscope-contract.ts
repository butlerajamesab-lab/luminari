import snapshot_proof from "../docs/receipts/CIVIC_GENOME_EXTERNAL_SNAPSHOT_HB2487_PROOF_2026-08-03.json";
import type { civic_genome_operating_contract } from "./civic-genome-operating-contracts";

type kaleidoscope_snapshot_proof = typeof snapshot_proof;

export function build_kaleidoscope_civic_genome_contract(
  proof: kaleidoscope_snapshot_proof,
): civic_genome_operating_contract {
  const completed = proof.proof_state === "completed"
    && proof.replay.first_replay_state === "original"
    && proof.replay.second_replay_state === "identical_replay"
    && Object.values(proof.replay.identical).every(value => value === true)
    && proof.write_boundary.database_write_count === 0;

  return {
    service_key: "kaleidoscope",
    display_name: "Kaleidoscope",
    role: "Immutable baseline consumer",
    state: completed ? "available_unbound" : "not_established",
    state_label: completed
      ? "Snapshot producer proven, consumer unbound"
      : "Contract proof incomplete",
    detail: completed
      ? `${proof.snapshot.component_count} bounded Civic Genome components replayed identically; Kaleidoscope has not received or accepted the source payload.`
      : "The Civic Genome external snapshot proof is not complete.",
    observed_count: completed ? 1 : 0,
    bound_count: 0,
    last_observed_at: completed ? proof.render.proof_completed_at : null,
    boundary: "Kaleidoscope may consume only content-addressed immutable Civic Genome snapshots through a declared verification mapping. Projection outputs never mutate Civic Genome observations, traits, relationships, events, or findings.",
  };
}

export function get_kaleidoscope_civic_genome_contract(): civic_genome_operating_contract {
  return build_kaleidoscope_civic_genome_contract(snapshot_proof);
}

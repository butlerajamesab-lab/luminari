import handoff_receipt from "../docs/receipts/CIVIC_GENOME_KALEIDOSCOPE_AUTHENTICATED_HANDOFF_HB2487_2026-08-04.json";
import type { civic_genome_operating_contract } from "./civic-genome-operating-contracts";

type kaleidoscope_authenticated_handoff_receipt = typeof handoff_receipt;

export function build_kaleidoscope_civic_genome_contract(
  receipt: kaleidoscope_authenticated_handoff_receipt,
): civic_genome_operating_contract {
  const completed = receipt.proof_state === "completed"
    && receipt.authentication.canonical_envelope_authenticated === true
    && receipt.delivery_receipt.validation_state === "validated_unbound"
    && receipt.delivery_receipt.authenticated === true
    && receipt.binding.binding_state === "unresolved"
    && receipt.binding.verification_mapping_state === "unmapped_source_native"
    && receipt.write_and_execution_boundary.lighthouse_database_write_count === 0
    && receipt.write_and_execution_boundary.kaleidoscope_persisted === false
    && receipt.write_and_execution_boundary.kaleidoscope_projection_executed === false
    && receipt.write_and_execution_boundary.upstream_mutation === false;

  return {
    service_key: "kaleidoscope",
    display_name: "Kaleidoscope",
    external_url: null,
    role: "Authenticated immutable baseline consumer",
    state: completed ? "available_unbound" : "not_established",
    state_label: completed
      ? "Authenticated snapshot validated, binding unresolved"
      : "Authenticated handoff proof incomplete",
    detail: completed
      ? `${receipt.source_snapshot.component_count} bounded Civic Genome components were authenticated and validated by Kaleidoscope; the source was not persisted, verification mapping remains undeclared, and no projection executed.`
      : "The authenticated Civic Genome to Kaleidoscope handoff proof is incomplete.",
    observed_count: completed ? 1 : 0,
    bound_count: 0,
    last_observed_at: completed ? receipt.kaleidoscope_receiver.validated_at : null,
    boundary: "Kaleidoscope may authenticate and validate content-addressed immutable Civic Genome snapshots, but the binding remains unresolved until a declared verification mapping exists. Validation never mutates Civic Genome state and does not authorize projection execution.",
  };
}

export function get_kaleidoscope_civic_genome_contract(): civic_genome_operating_contract {
  return build_kaleidoscope_civic_genome_contract(handoff_receipt);
}

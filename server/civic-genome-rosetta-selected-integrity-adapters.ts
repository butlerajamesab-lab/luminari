/**
 * Civic Genome's exact selected-generation integrity adapter registry.
 *
 * This registry is NOT an engine allowlist, a legal-semantic certification,
 * or publication authorization. An adapter may be added only after that
 * generation has its own independently reviewed, source-bound producer,
 * receipt verifier, actual-writer proof and fail-closed negative coverage.
 *
 * Never infer a predecessor adapter (V13 -> V12, etc.) from a version number.
 */
export type selected_genome_integrity_adapter = Readonly<{
  ruleset_version: string;
  producer_material_contract: string;
  receipt_contract: string;
  attestation_type: "source_bound_output_integrity_v1";
  independently_verified_source_binding: true;
  semantic_certification: false;
  publication_authority: false;
}>;

const V12_ADAPTER: selected_genome_integrity_adapter = Object.freeze({
  ruleset_version: "rosetta-rule-ref-v12",
  producer_material_contract: "rosetta-v12-certification-material-v1",
  receipt_contract: "rosetta-v12-certification-receipt-v1",
  attestation_type: "source_bound_output_integrity_v1",
  independently_verified_source_binding: true,
  semantic_certification: false,
  publication_authority: false,
});

// A null result is a governed UNAVAILABLE/HELD state, never a signal to
// reuse an older selected generation, an unpinned receipt, or latest output.
const REGISTERED_ADAPTERS: ReadonlyMap<string, selected_genome_integrity_adapter> =
  new Map([[V12_ADAPTER.ruleset_version, V12_ADAPTER]]);

export function resolve_selected_genome_integrity_adapter(
  selected_ruleset_version: unknown,
): selected_genome_integrity_adapter | null {
  if (typeof selected_ruleset_version !== "string"
    || !/^rosetta-rule-ref-v[1-9][0-9]*$/.test(selected_ruleset_version)) {
    return null;
  }
  return REGISTERED_ADAPTERS.get(selected_ruleset_version) ?? null;
}

/**
 * V12-specific verification must reject every other generation even if
 * it presents a syntactically valid V12 receipt with a matching source SHA.
 * Target identity/read-SHA and timestamp checks are enforced separately
 * by the existing V12 verifier; this descriptor cannot bypass those gates.
 */
export function require_v12_selected_genome_adapter(
  selected_ruleset_version: unknown,
): selected_genome_integrity_adapter {
  const adapter = resolve_selected_genome_integrity_adapter(selected_ruleset_version);
  if (adapter?.ruleset_version !== "rosetta-rule-ref-v12"
    || adapter.receipt_contract !== "rosetta-v12-certification-receipt-v1"
    || adapter.attestation_type !== "source_bound_output_integrity_v1"
    || adapter.independently_verified_source_binding !== true
    || adapter.semantic_certification !== false
    || adapter.publication_authority !== false) {
    throw new Error("rosetta_v12_selected_generation_unsupported");
  }
  return adapter;
}

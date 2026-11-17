export interface SelectedOutputIntegrity {
  contract: "rosetta-selected-output-integrity-v1";
  attestation_type: "received_source_bound_output_integrity_v1";
  status: "verified" | "not_ready";
  reason: string | null;
  source_content_id: string;
  source_document_id: number;
  source_content_hash: string;
  ruleset_version: string | null;
  ruleset_sha256: string | null;
  read_contract_sha256: string | null;
  output_sha256: string | null;
  semantic_certification: false;
  publication_authorized: false;
  failure_receipts_exposed: boolean;
  verified_invariants?: {
    source_text_sha256_matches: true;
    unit_source_slices_match: true;
    unit_text_hashes_match: true;
    section_spans_within_source: true;
    unit_and_section_counts_match: true;
    selected_identity_matches: true;
  };
}
export function inspect_selected_output_integrity(
  detail: unknown,
  selector: { source_content_id: string; source_content_hash: string },
): SelectedOutputIntegrity;

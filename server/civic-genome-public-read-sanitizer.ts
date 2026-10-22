import type { GenomeBill } from "./civic-genome-db";

/**
 * Public read boundary for source-preserving Genome bill projections.
 *
 * Until there is independent selected-runtime attestation, a stored structural
 * hash, Rosetta extraction run ID, or embedded Rosetta payload is not
 * publication authority. Only these derived fields are withheld: bill source
 * identity, Docket provider fields, temporal/source metadata, and family
 * relationships are returned unchanged. This function never mutates a DB row.
 */
export function sanitize_genome_bill_public_read(bill: GenomeBill): GenomeBill {
  const source_metadata = { ...(bill.structural_dna_json ?? {}) };
  delete source_metadata.rosetta_assembly;
  delete source_metadata.rosetta_source_receipt;

  return {
    ...bill,
    structural_dna_json: source_metadata,
    structural_dna_hash: "",
    rosetta_extraction_run_id: null,
  };
}

/**
 * Temporary, fail-closed quarantine of Rosetta-derived Genome writes.
 *
 * Luminari's stored generation target still names a retired legacy generation
 * while Rosetta's independently selected runtime is a different lineage.
 * Matching the stored target or accepting a legacy `verified` label does NOT
 * demonstrate selected-runtime/source/output provenance.
 *
 * Keep this gate closed until a separately reviewed admission contract verifies
 * source bytes, source identity, selected runtime + installed ruleset hashes,
 * exact extraction run, output hash, and independent certification, with
 * persisted receipts bound to that proof. Do not use environment overrides or
 * old generation metadata as an escape hatch.
 *
 * Scope: Genome structural publication, activation/upgrade workers, and legacy
 * target synchronization. Canonical Docket ingestion and source history remain
 * operational. A code gate alone does not fence SQL writers/triggers.
 */
export const GENOME_ROSETTA_PUBLICATION_QUARANTINE_REASON =
  "civic_genome_rosetta_publication_quarantined_pending_independent_selected_runtime_attestation";

export function is_genome_rosetta_publication_quarantined(): boolean {
  return true;
}

export function assert_genome_rosetta_publication_admitted(): void {
  throw new Error(GENOME_ROSETTA_PUBLICATION_QUARANTINE_REASON);
}

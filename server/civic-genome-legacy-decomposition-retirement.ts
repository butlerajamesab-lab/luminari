/**
 * Retired Lighthouse-owned automatic Rosetta decomposition conveyor.
 *
 * This is NOT Rosetta engine selection and NOT Docket ingestion. The existing
 * Genome queue still contains old, disqualified engine receipts; it must never
 * run fallback classification, backlog selection, replays, source-provider
 * pulls, trait assembly or automatic version repair. A future engine-neutral
 * explicit admission path must be a separately verified implementation.
 *
 * Do not tie this retirement to the temporary Genome publication quarantine.
 * Lifting publication quarantine must NEVER reactivate this old conveyor.
 */
export const LEGACY_GENOME_DECOMPOSITION_CONVEYOR_RETIRED = true as const;
export const LEGACY_GENOME_DECOMPOSITION_CONVEYOR_REASON =
  "civic_genome_legacy_decomposition_conveyor_retired_no_replay_or_fallback";

export function is_legacy_genome_decomposition_conveyor_retired(): boolean {
  return LEGACY_GENOME_DECOMPOSITION_CONVEYOR_RETIRED;
}

export function assert_legacy_genome_decomposition_conveyor_available(): void {
  throw new Error(LEGACY_GENOME_DECOMPOSITION_CONVEYOR_REASON);
}

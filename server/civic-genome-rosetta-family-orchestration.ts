import {
  assemble_rosetta_structural_dna,
  type rosetta_genome_assembly_request,
  type rosetta_genome_assembly_result,
} from "./civic-genome-rosetta-assembly";
import {
  resolve_civic_genome_family,
  type family_resolution_result,
} from "./civic-genome-family-resolution";

export type rosetta_family_orchestration_result = rosetta_genome_assembly_result & {
  family_resolution: family_resolution_result;
};

/**
 * Persist Rosetta structural DNA first, then deterministically evaluate family
 * membership from the persisted normalized traits.
 *
 * Assembly remains independently replayable. Family resolution never blocks
 * or rolls back a valid Rosetta assembly merely because no family qualifies;
 * that outcome is preserved as an unresolved candidate.
 */
export async function assemble_rosetta_and_resolve_family(
  request: rosetta_genome_assembly_request,
): Promise<rosetta_family_orchestration_result> {
  const assembly = await assemble_rosetta_structural_dna(request);
  const family_resolution = await resolve_civic_genome_family(request.genome_bill_id);

  return {
    ...assembly,
    family_resolution,
  };
}

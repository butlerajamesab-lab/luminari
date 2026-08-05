import { assemble_rosetta_and_resolve_family } from "./civic-genome-rosetta-family-orchestration";

export type rosetta_generation_activation_result = {
  assembly_run_id: string;
  genome_bill_id: string;
  source_document_id: number;
  extraction_run_id: string;
  trait_count: number;
  verification_state: "complete" | "partial";
  family_resolution_status: "assigned" | "unresolved";
  replayed: boolean;
};

function required_integer(name: string, value: string | undefined): number {
  const parsed = Number(value?.trim());
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name.toLowerCase()}_invalid`);
  }
  return parsed;
}

/**
 * Executes one exact, explicitly configured Rosetta generation at process
 * startup. The activation never searches by title, jurisdiction, or fuzzy text.
 * When the environment variables are absent it is a no-op.
 */
export async function run_rosetta_generation_activation_from_environment(): Promise<rosetta_generation_activation_result | null> {
  const genome_bill_id = process.env.ROSETTA_GENOME_ACTIVATION_GENOME_BILL_ID?.trim();
  const source_document_raw = process.env.ROSETTA_GENOME_ACTIVATION_SOURCE_DOCUMENT_ID?.trim();
  const extraction_run_raw = process.env.ROSETTA_GENOME_ACTIVATION_EXTRACTION_RUN_ID?.trim();

  const configured = [genome_bill_id, source_document_raw, extraction_run_raw]
    .filter(value => Boolean(value)).length;
  if (configured === 0) return null;
  if (configured !== 3) throw new Error("rosetta_genome_activation_configuration_incomplete");

  const source_document_id = required_integer(
    "ROSETTA_GENOME_ACTIVATION_SOURCE_DOCUMENT_ID",
    source_document_raw,
  );
  const extraction_run_id = required_integer(
    "ROSETTA_GENOME_ACTIVATION_EXTRACTION_RUN_ID",
    extraction_run_raw,
  );

  const result = await assemble_rosetta_and_resolve_family({
    genome_bill_id: genome_bill_id as string,
    source_document_id,
    extraction_run_id,
  });

  const receipt: rosetta_generation_activation_result = {
    assembly_run_id: result.assembly_run_id,
    genome_bill_id: result.genome_bill_id,
    source_document_id: result.source_document_id,
    extraction_run_id: result.extraction_run_id,
    trait_count: result.trait_count,
    verification_state: result.verification_state,
    family_resolution_status: result.family_resolution.status,
    replayed: result.replayed,
  };

  console.log("[RosettaGenerationActivation] completed", receipt);
  return receipt;
}

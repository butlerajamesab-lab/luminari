import { start_legislative_version_queue_worker } from "../civic-genome-legislative-version-queue-worker";
import { run_rosetta_generation_activation_from_environment } from "../civic-genome-rosetta-generation-activation";
import { start_rosetta_generation_activation_queue_worker } from "../civic-genome-rosetta-generation-queue-worker";
import { activate_prism_for_rosetta_assembly } from "./prism-rosetta-activation";
import { start_prism_rosetta_queue_worker } from "./prism-rosetta-queue-worker";

export async function run_prism_rosetta_activation_from_environment(): Promise<void> {
  start_prism_rosetta_queue_worker();
  start_rosetta_generation_activation_queue_worker();
  start_legislative_version_queue_worker();

  // An explicitly configured Rosetta generation is assembled first. The queue
  // workers are already running, so the resulting completed assembly is claimed
  // through the normal Prism queue rather than a parallel verification path.
  await run_rosetta_generation_activation_from_environment();

  const genome_bill_id = process.env.PRISM_ROSETTA_ACTIVATION_GENOME_BILL_ID?.trim();
  if (!genome_bill_id) return;

  const assembly_run_id = process.env.PRISM_ROSETTA_ACTIVATION_ASSEMBLY_RUN_ID?.trim() || undefined;
  const result = await activate_prism_for_rosetta_assembly({
    genome_bill_id,
    assembly_run_id,
  });

  console.log("[PrismRosettaActivation] completed", {
    verification_run_id: result.verification_run_id,
    genome_bill_id: result.genome_bill_id,
    assembly_run_id: result.assembly_run_id,
    expected_trait_count: result.expected_trait_count,
    receipt_count: result.receipt_count,
    status_counts: result.status_counts,
    input_hash: result.input_hash,
    output_hash: result.output_hash,
    receipt_manifest_hash: result.receipt_manifest_hash,
    replayed: result.replayed,
  });
}

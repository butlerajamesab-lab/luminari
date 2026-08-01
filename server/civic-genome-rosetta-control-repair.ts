import { process_docket_bill_through_rosetta_and_genome } from "./civic-genome-rosetta-extraction";

const CONTROL_REPAIR_ENV = "ROSETTA_CONTROL_REPAIR_SOURCE_BILL_ID";

function parse_source_bill_ids(value: string): number[] {
  const ids = value
    .split(",")
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => Number(item));

  if (ids.some(id => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error("invalid_rosetta_control_repair_source_bill_id");
  }
  return [...new Set(ids)].sort((left, right) => left - right);
}

/**
 * Optional, bounded production acceptance runner.
 *
 * The environment variable is empty during normal operation. When set to one
 * or more exact numeric Docket bill IDs, startup replays the canonical
 * Docket -> Rosetta -> Civic Genome path. Every write is guarded by the same
 * source, extraction, trait, binding, and assembly idempotency receipts used by
 * the administrator mutation.
 */
export async function run_rosetta_control_repair_from_environment(): Promise<void> {
  const configured = process.env[CONTROL_REPAIR_ENV]?.trim();
  if (!configured) return;

  for (const source_bill_id of parse_source_bill_ids(configured)) {
    console.log("[RosettaControlRepair] started", { source_bill_id });
    const result = await process_docket_bill_through_rosetta_and_genome(source_bill_id);
    console.log("[RosettaControlRepair] completed", {
      source_bill_id,
      genome_bill_id: result.genome_bill_id,
      source_document_id: result.extraction.source_document_id,
      extraction_run_id: result.extraction.extraction_run_id,
      source_content_hash: result.extraction.source_content_hash,
      output_content_hash: result.extraction.output_content_hash,
      extraction_replayed: result.extraction.replayed,
      assembly_run_id: result.assembly.assembly_run_id,
      assembly_output_hash: result.assembly.output_hash,
      assembly_replayed: result.assembly.replayed,
      family_resolution: result.assembly.family_resolution,
    });
  }
}

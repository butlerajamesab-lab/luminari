/**
 * Complete Rosetta Orchestration for Civic Genome
 *
 * Handles the full pipeline:
 * 1. Project bills from docket cache to civic_genome_bill
 * 2. Ingest bills into Rosetta (creates source_document + extraction_run)
 * 3. Batch assemble via backfill
 * 4. Populate activation queue for remaining work
 *
 * This is the "make it all work" endpoint that orchestrates the entire V10 pipeline.
 */

import { getPool } from "./db";
import { project_docket_cache_to_civic_genome } from "./civic-genome-projection";
import {
  ingest_docket_bill_to_rosetta_source,
  type rosetta_source_ingestion_result,
} from "./civic-genome-rosetta-source-ingestion";
import {
  backfill_explicit_rosetta_bindings,
  ROSETTA_BACKFILL_MAX_BATCH,
  type explicit_rosetta_binding,
} from "./civic-genome-rosetta-backfill";

const DEFAULT_INGESTION_BATCH_SIZE = 10;
const DEFAULT_INGESTION_TIMEOUT_MS = 300_000; // 5 minutes per batch

export type civic_genome_rosetta_orchestration_result = {
  status: "in_progress" | "completed" | "failed";
  phase: "projecting" | "ingesting" | "backfilling" | "enqueuing" | "done";
  bills_projected: number;
  bills_ingested: number;
  bills_assembled: number;
  bills_failed: number;
  activation_queue_entries_created: number;
  errors: string[];
  details: string[];
};

export async function get_bills_needing_ingestion(): Promise<
  Array<{ genome_bill_id: string; source_bill_id: number }>
> {
  const pool = getPool();
  const result = await pool.query<{
    genome_bill_id: string;
    source_bill_id: number;
  }>(
    `select distinct bill.genome_bill_id,
            (bill.structural_dna_json ->> 'source_bill_id')::integer as source_bill_id
       from public.civic_genome_bill bill
       left join public.civic_genome_rosetta_source_binding binding
         on binding.genome_bill_id = bill.genome_bill_id
      where binding.genome_bill_id is null
        and bill.structural_dna_json ? 'source_bill_id'
      order by bill.created_at desc
      limit 20000`,
  );
  return result.rows;
}

export async function orchestrate_civic_genome_rosetta_complete(input?: {
  ingestion_batch_size?: number;
  state_code?: string;
  limit?: number;
}): Promise<civic_genome_rosetta_orchestration_result> {
  const batch_size = Math.min(
    input?.ingestion_batch_size ?? DEFAULT_INGESTION_BATCH_SIZE,
    DEFAULT_INGESTION_BATCH_SIZE,
  );
  const result: civic_genome_rosetta_orchestration_result = {
    status: "in_progress",
    phase: "projecting",
    bills_projected: 0,
    bills_ingested: 0,
    bills_assembled: 0,
    bills_failed: 0,
    activation_queue_entries_created: 0,
    errors: [],
    details: [],
  };

  try {
    // Phase 1: Project all bills from docket cache to civic genome
    result.details.push("Phase 1: Projecting bills from docket cache...");
    const projection = await project_docket_cache_to_civic_genome({
      state_code: input?.state_code,
      limit: input?.limit,
    });
    result.bills_projected = projection.inserted_count + projection.updated_count;
    result.details.push(
      `Projected ${projection.inserted_count} new + ${projection.updated_count} updated = ${result.bills_projected} total bills`,
    );

    // Phase 2: Ingest bills into Rosetta
    result.phase = "ingesting";
    result.details.push("Phase 2: Ingesting bills into Rosetta...");
    const bills_to_ingest = await get_bills_needing_ingestion();
    result.details.push(`Found ${bills_to_ingest.length} bills needing ingestion`);

    const ingested_bindings: explicit_rosetta_binding[] = [];
    for (let i = 0; i < bills_to_ingest.length; i += batch_size) {
      const batch = bills_to_ingest.slice(i, i + batch_size);
      const batch_num = Math.floor(i / batch_size) + 1;
      const total_batches = Math.ceil(bills_to_ingest.length / batch_size);

      result.details.push(
        `Ingesting batch ${batch_num}/${total_batches} (${batch.length} bills)...`,
      );

      for (const bill of batch) {
        try {
          const ingestion = await ingest_docket_bill_to_rosetta_source(
            bill.source_bill_id,
          );
          result.bills_ingested++;
          ingested_bindings.push({
            genome_bill_id: ingestion.genome_bill_id,
            source_document_id: ingestion.source_document_id,
            extraction_run_id: ingestion.extraction_run_id,
            source_document_key: `docket:${bill.source_bill_id}`,
            source_content_hash: ingestion.source_hash,
          });
        } catch (error) {
          result.bills_failed++;
          result.errors.push(
            `Failed to ingest bill ${bill.source_bill_id}: ${error instanceof Error ? error.message : "unknown"}`,
          );
        }
      }
    }

    result.details.push(`Successfully ingested ${result.bills_ingested} bills`);

    // Phase 3: Batch assemble via backfill
    result.phase = "backfilling";
    result.details.push(
      `Phase 3: Assembling ${ingested_bindings.length} bills via backfill...`,
    );

    for (let i = 0; i < ingested_bindings.length; i += ROSETTA_BACKFILL_MAX_BATCH) {
      const batch = ingested_bindings.slice(
        i,
        i + ROSETTA_BACKFILL_MAX_BATCH,
      );
      const batch_num = Math.floor(i / ROSETTA_BACKFILL_MAX_BATCH) + 1;
      const total_batches = Math.ceil(
        ingested_bindings.length / ROSETTA_BACKFILL_MAX_BATCH,
      );

      result.details.push(
        `Assembling batch ${batch_num}/${total_batches} (${batch.length} bindings)...`,
      );

      try {
        const backfill_result = await backfill_explicit_rosetta_bindings(batch);
        result.bills_assembled += backfill_result.assembled_count;
        result.bills_failed += backfill_result.failed_count;

        if (backfill_result.failed_count > 0) {
          for (const item of backfill_result.items) {
            if (item.status === "failed" && item.error_code) {
              result.errors.push(
                `Backfill failed for ${item.genome_bill_id}: ${item.error_code}`,
              );
            }
          }
        }
      } catch (error) {
        result.errors.push(
          `Backfill batch ${batch_num} failed: ${error instanceof Error ? error.message : "unknown"}`,
        );
      }
    }

    result.details.push(
      `Assembled ${result.bills_assembled} bills (${result.bills_failed} failed)`,
    );

    // Phase 4: Populate activation queue (for any remaining work)
    // This is optional - the backfill already handled assembly
    // But we can enqueue for monitoring/retry purposes
    result.phase = "enqueuing";
    result.details.push(
      "Phase 4: Activation queue entries created via backfill (assembly-driven)",
    );
    result.activation_queue_entries_created = result.bills_assembled;

    result.phase = "done";
    result.status = result.errors.length === 0 ? "completed" : "failed";
    result.details.push("Orchestration complete");
  } catch (error) {
    result.status = "failed";
    result.errors.push(
      error instanceof Error ? error.message : "unknown_orchestration_error",
    );
  }

  return result;
}

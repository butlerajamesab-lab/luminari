import { getPool } from "./db";
import { get_latest_rosetta_law_view_by_source_document } from "./civic-genome-rosetta-contract";
import { assemble_rosetta_and_resolve_family } from "./civic-genome-rosetta-family-orchestration";

export const ROSETTA_BACKFILL_MAX_BATCH = 50;

export type explicit_rosetta_binding = {
  genome_bill_id: string;
  source_document_id: number;
  extraction_run_id?: number;
};

export type explicit_rosetta_backfill_item = {
  genome_bill_id: string;
  source_document_id: number;
  status: "assembled" | "replayed" | "failed";
  extraction_run_id: string | null;
  assembly_run_id: string | null;
  family_resolution_status: "assigned" | "unresolved" | null;
  error_code: string | null;
};

export type explicit_rosetta_backfill_result = {
  requested_count: number;
  assembled_count: number;
  replayed_count: number;
  failed_count: number;
  items: explicit_rosetta_backfill_item[];
};

/**
 * Executes only caller-supplied bill/document bindings. It never searches by
 * title, jurisdiction, or fuzzy text and therefore cannot silently fabricate
 * source identity.
 */
export async function backfill_explicit_rosetta_bindings(
  bindings: explicit_rosetta_binding[],
): Promise<explicit_rosetta_backfill_result> {
  if (bindings.length === 0) throw new Error("rosetta_backfill_bindings_required");
  if (bindings.length > ROSETTA_BACKFILL_MAX_BATCH) throw new Error("rosetta_backfill_batch_limit_exceeded");

  const unique = new Set<string>();
  for (const binding of bindings) {
    const key = `${binding.genome_bill_id}:${binding.source_document_id}`;
    if (unique.has(key)) throw new Error("rosetta_backfill_duplicate_binding");
    unique.add(key);
  }

  const pool = getPool();
  const bill_ids = bindings.map(binding => binding.genome_bill_id);
  const bill_result = await pool.query<{ genome_bill_id: string }>(
    `select genome_bill_id
       from public.civic_genome_bill
      where genome_bill_id = any($1::uuid[])`,
    [bill_ids],
  );
  const existing_bill_ids = new Set(bill_result.rows.map(row => row.genome_bill_id));

  const items: explicit_rosetta_backfill_item[] = [];
  for (const binding of bindings) {
    if (!existing_bill_ids.has(binding.genome_bill_id)) {
      items.push({
        genome_bill_id: binding.genome_bill_id,
        source_document_id: binding.source_document_id,
        status: "failed",
        extraction_run_id: null,
        assembly_run_id: null,
        family_resolution_status: null,
        error_code: "civic_genome_bill_not_found",
      });
      continue;
    }

    try {
      const view = await get_latest_rosetta_law_view_by_source_document(binding.source_document_id);
      if (!view) throw new Error("rosetta_law_view_not_found");
      if (binding.extraction_run_id !== undefined && view.extraction_run_id !== binding.extraction_run_id) {
        throw new Error("rosetta_extraction_run_identity_mismatch");
      }

      const result = await assemble_rosetta_and_resolve_family(binding);
      items.push({
        genome_bill_id: binding.genome_bill_id,
        source_document_id: binding.source_document_id,
        status: result.replayed ? "replayed" : "assembled",
        extraction_run_id: result.extraction_run_id,
        assembly_run_id: result.assembly_run_id,
        family_resolution_status: result.family_resolution.status,
        error_code: null,
      });
    } catch (error) {
      items.push({
        genome_bill_id: binding.genome_bill_id,
        source_document_id: binding.source_document_id,
        status: "failed",
        extraction_run_id: null,
        assembly_run_id: null,
        family_resolution_status: null,
        error_code: error instanceof Error ? error.message.slice(0, 200) : "unknown_rosetta_backfill_error",
      });
    }
  }

  return {
    requested_count: items.length,
    assembled_count: items.filter(item => item.status === "assembled").length,
    replayed_count: items.filter(item => item.status === "replayed").length,
    failed_count: items.filter(item => item.status === "failed").length,
    items,
  };
}

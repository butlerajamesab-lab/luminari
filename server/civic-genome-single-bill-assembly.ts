import { getPool } from "./db";
import { project_docket_cache_to_civic_genome } from "./civic-genome-projection";
import type { GenomeBill } from "./civic-genome-db";

type cached_bill_location = {
  state_code: string;
  source_offset: number;
};

export type single_bill_assembly_result =
  | {
      ok: true;
      status: "existing" | "inserted" | "updated" | "unchanged";
      source_bill_id: number;
      bill_id: string;
      genome_bill_id: string;
      family_id: string;
      bill: GenomeBill;
    }
  | {
      ok: false;
      status: "not_in_docket_cache";
      source_bill_id: number;
    };

const get_existing_bill = async (source_bill_id: number): Promise<GenomeBill | null> => {
  const pool = getPool();
  const { rows } = await pool.query<GenomeBill>(
    `select *
       from public.civic_genome_bill
      where structural_dna_json ->> 'source_bill_id' = $1
      order by updated_at desc, genome_bill_id
      limit 1`,
    [String(source_bill_id)],
  );

  return rows[0] ?? null;
};

/**
 * Locate exactly one LegiScan bill inside the persisted Docket cache.
 *
 * The source offset is calculated using the same state-row ordering and bill
 * array ordering consumed by project_docket_cache_to_civic_genome. This keeps
 * targeted assembly on the existing canonical projector rather than creating
 * a second write path.
 */
export const locate_docket_bill = async (
  source_bill_id: number,
): Promise<cached_bill_location | null> => {
  const pool = getPool();
  const { rows } = await pool.query<cached_bill_location>(
    `with expanded as (
       select
         cache.state as state_code,
         row_number() over (
           order by cache.fetched_at desc, bill.ordinality
         ) - 1 as source_offset,
         bill.value ->> 'bill_id' as source_bill_id
       from public.docket_bill_state_cache cache
       cross join lateral jsonb_array_elements(cache.bills::jsonb)
         with ordinality as bill(value, ordinality)
       where bill.value ? 'bill_id'
         and bill.value ? 'number'
     )
     select state_code, source_offset::int
       from expanded
      where source_bill_id = $1
      order by source_offset
      limit 1`,
    [String(source_bill_id)],
  );

  return rows[0] ?? null;
};

/**
 * Resolve a Docket source bill to its persisted Genome record or assemble that
 * one record through the existing idempotent projection engine.
 *
 * This service never calls LegiScan and never fabricates a record when the
 * selected bill is absent from docket_bill_state_cache.
 */
export async function resolve_or_assemble_docket_bill(
  source_bill_id: number,
): Promise<single_bill_assembly_result> {
  const existing = await get_existing_bill(source_bill_id);

  if (existing) {
    return {
      ok: true,
      status: "existing",
      source_bill_id,
      bill_id: existing.bill_id,
      genome_bill_id: existing.genome_bill_id,
      family_id: existing.family_id,
      bill: existing,
    };
  }

  const location = await locate_docket_bill(source_bill_id);

  if (!location) {
    return {
      ok: false,
      status: "not_in_docket_cache",
      source_bill_id,
    };
  }

  const projection = await project_docket_cache_to_civic_genome({
    offset: location.source_offset,
    batch_size: 1,
  });
  const projected = projection.results.find(
    result => result.source_bill_id === source_bill_id,
  );

  if (!projected) {
    throw new Error("civic_genome_targeted_projection_mismatch");
  }

  const bill = await get_existing_bill(source_bill_id);

  if (!bill) {
    throw new Error("civic_genome_targeted_projection_missing_result");
  }

  return {
    ok: true,
    status: projected.action,
    source_bill_id,
    bill_id: projected.bill_id,
    genome_bill_id: projected.genome_bill_id,
    family_id: projected.family_id,
    bill,
  };
}

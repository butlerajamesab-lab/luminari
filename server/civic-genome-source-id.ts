import { getPool } from "./db";
import type { GenomeBill } from "./civic-genome-db";

/**
 * Resolve the original numeric Docket/LegiScan bill identifier to the single
 * Civic Genome bill projected from that source record.
 *
 * The persisted civic_genome_bill.bill_id is a deterministic UUID derived
 * from the source bill ID. The Docket route carries the original numeric
 * source identifier, which is preserved in structural_dna_json.
 */
export async function get_genome_bill_by_source_id(
  source_bill_id: number,
): Promise<GenomeBill | null> {
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
}

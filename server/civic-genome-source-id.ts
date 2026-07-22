import { getPool } from "./db";
import type { GenomeBill } from "./civic-genome-db";

/**
 * Resolve the Docket Room's canonical source bill identifier to the single
 * Civic Genome bill projected from that source record.
 *
 * The Docket route carries civic_genome_bill.bill_id, not genome_bill_id.
 * Keep this lookup server-side and bounded instead of scanning list results
 * in the browser.
 */
export async function get_genome_bill_by_source_id(
  bill_id: string
): Promise<GenomeBill | null> {
  const pool = getPool();
  const { rows } = await pool.query<GenomeBill>(
    `select *
       from civic_genome_bill
      where bill_id = $1
      order by updated_at desc, genome_bill_id
      limit 1`,
    [bill_id]
  );

  return rows[0] ?? null;
}

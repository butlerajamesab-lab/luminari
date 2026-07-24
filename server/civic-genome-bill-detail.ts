import { getPool } from "./db";
import type { GenomeBill } from "./civic-genome-db";

export type persisted_genome_trait = {
  trait_id: string;
  genome_bill_id: string;
  trait_class: string;
  trait_key: string;
  normalized_value_json: unknown;
  source_object_type: string;
  source_object_id: string;
  source_block_id: string | null;
  source_document_id: number | null;
  extraction_run_id: string | null;
  confidence_score: number;
  signal_status: string;
  verification_state: string;
  trait_fingerprint: string;
  engine_version: string;
  rule_version: string;
  content_hash: string;
  source_trace: unknown[];
  created_at: string;
  updated_at: string;
};

export type persisted_genome_assembly_run = {
  assembly_run_id: string;
  genome_bill_id: string;
  source_document_id: number;
  extraction_run_id: string;
  engine_version: string;
  rule_version: string;
  input_hash: string;
  output_hash: string;
  verification_state: string;
  coverage_json: Record<string, unknown>;
  trait_count: number;
  malformed_object_count: number;
  run_status: string;
  error_code: string | null;
  created_at: string;
  completed_at: string | null;
};

export type civic_genome_bill_detail = {
  bill: GenomeBill;
  structural_dna: {
    traits: persisted_genome_trait[];
    assembly_runs: persisted_genome_assembly_run[];
  };
};

export async function get_civic_genome_bill_detail(
  genome_bill_id: string,
): Promise<civic_genome_bill_detail | null> {
  const pool = getPool();
  const bill_result = await pool.query<GenomeBill>(
    `select * from public.civic_genome_bill where genome_bill_id = $1 limit 1`,
    [genome_bill_id],
  );
  const bill = bill_result.rows[0];
  if (!bill) return null;

  const [traits_result, runs_result] = await Promise.all([
    pool.query<persisted_genome_trait>(
      `select *
         from public.civic_genome_trait
        where genome_bill_id = $1
        order by trait_class, trait_key, trait_fingerprint`,
      [genome_bill_id],
    ),
    pool.query<persisted_genome_assembly_run>(
      `select *
         from public.civic_genome_assembly_run
        where genome_bill_id = $1
        order by created_at desc, assembly_run_id desc
        limit 25`,
      [genome_bill_id],
    ),
  ]);

  return {
    bill,
    structural_dna: {
      traits: traits_result.rows,
      assembly_runs: runs_result.rows,
    },
  };
}

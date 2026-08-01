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
  rosetta_verification_state: string;
  prism_verification_status: string | null;
  prism_verification_receipt_id: string | null;
  prism_engine_version: string | null;
  prism_rule_set_version: string | null;
  prism_rule_set_hash: string | null;
  prism_input_hash: string | null;
  prism_output_hash: string | null;
  prism_deterministic_replay_key: string | null;
  prism_bound_at: string | null;
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

export type persisted_family_resolution = {
  unresolved_candidate_id: string;
  resolution_reason: string;
  best_candidate_family_id: string | null;
  best_candidate_score: number;
  similarity_breakdown_json: Record<string, unknown>;
  competing_family_ids: string[];
  methodology_version: string;
  observed_at: string;
  resolved_at: string | null;
  resolution_family_id: string | null;
};

export type family_assignment_status = {
  status: "provisional" | "unresolved" | "structurally_assigned";
  current_family_id: string;
  current_family_signature: Record<string, unknown>;
  latest_resolution: persisted_family_resolution | null;
};

export type civic_genome_bill_detail = {
  bill: GenomeBill;
  structural_dna: {
    traits: persisted_genome_trait[];
    assembly_runs: persisted_genome_assembly_run[];
  };
  family_assignment: family_assignment_status;
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

  const [traits_result, runs_result, family_result, resolution_result] = await Promise.all([
    pool.query<persisted_genome_trait>(
      `select
         trait.trait_id,
         trait.genome_bill_id,
         trait.trait_class,
         trait.trait_key,
         trait.normalized_value_json,
         trait.source_object_type,
         trait.source_object_id,
         trait.source_block_id,
         trait.source_document_id,
         trait.extraction_run_id,
         trait.confidence_score,
         trait.signal_status,
         case
           when prism.binding_id is null
             then 'Rosetta ' || trait.verification_state || ' · Prism not_observed'
           else 'Rosetta ' || trait.verification_state || ' · Prism ' || prism.verification_status
         end as verification_state,
         trait.verification_state as rosetta_verification_state,
         prism.verification_status as prism_verification_status,
         prism.prism_verification_receipt_id::text as prism_verification_receipt_id,
         prism.prism_engine_version,
         prism.prism_rule_set_version,
         prism.prism_rule_set_hash,
         prism.input_hash as prism_input_hash,
         prism.output_hash as prism_output_hash,
         prism.deterministic_replay_key as prism_deterministic_replay_key,
         prism.created_at::text as prism_bound_at,
         trait.trait_fingerprint,
         trait.engine_version,
         trait.rule_version,
         trait.content_hash,
         trait.source_trace,
         trait.created_at,
         trait.updated_at
       from public.civic_genome_trait trait
       left join lateral (
         select binding.*
           from public.civic_genome_prism_verification_binding binding
          where binding.trait_id = trait.trait_id
          order by binding.created_at desc, binding.binding_id desc
          limit 1
       ) prism on true
       where trait.genome_bill_id = $1
       order by trait.trait_class, trait.trait_key, trait.trait_fingerprint`,
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
    pool.query<{ signature_json: Record<string, unknown> }>(
      `select signature_json
         from public.civic_genome_family
        where family_id = $1
        limit 1`,
      [bill.family_id],
    ),
    pool.query<persisted_family_resolution>(
      `select unresolved_candidate_id, resolution_reason, best_candidate_family_id,
              best_candidate_score, similarity_breakdown_json, competing_family_ids,
              methodology_version, observed_at, resolved_at, resolution_family_id
         from public.civic_genome_unresolved_family_candidate
        where genome_bill_id = $1
        order by observed_at desc, created_at desc
        limit 1`,
      [genome_bill_id],
    ),
  ]);

  const latest_resolution = resolution_result.rows[0] ?? null;
  const assignment_status = latest_resolution?.resolved_at
    && latest_resolution.resolution_family_id === bill.family_id
    ? "structurally_assigned"
    : latest_resolution && !latest_resolution.resolved_at
      ? "unresolved"
      : "provisional";

  return {
    bill,
    structural_dna: {
      traits: traits_result.rows,
      assembly_runs: runs_result.rows,
    },
    family_assignment: {
      status: assignment_status,
      current_family_id: bill.family_id,
      current_family_signature: family_result.rows[0]?.signature_json ?? {},
      latest_resolution,
    },
  };
}

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
  prism_proof_scope: "independent_source_replay" | "binding_only" | null;
  prism_supported_findings: unknown[];
  prism_contradictions: unknown[];
  prism_missing_evidence: unknown[];
  prism_unresolved_conditions: unknown[];
  prism_cited_evidence_identifiers: string[];
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

export type civic_genome_version_snapshot = {
  bill_version_id: string;
  source_document_key: string;
  version_type: string;
  source_document_id: number | null;
  extraction_run_id: string | null;
  processing_state: string;
};

export type civic_genome_bill_detail = {
  bill: GenomeBill;
  current_version: civic_genome_version_snapshot | null;
  published_version: civic_genome_version_snapshot | null;
  structural_dna: {
    snapshot_state: "current" | "previous_verified" | "unavailable";
    traits: persisted_genome_trait[];
    assembly_runs: persisted_genome_assembly_run[];
    validation_summary: {
      supported: number;
      contradicted: number;
      unresolved: number;
      duplicates: number;
      missing_section: number;
    };
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

  const version_selection_result = await pool.query<{
    current_bill_version_id: string | null;
    current_source_document_key: string | null;
    current_version_type: string | null;
    current_source_document_id: number | null;
    current_extraction_run_id: string | null;
    current_processing_state: string | null;
    published_bill_version_id: string | null;
    published_source_document_key: string | null;
    published_version_type: string | null;
    published_source_document_id: number | null;
    published_extraction_run_id: string | null;
    published_processing_state: string | null;
  }>(
    `with current_version as (
       select bill_version_id, source_document_key, version_type,
              rosetta_source_document_id, rosetta_extraction_run_id,
              processing_state
         from public.civic_genome_bill_version
        where genome_bill_id = $1
        order by stage_rank desc, provider_sequence desc, updated_at desc
        limit 1
     ), published_version as (
       select bill_version_id, source_document_key, version_type,
              rosetta_source_document_id, rosetta_extraction_run_id,
              processing_state
         from public.civic_genome_bill_version
        where genome_bill_id = $1
          and processing_state in ('verified', 'verified_with_findings')
          and rosetta_source_document_id is not null
          and assembly_run_id is not null
        order by stage_rank desc, provider_sequence desc, updated_at desc
        limit 1
     )
     select current.bill_version_id as current_bill_version_id,
            current.source_document_key as current_source_document_key,
            current.version_type as current_version_type,
            current.rosetta_source_document_id::integer as current_source_document_id,
            current.rosetta_extraction_run_id as current_extraction_run_id,
            current.processing_state as current_processing_state,
            published.bill_version_id as published_bill_version_id,
            published.source_document_key as published_source_document_key,
            published.version_type as published_version_type,
            published.rosetta_source_document_id::integer as published_source_document_id,
            published.rosetta_extraction_run_id as published_extraction_run_id,
            published.processing_state as published_processing_state
       from current_version current
       full join published_version published on true`,
    [genome_bill_id],
  );
  const version_selection = version_selection_result.rows[0] ?? null;
  const current_version: civic_genome_version_snapshot | null = version_selection?.current_bill_version_id
    ? {
      bill_version_id: version_selection.current_bill_version_id,
      source_document_key: version_selection.current_source_document_key ?? "",
      version_type: version_selection.current_version_type ?? "unknown",
      source_document_id: version_selection.current_source_document_id,
      extraction_run_id: version_selection.current_extraction_run_id,
      processing_state: version_selection.current_processing_state ?? "registered",
    }
    : null;
  const published_version: civic_genome_version_snapshot | null = version_selection?.published_bill_version_id
    ? {
      bill_version_id: version_selection.published_bill_version_id,
      source_document_key: version_selection.published_source_document_key ?? "",
      version_type: version_selection.published_version_type ?? "unknown",
      source_document_id: version_selection.published_source_document_id,
      extraction_run_id: version_selection.published_extraction_run_id,
      processing_state: version_selection.published_processing_state ?? "verified",
    }
    : null;
  const display_version = current_version?.processing_state === "verified"
    || current_version?.processing_state === "verified_with_findings"
    ? current_version
    : published_version;
  const snapshot_state = display_version == null
    ? "unavailable"
    : display_version.bill_version_id === current_version?.bill_version_id
      ? "current"
      : "previous_verified";

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
         case
           when prism.binding_id is null then null
           when prism.prism_rule_set_version = '2.0.0' then 'independent_source_replay'
           else 'binding_only'
         end as prism_proof_scope,
         coalesce(prism.supported_findings, '[]'::jsonb) as prism_supported_findings,
         coalesce(prism.contradictions, '[]'::jsonb) as prism_contradictions,
         coalesce(prism.missing_evidence, '[]'::jsonb) as prism_missing_evidence,
         coalesce(prism.unresolved_conditions, '[]'::jsonb) as prism_unresolved_conditions,
         coalesce(prism.cited_evidence_identifiers, '[]'::jsonb) as prism_cited_evidence_identifiers,
         trait.trait_fingerprint,
         trait.engine_version,
         trait.rule_version,
         trait.content_hash,
         trait.source_trace,
         trait.created_at,
         trait.updated_at
       from public.civic_genome_trait trait
       left join lateral (
         select binding.*,
                receipt.supported_findings,
                receipt.contradictions,
                receipt.missing_evidence,
                receipt.unresolved_conditions,
                receipt.cited_evidence_identifiers
           from public.civic_genome_prism_verification_binding binding
           left join public.lighthouse_prism_verification_receipts receipt
             on receipt.request_id = binding.request_id
          where binding.trait_id = trait.trait_id
          order by binding.created_at desc, binding.binding_id desc
          limit 1
       ) prism on true
       where trait.genome_bill_id = $1
         and $2::bigint is not null
         and trait.source_document_id = $2::bigint
       order by trait.trait_class, trait.trait_key, trait.trait_fingerprint`,
      [genome_bill_id, display_version?.source_document_id ?? null],
    ),
    pool.query<persisted_genome_assembly_run>(
      `select *
         from public.civic_genome_assembly_run
        where genome_bill_id = $1
          and $2::bigint is not null
          and source_document_id = $2::bigint
        order by created_at desc, assembly_run_id desc
        limit 25`,
      [genome_bill_id, display_version?.source_document_id ?? null],
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

  const current_traits = traits_result.rows;
  const duplicate_keys = new Map<string, number>();
  for (const trait of current_traits) {
    const key = `${trait.trait_class}\u001f${trait.content_hash}`;
    duplicate_keys.set(key, (duplicate_keys.get(key) ?? 0) + 1);
  }
  const validation_summary = current_traits.reduce((summary, trait) => {
    const contradictions = Array.isArray(trait.prism_contradictions) ? trait.prism_contradictions : [];
    const unresolved = Array.isArray(trait.prism_unresolved_conditions) ? trait.prism_unresolved_conditions : [];
    const missing = Array.isArray(trait.prism_missing_evidence) ? trait.prism_missing_evidence : [];
    const proof_entries = [...contradictions, ...unresolved, ...missing]
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry));
    const missing_section = proof_entries.some(entry =>
      entry.source_section == null
      && (entry.source_offset_start != null || entry.source_offset_end != null));
    if (contradictions.length > 0 || trait.prism_verification_status === "contradicted") summary.contradicted += 1;
    else if (unresolved.length > 0 || missing.length > 0) summary.unresolved += 1;
    else if (trait.prism_verification_status) summary.supported += 1;
    if (missing_section) summary.missing_section += 1;
    return summary;
  }, { supported: 0, contradicted: 0, unresolved: 0, duplicates: 0, missing_section: 0 });
  validation_summary.duplicates = [...duplicate_keys.values()]
    .reduce((count, occurrences) => count + Math.max(0, occurrences - 1), 0);

  return {
    bill,
    current_version,
    published_version,
    structural_dna: {
      snapshot_state,
      traits: current_traits,
      assembly_runs: runs_result.rows,
      validation_summary,
    },
    family_assignment: {
      status: assignment_status,
      current_family_id: bill.family_id,
      current_family_signature: family_result.rows[0]?.signature_json ?? {},
      latest_resolution,
    },
  };
}

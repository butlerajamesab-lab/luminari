import { query_with_diagnostics } from "./db";

export type docket_amendment_disposition_conflict = {
  amendment_id: number;
  source_document_key: string;
  description: string | null;
  provider_adopted: boolean | null;
  provider_observed_disposition: string | null;
  verified_source_disposition: string | null;
  verification_status: string;
  prism_verification_receipt_id: string;
  source_url: string | null;
  verified_at: string;
};

export type docket_verified_enrichment = {
  source_bill_id: number;
  source: "persisted_prism_verification_receipts";
  amendment_disposition_conflicts: docket_amendment_disposition_conflict[];
};

export async function get_docket_verified_enrichment(
  source_bill_id: number,
): Promise<docket_verified_enrichment> {
  const result = await query_with_diagnostics<docket_amendment_disposition_conflict>(
    `select distinct on (
              source.provider_document_id,
              contradiction->>'expected',
              contradiction->>'observed'
            )
            source.provider_document_id::integer as amendment_id,
            source.source_document_key,
            source.description,
            source.adopted as provider_adopted,
            contradiction->>'observed' as provider_observed_disposition,
            contradiction->>'expected' as verified_source_disposition,
            binding.verification_status,
            binding.prism_verification_receipt_id::text as prism_verification_receipt_id,
            source.source_url,
            binding.created_at::text as verified_at
       from public.docket_bill_source_document source
       join public.civic_genome_bill_version version
         on version.source_document_key = source.source_document_key
        and version.source_bill_id = source.source_bill_id
       join public.civic_genome_prism_verification_binding binding
         on binding.assembly_run_id = version.assembly_run_id
       join public.lighthouse_prism_verification_receipts receipt
         on receipt.prism_verification_receipt_id = binding.prism_verification_receipt_id
       cross join lateral jsonb_array_elements(coalesce(receipt.contradictions, '[]'::jsonb)) contradiction
      where source.source_bill_id = $1
        and source.document_family = 'amendment'
        and contradiction->>'check' = 'amendment_disposition_matches_source'
      order by source.provider_document_id,
               contradiction->>'expected',
               contradiction->>'observed',
               binding.created_at desc,
               binding.binding_id desc`,
    [source_bill_id],
    {
      label: "docket_verified_amendment_disposition_conflicts",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );

  return {
    source_bill_id,
    source: "persisted_prism_verification_receipts",
    amendment_disposition_conflicts: result.rows,
  };
}

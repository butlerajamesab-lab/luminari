import { getPool } from "./db";
import { inspect_v12_admission_for_binding, type v12_admission_receipt } from "./civic-genome-rosetta-v12-admission";
export { get_rosetta_review_base_url } from "./rosetta-review-url";
import { get_rosetta_review_base_url } from "./rosetta-review-url";

/**
 * Historical current-docket-result transport was retired by Rosetta on Oct 16.
 * This export exists temporarily for still-quarantined legacy callers.
 * It MUST NOT fetch, proxy, revive, or fall back to the retired endpoint.
 */
export async function load_rosetta_current_docket_result_for_binding(
  _input: { source_document_key: string; source_content_hash: string },
): Promise<never> {
  throw new Error("rosetta_v12_legacy_current_docket_reader_retired");
}

type version_binding = {
  bill_version_id: string;
  version_type: string;
  source_document_key: string | null;
  source_document_id: number | null;
  source_content_hash: string | null;
  source_content_id: string | null;
};

export type civic_genome_rosetta_evaluation = {
  binding: version_binding | null;
  availability: "available" | "binding_missing" | "not_in_evaluation" | "held" | "failed" | "rejected";
  review_url: string;
  /** Retired public contract is never populated, including for V12 success. */
  current_docket_result: null;
  v12_admission: v12_admission_receipt | null;
};

export async function get_civic_genome_rosetta_evaluation(input: {
  genome_bill_id: string;
  bill_version_id?: string;
}): Promise<civic_genome_rosetta_evaluation> {
  const { rows } = await getPool().query<version_binding>(
    `select bill_version_id, version_type,
            source_document_key,
            rosetta_source_document_id::integer as source_document_id,
            receipt_json ->> 'source_content_hash' as source_content_hash,
            receipt_json ->> 'rosetta_source_content_id' as source_content_id
       from public.civic_genome_bill_version
      where genome_bill_id = $1::uuid
        and ($2::uuid is null or bill_version_id = $2::uuid)
        and ($2::uuid is not null or document_family = 'text')
      order by stage_rank desc, provider_sequence desc, updated_at desc, bill_version_id
      limit 1`,
    [input.genome_bill_id, input.bill_version_id ?? null],
  );
  const binding = rows[0] ?? null;
  const review_url = new URL("/review", get_rosetta_review_base_url()).toString();
  if (!binding?.source_document_key
    || !binding.source_document_id || binding.source_document_id <= 0
    || !/^[a-f0-9]{64}$/i.test(binding.source_content_hash ?? "")) {
    return { binding, availability: "binding_missing", review_url, current_docket_result: null, v12_admission: null };
  }
  const result = await inspect_v12_admission_for_binding({
    bill_version_id: binding.bill_version_id,
    source_document_key: binding.source_document_key,
    rosetta_source_document_id: binding.source_document_id,
    source_content_hash: binding.source_content_hash!,
    rosetta_source_content_id: binding.source_content_id,
  });
  const receipt = result.receipt;
  const availability = receipt.admitted ? "available" : receipt.admission_state === "held" ? "held"
    : receipt.admission_state === "failed" ? "failed"
      : ["rosetta_v12_live_rule_http_404", "rosetta_v12_source_resolution_zero_matches"].includes(receipt.reason ?? "")
        ? "not_in_evaluation" : "rejected";
  return { binding, availability, review_url, current_docket_result: null, v12_admission: receipt };
}

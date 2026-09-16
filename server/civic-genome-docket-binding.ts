import { getPool } from "./db";

/** Resolve a persisted local source identity for an existing queue job.
 * This does not select a Rosetta result. Multiple source identities are rejected;
 * no latest-version or document-ID fallback is sent to Rosetta.
 */
export async function load_queued_docket_binding(input: {
  genome_bill_id: string;
  source_document_id: number;
  source_content_hash?: string;
  source_identity_hash?: string;
}): Promise<{ source_document_key: string; source_content_hash: string }> {
  const { rows } = await getPool().query<{ source_document_key: string; source_content_hash: string }>(
    `select distinct source_document_key, receipt_json->>'source_content_hash' as source_content_hash
       from public.civic_genome_bill_version
      where genome_bill_id=$1::uuid and rosetta_source_document_id=$2::integer
        and ($3::text is null or receipt_json->>'source_content_hash'=$3)
        and ($4::text is null or receipt_json->>'rosetta_source_identity_hash'=$4)
      limit 2`,
    [input.genome_bill_id, input.source_document_id, input.source_content_hash?.toLowerCase() ?? null, input.source_identity_hash ?? null],
  );
  if (rows.length !== 1 || !rows[0].source_document_key || !/^[0-9a-f]{64}$/.test(rows[0].source_content_hash ?? "")) {
    throw new Error("rosetta_queued_docket_binding_requires_review");
  }
  return rows[0];
}

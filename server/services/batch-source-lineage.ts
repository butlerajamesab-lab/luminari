import { getPool as get_pool } from "../db";

/** Explicit mapping onto the existing SAIS table. Source assertions do not set publication/verification. */
export const SAIS_EXISTING_FIELD_MAPPING = {
  family_series: "family_key", document_number: "document_number", resource_category: "resource_category",
  organization_name: "organization_name", organization_type: "organization_type", service_type: "service_type",
  jurisdiction: "jurisdiction", jurisdiction_level: "jurisdiction_level", subcategory: "subcategory",
  official_url: "official_url", official_contact: "official_contact", statutory_authority: "statutory_authority",
} as const;

export function reconcile_existing_sais_identity(source: Record<string, unknown>, existing: Record<string, unknown> | null) {
  if (!source.resource_id || typeof source.resource_id !== "string") return { state: "held_missing_source_identity", canonical_identity: null, fields: [] };
  if (!/^\d+$/.test(String(source.document_number)) || !Number.isSafeInteger(Number(source.document_number))) {
    return { state: "held_pipeline_contract_required", canonical_identity: null, fields: [] };
  }
  if (!existing) return { state: "held_canonical_identity_absent", canonical_identity: null, fields: [] };
  if (source.resource_id !== existing.resource_id) return { state: "held_identity_conflict", canonical_identity: null, fields: [] };
  const fields = Object.entries(SAIS_EXISTING_FIELD_MAPPING).filter(([field]) => field in source).map(([field, column]) => {
    const proposed = field === "document_number" ? Number(source[field]) : source[field];
    const current = existing[column];
    return { source_field: field, canonical_column: column, source_value: proposed, existing_value: current,
      policy: "fill_blank_only", outcome: proposed === null || proposed === "" ? "preserve_absent_source_value"
        : proposed === current ? "already_equal" : current === null || current === "" ? "review_fill_blank" : "held_nonblank_conflict" };
  });
  const identity_fields = ["family_key", "document_number", "resource_category", "organization_name"];
  if (identity_fields.some(column => !fields.some(field => field.canonical_column === column && field.outcome === "already_equal"))) {
    return { state: "held_identity_conflict", canonical_identity: null, fields };
  }
  return { state: fields.some(field => field.outcome === "held_nonblank_conflict") ? "held_field_conflict" : "existing_identity_reconciled",
    canonical_table: "public.sais_resources", canonical_identity: { resource_id: existing.resource_id }, fields,
    writes_performed: false, publication_state: "governed_non_public" };
}

/** Mission Control readback of persisted original-source observations and the current canonical row. */
export async function read_batch_source_lineage(input: { artifact_key: string; resource_id?: string; limit?: number }, database?: Pick<ReturnType<typeof get_pool>, "query">) {
  const limit = Math.min(200, Math.max(1, input.limit ?? 50));
  try {
    const reader_database = database ?? get_pool();
    const source = await reader_database.query(`select a.content_sha256,a.storage_state,
      exists(select 1 from public.luminari_corpus_atomic_artifact_v1 receipt
        where receipt.artifact_key=a.artifact_key and receipt.content_sha256=a.content_sha256 and receipt.status='completed') as parsed
      from public.luminari_corpus_source_artifact_v1 a where a.artifact_key=$1`, [input.artifact_key]);
    if (!source.rows[0] || !source.rows[0].parsed || source.rows[0].storage_state !== "active") {
      return { availability: "unavailable", record_count: null, limit, publication_state: "governed_non_public",
        runtime_reader: "read_batch_source_lineage", records: null,
        error: { code: "current_source_not_parsed", detail: "The current source version has no completed extraction receipt." } };
    }
    const result = await reader_database.query(`
      select r.atomic_record_key,r.source_kind,r.source_file_sha256,r.record_hash,r.parser_version,
             r.values_json,o.source_locator,o.container_member_path,a.artifact_key,a.content_sha256,
             to_jsonb(canonical) as existing_canonical
        from public.luminari_corpus_atomic_record_v1 r
        join public.luminari_corpus_atomic_record_origin_v1 o using(atomic_record_key)
        join public.luminari_corpus_atomic_artifact_v1 receipt on receipt.run_id=o.run_id and receipt.artifact_key=o.artifact_key
        join public.luminari_corpus_source_artifact_v1 a on a.artifact_key=o.artifact_key
        left join public.sais_resources canonical
          on r.source_kind='sais_resource_source' and canonical.resource_id=r.values_json->>'source_record_id'
       where a.artifact_key=$1 and a.storage_state='active' and receipt.status='completed'
         and a.content_sha256=receipt.content_sha256 and r.values_json->>'source_sha256'=a.content_sha256
         and ($2::text is null or r.values_json->>'source_record_id'=$2)
         and receipt.run_id=(select latest.run_id from public.luminari_corpus_atomic_artifact_v1 latest
           where latest.artifact_key=a.artifact_key and latest.status='completed' and latest.content_sha256=a.content_sha256
           order by latest.completed_at desc,latest.run_id desc limit 1)
       order by r.row_ordinal,r.atomic_record_key limit $3`, [input.artifact_key, input.resource_id ?? null, limit]);
    const records = result.rows.map(row => ({ ...row, canonical_reconciliation: row.source_kind === "sais_resource_source"
      ? row.values_json.review_state === "source_observation"
        ? reconcile_existing_sais_identity(row.values_json.values, row.existing_canonical)
        : { state: "held_source_integrity", canonical_identity: null, source_review_state: row.values_json.review_state }
      : null }));
    return { availability: records.length ? "available" : "empty", record_count: records.length, limit,
      publication_state: "governed_non_public", runtime_reader: "read_batch_source_lineage", records, error: null };
  } catch (error) {
    return { availability: "error", record_count: null, limit, publication_state: "governed_non_public",
      runtime_reader: "read_batch_source_lineage", records: null,
      error: { code: "batch_source_read_failed", detail: error instanceof Error ? error.message : String(error) } };
  }
}

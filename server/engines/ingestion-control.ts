import { getPool } from "../db";

export type CorpusImportQueueStatusFilter =
  | "all"
  | "blocked"
  | "review_required"
  | "pending_bucket_content_scan"
  | "pending_docx_normalization"
  | "docx_extraction_failed"
  | "candidates_created";

type CorpusImportQueueRow = {
  id: number;
  source_name: string | null;
  source_ext: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  storage_mode: string | null;
  target_hint: string | null;
  import_status: string | null;
  record_count_estimate: number | null;
  created_at: string | null;
  updated_at: string | null;
  raw_text_chars: number;
  has_payload: boolean;
  policy_class: string;
  dedupe_behavior: string;
  intended_destination: string;
  blocked_reason: string | null;
  next_action: string;
};

function classify_policy(row: { target_hint: string | null; source_ext: string | null; import_status: string | null }) {
  const target_hint = (row.target_hint ?? "").toLowerCase();
  const source_ext = (row.source_ext ?? "").toLowerCase();
  const import_status = row.import_status ?? "pending";

  if (import_status.includes("failed")) {
    return {
      policy_class: "review_required",
      dedupe_behavior: "hold_for_operator_review",
      intended_destination: "corpus_import_queue",
      blocked_reason: import_status,
      next_action: "inspect_error_then_retry_step",
    };
  }

  if (target_hint.includes("statute") || target_hint.includes("law") || target_hint.includes("legal_authority")) {
    return {
      policy_class: "strict_authority",
      dedupe_behavior: "no_silent_merge",
      intended_destination: target_hint || "legal_authority_staging",
      blocked_reason: "strict_authority_requires_review",
      next_action: "route_corpus_queue_dry_run",
    };
  }

  if (source_ext === ".docx" && import_status === "pending_bucket_content_scan") {
    return {
      policy_class: "entity_enrichment",
      dedupe_behavior: "enrich_blank_fields_only",
      intended_destination: target_hint || "registry_entity_extraction_v4",
      blocked_reason: "docx_not_extracted",
      next_action: "extract_docx_queue_row",
    };
  }

  if (source_ext === ".docx" && import_status === "pending_docx_normalization") {
    return {
      policy_class: "entity_enrichment",
      dedupe_behavior: "enrich_blank_fields_only",
      intended_destination: target_hint || "registry_entity_extraction_v4",
      blocked_reason: null,
      next_action: "normalize_docx_queue_row",
    };
  }

  return {
    policy_class: target_hint ? "entity_enrichment" : "review_required",
    dedupe_behavior: target_hint ? "enrich_blank_fields_only" : "hold_for_target_hint",
    intended_destination: target_hint || "target_hint_required",
    blocked_reason: target_hint ? null : "missing_target_hint",
    next_action: target_hint ? "route_corpus_queue_dry_run" : "set_target_hint",
  };
}

export async function list_corpus_import_queue(input?: { status_filter?: CorpusImportQueueStatusFilter; limit?: number }) {
  const status_filter = input?.status_filter ?? "all";
  const limit = Math.min(Math.max(input?.limit ?? 100, 1), 500);
  const pool = getPool();

  const values: unknown[] = [];
  let where_sql = "";

  if (status_filter !== "all" && status_filter !== "blocked") {
    values.push(status_filter);
    where_sql = `where import_status = $${values.length}`;
  } else if (status_filter === "blocked") {
    where_sql = "where import_status ilike '%failed%' or target_hint is null";
  }

  values.push(limit);
  const limit_placeholder = `$${values.length}`;

  const result = await pool.query(
    `select
       id,
       source_name,
       source_ext,
       storage_bucket,
       storage_path,
       storage_mode,
       target_hint,
       import_status,
       record_count_estimate,
       created_at,
       updated_at,
       coalesce(char_length(raw_text), 0) as raw_text_chars,
       payload is not null as has_payload
     from public.corpus_import_queue
     ${where_sql}
     order by updated_at desc nulls last, created_at desc nulls last, id desc
     limit ${limit_placeholder}`,
    values,
  );

  const rows = result.rows.map((row: any): CorpusImportQueueRow => ({
    id: Number(row.id),
    source_name: row.source_name ?? null,
    source_ext: row.source_ext ?? null,
    storage_bucket: row.storage_bucket ?? null,
    storage_path: row.storage_path ?? null,
    storage_mode: row.storage_mode ?? null,
    target_hint: row.target_hint ?? null,
    import_status: row.import_status ?? null,
    record_count_estimate: row.record_count_estimate === null ? null : Number(row.record_count_estimate),
    created_at: row.created_at ? String(row.created_at) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
    raw_text_chars: Number(row.raw_text_chars ?? 0),
    has_payload: Boolean(row.has_payload),
    ...classify_policy(row),
  }));

  return {
    success: true,
    status_filter,
    limit,
    row_count: rows.length,
    rows,
  };
}

export async function get_corpus_import_queue_row(input: { id: number }) {
  const pool = getPool();
  const result = await pool.query(
    `select
       id,
       source_name,
       source_ext,
       storage_bucket,
       storage_path,
       storage_mode,
       target_hint,
       import_status,
       record_count_estimate,
       created_at,
       updated_at,
       coalesce(char_length(raw_text), 0) as raw_text_chars,
       left(coalesce(raw_text, ''), 6000) as raw_text_preview,
       payload
     from public.corpus_import_queue
     where id = $1`,
    [input.id],
  );

  const row = result.rows[0];
  if (!row) {
    return { success: false, row: null, error: "corpus_import_queue_row_not_found" };
  }

  return {
    success: true,
    row: {
      id: Number(row.id),
      source_name: row.source_name ?? null,
      source_ext: row.source_ext ?? null,
      storage_bucket: row.storage_bucket ?? null,
      storage_path: row.storage_path ?? null,
      storage_mode: row.storage_mode ?? null,
      target_hint: row.target_hint ?? null,
      import_status: row.import_status ?? null,
      record_count_estimate: row.record_count_estimate === null ? null : Number(row.record_count_estimate),
      created_at: row.created_at ? String(row.created_at) : null,
      updated_at: row.updated_at ? String(row.updated_at) : null,
      raw_text_chars: Number(row.raw_text_chars ?? 0),
      raw_text_preview: row.raw_text_preview ?? "",
      payload: row.payload ?? null,
      ...classify_policy(row),
    },
  };
}

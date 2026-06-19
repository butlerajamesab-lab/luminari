import { createHash } from "node:crypto";
import { getPool } from "../db";

export type CorpusImportQueueStatusFilter =
  | "all"
  | "blocked"
  | "review_required"
  | "pending_bucket_content_scan"
  | "pending_docx_normalization"
  | "ready_for_review"
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
  normalized_text_chars: number;
  has_payload: boolean;
  policy_class: string;
  dedupe_behavior: string;
  intended_destination: string;
  blocked_reason: string | null;
  next_action: string;
};

export const allowed_target_hints = [
  "state_enriched_registry_docx_review",
  "registry_entity_extraction_v4",
  "legal_authority_staging",
  "legislator_registry",
  "committee_registry",
  "committee_membership_registry",
  "government_benefits_registry",
  "workflow_registry",
  "escalation_registry",
  "advocacy_organizations",
  "advocacy_targets",
  "agency_authority_map",
] as const;

export type TargetHintValue = typeof allowed_target_hints[number];

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

  if (source_ext === ".docx" && import_status === "ready_for_review") {
    return {
      policy_class: "entity_enrichment",
      dedupe_behavior: "enrich_blank_fields_only",
      intended_destination: target_hint || "registry_entity_extraction_v4",
      blocked_reason: null,
      next_action: "create_registry_candidates",
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

  return {
    policy_class: target_hint ? "entity_enrichment" : "review_required",
    dedupe_behavior: target_hint ? "enrich_blank_fields_only" : "hold_for_target_hint",
    intended_destination: target_hint || "target_hint_required",
    blocked_reason: target_hint ? null : "missing_target_hint",
    next_action: target_hint ? "route_corpus_queue_dry_run" : "set_target_hint",
  };
}

function map_queue_row(row: any): CorpusImportQueueRow {
  return {
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
    normalized_text_chars: Number(row.normalized_text_chars ?? 0),
    has_payload: Boolean(row.has_payload),
    ...classify_policy(row),
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

  const summary_result = await pool.query(`select import_status, count(*)::int as count from public.corpus_import_queue group by import_status`);
  const status_counts = Object.fromEntries(summary_result.rows.map((row: any) => [row.import_status ?? "unknown", Number(row.count ?? 0)]));

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
       coalesce(normalized_text_chars, char_length(normalized_text), 0) as normalized_text_chars,
       payload is not null as has_payload
     from public.corpus_import_queue
     ${where_sql}
     order by
       case import_status
         when 'ready_for_review' then 0
         when 'pending_docx_normalization' then 1
         when 'pending_bucket_content_scan' then 2
         else 3
       end,
       updated_at desc nulls last,
       created_at desc nulls last,
       id desc
     limit ${limit_placeholder}`,
    values,
  );

  const rows = result.rows.map(map_queue_row);

  return {
    success: true,
    status_filter,
    limit,
    row_count: rows.length,
    summary_counts: status_counts,
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
       coalesce(normalized_text_chars, char_length(normalized_text), 0) as normalized_text_chars,
       left(coalesce(normalized_text, raw_text, ''), 6000) as raw_text_preview,
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
      ...map_queue_row(row),
      raw_text_preview: row.raw_text_preview ?? "",
      payload: row.payload ?? null,
    },
  };
}

const CANDIDATE_EXTRACTOR_VERSION = "candidate_conveyor_v1";
const CANDIDATE_TYPES = ["policy_alert", "agency", "legal_aid", "court", "tribal_entity", "benefit_program", "workflow", "deadline", "statute", "contact", "resource"] as const;

type CandidateType = typeof CANDIDATE_TYPES[number];

type ReadyQueueRow = {
  id: number;
  source_name: string | null;
  storage_path: string | null;
  sha256: string | null;
  normalized_text: string;
};

type ExtractionCandidate = {
  candidate_type: CandidateType;
  name: string;
  excerpt: string;
  jurisdiction: string | null;
  content_hash: string;
  payload: Record<string, unknown>;
  provenance: Record<string, unknown>;
  confidence_scores: Record<string, unknown>;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function infer_jurisdiction(row: Pick<ReadyQueueRow, "source_name" | "storage_path">, text: string) {
  const haystack = `${row.source_name ?? ""} ${row.storage_path ?? ""} ${text.slice(0, 2000)}`.toLowerCase();
  const states: Record<string, string[]> = {
    Alabama: ["alabama", "_al_", "-al-"], Alaska: ["alaska", "_ak_", "-ak-"], Arizona: ["arizona", "_az_", "-az-"], Arkansas: ["arkansas", "_ar_", "-ar-"], California: ["california", "_ca_", "-ca-"], Colorado: ["colorado", "_co_", "-co-"], Connecticut: ["connecticut", "_ct_", "-ct-"], Delaware: ["delaware", "_de_", "-de-"], Florida: ["florida", "_fl_", "-fl-"], Georgia: ["georgia", "_ga_", "-ga-"], Hawaii: ["hawaii", "_hi_", "-hi-"], Idaho: ["idaho", "_id_", "-id-"], Illinois: ["illinois", "_il_", "-il-"], Indiana: ["indiana", "_in_", "-in-"], Iowa: ["iowa", "_ia_", "-ia-"], Kansas: ["kansas", "_ks_", "-ks-"], Kentucky: ["kentucky", "_ky_", "-ky-"], Louisiana: ["louisiana", "_la_", "-la-"], Maine: ["maine", "_me_", "-me-"], Maryland: ["maryland", "_md_", "-md-"], Massachusetts: ["massachusetts", "_ma_", "-ma-"], Michigan: ["michigan", "_mi_", "-mi-"], Minnesota: ["minnesota", "_mn_", "-mn-"], Mississippi: ["mississippi", "_ms_", "-ms-"], Missouri: ["missouri", "_mo_", "-mo-"], Montana: ["montana", "_mt_", "-mt-"], Nebraska: ["nebraska", "_ne_", "-ne-"], Nevada: ["nevada", "_nv_", "-nv-"], "New Hampshire": ["new hampshire", "_nh_", "-nh-"], "New Jersey": ["new jersey", "_nj_", "-nj-"], "New Mexico": ["new mexico", "_nm_", "-nm-"], "New York": ["new york", "_ny_", "-ny-"], "North Carolina": ["north carolina", "_nc_", "-nc-"], "North Dakota": ["north dakota", "_nd_", "-nd-"], Ohio: ["ohio", "_oh_", "-oh-"], Oklahoma: ["oklahoma", "_ok_", "-ok-"], Oregon: ["oregon", "_or_", "-or-"], Pennsylvania: ["pennsylvania", "_pa_", "-pa-"], "Rhode Island": ["rhode island", "_ri_", "-ri-"], "South Carolina": ["south carolina", "_sc_", "-sc-"], "South Dakota": ["south dakota", "_sd_", "-sd-"], Tennessee: ["tennessee", "_tn_", "-tn-"], Texas: ["texas", "_tx_", "-tx-"], Utah: ["utah", "_ut_", "-ut-"], Vermont: ["vermont", "_vt_", "-vt-"], Virginia: ["virginia", "_va_", "-va-"], Washington: ["washington", "_wa_", "-wa-"], "West Virginia": ["west virginia", "_wv_", "-wv-"], Wisconsin: ["wisconsin", "_wi_", "-wi-"], Wyoming: ["wyoming", "_wy_", "-wy-"],
  };
  return Object.entries(states).find(([, needles]) => needles.some((needle) => haystack.includes(needle)))?.[0] ?? null;
}

function logical_sections(text: string) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}|(?=^\s*(?:layer\s+\d+|[-*•]\s+|#{1,4}\s+))/gim).map((part) => part.trim()).filter(Boolean);
  return blocks.length ? blocks : [text.trim()];
}

function detect_types(section: string): CandidateType[] {
  const lower = section.toLowerCase();
  const hits = new Set<CandidateType>();
  if (/policy alert|alert|emergency|notice|advisory/.test(lower)) hits.add("policy_alert");
  if (/agency|department|division|office of|authority/.test(lower)) hits.add("agency");
  if (/legal aid|legal services|pro bono|law center/.test(lower)) hits.add("legal_aid");
  if (/court|tribunal|clerk|judicial/.test(lower)) hits.add("court");
  if (/tribal|tribe|native nation|indian affairs/.test(lower)) hits.add("tribal_entity");
  if (/benefit|snap|medicaid|tanf|ssi|program|assistance/.test(lower)) hits.add("benefit_program");
  if (/workflow|process|steps|intake|appeal|application/.test(lower)) hits.add("workflow");
  if (/deadline|due date|within \d+ (?:day|days|month|months)|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(lower)) hits.add("deadline");
  if (/\b(?:usc|u\.s\.c\.|cfr|c\.f\.r\.|§|section|statute|code)\b/i.test(section)) hits.add("statute");
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/i.test(section)) hits.add("contact");
  if (/https?:\/\/|www\.|resource|directory|hotline|website/.test(lower)) hits.add("resource");
  return [...hits];
}

function extract_obvious_values(section: string) {
  return {
    phones: section.match(/(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g) ?? [],
    emails: section.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [],
    urls: section.match(/https?:\/\/[^\s)]+|www\.[^\s)]+/gi) ?? [],
    statutes: section.match(/(?:\d+\s+U\.S\.C\.\s+§?\s*[\w.-]+|\d+\s+C\.F\.R\.\s+§?\s*[\w.-]+|§\s*[\w.-]+|section\s+[\w.-]+)/gi) ?? [],
    deadlines: section.match(/(?:within\s+\d+\s+(?:day|days|month|months)|deadline[^.\n]*|due\s+(?:by|date)?[^.\n]*|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b)/gi) ?? [],
  };
}

function build_candidates(row: ReadyQueueRow) {
  const jurisdiction = infer_jurisdiction(row, row.normalized_text);
  const source_hash = row.sha256 ?? sha256(row.normalized_text);
  const candidates: ExtractionCandidate[] = [];
  logical_sections(row.normalized_text).slice(0, 400).forEach((section, index) => {
    if (section.length < 40) return;
    const types = detect_types(section);
    if (!types.length) return;
    const first_line = section.split("\n").map((line) => line.trim()).find(Boolean) ?? `candidate_${index + 1}`;
    const excerpt = section.slice(0, 2500);
    for (const candidate_type of types) {
      const content_hash = sha256(`${row.id}:${candidate_type}:${excerpt}`);
      candidates.push({
        candidate_type,
        name: first_line.slice(0, 240),
        excerpt,
        jurisdiction,
        content_hash,
        payload: { candidate_type, source_queue_id: row.id, source_name: row.source_name, storage_path: row.storage_path, source_text_hash: source_hash, normalized_excerpt: excerpt, extracted: extract_obvious_values(section), extraction_status: "candidate_created" },
        provenance: { action: "create_candidates_from_ready", extractor_version: CANDIDATE_EXTRACTOR_VERSION, source_queue_id: row.id, source_name: row.source_name, storage_path: row.storage_path, source_text_hash: source_hash, section_index: index, deterministic_rules: true, canonical_promotion: false },
        confidence_scores: { overall: 0.35, deterministic_candidate: true, promotion_ready: false, candidate_type },
      });
    }
  });
  return candidates;
}

async function registry_entity_extraction_v4_columns(client: any) {
  const result = await client.query(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'registry_entity_extraction_v4'`);
  return new Set(result.rows.map((row: any) => row.column_name));
}

async function insert_candidate(client: any, columns: Set<string>, row: ReadyQueueRow, candidate: ExtractionCandidate) {
  const existing = await client.query(`select 1 from public.registry_entity_extraction_v4 where content_hash = $1 limit 1`, [candidate.content_hash]);
  if (existing.rowCount) return false;
  const insertable: Record<string, unknown> = {
    source_file: row.source_name ?? row.storage_path,
    jurisdiction: candidate.jurisdiction,
    extraction_timestamp: new Date(),
    extraction_version: CANDIDATE_EXTRACTOR_VERSION,
    program_id: `${row.id}:${candidate.candidate_type}:${candidate.content_hash.slice(0, 12)}`,
    name: candidate.name,
    promotion_ready: { ready: false, status: "candidate_created", candidate_type: candidate.candidate_type },
    forensic_provenance: candidate.provenance,
    forensic_hash: candidate.content_hash,
    confidence_scores: candidate.confidence_scores,
    geocoding_hints: { jurisdiction: candidate.jurisdiction, source_queue_id: row.id },
    content_hash: candidate.content_hash,
  };
  for (const [key, value] of Object.entries({ source_queue_id: row.id, corpus_import_queue_id: row.id, storage_path: row.storage_path, source_path: row.storage_path, source_name: row.source_name, source_text_hash: row.sha256 ?? sha256(row.normalized_text), raw_candidate_payload: candidate.payload, candidate_payload: candidate.payload, payload: candidate.payload, normalized_excerpt: candidate.excerpt, extraction_status: "candidate_created" })) {
    if (columns.has(key)) insertable[key] = value;
  }
  const names = Object.keys(insertable).filter((name) => columns.has(name));
  const placeholders = names.map((name, index) => columns.has(name) && typeof insertable[name] === "object" && !(insertable[name] instanceof Date) ? `$${index + 1}::jsonb` : `$${index + 1}`);
  await client.query(`insert into public.registry_entity_extraction_v4 (${names.join(", ")}) values (${placeholders.join(", ")})`, names.map((name) => typeof insertable[name] === "object" && !(insertable[name] instanceof Date) ? JSON.stringify(insertable[name]) : insertable[name]));
  return true;
}

export async function create_candidates_from_ready_queue() {
  const pool = getPool();
  const client = await pool.connect();
  const started_at = Date.now();
  try {
    await client.query("begin");
    const columns = await registry_entity_extraction_v4_columns(client);
    for (const required of ["source_file", "jurisdiction", "extraction_timestamp", "extraction_version", "program_id", "name", "promotion_ready", "forensic_provenance", "forensic_hash", "confidence_scores", "geocoding_hints", "content_hash"]) {
      if (!columns.has(required)) throw new Error(`registry_entity_extraction_v4 missing required column: ${required}`);
    }
    const rows_result = await client.query(`select id, source_name, storage_path, sha256, normalized_text from public.corpus_import_queue where import_status = 'ready_for_review' and length(trim(coalesce(normalized_text, ''))) > 0 order by id`);
    const processed_rows: Array<Record<string, unknown>> = [];
    let candidate_count = 0;
    let inserted_count = 0;
    let skipped_count = 0;
    for (const row of rows_result.rows as ReadyQueueRow[]) {
      const candidates = build_candidates(row);
      let row_inserted = 0;
      let row_skipped = 0;
      for (const candidate of candidates) {
        if (await insert_candidate(client, columns, row, candidate)) row_inserted += 1;
        else row_skipped += 1;
      }
      candidate_count += candidates.length;
      inserted_count += row_inserted;
      skipped_count += row_skipped;
      const operation_result = { action: "create_candidates_from_ready", candidate_count: candidates.length, inserted_count: row_inserted, skipped_count: row_skipped, created_at: new Date().toISOString(), target_table: "public.registry_entity_extraction_v4", extractor_version: CANDIDATE_EXTRACTOR_VERSION };
      await client.query(`update public.corpus_import_queue set import_status = 'candidates_created', operation_result_json = coalesce(operation_result_json, '{}'::jsonb) || jsonb_build_object('last_candidate_conveyor', $2::jsonb), updated_at = now(), last_transition_at = now() where id = $1`, [row.id, JSON.stringify(operation_result)]);
      processed_rows.push({ id: row.id, source_name: row.source_name, candidate_count: candidates.length, inserted_count: row_inserted, skipped_count: row_skipped });
    }
    await client.query("commit");
    return { success: true, action: "create_candidates_from_ready", runtime_ms: Date.now() - started_at, target_table: "public.registry_entity_extraction_v4", extractor_version: CANDIDATE_EXTRACTOR_VERSION, processed_rows: processed_rows.length, candidate_count, inserted_count, skipped_count, rows: processed_rows, last_candidate_conveyor_result: processed_rows.at(-1) ?? null };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

type registry_candidate_column_map = Record<string, boolean>;

type registry_candidate_filter_input = {
  limit?: number;
  candidate_type?: string | null;
  document_family?: string | null;
  promotion_lane?: string | null;
};

async function registry_candidate_columns(): Promise<registry_candidate_column_map> {
  const pool = getPool();
  const result = await pool.query(
    `select column_name
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'registry_entity_extraction_v4'`,
  );
  return Object.fromEntries(result.rows.map((row: any) => [row.column_name, true]));
}

function registry_json_text_expression(columns: registry_candidate_column_map, column_name: string, json_keys: string[], fallback: string) {
  if (columns[column_name]) return column_name;
  const json_sources = ["promotion_ready", "payload", "confidence_scores"].filter((source) => columns[source]);
  const parts: string[] = [];
  for (const source of json_sources) {
    for (const json_key of json_keys) parts.push(`${source}->>'${json_key}'`);
  }
  parts.push(`'${fallback}'`);
  if (parts.length === 1) return parts[0];
  return `coalesce(${parts.join(", ")})`;
}

function registry_candidate_type_expression(columns: registry_candidate_column_map) {
  return registry_json_text_expression(columns, "candidate_type", ["candidate_type", "resource_type", "status"], "unknown");
}

function registry_document_family_expression(columns: registry_candidate_column_map) {
  return registry_json_text_expression(columns, "document_family", ["document_family", "source_family", "family"], "unclassified");
}

function registry_promotion_lane_expression(columns: registry_candidate_column_map) {
  return registry_json_text_expression(columns, "promotion_lane", ["promotion_lane", "lane", "target_lane"], "unclassified");
}

function registry_verification_status_expression(columns: registry_candidate_column_map) {
  return registry_json_text_expression(columns, "verification_status", ["verification_status", "review_status", "status"], "unclassified");
}

function registry_source_citation_expression(columns: registry_candidate_column_map) {
  return registry_json_text_expression(columns, "source_citation", ["source_citation", "citation", "source_provenance", "forensic_provenance", "source_url"], "");
}

function registry_confidence_expression(columns: registry_candidate_column_map) {
  if (columns.confidence) return "confidence";
  if (columns.confidence_scores) return "nullif(confidence_scores->>'overall', '')::numeric";
  return "null::numeric";
}

function registry_filter_sql(input: registry_candidate_filter_input, columns: registry_candidate_column_map) {
  const params: any[] = [];
  const clauses: string[] = [];
  const filter_pairs = [
    { value: input.candidate_type, expression: registry_candidate_type_expression(columns) },
    { value: input.document_family, expression: registry_document_family_expression(columns) },
    { value: input.promotion_lane, expression: registry_promotion_lane_expression(columns) },
  ];
  for (const pair of filter_pairs) {
    if (typeof pair.value === "string" && pair.value.trim()) {
      params.push(pair.value.trim());
      clauses.push(`${pair.expression} = $${params.length}`);
    }
  }
  return { where_sql: clauses.length ? `where ${clauses.join(" and ")}` : "", params };
}

async function registry_breakdown(expression: string) {
  const pool = getPool();
  const result = await pool.query(
    `select coalesce(nullif(${expression}, ''), 'unclassified') as bucket_value,
            count(*)::int as count
       from public.registry_entity_extraction_v4
      group by 1
      order by count desc, bucket_value asc`,
  );
  return result.rows.map((row: any) => ({ bucket_value: row.bucket_value ?? "unclassified", count: Number(row.count ?? 0) }));
}

export async function get_registry_entity_candidates_summary() {
  const pool = getPool();
  const columns = await registry_candidate_columns();
  const total_result = await pool.query(`select count(*)::int as total from public.registry_entity_extraction_v4`);
  const candidate_type_breakdown = await registry_breakdown(registry_candidate_type_expression(columns));
  const document_family_breakdown = await registry_breakdown(registry_document_family_expression(columns));
  const promotion_lane_breakdown = await registry_breakdown(registry_promotion_lane_expression(columns));
  const verification_status_breakdown = await registry_breakdown(registry_verification_status_expression(columns));
  return {
    success: true,
    table: "public.registry_entity_extraction_v4",
    total_candidate_count: Number(total_result.rows[0]?.total ?? 0),
    candidate_type_breakdown: candidate_type_breakdown.map((row) => ({ candidate_type: row.bucket_value, count: row.count })),
    document_family_breakdown: document_family_breakdown.map((row) => ({ document_family: row.bucket_value, count: row.count })),
    promotion_lane_breakdown: promotion_lane_breakdown.map((row) => ({ promotion_lane: row.bucket_value, count: row.count })),
    verification_status_breakdown: verification_status_breakdown.map((row) => ({ verification_status: row.bucket_value, count: row.count })),
  };
}

export async function list_registry_entity_candidates(input?: { limit?: number }) {
  const pool = getPool();
  const columns = await registry_candidate_columns();
  const limit = Math.min(Math.max(input?.limit ?? 25, 1), 100);
  const candidate_type_sql = registry_candidate_type_expression(columns);
  const confidence_sql = registry_confidence_expression(columns);

  const recent_result = await pool.query(
    `select
        source_file,
        jurisdiction,
        name,
        promotion_ready,
        confidence_scores,
        coalesce((${confidence_sql}), null) as confidence,
        ${candidate_type_sql} as candidate_type,
        extraction_timestamp,
        extraction_version,
        program_id,
        content_hash
       from public.registry_entity_extraction_v4
      order by extraction_timestamp desc nulls last, content_hash desc nulls last
      limit $1`,
    [limit],
  );

  return {
    success: true,
    table: "public.registry_entity_extraction_v4",
    canonical_promotion_enabled: false,
    total_candidate_count: Number((await pool.query(`select coalesce(reltuples, 0)::bigint as total from pg_class where oid = 'public.registry_entity_extraction_v4'::regclass`)).rows[0]?.total ?? 0),
    candidate_type_breakdown: [],
    recent_candidates: recent_result.rows.map((row: any) => ({
      source_file: row.source_file ?? null,
      jurisdiction: row.jurisdiction ?? null,
      name: row.name ?? null,
      confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
      promotion_ready: row.promotion_ready ?? null,
      candidate_type: row.candidate_type ?? "unknown",
      extraction_timestamp: row.extraction_timestamp ? String(row.extraction_timestamp) : null,
      extraction_version: row.extraction_version ?? null,
      program_id: row.program_id ?? null,
      content_hash: row.content_hash ?? null,
    })),
  };
}

function is_protected_document_family(document_family: string) {
  return ["federal", "national", "tribal", "protected_source"].includes(document_family);
}

function dry_run_lane_for_candidate(candidate: any) {
  const document_family = candidate.document_family || "unclassified";
  const promotion_lane = candidate.promotion_lane || "unclassified";
  const candidate_type = String(candidate.candidate_type || "unknown").toLowerCase();
  const protected_material = document_family === "tribal" || candidate_type.includes("tribal") || candidate_type.includes("recognition");
  if (protected_material && promotion_lane === "resource_lane") return "hold_review_lane";
  if (promotion_lane === "unclassified") return "hold_review_lane";
  return promotion_lane;
}

function verify_registry_candidate(candidate: any) {
  const blocked_reasons: string[] = [];
  const document_family = candidate.document_family || "unclassified";
  const promotion_lane = candidate.promotion_lane || "unclassified";
  const candidate_type = String(candidate.candidate_type || "unknown").toLowerCase();
  const protected_material = document_family === "tribal" || candidate_type.includes("tribal") || candidate_type.includes("recognition");
  if (!candidate.name) blocked_reasons.push("name_required");
  if (!candidate.source_file) blocked_reasons.push("source_file_required");
  if (candidate.confidence !== null && candidate.confidence !== undefined && Number(candidate.confidence) < 0.6) blocked_reasons.push("confidence_below_threshold");
  if (!candidate.jurisdiction && !is_protected_document_family(document_family)) blocked_reasons.push("jurisdiction_required");
  if (!candidate.source_citation) blocked_reasons.push("source_provenance_required");
  if (promotion_lane === "unclassified") blocked_reasons.push("promotion_lane_unclassified");
  if (protected_material && promotion_lane === "resource_lane") blocked_reasons.push("protected_material_wrong_lane");
  const verification_lane = dry_run_lane_for_candidate(candidate);
  return { verified: blocked_reasons.length === 0, blocked_reasons, verification_lane };
}

export async function verify_registry_entity_candidates_dry_run(input: registry_candidate_filter_input) {
  const pool = getPool();
  const columns = await registry_candidate_columns();
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  const candidate_type_sql = registry_candidate_type_expression(columns);
  const document_family_sql = registry_document_family_expression(columns);
  const promotion_lane_sql = registry_promotion_lane_expression(columns);
  const confidence_sql = registry_confidence_expression(columns);
  const source_citation_sql = registry_source_citation_expression(columns);
  const { where_sql, params } = registry_filter_sql(input, columns);
  const limit_param = params.length + 1;
  const result = await pool.query(
    `select
        source_file,
        jurisdiction,
        name,
        promotion_ready,
        ${candidate_type_sql} as candidate_type,
        ${document_family_sql} as document_family,
        ${promotion_lane_sql} as promotion_lane,
        coalesce((${confidence_sql}), null) as confidence,
        nullif(${source_citation_sql}, '') as source_citation,
        extraction_timestamp,
        program_id,
        content_hash
       from public.registry_entity_extraction_v4
       ${where_sql}
      order by extraction_timestamp desc nulls last, content_hash desc nulls last
      limit $${limit_param}`,
    [...params, limit],
  );
  const lane_counts: Record<string, number> = {};
  const blocked_reasons: Record<string, number> = {};
  const sample_verified: any[] = [];
  const sample_blocked: any[] = [];
  let verified_count = 0;
  let blocked_count = 0;
  for (const row of result.rows) {
    const verification = verify_registry_candidate(row);
    lane_counts[verification.verification_lane] = (lane_counts[verification.verification_lane] ?? 0) + 1;
    for (const reason of verification.blocked_reasons) blocked_reasons[reason] = (blocked_reasons[reason] ?? 0) + 1;
    const sample = { source_file: row.source_file ?? null, jurisdiction: row.jurisdiction ?? null, name: row.name ?? null, candidate_type: row.candidate_type ?? "unknown", document_family: row.document_family ?? "unclassified", promotion_lane: row.promotion_lane ?? "unclassified", verification_lane: verification.verification_lane, confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence), blocked_reasons: verification.blocked_reasons };
    if (verification.verified) {
      verified_count += 1;
      if (sample_verified.length < 10) sample_verified.push(sample);
    } else {
      blocked_count += 1;
      if (sample_blocked.length < 10) sample_blocked.push(sample);
    }
  }
  return { success: true, dry_run: true, processed_count: result.rows.length, verified_count, blocked_count, lane_counts, blocked_reasons, sample_verified, sample_blocked };
}

export async function set_corpus_import_queue_target_hint(input: { id: number; target_hint: TargetHintValue }) {
  const pool = getPool();
  if (!allowed_target_hints.includes(input.target_hint)) {
    return { success: false, row: null, error: "target_hint_not_allowed" };
  }

  const result = await pool.query(
    `update public.corpus_import_queue
       set target_hint = $2,
           updated_at = now()
     where id = $1
     returning
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
       coalesce(normalized_text_chars, char_length(normalized_text), 0) as normalized_text_chars,
       payload is not null as has_payload`,
    [input.id, input.target_hint],
  );

  const row = result.rows[0];
  if (!row) {
    return { success: false, row: null, error: "corpus_import_queue_row_not_found" };
  }

  return { success: true, row: map_queue_row(row) };
}

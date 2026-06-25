import { createHash, randomUUID } from "node:crypto";
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
        nullif(${registry_source_citation_expression(columns)}, '') as source_citation,
        ${candidate_type_sql} as candidate_type,
        extraction_timestamp,
        extraction_version,
        program_id,
        content_hash,
        normalized_excerpt,
        section_index
       from public.registry_entity_extraction_v4
      order by extraction_timestamp desc nulls last, content_hash desc nulls last
      limit $1`,
    [limit],
  );

  return {
    success: true,
    table: "public.registry_entity_extraction_v4",
    canonical_promotion_enabled: process.env.ENABLE_CANONICAL_PROMOTION_FOR_STATE_ENRICHED_REGISTRY_DOCX_REVIEW === "true",
    total_candidate_count: Number((await pool.query(`select coalesce(reltuples, 0)::bigint as total from pg_class where oid = 'public.registry_entity_extraction_v4'::regclass`)).rows[0]?.total ?? 0),
    candidate_type_breakdown: [],
    recent_candidates: recent_result.rows.map((row: any) => ({
      source_file: row.source_file ?? null,
      jurisdiction: row.jurisdiction ?? null,
      name: row.name ?? null,
      confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
      promotion_ready: row.promotion_ready ?? null,
      confidence_scores: row.confidence_scores ?? null,
      candidate_type: row.candidate_type ?? "unknown",
      extraction_timestamp: row.extraction_timestamp ? String(row.extraction_timestamp) : null,
      extraction_version: row.extraction_version ?? null,
      program_id: row.program_id ?? null,
      content_hash: row.content_hash ?? null,
      source_citation: row.source_citation ?? null,
      section_index: row.section_index ?? null,
      normalized_excerpt: row.normalized_excerpt ?? null,
    })),
  };
}

function is_protected_document_family(document_family: string) {
  return ["federal", "national", "tribal", "protected_source"].includes(document_family);
}

function dry_run_lane_for_candidate(candidate: any) {
  const promotion_lane = candidate.promotion_lane || "unclassified";
  if (promotion_lane === "unclassified") return "hold_review_lane";
  return promotion_lane;
}

function verify_registry_candidate(candidate: any) {
  const blocked_reasons: string[] = [];
  const document_family = candidate.document_family || "unclassified";
  const promotion_lane = candidate.promotion_lane || "unclassified";
  if (!candidate.name) blocked_reasons.push("name_required");
  if (!candidate.source_file) blocked_reasons.push("source_file_required");
  if (candidate.confidence !== null && candidate.confidence !== undefined && Number(candidate.confidence) < 0.6) blocked_reasons.push("confidence_below_threshold");
  if (!candidate.jurisdiction && !is_protected_document_family(document_family)) blocked_reasons.push("jurisdiction_required");
  if (!candidate.source_citation) blocked_reasons.push("source_provenance_required");
  if (promotion_lane === "unclassified") blocked_reasons.push("promotion_lane_unclassified");
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


type promote_registry_entity_candidates_apply_input = registry_candidate_filter_input & {
  target_hint?: string | null;
  dry_run?: boolean;
};

const CANONICAL_PROMOTION_TARGET_HINT = "state_enriched_registry_docx_review";
const CANONICAL_PROMOTION_FLAG = "ENABLE_CANONICAL_PROMOTION_FOR_STATE_ENRICHED_REGISTRY_DOCX_REVIEW";

async function table_columns(client: any, table_name: string) {
  const result = await client.query(
    `select column_name
       from information_schema.columns
      where table_schema = 'public'
        and table_name = $1`,
    [table_name],
  );
  return new Set(result.rows.map((row: any) => row.column_name));
}

function required_columns_present(columns: Set<string>, required_columns: string[]) {
  return required_columns.every((column_name) => columns.has(column_name));
}

function promotion_feature_flag_enabled() {
  return process.env[CANONICAL_PROMOTION_FLAG] === "true";
}

function candidate_payload_from_row(row: any) {
  return row.candidate_payload ?? row.raw_candidate_payload ?? row.payload ?? row.promotion_ready ?? {};
}

function candidate_source_queue_id(row: any) {
  const payload = candidate_payload_from_row(row);
  const provenance = row.forensic_provenance ?? {};
  const value = row.source_queue_id ?? row.corpus_import_queue_id ?? payload?.source_queue_id ?? provenance?.source_queue_id ?? null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function candidate_contact_values(row: any) {
  const payload = candidate_payload_from_row(row);
  const extracted = payload?.extracted ?? {};
  return {
    phones: Array.isArray(extracted.phones) ? extracted.phones.filter(Boolean) : [],
    emails: Array.isArray(extracted.emails) ? extracted.emails.filter(Boolean) : [],
    urls: Array.isArray(extracted.urls) ? extracted.urls.filter(Boolean) : [],
  };
}

function canonical_dedupe_key(row: any) {
  return sha256([row.candidate_type ?? "unknown", row.jurisdiction ?? "", row.name ?? "", row.content_hash ?? ""].join("|"));
}

function text_or_null(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function candidate_material_text(candidate: any) {
  const payload = candidate_payload_from_row(candidate);
  return [
    candidate.candidate_type,
    candidate.document_family,
    candidate.promotion_lane,
    candidate.source_file,
    candidate.source_citation,
    candidate.name,
    candidate.normalized_excerpt,
    payload?.resource_type,
    payload?.description,
    payload?.eligibility_summary,
    payload?.normalized_excerpt,
    payload?.source_name,
    candidate.forensic_provenance?.source_file,
    candidate.forensic_provenance?.source_url,
  ].filter(Boolean).join(" ").toLowerCase();
}

function candidate_has_source_backing(candidate: any) {
  const payload = candidate_payload_from_row(candidate);
  return Boolean(candidate.source_citation || candidate.source_file || candidate.content_hash || payload?.source_name || payload?.storage_path || candidate.forensic_provenance?.source_file || candidate.forensic_provenance?.source_url);
}

function classify_candidate_material_scope(candidate: any) {
  const text = candidate_material_text(candidate);
  const candidate_type = String(candidate.candidate_type || "unknown").toLowerCase();
  const source_backed = candidate_has_source_backing(candidate);
  if (/recognition|federal acknowledgment|acknowledgement|tribal card|enrollment|sovereignty status|status packet|governance packet|recognition packet/.test(text)) return "recognition_sensitive_material";
  if (/ceremon|sacred|cultural property|language material|oral history|identity record|internal communit|tribe-specific history|private cultural|own words|traditional knowledge/.test(text)) return "tribe_specific_private_or_cultural_material";
  if (!source_backed) return "unclear_source_or_unverified_material";
  if (candidate_type === "statute" || /\b(statute|regulation|ordinance|code section|public rule|court authority|public legal authority|federal indian law|state-tribal consultation|bia rule|ihs regulation|u\.s\.c\.|c\.f\.r\.|§)\b/.test(text)) return "official_public_law_or_authority";
  if (/\b(bia|ihs|agency|department|benefit|health service|legal aid|tribal liaison|court resource|nonprofit|public program|hotline|resource|assistance|snap|medicaid|tanf|ssi|contact|website|public service)\b/.test(text)) return "public_service_or_agency_resource";
  if (["benefit_program", "agency", "legal_aid", "court", "contact", "resource"].includes(candidate_type)) return "public_service_or_agency_resource";
  return "unclear_source_or_unverified_material";
}

function hold_reason_for_material_scope(material_scope: string) {
  if (material_scope === "tribe_specific_private_or_cultural_material") return "tribe_specific_material_hold_review";
  if (material_scope === "recognition_sensitive_material") return "recognition_sensitive_material_hold_review";
  if (material_scope === "unclear_source_or_unverified_material") return "unclear_source_or_unverified_material_hold_review";
  return null;
}

function candidate_is_resource_like(candidate: any) {
  const candidate_type = String(candidate.candidate_type || "unknown").toLowerCase();
  return ["benefit_program", "agency", "legal_aid", "court", "contact", "resource"].includes(candidate_type);
}


async function existing_resource_entity(client: any, row: any) {
  const source_pk = row.content_hash ?? row.program_id ?? null;
  if (!source_pk) return null;
  const result = await client.query(
    `select *
       from public.luminari_resource_entities
      where (source_table = 'registry_entity_extraction_v4' and source_pk = $1)
         or canonical_id = $2
      order by resource_entity_id
      limit 1`,
    [source_pk, `registry_entity_extraction_v4:${source_pk}`],
  );
  return result.rows[0] ?? null;
}

function blank_update_fields(existing_row: any, candidate_row: any, columns: Set<string>) {
  const updates: Record<string, unknown> = {};
  const candidate_payload = candidate_payload_from_row(candidate_row);
  const description = text_or_null(candidate_payload.description) ?? text_or_null(candidate_payload.normalized_excerpt) ?? text_or_null(candidate_row.normalized_excerpt);
  const eligibility_summary = text_or_null(candidate_payload.eligibility_summary);
  for (const [column_name, value] of Object.entries({ description, eligibility_summary, jurisdiction: candidate_row.jurisdiction })) {
    if (columns.has(column_name) && value && !text_or_null(existing_row[column_name])) updates[column_name] = value;
  }
  return updates;
}

async function insert_accounting_row(client: any, row: Record<string, unknown>) {
  await client.query(
    `insert into public.conveyor_promotion_accounting
       (run_id, lane, action_type, is_dry_run, source_record_id, canonical_record_id, bridge_record_id, status, reason, dedupe_key, metadata)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
    [row.run_id, row.lane, row.action_type, row.is_dry_run, row.source_record_id, row.canonical_record_id, row.bridge_record_id, row.status, row.reason, row.dedupe_key, JSON.stringify(row.metadata ?? {})],
  );
}

async function insert_conveyor_run_row(client: any, input: Record<string, unknown>) {
  await client.query(
    `insert into public.conveyor_runs
       (run_id, lane, action_type, is_dry_run, status, candidate_count, passed_count, failed_count, promoted_count, skipped_duplicate_count, bridged_count, metadata)
     values ($1,$2,'registry_entity_candidates_promote_apply',$3,'started',0,0,0,0,0,0,$4::jsonb)`,
    [input.run_id, input.lane, input.is_dry_run, JSON.stringify(input.metadata ?? {})],
  );
}

async function update_conveyor_run_row(client: any, input: Record<string, unknown>) {
  await client.query(
    `update public.conveyor_runs
        set status = 'completed',
            candidate_count = $2,
            passed_count = $3,
            failed_count = $4,
            promoted_count = $5,
            skipped_duplicate_count = $6,
            bridged_count = $7,
            finished_at = now(),
            metadata = coalesce(metadata, '{}'::jsonb) || $8::jsonb
      where run_id = $1`,
    [input.run_id, input.candidate_count, input.passed_count, input.failed_count, input.promoted_count, input.skipped_duplicate_count, input.bridged_count, JSON.stringify(input.metadata ?? {})],
  );
}


async function write_canonical_candidate(client: any, row: any, entity_columns: Set<string>, location_columns: Set<string>, contact_columns: Set<string>) {
  const existing_row = await existing_resource_entity(client, row);
  const source_pk = row.content_hash ?? row.program_id;
  const candidate_payload = candidate_payload_from_row(row);
  if (existing_row) {
    const updates = blank_update_fields(existing_row, row, entity_columns);
    if (!Object.keys(updates).length) return { action_type: "would_skip_duplicate", canonical_record_id: String(existing_row.resource_entity_id ?? existing_row.canonical_id ?? source_pk), bridge_record_id: null };
    const names = Object.keys(updates);
    await client.query(
      `update public.luminari_resource_entities set ${names.map((name, index) => `${name} = $${index + 2}`).join(", ")} where resource_entity_id = $1`,
      [existing_row.resource_entity_id, ...names.map((name) => updates[name])],
    );
    return { action_type: "would_update_blank_fields", canonical_record_id: String(existing_row.resource_entity_id ?? existing_row.canonical_id ?? source_pk), bridge_record_id: null };
  }
  const insertable: Record<string, unknown> = {
    canonical_id: `registry_entity_extraction_v4:${source_pk}`,
    source_family_key: "state_enriched_registry_docx_review",
    source_table: "registry_entity_extraction_v4",
    source_pk,
    source_hash: row.content_hash,
    resource_name: row.name,
    resource_type: row.candidate_type ?? "benefit_program",
    resource_category: row.candidate_type ?? "benefit_program",
    layer: "registry_resource",
    jurisdiction: row.jurisdiction,
    jurisdiction_scope: "state",
    description: text_or_null(candidate_payload.normalized_excerpt) ?? text_or_null(row.normalized_excerpt),
    eligibility_summary: text_or_null(candidate_payload.eligibility_summary),
    domains: [],
    metadata: { source: "registry_entity_extraction_v4", candidate_payload, forensic_provenance: row.forensic_provenance ?? {}, content_hash: row.content_hash, dedupe_behavior: "enrich_blank_fields_only" },
    verification_status: "source_attached",
    promotion_status: "review_ready",
    provenance_status: "candidate_provenance_attached",
  };
  const names = Object.keys(insertable).filter((name) => entity_columns.has(name) && insertable[name] !== undefined);
  const placeholders = names.map((name, index) => Array.isArray(insertable[name]) || (typeof insertable[name] === "object" && insertable[name] !== null) ? `$${index + 1}::jsonb` : `$${index + 1}`);
  const inserted = await client.query(`insert into public.luminari_resource_entities (${names.join(", ")}) values (${placeholders.join(", ")}) returning resource_entity_id, canonical_id`, names.map((name) => Array.isArray(insertable[name]) || (typeof insertable[name] === "object" && insertable[name] !== null) ? JSON.stringify(insertable[name]) : insertable[name]));
  const canonical_record_id = String(inserted.rows[0]?.resource_entity_id ?? inserted.rows[0]?.canonical_id ?? source_pk);
  const contacts = candidate_contact_values(row);
  const contact_values = [...contacts.phones.map((value: string) => ["phone", value]), ...contacts.emails.map((value: string) => ["email", value]), ...contacts.urls.map((value: string) => ["url", value])];
  if (contact_values.length && required_columns_present(contact_columns, ["resource_entity_id", "canonical_id", "contact_type", "contact_value", "label", "is_primary", "contact_quality", "source_table", "source_pk", "source_hash", "metadata"])) {
    for (const [contact_type, contact_value] of contact_values.slice(0, 10)) {
      await client.query(`insert into public.luminari_resource_contact_points (resource_entity_id, canonical_id, contact_type, contact_value, label, is_primary, contact_quality, source_table, source_pk, source_hash, metadata) values ($1,$2,$3,$4,$3,false,'candidate_extracted','registry_entity_extraction_v4',$5,$6,$7::jsonb) on conflict do nothing`, [inserted.rows[0]?.resource_entity_id, inserted.rows[0]?.canonical_id, contact_type, contact_value, source_pk, row.content_hash, JSON.stringify({ source: "registry_entity_extraction_v4", content_hash: row.content_hash })]);
    }
  }
  void location_columns;
  return { action_type: "would_insert", canonical_record_id, bridge_record_id: null };
}

export async function promote_registry_entity_candidates_apply(input: promote_registry_entity_candidates_apply_input = {}) {
  const dry_run = input.dry_run !== false;
  const target_hint = input.target_hint ?? CANONICAL_PROMOTION_TARGET_HINT;
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);
  const run_id = randomUUID();
  const feature_flag_enabled = promotion_feature_flag_enabled();
  const results: any[] = [];
  if (target_hint !== CANONICAL_PROMOTION_TARGET_HINT) return { success: false, dry_run, canonical_promotion_enabled: feature_flag_enabled, feature_flag_enabled, target_hint, processed_count: 0, error: "unsupported_promotion_lane", run_id, results };
  if (!dry_run && !feature_flag_enabled) return { success: false, dry_run, canonical_promotion_enabled: false, feature_flag_enabled, target_hint, processed_count: 0, error: "canonical_promotion_feature_flag_disabled", run_id, results };
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const entity_columns = await table_columns(client, "luminari_resource_entities");
    const location_columns = await table_columns(client, "luminari_resource_locations");
    const contact_columns = await table_columns(client, "luminari_resource_contact_points");
    const accounting_columns = await table_columns(client, "conveyor_promotion_accounting");
    const run_columns = await table_columns(client, "conveyor_runs");
    if (!required_columns_present(run_columns, ["run_id", "lane", "action_type", "is_dry_run", "status", "candidate_count", "passed_count", "failed_count", "promoted_count", "skipped_duplicate_count", "bridged_count", "finished_at", "metadata"])) {
      await client.query("rollback");
      return { success: false, dry_run, canonical_promotion_enabled: feature_flag_enabled, feature_flag_enabled, target_hint, processed_count: 0, error: "no_safe_conveyor_run_target", run_id, results };
    }
    if (!required_columns_present(entity_columns, ["source_table", "source_pk", "resource_name", "metadata"]) || !required_columns_present(accounting_columns, ["run_id", "lane", "action_type", "is_dry_run", "source_record_id", "status", "metadata"])) {
      await client.query("rollback");
      return { success: false, dry_run, canonical_promotion_enabled: feature_flag_enabled, feature_flag_enabled, target_hint, processed_count: 0, error: "no_safe_canonical_target", run_id, results };
    }
    await insert_conveyor_run_row(client, {
      run_id,
      lane: target_hint,
      is_dry_run: dry_run,
      metadata: { target_hint, feature_flag_enabled, canonical_promotion_enabled: feature_flag_enabled, limit, candidate_type: input.candidate_type ?? null, promotion_lane: input.promotion_lane ?? target_hint },
    });
    const columns = await registry_candidate_columns();
    const candidate_type_sql = registry_candidate_type_expression(columns);
    const document_family_sql = registry_document_family_expression(columns);
    const promotion_lane_sql = registry_promotion_lane_expression(columns);
    const confidence_sql = registry_confidence_expression(columns);
    const source_citation_sql = registry_source_citation_expression(columns);
    const candidate_type_filter = input.candidate_type ? "and candidate_type = $2" : "";
    const source_queue_parts = [];
    if (columns.source_queue_id) source_queue_parts.push("c.source_queue_id");
    if (columns.corpus_import_queue_id) source_queue_parts.push("c.corpus_import_queue_id");
    for (const json_source of ["payload", "raw_candidate_payload", "candidate_payload", "forensic_provenance"].filter((name) => columns[name])) source_queue_parts.push(`nullif(c.${json_source}->>'source_queue_id','')::bigint`);
    const source_queue_sql = source_queue_parts.length ? `coalesce(${source_queue_parts.join(", ")})` : "null::bigint";
    const rows = await client.query(
      `with candidates as (
         select c.*, ${candidate_type_sql} as candidate_type, ${document_family_sql} as document_family, ${promotion_lane_sql} as promotion_lane, coalesce((${confidence_sql}), null) as confidence, nullif(${source_citation_sql}, '') as source_citation,
                ${source_queue_sql} as resolved_source_queue_id
           from public.registry_entity_extraction_v4 c
       )
       select candidates.*, q.id as source_queue_id, q.source_name as queue_source_name, q.storage_path as queue_storage_path, q.target_hint
         from candidates
         join public.corpus_import_queue q on q.id = candidates.resolved_source_queue_id
        where q.target_hint = $1
          and q.import_status = 'candidates_created'
          ${candidate_type_filter}
        order by candidates.extraction_timestamp desc nulls last, candidates.content_hash desc nulls last
        limit $${input.candidate_type ? 3 : 2}`,
      input.candidate_type ? [target_hint, input.candidate_type, limit] : [target_hint, limit],
    );
    for (const row of rows.rows) {
      const verification_input = { ...row, promotion_lane: row.promotion_lane === "unclassified" ? "state_enriched_registry_docx_review" : row.promotion_lane, source_citation: row.source_citation ?? row.queue_storage_path ?? row.queue_source_name };
      const verification = verify_registry_candidate(verification_input);
      const material_scope = classify_candidate_material_scope(verification_input);
      const material_hold_reason = hold_reason_for_material_scope(material_scope);
      const dedupe_key = canonical_dedupe_key(row);
      let action_type = "blocked";
      let status = "blocked";
      let reason = verification.blocked_reasons.join(",") || null;
      let canonical_record_id = null;
      let bridge_record_id = null;
      try {
        if (verification.verified && material_hold_reason) {
          action_type = material_hold_reason;
          status = "held_review";
          reason = material_hold_reason;
        } else if (verification.verified && material_scope === "official_public_law_or_authority" && !candidate_is_resource_like(row)) {
          action_type = "no_safe_legal_authority_target";
          status = "held_review";
          reason = "no_safe_legal_authority_target";
        } else if (verification.verified) {
          const existing_row = await existing_resource_entity(client, row);
          if (existing_row) {
            const updates = blank_update_fields(existing_row, row, entity_columns);
            action_type = Object.keys(updates).length ? "would_update_blank_fields" : "would_skip_duplicate";
          } else action_type = "would_insert";
          status = dry_run ? "validated_dry_run" : "applied";
          if (!dry_run && action_type !== "would_skip_duplicate") {
            const write_result = await write_canonical_candidate(client, row, entity_columns, location_columns, contact_columns);
            action_type = write_result.action_type;
            canonical_record_id = write_result.canonical_record_id;
            bridge_record_id = write_result.bridge_record_id;
          } else if (existing_row) canonical_record_id = String(existing_row.resource_entity_id ?? existing_row.canonical_id ?? "");
        }
      } catch (error: any) {
        action_type = "error";
        status = "error";
        reason = error?.message ?? String(error);
      }
      const metadata = { source_queue_id: candidate_source_queue_id(row), source_file: row.queue_source_name ?? row.source_file ?? null, storage_path: row.queue_storage_path ?? row.storage_path ?? null, content_hash: row.content_hash ?? null, candidate_type: row.candidate_type ?? null, target_hint, dedupe_behavior: "enrich_blank_fields_only", verification_lane: verification.verification_lane, blocked_reasons: verification.blocked_reasons, material_scope, candidate_payload: candidate_payload_from_row(row), forensic_provenance: row.forensic_provenance ?? {} };
      await insert_accounting_row(client, { run_id, lane: target_hint, action_type, is_dry_run: dry_run, source_record_id: row.content_hash ?? row.program_id, canonical_record_id, bridge_record_id, status, reason, dedupe_key, metadata });
      results.push({ source_record_id: row.content_hash ?? row.program_id, canonical_record_id, bridge_record_id, action_type, status, reason, dedupe_key, blocked_reasons: verification.blocked_reasons, candidate_type: row.candidate_type ?? null, source_queue_id: metadata.source_queue_id, material_scope });
    }
    const count = (name: string) => results.filter((row) => row.action_type === name).length;
    const held_count = results.filter((row) => row.status === "held_review").length;
    const would_insert_count = count("would_insert");
    const would_update_blank_fields_count = count("would_update_blank_fields");
    const skipped_count = count("would_skip_duplicate");
    const blocked_count = count("blocked") + held_count;
    const error_count = count("error");
    const promoted_count = dry_run ? 0 : would_insert_count + would_update_blank_fields_count;
    const bridged_count = results.filter((row) => row.bridge_record_id).length;
    await update_conveyor_run_row(client, {
      run_id,
      candidate_count: results.length,
      passed_count: would_insert_count + would_update_blank_fields_count + skipped_count,
      failed_count: blocked_count + error_count,
      promoted_count,
      skipped_duplicate_count: skipped_count,
      bridged_count,
      metadata: { processed_count: results.length, would_insert_count, would_update_blank_fields_count, skipped_count, blocked_count, error_count, promoted_count, bridged_count },
    });
    await client.query("commit");
    return { success: true, dry_run, canonical_promotion_enabled: feature_flag_enabled, feature_flag_enabled, target_hint, processed_count: results.length, would_insert_count, would_update_blank_fields_count, skipped_count, blocked_count, error_count, run_id, results };
  } catch (error: any) {
    try { await client.query("rollback"); } catch {}
    return { success: false, dry_run, canonical_promotion_enabled: feature_flag_enabled, feature_flag_enabled, target_hint, processed_count: results.length, would_insert_count: 0, would_update_blank_fields_count: 0, skipped_count: 0, blocked_count: results.filter((row) => row.action_type === "blocked").length, error_count: results.filter((row) => row.action_type === "error").length + 1, run_id, error: "canonical_promotion_apply_failed", message: error?.message ?? String(error), results };
  } finally {
    client.release();
  }
}


type promote_selected_registry_candidate_input = {
  candidate_row_id?: string | number | null;
  source_record_id?: string | null;
  content_hash?: string | null;
  target_table?: string | null;
  operator_verified?: boolean;
  operator_decision?: "promote" | "reject" | "needs_fix";
  edited_fields?: Record<string, unknown> | null;
  operator_note?: string | null;
  operator_context?: Record<string, unknown> | null;
};

function text_value(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function uuid_or_null(value: unknown) {
  const text = text_value(value);
  return text && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function edited_text(edited_fields: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = text_value(edited_fields[key]);
    if (value) return value;
  }
  return null;
}

function candidate_text(row: any, keys: string[]) {
  const payload = candidate_payload_from_row(row);
  for (const key of keys) {
    const value = text_value(row[key]) ?? text_value(payload?.[key]) ?? text_value(payload?.extracted?.[key]);
    if (value) return value;
  }
  return null;
}

function selected_candidate_name(row: any, edited_fields: Record<string, unknown>) {
  return edited_text(edited_fields, ["name", "program_name", "entity_name"]) ?? candidate_text(row, ["name", "program_name", "entity_name"]);
}

function selected_candidate_target_table(row: any, requested_target_table?: string | null) {
  const promotion_ready = row.promotion_ready ?? {};
  const value = text_value(requested_target_table) ?? text_value(promotion_ready.target_table) ?? text_value(promotion_ready.write_target_table) ?? null;
  return value === "public.registry_programs" ? "registry_programs" : value;
}

function selected_candidate_result_base(row: any, input: promote_selected_registry_candidate_input, target_table: string | null, run_id: string) {
  const edited_fields = input.edited_fields && typeof input.edited_fields === "object" && !Array.isArray(input.edited_fields) ? input.edited_fields : {};
  const confidence = row.confidence === null || row.confidence === undefined ? null : Number(row.confidence);
  return {
    candidate_row_id: row.candidate_row_id ?? null,
    source_record_id: row.content_hash ?? row.program_id ?? input.source_record_id ?? null,
    candidate_name: selected_candidate_name(row, edited_fields),
    candidate_type: row.candidate_type ?? "unknown",
    intended_target_table: target_table,
    write_target_table: null as string | null,
    write_adapter_status: "not_started",
    promoted_record_id: null as string | null,
    decision: input.operator_decision ?? "needs_fix",
    reason: null as string | null,
    reason_detail: null as string | null,
    confidence,
    confidence_threshold: 0.6,
    confidence_scores: row.confidence_scores ?? null,
    promotion_ready: row.promotion_ready ?? null,
    source_file: row.source_file ?? null,
    source_citation: row.source_citation ?? null,
    jurisdiction: row.jurisdiction ?? null,
    section_index: row.section_index ?? null,
    source_text_hash: row.content_hash ?? row.forensic_hash ?? null,
    edited_fields,
    accounting_run_id: run_id,
    accounting_status: "not_written",
  };
}

function registry_program_field_values(row: any, edited_fields: Record<string, unknown>, target_table: string) {
  const name = selected_candidate_name(row, edited_fields);
  const category = edited_text(edited_fields, ["category", "candidate_type", "service_type"]) ?? candidate_text(row, ["category", "candidate_type", "service_type"]);
  const agency = edited_text(edited_fields, ["agency"]) ?? candidate_text(row, ["agency"]);
  const eligibility = edited_text(edited_fields, ["eligibility", "purpose", "description"]) ?? candidate_text(row, ["eligibility", "purpose", "description", "normalized_excerpt"]);
  const contact = edited_text(edited_fields, ["contact", "contact_raw_text"]) ?? candidate_text(row, ["contact", "contact_raw_text"]);
  const website = edited_text(edited_fields, ["website", "url", "portal"]) ?? candidate_text(row, ["website", "url", "portal"]);
  const source_citation = text_value(row.source_citation) ?? text_value(row.queue_storage_path) ?? text_value(row.source_file);
  const source_hash = text_value(row.content_hash) ?? text_value(row.program_id) ?? "unknown_source";
  const normalized_name = (name ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  const fingerprint = createHash("sha256").update([target_table, source_hash, normalized_name, source_citation ?? ""].join("|")).digest("hex");
  return { name, category, agency, eligibility, contact, contact_raw_text: contact, website, contact_website_norm: website, source_citation, fingerprint };
}

async function find_existing_registry_program(client: any, columns: Set<string>, values: Record<string, unknown>) {
  if (columns.has("fingerprint") && values.fingerprint) {
    const result = await client.query(`select * from public.registry_programs where fingerprint = $1 limit 1`, [values.fingerprint]);
    if (result.rows[0]) return result.rows[0];
  }
  if (columns.has("name") && values.name) {
    const result = await client.query(`select * from public.registry_programs where lower(name) = lower($1) limit 1`, [values.name]);
    if (result.rows[0]) return result.rows[0];
  }
  return null;
}

async function write_registry_program_selected_candidate(client: any, row: any, result: any) {
  const columns = await table_columns(client, "registry_programs");
  if (!columns.has("name")) return { ...result, decision: "held_review", reason: "no_safe_target_table_adapter", reason_detail: "registry_programs_name_column_missing", write_adapter_status: "blocked" };
  const values = registry_program_field_values(row, result.edited_fields, "registry_programs");
  if (!values.name) return { ...result, decision: "needs_fix", reason: "name_required", reason_detail: "usable_name_or_program_name_required", write_adapter_status: "needs_fix" };
  if (columns.has("jurisdiction_id") && !columns.has("jurisdiction")) {
    const nullable_result = await client.query(`select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'registry_programs' and column_name = 'jurisdiction_id' limit 1`);
    if (nullable_result.rows[0]?.is_nullable === "NO") return { ...result, decision: "held_review", reason: "jurisdiction_id_required", reason_detail: "jurisdiction_id_required_and_not_safely_resolved", write_adapter_status: "blocked" };
  }
  const existing_row = await find_existing_registry_program(client, columns, values);
  const writable: Record<string, unknown> = {
    name: values.name,
    category: values.category,
    agency: values.agency,
    eligibility: values.eligibility,
    apply_notes: values.eligibility,
    contact: values.contact,
    contact_raw_text: values.contact_raw_text,
    website: values.website,
    contact_website_norm: values.contact_website_norm,
    fingerprint: values.fingerprint,
    source_citation: values.source_citation,
    source_file: row.source_file ?? null,
    source_text_hash: row.content_hash ?? row.forensic_hash ?? null,
    jurisdiction: row.jurisdiction ?? null,
    metadata: { source: "registry_entity_extraction_v4", content_hash: row.content_hash ?? null, program_id: row.program_id ?? null, promotion_ready: row.promotion_ready ?? null, edited_fields: result.edited_fields },
  };
  const overwrite_confirmed = result.edited_fields.overwrite_confirmed === true;
  if (existing_row) {
    const updates: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(writable)) {
      if (!columns.has(name) || value === null || value === undefined) continue;
      if (overwrite_confirmed || !text_value(existing_row[name])) updates[name] = value;
    }
    delete updates.metadata;
    if (!Object.keys(updates).length) return { ...result, decision: "promote", reason: "would_skip_duplicate", reason_detail: "existing_record_has_no_blank_fields", write_target_table: "registry_programs", write_adapter_status: "skipped_duplicate", promoted_record_id: String(existing_row.id ?? existing_row.registry_program_id ?? existing_row.program_id ?? values.fingerprint) };
    const names = Object.keys(updates);
    await client.query(`update public.registry_programs set ${names.map((name, index) => `${name} = $${index + 2}`).join(", ")} where ${existing_row.id !== undefined ? "id" : columns.has("registry_program_id") ? "registry_program_id" : "fingerprint"} = $1`, [existing_row.id ?? existing_row.registry_program_id ?? existing_row.fingerprint, ...names.map((name) => updates[name])]);
    return { ...result, decision: "promote", reason: "updated_blank_fields", reason_detail: "enrich_blank_fields_only", write_target_table: "registry_programs", write_adapter_status: "updated_blank_fields", promoted_record_id: String(existing_row.id ?? existing_row.registry_program_id ?? existing_row.program_id ?? values.fingerprint) };
  }
  const names = Object.keys(writable).filter((name) => columns.has(name) && writable[name] !== null && writable[name] !== undefined);
  const placeholders = names.map((name, index) => typeof writable[name] === "object" ? `$${index + 1}::jsonb` : `$${index + 1}`);
  const return_column = columns.has("id") ? "id" : columns.has("registry_program_id") ? "registry_program_id" : columns.has("program_id") ? "program_id" : null;
  const inserted = await client.query(`insert into public.registry_programs (${names.join(", ")}) values (${placeholders.join(", ")}) ${return_column ? `returning ${return_column} as promoted_record_id` : "returning fingerprint as promoted_record_id"}`, names.map((name) => typeof writable[name] === "object" ? JSON.stringify(writable[name]) : writable[name]));
  return { ...result, decision: "promote", reason: "inserted", reason_detail: "operator_verified_registry_program_insert", write_target_table: "registry_programs", write_adapter_status: "inserted", promoted_record_id: String(inserted.rows[0]?.promoted_record_id ?? values.fingerprint) };
}

async function load_selected_registry_candidate(client: any, input: promote_selected_registry_candidate_input) {
  const columns = await table_columns(client, "registry_entity_extraction_v4");
  const candidate_type_sql = registry_candidate_type_expression(Object.fromEntries([...columns].map((column_name) => [column_name, true])));
  const confidence_sql = registry_confidence_expression(Object.fromEntries([...columns].map((column_name) => [column_name, true])));
  const source_citation_sql = registry_source_citation_expression(Object.fromEntries([...columns].map((column_name) => [column_name, true])));
  const filters: string[] = [];
  const params: any[] = [];
  if (input.candidate_row_id && columns.has("id")) { params.push(input.candidate_row_id); filters.push(`id = $${params.length}`); }
  if (input.content_hash || input.source_record_id) { params.push(input.content_hash ?? input.source_record_id); filters.push(`content_hash = $${params.length}`); }
  if (input.source_record_id) { params.push(input.source_record_id); filters.push(`program_id = $${params.length}`); }
  if (!filters.length) return null;
  const result = await client.query(
    `select *, ctid::text as candidate_row_id, ${candidate_type_sql} as candidate_type, coalesce((${confidence_sql}), null) as confidence, nullif(${source_citation_sql}, '') as source_citation
       from public.registry_entity_extraction_v4
      where ${filters.join(" or ")}
      order by extraction_timestamp desc nulls last
      limit 1`,
    params,
  );
  return result.rows[0] ?? null;
}

async function write_selected_accounting(client: any, row: any, result: any, input: promote_selected_registry_candidate_input) {
  const action_type = input.operator_decision === "reject" ? "operator_reject_selected" : "operator_promote_selected";
  const status = result.decision === "reject" ? "rejected" : result.decision === "promote" ? "applied" : result.decision === "needs_fix" ? "held_review" : result.decision === "held_review" ? "held_review" : "error";
  const promoted_record_id = text_value(result.promoted_record_id);
  const canonical_record_id = uuid_or_null(promoted_record_id);
  const metadata = { operator_decision: input.operator_decision ?? null, operator_verified: input.operator_verified === true, target_table: input.target_table ?? null, edited_fields: result.edited_fields, operator_note: input.operator_note ?? null, source_file: result.source_file, source_citation: result.source_citation, source_text_hash: result.source_text_hash, confidence: result.confidence, confidence_scores: result.confidence_scores, reason_detail: result.reason_detail, promotion_ready: result.promotion_ready, promoted_record_id, canonical_record_id_is_uuid: Boolean(canonical_record_id), operator_context: input.operator_context ?? null };
  await insert_accounting_row(client, { run_id: result.accounting_run_id, lane: "operator_selected_registry_candidate", action_type, is_dry_run: false, source_record_id: result.source_record_id, canonical_record_id, bridge_record_id: null, status, reason: result.reason, dedupe_key: `${result.intended_target_table ?? "unknown"}:${result.source_record_id ?? "unknown"}`, metadata });
  return status;
}

export async function promote_selected_registry_entity_candidate(input: promote_selected_registry_candidate_input) {
  const pool = getPool();
  const client = await pool.connect();
  const run_id = randomUUID();
  try {
    await client.query("begin");
    const run_columns = await table_columns(client, "conveyor_runs");
    const accounting_columns = await table_columns(client, "conveyor_promotion_accounting");
    if (!required_columns_present(run_columns, ["run_id", "lane", "action_type", "is_dry_run", "status", "candidate_count", "passed_count", "failed_count", "promoted_count", "skipped_duplicate_count", "bridged_count", "finished_at", "metadata"]) || !required_columns_present(accounting_columns, ["run_id", "lane", "action_type", "is_dry_run", "source_record_id", "status", "metadata"])) {
      await client.query("rollback");
      return { success: false, error: "no_safe_accounting_target", accounting_run_id: run_id };
    }
    const row = await load_selected_registry_candidate(client, input);
    if (!row) {
      await client.query("rollback");
      return { success: false, error: "registry_candidate_not_found", accounting_run_id: run_id };
    }
    const target_table = selected_candidate_target_table(row, input.target_table);
    let result = selected_candidate_result_base(row, input, target_table, run_id);
    await insert_conveyor_run_row(client, { run_id, lane: "operator_selected_registry_candidate", is_dry_run: false, metadata: { target_table, operator_decision: input.operator_decision ?? null, operator_verified: input.operator_verified === true, candidate_row_id: result.candidate_row_id, source_record_id: result.source_record_id } });
    if (input.operator_decision === "reject") {
      result = { ...result, decision: "reject", reason: "operator_rejected", reason_detail: input.operator_note ?? "operator_rejected_candidate", write_adapter_status: "not_written" };
    } else if (input.operator_decision === "needs_fix") {
      result = { ...result, decision: "needs_fix", reason: "operator_requested_fix", reason_detail: "operator_requested_candidate_field_fix", write_adapter_status: "needs_fix" };
    } else if (input.operator_decision !== "promote") {
      result = { ...result, decision: "needs_fix", reason: "operator_decision_required", reason_detail: "operator_decision_must_be_promote_reject_or_needs_fix", write_adapter_status: "needs_fix" };
    } else if (input.operator_verified !== true) {
      result = { ...result, decision: "held_review", reason: "operator_verified_required", reason_detail: "operator_verified_true_required_for_promote", write_adapter_status: "blocked" };
    } else if (!target_table) {
      result = { ...result, decision: "held_review", reason: "target_table_required", reason_detail: "target_table_or_promotion_ready_target_table_required", write_adapter_status: "blocked" };
    } else if (target_table !== "registry_programs") {
      result = { ...result, decision: "held_review", reason: "no_safe_target_table_adapter", reason_detail: "adapter_not_available_for_target_table", write_adapter_status: "blocked" };
    } else {
      result = await write_registry_program_selected_candidate(client, row, result);
    }
    result.accounting_status = await write_selected_accounting(client, row, result, input);
    await update_conveyor_run_row(client, { run_id, candidate_count: 1, passed_count: result.decision === "promote" || result.decision === "reject" ? 1 : 0, failed_count: result.decision === "promote" || result.decision === "reject" ? 0 : 1, promoted_count: result.decision === "promote" && result.promoted_record_id ? 1 : 0, skipped_duplicate_count: result.write_adapter_status === "skipped_duplicate" ? 1 : 0, bridged_count: 0, metadata: { decision: result.decision, reason: result.reason, reason_detail: result.reason_detail, promoted_record_id: result.promoted_record_id, accounting_status: result.accounting_status } });
    await client.query("commit");
    return { success: result.decision === "promote" || result.decision === "reject", ...result };
  } catch (error: any) {
    try { await client.query("rollback"); } catch {}
    return { success: false, accounting_run_id: run_id, decision: "error", reason: "operator_selected_promotion_failed", reason_detail: error?.message ?? String(error), accounting_status: "rolled_back" };
  } finally {
    client.release();
  }
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

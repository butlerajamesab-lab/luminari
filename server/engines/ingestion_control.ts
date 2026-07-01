import { createHash, randomUUID } from "node:crypto";
import { getPool, query_with_diagnostics } from "../db";

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

  const summary_result = await query_with_diagnostics(`select import_status, count(*)::int as count from public.corpus_import_queue group by import_status`, [], { label: "ingestion_control_queue_summary", pool_acquire_timeout_ms: 1000, query_timeout_ms: 10000 });
  const status_counts = Object.fromEntries(summary_result.rows.map((row: any) => [row.import_status ?? "unknown", Number(row.count ?? 0)]));

  const result = await query_with_diagnostics(
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
    { label: "ingestion_control_queue_rows", pool_acquire_timeout_ms: 1000, query_timeout_ms: 10000 },
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

const CANDIDATE_EXTRACTOR_VERSION = "candidate_field_binding_v2";
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
    urls: extract_urls(section),
    statutes: section.match(/(?:\d+\s+U\.S\.C\.\s+§?\s*[\w.-]+|\d+\s+C\.F\.R\.\s+§?\s*[\w.-]+|§\s*[\w.-]+|section\s+[\w.-]+)/gi) ?? [],
    deadlines: section.match(/(?:within\s+\d+\s+(?:day|days|month|months)|deadline[^.\n]*|due\s+(?:by|date)?[^.\n]*|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b)/gi) ?? [],
  };
}

type AssembledBenefitProgram = {
  name: string | null;
  fields: Record<string, string>;
  field_labels: Record<string, string>;
  start_line: number;
  end_line: number;
  source_excerpt: string;
};

const FIELD_LABELS: Array<{ key: string; pattern: RegExp }> = [
  { key: "phone_website", pattern: /^phone\s*\/?\s*website$/i },
  { key: "address_website", pattern: /^address\s*\/?\s*website$/i },
  { key: "phone", pattern: /^(?:phone|telephone)$/i },
  { key: "email", pattern: /^email$/i },
  { key: "website", pattern: /^(?:website|url|portal)$/i },
  { key: "address", pattern: /^address$/i },
  { key: "agency", pattern: /^(?:agency|department|agency\s*\/\s*contact|contact|organization|oversight body)$/i },
  { key: "eligibility", pattern: /^(?:eligibility|who qualifies)$/i },
  { key: "application_method", pattern: /^(?:how to apply|application|apply\s*\/\s*notes|apply|notes|apply notes|complaint path\s*\/\s*sol)$/i },
  { key: "benefit_summary", pattern: /^(?:what it does for people|description|purpose)$/i },
  { key: "service_type", pattern: /^service type$/i },
];

const USEFUL_BENEFIT_FIELDS = ["phone", "email", "website", "url", "address", "eligibility", "application_method", "benefit_summary", "agency"];

function parse_ordered_lines(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line, index) => ({ text: line.trim().replace(/^[-*•]\s+/, "").trim(), index }))
    .filter((line) => line.text.length > 0);
}

function normalize_label(label: string) {
  return label.toLowerCase().replace(/[\s_]+/g, " ").replace(/[：:–—-]+$/g, "").trim();
}

function detect_field_label(line: string): { key: string; label: string; value: string | null } | null {
  const cleaned = line.trim();
  const inline = cleaned.match(/^(.{1,60}?)(?:\s*[:：]\s*|\s+[–—-]\s+)(.+)$/);
  const raw_label = normalize_label(inline ? inline[1] : cleaned);
  const found = FIELD_LABELS.find((entry) => entry.pattern.test(raw_label));
  if (found) return { key: found.key, label: raw_label, value: inline?.[2]?.trim() || null };
  if (!inline) {
    for (const entry of FIELD_LABELS) {
      const prefixed = cleaned.match(new RegExp(`^(${entry.pattern.source.replace(/^\^|\$$/g, "")})\\s+(.+)$`, "i"));
      if (prefixed) return { key: entry.key, label: normalize_label(prefixed[1]), value: prefixed[2].trim() || null };
    }
  }
  return null;
}

const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s),;]+|(?<!@)\b(?:[a-z0-9-]+\.)+(?:gov|org|com|net|edu|us|info|health|care|io)(?:\/[^\s),;]*)?/gi;

function extract_urls(value: string) {
  return [...new Set(value.match(URL_PATTERN)?.map((match) => match.replace(/[.,;:]+$/g, "")) ?? [])];
}

function merge_mixed_field_values(fields: Record<string, string>, value: string) {
  const obvious = extract_obvious_values(value);
  for (const phone of obvious.phones) merge_field(fields, "phone", phone);
  for (const email of obvious.emails) merge_field(fields, "email", email);
  for (const url of obvious.urls) merge_field(fields, "website", url);
}

function looks_like_resource_name(line: string) {
  if (detect_field_label(line)) return false;
  if (line.length < 3 || line.length > 180) return false;
  if (/^(?:phone|telephone|email|website|url|portal|address|address\s*\/?\s*website|phone\s*\/?\s*website|service type|what it does for people|description|purpose|eligibility|who qualifies|how to apply|application|apply\s*\/\s*notes|apply|notes|apply notes|agency|department|agency\s*\/\s*contact|contact|organization|oversight body)$/i.test(normalize_label(line))) return false;
  if (/^(?:layer\s+\d+|page\s+\d+|table of contents)$/i.test(line)) return false;
  if (/^(?:https?:\/\/|www\.)/i.test(line)) return false;
  if (/^[\d\W]+$/.test(line)) return false;
  return /(?:program|benefit|assistance|services?|clinic|center|department|agency|office|division|authority|fund|grant|support|care|housing|food|snap|medicaid|tanf|ssi)/i.test(line) || /^[A-Z][\w'’&(),.\-/ ]+$/.test(line);
}

function merge_field(fields: Record<string, string>, key: string, value: string) {
  const normalized_value = value.trim();
  if (!normalized_value) return;
  if (!fields[key]) fields[key] = normalized_value;
  else if (!fields[key].toLowerCase().includes(normalized_value.toLowerCase())) fields[key] = `${fields[key]}\n${normalized_value}`;
  if (key === "website" && !fields.url) fields.url = normalized_value;
}

function assemble_benefit_programs(text: string) {
  const lines = parse_ordered_lines(text).slice(0, 3000);
  const records: AssembledBenefitProgram[] = [];
  let current: AssembledBenefitProgram | null = null;
  const source_lines: string[] = [];

  const flush = () => {
    if (!current) return;
    current.source_excerpt = source_lines.join("\n").slice(0, 2500);
    records.push(current);
    current = null;
    source_lines.length = 0;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].text;
    const label = detect_field_label(line);
    if (!label && looks_like_resource_name(line)) {
      if (current && (Object.keys(current.fields).length > 0 || current.name)) flush();
      current = { name: line.slice(0, 240), fields: {}, field_labels: {}, start_line: i, end_line: i, source_excerpt: "" };
      source_lines.push(line);
      continue;
    }
    if (!label) {
      if (current) {
        current.end_line = i;
        source_lines.push(line);
      }
      continue;
    }

    let value = label.value;
    let end_line = i;
    if (!value) {
      const continuation_lines: string[] = [];
      for (let j = i + 1; j < lines.length; j += 1) {
        const next_label = detect_field_label(lines[j].text);
        if (next_label) break;
        if (current && looks_like_resource_name(lines[j].text) && continuation_lines.length > 0) break;
        if (!lines[j].text) continue;
        continuation_lines.push(lines[j].text);
        end_line = j;
      }
      value = continuation_lines.join("\n").trim() || null;
    }
    if (!value) continue;
    if (!current) current = { name: null, fields: {}, field_labels: {}, start_line: i, end_line, source_excerpt: "" };
    if (label.key === "phone_website") {
      merge_mixed_field_values(current.fields, value);
      const remaining = value.replace(/(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/g, "").replace(URL_PATTERN, "").trim();
      if (remaining) merge_field(current.fields, "phone", remaining);
    } else if (label.key === "address_website") {
      merge_mixed_field_values(current.fields, value);
      const remaining = value.replace(URL_PATTERN, "").trim();
      if (remaining) merge_field(current.fields, "address", remaining);
    } else {
      merge_field(current.fields, label.key, value);
      merge_mixed_field_values(current.fields, value);
    }
    current.field_labels[label.key] = label.label;
    current.end_line = Math.max(current.end_line, end_line);
    source_lines.push(line);
    if (!label.value && end_line !== i) {
      for (let j = i + 1; j <= end_line; j += 1) source_lines.push(lines[j].text);
      i = end_line;
    }
    if (!current.name && ["agency", "department"].includes(label.label) && looks_like_resource_name(value)) current.name = value.slice(0, 240);
  }
  flush();
  return records;
}

function has_useful_benefit_field(fields: Record<string, string>) {
  return USEFUL_BENEFIT_FIELDS.some((key) => Boolean(fields[key]?.trim()));
}

function infer_candidate_name(record: AssembledBenefitProgram, row: ReadyQueueRow) {
  if (record.name && !detect_field_label(record.name)) return record.name;
  const agency = record.fields.agency?.split("\n").find(Boolean);
  if (agency && looks_like_resource_name(agency)) return agency.slice(0, 240);
  const source_name = row.source_name?.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return source_name && !detect_field_label(source_name) ? source_name.slice(0, 240) : null;
}

function benefit_confidence(record: AssembledBenefitProgram, jurisdiction: string | null) {
  let score = 0.45;
  if (record.source_excerpt.trim()) score += 0.1;
  if (jurisdiction) score += 0.05;
  if (record.name) score += 0.05;
  if (has_useful_benefit_field(record.fields)) score += 0.1;
  if (["phone", "email", "website", "url", "address"].some((key) => record.fields[key])) score += 0.05;
  return Math.min(score, 0.75);
}

function build_candidates(row: ReadyQueueRow) {
  const jurisdiction = infer_jurisdiction(row, row.normalized_text);
  const source_hash = row.sha256 ?? sha256(row.normalized_text);
  const candidates: ExtractionCandidate[] = [];
  const benefit_records = assemble_benefit_programs(row.normalized_text).slice(0, 400);

  benefit_records.forEach((record, index) => {
    const name = infer_candidate_name(record, row);
    const source_excerpt = record.source_excerpt.trim();
    if (!name || !jurisdiction || !source_excerpt || !has_useful_benefit_field(record.fields)) return;
    const confidence = benefit_confidence({ ...record, name }, jurisdiction);
    if (confidence < 0.6) return;
    const extracted = extract_obvious_values(source_excerpt);
    const content_hash = sha256(`${row.id}:benefit_program:${source_hash}:${name}:${source_excerpt}`);
    candidates.push({
      candidate_type: "benefit_program",
      name,
      excerpt: source_excerpt,
      jurisdiction,
      content_hash,
      payload: {
        candidate_type: "benefit_program",
        document_family: "state_enriched_registry_docx_review",
        promotion_lane: "state_enriched_registry_docx_review",
        intended_target_table: "registry_programs",
        target_table: "registry_programs",
        source_queue_id: row.id,
        source_name: row.source_name,
        storage_path: row.storage_path,
        source_citation: row.storage_path ?? row.source_name ?? `corpus_import_queue:${row.id}`,
        source_text_hash: source_hash,
        name,
        jurisdiction,
        source_excerpt,
        normalized_excerpt: source_excerpt,
        agency: record.fields.agency ?? null,
        phone: record.fields.phone ?? null,
        email: record.fields.email ?? null,
        website: record.fields.website ?? record.fields.url ?? null,
        url: record.fields.url ?? record.fields.website ?? null,
        address: record.fields.address ?? null,
        eligibility: record.fields.eligibility ?? null,
        application_method: record.fields.application_method ?? null,
        apply_notes: record.fields.application_method ?? null,
        benefit_summary: record.fields.benefit_summary ?? null,
        service_type: record.fields.service_type ?? null,
        fields: record.fields,
        field_labels: record.field_labels,
        extracted,
        extraction_status: "candidate_created",
      },
      provenance: { action: "create_candidates_from_ready", extractor_version: CANDIDATE_EXTRACTOR_VERSION, source_queue_id: row.id, source_name: row.source_name, storage_path: row.storage_path, source_text_hash: source_hash, section_index: index, start_line: record.start_line, end_line: record.end_line, deterministic_rules: true, canonical_promotion: false },
      confidence_scores: { overall: confidence, deterministic_candidate: true, promotion_ready: false, candidate_type: "benefit_program", source_backed: true, value_bearing: true },
    });
  });

  return candidates;
}

async function registry_entity_extraction_v4_columns(client: any) {
  const result = await client.query(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'registry_entity_extraction_v4'`);
  return new Set<string>(result.rows.map((row: any) => String(row.column_name)));
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
    promotion_ready: { ready: false, status: "candidate_created", candidate_type: candidate.candidate_type, document_family: candidate.payload.document_family, promotion_lane: candidate.payload.promotion_lane, target_table: candidate.payload.target_table, intended_target_table: candidate.payload.intended_target_table, source_citation: candidate.payload.source_citation },
    forensic_provenance: candidate.provenance,
    forensic_hash: candidate.content_hash,
    confidence_scores: candidate.confidence_scores,
    geocoding_hints: { jurisdiction: candidate.jurisdiction, source_queue_id: row.id },
    content_hash: candidate.content_hash,
  };
  for (const [key, value] of Object.entries({ source_queue_id: row.id, corpus_import_queue_id: row.id, storage_path: row.storage_path, source_path: row.storage_path, source_name: row.source_name, source_text_hash: row.sha256 ?? sha256(row.normalized_text), raw_candidate_payload: candidate.payload, candidate_payload: candidate.payload, payload: candidate.payload, normalized_excerpt: candidate.excerpt, extraction_status: "candidate_created" })) {
    if (columns.has(key)) insertable[key] = value;
  }
  for (const key of ["candidate_type", "document_family", "promotion_lane", "intended_target_table", "target_table", "source_citation", "agency", "phone", "email", "website", "url", "address", "eligibility", "application_method", "apply_notes", "benefit_summary", "service_type", "source_excerpt"]) {
    if (columns.has(key) && candidate.payload[key] !== undefined) insertable[key] = candidate.payload[key];
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
  const document_family_sql = registry_document_family_expression(columns);
  const promotion_lane_sql = registry_promotion_lane_expression(columns);
  const confidence_sql = registry_confidence_expression(columns);
  const detail_sql = (field: string, keys: string[] = [field]) => `nullif(${registry_json_text_expression(columns, field, keys, "")}, '')`;
  const intended_target_table_sql = detail_sql("intended_target_table", ["intended_target_table", "target_table"]);
  const candidate_type_detail_sql = registry_candidate_type_expression(columns);

  const recent_result = await pool.query(
    `select
        source_file,
        jurisdiction,
        name,
        promotion_ready,
        confidence_scores,
        coalesce((${confidence_sql}), null) as confidence,
        ${candidate_type_sql} as candidate_type,
        ${document_family_sql} as document_family,
        ${promotion_lane_sql} as promotion_lane,
        extraction_timestamp,
        extraction_version,
        program_id,
        content_hash,
        ${detail_sql("agency", ["agency", "agency_name", "department"])} as agency,
        ${detail_sql("eligibility", ["eligibility", "eligibility_summary", "eligibility_criteria"])} as eligibility,
        ${detail_sql("contact", ["contact", "contact_name", "contact_summary"])} as contact,
        ${detail_sql("phone", ["phone", "telephone"])} as phone,
        ${detail_sql("email", ["email"])} as email,
        ${detail_sql("website", ["website", "site", "homepage"])} as website,
        ${detail_sql("apply_notes", ["apply_notes", "application_notes", "how_to_apply"])} as apply_notes,
        ${detail_sql("source_excerpt", ["source_excerpt", "excerpt", "normalized_excerpt", "description"])} as source_excerpt,
        ${detail_sql("source_citation", ["source_citation", "source_url", "citation"])} as source_citation,
        ${intended_target_table_sql} as intended_target_table,
        case when coalesce(${intended_target_table_sql}, case when ${candidate_type_detail_sql} = 'benefit_program' then 'registry_programs' end) in ('luminari_resource_entities', 'registry_programs') then coalesce(${intended_target_table_sql}, case when ${candidate_type_detail_sql} = 'benefit_program' then 'registry_programs' end) else null end as write_target_table,
        case when coalesce(${intended_target_table_sql}, case when ${candidate_type_detail_sql} = 'benefit_program' then 'registry_programs' end) in ('luminari_resource_entities', 'registry_programs') then 'safe_target_table_adapter' else 'no_safe_target_table_adapter' end as write_adapter_status,
        array[]::text[] as blocked_reasons,
        null::text as material_scope
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
    recent_candidates: recent_result.rows.map((row: any) => {
      const verification_input = { ...row, candidate_type: resolved_candidate_type(row), document_family: resolved_document_family(row), promotion_lane: resolved_promotion_lane(row) === "unclassified" ? "state_enriched_registry_docx_review" : resolved_promotion_lane(row), source_citation: resolved_source_citation(row) };
      const verification = verify_registry_candidate(verification_input);
      const material_scope = classify_candidate_material_scope(verification_input);
      const material_hold_reason = hold_reason_for_material_scope(material_scope);
      const adapter = promotion_write_adapter_status(verification_input);
      return {
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
      agency: row.agency ?? null,
      eligibility: row.eligibility ?? null,
      contact: row.contact ?? null,
      phone: row.phone ?? null,
      email: row.email ?? null,
      website: row.website ?? null,
      apply_notes: row.apply_notes ?? null,
      source_excerpt: row.source_excerpt ?? null,
      source_citation: row.source_citation ?? null,
      intended_target_table: row.intended_target_table ?? null,
      write_target_table: adapter.write_target_table,
      write_adapter_status: adapter.write_adapter_status,
      blocked_reasons: [...verification.blocked_reasons, ...(material_hold_reason ? [material_hold_reason] : [])],
      material_scope,
    };
    }),
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

const CANDIDATE_PROMOTION_CONFIDENCE_THRESHOLD = 0.6;
const PROMOTION_SOURCE_PREVIEW_CHAR_LIMIT = 750;
const SAFE_PROMOTION_WRITE_TARGETS = new Set(["luminari_resource_entities", "registry_programs"]);

function verify_registry_candidate(candidate: any) {
  const blocked_reasons: string[] = [];
  const document_family = candidate.document_family || "unclassified";
  const promotion_lane = candidate.promotion_lane || "unclassified";
  if (!candidate.name) blocked_reasons.push("name_required");
  if (!candidate.source_file) blocked_reasons.push("source_file_required");
  if (candidate.confidence !== null && candidate.confidence !== undefined && Number(candidate.confidence) < CANDIDATE_PROMOTION_CONFIDENCE_THRESHOLD) blocked_reasons.push("confidence_below_threshold");
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

async function table_columns(client: any, table_name: string): Promise<Set<string>> {
  const result = await client.query(
    `select column_name
       from information_schema.columns
      where table_schema = 'public'
        and table_name = $1`,
    [table_name],
  );
  return new Set(result.rows.map((row: any) => String(row.column_name)));
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

function first_text_value(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function nested_value(source: any, path: string[]) {
  let current = source;
  for (const key of path) {
    if (current === null || current === undefined || typeof current !== "object") return null;
    current = current[key];
  }
  return current ?? null;
}

function first_array_text(source: any, paths: string[][]) {
  for (const path of paths) {
    const value = nested_value(source, path);
    if (Array.isArray(value)) {
      const found = value.find((item) => typeof item === "string" && item.trim());
      if (found) return found.trim();
    }
  }
  return null;
}

function promotion_ready_value(row: any, field: string) {
  return row.promotion_ready && typeof row.promotion_ready === "object" ? row.promotion_ready[field] ?? null : null;
}

function resolved_candidate_type(row: any) {
  return first_text_value(promotion_ready_value(row, "candidate_type"), row.candidate_type) ?? "unknown";
}

function resolved_intended_target_table(row: any) {
  return first_text_value(promotion_ready_value(row, "target_table"), promotion_ready_value(row, "intended_target_table"), row.intended_target_table, row.target_table);
}

function resolved_promotion_lane(row: any) {
  return first_text_value(promotion_ready_value(row, "promotion_lane"), row.promotion_lane) ?? "unclassified";
}

function resolved_document_family(row: any) {
  return first_text_value(promotion_ready_value(row, "document_family"), row.document_family) ?? "unclassified";
}

function resolved_promotion_status(row: any) {
  return first_text_value(promotion_ready_value(row, "promotion_status"), row.promotion_status);
}

function resolved_source_citation(row: any) {
  return first_text_value(promotion_ready_value(row, "source_citation"), row.source_citation, row.queue_storage_path, row.queue_source_name, row.forensic_provenance?.source_url, row.forensic_provenance?.source_file);
}

function truncate_preview(value: unknown, limit = PROMOTION_SOURCE_PREVIEW_CHAR_LIMIT) {
  const text = first_text_value(value);
  if (!text) return null;
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
}

function candidate_payload_text(row: any, keys: string[]) {
  const payload = candidate_payload_from_row(row);
  const extracted = payload?.extracted ?? {};
  return first_text_value(...keys.map((key) => payload?.[key]), ...keys.map((key) => extracted?.[key]));
}

function promotion_write_adapter_status(row: any) {
  const intended_target_table = resolved_intended_target_table(row);
  if (intended_target_table === "registry_programs") {
    return resolved_candidate_type(row) === "benefit_program" ? { write_target_table: "registry_programs", write_adapter_status: "safe_registry_programs_benefit_program_adapter" } : { write_target_table: null, write_adapter_status: "no_safe_registry_programs_adapter_for_candidate_type" };
  }
  if (intended_target_table) {
    return SAFE_PROMOTION_WRITE_TARGETS.has(intended_target_table) ? { write_target_table: intended_target_table, write_adapter_status: "safe_target_table_adapter" } : { write_target_table: null, write_adapter_status: "no_safe_target_table_adapter" };
  }
  if (resolved_candidate_type(row) === "benefit_program") return { write_target_table: "registry_programs", write_adapter_status: "safe_registry_programs_benefit_program_adapter" };
  if (candidate_is_resource_like(row)) return { write_target_table: "luminari_resource_entities", write_adapter_status: "safe_resource_like_default_adapter" };
  return { write_target_table: null, write_adapter_status: "no_safe_target_table_adapter" };
}

function promotion_reason_detail(row: any, verification: { blocked_reasons: string[] }, write_adapter_status: string, material_hold_reason: string | null, material_scope: string) {
  const details: string[] = [];
  const confidence = row.confidence === null || row.confidence === undefined ? null : Number(row.confidence);
  if (verification.blocked_reasons.includes("confidence_below_threshold") && confidence !== null) details.push(`confidence ${confidence} below threshold ${CANDIDATE_PROMOTION_CONFIDENCE_THRESHOLD}`);
  if (verification.blocked_reasons.includes("name_required")) details.push("candidate name is required");
  if (verification.blocked_reasons.includes("source_file_required")) details.push("source file is required");
  if (verification.blocked_reasons.includes("jurisdiction_required")) details.push("jurisdiction is required for this document family");
  if (verification.blocked_reasons.includes("source_provenance_required")) details.push("source citation or provenance is required");
  if (verification.blocked_reasons.includes("promotion_lane_unclassified")) details.push("promotion lane is unclassified");
  if (row.promotion_ready === false || row.promotion_ready?.promotion_ready === false) details.push("promotion_ready false");
  const intended_target_table = resolved_intended_target_table(row);
  if (write_adapter_status === "no_safe_target_table_adapter") details.push(`no safe adapter for intended target_table ${intended_target_table ?? "unspecified"}`);
  if (material_hold_reason) details.push(`held for review because material_scope is ${material_scope}`);
  return details.join("; ") || null;
}

function operator_promotion_result(row: any, input: { action_type: string; status: string; reason: string | null; verification: { blocked_reasons: string[] }; material_scope: string; material_hold_reason: string | null; canonical_record_id: string | null; bridge_record_id: string | null; dedupe_key: string; metadata: any }) {
  const payload = candidate_payload_from_row(row);
  const extracted = payload?.extracted ?? {};
  const forensic = row.forensic_provenance ?? {};
  const adapter = promotion_write_adapter_status(row);
  const reason_detail = promotion_reason_detail(row, input.verification, adapter.write_adapter_status, input.material_hold_reason, input.material_scope);
  const candidate_name = first_text_value(row.name, payload?.name, payload?.program_name, payload?.entity_name);
  const website = candidate_payload_text(row, ["website", "site", "homepage"]);
  const url = candidate_payload_text(row, ["url", "source_url", "link"]) ?? first_array_text(payload, [["urls"], ["extracted", "urls"]]);
  return {
    candidate_row_id: row.content_hash ?? row.program_id ?? row.id ?? null,
    candidate_name,
    candidate_type: resolved_candidate_type(row),
    jurisdiction: row.jurisdiction ?? payload?.jurisdiction ?? null,
    source_file: first_text_value(row.queue_source_name, row.source_file, forensic.source_file, payload?.source_name),
    source_citation: resolved_source_citation(row),
    storage_path: first_text_value(row.queue_storage_path, row.storage_path, forensic.storage_path, payload?.storage_path),
    section_index: row.section_index ?? forensic.section_index ?? payload?.section_index ?? null,
    source_text_hash: first_text_value(row.source_text_hash, forensic.source_text_hash, payload?.source_text_hash),
    content_hash: row.content_hash ?? null,
    confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
    confidence_threshold: CANDIDATE_PROMOTION_CONFIDENCE_THRESHOLD,
    confidence_scores: row.confidence_scores ?? null,
    promotion_ready: row.promotion_ready ?? null,
    promotion_status: resolved_promotion_status(row),
    intended_target_table: resolved_intended_target_table(row),
    promotion_lane: resolved_promotion_lane(row),
    document_family: resolved_document_family(row),
    material_scope: input.material_scope,
    write_target_table: adapter.write_target_table,
    write_adapter_status: adapter.write_adapter_status,
    decision: input.action_type,
    reason: input.reason,
    reason_detail,
    program_name: first_text_value(payload?.program_name, extracted.program_name, candidate_name),
    entity_name: first_text_value(payload?.entity_name, extracted.entity_name, candidate_name),
    agency: candidate_payload_text(row, ["agency", "agency_name", "department"]),
    purpose: candidate_payload_text(row, ["purpose", "description", "normalized_excerpt"]),
    eligibility: candidate_payload_text(row, ["eligibility", "eligibility_summary", "eligibility_criteria"]),
    contact: candidate_payload_text(row, ["contact", "contact_name", "contact_summary"]),
    phone: candidate_payload_text(row, ["phone", "telephone"]) ?? first_array_text(payload, [["phones"], ["extracted", "phones"]]),
    email: candidate_payload_text(row, ["email"]) ?? first_array_text(payload, [["emails"], ["extracted", "emails"]]),
    website,
    portal: candidate_payload_text(row, ["portal", "application_portal", "benefits_portal"]),
    url,
    address: candidate_payload_text(row, ["address", "mailing_address", "physical_address"]),
    source_excerpt: truncate_preview(first_text_value(payload?.source_excerpt, payload?.excerpt, payload?.normalized_excerpt, payload?.description, row.normalized_excerpt, row.source_excerpt, forensic.source_excerpt)),
    source_record_id: row.content_hash ?? row.program_id,
    canonical_record_id: input.canonical_record_id,
    bridge_record_id: input.bridge_record_id,
    action_type: input.action_type,
    status: input.status,
    dedupe_key: input.dedupe_key,
    blocked_reasons: input.verification.blocked_reasons,
    source_queue_id: input.metadata.source_queue_id,
  };
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


const REGISTRY_PROGRAM_COLUMN_ALIASES: Record<string, string[]> = {
  id: ["id"],
  jurisdiction_id: ["jurisdiction_id", "jurisdiction_id_rp"],
  category: ["category", "category_rp"],
  name: ["name", "name_rp"],
  agency: ["agency", "agency_rp"],
  eligibility: ["eligibility", "eligibility_rp"],
  contact: ["contact", "contact_rp"],
  website: ["website", "website_rp"],
  apply_notes: ["apply_notes", "apply_notes_rp"],
  fingerprint: ["fingerprint", "fingerprint_rp"],
  contact_raw_text: ["contact_raw_text"],
  contact_email_norm: ["contact_email_norm"],
  contact_phone_norm: ["contact_phone_norm"],
  contact_website_norm: ["contact_website_norm"],
};

function registry_program_column(columns: Set<string>, logical_name: string) {
  return (REGISTRY_PROGRAM_COLUMN_ALIASES[logical_name] ?? [logical_name]).find((column_name) => columns.has(column_name)) ?? null;
}

function registry_program_column_map(columns: Set<string>) {
  return Object.fromEntries(Object.keys(REGISTRY_PROGRAM_COLUMN_ALIASES).map((logical_name) => [logical_name, registry_program_column(columns, logical_name)])) as Record<string, string | null>;
}

function sql_identifier(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

function source_identity(row: any) {
  return first_text_value(row.content_hash, row.program_id, row.forensic_hash, row.id);
}

function registry_program_id(row: any) {
  const identity = source_identity(row);
  return identity ? `reev4_${sha256(identity).slice(0, 24)}` : null;
}

function normal_email(row: any) {
  return candidate_payload_text(row, ["email"])?.toLowerCase() ?? first_array_text(candidate_payload_from_row(row), [["emails"], ["extracted", "emails"]])?.toLowerCase() ?? null;
}

function normal_phone(row: any) {
  const phone = candidate_payload_text(row, ["phone", "telephone"]) ?? first_array_text(candidate_payload_from_row(row), [["phones"], ["extracted", "phones"]]);
  return phone ? phone.replace(/[^0-9+]/g, "") : null;
}

function normal_website(row: any) {
  const website = candidate_payload_text(row, ["website", "site", "homepage", "url", "source_url", "link"]) ?? first_array_text(candidate_payload_from_row(row), [["urls"], ["extracted", "urls"]]);
  return website ? website.trim().toLowerCase() : null;
}

function registry_program_values(row: any, columns: Set<string>) {
  const map = registry_program_column_map(columns);
  const identity = source_identity(row);
  const program_id = registry_program_id(row);
  const payload = candidate_payload_from_row(row);
  const values: Record<string, unknown> = {
    id: program_id,
    jurisdiction_id: first_text_value(row.jurisdiction, payload?.jurisdiction, "unknown"),
    category: first_text_value(payload?.category, payload?.benefit_category, row.candidate_type, "benefit_program"),
    name: first_text_value(payload?.program_name, row.name, payload?.name),
    agency: candidate_payload_text(row, ["agency", "agency_name", "department"]),
    eligibility: candidate_payload_text(row, ["eligibility", "eligibility_summary", "eligibility_criteria"]),
    contact: candidate_payload_text(row, ["contact", "contact_name", "contact_summary"]),
    website: normal_website(row),
    apply_notes: candidate_payload_text(row, ["apply_notes", "application_notes", "how_to_apply", "portal", "application_portal"]),
    fingerprint: identity ? sha256(identity) : null,
    contact_raw_text: candidate_payload_text(row, ["contact", "contact_raw_text", "contact_summary"]),
    contact_email_norm: normal_email(row),
    contact_phone_norm: normal_phone(row),
    contact_website_norm: normal_website(row),
  };
  return Object.fromEntries(Object.entries(values).filter(([logical_name, value]) => map[logical_name] && value !== null && value !== undefined && value !== ""));
}

async function existing_registry_program(client: any, row: any, program_columns: Set<string>) {
  const map = registry_program_column_map(program_columns);
  const id = registry_program_id(row);
  const fingerprint = source_identity(row) ? sha256(source_identity(row) as string) : null;
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (id && map.id) { params.push(id); clauses.push(`${sql_identifier(map.id)} = $${params.length}`); }
  if (fingerprint && map.fingerprint) { params.push(fingerprint); clauses.push(`${sql_identifier(map.fingerprint)} = $${params.length}`); }
  if (!clauses.length) return null;
  const result = await client.query(`select * from public.registry_programs where ${clauses.join(" or ")} limit 1`, params);
  return result.rows[0] ?? null;
}

function registry_program_blank_updates(existing_row: any, candidate_row: any, columns: Set<string>) {
  const map = registry_program_column_map(columns);
  const values = registry_program_values(candidate_row, columns);
  const updates: Record<string, unknown> = {};
  for (const [logical_name, value] of Object.entries(values)) {
    if (logical_name === "id") continue;
    const column_name = map[logical_name];
    if (column_name && value && !text_or_null(existing_row[column_name])) updates[column_name] = value;
  }
  return updates;
}

async function write_registry_program_candidate(client: any, row: any, program_columns: Set<string>) {
  if (resolved_candidate_type(row) !== "benefit_program") throw new Error("registry_programs_adapter_requires_benefit_program");
  const map = registry_program_column_map(program_columns);
  if (!map.id || !map.jurisdiction_id || !map.name) throw new Error("registry_programs_missing_required_adapter_columns");
  const existing_row = await existing_registry_program(client, row, program_columns);
  const source_pk = source_identity(row) ?? registry_program_id(row);
  if (existing_row) {
    const updates = registry_program_blank_updates(existing_row, row, program_columns);
    if (!Object.keys(updates).length) return { action_type: "would_skip_duplicate", canonical_record_id: String(existing_row[map.id ?? "id"] ?? source_pk), bridge_record_id: null };
    const names = Object.keys(updates);
    await client.query(`update public.registry_programs set ${names.map((name, index) => `${sql_identifier(name)} = $${index + 2}`).join(", ")} where ${sql_identifier(map.id ?? "id")} = $1`, [existing_row[map.id ?? "id"], ...names.map((name) => updates[name])]);
    return { action_type: "would_update_blank_fields", canonical_record_id: String(existing_row[map.id ?? "id"] ?? source_pk), bridge_record_id: null };
  }
  const values = registry_program_values(row, program_columns);
  const names = Object.keys(values).map((logical_name) => map[logical_name]).filter(Boolean) as string[];
  const params = Object.keys(values).map((logical_name) => values[logical_name]);
  const placeholders = names.map((_, index) => `$${index + 1}`);
  const inserted = await client.query(`insert into public.registry_programs (${names.map(sql_identifier).join(", ")}) values (${placeholders.join(", ")}) returning ${sql_identifier(map.id ?? "id")}`, params);
  return { action_type: "would_insert", canonical_record_id: String(inserted.rows[0]?.[map.id ?? "id"] ?? source_pk), bridge_record_id: null };
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
  const pool = getPool();
  const client = await pool.connect();
  const dry_run = input.dry_run !== false;
  const target_hint = input.target_hint ?? CANONICAL_PROMOTION_TARGET_HINT;
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);
  const run_id = randomUUID();
  const feature_flag_enabled = promotion_feature_flag_enabled();
  const results: any[] = [];
  if (target_hint !== CANONICAL_PROMOTION_TARGET_HINT) return { success: false, dry_run, canonical_promotion_enabled: feature_flag_enabled, feature_flag_enabled, target_hint, processed_count: 0, error: "unsupported_promotion_lane", run_id, results };
  if (!dry_run && !feature_flag_enabled) return { success: false, dry_run, canonical_promotion_enabled: false, feature_flag_enabled, target_hint, processed_count: 0, error: "canonical_promotion_feature_flag_disabled", run_id, results };
  try {
    await client.query("begin");
    const entity_columns = await table_columns(client, "luminari_resource_entities");
    const location_columns = await table_columns(client, "luminari_resource_locations");
    const contact_columns = await table_columns(client, "luminari_resource_contact_points");
    const program_columns = await table_columns(client, "registry_programs");
    const accounting_columns = await table_columns(client, "conveyor_promotion_accounting");
    const run_columns = await table_columns(client, "conveyor_runs");
    if (!required_columns_present(run_columns, ["run_id", "lane", "action_type", "is_dry_run", "status", "candidate_count", "passed_count", "failed_count", "promoted_count", "skipped_duplicate_count", "bridged_count", "finished_at", "metadata"])) {
      await client.query("rollback");
      return { success: false, dry_run, canonical_promotion_enabled: feature_flag_enabled, feature_flag_enabled, target_hint, processed_count: 0, error: "no_safe_conveyor_run_target", run_id, results };
    }
    const program_column_map = registry_program_column_map(program_columns);
    const registry_programs_adapter_ready = Boolean(program_column_map.id && program_column_map.jurisdiction_id && program_column_map.name);
    if ((!required_columns_present(entity_columns, ["source_table", "source_pk", "resource_name", "metadata"]) && !registry_programs_adapter_ready) || !required_columns_present(accounting_columns, ["run_id", "lane", "action_type", "is_dry_run", "source_record_id", "status", "metadata"])) {
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
      const promotion_lane = resolved_promotion_lane(row);
      const verification_input = { ...row, candidate_type: resolved_candidate_type(row), document_family: resolved_document_family(row), promotion_lane: promotion_lane === "unclassified" ? "state_enriched_registry_docx_review" : promotion_lane, source_file: first_text_value(row.source_file, row.queue_source_name, row.forensic_provenance?.source_file), source_citation: resolved_source_citation(row) };
      const verification = verify_registry_candidate(verification_input);
      const material_scope = classify_candidate_material_scope(verification_input);
      const material_hold_reason = hold_reason_for_material_scope(material_scope);
      const dedupe_key = canonical_dedupe_key(verification_input);
      let action_type = "blocked";
      let status = "blocked";
      let reason = verification.blocked_reasons.join(",") || null;
      let canonical_record_id = null;
      let bridge_record_id = null;
      const adapter = promotion_write_adapter_status(verification_input);
      try {
        if (verification.verified && material_hold_reason) {
          action_type = material_hold_reason;
          status = "held_review";
          reason = material_hold_reason;
        } else if (verification.verified && !adapter.write_target_table) {
          action_type = adapter.write_adapter_status;
          status = "held_review";
          reason = adapter.write_adapter_status;
        } else if (verification.verified && material_scope === "official_public_law_or_authority" && !candidate_is_resource_like(row)) {
          action_type = "no_safe_legal_authority_target";
          status = "held_review";
          reason = "no_safe_legal_authority_target";
        } else if (verification.verified) {
          if (adapter.write_target_table === "registry_programs") {
            const existing_row = await existing_registry_program(client, row, program_columns);
            if (existing_row) {
              const updates = registry_program_blank_updates(existing_row, row, program_columns);
              action_type = Object.keys(updates).length ? "would_update_blank_fields" : "would_skip_duplicate";
              canonical_record_id = String(existing_row[program_column_map.id ?? "id"] ?? "");
            } else action_type = "would_insert";
            status = dry_run ? "validated_dry_run" : "applied";
            if (!dry_run && action_type !== "would_skip_duplicate") {
              const write_result = await write_registry_program_candidate(client, row, program_columns);
              action_type = write_result.action_type;
              canonical_record_id = write_result.canonical_record_id;
              bridge_record_id = write_result.bridge_record_id;
            }
          } else {
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
        }
      } catch (error: any) {
        action_type = "error";
        status = "error";
        reason = error?.message ?? String(error);
      }
      const metadata = { source_queue_id: candidate_source_queue_id(row), source_file: row.queue_source_name ?? row.source_file ?? null, storage_path: row.queue_storage_path ?? row.storage_path ?? null, content_hash: row.content_hash ?? null, candidate_type: resolved_candidate_type(row), intended_target_table: resolved_intended_target_table(row), write_target_table: adapter.write_target_table, write_adapter_status: adapter.write_adapter_status, target_hint, dedupe_behavior: "enrich_blank_fields_only", verification_lane: verification.verification_lane, blocked_reasons: verification.blocked_reasons, material_scope, candidate_payload: candidate_payload_from_row(row), forensic_provenance: row.forensic_provenance ?? {} };
      await insert_accounting_row(client, { run_id, lane: target_hint, action_type, is_dry_run: dry_run, source_record_id: row.content_hash ?? row.program_id, canonical_record_id, bridge_record_id, status, reason, dedupe_key, metadata });
      results.push(operator_promotion_result(verification_input, { action_type, status, reason, verification, material_scope, material_hold_reason, canonical_record_id, bridge_record_id, dedupe_key, metadata }));
    }
    const count = (name: string) => results.filter((row) => row.action_type === name).length;
    const held_count = results.filter((row) => row.status === "held_review").length;
    const would_insert_count = count("would_insert");
    const would_update_blank_fields_count = count("would_update_blank_fields");
    const skipped_count = count("would_skip_duplicate") + count("no_safe_legal_authority_target") + count("no_safe_target_table_adapter");
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
    let conveyor_run_exists_in_transaction: boolean | null = null;
    if (String(error?.message ?? error).toLowerCase().includes("conveyor_promotion_accounting") || String(error?.code ?? "") === "23503") {
      try {
        const run_check = await client.query(`select exists(select 1 from public.conveyor_runs where run_id = $1) as exists`, [run_id]);
        conveyor_run_exists_in_transaction = Boolean(run_check.rows[0]?.exists);
      } catch {}
    }
    try { await client.query("rollback"); } catch {}
    return { success: false, dry_run, canonical_promotion_enabled: feature_flag_enabled, feature_flag_enabled, target_hint, processed_count: results.length, would_insert_count: 0, would_update_blank_fields_count: 0, skipped_count: 0, blocked_count: results.filter((row) => row.action_type === "blocked").length, error_count: results.filter((row) => row.action_type === "error").length + 1, run_id, error: "canonical_promotion_apply_failed", message: error?.message ?? String(error), accounting_fk_diagnostic: conveyor_run_exists_in_transaction === null ? null : { run_id, conveyor_run_exists_in_transaction }, results };
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

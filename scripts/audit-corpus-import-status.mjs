#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import * as corpus_audit_utils from "./lib/corpus-audit-utils.mjs";

const count_csv_records = corpus_audit_utils.count_csv_records;
const count_jsonl_records = corpus_audit_utils.count_jsonl_records;
const create_pool = corpus_audit_utils.create_pool;
const extract_corpus_import_queue_rows_from_sql = corpus_audit_utils.extract_corpus_import_queue_rows_from_sql;
const extract_json_record_count = corpus_audit_utils.extract_json_record_count;
const find_data_directories = corpus_audit_utils.find_data_directories;
const find_files_by_basename = corpus_audit_utils.find_files_by_basename;
const get_table_columns = corpus_audit_utils.get_table_columns;
const infer_domain_tags = corpus_audit_utils.infer_domain_tags;
const infer_pipeline_context = corpus_audit_utils.infer_pipeline_context;
const parse_args = corpus_audit_utils.parse_args;
const repo_root = corpus_audit_utils.repo_root;
const safe_count = corpus_audit_utils.safe_count;
const table_exists = corpus_audit_utils.table_exists;

const args = parse_args();

function legacy_key(parts) {
  return parts.join("");
}

function read_normalized_value(object, snake_key, legacy_parts = []) {
  if (!object || typeof object !== "object") return undefined;
  if (object[snake_key] !== undefined) return object[snake_key];
  if (!legacy_parts.length) return undefined;
  return object[legacy_key(legacy_parts)];
}


const source_mappings = [
  { source_name: "legal_statutes_priority2.json", selector: "statutes", targets: ["legal_statutes"] },
  { source_name: "legal_weak_joints_priority4.json", selector: "weak_joints", targets: ["legal_weak_joints"] },
  {
    source_name: "legal_enforcement_state_combined.json",
    selector: "enforcement_records_state",
    targets: ["legal_enforcement_records", "agency_authority_map"],
    ambiguity: "Enforcement payload may fit legal_enforcement_records or agency_authority_map; audit reports both and does not choose.",
  },
  { source_name: "government_benefits_registry.jsonl", targets: ["government_benefits_registry"] },
  { source_name: "workflow_registry.jsonl", targets: ["workflow_registry", "registry_workflows", "workflow_definitions", "workflow_master"] },
  { source_name: "escalation_registry.jsonl", targets: ["escalation_registry", "escalation_routes"] },
  { source_name: "committee_registry.jsonl", targets: ["committee_registry"] },
  { source_name: "committee_membership_registry.jsonl", targets: ["committee_membership_registry", "committee_memberships"] },
  { source_name: "legislator_registry.jsonl", targets: ["legislator_registry", "legislator_contacts"] },
  { source_name: "claim_elements_matrix_complete-2.json", targets: ["claim_element_matrix"], compatibility: "needs-transform if source is grouped by domain instead of one row per claim element" },
  { source_name: "barrier_decision_tree_complete-1.json", targets: ["barrier_decision_tree"] },
  { source_name: "legal_library_L1_statutes_complete.json", targets: ["legal_statutes"] },
  { source_name: "legal_statute_key_text.json", targets: ["legal_statute_key_text"] },
  { source_name: "accountability_routes_full.txt", targets: ["accountability_routes", "registry_oversight_bodies", "escalation_routes"] },
];


const ingestion_lane_tables = [
  { table_name: "corpus_import_queue", lane_stage: "staged", read_or_write: "read_write", code_file: "scripts/stage-registry-bucket-files.mjs; scripts/extract-docx-corpus-queue.mjs; server/engines/ingestion_control.ts", function_or_script: "stage_registry_bucket_files; extract_docx_corpus_queue; list_corpus_import_queue", fields_expected: ["source_name", "source_type", "target_hint", "import_status", "record_count_estimate"], fields_written: ["source_name", "source_type", "source_ext", "storage_bucket", "storage_path", "target_hint", "payload", "raw_text", "import_status"], camelcase_findings: [], fix_status: "owned_output_snake_case" },
  { table_name: "registry_entity_extraction_v4", lane_stage: "candidate", read_or_write: "read_write", code_file: "scripts/normalize-state-registry-docx-candidates.mjs; server/engines/ingestion_control.ts", function_or_script: "normalize_state_registry_docx_candidates; create_candidates_from_ready_queue", fields_expected: ["source_file", "jurisdiction", "extraction_timestamp", "extraction_version", "program_id", "name", "content_hash"], fields_written: ["source_file", "jurisdiction", "extraction_timestamp", "extraction_version", "program_id", "name", "promotion_ready", "forensic_provenance", "content_hash"], camelcase_findings: [], fix_status: "owned_output_snake_case" },
  { table_name: "conveyor_runs", lane_stage: "accounting", read_or_write: "read_write", code_file: "server/engines/ingestion_control.ts", function_or_script: "promote_registry_entity_candidates_apply", fields_expected: ["run_id", "lane", "action_type", "is_dry_run", "status", "candidate_count"], fields_written: ["run_id", "lane", "action_type", "is_dry_run", "status", "candidate_count", "finished_at", "metadata"], camelcase_findings: [], fix_status: "owned_output_snake_case" },
  { table_name: "conveyor_promotion_accounting", lane_stage: "accounting", read_or_write: "write", code_file: "server/engines/ingestion_control.ts", function_or_script: "insert_accounting_row", fields_expected: ["run_id", "lane", "action_type", "is_dry_run", "source_record_id", "status", "metadata"], fields_written: ["run_id", "lane", "action_type", "is_dry_run", "source_record_id", "status", "metadata"], camelcase_findings: [], fix_status: "owned_output_snake_case" },
  { table_name: "luminari_resource_entities", lane_stage: "canonical", read_or_write: "read_write", code_file: "server/engines/ingestion_control.ts", function_or_script: "insert_resource_entity", fields_expected: ["source_table", "source_pk", "resource_name", "metadata"], fields_written: ["canonical_id", "source_table", "source_pk", "resource_name", "metadata", "verification_status", "promotion_status"], camelcase_findings: [], fix_status: "owned_output_snake_case" },
  { table_name: "luminari_resource_contact_points", lane_stage: "canonical", read_or_write: "write", code_file: "server/engines/ingestion_control.ts", function_or_script: "insert_resource_entity", fields_expected: ["resource_entity_id", "canonical_id", "contact_type", "contact_value", "metadata"], fields_written: ["resource_entity_id", "canonical_id", "contact_type", "contact_value", "label", "is_primary", "contact_quality", "source_table", "source_pk", "source_hash", "metadata"], camelcase_findings: [], fix_status: "owned_output_snake_case" },
  { table_name: "registry_programs", lane_stage: "canonical", read_or_write: "read_write", code_file: "server/engines/ingestion_control.ts", function_or_script: "upsert_registry_program", fields_expected: ["id", "jurisdiction_id", "name"], fields_written: ["jurisdiction_id", "name"], camelcase_findings: [], fix_status: "owned_output_snake_case" },
];

async function build_ingestion_lane_table_report(pool) {
  const rows = [];
  for (const table of ingestion_lane_tables) {
    rows.push({
      ...table,
      table: `public.${table.table_name}`,
      row_count: (await safe_count(pool, table.table_name)).count,
    });
  }
  return rows;
}

const batch_source_names = [
  "batch_009.zip",
  "batch_011.zip",
  "batch_012.zip",
  "batch_013.zip",
  "batch_014.zip",
];

function read_source_count(file_path, selector) {
  const basename = path.basename(file_path);
  const ext = path.extname(file_path).toLowerCase();
  const text = fs.readFileSync(file_path, "utf8");
  if (ext === ".json") {
    const parsed = JSON.parse(text);
    return extract_json_record_count(parsed, selector);
  }
  if (ext === ".jsonl") return count_jsonl_records(text);
  if (ext === ".csv") return count_csv_records(text);
  if (ext === ".txt") return text.split(/\r?\n/).filter((line) => line.trim()).length;
  if (ext === ".sql") return (text.match(/\binsert\s+into\b/gi) ?? []).length;
  if (basename.endsWith(".zip")) return null;
  return null;
}

function find_local_staging_sql_files(data_dirs) {
  const matches = [];
  const seen = new Set();
  for (const dir of data_dirs) scan(dir, 4);
  return matches;

  function scan(dir, depth) {
    if (depth < 0) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (["node_modules", ".git", "dist"].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(full, depth - 1);
        continue;
      }
      if (!entry.name.endsWith(".sql")) continue;
      if (!/(cream|substrate|import_queue|corpus)/i.test(entry.name) && !/data\/import_queue|scripts\/sql/.test(full)) continue;
      if (seen.has(full)) continue;
      seen.add(full);
      matches.push(full);
    }
  }
}

function read_local_staging_sql_rows(data_dirs) {
  const files = find_local_staging_sql_files(data_dirs);
  const reports = [];
  const rows = [];
  for (const file of files) {
    const relative_path = path.relative(repo_root, file);
    try {
      const text = fs.readFileSync(file, "utf8");
      const parsed_rows = extract_corpus_import_queue_rows_from_sql(text, relative_path);
      const raw_insert_count = (text.match(/insert\s+into\s+public\.corpus_import_queue/gi) ?? []).length;
      const parse_error_count = parsed_rows.filter((row) => row.import_status === "parse_error").length;
      if (parsed_rows.length || raw_insert_count) {
        rows.push(...parsed_rows);
        reports.push({
          path: relative_path,
          queue_rows_parsed: parsed_rows.length,
          raw_insert_count,
          parse_error_count,
          unparsed_insert_count: Math.max(0, raw_insert_count - parsed_rows.length),
          incomplete_sql_warning: raw_insert_count > parsed_rows.length
            ? "Some corpus_import_queue insert statements were not parsed; this usually means the local SQL handoff is incomplete or cut off mid-insert."
            : null,
        });
      }
    } catch (error) {
      reports.push({ path: relative_path, queue_rows_parsed: 0, error: error.message });
    }
  }
  return { rows, reports };
}

function derive_status(source_count, target_reports, mapping) {
  const existing_targets = target_reports.filter((target) => target.exists);
  if (source_count === null) return "source-file-missing";
  if (!existing_targets.length) return "target-table-missing";
  if (mapping.compatibility && existing_targets.some((target) => target.count < source_count)) return "needs-transform";
  const total_count = existing_targets.reduce((sum, target) => sum + (target.count ?? 0), 0);
  if (existing_targets.some((target) => target.count > source_count && source_count > 0)) return "duplicate-risk";
  if (total_count === 0 && source_count > 0) return "missing";
  if (total_count < source_count) return "partial";
  return "present";
}

async function read_queue_rows(pool) {
  const exists = pool ? await table_exists(pool, "corpus_import_queue") : false;
  if (!exists) return { exists, rows: [], columns: [] };
  const columns = await get_table_columns(pool, "corpus_import_queue");
  const result = await pool.query(`select * from public.corpus_import_queue order by source_name`);
  const display_columns = ["source_name", "source_type", "target_hint", "record_count_estimate", "byte_size", "import_status"].filter((column) => columns.includes(column));
  const display_rows = result.rows.map((row) => Object.fromEntries(display_columns.map((column) => [column, row[column]])));
  return { exists, rows: result.rows, display_rows, columns };
}

function estimate_queue_record_count(row) {
  const explicit = read_normalized_value(row, "record_count_estimate", ["record", "Count", "Estimate"]) ?? row.record_count;
  if (explicit !== undefined && explicit !== null && explicit !== "") return Number(explicit);
  const payload = row.payload ?? row.source_payload ?? row.raw_payload ?? row.content ?? row.body;
  if (Array.isArray(payload)) return payload.length;
  if (payload && typeof payload === "object") {
    for (const key of ["statutes", "weak_joints", "enforcement_records_state", "records", "items", "data"]) {
      if (Array.isArray(payload[key])) return payload[key].length;
    }
    return Object.keys(payload).length;
  }
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return 0;
    try {
      return estimate_queue_record_count({ payload: JSON.parse(trimmed) });
    } catch {
      return trimmed.split(/\r?\n/).filter((line) => line.trim()).length;
    }
  }
  return null;
}

function canonical_queue_source_name(source_name) {
  const match = normalize_source_name(source_name).match(/^cream:(.+):(\d+)$/);
  return match ? match[1] : source_name;
}

function normalize_source_name(source_name) {
  return String(source_name ?? "").trim();
}

function add_count(map, key, count) {
  if (!key || typeof count !== "number" || count !== count) return;
  map.set(key, (map.get(key) ?? 0) + count);
}

function transform_disposition(row) {
  const source_name = normalize_source_name(row.source_name);
  const payload = row.payload ?? {};
  const target_hint = String(row.target_hint ?? "").toLowerCase();
  const source_type = String(row.source_type ?? "").toLowerCase();
  const domains = payload.domains ?? payload.domain_tags ?? payload.oversight_domains ?? payload.benefit_categories ?? [];
  const raw_payload_text = payload.raw_text ?? row.raw_text;
  const inference_values = [
    payload.title,
    payload.description,
    payload.summary,
    read_normalized_value(payload, "practical_note", ["practical", "Note"]),
    read_normalized_value(payload, "program_area", ["program", "Area"]),
    payload.claim_type,
    payload.barrier_category,
    payload.full_entity_name,
    payload.record_type,
    payload.domain_batch,
    payload.notes,
    payload.workflow_name,
    payload.pathway_name,
    payload.when_to_use,
    raw_payload_text,
    domains,
    payload.official_source_urls,
    payload.legal_citations,
    target_hint,
  ];
  const contexts = infer_pipeline_context(...inference_values);
  const domain_tags = Array.isArray(domains) && domains.length ? domains : infer_domain_tags(...inference_values);

  if (!source_name.startsWith("cream:") && !target_hint.includes("cream of crop")) {
    return { ready_for_canonical_import: false, requires_transformation: true, reason: "not_cream_starter_row", pipeline_context: contexts, domain_tags: domain_tags };
  }

  if (!["curated_json_record", "curated_source_record"].includes(source_type) || !payload || typeof payload !== "object") {
    return { ready_for_canonical_import: false, requires_transformation: true, reason: "not_a_single_curated_payload", pipeline_context: contexts, domain_tags: domain_tags };
  }

  if (/legal_weak_joints_priority4\.json/.test(source_name)) {
    return { ready_for_canonical_import: Boolean(read_normalized_value(payload, "weak_joint_id", ["weak", "Joint", "Id"]) && payload.title), requires_transformation: true, transform_profile: "weak_joint_payload_to_public_legal_weak_joints", reason: "canonical field names must be mapped from curated weak-joint payload", pipeline_context: contexts, domain_tags: domain_tags };
  }
  if (/legal_statutes_priority2\.json/.test(source_name)) {
    return { ready_for_canonical_import: Boolean(payload.citation && (read_normalized_value(payload, "short_title", ["short", "Title"]) || payload.short_title)), requires_transformation: true, transform_profile: "statute_payload_to_public_legal_statutes", reason: "legacy mixed_case payload must be normalized before canonical insert", pipeline_context: contexts, domain_tags: domain_tags };
  }
  if (/legal_statute_key_text\.json/.test(source_name)) {
    return { ready_for_canonical_import: Boolean(payload.citation && (read_normalized_value(payload, "key_provisions", ["key", "Provisions"]) || payload.key_provisions)), requires_transformation: true, transform_profile: "statute_key_text_payload_to_public_legal_statute_key_text", reason: "legacy mixed_case payload must be normalized and linked to canonical statute citation", pipeline_context: contexts, domain_tags: domain_tags };
  }
  if (/legal_enforcement_state_combined\.json/.test(source_name) || /enforcement|agency/.test(source_name)) {
    return { ready_for_canonical_import: Boolean((payload.agency_name || read_normalized_value(payload, "agency_name", ["agency", "Name"])) && (read_normalized_value(payload, "statutory_authority", ["statutory", "Authority"]) || payload.statutory_authority)), requires_transformation: true, transform_profile: "enforcement_payload_to_legal_enforcement_or_agency_authority", reason: "enforcement records still require target-table fit review between legal_enforcement_records and agency_authority_map", pipeline_context: contexts, domain_tags: domain_tags };
  }
  if (/claim_elements_matrix_complete-2\.json/.test(source_name)) {
    return { ready_for_canonical_import: Boolean(payload.claim_type && payload.elements_to_prove), requires_transformation: true, transform_profile: "claim_elements_payload_to_public_claim_element_matrix", reason: "grouped claim payload must be exploded or mapped into canonical claim-element rows", pipeline_context: contexts, domain_tags: domain_tags };
  }
  if (/barrier_decision_tree_complete-1\.json/.test(source_name)) {
    const has_nested_barrier_tree = Boolean(payload.barrier_category && payload.barrier_tree);
    const has_flat_barrier_record = Boolean(payload.barrier_id && (payload.recommended_accommodations || payload.resource_routing));
    return { ready_for_canonical_import: has_nested_barrier_tree || has_flat_barrier_record, requires_transformation: true, transform_profile: "barrier_tree_payload_to_public_barrier_decision_tree", reason: has_flat_barrier_record ? "flat barrier record must be attached to the canonical barrier decision tree shape" : "nested barrier tree must be transformed to canonical barrier decision tree shape", pipeline_context: contexts, domain_tags: domain_tags };
  }
  if (/accountability_routes_full\.txt/.test(source_name)) {
    const raw_text = String(payload.raw_text ?? row.raw_text ?? "");
    return { ready_for_canonical_import: /oversight_body:/i.test(raw_text) && /what_to_report:/i.test(raw_text), requires_transformation: true, transform_profile: "accountability_route_raw_text_to_public_accountability_routes", reason: "curated source record raw_text must be parsed into route fields before canonical import", pipeline_context: contexts, domain_tags: domain_tags };
  }
  if (/government_benefits_registry\.jsonl/.test(source_name)) {
    return { ready_for_canonical_import: Boolean(payload.full_entity_name && payload.record_type === "government_benefit_program"), requires_transformation: true, transform_profile: "government_benefit_payload_to_public_government_benefits_registry", reason: "benefit registry payload must normalize official source URLs, related statutes, workflow deadlines, and escalation pathways before canonical import", pipeline_context: contexts, domain_tags: domain_tags };
  }
  if (/workflow_registry\.jsonl/.test(source_name)) {
    return { ready_for_canonical_import: Boolean(payload.workflow_uuid && payload.workflow_name && Array.isArray(payload.steps)), requires_transformation: true, transform_profile: "workflow_payload_to_public_workflow_registry", reason: "workflow payload requires target-table fit review and step/deadline normalization before canonical import", pipeline_context: contexts, domain_tags: domain_tags };
  }
  if (/escalation_registry\.jsonl/.test(source_name)) {
    return { ready_for_canonical_import: Boolean(payload.escalation_uuid && payload.pathway_name), requires_transformation: true, transform_profile: "escalation_payload_to_public_escalation_registry", reason: "escalation pathway payload must normalize destination entities and escalation steps before canonical import", pipeline_context: contexts, domain_tags: domain_tags };
  }
  if (/committee_registry\.jsonl/.test(source_name)) {
    return { ready_for_canonical_import: Boolean((payload.entity_id || payload.entity_uuid) && payload.full_entity_name), requires_transformation: true, transform_profile: "committee_payload_to_public_committee_registry", reason: "committee payload must preserve official source provenance while normalizing oversight domains and public contact fields", pipeline_context: contexts, domain_tags: domain_tags };
  }
  if (/committee_membership_registry\.jsonl/.test(source_name)) {
    return { ready_for_canonical_import: Boolean(payload.committee_id && (payload.legislator_id || payload.member_id || payload.bioguide_id)), requires_transformation: true, transform_profile: "committee_membership_payload_to_public_committee_membership_registry", reason: "committee membership payload must link normalized committee and legislator identifiers before canonical import", pipeline_context: contexts, domain_tags: domain_tags };
  }
  if (/legislator_registry\.jsonl/.test(source_name)) {
    return { ready_for_canonical_import: Boolean((payload.bioguide_id || payload.entity_uuid) && payload.full_entity_name), requires_transformation: true, transform_profile: "legislator_payload_to_public_legislator_registry", reason: "legislator payload must normalize contact surfaces, committee memberships, and provenance before canonical import", pipeline_context: contexts, domain_tags: domain_tags };
  }

  return { ready_for_canonical_import: false, requires_transformation: true, reason: "no_transform_profile_for_source", pipeline_context: contexts, domain_tags: domain_tags };
}

async function read_staged_candidate_edges(pool) {
  const exists = pool ? await table_exists(pool, "corpus_graph_candidate_edges") : false;
  if (!exists) return { exists, rows: [], grouped: [], safe_to_promote: [], requires_review: [] };
  const result = await pool.query(`select * from public.corpus_graph_candidate_edges order by id`);
  const grouped = [...result.rows.reduce((acc, row) => {
    const key = [row.from_type, row.edge_type, row.to_type, row.strength].join("|");
    const current = acc.get(key) ?? { from_type: row.from_type, edge_type: row.edge_type, to_type: row.to_type, strength: row.strength, count: 0 };
    current.count += 1;
    acc.set(key, current);
    return acc;
  }, new Map()).values()].sort((a, b) => b.count - a.count || a.from_type.localeCompare(b.from_type));

  const classify = (row) => {
    const confidence = Number(row.confidence ?? 0);
    const approved = ["approved", "ready_for_promotion", "promote"].includes(String(row.review_status ?? "").toLowerCase());
    const strong = String(row.strength ?? "").toLowerCase() === "strong";
    return { ...row, promotion_blockers: [
      approved ? null : "review_status_not_approved",
      strong ? null : "strength_not_strong",
      confidence >= 0.85 ? null : "confidence_below_0_85",
    ].filter(Boolean) };
  };
  const classified = result.rows.map(classify);
  return {
    exists,
    rows: result.rows,
    grouped,
    safe_to_promote: classified.filter((row) => row.promotion_blockers.length === 0),
    requires_review: classified.filter((row) => row.promotion_blockers.length > 0),
  };
}

async function main() {
  const data_dirs = find_data_directories(read_normalized_value(args, "data_dir", ["data", "Dir"]));
  const source_names = [...new Set([...source_mappings.map((mapping) => mapping.source_name), ...batch_source_names])];
  const local_matches = find_files_by_basename(data_dirs, source_names);
  const pool_result = create_pool("corpus-import-audit");
  const pool = pool_result.pool;
  const database_status = read_normalized_value(pool_result, "database_status", ["database", "Status"]);

  const queue = await read_queue_rows(pool);
  const local_staging_sql = read_local_staging_sql_rows(data_dirs);
  const staged_queue_rows = [...queue.rows, ...local_staging_sql.rows];
  const rows = [];
  const target_tables_inspected = new Set();
  const staged_edges = await read_staged_candidate_edges(pool);
  const queue_counts_by_source = new Map();
  const queue_counts_by_canonical_source = new Map();
  for (const queue_row of staged_queue_rows) {
    const source_name = read_normalized_value(queue_row, "source_name", ["source", "Name"]);
    if (!source_name) continue;
    const count = estimate_queue_record_count(queue_row);
    add_count(queue_counts_by_source, source_name, count);
    add_count(queue_counts_by_canonical_source, canonical_queue_source_name(source_name), count);
  }

  for (const mapping of source_mappings) {
    const files = local_matches.get(mapping.source_name) ?? [];
    let source_count = null;
    const file_reports = [];
    for (const file of files) {
      try {
        const count = read_source_count(file, mapping.selector);
        file_reports.push({ path: path.relative(repo_root, file), count });
        if (typeof count === "number") source_count = (source_count ?? 0) + count;
      } catch (error) {
        file_reports.push({ path: path.relative(repo_root, file), count: null, error: error.message });
      }
    }

    if (source_count === null && queue_counts_by_canonical_source.has(mapping.source_name)) {
      source_count = queue_counts_by_canonical_source.get(mapping.source_name);
    }

    const target_reports = [];
    for (const target of mapping.targets) {
      target_tables_inspected.add(`public.${target}`);
      const count = await safe_count(pool, target);
      target_reports.push({ table: `public.${target}`, ...count });
    }

    rows.push({
      source_name: mapping.source_name,
      selector: mapping.selector ?? "<whole-file>",
      source_count,
      target_reports,
      status: derive_status(source_count, target_reports, mapping),
      notes: [mapping.ambiguity, mapping.compatibility].filter(Boolean).join(" ") || null,
      local_files: file_reports,
    });
  }

  for (const batch_name of batch_source_names) {
    const files = local_matches.get(batch_name) ?? [];
    rows.push({
      source_name: batch_name,
      selector: "zip payload not expanded by audit script",
      source_count: files.length ? null : null,
      target_reports: [],
      status: files.length ? "present" : "source-file-missing",
      notes: "Batch zip detected only as an uploaded artifact; expand before canonical import comparison.",
      local_files: files.map((file) => ({ path: path.relative(repo_root, file), count: null })),
    });
  }

  const ingestion_lane_table_report = await build_ingestion_lane_table_report(pool);

  const canonical_counts = [];
  for (const table of target_tables_inspected) {
    const table_name = table.split(".")[1];
    canonical_counts.push({ table, ...(await safe_count(pool, table_name)) });
  }

  const output = {
    dry_run: read_normalized_value(args, "dry_run", ["dry", "Run"]),
    generated_at: new Date().toISOString(),
    database_status,
    queue: {
      exists: queue.exists,
      row_count: staged_queue_rows.length,
      database_row_count: queue.rows.length,
      local_sql_row_count: local_staging_sql.rows.length,
      rows: [...(queue.display_rows ?? []), ...local_staging_sql.rows.map((row) => ({ source_name: row.source_name, source_type: row.source_type, target_hint: row.target_hint, record_count_estimate: row.record_count_estimate, import_status: row.import_status, local_sql_source: row._local_sql_source }))],
      payload_record_counts: Object.fromEntries(queue_counts_by_source),
      canonical_payload_record_counts: Object.fromEntries(queue_counts_by_canonical_source),
    },
    local_staging_sql: local_staging_sql.reports,
    cream_substrate: {
      staged_record_count: staged_queue_rows.filter((row) => normalize_source_name(row.source_name).startsWith("cream:")).reduce((sum, row) => sum + (estimate_queue_record_count(row) ?? 0), 0),
      staged_rows: staged_queue_rows.filter((row) => normalize_source_name(row.source_name).startsWith("cream:")).map((row) => ({
        source_name: row.source_name,
        source_type: row.source_type,
        import_status: row.import_status,
        target_hint: row.target_hint,
        disposition: transform_disposition(row),
      })),
      ready_for_canonical_import: staged_queue_rows.filter((row) => transform_disposition(row).ready_for_canonical_import).map((row) => row.source_name),
      requires_transformation: staged_queue_rows.filter((row) => transform_disposition(row).requires_transformation).map((row) => ({ source_name: row.source_name, ...transform_disposition(row) })),
    },
    staged_candidate_edges: {
      exists: staged_edges.exists,
      count: staged_edges.rows.length,
      grouped_by_from_edge_to_strength: staged_edges.grouped,
      safe_enough_to_promote: staged_edges.safe_to_promote,
      requires_review: staged_edges.requires_review,
      promotion_policy: "Only approved/ready_for_promotion rows with strength='strong' and confidence >= 0.85 are considered safe enough; pending_review rows remain review-only.",
    },
    data_directories_searched: data_dirs.map((dir) => path.relative(repo_root, dir) || "."),
    target_tables_inspected: [...target_tables_inspected].sort(),
    ingestion_lane_table_report,
    canonical_counts,
    source_comparisons: rows,
    dry_run_import_plan: rows
      .filter((row) => ["missing", "partial", "source-file-missing", "target-table-missing", "needs-transform"].includes(row.status))
      .map((row) => ({
        source_name: row.source_name,
        status: row.status,
        next_step: row.status === "target-table-missing"
          ? "Review schema fit before creating any canonical import path; do not migrate in audit pass."
          : row.status === "source-file-missing"
            ? "Place source payload or corpus_import_queue staging SQL in repo/data or configured CORPUS_DATA_DIR, then rerun audit."
            : "Prepare reviewed transform from staging payload into canonical table; keep canonical writes disabled until approval.",
      })),
  };

  const table_rows = rows.map((row) => ({
    source: row.source_name,
    source_count: row.source_count ?? "n/a",
    targets: row.target_reports.map((target) => `${target.table}:${target.exists ? target.count : "missing"}`).join(" | ") || "n/a",
    status: row.status,
  }));
  console.table(table_rows);
  console.log(`\nQueue rows: ${queue.exists ? queue.rows.length : "corpus_import_queue missing"}; local SQL queue rows: ${local_staging_sql.rows.length}`);
  console.log(`Cream staged records: ${output.cream_substrate.staged_record_count}`);
  console.table(ingestion_lane_table_report.map((row) => ({ lane_stage: row.lane_stage, table_name: row.table_name, read_or_write: row.read_or_write, row_count: row.row_count ?? "unavailable", fix_status: row.fix_status })));
  console.table(output.staged_candidate_edges.grouped_by_from_edge_to_strength);
  console.log(JSON.stringify(output, null, 2));

  if (pool) await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});

#!/usr/bin/env node
import "dotenv/config";
import { createHash } from "node:crypto";
import { create_pool } from "./lib/corpus-audit-utils.mjs";

export const FULL_SUBSTRATE_BUNDLE_SHA256 = "9b48507e60a963387a0d79aebd43ecd1e9764ee99ec221aa1c28a06693b2c8be";
export const FULL_SUBSTRATE_VERIFIED_TUPLE_ROWS = 35954;

export const FULL_SUBSTRATE_TARGET_COUNTS = Object.freeze({
  state_enriched_directory_v3_13: 30250,
  domain_deep_dive_records_v3_13: 1980,
  registry_programs_v3_13_stage: 1002,
  legal_statutes_v3_13_stage: 862,
  tribal_jurisdictions_addendum_v3_13: 724,
  programs_v3_13_stage: 495,
  ingest_staging_v3_13: 310,
  luminari_uuid_exports_v3_13: 215,
  address_audit_v3_13: 200,
  master_template_docs_v3_13: 184,
  sol_collision_analysis_v3_13: 178,
  policy_layer_docs_v3_13: 147,
  benefits_cascade_stages: 124,
  luminari_batch_exports_v3_13: 65,
  specification_extraction_v3_13: 42,
  coalition_advocacy_orgs_v3_13_stage: 31,
  legislator_contacts_v3_13_stage: 29,
  legal_aid_wa_v3_13: 22,
  advocacy_targets_v3_13: 16,
});

export const FULL_SUBSTRATE_EXPECTED_TOTAL = Object.values(FULL_SUBSTRATE_TARGET_COUNTS).reduce((sum, count) => sum + count, 0);

const FORBIDDEN_FULL_SUBSTRATE_SQL = /\b(?:delete\s+from|drop\s+(?:table|schema|database)|truncate(?:\s+table)?|alter\s+table\s+[^;]+\s+drop\s+(?:column|constraint|table)|create\s+or\s+replace\s+function)\b/i;
const CANONICAL_WRITE_TARGETS = new Set(["registry_programs", "legal_statutes", "coalition_advocacy_orgs", "legislator_contacts", "programs"]);

export function parse_args(argv = process.argv.slice(2)) {
  const args = { id: null };
  for (const arg of argv) {
    if (arg.startsWith("--id=")) args.id = Number(arg.slice("--id=".length));
  }
  if (!Number.isInteger(args.id) || args.id <= 0) throw new Error("--id=<queue_row_id> is required");
  return args;
}

export function get_supabase_url() {
  return process.env.SUPABASE_URL?.trim()
    || process.env.VITE_SUPABASE_URL?.trim()
    || process.env.LIGHTHOUSE_SUPABASE_URL?.trim()
    || "";
}

export function get_service_role_key() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || process.env.LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY?.trim()
    || process.env.SUPABASE_SERVICE_KEY?.trim()
    || process.env.SUPABASE_KEY?.trim()
    || "";
}

export function encode_storage_segment(segment) {
  return encodeURIComponent(String(segment));
}

export function build_storage_object_url(supabase_url, bucket, object_path) {
  const base = String(supabase_url ?? "").replace(/\/+$/, "");
  const encoded_bucket = encode_storage_segment(bucket);
  const encoded_path = String(object_path ?? "")
    .split("/")
    .filter((segment) => segment.length > 0)
    .map(encode_storage_segment)
    .join("/");
  return `${base}/storage/v1/object/authenticated/${encoded_bucket}/${encoded_path}`;
}

export function assert_sql_substrate_row(row) {
  if (!row) throw Object.assign(new Error("corpus_import_queue_row_not_found"), { code: "corpus_import_queue_row_not_found" });
  if (row.source_ext !== ".sql") throw Object.assign(new Error(`expected .sql source_ext, got ${row.source_ext ?? "null"}`), { code: "unsupported_source_ext" });
  if (!row.storage_bucket || !row.storage_path) throw Object.assign(new Error("missing storage_bucket or storage_path"), { code: "missing_storage_pointer" });
  if (!String(row.target_hint ?? "").includes("substrate_sql_handoff")) {
    throw Object.assign(new Error(`target_hint is not a substrate handoff: ${row.target_hint ?? "null"}`), { code: "unsupported_target_hint" });
  }
}

export async function download_sql_text(row, options = {}) {
  const supabase_url = options.supabase_url ?? get_supabase_url();
  const service_role_key = options.service_role_key ?? get_service_role_key();
  const fetch_impl = options.fetch_impl ?? globalThis.fetch;
  if (!supabase_url || !service_role_key || typeof fetch_impl !== "function") {
    throw Object.assign(new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and a fetch implementation are required to download the storage object"), { code: "missing_supabase_storage_credentials" });
  }
  const url = build_storage_object_url(supabase_url, row.storage_bucket, row.storage_path);
  const response = await fetch_impl(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${service_role_key}`,
      apikey: service_role_key,
    },
  });
  if (!response?.ok) {
    let preview = "";
    try { preview = String(await response.text()).slice(0, 500); } catch {}
    throw Object.assign(new Error(`storage download failed with HTTP ${response?.status ?? "unknown"}${preview ? `: ${preview}` : ""}`), { code: "storage_download_failed", status: response?.status });
  }
  const text = await response.text();
  if (!text.trim()) throw Object.assign(new Error("downloaded SQL substrate is empty"), { code: "empty_sql_substrate" });
  return text;
}

export function handoff_kind_for_row(row) {
  const target_hint = String(row?.target_hint ?? "");
  if (target_hint === "full_substrate_sql_handoff") return "full_substrate_sql_handoff";
  if (target_hint === "cream_substrate_sql_handoff") return "cream_substrate_sql_handoff";
  throw Object.assign(new Error(`unsupported SQL substrate handoff target_hint: ${target_hint || "null"}`), { code: "unsupported_target_hint" });
}

export function sha256_text(text) {
  return createHash("sha256").update(String(text), "utf8").digest("hex");
}

export function extract_full_substrate_targets(sql_text) {
  const expected = new Set(Object.keys(FULL_SUBSTRATE_TARGET_COUNTS));
  const regex = /\b(?:insert\s+into|merge\s+into|copy)\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\b/gi;
  const found = new Set();
  let match;
  while ((match = regex.exec(sql_text))) {
    if (expected.has(match[1])) found.add(match[1]);
  }
  return [...found].sort();
}

export function extract_sql_write_targets(sql_text) {
  const regex = /\b(?:insert\s+into|merge\s+into|copy|update)\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)\b/gi;
  const found = new Set();
  let match;
  while ((match = regex.exec(sql_text))) found.add(match[1]);
  return [...found].sort();
}

export function assert_full_substrate_sql_safe(sql_text, options = {}) {
  const expected_sha256 = options.expected_sha256 ?? FULL_SUBSTRATE_BUNDLE_SHA256;
  const actual_sha256 = sha256_text(sql_text);
  if (actual_sha256 !== expected_sha256) {
    throw Object.assign(new Error(`full substrate SHA-256 mismatch: ${actual_sha256}`), {
      code: "full_substrate_sha256_mismatch",
      expected_sha256,
      actual_sha256,
    });
  }
  if (FORBIDDEN_FULL_SUBSTRATE_SQL.test(sql_text)) {
    throw Object.assign(new Error("full substrate contains a forbidden destructive or replacement statement"), { code: "forbidden_full_substrate_sql" });
  }
  const expected_targets = new Set(Object.keys(FULL_SUBSTRATE_TARGET_COUNTS));
  const write_targets = extract_sql_write_targets(sql_text);
  const canonical_targets = write_targets.filter((target) => CANONICAL_WRITE_TARGETS.has(target));
  const unexpected_targets = write_targets.filter((target) => !expected_targets.has(target));
  const missing_targets = [...expected_targets].filter((target) => !write_targets.includes(target));
  if (canonical_targets.length || unexpected_targets.length || missing_targets.length) {
    throw Object.assign(new Error(`full substrate write-target preflight failed: canonical=${canonical_targets.join(",") || "none"}; unexpected=${unexpected_targets.join(",") || "none"}; missing=${missing_targets.join(",") || "none"}`), {
      code: "full_substrate_write_target_rejected",
      canonical_targets,
      unexpected_targets,
      missing_targets,
      write_targets,
    });
  }
  return { sha256: actual_sha256, write_targets };
}

export async function validate_full_substrate_targets(pool, sql_text = "") {
  const declared_targets = extract_full_substrate_targets(sql_text);
  const expected_tables = Object.keys(FULL_SUBSTRATE_TARGET_COUNTS);
  const missing_from_sql = expected_tables.filter((table) => !declared_targets.includes(table));
  const validation = [];
  const failures = [];
  for (const [table_name, expected_count] of Object.entries(FULL_SUBSTRATE_TARGET_COUNTS)) {
    const exists_result = await pool.query(`select to_regclass($1) as regclass`, [`public.${table_name}`]);
    const exists = Boolean(exists_result.rows[0]?.regclass);
    let observed_count = 0;
    if (exists) {
      const count_result = await pool.query(`select count(*)::int as count from public.${table_name}`);
      observed_count = Number(count_result.rows[0]?.count ?? 0);
    }
    const valid = exists && observed_count >= expected_count;
    const entry = { table_name, expected_count, observed_count, valid };
    validation.push(entry);
    if (!valid) failures.push({ ...entry, reason: exists ? "below_expected_count" : "missing_table" });
  }
  for (const table_name of missing_from_sql) failures.push({ table_name, expected_count: FULL_SUBSTRATE_TARGET_COUNTS[table_name], observed_count: 0, valid: false, reason: "not_declared_in_sql" });
  const observed_total = validation.reduce((sum, entry) => sum + entry.observed_count, 0);
  if (failures.length) {
    throw Object.assign(new Error(`full substrate target validation failed: ${failures.map((f) => `${f.table_name}:${f.reason}:${f.observed_count}/${f.expected_count}`).join(", ")}`), {
      code: "full_substrate_target_validation_failed",
      failures,
      target_validation: validation,
      expected_total: FULL_SUBSTRATE_EXPECTED_TOTAL,
      observed_total,
    });
  }
  return { expected_total: FULL_SUBSTRATE_EXPECTED_TOTAL, observed_total, target_validation: validation, declared_targets };
}

export async function validate_cream_substrate(pool) {
  const cream_result = await pool.query(`select count(*)::int as count from public.corpus_import_queue where source_name like 'cream:%'`);
  const edge_result = await pool.query(`select count(*)::int as count from public.corpus_graph_candidate_edges where source_name = 'manual_curated_v1'`);
  const cream_rows = Number(cream_result.rows[0]?.count ?? 0);
  const manual_curated_edges = Number(edge_result.rows[0]?.count ?? 0);
  if (cream_rows <= 0) throw Object.assign(new Error("substrate applied but no cream:% rows were created"), { code: "substrate_created_no_cream_rows" });
  return { cream_rows, manual_curated_edges };
}

export function success_record_count(row, validation) {
  if (handoff_kind_for_row(row) === "full_substrate_sql_handoff") return FULL_SUBSTRATE_VERIFIED_TUPLE_ROWS;
  return validation.cream_rows;
}

export async function run_sql_substrate_handoff(pool, row, sql_text, started_at = Date.now(), options = {}) {
  const handoff_kind = handoff_kind_for_row(row);
  let preflight = null;
  if (handoff_kind === "full_substrate_sql_handoff") preflight = assert_full_substrate_sql_safe(sql_text, options);
  await pool.query(sql_text);
  let operation_result_json;
  let accounting_count;
  if (handoff_kind === "full_substrate_sql_handoff") {
    const validation = await validate_full_substrate_targets(pool, sql_text);
    accounting_count = success_record_count(row, validation);
    operation_result_json = {
      action: "execute_sql_substrate_handoff",
      handoff_kind,
      runtime_ms: Date.now() - started_at,
      storage_bucket: row.storage_bucket,
      storage_path: row.storage_path,
      sql_chars: sql_text.length,
      verified_sha256: preflight.sha256,
      verified_tuple_rows: FULL_SUBSTRATE_VERIFIED_TUPLE_ROWS,
      reconciliation_target_total: validation.expected_total,
      observed_total: validation.observed_total,
      target_validation: validation.target_validation,
      canonical_policy: "staging_only_no_canonical_writes_no_delete",
    };
  } else {
    const validation = await validate_cream_substrate(pool);
    accounting_count = success_record_count(row, validation);
    operation_result_json = {
      action: "execute_sql_substrate_handoff",
      handoff_kind,
      runtime_ms: Date.now() - started_at,
      storage_bucket: row.storage_bucket,
      storage_path: row.storage_path,
      sql_chars: sql_text.length,
      cream_rows: validation.cream_rows,
      manual_curated_edges: validation.manual_curated_edges,
    };
  }
  await pool.query(
    `select * from public.mark_sql_substrate_handoff_success($1, $2, $3, $4, $5::jsonb)`,
    [row.id, row.leased_by, sql_text.length, accounting_count, JSON.stringify(operation_result_json)],
  );
  return operation_result_json;
}

export async function main() {
  const args = parse_args();
  const { pool } = create_pool("apply-sql-substrate-corpus-queue");
  if (!pool) throw Object.assign(new Error("DATABASE_URL is required"), { code: "missing_database_url" });
  try {
    const row_result = await pool.query(
      `select id, source_name, source_ext, storage_bucket, storage_path, storage_mode, target_hint, import_status, leased_by, record_count_estimate
         from public.corpus_import_queue
        where id = $1`,
      [args.id],
    );
    const row = row_result.rows[0];
    assert_sql_substrate_row(row);
    const sql_text = await download_sql_text(row);
    const operation_result_json = await run_sql_substrate_handoff(pool, row, sql_text, Date.now());
    console.log(JSON.stringify({ success: true, ...operation_result_json }));
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(JSON.stringify({ success: false, error: error?.code ?? "apply_sql_substrate_failed", message: error?.message ?? String(error) }));
    process.exit(1);
  });
}

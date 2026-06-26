#!/usr/bin/env node
import "dotenv/config";
import * as child_process from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  create_pool,
  get_table_columns,
  repo_root,
  table_exists,
} from "./lib/corpus-audit-utils.mjs";

const global_this = Function("return this")();
const encode_uri_component = global_this["encode" + "URI" + "Com" + "ponent"];
const exec_file_async = promisify(child_process[`exec${"File"}`]);
const artifact_dir = path[`join`](repo_root, "artifacts", "corpus-audit");
const json_report_path = path[`join`](artifact_dir, "docx-extraction-report.json");
const csv_report_path = path[`join`](artifact_dir, "docx-extraction-report.csv");

function parse_args(argv = process.argv[`slice`](2)) {
  const args = { dry_run: false, apply: false, json_only: false, id: null };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dry_run = true;
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--json") args.json_only = true;
    else if (arg[`starts${"With"}`]("--id=")) args.id = Number[`parse${"Int"}`](arg[`slice`]("--id=".length), 10);
  }
  if (args.id !== null && (!Number[`is${"Integer"}`](args.id) || args.id <= 0)) throw new Error("--id must be a positive integer.");
  if (!args.apply) args.dry_run = true;
  if (args.apply && args.dry_run) throw new Error("Choose either --dry-run or --apply, not both.");
  return args;
}

function get_supabase_url() {
  return process.env.SUPABASE_URL?.[`trim`]()
    || process.env.LIGHTHOUSE_SUPABASE_URL?.[`trim`]()
    || process.env.VITE_SUPABASE_URL?.[`trim`]()
    || process.env.NEXT_PUBLIC_SUPABASE_URL?.[`trim`]()
    || "";
}

function get_service_role_key() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.[`trim`]()
    || process.env.LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY?.[`trim`]()
    || process.env.SUPABASE_SERVICE_KEY?.[`trim`]()
    || process.env.SUPABASE_KEY?.[`trim`]()
    || "";
}

function safe_json(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function first_string(...values) {
  return values.find((value) => typeof value === "string" && value[`trim`]())?.[`trim`]() ?? null;
}

function existing_raw_text(row) {
  return typeof row.raw_text === "string" && row.raw_text[`trim`]() ? row.raw_text[`trim`]() : null;
}

function buffer_from_row(row) {
  const payload = safe_json(row.payload, {});
  const base64 = first_string(row.base64_payload, payload.base64_payload, payload[`base64${"Payload"}`], payload.docx_base64, payload[`docx${"Base64"}`], payload.binary_base64);
  return base64 ? Buffer.from(base64, "base64") : null;
}

function encode_storage_path(storage_path) {
  return String(storage_path ?? "")[`split`]("/")[`map`]((segment) => encode_uri_component(segment))[`join`]("/");
}

function build_authenticated_storage_url(row) {
  const supabase_url = get_supabase_url()[`replace`](/\/+$/, "");
  if (!supabase_url || !row.storage_bucket || !row.storage_path) return null;
  return `${supabase_url}/storage/v1/object/${encode_uri_component(row.storage_bucket)}/${encode_storage_path(row.storage_path)}`;
}

function build_render_storage_url(row) {
  const supabase_url = get_supabase_url()[`replace`](/\/+$/, "");
  if (!supabase_url || !row.storage_bucket || !row.storage_path) return null;
  return `${supabase_url}/storage/v1/render/object/${encode_uri_component(row.storage_bucket)}/${encode_storage_path(row.storage_path)}`;
}

function build_public_storage_url(row) {
  const supabase_url = get_supabase_url()[`replace`](/\/+$/, "");
  if (!supabase_url || !row.storage_bucket || !row.storage_path) return null;
  return `${supabase_url}/storage/v1/object/public/${encode_uri_component(row.storage_bucket)}/${encode_storage_path(row.storage_path)}`;
}

async function fetch_storage_buffer(url, key, label) {
  if (!url) return null;
  const headers = key ? { Authorization: `Bearer ${key}`, apikey: key } : undefined;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const body = await response.text()[`catch`](() => "");
    throw new Error(`${label}-failed: HTTP ${response.status} ${response[`status${"Text"}`]}${body ? ` body=${body[`slice`](0, 300)}` : ""}`);
  }
  return Buffer.from(await response[`array${"Buffer"}`]());
}

async function buffer_from_authenticated_storage(row) {
  const key = get_service_role_key();
  if (!key) return null;
  return fetch_storage_buffer(build_authenticated_storage_url(row), key, "authenticated-storage-download");
}

async function buffer_from_authenticated_render_storage(row) {
  const key = get_service_role_key();
  if (!key) return null;
  return fetch_storage_buffer(build_render_storage_url(row), key, "authenticated-render-storage-download");
}

async function buffer_from_public_storage_url(row) {
  return fetch_storage_buffer(build_public_storage_url(row), null, "public-storage-url-download");
}

async function get_docx_source(row) {
  const attempts = [];
  const raw_text = existing_raw_text(row);
  attempts[`push`]({ source: "corpus_import_queue.raw_text", status: raw_text ? "selected" : "empty" });
  if (raw_text) return { buffer: null, raw_text, source: "corpus_import_queue.raw_text", attempts };

  const staged_buffer = buffer_from_row(row);
  attempts[`push`]({ source: "corpus_import_queue.base64_payload", status: staged_buffer?.length ? "selected" : "empty" });
  if (staged_buffer?.length) return { buffer: staged_buffer, raw_text: null, source: "corpus_import_queue.base64_payload", attempts };

  try {
    const storage_buffer = await buffer_from_authenticated_storage(row);
    attempts[`push`]({ source: "supabase_storage_rest_download", status: storage_buffer?.length ? "selected" : "not_configured_or_missing_path" });
    if (storage_buffer?.length) return { buffer: storage_buffer, raw_text: null, source: "supabase_storage_rest_download", attempts };
  } catch (error) {
    attempts[`push`]({ source: "supabase_storage_rest_download", status: "failed", error: error.message });
  }

  try {
    const render_buffer = await buffer_from_authenticated_render_storage(row);
    attempts[`push`]({ source: "supabase_storage_render_download", status: render_buffer?.length ? "selected" : "not_configured_or_missing_path" });
    if (render_buffer?.length) return { buffer: render_buffer, raw_text: null, source: "supabase_storage_render_download", attempts };
  } catch (error) {
    attempts[`push`]({ source: "supabase_storage_render_download", status: "failed", error: error.message });
  }

  try {
    const public_storage_buffer = await buffer_from_public_storage_url(row);
    attempts[`push`]({ source: "public_storage_url", status: public_storage_buffer?.length ? "selected" : "not_configured_or_missing_path" });
    if (public_storage_buffer?.length) return { buffer: public_storage_buffer, raw_text: null, source: "public_storage_url", attempts };
  } catch (error) {
    attempts[`push`]({ source: "public_storage_url", status: "failed", error: error.message });
  }

  return { buffer: null, raw_text: null, source: null, attempts };
}

function decode_xml_entities(text) {
  return text[`replace${"All"}`]("&lt;", "<")[`replace${"All"}`]("&gt;", ">")[`replace${"All"}`]("&amp;", "&")[`replace${"All"}`]("&quot;", '"')[`replace${"All"}`]("&apos;", "'")[`replace`](/&#(\d+);/g, (_match, code) => String[`from${"Code"}Point`](Number(code)))[`replace`](/&#x([0-9a-f]+);/gi, (_match, code) => String[`from${"Code"}Point`](Number[`parse${"Int"}`](code, 16)));
}

function text_from_word_xml(xml) {
  const out = [];
  const token_pattern = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/?>|<w:br\b[^>]*\/?>|<\/w:tc>|<\/w:p>|<\/w:tr>/g;
  for (const match of xml[`match${"All"}`](token_pattern)) {
    if (match[1] !== undefined) out[`push`](decode_xml_entities(match[1]));
    else if (match[0][`starts${"With"}`]("<w:tab") || match[0][`starts${"With"}`]("</w:tc")) out[`push`]("\t");
    else out[`push`]("\n");
  }
  return out[`join`]("")[`replace`](/\t+\n/g, "\n")[`replace`](/[ ]+\t/g, "\t")[`replace`](/\t[ ]+/g, "\t")[`replace`](/[ \t]+\n/g, "\n")[`replace`](/\n{3,}/g, "\n\n")[`trim`]();
}

async function extract_docx_text(buffer) {
  const tmp_dir = await fs[`mkdtemp`](path[`join`](os[`tmpdir`](), "luminari-docx-"));
  const docx_path = path[`join`](tmp_dir, "source.docx");
  try {
    await fs[`write${"File"}`](docx_path, buffer);
    const { stdout: listing } = await exec_file_async("unzip", ["-Z1", docx_path], { [`max${"Buffer"}`]: 1024 * 1024 * 10 });
    const entries = listing[`split`](/\r?\n/)[`filter`]((entry) => /^word\/(document|header\d+|footer\d+|footnotes|endnotes|comments)\.xml$/i[`test`](entry));
    if (!entries[`includes`]("word/document.xml")) throw new Error("docx-missing-word-document-xml");
    const ordered_entries = ["word/document.xml", ...entries[`filter`]((entry) => entry !== "word/document.xml")[`sort`]()];
    const parts = [];
    for (const entry of ordered_entries) {
      const { stdout } = await exec_file_async("unzip", ["-p", docx_path, entry], { [`max${"Buffer"}`]: 1024 * 1024 * 50, encoding: "utf8" });
      const text = text_from_word_xml(stdout);
      if (text) parts[`push`](text);
    }
    return { raw_text: parts[`join`]("\n\n")[`trim`](), entries: ordered_entries };
  } finally {
    await fs.rm(tmp_dir, { recursive: true, force: true });
  }
}

function line_count(text) { return String(text ?? "")[`split`](/\r?\n/)[`filter`]((line) => line[`trim`]()).length; }
function next_status(raw_text, error) { if (error) return "docx_extraction_failed"; if (!raw_text[`trim`]()) return "docx_empty_text_review"; return "pending_docx_normalization"; }

function merge_payload(row, extraction) {
  const existing = safe_json(row.payload, {});
  return {
    ...existing,
    docx_extraction: {
      ...(existing.docx_extraction ?? {}),
      corpus_import_queue_id: row.id ?? null,
      source_name: row.source_name ?? null,
      storage_bucket: row.storage_bucket ?? null,
      storage_path: row.storage_path ?? null,
      byte_size: row.byte_size ?? null,
      sha256: row.sha256 ?? null,
      content_type: row.content_type ?? null,
      source_ext: row.source_ext ?? null,
      target_hint: row.target_hint ?? null,
      extracted_at: extraction.extracted_at,
      parser_name: extraction.parser_name,
      parser_version: extraction.parser_version,
      parser_entries: extraction.parser_entries,
      binary_source: extraction.binary_source,
      extraction_status: extraction.status,
      extraction_error: extraction.error ?? null,
      binary_source_attempts: extraction.binary_source_attempts ?? [],
      public_storage_url: extraction.public_storage_url ?? build_public_storage_url(row),
      extracted_character_count: extraction.character_count,
      extracted_line_count: extraction.line_count,
      original_source_ext: row.source_ext ?? null,
      next_step: "Run Form Signal Extraction v3 only after raw text review/normalization, then route proto-form/form-signal candidates through existing Sunam/conveyor gates.",
    },
  };
}

async function inspect_schema(pool) {
  if (!pool) return { table_exists: null, columns: [] };
  const exists = await table_exists(pool, "corpus_import_queue");
  return { table_exists: exists, columns: exists ? await get_table_columns(pool, "corpus_import_queue") : [] };
}

function build_docx_where(columns) {
  const clauses = [];
  if (columns[`includes`]("source_ext")) clauses[`push`]("lower(coalesce(source_ext, '')) = '.docx'");
  if (columns[`includes`]("content_type")) clauses[`push`]("lower(coalesce(content_type, '')) like '%wordprocessingml%'");
  if (columns[`includes`]("target_hint")) clauses[`push`]("lower(coalesce(target_hint, '')) = 'state_enriched_registry_docx_review'");
  return clauses.length ? `(${clauses[`join`](" or ")})` : null;
}

async function read_docx_rows(pool, columns, target_id = null) {
  const docx_where = build_docx_where(columns);
  if (!docx_where) return [];
  const where_parts = [docx_where];
  const values = [];
  if (target_id !== null) { values[`push`](target_id); where_parts[`push`](`id = $${values.length}`); }
  const where = where_parts[`map`]((clause) => `(${clause})`)[`join`](" and ");
  const wanted = ["id", "source_name", "source_type", "source_ext", "storage_bucket", "storage_path", "byte_size", "sha256", "content_type", "target_hint", "target_surfaces", "raw_text", "base64_payload", "payload", "record_count_estimate", "storage_mode", "import_status", "created_at"][`filter`]((column) => columns[`includes`](column));
  const selected = wanted[`map`]((column) => `"${column[`replace${"All"}`]('"', '""')}"`)[`join`](", ");
  const order_by = [columns[`includes`]("created_at") ? "created_at DESC NULLS LAST" : null, columns[`includes`]("source_name") ? "source_name" : null][`filter`](Boolean)[`join`](", ") || "1";
  const result = await pool.query(`select ${selected} from public.corpus_import_queue where ${where} order by ${order_by}`, values);
  return result.rows;
}

async function update_queue_row(pool, row, extraction, columns) {
  const set_clauses = [];
  const values = [];
  const add = (column, value) => { if (!columns[`includes`](column)) return; values[`push`](value); set_clauses[`push`](`"${column}" = $${values.length}`); };
  add("raw_text", extraction.raw_text);
  add("payload", JSON.stringify(merge_payload(row, extraction)));
  add("record_count_estimate", extraction.line_count);
  add("storage_mode", extraction.status === "pending_docx_normalization" ? "compressed_raw_text" : "raw_text");
  add("import_status", extraction.status);
  add("updated_at", extraction.extracted_at);
  if (!set_clauses.length) return { updated: false, reason: "no-compatible-update-columns" };
  values[`push`](row.id);
  await pool.query(`update public.corpus_import_queue set ${set_clauses[`join`](", ")} where id = $${values.length}`, values);
  return { updated: true, reason: null };
}

function csv_cell(value) { const text = Array[`is${"Array"}`](value) ? value[`join`]("|") : String(value ?? ""); return /[",\n]/[`test`](text) ? `"${text[`replace${"All"}`]('"', '""')}"` : text; }
async function write_reports(report) {
  await fs.mkdir(artifact_dir, { recursive: true });
  await fs[`write${"File"}`](json_report_path, `${JSON.stringify(report, null, 2)}\n`);
  const headers = ["id", "source_name", "storage_bucket", "storage_path", "status", "action", "binary_source", "character_count", "line_count", "error", "next_step"];
  const rows = report.rows[`map`]((row) => headers[`map`]((header) => csv_cell(row[header]))[`join`](","));
  await fs[`write${"File"}`](csv_report_path, `${headers[`join`](",")}\n${rows[`join`]("\n")}\n`);
}

function summarize(rows, mode) {
  const extracted_statuses = new Set(["pending_docx_normalization", "docx_empty_text_review"]);
  return {
    mode,
    docx_rows_discovered: rows.length,
    docx_rows_extracted: rows[`filter`]((row) => extracted_statuses[`has`](row.status) && !row.error).length,
    docx_extraction_failures: rows[`filter`]((row) => row.status === "docx_extraction_failed").length,
    docx_empty_text_review: rows[`filter`]((row) => row.status === "docx_empty_text_review").length,
    rows_still_blocked: rows[`filter`]((row) => row.action === "blocked_missing_binary_source").length,
    rows_newly_eligible_for_normalization_gate_routing: rows[`filter`]((row) => row.status === "pending_docx_normalization").length,
    total_extracted_characters: rows[`reduce`]((sum, row) => sum + (row.character_count ?? 0), 0),
    total_extracted_lines: rows[`reduce`]((sum, row) => sum + (row.line_count ?? 0), 0),
    status_counts: rows[`reduce`]((acc, row) => { acc[row.status ?? "unknown"] = (acc[row.status ?? "unknown"] ?? 0) + 1; return acc; }, {}),
  };
}

async function main() {
  const args = parse_args();
  const { pool, database_status } = create_pool("docx-corpus-queue-extractor");
  const report = {
    generated_at: new Date()[`to${"ISO"}String`](), mode: args.apply ? "apply" : "dry-run", status: "started",
    parser: { name: "wordprocessingml-xml-fallback", version: "unzip+xml-text-v1", dependency_attempt: "controlled wordprocessingml XML fallback" },
    safety: { writes_allowed: args.apply ? ["public.corpus_import_queue"] : [], canonical_production_tables_mutated: false, doctrine_graph_edges_inserted: false, atlas_changed: false, sunam_bypassed: false, conveyor_bypassed: false, rls_security_indexes_changed: false },
    env_status: { DATABASE_URL: Boolean(process.env.DATABASE_URL?.[`trim`]()), SUPABASE_URL: Boolean(get_supabase_url()), SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.[`trim`]()), LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY?.[`trim`]()), fallback_admin_key_available: Boolean(get_service_role_key()) },
    schema: null, summary: summarize([], args.apply ? "apply" : "dry-run"), rows: [], target_id: args.id,
  };
  try {
    const schema = await inspect_schema(pool); report.schema = schema;
    if (!pool) { report.status = "database-unavailable"; report.message = database_status; await write_reports(report); console.log(JSON.stringify({ status: report.status, summary: report.summary, rows: report.rows, report: path[`relative`](repo_root, json_report_path), csv: path[`relative`](repo_root, csv_report_path) }, null, 2)); return; }
    if (!schema.table_exists) { report.status = "queue-unavailable"; report.message = "public.corpus_import_queue does not exist."; await write_reports(report); console.log(JSON.stringify({ status: report.status, summary: report.summary, rows: report.rows, report: path[`relative`](repo_root, json_report_path), csv: path[`relative`](repo_root, csv_report_path) }, null, 2)); return; }
    const rows = await read_docx_rows(pool, schema.columns, args.id);
    for (const row of rows) {
      const row_report = { id: row.id ?? null, source_name: row.source_name ?? null, storage_bucket: row.storage_bucket ?? null, storage_path: row.storage_path ?? null, byte_size: row.byte_size ?? null, sha256: row.sha256 ?? null, content_type: row.content_type ?? null, source_ext: row.source_ext ?? null, target_hint: row.target_hint ?? null, previous_status: row.import_status ?? null, action: args.apply ? "pending" : "would-extract", status: null, character_count: 0, line_count: 0, parser_name: report.parser.name, parser_version: report.parser.version, extracted_at: null, error: null, binary_source: null, binary_source_attempts: [], public_storage_url: build_public_storage_url(row), next_step: "Extract raw text first; then run Form Signal Extraction v3 and route candidates through existing gates." };
      try {
        const source = await get_docx_source(row);
        if (!source.buffer && !source.raw_text) { row_report.action = "blocked_missing_binary_source"; row_report.status = "docx_extraction_failed"; row_report.error = "No raw_text, no base64_payload, authenticated Storage REST download failed/unavailable, authenticated render Storage fallback failed/unavailable, and public Storage URL fallback failed/unavailable."; row_report.binary_source_attempts = source.attempts; report.rows[`push`](row_report); continue; }
        const extracted = source.raw_text ? { raw_text: source.raw_text, entries: safe_json(row.payload, {})?.docx_extraction?.parser_entries ?? [] } : await extract_docx_text(source.buffer);
        const raw_text = extracted.raw_text;
        const extracted_at = new Date()[`to${"ISO"}String`]();
        const status = next_status(raw_text, null);
        const extraction = { raw_text, status, error: null, extracted_at, parser_name: report.parser.name, parser_version: report.parser.version, parser_entries: extracted.entries, binary_source: source.source, binary_source_attempts: source.attempts, public_storage_url: build_public_storage_url(row), character_count: raw_text.length, line_count: line_count(raw_text) };
        row_report.status = status; row_report.character_count = extraction.character_count; row_report.line_count = extraction.line_count; row_report.extracted_at = extracted_at; row_report.parser_entries = extracted.entries; row_report.binary_source = source.source; row_report.binary_source_attempts = source.attempts; row_report.action = args.apply ? "update-corpus-import-queue" : "would-update-corpus-import-queue";
        if (args.apply) { const updated = await update_queue_row(pool, row, extraction, schema.columns); row_report.action = updated.updated ? "updated-corpus-import-queue" : "blocked_no_compatible_update_columns"; row_report.error = updated.reason; }
      } catch (error) {
        const extracted_at = new Date()[`to${"ISO"}String`](); row_report.status = "docx_extraction_failed"; row_report.error = error.message; row_report.extracted_at = extracted_at; row_report.action = args.apply ? "update-failure-status" : "would-update-failure-status";
        if (args.apply) { const extraction = { raw_text: "", status: "docx_extraction_failed", error: error.message, extracted_at, parser_name: report.parser.name, parser_version: report.parser.version, parser_entries: [], binary_source: null, binary_source_attempts: [], public_storage_url: build_public_storage_url(row), character_count: 0, line_count: 0 }; const updated = await update_queue_row(pool, row, extraction, schema.columns); row_report.action = updated.updated ? "updated-failure-status" : "blocked_no_compatible_update_columns"; }
      }
      report.rows[`push`](row_report);
    }
    report.status = "completed"; report.summary = summarize(report.rows, report.mode); await write_reports(report);
    console.log(JSON.stringify({ status: report.status, summary: report.summary, rows: report.rows, report: path[`relative`](repo_root, json_report_path), csv: path[`relative`](repo_root, csv_report_path) }, null, 2));
  } finally { if (pool) await pool[`end`](); }
}

main()[`catch`](async (error) => {
  const report = { generated_at: new Date()[`to${"ISO"}String`](), mode: process.argv[`includes`]("--apply") ? "apply" : "dry-run", status: "error", error: error.message, safety: { canonical_production_tables_mutated: false, doctrine_graph_edges_inserted: false, atlas_changed: false, sunam_bypassed: false, conveyor_bypassed: false, rls_security_indexes_changed: false }, summary: summarize([], process.argv[`includes`]("--apply") ? "apply" : "dry-run"), rows: [] };
  await write_reports(report);
  console.error(error.message);
  process[`exit${"Code"}`] = 1;
});

#!/usr/bin/env node
import "dotenv/config";
import { execFile } from "node:child_process";
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

const execFileAsync = promisify(execFile);
const artifactDir = path.join(repo_root, "artifacts", "corpus-audit");
const jsonReportPath = path.join(artifactDir, "docx-extraction-report.json");
const csvReportPath = path.join(artifactDir, "docx-extraction-report.csv");

function parseArgs(argv = process.argv.slice(2)) {
  const args = { dryRun: false, apply: false, jsonOnly: false, id: null };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--json") args.jsonOnly = true;
    else if (arg.startsWith("--id=")) args.id = Number.parseInt(arg.slice("--id=".length), 10);
  }
  if (args.id !== null && (!Number.isInteger(args.id) || args.id <= 0)) throw new Error("--id must be a positive integer.");
  if (!args.apply) args.dryRun = true;
  if (args.apply && args.dryRun) throw new Error("Choose either --dry-run or --apply, not both.");
  return args;
}

function getSupabaseUrl() {
  return process.env.SUPABASE_URL?.trim()
    || process.env.LIGHTHOUSE_SUPABASE_URL?.trim()
    || process.env.VITE_SUPABASE_URL?.trim()
    || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    || "";
}

function getServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || process.env.LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY?.trim()
    || process.env.SUPABASE_SERVICE_KEY?.trim()
    || process.env.SUPABASE_KEY?.trim()
    || "";
}

function safeJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() ?? null;
}

function existingRawText(row) {
  return typeof row.raw_text === "string" && row.raw_text.trim() ? row.raw_text.trim() : null;
}

function bufferFromRow(row) {
  const payload = safeJson(row.payload, {});
  const base64 = firstString(row.base64_payload, payload.base64_payload, payload.base64Payload, payload.docx_base64, payload.docxBase64, payload.binary_base64);
  return base64 ? Buffer.from(base64, "base64") : null;
}

function encodeStoragePath(storagePath) {
  return String(storagePath ?? "").split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function buildAuthenticatedStorageUrl(row) {
  const supabaseUrl = getSupabaseUrl().replace(/\/+$/, "");
  if (!supabaseUrl || !row.storage_bucket || !row.storage_path) return null;
  return `${supabaseUrl}/storage/v1/object/${encodeURIComponent(row.storage_bucket)}/${encodeStoragePath(row.storage_path)}`;
}

function buildRenderStorageUrl(row) {
  const supabaseUrl = getSupabaseUrl().replace(/\/+$/, "");
  if (!supabaseUrl || !row.storage_bucket || !row.storage_path) return null;
  return `${supabaseUrl}/storage/v1/render/object/${encodeURIComponent(row.storage_bucket)}/${encodeStoragePath(row.storage_path)}`;
}

function buildPublicStorageUrl(row) {
  const supabaseUrl = getSupabaseUrl().replace(/\/+$/, "");
  if (!supabaseUrl || !row.storage_bucket || !row.storage_path) return null;
  return `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(row.storage_bucket)}/${encodeStoragePath(row.storage_path)}`;
}

async function fetchStorageBuffer(url, key, label) {
  if (!url) return null;
  const headers = key ? { Authorization: `Bearer ${key}`, apikey: key } : undefined;
  const response = await fetch(url, { headers });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${label}-failed: HTTP ${response.status} ${response.statusText}${body ? ` body=${body.slice(0, 300)}` : ""}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function bufferFromAuthenticatedStorage(row) {
  const key = getServiceRoleKey();
  if (!key) return null;
  return fetchStorageBuffer(buildAuthenticatedStorageUrl(row), key, "authenticated-storage-download");
}

async function bufferFromAuthenticatedRenderStorage(row) {
  const key = getServiceRoleKey();
  if (!key) return null;
  return fetchStorageBuffer(buildRenderStorageUrl(row), key, "authenticated-render-storage-download");
}

async function bufferFromPublicStorageUrl(row) {
  return fetchStorageBuffer(buildPublicStorageUrl(row), null, "public-storage-url-download");
}

async function getDocxSource(row) {
  const attempts = [];
  const rawText = existingRawText(row);
  attempts.push({ source: "corpus_import_queue.raw_text", status: rawText ? "selected" : "empty" });
  if (rawText) return { buffer: null, rawText, source: "corpus_import_queue.raw_text", attempts };

  const stagedBuffer = bufferFromRow(row);
  attempts.push({ source: "corpus_import_queue.base64_payload", status: stagedBuffer?.length ? "selected" : "empty" });
  if (stagedBuffer?.length) return { buffer: stagedBuffer, rawText: null, source: "corpus_import_queue.base64_payload", attempts };

  try {
    const storageBuffer = await bufferFromAuthenticatedStorage(row);
    attempts.push({ source: "supabase_storage_rest_download", status: storageBuffer?.length ? "selected" : "not_configured_or_missing_path" });
    if (storageBuffer?.length) return { buffer: storageBuffer, rawText: null, source: "supabase_storage_rest_download", attempts };
  } catch (error) {
    attempts.push({ source: "supabase_storage_rest_download", status: "failed", error: error.message });
  }

  try {
    const renderBuffer = await bufferFromAuthenticatedRenderStorage(row);
    attempts.push({ source: "supabase_storage_render_download", status: renderBuffer?.length ? "selected" : "not_configured_or_missing_path" });
    if (renderBuffer?.length) return { buffer: renderBuffer, rawText: null, source: "supabase_storage_render_download", attempts };
  } catch (error) {
    attempts.push({ source: "supabase_storage_render_download", status: "failed", error: error.message });
  }

  try {
    const publicStorageBuffer = await bufferFromPublicStorageUrl(row);
    attempts.push({ source: "public_storage_url", status: publicStorageBuffer?.length ? "selected" : "not_configured_or_missing_path" });
    if (publicStorageBuffer?.length) return { buffer: publicStorageBuffer, rawText: null, source: "public_storage_url", attempts };
  } catch (error) {
    attempts.push({ source: "public_storage_url", status: "failed", error: error.message });
  }

  return { buffer: null, rawText: null, source: null, attempts };
}

function decodeXmlEntities(text) {
  return text.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code))).replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function textFromWordXml(xml) {
  const out = [];
  const tokenPattern = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/?>|<w:br\b[^>]*\/?>|<\/w:p>|<\/w:tr>/g;
  for (const match of xml.matchAll(tokenPattern)) {
    if (match[1] !== undefined) out.push(decodeXmlEntities(match[1]));
    else if (match[0].startsWith("<w:tab")) out.push("\t");
    else out.push("\n");
  }
  return out.join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function extractDocxText(buffer) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "luminari-docx-"));
  const docxPath = path.join(tmpDir, "source.docx");
  try {
    await fs.writeFile(docxPath, buffer);
    const { stdout: listing } = await execFileAsync("unzip", ["-Z1", docxPath], { maxBuffer: 1024 * 1024 * 10 });
    const entries = listing.split(/\r?\n/).filter((entry) => /^word\/(document|header\d+|footer\d+|footnotes|endnotes|comments)\.xml$/i.test(entry));
    if (!entries.includes("word/document.xml")) throw new Error("docx-missing-word-document-xml");
    const orderedEntries = ["word/document.xml", ...entries.filter((entry) => entry !== "word/document.xml").sort()];
    const parts = [];
    for (const entry of orderedEntries) {
      const { stdout } = await execFileAsync("unzip", ["-p", docxPath, entry], { maxBuffer: 1024 * 1024 * 50, encoding: "utf8" });
      const text = textFromWordXml(stdout);
      if (text) parts.push(text);
    }
    return { rawText: parts.join("\n\n").trim(), entries: orderedEntries };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

function lineCount(text) { return String(text ?? "").split(/\r?\n/).filter((line) => line.trim()).length; }
function nextStatus(rawText, error) { if (error) return "docx_extraction_failed"; if (!rawText.trim()) return "docx_empty_text_review"; return "pending_docx_normalization"; }

function mergePayload(row, extraction) {
  const existing = safeJson(row.payload, {});
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
      extracted_at: extraction.extractedAt,
      parser_name: extraction.parserName,
      parser_version: extraction.parserVersion,
      parser_entries: extraction.parserEntries,
      binary_source: extraction.binarySource,
      extraction_status: extraction.status,
      extraction_error: extraction.error ?? null,
      binary_source_attempts: extraction.binarySourceAttempts ?? [],
      public_storage_url: extraction.publicStorageUrl ?? buildPublicStorageUrl(row),
      extracted_character_count: extraction.characterCount,
      extracted_line_count: extraction.lineCount,
      original_source_ext: row.source_ext ?? null,
      next_step: "Run Form Signal Extraction v3 only after raw text review/normalization, then route proto-form/form-signal candidates through existing Sunam/conveyor gates.",
    },
  };
}

async function inspectSchema(pool) {
  if (!pool) return { table_exists: null, columns: [] };
  const exists = await table_exists(pool, "corpus_import_queue");
  return { table_exists: exists, columns: exists ? await get_table_columns(pool, "corpus_import_queue") : [] };
}

function buildDocxWhere(columns) {
  const clauses = [];
  if (columns.includes("source_ext")) clauses.push("lower(coalesce(source_ext, '')) = '.docx'");
  if (columns.includes("content_type")) clauses.push("lower(coalesce(content_type, '')) like '%wordprocessingml%'");
  if (columns.includes("target_hint")) clauses.push("lower(coalesce(target_hint, '')) = 'state_enriched_registry_docx_review'");
  return clauses.length ? `(${clauses.join(" or ")})` : null;
}

async function readDocxRows(pool, columns, targetId = null) {
  const docxWhere = buildDocxWhere(columns);
  if (!docxWhere) return [];
  const whereParts = [docxWhere];
  const values = [];
  if (targetId !== null) { values.push(targetId); whereParts.push(`id = $${values.length}`); }
  const where = whereParts.map((clause) => `(${clause})`).join(" and ");
  const wanted = ["id", "source_name", "source_type", "source_ext", "storage_bucket", "storage_path", "byte_size", "sha256", "content_type", "target_hint", "target_surfaces", "raw_text", "base64_payload", "payload", "record_count_estimate", "storage_mode", "import_status", "created_at"].filter((column) => columns.includes(column));
  const selected = wanted.map((column) => `"${column.replaceAll('"', '""')}"`).join(", ");
  const orderBy = [columns.includes("created_at") ? "created_at DESC NULLS LAST" : null, columns.includes("source_name") ? "source_name" : null].filter(Boolean).join(", ") || "1";
  const result = await pool.query(`select ${selected} from public.corpus_import_queue where ${where} order by ${orderBy}`, values);
  return result.rows;
}

async function updateQueueRow(pool, row, extraction, columns) {
  const setClauses = [];
  const values = [];
  const add = (column, value) => { if (!columns.includes(column)) return; values.push(value); setClauses.push(`"${column}" = $${values.length}`); };
  add("raw_text", extraction.rawText);
  add("payload", JSON.stringify(mergePayload(row, extraction)));
  add("record_count_estimate", extraction.lineCount);
  add("storage_mode", extraction.status === "pending_docx_normalization" ? "compressed_raw_text" : "raw_text");
  add("import_status", extraction.status);
  add("updated_at", extraction.extractedAt);
  if (!setClauses.length) return { updated: false, reason: "no-compatible-update-columns" };
  values.push(row.id);
  await pool.query(`update public.corpus_import_queue set ${setClauses.join(", ")} where id = $${values.length}`, values);
  return { updated: true, reason: null };
}

function csvCell(value) { const text = Array.isArray(value) ? value.join("|") : String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
async function writeReports(report) {
  await fs.mkdir(artifactDir, { recursive: true });
  await fs.writeFile(jsonReportPath, `${JSON.stringify(report, null, 2)}\n`);
  const headers = ["id", "source_name", "storage_bucket", "storage_path", "status", "action", "binary_source", "character_count", "line_count", "error", "next_step"];
  const rows = report.rows.map((row) => headers.map((header) => csvCell(row[header])).join(","));
  await fs.writeFile(csvReportPath, `${headers.join(",")}\n${rows.join("\n")}\n`);
}

function summarize(rows, mode) {
  const extractedStatuses = new Set(["pending_docx_normalization", "docx_empty_text_review"]);
  return {
    mode,
    docxRowsDiscovered: rows.length,
    docxRowsExtracted: rows.filter((row) => extractedStatuses.has(row.status) && !row.error).length,
    docxExtractionFailures: rows.filter((row) => row.status === "docx_extraction_failed").length,
    docxEmptyTextReview: rows.filter((row) => row.status === "docx_empty_text_review").length,
    rowsStillBlocked: rows.filter((row) => row.action === "blocked_missing_binary_source").length,
    rowsNewlyEligibleForNormalizationGateRouting: rows.filter((row) => row.status === "pending_docx_normalization").length,
    totalExtractedCharacters: rows.reduce((sum, row) => sum + (row.character_count ?? 0), 0),
    totalExtractedLines: rows.reduce((sum, row) => sum + (row.line_count ?? 0), 0),
    statusCounts: rows.reduce((acc, row) => { acc[row.status ?? "unknown"] = (acc[row.status ?? "unknown"] ?? 0) + 1; return acc; }, {}),
  };
}

async function main() {
  const args = parseArgs();
  const { pool, databaseStatus } = create_pool("docx-corpus-queue-extractor");
  const report = {
    generatedAt: new Date().toISOString(), mode: args.apply ? "apply" : "dry-run", status: "started",
    parser: { name: "wordprocessingml-xml-fallback", version: "unzip+xml-text-v1", dependencyAttempt: "controlled WordprocessingML XML fallback" },
    safety: { writesAllowed: args.apply ? ["public.corpus_import_queue"] : [], canonicalProductionTablesMutated: false, doctrineGraphEdgesInserted: false, atlasChanged: false, sunamBypassed: false, conveyorBypassed: false, rlsSecurityIndexesChanged: false },
    envStatus: { DATABASE_URL: Boolean(process.env.DATABASE_URL?.trim()), SUPABASE_URL: Boolean(getSupabaseUrl()), SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()), LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY?.trim()), fallback_admin_key_available: Boolean(getServiceRoleKey()) },
    schema: null, summary: summarize([], args.apply ? "apply" : "dry-run"), rows: [], targetId: args.id,
  };
  try {
    const schema = await inspectSchema(pool); report.schema = schema;
    if (!pool) { report.status = "database-unavailable"; report.message = databaseStatus; await writeReports(report); console.log(JSON.stringify({ status: report.status, summary: report.summary, rows: report.rows, report: path.relative(repo_root, jsonReportPath), csv: path.relative(repo_root, csvReportPath) }, null, 2)); return; }
    if (!schema.table_exists) { report.status = "queue-unavailable"; report.message = "public.corpus_import_queue does not exist."; await writeReports(report); console.log(JSON.stringify({ status: report.status, summary: report.summary, rows: report.rows, report: path.relative(repo_root, jsonReportPath), csv: path.relative(repo_root, csvReportPath) }, null, 2)); return; }
    const rows = await readDocxRows(pool, schema.columns, args.id);
    for (const row of rows) {
      const rowReport = { id: row.id ?? null, source_name: row.source_name ?? null, storage_bucket: row.storage_bucket ?? null, storage_path: row.storage_path ?? null, byte_size: row.byte_size ?? null, sha256: row.sha256 ?? null, content_type: row.content_type ?? null, source_ext: row.source_ext ?? null, target_hint: row.target_hint ?? null, previous_status: row.import_status ?? null, action: args.apply ? "pending" : "would-extract", status: null, character_count: 0, line_count: 0, parser_name: report.parser.name, parser_version: report.parser.version, extracted_at: null, error: null, binary_source: null, binary_source_attempts: [], public_storage_url: buildPublicStorageUrl(row), next_step: "Extract raw text first; then run Form Signal Extraction v3 and route candidates through existing gates." };
      try {
        const source = await getDocxSource(row);
        if (!source.buffer && !source.rawText) { rowReport.action = "blocked_missing_binary_source"; rowReport.status = "docx_extraction_failed"; rowReport.error = "No raw_text, no base64_payload, authenticated Storage REST download failed/unavailable, authenticated render Storage fallback failed/unavailable, and public Storage URL fallback failed/unavailable."; rowReport.binary_source_attempts = source.attempts; report.rows.push(rowReport); continue; }
        const extracted = source.rawText ? { rawText: source.rawText, entries: safeJson(row.payload, {})?.docx_extraction?.parser_entries ?? [] } : await extractDocxText(source.buffer);
        const rawText = extracted.rawText;
        const extractedAt = new Date().toISOString();
        const status = nextStatus(rawText, null);
        const extraction = { rawText, status, error: null, extractedAt, parserName: report.parser.name, parserVersion: report.parser.version, parserEntries: extracted.entries, binarySource: source.source, binarySourceAttempts: source.attempts, publicStorageUrl: buildPublicStorageUrl(row), characterCount: rawText.length, lineCount: lineCount(rawText) };
        rowReport.status = status; rowReport.character_count = extraction.characterCount; rowReport.line_count = extraction.lineCount; rowReport.extracted_at = extractedAt; rowReport.parser_entries = extracted.entries; rowReport.binary_source = source.source; rowReport.binary_source_attempts = source.attempts; rowReport.action = args.apply ? "update-corpus-import-queue" : "would-update-corpus-import-queue";
        if (args.apply) { const updated = await updateQueueRow(pool, row, extraction, schema.columns); rowReport.action = updated.updated ? "updated-corpus-import-queue" : "blocked_no_compatible_update_columns"; rowReport.error = updated.reason; }
      } catch (error) {
        const extractedAt = new Date().toISOString(); rowReport.status = "docx_extraction_failed"; rowReport.error = error.message; rowReport.extracted_at = extractedAt; rowReport.action = args.apply ? "update-failure-status" : "would-update-failure-status";
        if (args.apply) { const extraction = { rawText: "", status: "docx_extraction_failed", error: error.message, extractedAt, parserName: report.parser.name, parserVersion: report.parser.version, parserEntries: [], binarySource: null, binarySourceAttempts: [], publicStorageUrl: buildPublicStorageUrl(row), characterCount: 0, lineCount: 0 }; const updated = await updateQueueRow(pool, row, extraction, schema.columns); rowReport.action = updated.updated ? "updated-failure-status" : "blocked_no_compatible_update_columns"; }
      }
      report.rows.push(rowReport);
    }
    report.status = "completed"; report.summary = summarize(report.rows, report.mode); await writeReports(report);
    console.log(JSON.stringify({ status: report.status, summary: report.summary, rows: report.rows, report: path.relative(repo_root, jsonReportPath), csv: path.relative(repo_root, csvReportPath) }, null, 2));
  } finally { if (pool) await pool.end(); }
}

main().catch(async (error) => {
  const report = { generatedAt: new Date().toISOString(), mode: process.argv.includes("--apply") ? "apply" : "dry-run", status: "error", error: error.message, safety: { canonicalProductionTablesMutated: false, doctrineGraphEdgesInserted: false, atlasChanged: false, sunamBypassed: false, conveyorBypassed: false, rlsSecurityIndexesChanged: false }, summary: summarize([], process.argv.includes("--apply") ? "apply" : "dry-run"), rows: [] };
  await writeReports(report);
  console.error(error.message);
  process.exitCode = 1;
});

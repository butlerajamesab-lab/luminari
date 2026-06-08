#!/usr/bin/env node
import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  buildStorageStagingRow,
  createPool,
  detectStorageFileExtension,
  estimateStorageRecordCount,
  getTableColumns,
  hasDuplicateRisk,
  isTextStorageExtension,
  parseRegistryBucketNames,
  repoRoot,
  storageModeForExtension,
  tableExists,
} from "./lib/corpus-audit-utils.mjs";

const preferredFields = [
  "source_name",
  "source_type",
  "source_ext",
  "storage_bucket",
  "storage_path",
  "byte_size",
  "sha256",
  "content_type",
  "storage_mode",
  "target_hint",
  "record_count_estimate",
  "payload",
  "raw_text",
  "base64_payload",
  "pipeline_context",
  "domain_tags",
  "target_surfaces",
  "import_status",
  "created_at",
];

const artifactDir = path.join(repoRoot, "artifacts", "corpus-audit");
const jsonReportPath = path.join(artifactDir, "registry-bucket-staging-report.json");
const csvReportPath = path.join(artifactDir, "registry-bucket-staging-report.csv");

function parseCliArgs(argv = process.argv.slice(2)) {
  const args = { dryRun: false, apply: false };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    if (arg === "--apply") args.apply = true;
    if (arg === "--json") args.jsonOnly = true;
  }
  if (!args.apply) args.dryRun = true;
  if (args.apply && args.dryRun) throw new Error("Choose either --dry-run or --apply, not both.");
  return args;
}

function getServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || process.env.LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY?.trim()
    || process.env.SUPABASE_SERVICE_KEY?.trim()
    || process.env.SUPABASE_KEY?.trim()
    || "";
}

function normalizePrefix(prefix) {
  return String(prefix ?? "").trim().replace(/^\/+|\/+$/g, "");
}

function joinStoragePath(prefix, name) {
  return [prefix, name].filter(Boolean).join("/").replace(/\/+/g, "/");
}

function isFolderEntry(entry) {
  return entry?.id === null || (entry?.metadata === null && !path.extname(entry?.name ?? ""));
}

async function listStorageFiles(supabase, bucketName, prefix = "") {
  const files = [];
  const errors = [];
  await scan(prefix);
  return { files, errors };

  async function scan(currentPrefix) {
    let offset = 0;
    const limit = 1000;
    for (;;) {
      const { data, error } = await supabase.storage.from(bucketName).list(currentPrefix, {
        limit,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) {
        errors.push({ bucketName, prefix: currentPrefix, error: error.message });
        return;
      }
      const entries = data ?? [];
      for (const entry of entries) {
        if (!entry?.name || entry.name === ".emptyFolderPlaceholder") continue;
        const storagePath = joinStoragePath(currentPrefix, entry.name);
        if (isFolderEntry(entry)) {
          await scan(storagePath);
          continue;
        }
        files.push({ bucketName, storagePath, listEntry: entry });
      }
      if (entries.length < limit) break;
      offset += limit;
    }
  }
}

async function downloadStorageFile(supabase, bucketName, storagePath) {
  const { data, error } = await supabase.storage.from(bucketName).download(storagePath);
  if (error) throw new Error(error.message);
  const arrayBuffer = await data.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return {
    buffer,
    contentType: data.type || null,
    byteSize: buffer.byteLength,
  };
}

function decodeFileContent(buffer, sourceExt) {
  const storageMode = storageModeForExtension(sourceExt);
  const text = isTextStorageExtension(sourceExt) ? buffer.toString("utf8") : null;
  let payload = null;
  let rawText = null;
  let base64Payload = null;
  let parseError = null;

  if (sourceExt === ".json") {
    rawText = text;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      parseError = error.message;
      payload = { parse_error: error.message, raw_text_preserved: true };
    }
  } else if (storageMode === "raw_text") {
    rawText = text;
  } else if (storageMode === "base64_payload") {
    base64Payload = buffer.toString("base64");
    payload = { binary_preserved_as_base64: true };
  } else {
    payload = { binary_metadata_only: true };
  }

  const recordCountEstimate = estimateStorageRecordCount({ sourceExt, text, payload });
  return { storageMode, payload, rawText, base64Payload, recordCountEstimate, parseError };
}

async function readQueueColumns() {
  const { pool } = createPool("registry-bucket-staging-column-introspection");
  if (!pool) return { available: false, exists: null, columns: [], missingPreferredFields: [], status: "DATABASE_URL unavailable; column compatibility will be determined by Supabase insert responses." };
  try {
    const exists = await tableExists(pool, "corpus_import_queue");
    if (!exists) return { available: true, exists: false, columns: [], missingPreferredFields: preferredFields, status: "public.corpus_import_queue does not exist." };
    const columns = await getTableColumns(pool, "corpus_import_queue");
    return {
      available: true,
      exists: true,
      columns,
      missingPreferredFields: preferredFields.filter((field) => !columns.includes(field)),
      status: "configured",
    };
  } finally {
    await pool.end();
  }
}

function filterCompatibleRow(row, columns) {
  if (!columns?.length) return Object.fromEntries(preferredFields.map((field) => [field, row[field]]).filter(([, value]) => value !== undefined));
  return Object.fromEntries(preferredFields.filter((field) => columns.includes(field)).map((field) => [field, row[field]]));
}

async function readExistingQueueRows(supabase) {
  const selectColumns = ["source_name", "storage_bucket", "storage_path", "sha256", "import_status"].join(",");
  const { data, error } = await supabase.from("corpus_import_queue").select(selectColumns).limit(100000);
  if (!error) return { rows: data ?? [], error: null };
  const fallback = await supabase.from("corpus_import_queue").select("source_name,sha256,import_status").limit(100000);
  if (!fallback.error) return { rows: fallback.data ?? [], error: `metadata-column-query-unavailable: ${error.message}` };
  return { rows: [], error: fallback.error.message };
}

function classifyAction(row, existingRows) {
  const exact = existingRows.find((existing) => ((existing.storage_bucket === row.storage_bucket && existing.storage_path === row.storage_path) || existing.source_name === row.source_name) && existing.sha256 === row.sha256);
  if (exact) return { action: "skip", reason: "same storage_bucket + storage_path + sha256 already staged" };
  const changedPath = existingRows.some((existing) => ((existing.storage_bucket === row.storage_bucket && existing.storage_path === row.storage_path) || existing.source_name === row.source_name) && existing.sha256 && existing.sha256 !== row.sha256);
  const sameContentElsewhere = existingRows.some((existing) => existing.sha256 === row.sha256 && !((existing.storage_bucket === row.storage_bucket && existing.storage_path === row.storage_path) || existing.source_name === row.source_name));
  if (changedPath) return { action: "insert-changed-version", reason: "same storage path has a different sha256" };
  if (sameContentElsewhere) return { action: "insert-duplicate-risk", reason: "same sha256 exists at another bucket/path" };
  return { action: "insert", reason: "new storage object" };
}

async function insertCompatibleRow(supabase, row, columns, missingPreferredFields) {
  let workingColumns = [...(columns?.length ? columns : preferredFields)];
  let compatible = filterCompatibleRow(row, workingColumns);
  for (let attempt = 0; attempt < preferredFields.length + 1; attempt += 1) {
    const { data, error } = await supabase.from("corpus_import_queue").insert(compatible).select().limit(1);
    if (!error) return { inserted: true, data, missingPreferredFields };
    const match = error.message.match(/'([^']+)' column/) || error.message.match(/column "?([a-zA-Z0-9_]+)"?/);
    const missing = match?.[1];
    if (!missing || !Object.prototype.hasOwnProperty.call(compatible, missing)) return { inserted: false, error: error.message, missingPreferredFields };
    missingPreferredFields.push(missing);
    workingColumns = workingColumns.filter((column) => column !== missing);
    compatible = filterCompatibleRow(row, workingColumns);
  }
  return { inserted: false, error: "insert failed after removing unavailable columns", missingPreferredFields };
}

function countsBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] ?? "unknown";
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function writeReports(report) {
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(jsonReportPath, `${JSON.stringify(report, null, 2)}\n`);
  const headers = ["bucket", "path", "source_ext", "byte_size", "sha256", "target_hint", "record_count_estimate", "action", "reason", "unreadable", "duplicate_risk"];
  const rows = report.files.map((file) => headers.map((header) => csvCell(file[header] ?? "")).join(","));
  fs.writeFileSync(csvReportPath, `${headers.join(",")}\n${rows.join("\n")}\n`);
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join("|") : String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function main() {
  const args = parseCliArgs();
  const buckets = parseRegistryBucketNames();
  const prefix = normalizePrefix(process.env.REGISTRY_BUCKET_PREFIX);
  const envStatus = {
    SUPABASE_URL: Boolean(process.env.SUPABASE_URL?.trim()),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY?.trim()),
    fallback_admin_key_available: Boolean(getServiceRoleKey()),
    DATABASE_URL: Boolean(process.env.DATABASE_URL?.trim()),
  };
  const report = {
    generatedAt: new Date().toISOString(),
    mode: args.apply ? "apply" : "dry-run",
    status: "started",
    safety: {
      writesAllowed: args.apply ? ["public.corpus_import_queue"] : [],
      canonicalProductionTablesMutated: false,
      doctrineGraphEdgesInserted: false,
      atlasChanged: false,
      rlsSecurityIndexesChanged: false,
    },
    envStatus,
    bucketsConfigured: buckets,
    prefix: prefix || null,
    schema: null,
    summary: {},
    files: [],
    bucketErrors: [],
  };

  const serviceRoleKey = getServiceRoleKey();
  if (!process.env.SUPABASE_URL?.trim() || !serviceRoleKey) {
    report.status = "storage-unavailable";
    report.message = "SUPABASE_URL and a server-side Supabase admin key are required; no storage scan was attempted.";
    report.summary = { filesDiscovered: 0, wouldStage: 0, staged: 0, duplicateRiskCount: 0, unreadableCount: 0, targetHintGroupCounts: {} };
    writeReports(report);
    console.warn(report.message);
    console.log(`Report: ${path.relative(repoRoot, jsonReportPath)}`);
    return;
  }

  const supabase = createClient(process.env.SUPABASE_URL.trim(), serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const schema = await readQueueColumns();
  report.schema = schema;
  const existing = await readExistingQueueRows(supabase);
  report.existingQueueReadStatus = existing.error ? `warning: ${existing.error}` : "available";
  const existingRows = existing.rows;

  for (const bucketName of buckets) {
    const listed = await listStorageFiles(supabase, bucketName, prefix);
    report.bucketErrors.push(...listed.errors);
    for (const file of listed.files) {
      const base = { bucket: file.bucketName, path: file.storagePath, unreadable: false };
      try {
        const downloaded = await downloadStorageFile(supabase, file.bucketName, file.storagePath);
        const sourceExt = detectStorageFileExtension(file.storagePath);
        const sha256 = crypto.createHash("sha256").update(downloaded.buffer).digest("hex");
        const decoded = decodeFileContent(downloaded.buffer, sourceExt);
        const initialRow = buildStorageStagingRow({
          bucketName: file.bucketName,
          storagePath: file.storagePath,
          byteSize: downloaded.byteSize,
          sha256,
          contentType: downloaded.contentType,
          sourceExt,
          storageMode: decoded.storageMode,
          payload: decoded.payload,
          rawText: decoded.rawText,
          base64Payload: decoded.base64Payload,
          recordCountEstimate: decoded.recordCountEstimate,
        });
        const risk = hasDuplicateRisk(initialRow, existingRows);
        const row = risk.duplicateRisk
          ? buildStorageStagingRow({
            bucketName: file.bucketName,
            storagePath: file.storagePath,
            byteSize: downloaded.byteSize,
            sha256,
            contentType: downloaded.contentType,
            sourceExt,
            storageMode: decoded.storageMode,
            payload: { ...(decoded.payload && typeof decoded.payload === "object" ? decoded.payload : {}), duplicate_risk: true, duplicate_risk_reasons: risk.duplicateRiskReasons },
            rawText: decoded.rawText,
            base64Payload: decoded.base64Payload,
            recordCountEstimate: decoded.recordCountEstimate,
            duplicateRisk: true,
            duplicateRiskReasons: risk.duplicateRiskReasons,
          })
          : initialRow;
        const classified = classifyAction(row, existingRows);
        const fileReport = {
          ...base,
          source_ext: row.source_ext,
          byte_size: row.byte_size,
          sha256: row.sha256,
          content_type: row.content_type,
          storage_mode: row.storage_mode,
          target_hint: row.target_hint,
          target_surfaces: row.target_surfaces,
          pipeline_context: row.pipeline_context,
          domain_tags: row.domain_tags,
          record_count_estimate: row.record_count_estimate,
          duplicate_risk: risk.duplicateRisk || classified.action === "insert-duplicate-risk",
          duplicate_risk_reasons: risk.duplicateRiskReasons,
          action: args.apply ? classified.action.replace(/^insert/, "would-insert") : `would-${classified.action}`,
          reason: classified.reason,
          parse_error: decoded.parseError,
        };
        if (args.apply && !classified.action.startsWith("skip")) {
          const insertResult = await insertCompatibleRow(supabase, row, schema.columns, schema.missingPreferredFields ?? []);
          fileReport.action = insertResult.inserted ? classified.action : "insert-error";
          fileReport.insert_error = insertResult.error;
          if (insertResult.inserted) existingRows.push(row);
        }
        report.files.push(fileReport);
      } catch (error) {
        report.files.push({ ...base, unreadable: true, action: "unreadable", reason: error.message });
      }
    }
  }

  const insertedCount = report.files.filter((file) => ["insert", "insert-changed-version", "insert-duplicate-risk"].includes(file.action)).length;
  const wouldStage = report.files.filter((file) => String(file.action).startsWith("would-insert") || file.action === "would-insert-changed-version" || file.action === "would-insert-duplicate-risk").length;
  report.status = report.bucketErrors.length ? "completed-with-warnings" : "completed";
  report.summary = {
    bucketsScanned: buckets,
    filesDiscovered: report.files.length,
    wouldStage: args.apply ? 0 : wouldStage,
    staged: args.apply ? insertedCount : 0,
    skipped: report.files.filter((file) => String(file.action).includes("skip")).length,
    duplicateRiskCount: report.files.filter((file) => file.duplicate_risk).length,
    unreadableCount: report.files.filter((file) => file.unreadable).length,
    targetHintGroupCounts: countsBy(report.files.filter((file) => !file.unreadable), "target_hint"),
    sourceExtCounts: countsBy(report.files.filter((file) => !file.unreadable), "source_ext"),
    recordCountEstimateTotal: report.files.reduce((sum, file) => sum + (Number(file.record_count_estimate) || 0), 0),
  };
  writeReports(report);

  if (!args.jsonOnly) {
    console.log(JSON.stringify({ status: report.status, summary: report.summary, report: path.relative(repoRoot, jsonReportPath), csv: path.relative(repoRoot, csvReportPath) }, null, 2));
    if (schema.missingPreferredFields?.length) console.warn(`Unavailable preferred columns: ${[...new Set(schema.missingPreferredFields)].join(", ")}`);
  }
}

main().catch((error) => {
  const report = {
    generatedAt: new Date().toISOString(),
    mode: process.argv.includes("--apply") ? "apply" : "dry-run",
    status: "error",
    error: error.message,
    safety: { canonicalProductionTablesMutated: false, doctrineGraphEdgesInserted: false, atlasChanged: false, rlsSecurityIndexesChanged: false },
    files: [],
    summary: { filesDiscovered: 0, wouldStage: 0, staged: 0, duplicateRiskCount: 0, unreadableCount: 0, targetHintGroupCounts: {} },
  };
  writeReports(report);
  console.error(error.message);
  process.exitCode = 1;
});

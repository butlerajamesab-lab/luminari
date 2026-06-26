#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import {
  create_pool,
  get_table_columns,
  repo_root,
  table_exists,
} from "./lib/corpus-audit-utils.mjs";
import { classifyIngestionPolicy } from "./lib/ingestion-policy.mjs";

const artifactDir = path.join(repo_root, "artifacts", "corpus-audit");
const jsonReportPath = path.join(artifactDir, "corpus-queue-gate-routing-report.json");
const csvReportPath = path.join(artifactDir, "corpus-queue-gate-routing-report.csv");

const inspectedFiles = [
  "server/sunam-gate.ts",
  "server/routes/conveyor-router.ts",
  "server/routers/ingestion.ts",
  "server/ingestion/signal-detector.ts",
  "scripts/stage-registry-bucket-files.mjs",
  "scripts/lib/corpus-audit-utils.mjs",
  "scripts/lib/ingestion-policy.mjs",
];

const inspectedTables = [
  "corpus_import_queue",
  "live_signals",
  "detected_signals",
  "extraction_staging",
  "sunam_gate_log",
  "sunam_thresholds",
  "registry_entity_extraction_v4",
  "promotion_validation_log",
  "promotion_validation_rules",
  "conveyor_validation_log",
  "conveyor_runs",
  "conveyor_promotion_accounting",
  "promotion_accounting",
];

const gateMap = [
  {
    sourceTable: "public.live_signals",
    gateTable: "public.sunam_gate_log",
    validationTable: "public.sunam_thresholds",
    outputTable: "public.detected_signals",
    rejectedOrReviewTable: "public.extraction_staging",
    runtimeConsumer: "Sunam gate routers, signal intelligence, trend/reform/policy engines",
    existingCodeOwner: "server/sunam-gate.ts + server/ingestion/signal-detector.ts",
    path: "live_signals -> Sunam gate -> detected_signals or extraction_staging",
  },
  {
    sourceTable: "public.registry_entity_extraction_v4",
    gateTable: "public.promotion_validation_log",
    validationTable: "server/routes/conveyor-router.ts lane validation rules",
    outputTable: "canonical lane tables after conveyor promote",
    rejectedOrReviewTable: "promotion_validation_log failed rows / V4 rows remaining unpromoted",
    runtimeConsumer: "Conveyor API /api/conveyor dry-run, promote, bridge, run",
    existingCodeOwner: "server/routes/conveyor-router.ts",
    path: "registry_entity_extraction_v4 -> conveyor validation -> canonical tables -> Atlas bridge through conveyor bridge endpoints",
  },
  {
    sourceTable: "public.corpus_import_queue",
    gateTable: "adapter output only; no independent gate",
    validationTable: "existing Sunam thresholds or conveyor lane rules after candidate creation",
    outputTable: "public.live_signals or public.registry_entity_extraction_v4 candidate rows only",
    rejectedOrReviewTable: "public.extraction_staging for review/staged signals where represented; otherwise remain queued with review classification",
    runtimeConsumer: "This dry-run routing report; future adapter should feed existing pre-promotion tables",
    existingCodeOwner: "scripts/route-corpus-queue-through-existing-gates.mjs",
    path: "corpus_import_queue -> extraction/normalization adapter -> existing Sunam/conveyor inputs",
  },
];

function parseArgs(argv = process.argv.slice(2)) {
  const args = { dryRun: true, jsonOnly: false };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    if (arg === "--apply" || arg === "--write") {
      throw new Error("Write mode is intentionally not implemented. This adapter audit is dry-run only.");
    }
    if (arg === "--json") args.jsonOnly = true;
  }
  return args;
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // fall through
    }
    return trimmed.split(",").map((part) => part.trim()).filter(Boolean);
  }
  return [value];
}

function jsonField(row, field) {
  const value = row[field];
  if (!value || typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function detectParser(row) {
  const ext = normalize(row.source_ext);
  const mode = normalize(row.storage_mode);
  const contentType = normalize(row.content_type);
  if (ext === ".sql" || mode.includes("sql")) return { parser: "sql_handoff", parserStatus: "available_for_review", reason: "SQL handoff requires review before candidate extraction." };
  if ([".json", ".jsonl"].includes(ext) || mode === "json_payload") return { parser: "json/jsonl", parserStatus: "available", reason: "Structured JSON/JSONL can be normalized into candidate rows." };
  if (ext === ".docx" || contentType.includes("wordprocessingml")) return { parser: "docx", parserStatus: "missing", reason: "DOCX extraction is not implemented in this adapter." };
  if (ext === ".zip" || mode === "base64_payload") return { parser: "zip", parserStatus: "missing", reason: "Archive expansion must run before candidate routing." };
  if ([".txt", ".md", ".html", ".csv", ".ts", ".js"].includes(ext) || mode === "raw_text") return { parser: "text", parserStatus: "available_for_review", reason: "Text-like content needs normalization into structured candidates." };
  if (ext === ".pdf" || contentType.includes("pdf")) return { parser: "pdf", parserStatus: "missing", reason: "PDF extraction is not implemented in this adapter." };
  return { parser: "unknown", parserStatus: "missing", reason: "Unknown file type has no parser mapping." };
}

function isProcessedStatus(importStatus) {
  return [
    "processed",
    "routed",
    "candidate_created",
    "candidates_created",
    "imported",
    "promoted",
    "complete",
    "completed",
  ].includes(normalize(importStatus));
}

function destinationFor(row, parser) {
  const hint = normalize(row.target_hint);
  const surfaces = asArray(jsonField(row, "target_surfaces")).map(normalize);
  const payload = jsonField(row, "payload");
  const payloadKeys = payload && typeof payload === "object" && !Array.isArray(payload) ? Object.keys(payload).map(normalize) : [];

  if (isProcessedStatus(row.import_status)) {
    return { destination: "already_processed", nextStep: "No adapter action; row status indicates prior processing.", blockedReason: null };
  }
  if (parser.parserStatus === "missing") {
    return {
      destination: parser.parser === "unknown" ? "blocked_unknown_type" : "blocked_needs_parser",
      nextStep: `Add or run ${parser.parser} extraction before routing to Sunam/conveyor inputs.`,
      blockedReason: parser.reason,
    };
  }
  if (!hint || hint === "review_required") {
    return {
      destination: "extraction_staging_review",
      nextStep: "Manually review and classify the queued row before candidate generation.",
      blockedReason: "target_hint is review_required or missing.",
    };
  }

  const explicitSignal = payloadKeys.includes("signaltype")
    || payloadKeys.includes("signal_type")
    || surfaces.includes("live_signals")
    || surfaces.includes("detected_signals")
    || hint.includes("signal");
  const signalLike = explicitSignal
    || ["legal_weak_joints"].includes(hint)
    || surfaces.some((surface) => ["failure_layer", "enforcement_intel", "agency_metrics"].includes(surface));

  if (signalLike) {
    return {
      destination: "live_signals_candidate",
      nextStep: "Normalize into live_signals candidate shape, then call existing Sunam processGateBatch/processSignalThroughGate.",
      blockedReason: null,
    };
  }

  const registryHints = new Set([
    "legal_statutes",
    "legal_case_law",
    "legal_enforcement",
    "government_benefits_registry",
    "workflow_registry",
    "escalation_registry",
    "accountability_routes",
    "barrier_decision_tree",
    "claim_element_matrix",
    "committee_registry",
    "coalition_intelligence",
  ]);
  const registrySurfaces = new Set([
    "legal_statutes",
    "legal_case_law",
    "legal_enforcement",
    "government_benefits_registry",
    "workflow_registry",
    "escalation_registry",
    "accountability_routes",
    "barrier_decision_tree",
    "claim_element_matrix",
    "committee_registry",
    "legislator_registry",
    "coalition_intelligence",
    "legal_library",
    "benefits_navigator",
    "resource_directory",
  ]);

  if (registryHints.has(hint) || surfaces.some((surface) => registrySurfaces.has(surface))) {
    return {
      destination: "registry_entity_extraction_v4_candidate",
      nextStep: "Normalize into registry_entity_extraction_v4 candidate rows, then run existing conveyor /dry-run for the matching lane.",
      blockedReason: null,
    };
  }

  return {
    destination: "extraction_staging_review",
    nextStep: "Review target_hint/target_surfaces and map to an existing Sunam or conveyor input before writing candidates.",
    blockedReason: "No existing gate input mapping matched this target metadata.",
  };
}

function classifyRow(row) {
  const parser = detectParser(row);
  const destination = destinationFor(row, parser);
  const policy = classifyIngestionPolicy(row);
  return {
    rowId: row.id ?? null,
    sourceName: row.source_name ?? null,
    sourceType: row.source_type ?? null,
    sourceExt: row.source_ext ?? null,
    storageBucket: row.storage_bucket ?? null,
    storagePath: row.storage_path ?? null,
    targetHint: row.target_hint ?? null,
    importStatus: row.import_status ?? null,
    parser: parser.parser,
    parserStatus: parser.parserStatus,
    intendedDestination: destination.destination,
    policyClass: policy.policyClass,
    dedupeBehavior: policy.dedupeBehavior,
    promotionAllowedByPolicy: policy.promotionAllowed,
    policyTarget: policy.policyTarget,
    policyReason: policy.policyReason,
    blockedReason: destination.blockedReason,
    nextStep: destination.nextStep,
  };
}

function groupRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const keyParts = [row.sourceType, row.sourceExt, row.targetHint, row.storageBucket, row.parser, row.intendedDestination, row.policyClass, row.dedupeBehavior].map((part) => part ?? "(missing)");
    const key = keyParts.join("||");
    if (!groups.has(key)) {
      groups.set(key, {
        sourceType: row.sourceType ?? null,
        sourceExt: row.sourceExt ?? null,
        targetHint: row.targetHint ?? null,
        storageBucket: row.storageBucket ?? null,
        parser: row.parser,
        intendedDestination: row.intendedDestination,
        policyClass: row.policyClass,
        dedupeBehavior: row.dedupeBehavior,
        promotionAllowedByPolicy: row.promotionAllowedByPolicy,
        policyTarget: row.policyTarget,
        policyReason: row.policyReason,
        rowCount: 0,
        blockedReason: row.blockedReason,
        nextStep: row.nextStep,
      });
    }
    groups.get(key).rowCount += 1;
  }
  return [...groups.values()].sort((a, b) => b.rowCount - a.rowCount || String(a.targetHint).localeCompare(String(b.targetHint)));
}

function countBy(rows, field) {
  return rows.reduce((acc, row) => {
    const key = row[field] ?? "(missing)";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeReports(report) {
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(jsonReportPath, `${JSON.stringify(report, null, 2)}\n`);
  const headers = ["sourceType", "sourceExt", "targetHint", "storageBucket", "parser", "intendedDestination", "policyClass", "dedupeBehavior", "promotionAllowedByPolicy", "rowCount", "blockedReason", "policyReason", "nextStep"];
  const rows = report.rowGroups.map((group) => headers.map((header) => csvCell(group[header])).join(","));
  fs.writeFileSync(csvReportPath, `${headers.join(",")}\n${rows.join("\n")}\n`);
}

async function inspectTables(pool) {
  const tables = [];
  if (!pool) {
    return inspectedTables.map((tableName) => ({ tableName, status: "database-unavailable", exists: null, columns: [] }));
  }
  for (const tableName of inspectedTables) {
    try {
      const exists = await table_exists(pool, tableName);
      const columns = exists ? await get_table_columns(pool, tableName) : [];
      tables.push({ tableName, status: exists ? "available" : "missing", exists, columns });
    } catch (error) {
      tables.push({ tableName, status: "inspection-error", exists: null, columns: [], error: error.message });
    }
  }
  return tables;
}

async function readQueueRows(pool) {
  const exists = await table_exists(pool, "corpus_import_queue");
  if (!exists) return { exists: false, columns: [], rows: [] };
  const columns = await get_table_columns(pool, "corpus_import_queue");
  const wanted = [
    "id",
    "source_name",
    "source_type",
    "source_ext",
    "storage_bucket",
    "storage_path",
    "content_type",
    "storage_mode",
    "target_hint",
    "target_surfaces",
    "payload",
    "raw_text",
    "import_status",
    "created_at",
  ].filter((column) => columns.includes(column));
  const selected = wanted.length ? wanted.map((column) => `"${column.replaceAll('"', '""')}"`).join(", ") : "*";
  const result = await pool.query(`SELECT ${selected} FROM public.corpus_import_queue ORDER BY created_at DESC NULLS LAST, source_name LIMIT 100000`);
  return { exists: true, columns, rows: result.rows };
}

function summarize(rows) {
  return {
    queuedRowCount: rows.length,
    bucketCount: new Set(rows.map((row) => row.storageBucket).filter(Boolean)).size,
    filesByExtension: countBy(rows, "sourceExt"),
    filesByTargetHint: countBy(rows, "targetHint"),
    rowsRequiringParser: rows.filter((row) => row.intendedDestination === "blocked_needs_parser" || row.intendedDestination === "blocked_unknown_type").length,
    rowsEligibleForRegistryEntityExtractionV4: rows.filter((row) => row.intendedDestination === "registry_entity_extraction_v4_candidate").length,
    rowsEligibleForLiveSignalsSunam: rows.filter((row) => row.intendedDestination === "live_signals_candidate").length,
    rowsBlocked: rows.filter((row) => row.intendedDestination.startsWith("blocked_")).length,
    rowsAlreadyProcessed: rows.filter((row) => row.intendedDestination === "already_processed").length,
    rowsRequiringManualReview: rows.filter((row) => row.intendedDestination === "extraction_staging_review").length,
    rowsByDestination: countBy(rows, "intendedDestination"),
    rowsByParser: countBy(rows, "parser"),
    rowsByPolicyClass: countBy(rows, "policyClass"),
    rowsByDedupeBehavior: countBy(rows, "dedupeBehavior"),
    rowsPromotionAllowedByPolicy: rows.filter((row) => row.promotionAllowedByPolicy).length,
    rowsPromotionBlockedByPolicy: rows.filter((row) => !row.promotionAllowedByPolicy).length,
  };
}

async function main() {
  const args = parseArgs();
  const { pool, databaseStatus } = create_pool("corpus-queue-gate-router");
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "dry-run",
    status: "started",
    safety: {
      writesPerformed: false,
      canonicalProductionTablesMutated: false,
      doctrineGraphEdgesInserted: false,
      atlasChanged: false,
      rlsSecurityIndexesChanged: false,
      independentGateCreated: false,
      sunamBypassed: false,
      conveyorBypassed: false,
    },
    inspectedFiles,
    inspectedTables: [],
    gateMap,
    databaseStatus,
    summary: summarize([]),
    rowGroups: [],
    rows: [],
    parserGaps: [],
    proposedNextAdapter: "Implement write mode that normalizes corpus_import_queue rows into existing pre-promotion inputs only. Entity/contact rows may use non-destructive enrichment after validation. Authority/legal rows must remain strict source-bound candidates and cannot silently merge into canonical truth.",
  };

  try {
    report.inspectedTables = await inspectTables(pool);
    if (!pool) {
      report.status = "database-unavailable";
      report.message = databaseStatus;
      writeReports(report);
      if (!args.jsonOnly) console.log(JSON.stringify({ status: report.status, summary: report.summary, report: path.relative(repo_root, jsonReportPath), csv: path.relative(repo_root, csvReportPath) }, null, 2));
      return;
    }

    const queue = await readQueueRows(pool);
    if (!queue.exists) {
      report.status = "queue-unavailable";
      report.message = "public.corpus_import_queue does not exist; no routing classifications generated.";
      writeReports(report);
      if (!args.jsonOnly) console.log(JSON.stringify({ status: report.status, summary: report.summary, report: path.relative(repo_root, jsonReportPath), csv: path.relative(repo_root, csvReportPath) }, null, 2));
      return;
    }

    const rows = queue.rows.map(classifyRow);
    report.status = "completed";
    report.queueColumns = queue.columns;
    report.rows = rows;
    report.rowGroups = groupRows(rows);
    report.summary = summarize(rows);
    report.parserGaps = report.rowGroups
      .filter((group) => group.intendedDestination === "blocked_needs_parser" || group.intendedDestination === "blocked_unknown_type")
      .map((group) => ({ parser: group.parser, rowCount: group.rowCount, blockedReason: group.blockedReason, nextStep: group.nextStep }));
    writeReports(report);
    if (!args.jsonOnly) console.log(JSON.stringify({ status: report.status, summary: report.summary, report: path.relative(repo_root, jsonReportPath), csv: path.relative(repo_root, csvReportPath) }, null, 2));
  } finally {
    if (pool) await pool.end();
  }
}

main().catch((error) => {
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "dry-run",
    status: "error",
    error: error.message,
    safety: {
      writesPerformed: false,
      canonicalProductionTablesMutated: false,
      doctrineGraphEdgesInserted: false,
      atlasChanged: false,
      rlsSecurityIndexesChanged: false,
      independentGateCreated: false,
      sunamBypassed: false,
      conveyorBypassed: false,
    },
    inspectedFiles,
    inspectedTables: [],
    gateMap,
    summary: summarize([]),
    rowGroups: [],
    rows: [],
    parserGaps: [],
  };
  writeReports(report);
  console.error(error.message);
  process.exitCode = 1;
});

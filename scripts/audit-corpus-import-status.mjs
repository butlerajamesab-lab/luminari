#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  countCsvRecords,
  countJsonlRecords,
  createPool,
  extractJsonRecordCount,
  findDataDirectories,
  findFilesByBasename,
  getTableColumns,
  parseArgs,
  repoRoot,
  safeCount,
  tableExists,
} from "./lib/corpus-audit-utils.mjs";

const args = parseArgs();

const sourceMappings = [
  { sourceName: "legal_statutes_priority2.json", selector: "statutes", targets: ["legal_statutes"] },
  { sourceName: "legal_weak_joints_priority4.json", selector: "weak_joints", targets: ["legal_weak_joints"] },
  {
    sourceName: "legal_enforcement_state_combined.json",
    selector: "enforcement_records_state",
    targets: ["legal_enforcement_records", "agency_authority_map"],
    ambiguity: "Enforcement payload may fit legal_enforcement_records or agency_authority_map; audit reports both and does not choose.",
  },
  { sourceName: "government_benefits_registry.jsonl", targets: ["government_benefits_registry"] },
  { sourceName: "workflow_registry.jsonl", targets: ["workflow_registry", "registry_workflows", "workflow_definitions", "workflow_master"] },
  { sourceName: "escalation_registry.jsonl", targets: ["escalation_registry", "escalation_routes"] },
  { sourceName: "committee_registry.jsonl", targets: ["committee_registry"] },
  { sourceName: "committee_membership_registry.jsonl", targets: ["committee_membership_registry", "committee_memberships"] },
  { sourceName: "legislator_registry.jsonl", targets: ["legislator_registry", "legislator_contacts"] },
  { sourceName: "claim_elements_matrix_complete-2.json", targets: ["claim_element_matrix"], compatibility: "needs-transform if source is grouped by domain instead of one row per claim element" },
  { sourceName: "barrier_decision_tree_complete-1.json", targets: ["barrier_decision_tree"] },
  { sourceName: "legal_library_L1_statutes_complete.json", targets: ["legal_statutes"] },
  { sourceName: "legal_statute_key_text.json", targets: ["legal_statute_key_text"] },
  { sourceName: "accountability_routes_full.txt", targets: ["accountability_routes", "registry_oversight_bodies", "escalation_routes"] },
];

const batchSourceNames = [
  "batch_009.zip",
  "batch_011.zip",
  "batch_012.zip",
  "batch_013.zip",
  "batch_014.zip",
];

function readSourceCount(filePath, selector) {
  const basename = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const text = fs.readFileSync(filePath, "utf8");
  if (ext === ".json") {
    const parsed = JSON.parse(text);
    return extractJsonRecordCount(parsed, selector);
  }
  if (ext === ".jsonl") return countJsonlRecords(text);
  if (ext === ".csv") return countCsvRecords(text);
  if (ext === ".txt") return text.split(/\r?\n/).filter((line) => line.trim()).length;
  if (ext === ".sql") return (text.match(/\binsert\s+into\b/gi) ?? []).length;
  if (basename.endsWith(".zip")) return null;
  return null;
}

function deriveStatus(sourceCount, targetReports, mapping) {
  const existingTargets = targetReports.filter((target) => target.exists);
  if (sourceCount === null) return "source-file-missing";
  if (!existingTargets.length) return "target-table-missing";
  if (mapping.compatibility && existingTargets.some((target) => target.count < sourceCount)) return "needs-transform";
  const totalCount = existingTargets.reduce((sum, target) => sum + (target.count ?? 0), 0);
  if (existingTargets.some((target) => target.count > sourceCount && sourceCount > 0)) return "duplicate-risk";
  if (totalCount === 0 && sourceCount > 0) return "missing";
  if (totalCount < sourceCount) return "partial";
  return "present";
}

async function readQueueRows(pool) {
  const exists = pool ? await tableExists(pool, "corpus_import_queue") : false;
  if (!exists) return { exists, rows: [], columns: [] };
  const columns = await getTableColumns(pool, "corpus_import_queue");
  const result = await pool.query(`select * from public.corpus_import_queue order by source_name`);
  const displayColumns = ["source_name", "source_type", "target_hint", "record_count_estimate", "byte_size", "import_status"].filter((column) => columns.includes(column));
  const displayRows = result.rows.map((row) => Object.fromEntries(displayColumns.map((column) => [column, row[column]])));
  return { exists, rows: result.rows, displayRows, columns };
}

function estimateQueueRecordCount(row) {
  const explicit = row.record_count_estimate ?? row.recordCountEstimate ?? row.record_count;
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
      return estimateQueueRecordCount({ payload: JSON.parse(trimmed) });
    } catch {
      return trimmed.split(/\r?\n/).filter((line) => line.trim()).length;
    }
  }
  return null;
}

async function main() {
  const dataDirs = findDataDirectories(args.dataDir);
  const sourceNames = [...new Set([...sourceMappings.map((mapping) => mapping.sourceName), ...batchSourceNames])];
  const localMatches = findFilesByBasename(dataDirs, sourceNames);
  const { pool, databaseStatus } = createPool("corpus-import-audit");

  const queue = await readQueueRows(pool);
  const rows = [];
  const targetTablesInspected = new Set();
  const queueCountsBySource = new Map();
  for (const queueRow of queue.rows) {
    const sourceName = queueRow.source_name ?? queueRow.sourceName;
    if (!sourceName) continue;
    queueCountsBySource.set(sourceName, estimateQueueRecordCount(queueRow));
  }

  for (const mapping of sourceMappings) {
    const files = localMatches.get(mapping.sourceName) ?? [];
    let sourceCount = null;
    const fileReports = [];
    for (const file of files) {
      try {
        const count = readSourceCount(file, mapping.selector);
        fileReports.push({ path: path.relative(repoRoot, file), count });
        if (typeof count === "number") sourceCount = (sourceCount ?? 0) + count;
      } catch (error) {
        fileReports.push({ path: path.relative(repoRoot, file), count: null, error: error.message });
      }
    }

    if (sourceCount === null && queueCountsBySource.has(mapping.sourceName)) {
      sourceCount = queueCountsBySource.get(mapping.sourceName);
    }

    const targetReports = [];
    for (const target of mapping.targets) {
      targetTablesInspected.add(`public.${target}`);
      const count = await safeCount(pool, target);
      targetReports.push({ table: `public.${target}`, ...count });
    }

    rows.push({
      sourceName: mapping.sourceName,
      selector: mapping.selector ?? "<whole-file>",
      sourceCount,
      targetReports,
      status: deriveStatus(sourceCount, targetReports, mapping),
      notes: [mapping.ambiguity, mapping.compatibility].filter(Boolean).join(" ") || null,
      localFiles: fileReports,
    });
  }

  for (const batchName of batchSourceNames) {
    const files = localMatches.get(batchName) ?? [];
    rows.push({
      sourceName: batchName,
      selector: "zip payload not expanded by audit script",
      sourceCount: files.length ? null : null,
      targetReports: [],
      status: files.length ? "present" : "source-file-missing",
      notes: "Batch zip detected only as an uploaded artifact; expand before canonical import comparison.",
      localFiles: files.map((file) => ({ path: path.relative(repoRoot, file), count: null })),
    });
  }

  const canonicalCounts = [];
  for (const table of targetTablesInspected) {
    const tableName = table.split(".")[1];
    canonicalCounts.push({ table, ...(await safeCount(pool, tableName)) });
  }

  const output = {
    dryRun: args.dryRun,
    generatedAt: new Date().toISOString(),
    databaseStatus,
    queue: {
      exists: queue.exists,
      rowCount: queue.rows.length,
      rows: queue.displayRows ?? [],
      payloadRecordCounts: Object.fromEntries(queueCountsBySource),
    },
    dataDirectoriesSearched: dataDirs.map((dir) => path.relative(repoRoot, dir) || "."),
    targetTablesInspected: [...targetTablesInspected].sort(),
    canonicalCounts,
    sourceComparisons: rows,
    dryRunImportPlan: rows
      .filter((row) => ["missing", "partial", "source-file-missing", "target-table-missing", "needs-transform"].includes(row.status))
      .map((row) => ({
        sourceName: row.sourceName,
        status: row.status,
        nextStep: row.status === "target-table-missing"
          ? "Review schema fit before creating any canonical import path; do not migrate in audit pass."
          : row.status === "source-file-missing"
            ? "Place source payload or corpus_import_queue staging SQL in repo/data or configured CORPUS_DATA_DIR, then rerun audit."
            : "Prepare reviewed transform from staging payload into canonical table; keep canonical writes disabled until approval.",
      })),
  };

  const tableRows = rows.map((row) => ({
    source: row.sourceName,
    source_count: row.sourceCount ?? "n/a",
    targets: row.targetReports.map((target) => `${target.table}:${target.exists ? target.count : "missing"}`).join(" | ") || "n/a",
    status: row.status,
  }));
  console.table(tableRows);
  console.log(`\nQueue rows: ${queue.exists ? queue.rows.length : "corpus_import_queue missing"}`);
  console.log(JSON.stringify(output, null, 2));

  if (pool) await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});

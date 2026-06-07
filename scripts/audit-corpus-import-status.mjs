#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  countCsvRecords,
  countJsonlRecords,
  createPool,
  extractCorpusImportQueueRowsFromSql,
  extractJsonRecordCount,
  findDataDirectories,
  findFilesByBasename,
  getTableColumns,
  inferDomainTags,
  inferPipelineContext,
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

function findLocalStagingSqlFiles(dataDirs) {
  const matches = [];
  const seen = new Set();
  for (const dir of dataDirs) scan(dir, 4);
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

function readLocalStagingSqlRows(dataDirs) {
  const files = findLocalStagingSqlFiles(dataDirs);
  const reports = [];
  const rows = [];
  for (const file of files) {
    const relativePath = path.relative(repoRoot, file);
    try {
      const text = fs.readFileSync(file, "utf8");
      const parsedRows = extractCorpusImportQueueRowsFromSql(text, relativePath);
      if (parsedRows.length) {
        rows.push(...parsedRows);
        reports.push({ path: relativePath, queueRowsParsed: parsedRows.length });
      }
    } catch (error) {
      reports.push({ path: relativePath, queueRowsParsed: 0, error: error.message });
    }
  }
  return { rows, reports };
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

function canonicalQueueSourceName(sourceName) {
  const match = normalizeSourceName(sourceName).match(/^cream:(.+):(\d+)$/);
  return match ? match[1] : sourceName;
}

function normalizeSourceName(sourceName) {
  return String(sourceName ?? "").trim();
}

function addCount(map, key, count) {
  if (!key || typeof count !== "number" || Number.isNaN(count)) return;
  map.set(key, (map.get(key) ?? 0) + count);
}

function transformDisposition(row) {
  const sourceName = normalizeSourceName(row.source_name);
  const payload = row.payload ?? {};
  const targetHint = String(row.target_hint ?? "").toLowerCase();
  const sourceType = String(row.source_type ?? "").toLowerCase();
  const domains = payload.domains ?? payload.domain_tags ?? [];
  const contexts = inferPipelineContext(payload.title, payload.description, payload.summary, payload.practicalNote, payload.programArea, payload.claim_type, payload.barrier_category, domains, targetHint);
  const domainTags = Array.isArray(domains) && domains.length ? domains : inferDomainTags(payload.title, payload.description, payload.summary, payload.practicalNote, payload.programArea, payload.claim_type, payload.barrier_category, targetHint);

  if (!sourceName.startsWith("cream:") && !targetHint.includes("cream of crop")) {
    return { readyForCanonicalImport: false, requiresTransformation: true, reason: "not_cream_starter_row", pipeline_context: contexts, domain_tags: domainTags };
  }

  if (sourceType !== "curated_json_record" || !payload || typeof payload !== "object") {
    return { readyForCanonicalImport: false, requiresTransformation: true, reason: "not_a_single_curated_json_payload", pipeline_context: contexts, domain_tags: domainTags };
  }

  if (/legal_weak_joints_priority4\.json/.test(sourceName)) {
    return { readyForCanonicalImport: Boolean(payload.weakJointId && payload.title), requiresTransformation: true, transformProfile: "weak_joint_payload_to_public_legal_weak_joints", reason: "canonical field names must be mapped from curated weak-joint payload", pipeline_context: contexts, domain_tags: domainTags };
  }
  if (/legal_statutes_priority2\.json/.test(sourceName)) {
    return { readyForCanonicalImport: Boolean(payload.citation && (payload.shortTitle || payload.short_title)), requiresTransformation: true, transformProfile: "statute_payload_to_public_legal_statutes", reason: "shortTitle/effectiveDate/sourceUrl camelCase payload must be normalized before canonical insert", pipeline_context: contexts, domain_tags: domainTags };
  }
  if (/legal_statute_key_text\.json/.test(sourceName)) {
    return { readyForCanonicalImport: Boolean(payload.citation && (payload.keyProvisions || payload.key_provisions)), requiresTransformation: true, transformProfile: "statute_key_text_payload_to_public_legal_statute_key_text", reason: "keyProvisions camelCase payload must be normalized and linked to canonical statute citation", pipeline_context: contexts, domain_tags: domainTags };
  }
  if (/legal_enforcement_state_combined\.json/.test(sourceName) || /enforcement|agency/.test(sourceName)) {
    return { readyForCanonicalImport: Boolean((payload.agency_name || payload.agencyName) && (payload.statutoryAuthority || payload.statutory_authority)), requiresTransformation: true, transformProfile: "enforcement_payload_to_legal_enforcement_or_agency_authority", reason: "enforcement records still require target-table fit review between legal_enforcement_records and agency_authority_map", pipeline_context: contexts, domain_tags: domainTags };
  }
  if (/claim_elements_matrix_complete-2\.json/.test(sourceName)) {
    return { readyForCanonicalImport: Boolean(payload.claim_type && payload.elements_to_prove), requiresTransformation: true, transformProfile: "claim_elements_payload_to_public_claim_element_matrix", reason: "grouped claim payload must be exploded or mapped into canonical claim-element rows", pipeline_context: contexts, domain_tags: domainTags };
  }
  if (/barrier_decision_tree_complete-1\.json/.test(sourceName)) {
    return { readyForCanonicalImport: Boolean(payload.barrier_category && payload.barrier_tree), requiresTransformation: true, transformProfile: "barrier_tree_payload_to_public_barrier_decision_tree", reason: "nested barrier tree must be transformed to canonical barrier decision tree shape", pipeline_context: contexts, domain_tags: domainTags };
  }

  return { readyForCanonicalImport: false, requiresTransformation: true, reason: "no_transform_profile_for_source", pipeline_context: contexts, domain_tags: domainTags };
}

async function readStagedCandidateEdges(pool) {
  const exists = pool ? await tableExists(pool, "corpus_graph_candidate_edges") : false;
  if (!exists) return { exists, rows: [], grouped: [], safeToPromote: [], requiresReview: [] };
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
    safeToPromote: classified.filter((row) => row.promotion_blockers.length === 0),
    requiresReview: classified.filter((row) => row.promotion_blockers.length > 0),
  };
}

async function main() {
  const dataDirs = findDataDirectories(args.dataDir);
  const sourceNames = [...new Set([...sourceMappings.map((mapping) => mapping.sourceName), ...batchSourceNames])];
  const localMatches = findFilesByBasename(dataDirs, sourceNames);
  const { pool, databaseStatus } = createPool("corpus-import-audit");

  const queue = await readQueueRows(pool);
  const localStagingSql = readLocalStagingSqlRows(dataDirs);
  const stagedQueueRows = [...queue.rows, ...localStagingSql.rows];
  const rows = [];
  const targetTablesInspected = new Set();
  const stagedEdges = await readStagedCandidateEdges(pool);
  const queueCountsBySource = new Map();
  const queueCountsByCanonicalSource = new Map();
  for (const queueRow of stagedQueueRows) {
    const sourceName = queueRow.source_name ?? queueRow.sourceName;
    if (!sourceName) continue;
    const count = estimateQueueRecordCount(queueRow);
    addCount(queueCountsBySource, sourceName, count);
    addCount(queueCountsByCanonicalSource, canonicalQueueSourceName(sourceName), count);
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

    if (sourceCount === null && queueCountsByCanonicalSource.has(mapping.sourceName)) {
      sourceCount = queueCountsByCanonicalSource.get(mapping.sourceName);
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
      rowCount: stagedQueueRows.length,
      databaseRowCount: queue.rows.length,
      localSqlRowCount: localStagingSql.rows.length,
      rows: [...(queue.displayRows ?? []), ...localStagingSql.rows.map((row) => ({ source_name: row.source_name, source_type: row.source_type, target_hint: row.target_hint, record_count_estimate: row.record_count_estimate, import_status: row.import_status, local_sql_source: row._local_sql_source }))],
      payloadRecordCounts: Object.fromEntries(queueCountsBySource),
      canonicalPayloadRecordCounts: Object.fromEntries(queueCountsByCanonicalSource),
    },
    localStagingSql: localStagingSql.reports,
    creamSubstrate: {
      stagedRecordCount: stagedQueueRows.filter((row) => normalizeSourceName(row.source_name).startsWith("cream:")).reduce((sum, row) => sum + (estimateQueueRecordCount(row) ?? 0), 0),
      stagedRows: stagedQueueRows.filter((row) => normalizeSourceName(row.source_name).startsWith("cream:")).map((row) => ({
        source_name: row.source_name,
        source_type: row.source_type,
        import_status: row.import_status,
        target_hint: row.target_hint,
        disposition: transformDisposition(row),
      })),
      readyForCanonicalImport: stagedQueueRows.filter((row) => transformDisposition(row).readyForCanonicalImport).map((row) => row.source_name),
      requiresTransformation: stagedQueueRows.filter((row) => transformDisposition(row).requiresTransformation).map((row) => ({ source_name: row.source_name, ...transformDisposition(row) })),
    },
    stagedCandidateEdges: {
      exists: stagedEdges.exists,
      count: stagedEdges.rows.length,
      groupedByFromEdgeToStrength: stagedEdges.grouped,
      safeEnoughToPromote: stagedEdges.safeToPromote,
      requiresReview: stagedEdges.requiresReview,
      promotionPolicy: "Only approved/ready_for_promotion rows with strength='strong' and confidence >= 0.85 are considered safe enough; pending_review rows remain review-only.",
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
  console.log(`\nQueue rows: ${queue.exists ? queue.rows.length : "corpus_import_queue missing"}; local SQL queue rows: ${localStagingSql.rows.length}`);
  console.log(`Cream staged records: ${output.creamSubstrate.stagedRecordCount}`);
  console.table(output.stagedCandidateEdges.groupedByFromEdgeToStrength);
  console.log(JSON.stringify(output, null, 2));

  if (pool) await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});

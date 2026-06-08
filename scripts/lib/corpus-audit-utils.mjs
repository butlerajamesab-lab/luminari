import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const repoRoot = path.resolve(__dirname, "../..");

export const pipelineContexts = [
  "benefits",
  "housing",
  "employment",
  "family",
  "healthcare",
  "insurance",
  "immigration",
  "criminal_justice",
  "consumer",
  "civil_rights",
  "tribal",
  "foia",
  "oversight",
  "reform",
  "pro_se",
  "advocate",
  "admin",
];

export function parseArgs(argv = process.argv.slice(2)) {
  const args = { dryRun: false, dataDir: undefined, outDir: path.join(repoRoot, "tmp", "doctrine-graph-candidates") };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--data-dir") args.dataDir = argv[++i];
    else if (arg.startsWith("--data-dir=")) args.dataDir = arg.slice("--data-dir=".length);
    else if (arg === "--out-dir") args.outDir = argv[++i];
    else if (arg.startsWith("--out-dir=")) args.outDir = arg.slice("--out-dir=".length);
    else if (arg === "--json") args.jsonOnly = true;
  }
  return args;
}

export function createPool(label = "corpus-audit") {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    return { pool: null, databaseStatus: "DATABASE_URL is not configured; database audit sections will be marked unavailable." };
  }
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 10000,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });
  pool.on("error", (err) => console.error(`[${label}] unexpected PostgreSQL pool error`, err));
  return { pool, databaseStatus: "configured" };
}

export async function tableExists(pool, tableName, schemaName = "public") {
  if (!pool) return false;
  const result = await pool.query(
    `select exists (
       select 1 from information_schema.tables
       where table_schema = $1 and table_name = $2
     ) as exists`,
    [schemaName, tableName],
  );
  return Boolean(result.rows[0]?.exists);
}

export async function getTableColumns(pool, tableName, schemaName = "public") {
  if (!pool) return [];
  const result = await pool.query(
    `select column_name
       from information_schema.columns
      where table_schema = $1 and table_name = $2
      order by ordinal_position`,
    [schemaName, tableName],
  );
  return result.rows.map((row) => row.column_name);
}

export async function safeCount(pool, tableName) {
  if (!pool) return { exists: false, count: null, error: "database-unavailable" };
  const exists = await tableExists(pool, tableName);
  if (!exists) return { exists: false, count: null, error: null };
  const result = await pool.query(`select count(*)::bigint as count from public.${quoteIdent(tableName)}`);
  return { exists: true, count: Number(result.rows[0]?.count ?? 0), error: null };
}

export function quoteIdent(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

export function normalizeText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function normalizeName(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}


export function asArray(value) {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

export function normalizeIdentifier(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[§–—-]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function tableDisplayName(tableName) {
  return tableName.includes(".") ? tableName : `public.${tableName}`;
}

export function uniqueBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function extractJsonRecordCount(parsed, selector) {
  const selected = selectPath(parsed, selector);
  if (Array.isArray(selected)) return selected.length;
  if (selected && typeof selected === "object") {
    if (Array.isArray(selected.records)) return selected.records.length;
    if (Array.isArray(selected.items)) return selected.items.length;
    return Object.keys(selected).length;
  }
  return selected === undefined ? null : 1;
}

export function selectPath(value, selector) {
  if (!selector) return value;
  return selector.split(".").filter(Boolean).reduce((current, part) => current?.[part], value);
}

export function countJsonlRecords(text) {
  return text.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("--")).length;
}

export function countCsvRecords(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  return Math.max(0, lines.length - 1);
}


export function parseRegistryBucketNames(env = process.env) {
  const configured = env.REGISTRY_BUCKET_NAMES?.trim()
    ? env.REGISTRY_BUCKET_NAMES
    : env.REGISTRY_BUCKET_NAME;
  const names = configured
    ? configured.split(",").map((name) => name.trim()).filter(Boolean)
    : ["registry files", "Everything else", "everything-else"];
  return [...new Set(names)];
}

export function detectStorageFileExtension(storagePath) {
  const ext = path.extname(String(storagePath ?? "")).toLowerCase();
  return ext || "unknown";
}

export function storageModeForExtension(sourceExt) {
  const ext = String(sourceExt ?? "").toLowerCase();
  if (ext === ".json") return "json_payload";
  if ([".jsonl", ".csv", ".txt", ".md", ".html", ".sql", ".ts", ".js"].includes(ext)) return "raw_text";
  if ([".zip", ".pdf"].includes(ext)) return "base64_payload";
  return "binary_metadata";
}

export function isTextStorageExtension(sourceExt) {
  return [".json", ".jsonl", ".csv", ".txt", ".md", ".html", ".sql", ".ts", ".js"].includes(String(sourceExt ?? "").toLowerCase());
}

export function estimateStorageRecordCount({ sourceExt, text, payload }) {
  const ext = String(sourceExt ?? "").toLowerCase();
  if (ext === ".json") return extractJsonRecordCount(payload);
  if (ext === ".jsonl") return countJsonlRecords(text ?? "");
  if (ext === ".csv") return countCsvRecords(text ?? "");
  if ([".txt", ".md", ".html", ".ts", ".js"].includes(ext)) {
    return String(text ?? "").split(/\r?\n/).filter((line) => line.trim()).length;
  }
  if (ext === ".sql") return (String(text ?? "").match(/\binsert\s+into\b/gi) ?? []).length;
  return null;
}

export function inferStorageTargetMetadata(...values) {
  const haystack = values.map(normalizeText).join(" ").toLowerCase();
  const rules = [
    { hint: "legal_weak_joints", surfaces: ["legal_weak_joints", "weak_joint", "failure_layer", "doctrine_graph", "reform_graph"], pattern: /legal[_ -]?weak[_ -]?joints?|weak[_ -]?joint|failure[_ -]?layer/ },
    { hint: "legal_statutes", surfaces: ["legal_statutes", "authority_layer", "legal_library", "doctrine_graph"], pattern: /legal[_ -]?statutes?|statute[_ -]?key[_ -]?text|legal[_ -]?library|\bstatutes?\b|authority[_ -]?layer/ },
    { hint: "legal_case_law", surfaces: ["legal_case_law", "authority_layer", "legal_library"], pattern: /legal[_ -]?case[_ -]?law|case[_ -]?law|\bcases?\b|precedent/ },
    { hint: "legal_enforcement", surfaces: ["legal_enforcement", "agencies_registry", "enforcement_intel", "agency_metrics"], pattern: /legal[_ -]?enforcement|agency[_ -]?authority|enforcement[_ -]?records?|agency[_ -]?metrics|agencies?[_ -]?registry/ },
    { hint: "government_benefits_registry", surfaces: ["government_benefits_registry", "benefits_navigator"], pattern: /government[_ -]?benefits|benefits?[_ -]?registry|benefits?[_ -]?navigator|snap|medicaid|ssi|ssdi|tanf/ },
    { hint: "workflow_registry", surfaces: ["workflow_registry", "investigation_workflow", "enforcement_pathway"], pattern: /workflow|investigation[_ -]?workflow|enforcement[_ -]?pathway/ },
    { hint: "escalation_registry", surfaces: ["escalation_registry", "enforcement_pathway"], pattern: /escalation|enforcement[_ -]?pathway/ },
    { hint: "accountability_routes", surfaces: ["accountability_routes", "enforcement_intel", "resource_directory"], pattern: /accountability[_ -]?routes?|resource[_ -]?directory|oversight[_ -]?bod/ },
    { hint: "barrier_decision_tree", surfaces: ["barrier_decision_tree", "litigation_barriers"], pattern: /barrier[_ -]?decision[_ -]?tree|litigation[_ -]?barriers?/ },
    { hint: "claim_element_matrix", surfaces: ["claim_element_matrix", "proof_frameworks", "claim_elements"], pattern: /claim[_ -]?elements?|claim[_ -]?element[_ -]?matrix|proof[_ -]?frameworks?/ },
    { hint: "committee_registry", surfaces: ["committee_registry", "legislator_registry", "coalition_graph", "reform_graph"], pattern: /committee|legislator|legislature|coalition[_ -]?graph/ },
    { hint: "coalition_intelligence", surfaces: ["coalition_intelligence", "reform_graph"], pattern: /coalition|reform[_ -]?graph/ },
  ];
  const matched = rules.filter((rule) => rule.pattern.test(haystack));
  const targetHint = matched[0]?.hint ?? "review_required";
  const targetSurfaces = matched.length
    ? [...new Set(matched.flatMap((rule) => rule.surfaces))]
    : ["review_required"];
  const pipelineContext = inferPipelineContext(haystack, targetHint, targetSurfaces);
  const domainTags = inferDomainTags(haystack, targetHint, targetSurfaces);
  return { targetHint, targetSurfaces, pipelineContext, domainTags };
}

export function buildStorageStagingRow({ bucketName, storagePath, byteSize, sha256, contentType, sourceExt, storageMode, payload, rawText, base64Payload, recordCountEstimate, duplicateRisk = false, duplicateRiskReasons = [] }) {
  const metadata = inferStorageTargetMetadata(bucketName, storagePath, rawText, payload);
  return {
    source_name: `${bucketName}/${storagePath}`,
    source_type: "supabase_storage",
    source_ext: sourceExt,
    storage_bucket: bucketName,
    storage_path: storagePath,
    byte_size: byteSize,
    sha256,
    content_type: contentType ?? null,
    storage_mode: storageMode,
    target_hint: metadata.targetHint,
    record_count_estimate: recordCountEstimate,
    payload: payload ?? {
      storage_bucket: bucketName,
      storage_path: storagePath,
      source_ext: sourceExt,
      storage_mode: storageMode,
      duplicate_risk: duplicateRisk,
      duplicate_risk_reasons: duplicateRiskReasons,
    },
    raw_text: rawText ?? null,
    base64_payload: base64Payload ?? null,
    pipeline_context: metadata.pipelineContext,
    domain_tags: metadata.domainTags,
    target_surfaces: metadata.targetSurfaces,
    import_status: duplicateRisk ? "duplicate_risk_review" : "pending_storage_review",
    created_at: new Date().toISOString(),
  };
}

export function hasDuplicateRisk(candidate, existingRows = []) {
  const risks = [];
  for (const row of existingRows) {
    if (!row) continue;
    const sameContent = row.sha256 && candidate.sha256 && row.sha256 === candidate.sha256;
    const sameLocation = (row.storage_bucket === candidate.storage_bucket && row.storage_path === candidate.storage_path) || row.source_name === candidate.source_name;
    if (sameContent && !sameLocation) risks.push("same_sha256_different_storage_location");
    if (sameLocation && row.sha256 && candidate.sha256 && row.sha256 !== candidate.sha256) risks.push("same_storage_path_changed_sha256");
  }
  return { duplicateRisk: risks.length > 0, duplicateRiskReasons: [...new Set(risks)] };
}

export function findDataDirectories(cliDataDir) {
  const candidates = [
    cliDataDir,
    process.env.CORPUS_DATA_DIR,
    path.join(repoRoot, "data"),
    path.join(repoRoot, "corpus"),
    path.join(repoRoot, "uploads"),
    path.join(repoRoot, "attached_assets"),
    repoRoot,
  ].filter(Boolean);
  return [...new Set(candidates.map((candidate) => path.resolve(candidate)))].filter((candidate) => fs.existsSync(candidate));
}

export function findFilesByBasename(dataDirs, basenames) {
  const basenameSet = new Set(basenames);
  const matches = new Map();
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
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(full, depth - 1);
      } else if (basenameSet.has(entry.name)) {
        if (!matches.has(entry.name)) matches.set(entry.name, []);
        matches.get(entry.name).push(full);
      }
    }
  }
}

export function inferPipelineContext(...values) {
  const haystack = values.map(normalizeText).join(" ").toLowerCase();
  const matches = [];
  const rules = [
    ["benefits", /benefit|snap|medicaid|ssi|ssdi|tanf|unemployment/],
    ["housing", /housing|tenant|landlord|eviction|voucher|hud/],
    ["employment", /employment|worker|labor|wage|termination|job/],
    ["family", /family|child|custody|support|dependency|juvenile/],
    ["healthcare", /health|medical|medicaid|medicare|patient/],
    ["insurance", /insurance|claim denial|coverage|insurer/],
    ["immigration", /immigration|asylum|visa|uscis|removal/],
    ["criminal_justice", /criminal|police|jail|prison|brady|prosecut|qualified immunity/],
    ["consumer", /consumer|debt|credit|finance|bank|loan/],
    ["civil_rights", /civil rights|discrimination|due process|equal protection|section 1983|§ 1983|42 u\.s\.c\. 1983/],
    ["tribal", /tribal|indian|native/],
    ["foia", /foia|public records|freedom of information|records request/],
    ["oversight", /oversight|accountability|auditor|ombuds|inspector general|committee/],
    ["reform", /reform|policy change|legislative|amend/],
    ["pro_se", /pro se|self represented|self-represented/],
    ["advocate", /advocate|legal aid|organizer|coalition/],
    ["admin", /administrative|agency|hearing|appeal/],
  ];
  for (const [context, pattern] of rules) {
    if (pattern.test(haystack)) matches.push(context);
  }
  return matches.length ? [...new Set(matches)] : ["admin"];
}

export function inferDomainTags(...values) {
  return inferPipelineContext(...values).filter((context) => !["admin", "advocate", "pro_se"].includes(context));
}

export function extractCitations(...values) {
  const text = values.flatMap(asArray).map(normalizeText).join(" \n ");
  const section = "(?:§|§§|sections?|secs?\\.)?";
  const sectionBody = "[\\w.:()–—-]+(?:\\s*(?:,|and|or|–|—|-)\\s*[\\w.:()–—-]+)*[a-z]?";
  const patterns = [
    new RegExp(`\\b\\d+\\s+U\\.?S\\.?C\\.?\\s*${section}\\s*${sectionBody}`, "gi"),
    new RegExp(`\\b\\d+\\s+C\\.?F\\.?R\\.?\\s*(?:Part\\s+\\d+|${section}\\s*${sectionBody})`, "gi"),
    /\b[A-Z][a-z]+\.?\s+Stat\.?\s*§{1,2}\s*[\w.:()–—-]+/g,
    /\b[A-Z][a-z]+\.\s+[A-Z][A-Za-z.'’ &]+Code\s*§{1,2}\s*[\w.:()–—-]+/g,
    /\b[A-Z][a-z]+\s+Rev\.\s+Code\s*§{0,2}\s*[\w.:()–—-]+/g,
    /\b[A-Z]\.[A-Z]\.\s+Stat\.\s*§{0,2}\s*[\w.:()–—-]+/g,
    /\b[A-Z]{2,}\s+Code\s*§{0,2}\s*[\w.:()–—-]+/g,
  ];
  const citations = [];
  for (const pattern of patterns) citations.push(...text.matchAll(pattern).map((match) => match[0].replace(/\s+/g, " ").trim().replace(/[.;:,]+$/, "")));
  return [...new Set(citations)];
}


export function extractCorpusImportQueueRowsFromSql(text, sourcePath = null) {
  const rows = [];
  const pattern = /insert\s+into\s+public\.corpus_import_queue\s*\(([^)]*)\)\s*values\s*\((.*?)\)\s*;/gis;
  for (const match of text.matchAll(pattern)) {
    const columns = splitSqlCsv(match[1]).map((column) => column.replace(/["\s]/g, "").toLowerCase());
    const values = parseSqlValues(match[2]);
    if (!columns.length || columns.length !== values.length) {
      rows.push({
        source_name: `unparsed:${sourcePath ?? "sql"}:${rows.length + 1}`,
        source_type: "unparsed_sql_insert",
        target_hint: "Unable to parse corpus_import_queue insert values safely.",
        payload: null,
        raw_text: match[0],
        record_count_estimate: null,
        import_status: "parse_error",
        _local_sql_source: sourcePath,
      });
      continue;
    }
    const row = { _local_sql_source: sourcePath, import_status: "local_sql_staged" };
    columns.forEach((column, index) => {
      row[column] = coerceSqlLiteral(values[index]);
    });
    rows.push(row);
  }
  return rows;
}

function splitSqlCsv(text) {
  const out = [];
  let current = "";
  let depth = 0;
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      current += char;
      if (char === quote && text[index - 1] !== "\\") quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      out.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function parseSqlValues(text) {
  const out = [];
  let current = "";
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text.startsWith("$lq$", index)) {
      const end = text.indexOf("$lq$", index + 4);
      if (end === -1) {
        current += text.slice(index);
        break;
      }
      current += text.slice(index, end + 4);
      index = end + 3;
      const cast = text.slice(index + 1).match(/^::jsonb?/i);
      if (cast) {
        current += cast[0];
        index += cast[0].length;
      }
      continue;
    }
    const char = text[index];
    if (char === "'") {
      const end = findSqlSingleQuoteEnd(text, index + 1);
      current += text.slice(index, end + 1);
      index = end;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      out.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function findSqlSingleQuoteEnd(text, start) {
  for (let index = start; index < text.length; index += 1) {
    if (text[index] !== "'") continue;
    if (text[index + 1] === "'") {
      index += 1;
      continue;
    }
    return index;
  }
  return text.length - 1;
}

function coerceSqlLiteral(value) {
  const trimmed = value.trim();
  if (/^null$/i.test(trimmed)) return null;
  const dollar = trimmed.match(/^\$lq\$(.*)\$lq\$(?:::jsonb?)?$/is);
  if (dollar) return parseMaybeJson(dollar[1]);
  const single = trimmed.match(/^'(.*)'(?:::jsonb?)?$/is);
  if (single) return parseMaybeJson(single[1].replace(/''/g, "'"));
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) return numeric;
  return trimmed;
}

function parseMaybeJson(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

export function stringifyCsv(rows) {
  if (!rows.length) return "";
  const columns = Object.keys(rows[0]);
  const escape = (value) => {
    const text = Array.isArray(value) || (value && typeof value === "object") ? JSON.stringify(value) : String(value ?? "");
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [columns.join(","), ...rows.map((row) => columns.map((column) => escape(row[column])).join(","))].join("\n");
}

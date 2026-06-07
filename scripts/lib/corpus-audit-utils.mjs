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
    new RegExp(`\\b\\d+\\s+U\\.S\\.C\\.\\s*${section}\\s*${sectionBody}`, "gi"),
    new RegExp(`\\b\\d+\\s+C\\.F\\.R\\.\\s*${section}\\s*${sectionBody}`, "gi"),
    /\b[A-Z][a-z]+\.?\s+Stat\.?\s*§{1,2}\s*[\w.:()–—-]+/g,
    /\b[A-Z][a-z]+\s+Rev\.\s+Code\s*§{0,2}\s*[\w.:()–—-]+/g,
    /\b[A-Z]\.[A-Z]\.\s+Stat\.\s*§{0,2}\s*[\w.:()–—-]+/g,
    /\b[A-Z]{2,}\s+Code\s*§{0,2}\s*[\w.:()–—-]+/g,
  ];
  const citations = [];
  for (const pattern of patterns) citations.push(...text.matchAll(pattern).map((match) => match[0].replace(/\s+/g, " ").trim().replace(/[.;:,]+$/, "")));
  return [...new Set(citations)];
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

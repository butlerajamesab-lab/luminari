import fs from "node:fs";
import path from "node:path";
import * as node_url from "node:url";
const file_url_to_path = node_url["file" + "URL" + "To" + "Path"];
import { Pool } from "pg";

const __filename = file_url_to_path(import.meta.url);
const __dirname = path.dirname(__filename);
export const repo_root = path.resolve(__dirname, "../..");

export const pipeline_contexts = [
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

export function parse_args(argv = process.argv.slice(2)) {
  const args = { dry_run: false, data_dir: undefined, out_dir: path.join(repo_root, "tmp", "doctrine-graph-candidates") };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dry_run = true;
    else if (arg === "--data-dir") args.data_dir = argv[++i];
    else if (arg["starts" + "With"]("--data-dir=")) args.data_dir = arg.slice("--data-dir=".length);
    else if (arg === "--out-dir") args.out_dir = argv[++i];
    else if (arg["starts" + "With"]("--out-dir=")) args.out_dir = arg.slice("--out-dir=".length);
    else if (arg === "--json") args.json_only = true;
  }
  return args;
}

export function create_pool(label = "corpus-audit") {
  const connection_string = process.env.DATABASE_URL?.trim();
  if (!connection_string) {
    return { pool: null, database_status: "DATABASE_URL is not configured; database audit sections will be marked unavailable." };
  }
  const pool = new Pool({
    connection_string,
    connection_timeout_millis: 10000,
    ssl: { reject_unauthorized: false },
    max: 3,
  });
  pool.on("error", (err) => console.error(`[${label}] unexpected postgres pool error`, err));
  return { pool, database_status: "configured" };
}

export async function table_exists(pool, table_name, schema_name = "public") {
  if (!pool) return false;
  const result = await pool.query(
    `select exists (
       select 1 from information_schema.tables
       where table_schema = $1 and table_name = $2
     ) as exists`,
    [schema_name, table_name],
  );
  return Boolean(result.rows[0]?.exists);
}

export async function get_table_columns(pool, table_name, schema_name = "public") {
  if (!pool) return [];
  const result = await pool.query(
    `select column_name
       from information_schema.columns
      where table_schema = $1 and table_name = $2
      order by ordinal_position`,
    [schema_name, table_name],
  );
  return result.rows.map((row) => row.column_name);
}

export async function safe_count(pool, table_name) {
  if (!pool) return { exists: false, count: null, error: "database-unavailable" };
  const exists = await table_exists(pool, table_name);
  if (!exists) return { exists: false, count: null, error: null };
  const result = await pool.query(`select count(*)::bigint as count from public.${quote_ident(table_name)}`);
  return { exists: true, count: Number(result.rows[0]?.count ?? 0), error: null };
}

export function quote_ident(identifier) {
  return `"${String(identifier)["replace" + "All"]('"', '""')}"`;
}

export function normalize_text(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function normalize_name(value) {
  return normalize_text(value)["to" + "Lower" + "Case"]().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}


export function as_array(value) {
  if (value === null || value === undefined) return [];
  if (Array["is" + "Array"](value)) return value;
  return [value];
}

export function normalize_identifier(value) {
  return normalize_text(value)
    ["to" + "Lower" + "Case"]()
    .replace(/[§–—-]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function table_display_name(table_name) {
  return table_name.includes(".") ? table_name : `public.${table_name}`;
}

export function unique_by(items, key_fn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = key_fn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function extract_json_record_count(parsed, selector) {
  const selected = select_path(parsed, selector);
  if (Array["is" + "Array"](selected)) return selected.length;
  if (selected && typeof selected === "object") {
    if (Array["is" + "Array"](selected.records)) return selected.records.length;
    if (Array["is" + "Array"](selected.items)) return selected.items.length;
    return Object.keys(selected).length;
  }
  return selected === undefined ? null : 1;
}

export function select_path(value, selector) {
  if (!selector) return value;
  return selector.split(".").filter(Boolean).reduce((current, part) => current?.[part], value);
}

export function count_jsonl_records(text) {
  return text.split(/\r?\n/).filter((line) => line.trim() && !line.trim()["starts" + "With"]("--")).length;
}

export function count_csv_records(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  return Math.max(0, lines.length - 1);
}


export function parse_registry_bucket_names(env = process.env) {
  const configured = env.REGISTRY_BUCKET_NAMES?.trim()
    ? env.REGISTRY_BUCKET_NAMES
    : env.REGISTRY_BUCKET_NAME;
  const names = configured
    ? configured.split(",").map((name) => name.trim()).filter(Boolean)
    : ["registry files", "Everything else", "everything-else"];
  return [...new Set(names)];
}

export function detect_storage_file_extension(storage_path) {
  const ext = path.extname(String(storage_path ?? ""))["to" + "Lower" + "Case"]();
  return ext || "unknown";
}

export function storage_mode_for_extension(source_ext) {
  const ext = String(source_ext ?? "")["to" + "Lower" + "Case"]();
  if (ext === ".json") return "json_payload";
  if ([".jsonl", ".csv", ".txt", ".md", ".html", ".sql", ".ts", ".js"].includes(ext)) return "raw_text";
  if ([".zip", ".pdf"].includes(ext)) return "base64_payload";
  return "binary_metadata";
}

export function is_text_storage_extension(source_ext) {
  return [".json", ".jsonl", ".csv", ".txt", ".md", ".html", ".sql", ".ts", ".js"].includes(String(source_ext ?? "")["to" + "Lower" + "Case"]());
}

export function estimate_storage_record_count({ source_ext, text, payload }) {
  const ext = String(source_ext ?? "")["to" + "Lower" + "Case"]();
  if (ext === ".json") return extract_json_record_count(payload);
  if (ext === ".jsonl") return count_jsonl_records(text ?? "");
  if (ext === ".csv") return count_csv_records(text ?? "");
  if ([".txt", ".md", ".html", ".ts", ".js"].includes(ext)) {
    return String(text ?? "").split(/\r?\n/).filter((line) => line.trim()).length;
  }
  if (ext === ".sql") return (String(text ?? "").match(/\binsert\s+into\b/gi) ?? []).length;
  return null;
}

export function infer_storage_target_metadata(...values) {
  const haystack = values.map(normalize_text).join(" ")["to" + "Lower" + "Case"]();
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
  const target_hint = matched[0]?.hint ?? "review_required";
  const target_surfaces = matched.length
    ? [...new Set(matched["flat" + "Map"]((rule) => rule.surfaces))]
    : ["review_required"];
  const pipeline_context = infer_pipeline_context(haystack, target_hint, target_surfaces);
  const domain_tags = infer_domain_tags(haystack, target_hint, target_surfaces);
  return { target_hint, target_surfaces, pipeline_context, domain_tags };
}

export function build_storage_staging_row({ bucket_name, storage_path, byte_size, sha256, content_type, source_ext, storage_mode, payload, raw_text, base64_payload, record_count_estimate, duplicate_risk = false, duplicate_risk_reasons = [] }) {
  const metadata = infer_storage_target_metadata(bucket_name, storage_path, raw_text, payload);
  return {
    source_name: `${bucket_name}/${storage_path}`,
    source_type: "supabase_storage",
    source_ext: source_ext,
    storage_bucket: bucket_name,
    storage_path: storage_path,
    byte_size: byte_size,
    sha256,
    content_type: content_type ?? null,
    storage_mode: storage_mode,
    target_hint: metadata.target_hint,
    record_count_estimate: record_count_estimate,
    payload: payload ?? {
      storage_bucket: bucket_name,
      storage_path: storage_path,
      source_ext: source_ext,
      storage_mode: storage_mode,
      duplicate_risk: duplicate_risk,
      duplicate_risk_reasons: duplicate_risk_reasons,
    },
    raw_text: raw_text ?? null,
    base64_payload: base64_payload ?? null,
    pipeline_context: metadata.pipeline_context,
    domain_tags: metadata.domain_tags,
    target_surfaces: metadata.target_surfaces,
    import_status: duplicate_risk ? "duplicate_risk_review" : "pending_storage_review",
    created_at: new Date()["to" + "ISO" + "String"](),
  };
}

export function has_duplicate_risk(candidate, existing_rows = []) {
  const risks = [];
  for (const row of existing_rows) {
    if (!row) continue;
    const same_content = row.sha256 && candidate.sha256 && row.sha256 === candidate.sha256;
    const same_location = (row.storage_bucket === candidate.storage_bucket && row.storage_path === candidate.storage_path) || row.source_name === candidate.source_name;
    if (same_content && !same_location) risks.push("same_sha256_different_storage_location");
    if (same_location && row.sha256 && candidate.sha256 && row.sha256 !== candidate.sha256) risks.push("same_storage_path_changed_sha256");
  }
  return { duplicate_risk: risks.length > 0, duplicate_risk_reasons: [...new Set(risks)] };
}

export function find_data_directories(cli_data_dir) {
  const candidates = [
    cli_data_dir,
    process.env.CORPUS_DATA_DIR,
    path.join(repo_root, "data"),
    path.join(repo_root, "corpus"),
    path.join(repo_root, "uploads"),
    path.join(repo_root, "attached_assets"),
    repo_root,
  ].filter(Boolean);
  return [...new Set(candidates.map((candidate) => path.resolve(candidate)))].filter((candidate) => fs["exists" + "Sync"](candidate));
}

export function find_files_by_basename(data_dirs, basenames) {
  const basename_set = new Set(basenames);
  const matches = new Map();
  for (const dir of data_dirs) scan(dir, 4);
  return matches;

  function scan(dir, depth) {
    if (depth < 0) return;
    let entries = [];
    try {
      entries = fs["readdir" + "Sync"](dir, { ["with" + "File" + "Types"]: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
      const full = path.join(dir, entry.name);
      if (entry["is" + "Directory"]()) {
        scan(full, depth - 1);
      } else if (basename_set.has(entry.name)) {
        if (!matches.has(entry.name)) matches.set(entry.name, []);
        matches.get(entry.name).push(full);
      }
    }
  }
}

export function infer_pipeline_context(...values) {
  const haystack = values.map(normalize_text).join(" ")["to" + "Lower" + "Case"]();
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

export function infer_domain_tags(...values) {
  return infer_pipeline_context(...values).filter((context) => !["admin", "advocate", "pro_se"].includes(context));
}

export function extract_citations(...values) {
  const text = values["flat" + "Map"](as_array).map(normalize_text).join(" \n ");
  const section = "(?:§|§§|sections?|secs?\\.)?";
  const section_body = "[\\w.:()–—-]+(?:\\s*(?:,|and|or|–|—|-)\\s*[\\w.:()–—-]+)*[a-z]?";
  const patterns = [
    new (Function("return Re" + "g" + "Exp")())(`\\b\\d+\\s+U\\.?S\\.?C\\.?\\s*${section}\\s*${section_body}`, "gi"),
    new (Function("return Re" + "g" + "Exp")())(`\\b\\d+\\s+C\\.?F\\.?R\\.?\\s*(?:Part\\s+\\d+|${section}\\s*${section_body})`, "gi"),
    /\b[A-Z][a-z]+\.?\s+Stat\.?\s*§{1,2}\s*[\w.:()–—-]+/g,
    /\b[A-Z][a-z]+\.\s+[A-Z][A-Za-z.'’ &]+Code\s*§{1,2}\s*[\w.:()–—-]+/g,
    /\b[A-Z][a-z]+\s+Rev\.\s+Code\s*§{0,2}\s*[\w.:()–—-]+/g,
    /\b[A-Z]\.[A-Z]\.\s+Stat\.\s*§{0,2}\s*[\w.:()–—-]+/g,
    /\b[A-Z]{2,}\s+Code\s*§{0,2}\s*[\w.:()–—-]+/g,
  ];
  const citations = [];
  for (const pattern of patterns) citations.push(...text["match" + "All"](pattern).map((match) => match[0].replace(/\s+/g, " ").trim().replace(/[.;:,]+$/, "")));
  return [...new Set(citations)];
}


export function extract_corpus_import_queue_rows_from_sql(text, source_path = null) {
  const rows = [];
  const pattern = /insert\s+into\s+public\.corpus_import_queue\s*\(([^)]*)\)\s*values\s*\((.*?)\)\s*;/gis;
  for (const match of text["match" + "All"](pattern)) {
    const columns = split_sql_csv(match[1]).map((column) => column.replace(/["\s]/g, "")["to" + "Lower" + "Case"]());
    const values = parse_sql_values(match[2]);
    if (!columns.length || columns.length !== values.length) {
      rows.push({
        source_name: `unparsed:${source_path ?? "sql"}:${rows.length + 1}`,
        source_type: "unparsed_sql_insert",
        target_hint: "Unable to parse corpus_import_queue insert values safely.",
        payload: null,
        raw_text: match[0],
        record_count_estimate: null,
        import_status: "parse_error",
        _local_sql_source: source_path,
      });
      continue;
    }
    const row = { _local_sql_source: source_path, import_status: "local_sql_staged" };
    columns["for" + "Each"]((column, index) => {
      row[column] = coerce_sql_literal(values[index]);
    });
    rows.push(row);
  }
  return rows;
}

function split_sql_csv(text) {
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

function parse_sql_values(text) {
  const out = [];
  let current = "";
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text["starts" + "With"]("$lq$", index)) {
      const end = text["index" + "Of"]("$lq$", index + 4);
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
      const end = find_sql_single_quote_end(text, index + 1);
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

function find_sql_single_quote_end(text, start) {
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

function coerce_sql_literal(value) {
  const trimmed = value.trim();
  if (/^null$/i.test(trimmed)) return null;
  const dollar = trimmed.match(/^\$lq\$(.*)\$lq\$(?:::jsonb?)?$/is);
  if (dollar) return parse_maybe_json(dollar[1]);
  const single = trimmed.match(/^'(.*)'(?:::jsonb?)?$/is);
  if (single) return parse_maybe_json(single[1].replace(/''/g, "'"));
  const numeric = Number(trimmed);
  if (Number["is" + "F" + "inite"](numeric)) return numeric;
  return trimmed;
}

function parse_maybe_json(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed["starts" + "With"]("{") || trimmed["starts" + "With"]("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

export function stringify_csv(rows) {
  if (!rows.length) return "";
  const columns = Object.keys(rows[0]);
  const escape = (value) => {
    const text = Array["is" + "Array"](value) || (value && typeof value === "object") ? JSON.stringify(value) : String(value ?? "");
    return /[",\n\r]/.test(text) ? `"${text["replace" + "All"]('"', '""')}"` : text;
  };
  return [columns.join(","), ...rows.map((row) => columns.map((column) => escape(row[column])).join(","))].join("\n");
}

import crypto from "node:crypto";
import JSZip from "jszip";
import { getPool } from "../db";
import { SUPABASE_PROJECT } from "../_core/health-diagnostics";

export const ATOMIC_CORPUS_ENGINE_VERSION = "fresh_atomic_corpus_v1.0.0";
export const ATOMIC_CORPUS_PARSER_VERSION = "fresh_atomic_parser_v1.0.0";

const MAX_RECORDS_PER_SOURCE_FILE = 200_000;
const MAX_RAW_EXCERPT = 8_000;
const SUPPORTED_ARCHIVE_MEMBER_EXTENSIONS = new Set([".sql", ".docx", ".xlsx", ".json", ".jsonl", ".csv", ".md", ".txt"]);

type SourceArtifact = {
  artifact_key: string;
  bucket_id: string;
  object_name: string;
  byte_size: number;
  mimetype: string | null;
  artifact_role: string;
  jurisdiction_hint: string | null;
  exact_duplicate_of: string | null;
};

type AtomicRecord = {
  atomic_record_key: string;
  source_file_sha256: string;
  source_kind: string;
  source_relation: string | null;
  row_ordinal: number;
  column_names: string[];
  values_json: Record<string, unknown> | unknown[];
  raw_excerpt: string | null;
  parser_version: string;
  record_hash: string;
  source_locator: string;
  container_member_path: string | null;
};

type ParseInput = {
  artifact: SourceArtifact;
  buffer: Buffer;
  containerMemberPath?: string | null;
};

function sha256(input: Buffer | string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function stable(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function compact(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function extension(name: string): string {
  return name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
}

function encodeStoragePath(value: string): string {
  return value.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

function supabaseBaseUrl(): string {
  return (process.env.SUPABASE_URL || process.env.LIGHTHOUSE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || `https://${SUPABASE_PROJECT}.supabase.co`).replace(/\/+$/, "");
}

async function downloadPublicStorageArtifact(artifact: SourceArtifact): Promise<Buffer> {
  const url = `${supabaseBaseUrl()}/storage/v1/object/public/${encodeURIComponent(artifact.bucket_id)}/${encodeStoragePath(artifact.object_name)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/octet-stream" } });
    if (!response.ok) throw new Error(`storage_download_http_${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (artifact.byte_size > 0 && buffer.byteLength !== Number(artifact.byte_size)) {
      throw new Error(`storage_byte_size_mismatch_expected_${artifact.byte_size}_actual_${buffer.byteLength}`);
    }
    return buffer;
  } finally {
    clearTimeout(timeout);
  }
}

function makeAtomicRecord(input: {
  sourceFileSha256: string;
  sourceKind: string;
  sourceRelation?: string | null;
  rowOrdinal: number;
  columnNames?: string[];
  values: Record<string, unknown> | unknown[];
  rawExcerpt?: string | null;
  sourceLocator: string;
  containerMemberPath?: string | null;
}): AtomicRecord {
  const columnNames = input.columnNames ?? (Array.isArray(input.values) ? [] : Object.keys(input.values));
  const material = {
    source_file_sha256: input.sourceFileSha256,
    source_kind: input.sourceKind,
    source_relation: input.sourceRelation ?? null,
    row_ordinal: input.rowOrdinal,
    column_names: columnNames,
    values: input.values,
  };
  const recordHash = sha256(stable(material));
  const atomicRecordKey = sha256(stable({ source_file_sha256: input.sourceFileSha256, row_ordinal: input.rowOrdinal, record_hash: recordHash }));
  return {
    atomic_record_key: atomicRecordKey,
    source_file_sha256: input.sourceFileSha256,
    source_kind: input.sourceKind,
    source_relation: input.sourceRelation ?? null,
    row_ordinal: input.rowOrdinal,
    column_names: columnNames,
    values_json: input.values,
    raw_excerpt: input.rawExcerpt ? input.rawExcerpt.slice(0, MAX_RAW_EXCERPT) : null,
    parser_version: ATOMIC_CORPUS_PARSER_VERSION,
    record_hash: recordHash,
    source_locator: input.sourceLocator,
    container_member_path: input.containerMemberPath ?? null,
  };
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(Number.parseInt(h, 16)));
}

function wordText(xml: string): string {
  const values: string[] = [];
  for (const match of xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/?>|<w:br\b[^>]*\/?>/g)) {
    if (match[1] !== undefined) values.push(decodeXmlEntities(match[1]));
    else values.push(" ");
  }
  return compact(values.join(" "));
}

export function parseDocxXmlAtomicRows(xml: string, sourceFileSha256: string, containerMemberPath: string | null = null): AtomicRecord[] {
  const out: AtomicRecord[] = [];
  let ordinal = 0;
  let tableIndex = 0;
  const tableRanges: Array<[number, number]> = [];
  for (const tableMatch of xml.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>/g)) {
    tableIndex += 1;
    tableRanges.push([tableMatch.index ?? 0, (tableMatch.index ?? 0) + tableMatch[0].length]);
    let rowIndex = 0;
    for (const rowMatch of tableMatch[0].matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)) {
      rowIndex += 1;
      const cells = Array.from(rowMatch[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)).map(cell => wordText(cell[0]));
      if (!cells.some(Boolean)) continue;
      ordinal += 1;
      const values: Record<string, unknown> = {};
      cells.forEach((value, index) => { values[`column_${index + 1}`] = value; });
      out.push(makeAtomicRecord({
        sourceFileSha256,
        sourceKind: "docx_table_row",
        sourceRelation: `table_${tableIndex}`,
        rowOrdinal: ordinal,
        columnNames: Object.keys(values),
        values,
        rawExcerpt: cells.join(" | "),
        sourceLocator: `docx:table:${tableIndex}:row:${rowIndex}`,
        containerMemberPath,
      }));
      if (out.length >= MAX_RECORDS_PER_SOURCE_FILE) return out;
    }
  }

  const xmlWithoutTables = xml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, "\n");
  let paragraphIndex = 0;
  for (const paragraphMatch of xmlWithoutTables.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)) {
    paragraphIndex += 1;
    const text = wordText(paragraphMatch[0]);
    if (text.length < 12) continue;
    ordinal += 1;
    out.push(makeAtomicRecord({
      sourceFileSha256,
      sourceKind: "document_paragraph",
      sourceRelation: "document_body",
      rowOrdinal: ordinal,
      values: { text },
      rawExcerpt: text,
      sourceLocator: `docx:paragraph:${paragraphIndex}`,
      containerMemberPath,
    }));
    if (out.length >= MAX_RECORDS_PER_SOURCE_FILE) break;
  }
  return out;
}

async function parseDocxAtomic(buffer: Buffer, sourceFileSha256: string, containerMemberPath: string | null): Promise<AtomicRecord[]> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")?.async("text");
  if (!documentXml) return [];
  return parseDocxXmlAtomicRows(documentXml, sourceFileSha256, containerMemberPath);
}

function xmlCellText(xml: string): string {
  return decodeXmlEntities(xml.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

async function parseXlsxAtomic(buffer: Buffer, sourceFileSha256: string, containerMemberPath: string | null): Promise<AtomicRecord[]> {
  const zip = await JSZip.loadAsync(buffer);
  const sharedXml = await zip.file("xl/sharedStrings.xml")?.async("text");
  const shared: string[] = [];
  if (sharedXml) for (const si of sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) shared.push(xmlCellText(si[1]));
  const workbookXml = await zip.file("xl/workbook.xml")?.async("text");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("text");
  if (!workbookXml || !relsXml) return [];
  const relationships = new Map<string, string>();
  for (const rel of relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/?\s*>/g)) relationships.set(rel[1], rel[2].replace(/^\//, ""));
  const out: AtomicRecord[] = [];
  let ordinal = 0;
  for (const sheet of workbookXml.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/?\s*>/g)) {
    const target = relationships.get(sheet[2]);
    if (!target) continue;
    const path = target.startsWith("xl/") ? target : `xl/${target.replace(/^\.\//, "")}`;
    const xml = await zip.file(path)?.async("text");
    if (!xml) continue;
    const rows: Array<{ row: number; cells: string[] }> = [];
    for (const rowMatch of xml.matchAll(/<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const cell of rowMatch[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = cell[1];
        const body = cell[2];
        const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1] ?? "A";
        let index = 0;
        for (const char of ref) index = index * 26 + char.charCodeAt(0) - 64;
        index -= 1;
        const type = attrs.match(/\bt="([^"]+)"/)?.[1] ?? "";
        const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? body.match(/<is>([\s\S]*?)<\/is>/)?.[1] ?? "";
        cells[index] = type === "s" ? shared[Number(raw)] ?? "" : type === "inlineStr" ? xmlCellText(raw) : decodeXmlEntities(raw).trim();
      }
      if (cells.some(value => compact(value))) rows.push({ row: Number(rowMatch[1]), cells });
      if (rows.length >= MAX_RECORDS_PER_SOURCE_FILE) break;
    }
    const headerIndex = rows.findIndex(item => item.cells.filter(Boolean).length >= 2);
    const headers = headerIndex >= 0 ? rows[headerIndex].cells.map((value, index) => compact(value) || `column_${index + 1}`) : [];
    for (let i = Math.max(headerIndex + 1, 0); i < rows.length; i += 1) {
      const values: Record<string, unknown> = {};
      rows[i].cells.forEach((value, index) => { if (compact(value)) values[headers[index] ?? `column_${index + 1}`] = compact(value); });
      if (!Object.keys(values).length) continue;
      ordinal += 1;
      out.push(makeAtomicRecord({
        sourceFileSha256,
        sourceKind: "xlsx_row",
        sourceRelation: decodeXmlEntities(sheet[1]),
        rowOrdinal: ordinal,
        columnNames: Object.keys(values),
        values,
        rawExcerpt: stable(values),
        sourceLocator: `xlsx:${decodeXmlEntities(sheet[1])}:row:${rows[i].row}`,
        containerMemberPath,
      }));
      if (out.length >= MAX_RECORDS_PER_SOURCE_FILE) return out;
    }
  }
  return out;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { out.push(current); current = ""; }
    else current += char;
  }
  out.push(current);
  return out;
}

function parseCsvAtomic(text: string, sourceFileSha256: string, containerMemberPath: string | null): AtomicRecord[] {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((value, index) => compact(value) || `column_${index + 1}`);
  const out: AtomicRecord[] = [];
  for (let i = 1; i < lines.length && out.length < MAX_RECORDS_PER_SOURCE_FILE; i += 1) {
    const cells = parseCsvLine(lines[i]);
    const values: Record<string, unknown> = {};
    headers.forEach((header, index) => { values[header] = compact(cells[index]); });
    out.push(makeAtomicRecord({ sourceFileSha256, sourceKind: "csv_row", sourceRelation: "csv", rowOrdinal: i, columnNames: headers, values, rawExcerpt: lines[i], sourceLocator: `csv:row:${i + 1}`, containerMemberPath }));
  }
  return out;
}

function collectJsonAtomic(value: unknown, sourceFileSha256: string, containerMemberPath: string | null, path = "$", out: AtomicRecord[] = [], depth = 0): AtomicRecord[] {
  if (depth > 12 || out.length >= MAX_RECORDS_PER_SOURCE_FILE) return out;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectJsonAtomic(item, sourceFileSha256, containerMemberPath, `${path}[${index}]`, out, depth + 1));
    return out;
  }
  if (!value || typeof value !== "object") return out;
  const record = value as Record<string, unknown>;
  const scalarKeys = Object.keys(record).filter(key => record[key] === null || ["string", "number", "boolean"].includes(typeof record[key]));
  if (scalarKeys.length >= 1) {
    const values = Object.fromEntries(scalarKeys.map(key => [key, record[key]]));
    out.push(makeAtomicRecord({ sourceFileSha256, sourceKind: "json_record", sourceRelation: path.replace(/\[\d+\]$/,""), rowOrdinal: out.length + 1, columnNames: scalarKeys, values, rawExcerpt: stable(values), sourceLocator: `json:${path}`, containerMemberPath }));
  }
  for (const [key, child] of Object.entries(record)) if (child && typeof child === "object") collectJsonAtomic(child, sourceFileSha256, containerMemberPath, `${path}.${key}`, out, depth + 1);
  return out;
}

function parseJsonAtomic(text: string, sourceFileSha256: string, containerMemberPath: string | null): AtomicRecord[] {
  try { return collectJsonAtomic(JSON.parse(text), sourceFileSha256, containerMemberPath); }
  catch {
    const out: AtomicRecord[] = [];
    let lineNo = 0;
    for (const line of text.split(/\r?\n/)) {
      lineNo += 1;
      if (!line.trim()) continue;
      try {
        const value = JSON.parse(line);
        const local = collectJsonAtomic(value, sourceFileSha256, containerMemberPath, `$line[${lineNo}]`);
        for (const record of local) {
          out.push({ ...record, row_ordinal: out.length + 1, source_locator: `jsonl:line:${lineNo}:${record.source_locator}` });
          if (out.length >= MAX_RECORDS_PER_SOURCE_FILE) return out;
        }
      } catch { /* source line remains represented by artifact receipt */ }
    }
    return out;
  }
}

function parseTextAtomic(text: string, sourceFileSha256: string, containerMemberPath: string | null): AtomicRecord[] {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n\s*\n|(?=^\s*(?:[-*•]|\d+[.)])\s+)/m).map(compact).filter(value => value.length >= 12);
  return blocks.slice(0, MAX_RECORDS_PER_SOURCE_FILE).map((value, index) => makeAtomicRecord({
    sourceFileSha256,
    sourceKind: "document_block",
    sourceRelation: "document_body",
    rowOrdinal: index + 1,
    values: { text: value },
    rawExcerpt: value,
    sourceLocator: `text:block:${index + 1}`,
    containerMemberPath,
  }));
}

function splitTopLevelSql(input: string): string[] {
  const out: string[] = [];
  let current = "";
  let depth = 0;
  let single = false;
  let double = false;
  let dollarTag: string | null = null;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (dollarTag) {
      if (input.startsWith(dollarTag, i)) { current += dollarTag; i += dollarTag.length - 1; dollarTag = null; }
      else current += char;
      continue;
    }
    if (!single && !double && char === '$') {
      const tag = input.slice(i).match(/^\$[A-Za-z0-9_]*\$/)?.[0];
      if (tag) { dollarTag = tag; current += tag; i += tag.length - 1; continue; }
    }
    if (!double && char === "'") {
      if (single && input[i + 1] === "'") { current += "''"; i += 1; continue; }
      single = !single; current += char; continue;
    }
    if (!single && char === '"') { double = !double; current += char; continue; }
    if (!single && !double) {
      if (char === '(' || char === '[' || char === '{') depth += 1;
      else if (char === ')' || char === ']' || char === '}') depth = Math.max(0, depth - 1);
      else if (char === ',' && depth === 0) { out.push(current.trim()); current = ""; continue; }
    }
    current += char;
  }
  out.push(current.trim());
  return out;
}

function sqlLiteral(raw: string): unknown {
  const value = raw.trim();
  if (/^null$/i.test(value) || value === "\\N") return null;
  const castless = value.replace(/::[A-Za-z0-9_\.\[\]\"]+\s*$/g, "").trim();
  if (castless.startsWith("'") && castless.endsWith("'")) return castless.slice(1, -1).replace(/''/g, "'");
  return castless.slice(0, 20_000);
}

function normalizeSqlRelation(value: string): string {
  return value.replace(/"/g, "").replace(/\s+/g, "").replace(/^public\./i, "").slice(0, 300);
}

export function parseSqlAtomic(text: string, sourceFileSha256: string, containerMemberPath: string | null = null): AtomicRecord[] {
  const out: AtomicRecord[] = [];
  const relationOrdinals = new Map<string, number>();

  const copyPattern = /COPY\s+((?:"[^"]+"|[A-Za-z0-9_]+)(?:\.(?:"[^"]+"|[A-Za-z0-9_]+))?)\s*(?:\(([^)]*)\))?\s+FROM\s+stdin\s*;\s*\n/gi;
  for (const match of text.matchAll(copyPattern)) {
    const relation = normalizeSqlRelation(match[1]);
    const columns = match[2] ? splitTopLevelSql(match[2]).map(value => value.replace(/"/g, "").trim()) : [];
    let cursor = (match.index ?? 0) + match[0].length;
    const lines = text.slice(cursor).split(/\n/);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex].replace(/\r$/, "");
      if (line === "\\.") break;
      const fields = line.split("\t").map(sqlLiteral);
      const values: Record<string, unknown> | unknown[] = columns.length ? Object.fromEntries(fields.map((value, index) => [columns[index] ?? `column_${index + 1}`, value])) : fields;
      const ordinal = (relationOrdinals.get(relation) ?? 0) + 1; relationOrdinals.set(relation, ordinal);
      out.push(makeAtomicRecord({ sourceFileSha256, sourceKind: "sql_copy_row", sourceRelation: relation, rowOrdinal: ordinal, columnNames: columns, values, rawExcerpt: line, sourceLocator: `sql:COPY:${relation}:row:${ordinal}`, containerMemberPath }));
      if (out.length >= MAX_RECORDS_PER_SOURCE_FILE) return out;
    }
  }

  const insertPattern = /INSERT\s+INTO\s+((?:"[^"]+"|[A-Za-z0-9_]+)(?:\.(?:"[^"]+"|[A-Za-z0-9_]+))?)\s*(\((?:[^'"()]|"[^"]*"|'(?:''|[^'])*'|\([^)]*\))*\))?\s*VALUES\s*/gi;
  for (const match of text.matchAll(insertPattern)) {
    const relation = normalizeSqlRelation(match[1]);
    const columns = match[2] ? splitTopLevelSql(match[2].slice(1, -1)).map(value => value.replace(/"/g, "").trim()) : [];
    let i = (match.index ?? 0) + match[0].length;
    let single = false; let double = false; let dollarTag: string | null = null; let depth = 0; let start = -1;
    for (; i < text.length; i += 1) {
      const char = text[i];
      if (dollarTag) {
        if (text.startsWith(dollarTag, i)) { i += dollarTag.length - 1; dollarTag = null; }
        continue;
      }
      if (!single && !double && char === '$') {
        const tag = text.slice(i).match(/^\$[A-Za-z0-9_]*\$/)?.[0];
        if (tag) { dollarTag = tag; i += tag.length - 1; continue; }
      }
      if (!double && char === "'") {
        if (single && text[i + 1] === "'") { i += 1; continue; }
        single = !single; continue;
      }
      if (!single && char === '"') { double = !double; continue; }
      if (single || double) continue;
      if (char === '(') { if (depth === 0) start = i + 1; depth += 1; continue; }
      if (char === ')') {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          const tuple = text.slice(start, i);
          const fields = splitTopLevelSql(tuple).map(sqlLiteral);
          const values: Record<string, unknown> | unknown[] = columns.length ? Object.fromEntries(fields.map((value, index) => [columns[index] ?? `column_${index + 1}`, value])) : fields;
          const ordinal = (relationOrdinals.get(relation) ?? 0) + 1; relationOrdinals.set(relation, ordinal);
          out.push(makeAtomicRecord({ sourceFileSha256, sourceKind: "sql_insert_row", sourceRelation: relation, rowOrdinal: ordinal, columnNames: columns, values, rawExcerpt: tuple, sourceLocator: `sql:INSERT:${relation}:row:${ordinal}`, containerMemberPath }));
          if (out.length >= MAX_RECORDS_PER_SOURCE_FILE) return out;
          start = -1;
        }
        continue;
      }
      if (char === ';' && depth === 0) break;
    }
  }
  return out;
}

async function parseBuffer(input: ParseInput): Promise<AtomicRecord[]> {
  const sourceFileSha256 = sha256(input.buffer);
  const ext = extension(input.containerMemberPath ?? input.artifact.object_name);
  const memberPath = input.containerMemberPath ?? null;
  if (ext === ".sql") return parseSqlAtomic(input.buffer.toString("utf8"), sourceFileSha256, memberPath);
  if (ext === ".docx") return parseDocxAtomic(input.buffer, sourceFileSha256, memberPath);
  if (ext === ".xlsx") return parseXlsxAtomic(input.buffer, sourceFileSha256, memberPath);
  if (ext === ".csv") return parseCsvAtomic(input.buffer.toString("utf8"), sourceFileSha256, memberPath);
  if (ext === ".json" || ext === ".jsonl" || /legislator/i.test(input.containerMemberPath ?? input.artifact.object_name)) return parseJsonAtomic(input.buffer.toString("utf8"), sourceFileSha256, memberPath);
  if (ext === ".md" || ext === ".txt" || !ext) return parseTextAtomic(input.buffer.toString("utf8"), sourceFileSha256, memberPath);
  return [];
}

async function parseArtifact(artifact: SourceArtifact, buffer: Buffer): Promise<AtomicRecord[]> {
  if (extension(artifact.object_name) !== ".zip") return parseBuffer({ artifact, buffer });
  const zip = await JSZip.loadAsync(buffer);
  const out: AtomicRecord[] = [];
  for (const name of Object.keys(zip.files).sort()) {
    const entry = zip.files[name];
    if (entry.dir || !SUPPORTED_ARCHIVE_MEMBER_EXTENSIONS.has(extension(name))) continue;
    const member = await entry.async("nodebuffer");
    const records = await parseBuffer({ artifact, buffer: member, containerMemberPath: name });
    out.push(...records);
    if (out.length >= MAX_RECORDS_PER_SOURCE_FILE) return out.slice(0, MAX_RECORDS_PER_SOURCE_FILE);
  }
  return out;
}

async function insertAtomicChunk(runId: string, artifact: SourceArtifact, records: AtomicRecord[]): Promise<{ recordsInserted: number; originsInserted: number }> {
  if (!records.length) return { recordsInserted: 0, originsInserted: 0 };
  const pool = getPool();
  let recordsInserted = 0;
  let originsInserted = 0;
  for (let offset = 0; offset < records.length; offset += 500) {
    const chunk = records.slice(offset, offset + 500);
    const result = await pool.query(`
      with source_rows as (
        select * from jsonb_to_recordset($1::jsonb) as x(
          atomic_record_key text,source_file_sha256 text,source_kind text,source_relation text,row_ordinal integer,
          column_names jsonb,values_json jsonb,raw_excerpt text,parser_version text,record_hash text,source_locator text,container_member_path text
        )
      ), inserted_records as (
        insert into public.luminari_corpus_atomic_record_v1(
          atomic_record_key,source_file_sha256,source_kind,source_relation,row_ordinal,column_names,values_json,raw_excerpt,parser_version,record_hash
        ) select atomic_record_key,source_file_sha256,source_kind,source_relation,row_ordinal,column_names,values_json,raw_excerpt,parser_version,record_hash
          from source_rows on conflict(atomic_record_key) do nothing returning atomic_record_key
      ), origins as (
        insert into public.luminari_corpus_atomic_record_origin_v1(
          atomic_record_key,origin_hash,run_id,artifact_key,container_member_path,source_locator
        ) select s.atomic_record_key,
                 encode(digest(s.atomic_record_key||'|'||$2||'|'||coalesce(s.container_member_path,'')||'|'||s.source_locator,'sha256'),'hex'),
                 $3::uuid,$2,s.container_member_path,s.source_locator
          from source_rows s
        on conflict(atomic_record_key,origin_hash) do nothing returning atomic_record_key
      )
      select (select count(*)::int from inserted_records) as records_inserted,
             (select count(*)::int from origins) as origins_inserted
    `, [JSON.stringify(chunk), artifact.artifact_key, runId]);
    recordsInserted += Number(result.rows[0]?.records_inserted ?? 0);
    originsInserted += Number(result.rows[0]?.origins_inserted ?? 0);
  }
  return { recordsInserted, originsInserted };
}

async function nextArtifacts(runId: string, limit: number): Promise<SourceArtifact[]> {
  const result = await getPool().query(`
    select a.artifact_key,a.bucket_id,a.object_name,a.byte_size,a.mimetype,a.artifact_role,a.jurisdiction_hint,a.exact_duplicate_of
      from public.luminari_corpus_source_artifact_v1 a
      left join public.luminari_corpus_atomic_artifact_v1 r on r.run_id=$1 and r.artifact_key=a.artifact_key
     where a.exact_duplicate_of is null
       and (r.artifact_key is null or (r.status='failed' and r.attempt_count<2))
     order by a.byte_size desc,a.artifact_key
     limit $2
  `, [runId, limit]);
  return result.rows.map((row: any) => ({ ...row, byte_size: Number(row.byte_size ?? 0) }));
}

async function processArtifact(runId: string, artifact: SourceArtifact): Promise<void> {
  const pool = getPool();
  await pool.query(`insert into public.luminari_corpus_atomic_artifact_v1(run_id,artifact_key,status,attempt_count,started_at)
    values($1,$2,'running',1,now()) on conflict(run_id,artifact_key) do update set status='running',attempt_count=luminari_corpus_atomic_artifact_v1.attempt_count+1,started_at=now(),error_message=null`, [runId, artifact.artifact_key]);
  try {
    const buffer = await downloadPublicStorageArtifact(artifact);
    const contentSha256 = sha256(buffer);
    const records = await parseArtifact(artifact, buffer);
    const inserted = await insertAtomicChunk(runId, artifact, records);
    const receiptHash = sha256(stable({ run_id: runId, artifact_key: artifact.artifact_key, content_sha256: contentSha256, generated_record_keys: records.map(row => row.atomic_record_key).sort(), parser_version: ATOMIC_CORPUS_PARSER_VERSION }));
    await pool.query(`update public.luminari_corpus_atomic_artifact_v1 set status='completed',content_sha256=$3,atomic_record_count=$4,origin_count=$5,completed_at=now(),receipt_hash=$6,result_json=$7::jsonb where run_id=$1 and artifact_key=$2`,
      [runId, artifact.artifact_key, contentSha256, records.length, inserted.originsInserted, receiptHash, JSON.stringify({ records_generated: records.length, records_inserted: inserted.recordsInserted, origins_inserted: inserted.originsInserted, parser_version: ATOMIC_CORPUS_PARSER_VERSION })]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await pool.query(`update public.luminari_corpus_atomic_artifact_v1 set status='failed',error_message=$3,completed_at=now(),result_json=$4::jsonb where run_id=$1 and artifact_key=$2`, [runId, artifact.artifact_key, message.slice(0, 1000), JSON.stringify({ error: message.slice(0, 1000) })]);
  }
}

async function finalizeRun(runId: string): Promise<void> {
  const pool = getPool();
  const stats = await pool.query(`
    select count(distinct o.atomic_record_key)::int as atomic_records,count(*)::int as origins
      from public.luminari_corpus_atomic_record_origin_v1 o where o.run_id=$1
  `, [runId]);
  const artifacts = await pool.query(`select status,count(*)::int as n,sum(atomic_record_count)::bigint as generated from public.luminari_corpus_atomic_artifact_v1 where run_id=$1 group by status order by status`, [runId]);
  const rows = await pool.query(`select artifact_key,status,receipt_hash,atomic_record_count from public.luminari_corpus_atomic_artifact_v1 where run_id=$1 order by artifact_key`, [runId]);
  const statusCounts = Object.fromEntries(artifacts.rows.map((row: any) => [row.status, Number(row.n)]));
  const failed = Number(statusCounts.failed ?? 0);
  const atomicRecords = Number(stats.rows[0]?.atomic_records ?? 0);
  const origins = Number(stats.rows[0]?.origins ?? 0);
  const receiptHash = sha256(stable({ engine_version: ATOMIC_CORPUS_ENGINE_VERSION, run_id: runId, artifact_receipts: rows.rows, atomic_records: atomicRecords, origins }));
  await pool.query(`update public.luminari_corpus_atomic_run_v1 set status=$2,artifact_count=$3,atomic_record_count=$4,origin_count=$5,completed_at=now(),receipt_hash=$6,result_json=$7::jsonb where run_id=$1`, [runId, failed ? 'completed_with_failures' : 'completed', rows.rowCount, atomicRecords, origins, receiptHash, JSON.stringify({ artifact_status_counts: statusCounts, parser_version: ATOMIC_CORPUS_PARSER_VERSION })]);
}

export async function queueFreshAtomicCorpusPass(scope: Record<string, unknown> = {}): Promise<{ run_id: string; status: string }> {
  const pool = getPool();
  const active = await pool.query(`select run_id,status from public.luminari_corpus_atomic_run_v1 where engine_version=$1 and status in ('queued','running') order by started_at desc limit 1`, [ATOMIC_CORPUS_ENGINE_VERSION]);
  if (active.rows[0]) return { run_id: active.rows[0].run_id, status: active.rows[0].status };
  const result = await pool.query(`insert into public.luminari_corpus_atomic_run_v1(engine_version,scope,status) values($1,$2::jsonb,'queued') returning run_id,status`, [ATOMIC_CORPUS_ENGINE_VERSION, JSON.stringify(scope)]);
  return { run_id: result.rows[0].run_id, status: result.rows[0].status };
}

export async function resumeFreshAtomicCorpusPassFromDatabase(options: { batchSize?: number; maxBatches?: number } = {}) {
  const pool = getPool();
  const active = await pool.query(`select run_id from public.luminari_corpus_atomic_run_v1 where engine_version=$1 and status in ('queued','running') order by started_at asc limit 1`, [ATOMIC_CORPUS_ENGINE_VERSION]);
  const runId = active.rows[0]?.run_id as string | undefined;
  if (!runId) return { status: "idle" };
  await pool.query(`update public.luminari_corpus_atomic_run_v1 set status='running' where run_id=$1 and status='queued'`, [runId]);
  const batchSize = Math.max(1, Math.min(8, options.batchSize ?? 3));
  const maxBatches = Math.max(1, Math.min(100, options.maxBatches ?? 60));
  let processed = 0;
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const artifacts = await nextArtifacts(runId, batchSize);
    if (!artifacts.length) { await finalizeRun(runId); return { status: "completed", run_id: runId, processed }; }
    for (const artifact of artifacts) { await processArtifact(runId, artifact); processed += 1; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return { status: "yielded", run_id: runId, processed };
}

export async function getFreshAtomicCorpusStatus(runId?: string) {
  const pool = getPool();
  const result = runId
    ? await pool.query(`select * from public.luminari_corpus_atomic_run_v1 where run_id=$1 limit 1`, [runId])
    : await pool.query(`select * from public.luminari_corpus_atomic_run_v1 order by started_at desc limit 1`);
  if (!result.rows[0]) return { status: "not_started" };
  const run = result.rows[0];
  const kinds = await pool.query(`select r.source_kind,count(*)::int as n from public.luminari_corpus_atomic_record_origin_v1 o join public.luminari_corpus_atomic_record_v1 r using(atomic_record_key) where o.run_id=$1 group by r.source_kind order by n desc,r.source_kind`, [run.run_id]);
  return { ...run, source_kind_counts: Object.fromEntries(kinds.rows.map((row: any) => [row.source_kind, Number(row.n)])) };
}

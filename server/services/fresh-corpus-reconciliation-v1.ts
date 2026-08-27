import crypto from "node:crypto";
import JSZip from "jszip";
import { getPool } from "../db";
import { SUPABASE_PROJECT } from "../_core/health-diagnostics";

export const FRESH_CORPUS_ENGINE_VERSION = "fresh_corpus_reconciliation_v1.2.2";
export const FRESH_CORPUS_PARSER_VERSION = "fresh_registry_typed_parser_v1.2.2";

const STATE_NAMES: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS",
  Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD", Massachusetts: "MA",
  Michigan: "MI", Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT",
  Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ",
  "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND",
  Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI",
  "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT",
  Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI",
  Wyoming: "WY", "District of Columbia": "DC", "Puerto Rico": "PR", Guam: "GU",
  "American Samoa": "AS", "Northern Mariana Islands": "MP", "U.S. Virgin Islands": "VI",
};
const VALID_STATE_CODES = new Set(Object.values(STATE_NAMES));

const RESOURCE_LABELS = new Map<string, string>([
  ["address", "address"], ["phone", "phone"], ["telephone", "phone"],
  ["email", "email"], ["website", "website_url"], ["web site", "website_url"], ["url", "website_url"],
  ["eligibility", "eligibility_summary"], ["apply / notes", "apply_notes"], ["apply notes", "apply_notes"],
  ["application / notes", "apply_notes"], ["application", "apply_notes"], ["notes", "apply_notes"],
  ["service type", "category"], ["organization", "organization_name"], ["agency", "organization_name"],
  ["filing / complaint portal", "filing_portal"], ["complaint pathway", "filing_portal"],
  ["what it does for people", "description"], ["description", "description"],
  ["statutory authority", "statutory_authority"], ["statute / apply", "statutory_authority"],
  ["layer", "source_layer"], ["program", "program_name"],
]);

const SECTION_CATEGORY: Array<[RegExp, string]> = [
  [/food|nutrition|snap|wic/i, "food_nutrition"],
  [/health|medicaid|medical|behavioral/i, "healthcare"],
  [/housing|rent|tenant|homeless/i, "housing"],
  [/domestic violence|safety|victim|sexual assault/i, "domestic_violence_safety"],
  [/legal aid|legal services|court help/i, "legal_aid"],
  [/cash assistance|income|tanf|unemployment/i, "cash_assistance_income"],
  [/utilit|energy|liheap|heat relief/i, "utilities"],
  [/tribal|indigenous|native american/i, "tribal_indigenous"],
  [/labor|employment|wage/i, "labor_employment"],
  [/immigration|refugee/i, "immigration"],
  [/disability/i, "disability"],
  [/mental health/i, "mental_health"],
];

const IDENTITY_TYPES = new Set(["resource", "organization", "agency", "legislator", "advocacy_target", "enforcement_pathway"]);

type WorkbookSheetRoute = {
  candidateType: string;
  targetSurface: string;
  routingState: "routed" | "review_required";
};

/**
 * The backbone workbook is a multi-domain source package. A row that is not a
 * public resource is still authoritative source material and must be routed,
 * never discarded as a failed resource candidate.
 */
export function workbookSheetRoute(sheetName: string): WorkbookSheetRoute {
  const sheet = sheetName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (/^(wa_resource_directory|federal_resource_directory|national_hotline|clean_partial_program|substrate_az_program)$/.test(sheet)) {
    return { candidateType: "resource", targetSurface: "resource_directory", routingState: "routed" };
  }
  if (sheet === "wa_oversight_body") return { candidateType: "oversight_body", targetSurface: "enforcement_intelligence", routingState: "routed" };
  if (sheet === "coalition_agency") return { candidateType: "agency", targetSurface: "atlas", routingState: "routed" };
  if (/^(pass3_key_contact|substrate_state_contact)$/.test(sheet)) return { candidateType: "contact_record", targetSurface: "population_engine", routingState: "routed" };
  if (sheet === "address_audit_org") return { candidateType: "resource_contact_audit", targetSurface: "resource_directory_review", routingState: "routed" };
  if (/^(tribal_data_row|alaska_tribal_tables|tribal_national_matrix)$/.test(sheet)) return { candidateType: "tribal_governance_record", targetSurface: "population_engine", routingState: "routed" };
  if (sheet === "advocacy_target") return { candidateType: "advocacy_target", targetSurface: "atlas", routingState: "routed" };
  if (sheet === "advocacy_policy_domain") return { candidateType: "policy_domain", targetSurface: "atlas", routingState: "routed" };
  if (sheet === "coalition_network") return { candidateType: "relationship_record", targetSurface: "atlas", routingState: "routed" };
  if (sheet === "federal_agency_2025_status") return { candidateType: "agency_status", targetSurface: "atlas", routingState: "routed" };
  if (sheet === "federal_enforcement_pathway") return { candidateType: "enforcement_pathway", targetSurface: "prism", routingState: "routed" };
  if (sheet === "pattern_registry") return { candidateType: "policy_pattern", targetSurface: "kaleidoscope", routingState: "routed" };
  if (sheet === "strategy_path") return { candidateType: "strategy_path", targetSurface: "kaleidoscope", routingState: "routed" };
  if (sheet === "pressure_indicator") return { candidateType: "pressure_indicator", targetSurface: "atlas", routingState: "routed" };
  if (sheet === "platform_spec_master") return { candidateType: "platform_specification", targetSurface: "platform_control_plane", routingState: "routed" };
  if (sheet === "substrate_county_override") return { candidateType: "jurisdiction_override", targetSurface: "population_engine", routingState: "routed" };
  if (sheet === "substrate_state_card") return { candidateType: "jurisdiction_profile", targetSurface: "population_engine", routingState: "routed" };
  return { candidateType: "workbook_record", targetSurface: "operator_review", routingState: "review_required" };
}

type SourceArtifact = {
  artifact_key: string;
  bucket_id: string;
  object_name: string;
  transport_etag: string | null;
  byte_size: number;
  mimetype: string | null;
  artifact_role: string;
  jurisdiction_hint: string | null;
  semantic_family: string;
  generation_label: string | null;
  exact_duplicate_of: string | null;
};

type Candidate = {
  candidate_key: string;
  run_id: string;
  artifact_key: string;
  candidate_type: string;
  source_locator: string;
  jurisdiction: string | null;
  state_code: string | null;
  section_name: string | null;
  name: string | null;
  organization_name: string | null;
  category: string | null;
  layer: string | null;
  phone: string | null;
  email: string | null;
  website_url: string | null;
  address: string | null;
  eligibility_summary: string | null;
  apply_notes: string | null;
  description: string | null;
  raw_excerpt: string | null;
  parser_version: string;
  candidate_hash: string;
  source_content_sha256: string;
  jurisdiction_resolution_state: string;
  candidate_state: string;
  payload: Record<string, unknown>;
};

type ParseContext = {
  runId: string;
  artifact: SourceArtifact;
  contentSha256: string;
  text: string;
};

function sha256(input: Buffer | string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

// Postgres text columns reject NUL bytes, and jsonb rejects both NUL bytes
// and unpaired UTF-16 surrogates ("unsupported Unicode escape sequence").
// Binary artifacts decoded as UTF-8 (archives, PDFs, images) contain all of
// these. Every string that will reach a database parameter passes through
// this sanitizer so preservation succeeds with a classified receipt instead
// of a parse failure. The immutable source bytes and their hashes in Storage
// are never touched — only the derived text projection is cleaned.
function sanitizeUnicodeForStorage(value: string): string {
  return value
    .replace(/ /g, "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "\uFFFD");
}

function stable(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
  }
  if (typeof value === "string") return JSON.stringify(sanitizeUnicodeForStorage(value));
  return JSON.stringify(value);
}

function compact(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function nullable(value: unknown, max = 4000): string | null {
  const cleaned = sanitizeUnicodeForStorage(compact(value));
  return cleaned ? cleaned.slice(0, max) : null;
}

function normalizeName(value: unknown): string {
  return compact(value).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "").slice(0, 240);
}

function normalizePhone(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

function normalizeWebsiteDomain(value: unknown): string | null {
  const raw = compact(value);
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    const match = raw.match(/\b([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/i);
    return match?.[1]?.toLowerCase().replace(/^www\./, "") ?? null;
  }
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
  const timeout = setTimeout(() => controller.abort(), 30_000);
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

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(Number.parseInt(h, 16)));
}

function wordXmlToText(xml: string): string {
  const out: string[] = [];
  const tokens = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/?>|<w:br\b[^>]*\/?>|<\/w:tc>|<\/w:p>|<\/w:tr>/g;
  for (const match of xml.matchAll(tokens)) {
    if (match[1] !== undefined) out.push(decodeXmlEntities(match[1]));
    else if (match[0].startsWith("<w:tab") || match[0].startsWith("</w:tc")) out.push("\t");
    else out.push("\n");
  }
  return out.join("")
    .replace(/\t+\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files)
    .filter(name => /^word\/(document|header\d+|footer\d+|footnotes|endnotes|comments)\.xml$/i.test(name))
    .sort((a, b) => (a === "word/document.xml" ? -1 : b === "word/document.xml" ? 1 : a.localeCompare(b)));
  if (!names.includes("word/document.xml")) throw new Error("docx_missing_word_document_xml");
  const parts: string[] = [];
  for (const name of names) {
    const xml = await zip.file(name)?.async("text");
    if (!xml) continue;
    const text = wordXmlToText(xml);
    if (text) parts.push(text);
  }
  return parts.join("\n\n").trim();
}

function xmlCellText(xml: string): string {
  return decodeXmlEntities(xml.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export type XlsxSourceRow = {
  sheet: string;
  row: number;
  header_row: number;
  row_role: "preamble" | "header" | "data";
  columns: string[];
  header_keys: string[];
  values: Record<string, string>;
  cells: Array<{
    reference: string;
    type: string | null;
    style: string | null;
    value: string;
    formula: string | null;
  }>;
};

type ParsedXlsxRow = {
  row: number;
  values: string[];
  cells: XlsxSourceRow["cells"];
};

function uniqueWorkbookHeaders(values: string[]): { columns: string[]; keys: string[] } {
  const columns = values.map((value, index) => compact(value) || `column_${index + 1}`);
  const seen = new Map<string, number>();
  const keys = columns.map((column, index) => {
    const base = column || `column_${index + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}__${count}`;
  });
  return { columns, keys };
}

function parseXlsxRowXml(xml: string, shared: string[], fallbackRow: number): ParsedXlsxRow | null {
  const rowNumber = Number(xml.match(/<row\b[^>]*\br="(\d+)"/)?.[1] ?? fallbackRow);
  const values: string[] = [];
  const cells: XlsxSourceRow["cells"] = [];
  for (const cell of xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
    const attrs = cell[1];
    const body = cell[2];
    const reference = attrs.match(/\br="([A-Z]+\d+)"/)?.[1] ?? `A${rowNumber}`;
    const columnReference = reference.match(/^([A-Z]+)/)?.[1] ?? "A";
    let index = 0;
    for (const char of columnReference) index = index * 26 + char.charCodeAt(0) - 64;
    index -= 1;
    const type = attrs.match(/\bt="([^"]+)"/)?.[1] ?? null;
    const style = attrs.match(/\bs="([^"]+)"/)?.[1] ?? null;
    const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? body.match(/<is>([\s\S]*?)<\/is>/)?.[1] ?? "";
    const value = type === "s" ? shared[Number(raw)] ?? "" : type === "inlineStr" ? xmlCellText(raw) : decodeXmlEntities(raw).trim();
    const formulaXml = body.match(/<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/)?.[1];
    const formula = formulaXml === undefined ? null : decodeXmlEntities(formulaXml).trim();
    values[index] = value;
    cells.push({ reference, type, style, value, formula });
  }
  return cells.some(cell => compact(cell.value) || cell.formula) ? { row: rowNumber, values, cells } : null;
}

async function forEachWorksheetXmlRow(
  entry: JSZip.JSZipObject,
  shared: string[],
  consume: (row: ParsedXlsxRow) => Promise<void>,
): Promise<void> {
  let carry = "";
  let fallbackRow = 0;
  const processChunk = async (rawChunk: Buffer) => {
    carry += rawChunk.toString("utf8");
    let rowEnd = carry.indexOf("</row>");
    while (rowEnd >= 0) {
      const throughRow = carry.slice(0, rowEnd + "</row>".length);
      carry = carry.slice(rowEnd + "</row>".length);
      const rowStart = throughRow.lastIndexOf("<row");
      if (rowStart >= 0) {
        fallbackRow += 1;
        const parsed = parseXlsxRowXml(throughRow.slice(rowStart), shared, fallbackRow);
        if (parsed) await consume(parsed);
      }
      rowEnd = carry.indexOf("</row>");
    }
    // XML outside the next row carries no source cell content. Keeping only
    // the possible partial row prevents a large worksheet from accumulating.
    const partialRow = carry.lastIndexOf("<row");
    if (partialRow > 0) carry = carry.slice(partialRow);
    else if (partialRow < 0 && carry.length > 4096) carry = carry.slice(-4096);
  };
  await new Promise<void>((resolve, reject) => {
    const stream = entry.internalStream("nodebuffer");
    let processing = Promise.resolve();
    let failed = false;
    stream.on("data", chunk => {
      stream.pause();
      processing = processing
        .then(() => processChunk(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        .then(() => { if (!failed) stream.resume(); })
        .catch(error => { failed = true; reject(error); });
    });
    stream.on("error", error => { failed = true; reject(error); });
    stream.on("end", () => { processing.then(() => { if (!failed) resolve(); }, reject); });
    stream.resume();
  });
}

export async function forEachXlsxRow(
  buffer: Buffer,
  consume: (row: XlsxSourceRow) => Promise<void> | void,
): Promise<number> {
  const zip = await JSZip.loadAsync(buffer);
  const sharedXml = await zip.file("xl/sharedStrings.xml")?.async("text");
  const shared: string[] = [];
  if (sharedXml) {
    for (const si of sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) shared.push(xmlCellText(si[1]));
  }
  const workbookXml = await zip.file("xl/workbook.xml")?.async("text");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("text");
  if (!workbookXml || !relsXml) return 0;
  const relationships = new Map<string, string>();
  for (const rel of relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^"]*Target="([^"]+)"[^"]*\/?\s*>/g)) {
    relationships.set(rel[1], rel[2].replace(/^\//, ""));
  }
  const sheets: Array<{ name: string; path: string }> = [];
  for (const sheet of workbookXml.matchAll(/<sheet\b[^>]*name="([^"]+)"[^"]*r:id="([^"]+)"[^"]*\/?\s*>/g)) {
    const target = relationships.get(sheet[2]);
    if (!target) continue;
    sheets.push({ name: decodeXmlEntities(sheet[1]), path: target.startsWith("xl/") ? target : `xl/${target.replace(/^\.\//, "")}` });
  }
  let emitted = 0;
  for (const sheet of sheets) {
    const entry = zip.file(sheet.path);
    if (!entry) continue;
    let header: { row: ParsedXlsxRow; columns: string[]; keys: string[] } | null = null;
    const pending: ParsedXlsxRow[] = [];
    const emit = async (parsed: ParsedXlsxRow, rowRole: XlsxSourceRow["row_role"]) => {
      if (!header) throw new Error("xlsx_header_not_resolved");
      const values: Record<string, string> = {};
      parsed.values.forEach((value, index) => {
        if (!compact(value)) return;
        const key = rowRole === "data" ? header?.keys[index] ?? `column_${index + 1}` : `column_${index + 1}`;
        values[key] = value;
      });
      await consume({
        sheet: sheet.name,
        row: parsed.row,
        header_row: header.row.row,
        row_role: rowRole,
        columns: header.columns,
        header_keys: header.keys,
        values,
        cells: parsed.cells,
      });
      emitted += 1;
    };
    const resolveHeader = async (selected: ParsedXlsxRow) => {
      const resolved = uniqueWorkbookHeaders(selected.values);
      header = { row: selected, columns: resolved.columns, keys: resolved.keys };
      for (const preamble of pending) {
        await emit(preamble, preamble === selected ? "header" : preamble.row < selected.row ? "preamble" : "data");
      }
      pending.length = 0;
    };
    await forEachWorksheetXmlRow(entry, shared, async parsed => {
      if (header) {
        await emit(parsed, "data");
        return;
      }
      pending.push(parsed);
      const populatedCells = parsed.values.filter(value => compact(value)).length;
      if (populatedCells >= 2) await resolveHeader(parsed);
      else if (pending.length >= 256) await resolveHeader(pending[0]);
    });
    if (!header && pending.length) await resolveHeader(pending[0]);
  }
  return emitted;
}

function inferCategory(section: string | null, text: string): string | null {
  const haystack = `${section ?? ""} ${text}`;
  return SECTION_CATEGORY.find(([pattern]) => pattern.test(haystack))?.[1] ?? null;
}

function inferLayer(section: string | null): string | null {
  const match = String(section ?? "").match(/LAYER\s*([123])/i);
  return match ? `layer_${match[1]}` : null;
}

function detectStateCode(text: string): string | null {
  const postal = text.match(/,\s*([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/);
  if (postal && VALID_STATE_CODES.has(postal[1])) return postal[1];
  const explicit = text.match(/\b(?:state|jurisdiction)\s*[:=-]\s*([A-Z]{2})\b/i);
  if (explicit && VALID_STATE_CODES.has(explicit[1].toUpperCase())) return explicit[1].toUpperCase();
  for (const [name, code] of Object.entries(STATE_NAMES)) {
    if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text.slice(0, 500))) return code;
  }
  return null;
}

function jurisdictionState(artifact: SourceArtifact, excerpt: string): { stateCode: string | null; jurisdiction: string | null; state: string } {
  const artifactState = artifact.jurisdiction_hint && VALID_STATE_CODES.has(artifact.jurisdiction_hint) ? artifact.jurisdiction_hint : null;
  const contentState = detectStateCode(excerpt);
  if (artifactState && contentState && artifactState !== contentState) return { stateCode: null, jurisdiction: artifactState, state: "conflict" };
  const resolved = contentState ?? artifactState;
  if (resolved) return { stateCode: resolved, jurisdiction: resolved, state: contentState ? "content_consistent" : "artifact_inferred" };
  if (/federal|national|united states|u\.s\./i.test(excerpt)) return { stateCode: null, jurisdiction: "US", state: "national_or_federal" };
  return { stateCode: null, jurisdiction: null, state: "unresolved" };
}

function candidate(ctx: ParseContext, input: Omit<Candidate, "candidate_key" | "run_id" | "artifact_key" | "parser_version" | "candidate_hash" | "source_content_sha256" | "jurisdiction_resolution_state" | "candidate_state" | "jurisdiction" | "state_code"> & { excerptForJurisdiction?: string; candidateState?: string }): Candidate {
  const excerpt = compact(input.excerptForJurisdiction ?? input.raw_excerpt ?? input.name ?? "").slice(0, 2000);
  const jurisdiction = jurisdictionState(ctx.artifact, excerpt);
  const material = {
    artifact_key: ctx.artifact.artifact_key,
    source_content_sha256: ctx.contentSha256,
    candidate_type: input.candidate_type,
    source_locator: input.source_locator,
    name: input.name,
    organization_name: input.organization_name,
    category: input.category,
    layer: input.layer,
    phone: input.phone,
    email: input.email,
    website_url: input.website_url,
    address: input.address,
    eligibility_summary: input.eligibility_summary,
    apply_notes: input.apply_notes,
    description: input.description,
    payload: input.payload,
  };
  const candidateHash = sha256(stable(material));
  const candidateKey = sha256(stable({
    run_id: ctx.runId,
    candidate_hash: candidateHash,
    parser_version: FRESH_CORPUS_PARSER_VERSION,
  }));
  // Sanitize every free-text field before it reaches a database parameter.
  // Short fields are cheap to clean; raw_excerpt is the one that carries
  // binary-decoded text from archives and PDFs.
  const clean = (value: string | null): string | null => value === null ? null : sanitizeUnicodeForStorage(value);
  return {
    candidate_key: candidateKey,
    run_id: ctx.runId,
    artifact_key: ctx.artifact.artifact_key,
    candidate_type: input.candidate_type,
    source_locator: sanitizeUnicodeForStorage(input.source_locator),
    jurisdiction: jurisdiction.jurisdiction,
    state_code: jurisdiction.stateCode,
    section_name: clean(input.section_name),
    name: clean(input.name),
    organization_name: clean(input.organization_name),
    category: clean(input.category),
    layer: clean(input.layer),
    phone: clean(input.phone),
    email: clean(input.email),
    website_url: clean(input.website_url),
    address: clean(input.address),
    eligibility_summary: clean(input.eligibility_summary),
    apply_notes: clean(input.apply_notes),
    description: clean(input.description),
    raw_excerpt: clean(input.raw_excerpt),
    parser_version: FRESH_CORPUS_PARSER_VERSION,
    candidate_hash: candidateHash,
    source_content_sha256: ctx.contentSha256,
    jurisdiction_resolution_state: jurisdiction.state,
    candidate_state: input.candidateState ?? (IDENTITY_TYPES.has(input.candidate_type) ? "unresolved" : "typed_preserved"),
    payload: input.payload,
  };
}

function isSectionHeading(line: string): boolean {
  return /^LAYER\s+\d+/i.test(line) || /^PART\s+[IVX]+/i.test(line) || /^Pipeline:/i.test(line) || /^Entity Type:/i.test(line)
    || (/^[A-Z][A-Z &/+-]{4,}$/i.test(line) && line.length < 100);
}

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/[:：]+$/, "").replace(/\s+/g, " ").trim();
}

/**
 * Preserve Word table-cell boundaries long enough to recover label/value
 * pairs. Calling compact() on the whole line first turns tabs into spaces and
 * irreversibly merges cells.
 */
export function docxStructuredCellsToLines(rawLine: string): string[] {
  const cells = rawLine.split(/\t+/).map(compact).filter(Boolean);
  if (cells.length <= 1) return cells;
  const lines: string[] = [];
  let index = 0;
  if (!RESOURCE_LABELS.has(normalizeLabel(cells[0])) && !/^([^:：]{2,80})[:：]/.test(cells[0])) {
    lines.push(cells[0]);
    index = 1;
  }
  while (index < cells.length) {
    const cell = cells[index];
    if (RESOURCE_LABELS.has(normalizeLabel(cell))) {
      const next = cells[index + 1];
      if (next && !RESOURCE_LABELS.has(normalizeLabel(next))) {
        lines.push(`${cell}: ${next}`);
        index += 2;
      } else {
        lines.push(cell);
        index += 1;
      }
    } else {
      lines.push(cell);
      index += 1;
    }
  }
  return lines;
}

function parseResourceCandidates(ctx: ParseContext): Candidate[] {
  const rawLines = ctx.text.split(/\r?\n/);
  const lineRecords = rawLines.flatMap((rawLine, sourceIndex) =>
    docxStructuredCellsToLines(rawLine).map(text => ({ text, sourceLine: sourceIndex + 1 })));
  const lines = lineRecords.map(record => record.text);
  const out: Candidate[] = [];
  let section = "document_start";
  let current: { title: string; start: number; end: number; fields: Record<string, string>; sourceLines: string[]; section: string } | null = null;

  const flush = () => {
    if (!current) return;
    const fields = current.fields;
    const fieldCount = Object.keys(fields).length;
    const hasContact = Boolean(fields.phone || fields.website_url || fields.email || fields.address || fields.filing_portal);
    const title = compact(current.title).replace(/\s+\[(?:[A-Z0-9_-]+)\]\s+(?:VERIFIED|UNVERIFIED.*)$/i, "").replace(/\s+(?:VERIFIED|UNVERIFIED.*)$/i, "").trim();
    const malformedTitle = !title || /^(field|information|program|organization|phone|website|eligibility|address|notes)$/i.test(title);
    if (!malformedTitle && fieldCount >= 1 && (hasContact || fields.eligibility_summary || fields.description)) {
      const excerpt = current.sourceLines.join("\n").slice(0, 8000);
      out.push(candidate(ctx, {
        candidate_type: "resource",
        source_locator: `lines:${current.start}-${current.end}`,
        section_name: current.section,
        name: title.slice(0, 500),
        organization_name: title.slice(0, 500),
        category: fields.category || inferCategory(current.section, excerpt),
        layer: fields.source_layer || inferLayer(current.section),
        phone: nullable(fields.phone, 1000),
        email: nullable(fields.email, 1000),
        website_url: nullable(fields.website_url || fields.filing_portal, 2000),
        address: nullable(fields.address, 2000),
        eligibility_summary: nullable(fields.eligibility_summary, 5000),
        apply_notes: nullable(fields.apply_notes, 5000),
        description: nullable(fields.description, 5000),
        raw_excerpt: excerpt,
        payload: {
          fields,
          artifact_role: ctx.artifact.artifact_role,
          verified_marker: /\bVERIFIED\b/i.test(current.title),
          parser_rule: "typed_label_value_resource_block",
          source_preservation: fieldCount === 1 ? "sparse_typed_record_preserved" : "typed_record_preserved",
        },
        excerptForJurisdiction: `${title}\n${fields.address ?? ""}\n${excerpt.slice(0, 800)}`,
      }));
      if (fields.statutory_authority) {
        out.push(candidate(ctx, {
          candidate_type: "legal_authority",
          source_locator: `lines:${current.start}-${current.end}:statutory_authority`,
          section_name: current.section,
          name: nullable(fields.statutory_authority, 500), organization_name: title,
          category: "legal_authority", layer: inferLayer(current.section), phone: null, email: null, website_url: null, address: null,
          eligibility_summary: null, apply_notes: null, description: nullable(fields.statutory_authority, 5000),
          raw_excerpt: excerpt, payload: { authority: fields.statutory_authority, parent_resource_name: title, parser_rule: "resource_statutory_authority_field" },
          excerptForJurisdiction: `${title} ${fields.address ?? ""}`,
        }));
      }
    }
    current = null;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const sourceLine = lineRecords[i].sourceLine;
    if (!line) continue;
    if (/^LAYER\s+\d+/i.test(line)) { flush(); section = line; continue; }
    if (/^(FOOD|HEALTH|HOUSING|DOMESTIC|LEGAL|CASH|UTILIT|TRIBAL|LABOR|IMMIGRATION|DISABILITY|MENTAL)/i.test(line) && isSectionHeading(line)) {
      flush(); section = line; continue;
    }
    if (/^Pipeline:/i.test(line) || /^Entity Type:/i.test(line) || /^PART\s+[IVX]+/i.test(line)) { flush(); section = line; continue; }

    const colonMatch = line.match(/^([^:：]{2,80})[:：]\s*(.*)$/);
    let labelRaw: string | null = null;
    let value = "";
    if (colonMatch && RESOURCE_LABELS.has(normalizeLabel(colonMatch[1]))) {
      labelRaw = colonMatch[1]; value = colonMatch[2];
    } else if (RESOURCE_LABELS.has(normalizeLabel(line))) {
      labelRaw = line;
    }
    if (labelRaw) {
      if (!current) continue;
      const key = RESOURCE_LABELS.get(normalizeLabel(labelRaw))!;
      if (!value) {
        let j = i + 1;
        while (j < lines.length && !lines[j]) j += 1;
        if (j < lines.length && !RESOURCE_LABELS.has(normalizeLabel(lines[j])) && !isSectionHeading(lines[j])) {
          value = lines[j]; current.end = lineRecords[j].sourceLine; i = j;
        }
      }
      if (value) current.fields[key] = current.fields[key] ? `${current.fields[key]} | ${value}` : value;
      current.sourceLines.push(`${labelRaw}: ${value}`);
      current.end = Math.max(current.end, sourceLine);
      continue;
    }

    const nextNonEmpty = (() => {
      for (let j = i + 1; j < Math.min(lines.length, i + 5); j += 1) if (lines[j]) return lines[j];
      return "";
    })();
    const titleCandidate = !isSectionHeading(line) && line.length >= 4 && line.length <= 300
      && (RESOURCE_LABELS.has(normalizeLabel(nextNonEmpty)) || /^[^:]{4,240}\s+\[[A-Z0-9_-]+\]\s+(?:VERIFIED|UNVERIFIED)/i.test(line));
    if (titleCandidate) {
      flush(); current = { title: line, start: sourceLine, end: sourceLine, fields: {}, sourceLines: [line], section }; continue;
    }
    if (current && !isSectionHeading(line) && current.sourceLines.length < 30) {
      current.sourceLines.push(line);
      current.end = Math.max(current.end, sourceLine);
    }
  }
  flush();
  return out;
}

function parsePolicyCandidates(ctx: ParseContext): Candidate[] {
  const out: Candidate[] = [];
  const chunks = ctx.text.split(/\n\s*\n/).map(compact).filter(Boolean);
  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    if (!/(?:⚠|CRITICAL|DEADLINE|LIFETIME LIMIT|WORK REQUIREMENT|NO ASSET LIMIT|NO state paid|service gap)/i.test(chunk)) continue;
    if (chunk.length < 40 || chunk.length > 6000) continue;
    out.push(candidate(ctx, {
      candidate_type: "policy_alert", source_locator: `paragraph:${i + 1}`, section_name: "critical_policy_or_gap",
      name: chunk.slice(0, 240), organization_name: null, category: inferCategory(null, chunk), layer: "policy",
      phone: null, email: null, website_url: null, address: null, eligibility_summary: null, apply_notes: null,
      description: chunk.slice(0, 5000), raw_excerpt: chunk.slice(0, 6000), payload: { parser_rule: "critical_policy_paragraph" },
    }));
  }
  return out;
}

function parseWorkflowCandidates(ctx: ParseContext): Candidate[] {
  const lines = ctx.text.split(/\r?\n/).map(compact).filter(Boolean);
  const starts: number[] = [];
  lines.forEach((line, i) => { if (/^(Pipeline:|Workflow\s+[A-Z0-9])/i.test(line)) starts.push(i); });
  const out: Candidate[] = [];
  starts.forEach((start, index) => {
    const end = starts[index + 1] ?? Math.min(lines.length, start + 120);
    const selected: string[] = [];
    for (let i = start; i < end && selected.length < 120; i += 1) {
      if (i > start && /^LAYER\s+3/i.test(lines[i])) break;
      selected.push(lines[i]);
    }
    const body = selected.join("\n").slice(0, 12_000);
    if (body.length < 40) return;
    out.push(candidate(ctx, {
      candidate_type: "workflow", source_locator: `workflow:${start + 1}-${start + selected.length}`,
      section_name: "layer_2_workflow", name: lines[start].slice(0, 500), organization_name: null,
      category: "workflow", layer: "layer_2", phone: null, email: null, website_url: null, address: null,
      eligibility_summary: null, apply_notes: null, description: body.slice(0, 5000), raw_excerpt: body,
      payload: { parser_rule: "pipeline_or_workflow_block" }, candidateState: "typed_preserved",
    }));
  });
  return out;
}

function parseOversightCandidates(ctx: ParseContext): Candidate[] {
  const lines = ctx.text.split(/\r?\n/).map(compact).filter(Boolean);
  const starts: number[] = [];
  lines.forEach((line, i) => { if (/^Entity Type:/i.test(line)) starts.push(i); });
  return starts.map((start, index) => {
    const end = starts[index + 1] ?? Math.min(lines.length, start + 100);
    const body = lines.slice(start, end).join("\n").slice(0, 12_000);
    return candidate(ctx, {
      candidate_type: "oversight_route", source_locator: `oversight:${start + 1}-${Math.min(end, start + 100)}`,
      section_name: "layer_3_accountability", name: lines[start].slice(0, 500), organization_name: null,
      category: "accountability", layer: "layer_3", phone: null, email: null, website_url: null, address: null,
      eligibility_summary: null, apply_notes: null, description: body.slice(0, 5000), raw_excerpt: body,
      payload: { parser_rule: "entity_type_accountability_block" }, candidateState: "typed_preserved",
    });
  });
}

function artifactStructuredType(artifact: SourceArtifact): string {
  const name = artifact.object_name.toLowerCase();
  if (name.includes("legislator")) return "legislator";
  if (name.includes("advocacy_targets")) return "advocacy_target";
  if (name.includes("advocacy") && !name.includes("network")) return "organization";
  if (name.includes("agencies")) return "agency";
  if (name.includes("enforcement_pathway")) return "enforcement_pathway";
  if (name.includes("network")) return "relationship_bundle";
  return "structured_record";
}

function findName(record: Record<string, unknown>): string | null {
  for (const key of ["canonical_person_id", "full_entity_name", "organization_name", "agency_name", "resource_name", "program_name", "name", "title"]) {
    const value = nullable(record[key], 500);
    if (value) return value;
  }
  return null;
}

function collectJsonRecords(value: unknown, path = "$", out: Array<{ path: string; value: Record<string, unknown> }> = [], depth = 0): Array<{ path: string; value: Record<string, unknown> }> {
  if (depth > 8 || out.length >= 50_000) return out;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectJsonRecords(item, `${path}[${index}]`, out, depth + 1));
    return out;
  }
  if (!value || typeof value !== "object") return out;
  const record = value as Record<string, unknown>;
  if (findName(record) && Object.keys(record).length >= 2) out.push({ path, value: record });
  for (const [key, child] of Object.entries(record)) {
    if (child && typeof child === "object") collectJsonRecords(child, `${path}.${key}`, out, depth + 1);
  }
  return out;
}

function structuredRecordCandidate(ctx: ParseContext, type: string, sourceLocator: string, record: Record<string, unknown>): Candidate | null {
  const name = findName(record);
  if (!name) return null;
  const phone = nullable(record.phone ?? record.contact_phone ?? (record.official_contact as any)?.phone, 1000);
  const email = nullable(record.email ?? record.contact_email ?? (record.official_contact as any)?.email_form, 1000);
  const website = nullable(record.website ?? record.website_url ?? (record.official_contact as any)?.website, 2000);
  const state = nullable(record.state ?? record.state_code ?? record.jurisdiction, 80);
  const excerpt = stable(record).slice(0, 8000);
  return candidate(ctx, {
    candidate_type: type, source_locator: sourceLocator, section_name: "structured_backbone",
    name, organization_name: type === "legislator" ? null : name,
    category: nullable(record.category ?? record.entity_type ?? type, 160), layer: "backbone",
    phone, email, website_url: website, address: nullable(record.address ?? (record.official_contact as any)?.office_address, 2000),
    eligibility_summary: nullable(record.eligibility ?? record.eligibility_summary, 5000),
    apply_notes: nullable(record.apply_notes ?? record.application_methods, 5000),
    description: nullable(record.description ?? record.role ?? record.current_office, 5000), raw_excerpt: excerpt,
    payload: { record, parser_rule: "structured_record_identity" },
    excerptForJurisdiction: `${state ?? ""} ${name} ${excerpt.slice(0, 600)}`,
    candidateState: IDENTITY_TYPES.has(type) ? "unresolved" : "typed_preserved",
  });
}

function parseJsonCandidates(ctx: ParseContext): Candidate[] {
  let parsed: unknown;
  try { parsed = JSON.parse(ctx.text); }
  catch {
    const rows: unknown[] = [];
    for (const line of ctx.text.split(/\r?\n/).map(compact).filter(Boolean)) {
      try { rows.push(JSON.parse(line)); } catch { /* preserve artifact receipt; malformed line is not invented */ }
    }
    parsed = rows;
  }
  const type = artifactStructuredType(ctx.artifact);
  return collectJsonRecords(parsed).map(item => structuredRecordCandidate(ctx, type, `json:${item.path}`, item.value)).filter((item): item is Candidate => Boolean(item));
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = ""; let quoted = false;
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

function parseCsvCandidates(ctx: ParseContext): Candidate[] {
  const lines = ctx.text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map(header => compact(header).toLowerCase().replace(/[^a-z0-9]+/g, "_"));
  const type = artifactStructuredType(ctx.artifact);
  const out: Candidate[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i]);
    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => { if (header) record[header] = compact(values[index]); });
    const parsed = structuredRecordCandidate(ctx, type, `csv:row:${i + 1}`, record);
    if (parsed) out.push(parsed);
  }
  return out;
}

function xlsxCandidate(ctx: ParseContext, row: XlsxSourceRow): Candidate {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(row.values)) normalized[key.toLowerCase().replace(/[^a-z0-9]+/g, "_")] = value;
  const sheetRoute = workbookSheetRoute(row.sheet);
  const route = row.row_role === "data"
    ? sheetRoute
    : { candidateType: "workbook_context", targetSurface: sheetRoute.targetSurface, routingState: "routed" as const };
  const firstSourceValue = Object.values(row.values).find(value => compact(value));
  const name = nullable(
    normalized.resource_name
      || normalized.program
      || normalized.organization
      || normalized.organization_name
      || normalized.name
      || normalized.agency
      || normalized.agency_name
      || normalized.full_entity_name
      || normalized.target_name
      || normalized.title
      || normalized.label
      || normalized.policy_domain
      || normalized.pattern_name
      || normalized.strategy_name
      || firstSourceValue
      || `${row.sheet} row ${row.row}`,
    500,
  );
  return candidate(ctx, {
    candidate_type: route.candidateType, source_locator: `xlsx:${row.sheet}:row:${row.row}`, section_name: row.sheet,
    name, organization_name: nullable(normalized.organization || normalized.agency || name, 500),
    category: nullable(normalized.category || normalized.resource_type || route.candidateType || row.sheet, 160), layer: "backbone_workbook",
    phone: nullable(normalized.phone || normalized.contact_phone, 1000), email: nullable(normalized.email || normalized.contact_email, 1000),
    website_url: nullable(normalized.website || normalized.website_url || normalized.url, 2000),
    address: nullable(normalized.address || normalized.address_line1, 2000),
    eligibility_summary: nullable(normalized.eligibility || normalized.eligibility_summary, 5000),
    apply_notes: nullable(normalized.apply_notes || normalized.notes || normalized.application, 5000),
    description: nullable(normalized.description || normalized.what_it_does_for_people, 5000),
    raw_excerpt: stable(row.values).slice(0, 8000),
    payload: {
      row: row.values,
      sheet: row.sheet,
      workbook_row: row.row,
      header_row: row.header_row,
      row_role: row.row_role,
      columns: row.columns,
      header_keys: row.header_keys,
      cells: row.cells,
      parser_rule: "xlsx_streamed_row_preserved_v3",
      route_type: route.candidateType,
      target_surface: route.targetSurface,
      routing_state: route.routingState,
      source_preservation: "immutable_workbook_plus_decoded_cells",
    },
    excerptForJurisdiction: `${normalized.state || normalized.state_code || normalized.jurisdiction || ""} ${name} ${normalized.address || ""} ${stable(row.values)}`,
    candidateState: row.row_role === "data" && route.candidateType === "resource" ? "unresolved" : "typed_preserved",
  });
}

function documentReference(ctx: ParseContext, note: string): Candidate {
  return candidate(ctx, {
    candidate_type: "document_reference", source_locator: "artifact:0", section_name: ctx.artifact.artifact_role,
    name: ctx.artifact.object_name, organization_name: null, category: ctx.artifact.semantic_family, layer: null,
    phone: null, email: null, website_url: null, address: null, eligibility_summary: null, apply_notes: null,
    description: note, raw_excerpt: ctx.text.slice(0, 8000),
    payload: { artifact_role: ctx.artifact.artifact_role, semantic_family: ctx.artifact.semantic_family, parser_rule: "artifact_reference_preservation" },
    candidateState: "typed_preserved",
  });
}

async function parseArtifact(ctx: ParseContext, buffer: Buffer): Promise<Candidate[]> {
  const ext = ctx.artifact.object_name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
  if (ctx.artifact.artifact_role === "derivative_sql_artifact" || ctx.artifact.artifact_role === "derivative_bundle_artifact") return [];
  if (ext === ".json" || ext === ".jsonl" || (ctx.artifact.mimetype === "binary/octet-stream" && /jsonl|legislator/i.test(ctx.artifact.object_name))) return parseJsonCandidates(ctx);
  if (ext === ".csv") return parseCsvCandidates(ctx);
  if (ext === ".xlsx") throw new Error("xlsx_requires_bounded_batch_parser");
  if (ext === ".docx" || ext === ".md" || ext === ".txt") {
    const candidates = [
      ...parseResourceCandidates(ctx),
      ...parseWorkflowCandidates(ctx),
      ...parseOversightCandidates(ctx),
      ...parsePolicyCandidates(ctx),
    ];
    if (!candidates.length || !/^state_(?:enrichment|resource_directory|registry)_source$/.test(ctx.artifact.artifact_role)) {
      candidates.push(documentReference(ctx, "Source artifact preserved as typed document substrate; no unsupported canonical promotion is implied."));
    }
    const seen = new Set<string>();
    return candidates.filter(item => !seen.has(item.candidate_key) && Boolean(seen.add(item.candidate_key)));
  }
  return [documentReference(ctx, "Unclassified source artifact retained without structural inference.")];
}

async function insertCandidates(candidates: Candidate[]): Promise<{ inserted: number; idempotent: number }> {
  if (!candidates.length) return { inserted: 0, idempotent: 0 };
  const pool = getPool();
  const payload = JSON.stringify(candidates);
  const result = await pool.query(`
    with source_rows as (
      select * from jsonb_to_recordset($1::jsonb) as x(
        candidate_key text, run_id uuid, artifact_key text, candidate_type text, source_locator text,
        jurisdiction text, state_code text, section_name text, name text, organization_name text,
        category text, layer text, phone text, email text, website_url text, address text,
        eligibility_summary text, apply_notes text, description text, raw_excerpt text,
        parser_version text, candidate_hash text, source_content_sha256 text,
        jurisdiction_resolution_state text, candidate_state text, payload jsonb
      )
    ), inserted as (
      insert into public.luminari_corpus_candidate_v1 (
        candidate_key,run_id,artifact_key,candidate_type,source_locator,jurisdiction,state_code,section_name,
        name,organization_name,category,layer,phone,email,website_url,address,eligibility_summary,apply_notes,
        description,raw_excerpt,parser_version,candidate_hash,source_content_sha256,jurisdiction_resolution_state,candidate_state,payload
      ) select candidate_key,run_id,artifact_key,candidate_type,source_locator,jurisdiction,state_code,section_name,
        name,organization_name,category,layer,phone,email,website_url,address,eligibility_summary,apply_notes,
        description,raw_excerpt,parser_version,candidate_hash,source_content_sha256,jurisdiction_resolution_state,candidate_state,payload
      from source_rows on conflict(candidate_key) do nothing returning 1
    )
    select (select count(*)::int from inserted) as inserted,
           (select count(*)::int from source_rows) - (select count(*)::int from inserted) as idempotent
  `, [payload]);
  return { inserted: Number(result.rows[0]?.inserted ?? 0), idempotent: Number(result.rows[0]?.idempotent ?? 0) };
}

async function insertXlsxCandidates(
  ctx: ParseContext,
  buffer: Buffer,
  chunkSize = 250,
): Promise<{ generated: number; inserted: number; idempotent: number; candidateHashes: string[]; chunks: number }> {
  const pool = getPool();
  const boundedChunkSize = Math.max(25, Math.min(500, Math.floor(chunkSize)));
  const candidateHashes: string[] = [];
  let chunk: Candidate[] = [];
  let generated = 0;
  let inserted = 0;
  let idempotent = 0;
  let chunks = 0;

  const flush = async () => {
    if (!chunk.length) return;
    const current = chunk;
    chunk = [];
    const result = await insertCandidates(current);
    inserted += result.inserted;
    idempotent += result.idempotent;
    chunks += 1;
    await pool.query(`update public.luminari_corpus_rebuild_artifact_v1
      set started_at=clock_timestamp(),
          result_json=result_json||jsonb_build_object(
            'lease_heartbeat_at',clock_timestamp(),
            'workbook_rows_processed',$3::int,
            'workbook_chunks_committed',$4::int
          )
      where run_id=$1 and artifact_key=$2 and status='running'`,
    [ctx.runId, ctx.artifact.artifact_key, generated, chunks]);
  };

  await forEachXlsxRow(buffer, async row => {
    const parsed = xlsxCandidate(ctx, row);
    candidateHashes.push(parsed.candidate_hash);
    chunk.push(parsed);
    generated += 1;
    if (chunk.length >= boundedChunkSize) await flush();
  });
  await flush();
  return { generated, inserted, idempotent, candidateHashes, chunks };
}

async function processArtifact(runId: string, artifact: SourceArtifact): Promise<void> {
  const pool = getPool();
  const startedAt = new Date().toISOString();
  const claim = await pool.query(`insert into public.luminari_corpus_rebuild_artifact_v1(run_id,artifact_key,status,attempt_count,started_at,result_json)
    values($1,$2,'running',1,$3,jsonb_build_object('attempt_started_at',$3::timestamptz,'lease_heartbeat_at',$3::timestamptz))
    on conflict(run_id,artifact_key) do update
      set status='running',
          attempt_count=luminari_corpus_rebuild_artifact_v1.attempt_count+1,
          started_at=$3,
          completed_at=null,
          error_message=null,
          receipt_hash=null,
          result_json=jsonb_build_object('attempt_started_at',$3::timestamptz,'lease_heartbeat_at',$3::timestamptz)
      where (
        luminari_corpus_rebuild_artifact_v1.status='failed'
        and luminari_corpus_rebuild_artifact_v1.attempt_count<2
      ) or (
        luminari_corpus_rebuild_artifact_v1.status='running'
        and luminari_corpus_rebuild_artifact_v1.started_at < now()-interval '30 minutes'
      )
    returning artifact_key`, [runId, artifact.artifact_key, startedAt]);
  // More than one process can observe the same unclaimed artifact during a
  // rolling deploy. Only the transaction that inserted or reclaimed the
  // receipt may parse and publish it; every other contender exits cleanly.
  if (claim.rowCount === 0) return;

  if (artifact.exact_duplicate_of) {
    const receipt = sha256(stable({ runId, artifact: artifact.artifact_key, exact_duplicate_of: artifact.exact_duplicate_of, status: "skipped_exact_duplicate" }));
    // Parameters used only inside jsonb_build_object must carry explicit
    // casts: jsonb_build_object is variadic "any", so the extended query
    // protocol cannot infer an untyped parameter's type and Postgres rejects
    // the statement with "could not determine data type of parameter $N".
    await pool.query(`update public.luminari_corpus_source_artifact_v1
      set extraction_status='fresh_duplicate_preserved',
          observed_at=now(),
          metadata=metadata||jsonb_build_object(
            'fresh_source_disposition','exact_duplicate_preserved',
            'exact_duplicate_of',$2::text,
            'fresh_parser_version',$3::text
          )
      where artifact_key=$1`, [artifact.artifact_key, artifact.exact_duplicate_of, FRESH_CORPUS_PARSER_VERSION]);
    await pool.query(`update public.luminari_corpus_rebuild_artifact_v1 set status='skipped_exact_duplicate',completed_at=now(),receipt_hash=$3,result_json=$4::jsonb where run_id=$1 and artifact_key=$2`,
      [runId, artifact.artifact_key, receipt, JSON.stringify({ exact_duplicate_of: artifact.exact_duplicate_of })]);
    return;
  }

  if (artifact.artifact_role === "derivative_sql_artifact" || artifact.artifact_role === "derivative_bundle_artifact") {
    const receipt = sha256(stable({ runId, artifact: artifact.artifact_key, status: "preserved_derivative_not_reingested" }));
    // Same untyped-parameter rule as the duplicate branch above.
    await pool.query(`update public.luminari_corpus_source_artifact_v1
      set extraction_status='fresh_derivative_preserved',
          observed_at=now(),
          metadata=metadata||jsonb_build_object(
            'fresh_source_disposition','derivative_preserved_not_reingested',
            'fresh_parser_version',$2::text
          )
      where artifact_key=$1`, [artifact.artifact_key, FRESH_CORPUS_PARSER_VERSION]);
    await pool.query(`update public.luminari_corpus_rebuild_artifact_v1 set status='preserved_derivative',completed_at=now(),receipt_hash=$3,result_json=$4::jsonb where run_id=$1 and artifact_key=$2`,
      [runId, artifact.artifact_key, receipt, JSON.stringify({ reason: "derivative_artifact_not_primitive_source" })]);
    return;
  }

  try {
    const buffer = await downloadPublicStorageArtifact(artifact);
    const contentSha256 = sha256(buffer);
    const ext = artifact.object_name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? "";
    let text = "";
    if (ext === ".docx") text = await extractDocxText(buffer);
    else if (ext === ".xlsx") text = "[xlsx_structured_rows_extracted_without_flat_text_projection]";
    else text = buffer.toString("utf8");
    const textSha256 = sha256(text);
    const ctx: ParseContext = { runId, artifact, contentSha256, text };
    let candidatesGenerated = 0;
    let candidateHashes: string[] = [];
    let workbookChunks = 0;
    let insertResult: { inserted: number; idempotent: number };
    if (ext === ".xlsx") {
      const workbook = await insertXlsxCandidates(ctx, buffer);
      candidatesGenerated = workbook.generated;
      candidateHashes = workbook.candidateHashes;
      workbookChunks = workbook.chunks;
      insertResult = { inserted: workbook.inserted, idempotent: workbook.idempotent };
    } else {
      const candidates = await parseArtifact(ctx, buffer);
      candidatesGenerated = candidates.length;
      candidateHashes = candidates.map(item => item.candidate_hash);
      insertResult = await insertCandidates(candidates);
    }
    const receiptMaterial = {
      run_id: runId, artifact_key: artifact.artifact_key, content_sha256: contentSha256,
      extracted_text_sha256: textSha256, candidate_hashes: candidateHashes.sort(),
      parser_version: FRESH_CORPUS_PARSER_VERSION,
    };
    const receiptHash = sha256(stable(receiptMaterial));
    await pool.query(`update public.luminari_corpus_source_artifact_v1
      set content_sha256=$2,extracted_text_sha256=$3,extraction_status='fresh_parsed',observed_at=now(),metadata=metadata || $4::jsonb
      where artifact_key=$1`, [artifact.artifact_key, contentSha256, textSha256, JSON.stringify({ fresh_parser_version: FRESH_CORPUS_PARSER_VERSION })]);
    await pool.query(`update public.luminari_corpus_rebuild_artifact_v1
      set status='completed',content_sha256=$3,extracted_text_sha256=$4,candidate_count=$5,error_message=null,completed_at=now(),receipt_hash=$6,result_json=result_json||$7::jsonb
      where run_id=$1 and artifact_key=$2`, [runId, artifact.artifact_key, contentSha256, textSha256, candidatesGenerated, receiptHash,
      JSON.stringify({
        candidates_generated: candidatesGenerated,
        inserted: insertResult.inserted,
        idempotent: insertResult.idempotent,
        parser_version: FRESH_CORPUS_PARSER_VERSION,
        ...(ext === ".xlsx" ? { workbook_chunks_committed: workbookChunks, bounded_batch_insert: true } : {}),
      })]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const receiptHash = sha256(stable({ run_id: runId, artifact_key: artifact.artifact_key, status: "failed", error: message.slice(0, 500) }));
    await pool.query(`update public.luminari_corpus_source_artifact_v1 set extraction_status='fresh_parse_failed',observed_at=now() where artifact_key=$1`, [artifact.artifact_key]);
    await pool.query(`update public.luminari_corpus_rebuild_artifact_v1 set status='failed',error_message=$3,completed_at=now(),receipt_hash=$4,result_json=result_json||$5::jsonb where run_id=$1 and artifact_key=$2`,
      [runId, artifact.artifact_key, message.slice(0, 1000), receiptHash, JSON.stringify({ error_class: error instanceof Error ? error.name : "unknown" })]);
  }
}

async function nextArtifacts(runId: string, limit: number): Promise<SourceArtifact[]> {
  const pool = getPool();
  const result = await pool.query(`
    select a.artifact_key,a.bucket_id,a.object_name,a.transport_etag,a.byte_size,a.mimetype,a.artifact_role,
           a.jurisdiction_hint,a.semantic_family,a.generation_label,a.exact_duplicate_of
      from public.luminari_corpus_source_artifact_v1 a
      left join public.luminari_corpus_rebuild_artifact_v1 r on r.run_id=$1 and r.artifact_key=a.artifact_key
     where a.storage_state='active'
       and (
         r.artifact_key is null
         or (r.status='failed' and r.attempt_count < 2)
         or (r.status='running' and r.started_at < now()-interval '30 minutes')
       )
     order by case a.artifact_role
       when 'state_enrichment_source' then 1 when 'state_resource_directory_source' then 2 when 'state_registry_source' then 3
       when 'structured_backbone_source' then 4 when 'structured_workbook_source' then 5 else 6 end,
       a.artifact_key
     limit $2`, [runId, limit]);
  return result.rows.map(row => ({ ...row, byte_size: Number(row.byte_size ?? 0) })) as SourceArtifact[];
}

async function finalizeIdentities(runId: string): Promise<{ identities: number; unresolved: number }> {
  const pool = getPool();
  const result = await pool.query(`select candidate_key,candidate_type,state_code,jurisdiction,name,organization_name,phone,website_url,artifact_key,jurisdiction_resolution_state,payload
    from public.luminari_corpus_candidate_v1 where run_id=$1 and candidate_type = any($2::text[]) order by candidate_type,state_code,name,candidate_key`,
    [runId, [...IDENTITY_TYPES]]);
  type IdentityCandidate = typeof result.rows[number] & { normalized_name_key: string; phone_key: string | null; domain_key: string | null };
  const candidates: IdentityCandidate[] = result.rows.map(row => ({ ...row,
    normalized_name_key: normalizeName(row.organization_name || row.name),
    phone_key: normalizePhone(row.phone), domain_key: normalizeWebsiteDomain(row.website_url),
  })).filter(row => row.normalized_name_key);
  const groups = new Map<string, IdentityCandidate[]>();
  for (const row of candidates) {
    const key = `${row.candidate_type}|${row.state_code ?? row.jurisdiction ?? "UNRESOLVED"}|${row.normalized_name_key}`;
    const group = groups.get(key) ?? []; group.push(row); groups.set(key, group);
  }
  const identityRows: Array<Record<string, unknown>> = [];
  const evidenceRows: Array<Record<string, unknown>> = [];
  let identities = 0; let unresolved = 0;
  for (const [groupKey, group] of groups) {
    const jurisdictionConflict = group.some(row => row.jurisdiction_resolution_state === "conflict");
    const domains = [...new Set(group.map(row => row.domain_key).filter(Boolean))] as string[];
    const phones = [...new Set(group.map(row => row.phone_key).filter(Boolean))] as string[];
    const sharedDomain = domains.find(domain => group.filter(row => row.domain_key === domain).length > 1) ?? null;
    const sharedPhone = phones.find(phone => group.filter(row => row.phone_key === phone).length > 1) ?? null;
    const hasStrongDisagreement = group.length > 1 && !sharedDomain && !sharedPhone && (domains.length > 1 || phones.length > 1);
    const resolutionState = jurisdictionConflict || hasStrongDisagreement ? "unresolved_conflict" : "resolved";
    const strongIdentifier = sharedDomain ? `domain:${sharedDomain}` : sharedPhone ? `phone:${sharedPhone}` : domains.length === 1 ? `domain:${domains[0]}` : phones.length === 1 ? `phone:${phones[0]}` : null;
    const canonicalName = compact(group[0].organization_name || group[0].name);
    const identityKey = sha256(stable({ groupKey, resolutionState, strongIdentifier }));
    const canonicalPayload = {
      candidate_keys: group.map(row => row.candidate_key).sort(),
      source_artifacts: [...new Set(group.map(row => row.artifact_key))].sort(),
      observed_domains: domains.sort(), observed_phones: phones.sort(),
      resolution_reason: jurisdictionConflict ? "jurisdiction_conflict" : hasStrongDisagreement ? "strong_identifier_disagreement" : strongIdentifier ? "shared_or_unique_strong_identifier" : "normalized_name_plus_jurisdiction",
    };
    identityRows.push({
      identity_key: identityKey,
      identity_type: group[0].candidate_type,
      jurisdiction: group[0].jurisdiction,
      state_code: group[0].state_code,
      canonical_name: canonicalName,
      normalized_name_key: group[0].normalized_name_key,
      strong_identifier_key: strongIdentifier,
      resolution_state: resolutionState,
      candidate_count: group.length,
      canonical_payload: canonicalPayload,
      run_id: runId,
    });
    for (const row of group) {
      const basis = resolutionState === "unresolved_conflict" ? "name_jurisdiction_conflict_preserved" : sharedDomain ? "shared_website_domain" : sharedPhone ? "shared_phone" : strongIdentifier ? "name_jurisdiction_plus_strong_identifier" : "normalized_name_plus_jurisdiction";
      const strength = resolutionState === "unresolved_conflict" ? "conflict" : sharedDomain || sharedPhone ? "strong" : "medium";
      evidenceRows.push({
        identity_key: identityKey,
        candidate_key: row.candidate_key,
        match_basis: basis,
        match_strength: strength,
        candidate_state: resolutionState === "resolved" ? "identity_bound" : "identity_conflict",
      });
    }
    identities += 1; if (resolutionState !== "resolved") unresolved += 1;
  }

  // The former one-identity-plus-two-queries-per-candidate loop required
  // thousands of database round trips after a large workbook had already
  // parsed successfully. Bounded set-based writes keep sealing idempotent and
  // resumable without turning finalization into a query-timeout bottleneck.
  const identityChunkSize = 200;
  for (let offset = 0; offset < identityRows.length; offset += identityChunkSize) {
    const chunk = identityRows.slice(offset, offset + identityChunkSize);
    await pool.query(`with source_rows as (
        select * from jsonb_to_recordset($1::jsonb) as x(
          identity_key text,identity_type text,jurisdiction text,state_code text,canonical_name text,
          normalized_name_key text,strong_identifier_key text,resolution_state text,candidate_count integer,
          canonical_payload jsonb,run_id uuid
        )
      )
      insert into public.luminari_corpus_identity_v1(
        identity_key,identity_type,jurisdiction,state_code,canonical_name,normalized_name_key,strong_identifier_key,
        resolution_state,candidate_count,canonical_payload,first_run_id,latest_run_id
      )
      select identity_key,identity_type,jurisdiction,state_code,canonical_name,normalized_name_key,strong_identifier_key,
             resolution_state,candidate_count,canonical_payload,run_id,run_id
      from source_rows
      on conflict(identity_key) do update set
        canonical_name=excluded.canonical_name,
        strong_identifier_key=excluded.strong_identifier_key,
        resolution_state=excluded.resolution_state,
        candidate_count=excluded.candidate_count,
        canonical_payload=excluded.canonical_payload,
        latest_run_id=excluded.latest_run_id,
        updated_at=now()`, [JSON.stringify(chunk)]);
    await pool.query(`update public.luminari_corpus_rebuild_run_v1
      set result_json=result_json||jsonb_build_object('identity_groups_committed',$2::int,'identity_groups_total',$3::int)
      where run_id=$1`, [runId, Math.min(offset + chunk.length, identityRows.length), identityRows.length]);
  }

  const evidenceChunkSize = 400;
  for (let offset = 0; offset < evidenceRows.length; offset += evidenceChunkSize) {
    const chunk = evidenceRows.slice(offset, offset + evidenceChunkSize);
    await pool.query(`with source_rows as (
        select * from jsonb_to_recordset($1::jsonb) as x(
          identity_key text,candidate_key text,match_basis text,match_strength text,candidate_state text
        )
      ), evidence_insert as (
        insert into public.luminari_corpus_identity_evidence_v1(identity_key,candidate_key,match_basis,match_strength)
        select identity_key,candidate_key,match_basis,match_strength from source_rows
        on conflict do nothing
      )
      update public.luminari_corpus_candidate_v1 candidate
         set candidate_state=source_rows.candidate_state
        from source_rows
       where candidate.candidate_key=source_rows.candidate_key`, [JSON.stringify(chunk)]);
    await pool.query(`update public.luminari_corpus_rebuild_run_v1
      set result_json=result_json||jsonb_build_object('identity_evidence_committed',$2::int,'identity_evidence_total',$3::int)
      where run_id=$1`, [runId, Math.min(offset + chunk.length, evidenceRows.length), evidenceRows.length]);
  }
  return { identities, unresolved };
}

async function finalizeRun(runId: string): Promise<void> {
  const pool = getPool();
  const statusResult = await pool.query(`select status,count(*)::int as n from public.luminari_corpus_rebuild_artifact_v1 where run_id=$1 group by status order by status`, [runId]);
  const statusCounts = Object.fromEntries(statusResult.rows.map(row => [row.status, Number(row.n)]));
  const failed = Number(statusCounts.failed ?? 0);
  const nonterminal = Number(statusCounts.running ?? 0);
  if (nonterminal > 0) {
    throw new Error(`fresh_corpus_nonterminal_artifacts:${nonterminal}`);
  }
  const identities = await finalizeIdentities(runId);
  const candidateResult = await pool.query(`select count(*)::int as n,count(*) filter(where jurisdiction_resolution_state='conflict')::int as jurisdiction_conflicts from public.luminari_corpus_candidate_v1 where run_id=$1`, [runId]);
  const artifactResult = await pool.query(`select count(*)::int as n from public.luminari_corpus_source_artifact_v1 where storage_state='active'`, []);
  const receiptRows = await pool.query(`select artifact_key,status,receipt_hash from public.luminari_corpus_rebuild_artifact_v1 where run_id=$1 order by artifact_key`, [runId]);
  const candidateCount = Number(candidateResult.rows[0]?.n ?? 0);
  const jurisdictionConflicts = Number(candidateResult.rows[0]?.jurisdiction_conflicts ?? 0);
  const receiptHash = sha256(stable({ engine_version: FRESH_CORPUS_ENGINE_VERSION, run_id: runId,
    artifact_receipts: receiptRows.rows, identity_count: identities.identities, candidate_count: candidateCount }));
  await pool.query(`update public.luminari_corpus_rebuild_run_v1 set status=$2,artifact_count=$3,candidate_count=$4,identity_count=$5,unresolved_count=$6,completed_at=now(),receipt_hash=$7,result_json=$8::jsonb where run_id=$1`,
    [runId, failed ? "completed_with_failures" : "completed", Number(artifactResult.rows[0]?.n ?? 0), candidateCount, identities.identities,
      identities.unresolved + jurisdictionConflicts, receiptHash,
      JSON.stringify({ artifact_status_counts: statusCounts, identity_conflicts: identities.unresolved, jurisdiction_conflicts: jurisdictionConflicts, parser_version: FRESH_CORPUS_PARSER_VERSION })]);
}

export async function runFreshCorpusRebuildBatch(runId: string, limit = 8): Promise<{ processed: number; remaining: number; finalized: boolean }> {
  const pool = getPool();
  const boundedLimit = Math.max(1, Math.min(20, Math.floor(limit)));
  const artifacts = await nextArtifacts(runId, boundedLimit);
  for (const artifact of artifacts) await processArtifact(runId, artifact);
  const remainingResult = await pool.query(`select count(*)::int as n
    from public.luminari_corpus_source_artifact_v1 a
    left join public.luminari_corpus_rebuild_artifact_v1 r
      on r.run_id=$1 and r.artifact_key=a.artifact_key
    where a.storage_state='active'
      and (
        r.artifact_key is null
        or r.status='running'
        or (r.status='failed' and r.attempt_count<2)
      )`, [runId]);
  const remaining = Number(remainingResult.rows[0]?.n ?? 0);
  if (remaining === 0) { await finalizeRun(runId); return { processed: artifacts.length, remaining, finalized: true }; }
  return { processed: artifacts.length, remaining, finalized: false };
}

export async function syncFreshCorpusSourceManifest(): Promise<Record<string, unknown>> {
  const result = await getPool().query(`select public.sync_luminari_corpus_source_manifest_v2() as receipt`);
  return result.rows[0]?.receipt ?? {
    contract: "fresh_corpus_continuous_manifest_v2",
    storage_objects: 0,
    active_manifest_artifacts: 0,
    new_or_changed_artifacts: 0,
    newly_missing_artifacts: 0,
    pending_extraction_artifacts: 0,
  };
}

export async function queueFreshCorpusRebuild(
  scope: Record<string, unknown> = {},
  options: { manifestSync?: Record<string, unknown> } = {},
): Promise<{ run_id: string; status: string; manifest_sync: Record<string, unknown> }> {
  const pool = getPool();
  const manifestSync = options.manifestSync ?? await syncFreshCorpusSourceManifest();
  const result = await pool.query(`with queue_lock as materialized (
      select pg_advisory_xact_lock(hashtext('fresh_corpus_rebuild:'||$1))
    ), active as materialized (
      select run_id,status
      from public.luminari_corpus_rebuild_run_v1,queue_lock
      where engine_version=$1 and status in ('queued','running')
      order by started_at desc
      limit 1
    ), inserted as (
      insert into public.luminari_corpus_rebuild_run_v1(engine_version,scope,status)
      select $1,$2::jsonb,'queued' from queue_lock
      where not exists(select 1 from active)
      returning run_id,status
    )
    select run_id,status from inserted
    union all
    select run_id,status from active
    limit 1`, [FRESH_CORPUS_ENGINE_VERSION, JSON.stringify({ ...scope, manifest_sync: manifestSync, parser_version: FRESH_CORPUS_PARSER_VERSION })]);
  return { run_id: result.rows[0].run_id, status: result.rows[0].status, manifest_sync: manifestSync };
}

export async function getFreshCorpusRebuildStatus(runId?: string) {
  const pool = getPool();
  const result = runId
    ? await pool.query(`select * from public.luminari_corpus_rebuild_run_v1 where run_id=$1 limit 1`, [runId])
    : await pool.query(`select * from public.luminari_corpus_rebuild_run_v1 order by started_at desc limit 1`);
  if (!result.rows[0]) return { status: "not_started" };
  const run = result.rows[0];
  const artifacts = await pool.query(`select status,count(*)::int as n from public.luminari_corpus_rebuild_artifact_v1 where run_id=$1 group by status order by status`, [run.run_id]);
  return { ...run, artifact_status_counts: Object.fromEntries(artifacts.rows.map(row => [row.status, Number(row.n)])) };
}

export async function resumeFreshCorpusRebuildFromDatabase(options: { batchSize?: number; maxBatches?: number } = {}) {
  const pool = getPool();
  const active = await pool.query(`select run_id from public.luminari_corpus_rebuild_run_v1 where engine_version=$1 and status in ('queued','running') order by started_at asc limit 1`, [FRESH_CORPUS_ENGINE_VERSION]);
  const runId = active.rows[0]?.run_id as string | undefined;
  if (!runId) return { status: "idle" };
  await pool.query(`update public.luminari_corpus_rebuild_run_v1 set status='running' where run_id=$1 and status='queued'`, [runId]);
  const batchSize = Math.max(1, Math.min(12, options.batchSize ?? 6));
  const maxBatches = Math.max(1, Math.min(100, options.maxBatches ?? 40));
  let processed = 0;
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const result = await runFreshCorpusRebuildBatch(runId, batchSize);
    processed += result.processed;
    if (result.finalized) return { status: "completed", run_id: runId, processed };
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return { status: "yielded", run_id: runId, processed };
}

export async function reconcileFreshCorpusAutomatically(
  options: { batchSize?: number; maxBatches?: number } = {},
) {
  const pool = getPool();
  const manifestSync = await syncFreshCorpusSourceManifest();
  const latest = await pool.query(`
    select r.run_id,r.status,r.artifact_count,r.result_json->>'parser_version' as parser_version,
           (select count(*)::int
              from public.luminari_corpus_rebuild_artifact_v1 a
             where a.run_id=r.run_id
               and a.status not in ('completed','failed','skipped_exact_duplicate','preserved_derivative'))
             as nonterminal_count
      from public.luminari_corpus_rebuild_run_v1 r
     where engine_version=$1 and status in ('completed','completed_with_failures')
     order by completed_at desc nulls last,started_at desc
     limit 1
  `, [FRESH_CORPUS_ENGINE_VERSION]);
  const latestRun = latest.rows[0];
  const newOrChanged = Number(manifestSync.new_or_changed_artifacts ?? 0);
  const newlyMissing = Number(manifestSync.newly_missing_artifacts ?? 0);
  const activeArtifacts = Number(manifestSync.active_manifest_artifacts ?? 0);
  const requiresReplay = !latestRun
    || latestRun.parser_version !== FRESH_CORPUS_PARSER_VERSION
    || Number(latestRun.artifact_count ?? 0) !== activeArtifacts
    || Number(latestRun.nonterminal_count ?? 0) > 0
    || newOrChanged > 0
    || newlyMissing > 0;

  let queued: Awaited<ReturnType<typeof queueFreshCorpusRebuild>> | null = null;
  if (requiresReplay) {
    queued = await queueFreshCorpusRebuild({
      requested_from: "automatic_storage_manifest_reconciliation",
      reason: !latestRun
        ? "no_completed_fresh_corpus_run"
        : latestRun.parser_version !== FRESH_CORPUS_PARSER_VERSION
          ? "parser_version_changed"
          : Number(latestRun.nonterminal_count ?? 0) > 0
            ? "nonterminal_artifact_receipts"
          : "source_changes_detected",
      source_buckets: ["State Enriched Registry bucket", "Everything backbone related"],
    }, { manifestSync });
  }

  const resumed = await resumeFreshCorpusRebuildFromDatabase(options);
  return {
    status: resumed.status,
    manifest_sync: manifestSync,
    replay_required: requiresReplay,
    queued,
    rebuild: resumed,
  };
}

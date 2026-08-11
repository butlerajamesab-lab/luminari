import crypto from "node:crypto";
import JSZip from "jszip";
import { getPool } from "../db";
import { SUPABASE_PROJECT } from "../_core/health-diagnostics";

export const FRESH_CORPUS_ENGINE_VERSION = "fresh_corpus_reconciliation_v1.0.0";
export const FRESH_CORPUS_PARSER_VERSION = "fresh_registry_typed_parser_v1.0.0";

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

function nullable(value: unknown, max = 4000): string | null {
  const cleaned = compact(value);
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

async function parseXlsxRows(buffer: Buffer): Promise<Array<{ sheet: string; row: number; values: Record<string, string> }>> {
  const zip = await JSZip.loadAsync(buffer);
  const sharedXml = await zip.file("xl/sharedStrings.xml")?.async("text");
  const shared: string[] = [];
  if (sharedXml) {
    for (const si of sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) shared.push(xmlCellText(si[1]));
  }
  const workbookXml = await zip.file("xl/workbook.xml")?.async("text");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("text");
  if (!workbookXml || !relsXml) return [];
  const relationships = new Map<string, string>();
  for (const rel of relsXml.matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/?\s*>/g)) {
    relationships.set(rel[1], rel[2].replace(/^\//, ""));
  }
  const sheets: Array<{ name: string; path: string }> = [];
  for (const sheet of workbookXml.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/?\s*>/g)) {
    const target = relationships.get(sheet[2]);
    if (!target) continue;
    sheets.push({ name: decodeXmlEntities(sheet[1]), path: target.startsWith("xl/") ? target : `xl/${target.replace(/^\.\//, "")}` });
  }
  const result: Array<{ sheet: string; row: number; values: Record<string, string> }> = [];
  for (const sheet of sheets) {
    const xml = await zip.file(sheet.path)?.async("text");
    if (!xml) continue;
    const rows: string[][] = [];
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
        let value = type === "s" ? shared[Number(raw)] ?? "" : type === "inlineStr" ? xmlCellText(raw) : decodeXmlEntities(raw).trim();
        cells[index] = value;
      }
      rows.push(cells);
      if (rows.length >= 100_000) break;
    }
    const headerIndex = rows.findIndex(row => row.filter(Boolean).length >= 2);
    if (headerIndex < 0) continue;
    const headers = rows[headerIndex].map((value, index) => compact(value) || `column_${index + 1}`);
    for (let i = headerIndex + 1; i < rows.length; i += 1) {
      const values: Record<string, string> = {};
      rows[i].forEach((value, index) => { if (compact(value)) values[headers[index] ?? `column_${index + 1}`] = compact(value); });
      if (Object.keys(values).length) result.push({ sheet: sheet.name, row: i + 1, values });
    }
  }
  return result;
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
  return {
    candidate_key: candidateHash,
    run_id: ctx.runId,
    artifact_key: ctx.artifact.artifact_key,
    candidate_type: input.candidate_type,
    source_locator: input.source_locator,
    jurisdiction: jurisdiction.jurisdiction,
    state_code: jurisdiction.stateCode,
    section_name: input.section_name,
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
    raw_excerpt: input.raw_excerpt,
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

function parseResourceCandidates(ctx: ParseContext): Candidate[] {
  const rawLines = ctx.text.split(/\r?\n/);
  const lines = rawLines.map(compact);
  const out: Candidate[] = [];
  let section = "document_start";
  let current: { title: string; start: number; fields: Record<string, string>; sourceLines: string[]; section: string } | null = null;

  const flush = () => {
    if (!current) return;
    const fields = current.fields;
    const fieldCount = Object.keys(fields).length;
    const hasContact = Boolean(fields.phone || fields.website_url || fields.email || fields.address || fields.filing_portal);
    const title = compact(current.title).replace(/\s+\[(?:[A-Z0-9_-]+)\]\s+(?:VERIFIED|UNVERIFIED.*)$/i, "").replace(/\s+(?:VERIFIED|UNVERIFIED.*)$/i, "").trim();
    const malformedTitle = !title || /^(field|information|program|organization|phone|website|eligibility|address|notes)$/i.test(title);
    if (!malformedTitle && fieldCount >= 2 && (hasContact || fields.eligibility_summary || fields.description)) {
      const excerpt = current.sourceLines.join("\n").slice(0, 8000);
      out.push(candidate(ctx, {
        candidate_type: "resource",
        source_locator: `lines:${current.start}-${current.start + current.sourceLines.length - 1}`,
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
        },
        excerptForJurisdiction: `${title}\n${fields.address ?? ""}\n${excerpt.slice(0, 800)}`,
      }));
      if (fields.statutory_authority) {
        out.push(candidate(ctx, {
          candidate_type: "legal_authority",
          source_locator: `lines:${current.start}-${current.start + current.sourceLines.length - 1}:statutory_authority`,
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
          value = lines[j]; i = j;
        }
      }
      if (value) current.fields[key] = current.fields[key] ? `${current.fields[key]} | ${value}` : value;
      current.sourceLines.push(`${labelRaw}: ${value}`);
      continue;
    }

    const nextNonEmpty = (() => {
      for (let j = i + 1; j < Math.min(lines.length, i + 5); j += 1) if (lines[j]) return lines[j];
      return "";
    })();
    const titleCandidate = !isSectionHeading(line) && line.length >= 4 && line.length <= 300
      && (RESOURCE_LABELS.has(normalizeLabel(nextNonEmpty)) || /^[^:]{4,240}\s+\[[A-Z0-9_-]+\]\s+(?:VERIFIED|UNVERIFIED)/i.test(line));
    if (titleCandidate) {
      flush(); current = { title: line, start: i + 1, fields: {}, sourceLines: [line], section }; continue;
    }
    if (current && !isSectionHeading(line) && current.sourceLines.length < 30) current.sourceLines.push(line);
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
  for (let i = 1; i < lines.length && i <= 100_000; i += 1) {
    const values = parseCsvLine(lines[i]);
    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => { if (header) record[header] = compact(values[index]); });
    const parsed = structuredRecordCandidate(ctx, type, `csv:row:${i + 1}`, record);
    if (parsed) out.push(parsed);
  }
  return out;
}

function xlsxCandidate(ctx: ParseContext, row: { sheet: string; row: number; values: Record<string, string> }): Candidate | null {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(row.values)) normalized[key.toLowerCase().replace(/[^a-z0-9]+/g, "_")] = value;
  const name = nullable(normalized.resource_name || normalized.program || normalized.organization || normalized.name || normalized.agency, 500);
  if (!name) return null;
  return candidate(ctx, {
    candidate_type: "resource", source_locator: `xlsx:${row.sheet}:row:${row.row}`, section_name: row.sheet,
    name, organization_name: nullable(normalized.organization || normalized.agency || name, 500),
    category: nullable(normalized.category || normalized.resource_type || row.sheet, 160), layer: "backbone_workbook",
    phone: nullable(normalized.phone || normalized.contact_phone, 1000), email: nullable(normalized.email || normalized.contact_email, 1000),
    website_url: nullable(normalized.website || normalized.website_url || normalized.url, 2000),
    address: nullable(normalized.address || normalized.address_line1, 2000),
    eligibility_summary: nullable(normalized.eligibility || normalized.eligibility_summary, 5000),
    apply_notes: nullable(normalized.apply_notes || normalized.notes || normalized.application, 5000),
    description: nullable(normalized.description || normalized.what_it_does_for_people, 5000),
    raw_excerpt: stable(row.values).slice(0, 8000), payload: { row: row.values, sheet: row.sheet, parser_rule: "xlsx_header_row_resource" },
    excerptForJurisdiction: `${normalized.state || normalized.state_code || normalized.jurisdiction || ""} ${name} ${normalized.address || ""}`,
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
  if (ext === ".xlsx") {
    const rows = await parseXlsxRows(buffer);
    return rows.map(row => xlsxCandidate(ctx, row)).filter((item): item is Candidate => Boolean(item));
  }
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

async function processArtifact(runId: string, artifact: SourceArtifact): Promise<void> {
  const pool = getPool();
  const startedAt = new Date().toISOString();
  await pool.query(`insert into public.luminari_corpus_rebuild_artifact_v1(run_id,artifact_key,status,attempt_count,started_at)
    values($1,$2,'running',1,$3) on conflict(run_id,artifact_key) do update set status='running',attempt_count=luminari_corpus_rebuild_artifact_v1.attempt_count+1,started_at=$3,error_message=null`, [runId, artifact.artifact_key, startedAt]);

  if (artifact.exact_duplicate_of) {
    const receipt = sha256(stable({ runId, artifact: artifact.artifact_key, exact_duplicate_of: artifact.exact_duplicate_of, status: "skipped_exact_duplicate" }));
    await pool.query(`update public.luminari_corpus_rebuild_artifact_v1 set status='skipped_exact_duplicate',completed_at=now(),receipt_hash=$3,result_json=$4::jsonb where run_id=$1 and artifact_key=$2`,
      [runId, artifact.artifact_key, receipt, JSON.stringify({ exact_duplicate_of: artifact.exact_duplicate_of })]);
    return;
  }

  if (artifact.artifact_role === "derivative_sql_artifact" || artifact.artifact_role === "derivative_bundle_artifact") {
    const receipt = sha256(stable({ runId, artifact: artifact.artifact_key, status: "preserved_derivative_not_reingested" }));
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
    const candidates = await parseArtifact(ctx, buffer);
    const insertResult = await insertCandidates(candidates);
    const receiptMaterial = {
      run_id: runId, artifact_key: artifact.artifact_key, content_sha256: contentSha256,
      extracted_text_sha256: textSha256, candidate_hashes: candidates.map(item => item.candidate_hash).sort(),
      parser_version: FRESH_CORPUS_PARSER_VERSION,
    };
    const receiptHash = sha256(stable(receiptMaterial));
    await pool.query(`update public.luminari_corpus_source_artifact_v1
      set content_sha256=$2,extracted_text_sha256=$3,extraction_status='fresh_parsed',observed_at=now(),metadata=metadata || $4::jsonb
      where artifact_key=$1`, [artifact.artifact_key, contentSha256, textSha256, JSON.stringify({ fresh_parser_version: FRESH_CORPUS_PARSER_VERSION })]);
    await pool.query(`update public.luminari_corpus_rebuild_artifact_v1
      set status='completed',content_sha256=$3,extracted_text_sha256=$4,candidate_count=$5,error_message=null,completed_at=now(),receipt_hash=$6,result_json=$7::jsonb
      where run_id=$1 and artifact_key=$2`, [runId, artifact.artifact_key, contentSha256, textSha256, candidates.length, receiptHash,
      JSON.stringify({ candidates_generated: candidates.length, inserted: insertResult.inserted, idempotent: insertResult.idempotent, parser_version: FRESH_CORPUS_PARSER_VERSION })]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const receiptHash = sha256(stable({ run_id: runId, artifact_key: artifact.artifact_key, status: "failed", error: message.slice(0, 500) }));
    await pool.query(`update public.luminari_corpus_source_artifact_v1 set extraction_status='fresh_parse_failed',observed_at=now() where artifact_key=$1`, [artifact.artifact_key]);
    await pool.query(`update public.luminari_corpus_rebuild_artifact_v1 set status='failed',error_message=$3,completed_at=now(),receipt_hash=$4,result_json=$5::jsonb where run_id=$1 and artifact_key=$2`,
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
     where r.artifact_key is null or (r.status='failed' and r.attempt_count < 2)
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
    await pool.query(`insert into public.luminari_corpus_identity_v1(identity_key,identity_type,jurisdiction,state_code,canonical_name,normalized_name_key,strong_identifier_key,resolution_state,candidate_count,canonical_payload,first_run_id,latest_run_id)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$11)
      on conflict(identity_key) do update set canonical_name=excluded.canonical_name,strong_identifier_key=excluded.strong_identifier_key,resolution_state=excluded.resolution_state,candidate_count=excluded.candidate_count,canonical_payload=excluded.canonical_payload,latest_run_id=excluded.latest_run_id,updated_at=now()`,
      [identityKey, group[0].candidate_type, group[0].jurisdiction, group[0].state_code, canonicalName, group[0].normalized_name_key, strongIdentifier, resolutionState, group.length, JSON.stringify(canonicalPayload), runId]);
    for (const row of group) {
      const basis = resolutionState === "unresolved_conflict" ? "name_jurisdiction_conflict_preserved" : sharedDomain ? "shared_website_domain" : sharedPhone ? "shared_phone" : strongIdentifier ? "name_jurisdiction_plus_strong_identifier" : "normalized_name_plus_jurisdiction";
      const strength = resolutionState === "unresolved_conflict" ? "conflict" : sharedDomain || sharedPhone ? "strong" : "medium";
      await pool.query(`insert into public.luminari_corpus_identity_evidence_v1(identity_key,candidate_key,match_basis,match_strength) values($1,$2,$3,$4) on conflict do nothing`, [identityKey, row.candidate_key, basis, strength]);
      await pool.query(`update public.luminari_corpus_candidate_v1 set candidate_state=$2 where candidate_key=$1`, [row.candidate_key, resolutionState === "resolved" ? "identity_bound" : "identity_conflict"]);
    }
    identities += 1; if (resolutionState !== "resolved") unresolved += 1;
  }
  return { identities, unresolved };
}

async function finalizeRun(runId: string): Promise<void> {
  const pool = getPool();
  const identities = await finalizeIdentities(runId);
  const statusResult = await pool.query(`select status,count(*)::int as n from public.luminari_corpus_rebuild_artifact_v1 where run_id=$1 group by status order by status`, [runId]);
  const candidateResult = await pool.query(`select count(*)::int as n,count(*) filter(where jurisdiction_resolution_state='conflict')::int as jurisdiction_conflicts from public.luminari_corpus_candidate_v1 where run_id=$1`, [runId]);
  const artifactResult = await pool.query(`select count(*)::int as n from public.luminari_corpus_source_artifact_v1`, []);
  const receiptRows = await pool.query(`select artifact_key,status,receipt_hash from public.luminari_corpus_rebuild_artifact_v1 where run_id=$1 order by artifact_key`, [runId]);
  const statusCounts = Object.fromEntries(statusResult.rows.map(row => [row.status, Number(row.n)]));
  const failed = Number(statusCounts.failed ?? 0);
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
  const remainingResult = await pool.query(`select count(*)::int as n from public.luminari_corpus_source_artifact_v1 a left join public.luminari_corpus_rebuild_artifact_v1 r on r.run_id=$1 and r.artifact_key=a.artifact_key where r.artifact_key is null or (r.status='failed' and r.attempt_count<2)`, [runId]);
  const remaining = Number(remainingResult.rows[0]?.n ?? 0);
  if (remaining === 0) { await finalizeRun(runId); return { processed: artifacts.length, remaining, finalized: true }; }
  return { processed: artifacts.length, remaining, finalized: false };
}

export async function queueFreshCorpusRebuild(scope: Record<string, unknown> = {}): Promise<{ run_id: string; status: string }> {
  const pool = getPool();
  const active = await pool.query(`select run_id,status from public.luminari_corpus_rebuild_run_v1 where engine_version=$1 and status in ('queued','running') order by started_at desc limit 1`, [FRESH_CORPUS_ENGINE_VERSION]);
  if (active.rows[0]) return { run_id: active.rows[0].run_id, status: active.rows[0].status };
  const result = await pool.query(`insert into public.luminari_corpus_rebuild_run_v1(engine_version,scope,status) values($1,$2::jsonb,'queued') returning run_id,status`, [FRESH_CORPUS_ENGINE_VERSION, JSON.stringify(scope)]);
  return { run_id: result.rows[0].run_id, status: result.rows[0].status };
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

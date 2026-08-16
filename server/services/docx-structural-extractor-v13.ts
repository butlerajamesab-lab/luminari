import JSZip from "jszip";

export const DOCX_STRUCTURAL_PARSER_VERSION = "fresh_registry_docx_structural_v1.3.0";

export type DocxHyperlink = {
  text: string;
  target: string;
  relationshipId: string;
};

export type DocxCell = {
  index: number;
  text: string;
  hyperlinks: DocxHyperlink[];
};

export type DocxTableRow = {
  rowIndex: number;
  cells: DocxCell[];
};

export type DocxTable = {
  tableIndex: number;
  precedingHeading: string | null;
  rows: DocxTableRow[];
};

export type DocxParagraph = {
  paragraphIndex: number;
  text: string;
  style: string | null;
  isHeading: boolean;
  hyperlinks: DocxHyperlink[];
};

export type DocxStructure = {
  paragraphs: DocxParagraph[];
  tables: DocxTable[];
  hyperlinks: DocxHyperlink[];
};

export type StructuralCandidateSeed = {
  candidateType:
    | "resource"
    | "program"
    | "agency"
    | "legal_authority"
    | "workflow"
    | "tribal_governance_record"
    | "organization"
    | "policy_alert";
  targetSurface: string;
  sourceLocator: string;
  sectionName: string | null;
  name: string;
  organizationName: string | null;
  category: string | null;
  phone: string | null;
  email: string | null;
  websiteUrl: string | null;
  address: string | null;
  eligibilitySummary: string | null;
  applyNotes: string | null;
  description: string | null;
  excerptForJurisdiction: string;
  payload: Record<string, unknown>;
};

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)));
}

function compact(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeHeader(value: string): string {
  return compact(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function textFromWordXml(xml: string): string {
  const out: string[] = [];
  const token = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/?>|<w:br\b[^>]*\/?>/g;
  for (const match of xml.matchAll(token)) {
    if (match[1] !== undefined) out.push(decodeXmlEntities(match[1]));
    else out.push(" ");
  }
  return compact(out.join(""));
}

function relationshipMap(xml: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!xml) return out;
  for (const match of xml.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)) {
    const attrs = match[1];
    const id = attrs.match(/\bId="([^"]+)"/)?.[1];
    const target = attrs.match(/\bTarget="([^"]+)"/)?.[1];
    const mode = attrs.match(/\bTargetMode="([^"]+)"/)?.[1];
    if (id && target && (!mode || mode === "External")) out.set(id, decodeXmlEntities(target));
  }
  return out;
}

function hyperlinksFromXml(xml: string, relationships: Map<string, string>): DocxHyperlink[] {
  const links: DocxHyperlink[] = [];
  for (const match of xml.matchAll(/<w:hyperlink\b([^>]*)>([\s\S]*?)<\/w:hyperlink>/g)) {
    const attrs = match[1];
    const relationshipId = attrs.match(/\br:id="([^"]+)"/)?.[1];
    if (!relationshipId) continue;
    const target = relationships.get(relationshipId);
    if (!target) continue;
    const text = textFromWordXml(match[2]) || target;
    links.push({ text, target, relationshipId });
  }
  return links;
}

function paragraphStyle(xml: string): string | null {
  return xml.match(/<w:pStyle\b[^>]*w:val="([^"]+)"/)?.[1] ?? null;
}

function headingLike(text: string, style: string | null): boolean {
  if (!text) return false;
  if (style && /heading|title/i.test(style)) return true;
  if (/^PART\s+[IVXLC]+\b/i.test(text)) return true;
  if (/^[A-Z0-9][A-Z0-9 &/()'.,:+–—-]{5,}$/.test(text) && text.length <= 180) return true;
  return false;
}

function bodyBlocks(body: string): Array<{ kind: "paragraph" | "table"; xml: string }> {
  const out: Array<{ kind: "paragraph" | "table"; xml: string }> = [];
  let cursor = 0;
  while (cursor < body.length) {
    const p = body.indexOf("<w:p", cursor);
    const t = body.indexOf("<w:tbl", cursor);
    if (p < 0 && t < 0) break;
    if (t >= 0 && (p < 0 || t < p)) {
      const end = body.indexOf("</w:tbl>", t);
      if (end < 0) break;
      out.push({ kind: "table", xml: body.slice(t, end + "</w:tbl>".length) });
      cursor = end + "</w:tbl>".length;
    } else {
      const end = body.indexOf("</w:p>", p);
      if (end < 0) break;
      out.push({ kind: "paragraph", xml: body.slice(p, end + "</w:p>".length) });
      cursor = end + "</w:p>".length;
    }
  }
  return out;
}

function parseTable(xml: string, tableIndex: number, precedingHeading: string | null, relationships: Map<string, string>): DocxTable {
  const rows: DocxTableRow[] = [];
  let rowIndex = 0;
  for (const rowMatch of xml.matchAll(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g)) {
    const cells: DocxCell[] = [];
    let cellIndex = 0;
    for (const cellMatch of rowMatch[1].matchAll(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g)) {
      const cellXml = cellMatch[1];
      cells.push({
        index: cellIndex,
        text: textFromWordXml(cellXml),
        hyperlinks: hyperlinksFromXml(cellXml, relationships),
      });
      cellIndex += 1;
    }
    if (cells.some((cell) => cell.text || cell.hyperlinks.length)) rows.push({ rowIndex, cells });
    rowIndex += 1;
  }
  return { tableIndex, precedingHeading, rows };
}

export async function extractDocxStructure(buffer: Buffer): Promise<DocxStructure> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")?.async("text");
  if (!documentXml) throw new Error("docx_missing_word_document_xml");
  const relsXml = await zip.file("word/_rels/document.xml.rels")?.async("text");
  const relationships = relationshipMap(relsXml);
  const body = documentXml.match(/<w:body\b[^>]*>([\s\S]*?)<\/w:body>/)?.[1] ?? documentXml;

  const paragraphs: DocxParagraph[] = [];
  const tables: DocxTable[] = [];
  const links: DocxHyperlink[] = [];
  let heading: string | null = null;
  let paragraphIndex = 0;
  let tableIndex = 0;

  for (const block of bodyBlocks(body)) {
    if (block.kind === "paragraph") {
      const text = textFromWordXml(block.xml);
      const style = paragraphStyle(block.xml);
      const hyperlinks = hyperlinksFromXml(block.xml, relationships);
      const isHeading = headingLike(text, style);
      if (text || hyperlinks.length) {
        paragraphs.push({ paragraphIndex, text, style, isHeading, hyperlinks });
        links.push(...hyperlinks);
      }
      if (isHeading) heading = text;
      paragraphIndex += 1;
      continue;
    }

    const table = parseTable(block.xml, tableIndex, heading, relationships);
    if (table.rows.length) {
      tables.push(table);
      for (const row of table.rows) for (const cell of row.cells) links.push(...cell.hyperlinks);
    }
    tableIndex += 1;
  }

  const uniqueLinks = new Map<string, DocxHyperlink>();
  for (const link of links) uniqueLinks.set(`${link.relationshipId}|${link.target}|${link.text}`, link);
  return { paragraphs, tables, hyperlinks: [...uniqueLinks.values()] };
}

type TableKind =
  | "urban_indian_health_directory"
  | "organization_directory"
  | "ihs_area_matrix"
  | "icwa_state_matrix"
  | "bia_region_directory"
  | "generic_matrix";

function tableKind(headers: string[]): TableKind {
  const set = new Set(headers.map(normalizeHeader));
  const has = (...keys: string[]) => keys.every((key) => set.has(key));
  if (has("city", "organization", "phone", "website")) return "urban_indian_health_directory";
  if (has("ihs_area", "states_tribes_served") || (set.has("ihs_area") && set.has("area_office_contact"))) return "ihs_area_matrix";
  if ((set.has("state") && set.has("state_icwa_law")) || (set.has("state") && set.has("key_enhancement_over_federal_floor"))) return "icwa_state_matrix";
  if ((set.has("bia_region") || set.has("region")) && set.has("states_covered")) return "bia_region_directory";
  if (has("organization", "phone", "website")) return "organization_directory";
  return "generic_matrix";
}

function rowRecord(headers: string[], row: DocxTableRow): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((header, index) => {
    const key = normalizeHeader(header) || `column_${index + 1}`;
    const cell = row.cells[index];
    if (!cell) return;
    if (cell.text) out[key] = cell.text;
    const firstExternal = cell.hyperlinks[0]?.target;
    if (firstExternal) out[`${key}_hyperlink`] = firstExternal;
  });
  return out;
}

function firstUrl(record: Record<string, string>): string | null {
  const explicit = record.website_hyperlink || record.website || record.url_hyperlink || record.url;
  if (explicit) return explicit;
  for (const value of Object.values(record)) {
    const match = value.match(/\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?/i);
    if (match) return match[0];
  }
  return null;
}

function firstPhone(record: Record<string, string>): string | null {
  const explicit = record.phone || record.telephone || record.area_office_contact;
  const match = explicit?.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/);
  if (match) return match[0];
  for (const value of Object.values(record)) {
    const found = value.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/);
    if (found) return found[0];
  }
  return null;
}

function inferStateText(record: Record<string, string>): string {
  return record.state || record.states_served || record.states_covered || record.states_tribes_served || record.city || "";
}

function tableRowSeed(table: DocxTable, kind: TableKind, row: DocxTableRow, record: Record<string, string>): StructuralCandidateSeed | null {
  const sectionName = table.precedingHeading;
  const locator = `docx:table:${table.tableIndex}:row:${row.rowIndex}`;
  const raw = row.cells.map((cell) => cell.text).filter(Boolean).join(" | ");
  if (!raw) return null;

  if (kind === "urban_indian_health_directory") {
    const name = record.organization || raw;
    return {
      candidateType: "resource",
      targetSurface: "resource_directory",
      sourceLocator: locator,
      sectionName,
      name,
      organizationName: name,
      category: "tribal_indigenous_health",
      phone: firstPhone(record),
      email: null,
      websiteUrl: firstUrl(record),
      address: record.city || null,
      eligibilitySummary: record.states_served || null,
      applyNotes: "Urban Indian Health Program / urban AI/AN routing resource preserved from source table.",
      description: raw,
      excerptForJurisdiction: `${inferStateText(record)} ${raw}`,
      payload: { parser_rule: "docx_structural_table_v13", table_kind: kind, record, raw_row: raw },
    };
  }

  if (kind === "organization_directory") {
    const name = record.organization || raw;
    return {
      candidateType: "resource",
      targetSurface: "resource_directory",
      sourceLocator: locator,
      sectionName,
      name,
      organizationName: name,
      category: "tribal_indigenous",
      phone: firstPhone(record),
      email: null,
      websiteUrl: firstUrl(record),
      address: null,
      eligibilitySummary: null,
      applyNotes: null,
      description: raw,
      excerptForJurisdiction: `${inferStateText(record)} ${sectionName ?? ""} ${raw}`,
      payload: { parser_rule: "docx_structural_table_v13", table_kind: kind, record, raw_row: raw },
    };
  }

  if (kind === "ihs_area_matrix") {
    const name = record.ihs_area ? `${record.ihs_area} IHS Area` : raw;
    return {
      candidateType: "tribal_governance_record",
      targetSurface: "population_engine",
      sourceLocator: locator,
      sectionName,
      name,
      organizationName: name,
      category: "ihs_area_routing",
      phone: firstPhone(record),
      email: null,
      websiteUrl: firstUrl(record),
      address: record.area_office_contact || null,
      eligibilitySummary: record.states_tribes_served || null,
      applyNotes: record.tribal_tanf_social_services || null,
      description: [record.key_tribal_health_orgs, raw].filter(Boolean).join(" — "),
      excerptForJurisdiction: `${record.states_tribes_served ?? ""} ${raw}`,
      payload: { parser_rule: "docx_structural_table_v13", table_kind: kind, record, raw_row: raw },
    };
  }

  if (kind === "icwa_state_matrix") {
    const state = record.state || "State";
    const law = record.state_icwa_law || record.icwa_law || "ICWA enhancement";
    return {
      candidateType: "legal_authority",
      targetSurface: "legal_library",
      sourceLocator: locator,
      sectionName,
      name: `${state} — ${law}`,
      organizationName: null,
      category: "tribal_icwa",
      phone: firstPhone(record),
      email: null,
      websiteUrl: firstUrl(record),
      address: null,
      eligibilitySummary: null,
      applyNotes: record.contact || null,
      description: record.key_enhancement_over_federal_floor || raw,
      excerptForJurisdiction: `${state} ${raw}`,
      payload: { parser_rule: "docx_structural_table_v13", table_kind: kind, record, raw_row: raw },
    };
  }

  if (kind === "bia_region_directory") {
    const region = record.bia_region || record.region || raw;
    const name = `${region} BIA Region`;
    return {
      candidateType: "agency",
      targetSurface: "enforcement_intelligence",
      sourceLocator: locator,
      sectionName,
      name,
      organizationName: name,
      category: "tribal_federal_oversight",
      phone: firstPhone(record),
      email: null,
      websiteUrl: firstUrl(record),
      address: record.address || null,
      eligibilitySummary: record.states_covered || null,
      applyNotes: "BIA regional routing for enrollment, trust land, ICWA tribal identification, and federal trust responsibility matters.",
      description: raw,
      excerptForJurisdiction: `${record.states_covered ?? ""} ${raw}`,
      payload: { parser_rule: "docx_structural_table_v13", table_kind: kind, record, raw_row: raw },
    };
  }

  return {
    candidateType: "tribal_governance_record",
    targetSurface: "typed_corpus",
    sourceLocator: locator,
    sectionName,
    name: row.cells[0]?.text || `${sectionName ?? "Source table"} row ${row.rowIndex}`,
    organizationName: null,
    category: "structured_source_matrix",
    phone: firstPhone(record),
    email: null,
    websiteUrl: firstUrl(record),
    address: null,
    eligibilitySummary: null,
    applyNotes: null,
    description: raw,
    excerptForJurisdiction: `${inferStateText(record)} ${sectionName ?? ""} ${raw}`,
    payload: { parser_rule: "docx_structural_table_v13", table_kind: kind, record, raw_row: raw, requires_secondary_typing: true },
  };
}

function paragraphSeeds(structure: DocxStructure): StructuralCandidateSeed[] {
  const out: StructuralCandidateSeed[] = [];
  let heading: string | null = null;
  for (const paragraph of structure.paragraphs) {
    if (paragraph.isHeading) {
      heading = paragraph.text;
      continue;
    }
    const text = paragraph.text;
    if (!text) continue;
    const upper = text.toUpperCase();
    const isRouting = /MANDATORY PROTOCOL|CRITICAL ROUTING PRINCIPLE|THRESHOLD QUESTION|HOW TO FIND|FIRST CALL|FIRST QUESTION/.test(upper);
    const isLegal = /INDIAN CHILD WELFARE ACT|\bICWA\b|FEDERAL FLOOR REQUIREMENTS|ACTIVE EFFORTS|PLACEMENT PREFERENCES|TRIBAL INTERVENTION/.test(upper);
    if (!isRouting && !isLegal) continue;
    out.push({
      candidateType: isLegal ? "legal_authority" : "workflow",
      targetSurface: isLegal ? "legal_library" : "workflow_and_accountability",
      sourceLocator: `docx:paragraph:${paragraph.paragraphIndex}`,
      sectionName: heading,
      name: heading ? `${heading}: ${text.slice(0, 180)}` : text.slice(0, 220),
      organizationName: null,
      category: /TANF/i.test(`${heading ?? ""} ${text}`) ? "tribal_tanf" : /ICWA/i.test(`${heading ?? ""} ${text}`) ? "tribal_icwa" : "tribal_routing",
      phone: null,
      email: null,
      websiteUrl: paragraph.hyperlinks[0]?.target ?? null,
      address: null,
      eligibilitySummary: null,
      applyNotes: isRouting ? text : null,
      description: text,
      excerptForJurisdiction: `${heading ?? ""} ${text}`,
      payload: {
        parser_rule: "docx_structural_paragraph_v13",
        heading,
        style: paragraph.style,
        hyperlinks: paragraph.hyperlinks,
      },
    });
  }
  return out;
}

export function structuralCandidateSeeds(structure: DocxStructure): StructuralCandidateSeed[] {
  const out: StructuralCandidateSeed[] = [...paragraphSeeds(structure)];
  for (const table of structure.tables) {
    if (table.rows.length < 2) continue;
    const headers = table.rows[0].cells.map((cell) => cell.text);
    const kind = tableKind(headers);
    for (const row of table.rows.slice(1)) {
      const record = rowRecord(headers, row);
      const seed = tableRowSeed(table, kind, row, record);
      if (seed) out.push(seed);
    }
  }
  const seen = new Set<string>();
  return out.filter((seed) => {
    const key = `${seed.candidateType}|${seed.sourceLocator}|${seed.name}|${seed.websiteUrl ?? ""}|${seed.phone ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

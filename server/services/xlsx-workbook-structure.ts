import { posix } from "node:path";

/** Structural subset validation for worksheet/sheetData/row/c nesting and
 * completion, shared by both runtime readers. This is not full XML or OOXML
 * schema validation. Retain partial markup between chunks, not the worksheet. */
export function create_worksheet_validator(sheet_name: string) {
  let pending = "";
  const stack: string[] = [];
  let worksheet_count = 0;
  let sheet_data_count = 0;
  const fail = () => { throw new Error(`xlsx_invalid_worksheet_structure:${sheet_name}`); };
  const consume_chunk = (chunk: string) => {
    pending += chunk;
    let start = pending.indexOf("<");
    while (start >= 0) {
      const comment = pending.startsWith("<!--", start);
      const cdata = pending.startsWith("<![CDATA[", start);
      const processing_instruction = pending.startsWith("<?", start);
      const delimiter = comment ? "-->" : cdata ? "]]>" : processing_instruction ? "?>" : ">";
      const end = pending.indexOf(delimiter, start + 1);
      if (end < 0) { pending = pending.slice(start); return; }
      const tag = pending.slice(start, end + delimiter.length);
      pending = pending.slice(end + delimiter.length);
      if (!comment && !cdata && !processing_instruction) {
        const match = tag.match(/^<(\/)?(worksheet|sheetData|row|c)\b/);
        if (match) {
          const [, closing, name] = match;
          if (closing) {
            if (stack.pop() !== name) fail();
          } else {
            const parent = stack.at(-1);
            if (name === "worksheet") {
              if (parent || ++worksheet_count !== 1) fail();
            } else if (name === "sheetData") {
              if (parent !== "worksheet" || ++sheet_data_count !== 1) fail();
            } else if (name === "row" ? parent !== "sheetData" : parent !== "row") fail();
            if (!/\/\s*>$/.test(tag)) stack.push(name);
          }
        }
      }
      start = pending.indexOf("<");
    }
    pending = "";
  };
  return {
    consume_chunk,
    finish() {
      if (pending || stack.length || worksheet_count !== 1 || sheet_data_count !== 1) fail();
    },
  };
}

export function resolve_shared_string(raw: string, shared: string[]): string {
  const index = raw.trim();
  if (!/^\d+$/.test(index) || Number(index) >= shared.length) {
    throw new Error("xlsx_invalid_shared_string_reference");
  }
  return shared[Number(index)];
}

function decodeAttribute(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (entity, code: string) => {
    if (code.startsWith("#")) {
      const point = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
    }
    return ({ amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" } as Record<string, string>)[code] ?? entity;
  });
}

function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:.-]+)\s*=\s*(["'])([\s\S]*?)\2/g)) result[match[1]] = decodeAttribute(match[3]);
  return result;
}

/** OOXML attribute order is insignificant. Missing worksheet parts are errors,
 * never evidence that a successfully parsed workbook contains zero records. */
export function workbookSheets(workbookXml: string | undefined, relsXml: string | undefined): Array<{ name: string; path: string }> {
  if (!workbookXml || !relsXml) throw new Error("xlsx_workbook_metadata_missing");
  const relationships = new Map<string, Record<string, string>>();
  for (const match of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const attrs = attributes(match[0]);
    if (attrs.Id) relationships.set(attrs.Id, attrs);
  }
  const sheets: Array<{ name: string; path: string }> = [];
  for (const match of workbookXml.matchAll(/<sheet\b[^>]*>/g)) {
    const attrs = attributes(match[0]);
    const rel = relationships.get(attrs["r:id"]);
    if (!attrs.name || !rel?.Target) throw new Error(`xlsx_sheet_relationship_missing:${attrs.name ?? "unnamed"}`);
    if (rel.TargetMode === "External") throw new Error(`xlsx_external_sheet_target:${attrs.name}`);
    // Chartsheets are valid workbook parts but do not contain worksheet rows.
    if (rel.Type && !rel.Type.endsWith("/worksheet")) continue;
    const path = posix.normalize(rel.Target.startsWith("/") ? rel.Target.slice(1) : `xl/${rel.Target}`);
    if (!path.startsWith("xl/") || path.includes("\\")) throw new Error(`xlsx_invalid_sheet_target:${attrs.name}`);
    sheets.push({ name: attrs.name, path });
  }
  if (!sheets.length) throw new Error("xlsx_no_worksheets_resolved");
  return sheets;
}

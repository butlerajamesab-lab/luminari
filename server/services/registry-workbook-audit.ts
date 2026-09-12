import { createHash } from "node:crypto";
import JSZip from "jszip";
import { forEachXlsxRow as for_each_xlsx_row, workbookSheetRoute as workbook_sheet_route } from "./fresh-corpus-reconciliation-v1";
import { workbookSheets as workbook_sheets } from "./xlsx-workbook-structure";

/** Preserve all resolved worksheets, including those with no emitted rows. */
export async function audit_registry_workbook(source: Buffer) {
  const zip = await JSZip.loadAsync(source);
  const resolved_sheets = workbook_sheets(
    await zip.file("xl/workbook.xml")?.async("text"),
    await zip.file("xl/_rels/workbook.xml.rels")?.async("text"),
  );
  if (new Set(resolved_sheets.map(sheet => sheet.name)).size !== resolved_sheets.length) {
    throw new Error("xlsx_duplicate_worksheet_name");
  }
  const shared_xml = await zip.file("xl/sharedStrings.xml")?.async("text");
  const shared_count = shared_xml ? [...shared_xml.matchAll(/<si\b[^>]*>[\s\S]*?<\/si>/g)].length : 0;
  for (const sheet of resolved_sheets) {
    const xml = await zip.file(sheet.path)?.async("text");
    if (!xml) throw new Error(`xlsx_worksheet_part_missing:${sheet.name}`);
    // A missing/truncated part is unavailable, never an empty-sheet receipt.
    if (!/<worksheet\b[^>]*>/.test(xml) || !/<\/worksheet\s*>\s*$/.test(xml)
      || !/<sheetData\b(?:[^>]*\/\s*>|[^>]*>[\s\S]*?<\/sheetData\s*>)/.test(xml)) {
      throw new Error(`xlsx_invalid_worksheet_structure:${sheet.name}`);
    }
    for (const tag of ["row", "c"]) {
      const opened = [...xml.matchAll(new RegExp(`<${tag}\\b[^>]*>`, "g"))];
      const closed = [...xml.matchAll(new RegExp(`</${tag}\\s*>`, "g"))].length;
      if (opened.filter(match => !/\/\s*>$/.test(match[0])).length !== closed) {
        throw new Error(`xlsx_unclosed_worksheet_content:${sheet.name}`);
      }
    }
    for (const cell of xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      if (!/\bt\s*=\s*(["'])s\1/.test(cell[1])) continue;
      const index = cell[2].match(/<v\b[^>]*>\s*(\d+)\s*<\/v>/)?.[1];
      if (index === undefined || Number(index) >= shared_count) {
        throw new Error(`xlsx_invalid_shared_string_reference:${sheet.name}`);
      }
    }
  }
  const sheets = new Map(resolved_sheets.map(sheet => {
    const route = workbook_sheet_route(sheet.name);
    return [sheet.name, { total: 0, data: 0, header: 0, preamble: 0,
      target_surface: route.targetSurface, routing_state: route.routingState }];
  }));
  const count = await for_each_xlsx_row(source, row => {
    const counts = sheets.get(row.sheet);
    if (!counts) throw new Error(`xlsx_unresolved_audit_sheet:${row.sheet}`);
    counts.total += 1;
    counts[row.row_role] += 1;
  });
  return {
    source_sha256: createHash("sha256").update(source).digest("hex"),
    sheet_count: resolved_sheets.length,
    nonempty_rows: count,
    source_role: "preservation_audit",
    consumer_integration_verified: false,
    sheets: Object.fromEntries(sheets),
  };
}

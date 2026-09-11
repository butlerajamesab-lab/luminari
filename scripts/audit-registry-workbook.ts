import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { forEachXlsxRow, workbookSheetRoute } from "../server/services/fresh-corpus-reconciliation-v1";

// Read-only: no database connection or import is initiated by this command.
const [sourcePath, reportPath] = process.argv.slice(2);
if (!sourcePath || !reportPath) throw new Error("Usage: node --import tsx scripts/audit-registry-workbook.ts SOURCE.xlsx REPORT.json");
const source = await readFile(sourcePath);
const sheets = new Map<string, { total: number; data: number; header: number; preamble: number; target_surface: string; routing_state: string }>();
const count = await forEachXlsxRow(source, row => {
  const route = workbookSheetRoute(row.sheet);
  const counts = sheets.get(row.sheet) ?? { total: 0, data: 0, header: 0, preamble: 0, target_surface: route.targetSurface, routing_state: route.routingState };
  counts.total += 1;
  counts[row.row_role] += 1;
  sheets.set(row.sheet, counts);
});
const report = {
  source_sha256: createHash("sha256").update(source).digest("hex"),
  sheet_count: sheets.size,
  nonempty_rows: count,
  source_role: "preservation_audit",
  consumer_integration_verified: false,
  sheets: Object.fromEntries(sheets),
};
await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ source_sha256: report.source_sha256, sheet_count: report.sheet_count, nonempty_rows: count }));

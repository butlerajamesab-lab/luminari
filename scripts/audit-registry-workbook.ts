import { readFile, writeFile } from "node:fs/promises";
import { audit_registry_workbook } from "../server/services/registry-workbook-audit";

// Read-only: no database connection or import is initiated by this command.
const [source_path, report_path] = process.argv.slice(2);
if (!source_path || !report_path) throw new Error("Usage: node --import tsx scripts/audit-registry-workbook.ts SOURCE.xlsx REPORT.json");
const report = await audit_registry_workbook(await readFile(source_path));
await writeFile(report_path, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ source_sha256: report.source_sha256, sheet_count: report.sheet_count, nonempty_rows: report.nonempty_rows }));

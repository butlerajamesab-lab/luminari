import fs from "node:fs";

const path = "server/ingestion/atlas-stream-adapter.ts";
let source = fs.readFileSync(path, "utf8");
const before = `            recordsIngested: sql\`coalesce(records_ingested_dsr, 0) + \${records_inserted}\`,
            lastRecordsIngested: records_inserted,
            lastSignalsGenerated: records_inserted,`;
const after = `            recordsIngested: sql\`coalesce(records_ingested_dsr, 0) + \${records_inserted}\`,
            signalsGenerated: sql\`coalesce(signals_generated_dsr, 0) + \${records_inserted}\`,
            lastRecordsIngested: records_inserted,
            lastSignalsGenerated: records_inserted,`;

if (!source.includes(before)) {
  throw new Error("Atlas partial accounting patch marker not found");
}
if (source.includes("signalsGenerated: sql`coalesce(signals_generated_dsr, 0) + ${records_inserted}`")) {
  throw new Error("Atlas partial signal accounting already present");
}
source = source.replace(before, after);
fs.writeFileSync(path, source);

for (const temporary of [
  "scripts/fix-atlas-partial-signal-accounting.mjs",
  ".github/workflows/fix-atlas-partial-signal-accounting.yml",
]) {
  if (fs.existsSync(temporary)) fs.rmSync(temporary);
}

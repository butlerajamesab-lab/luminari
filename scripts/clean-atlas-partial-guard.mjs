import fs from "node:fs";

const schedulerPath = "server/ingestion/scheduler.ts";
let scheduler = fs.readFileSync(schedulerPath, "utf8");
const duplicate = `    const atlas_partial_failure = adapterSource === "atlas_stream" && result.recordsProcessed > 0 &&
      result.diagnostics?.outcomeClassification === "partial_failure";
    if (atlas_partial_failure) {
      console.warn(
        \`[Scheduler] Atlas bridge partially synchronized \${datasetId}: \${result.recordsProcessed} committed before failure\`,
      );
      return {
        success: false,
        recordsProcessed: result.recordsProcessed,
        recordsInserted: result.recordsInserted,
        recordsUpdated: result.recordsUpdated,
        signalsGenerated: result.signalsGenerated,
        errors: result.errors,
        runId: result.runId,
        diagnostics: result.diagnostics,
      };
    }

`;
if (!scheduler.includes(duplicate)) {
  throw new Error("Duplicate Atlas partial-result guard not found");
}
scheduler = scheduler.replace(duplicate, "");
fs.writeFileSync(schedulerPath, scheduler);

const testPath = "server/ingestion/__tests__/atlas-stream-partial-progress-contract.test.ts";
let test = fs.readFileSync(testPath, "utf8");
test = test.replace(
  `'adapterSource === "atlas_stream" && result.recordsProcessed > 0'`,
  `'adapterSource === "atlas_stream" && result.recordsProcessed > 0'`,
);
test = test.replace(
  `expect(scheduler_source).toContain(\n      'adapterSource === "atlas_stream" && result.recordsProcessed > 0',\n    );`,
  `expect(scheduler_source).toContain('const atlasPartialFailure =');\n    expect(scheduler_source).toContain(\n      'adapterSource === "atlas_stream" && result.recordsProcessed > 0',\n    );`,
);
fs.writeFileSync(testPath, test);

for (const temporary of [
  "scripts/clean-atlas-partial-guard.mjs",
  ".github/workflows/clean-atlas-partial-guard.yml",
]) {
  if (fs.existsSync(temporary)) fs.rmSync(temporary);
}

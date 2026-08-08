import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const processor = readFileSync(resolve(here, "batch-rerun.ts"), "utf8");
const alerting = readFileSync(resolve(here, "provenance-alerting.ts"), "utf8");

describe("automatic post-batch provenance governance", () => {
  it("runs threshold governance only after the batch has been persisted complete", () => {
    const completeIndex = processor.indexOf("await db.completeBatchRun(batchId)");
    const alertIndex = processor.indexOf("await runCompletedBatchAlertCheck(batchId)");
    expect(completeIndex).toBeGreaterThan(-1);
    expect(alertIndex).toBeGreaterThan(completeIndex);
  });

  it("does not run the completion alert hook on the user-abort path", () => {
    const abortBlockStart = processor.indexOf("if (isAborted(batchId))");
    const abortBlockEnd = processor.indexOf("const outcome = await processSingleFinding", abortBlockStart);
    const abortBlock = processor.slice(abortBlockStart, abortBlockEnd);
    expect(abortBlock).toContain("await db.abortBatchRun(batchId)");
    expect(abortBlock).not.toContain("runCompletedBatchAlertCheck");
  });

  it("keeps alert failure observational and never rewrites an already completed batch state", () => {
    expect(processor).toContain("Post-batch provenance threshold check failed");
    const helperStart = processor.indexOf("async function runCompletedBatchAlertCheck");
    const helperEnd = processor.indexOf("async function processBatch", helperStart);
    const helper = processor.slice(helperStart, helperEnd);
    expect(helper).not.toContain("failBatchRun");
    expect(helper).not.toContain("abortBatchRun");
  });

  it("binds automatically generated alert records to the completed batch ID", () => {
    expect(processor).toContain("checkProvenanceThresholds(undefined, batchId)");
    expect(alerting).toContain("batchId?: number");
    expect(alerting).toContain("...(batchId === undefined ? {} : { batchId })");
    expect(alerting).toContain("Completed batch: #${batchId}");
  });

  it("uses dynamic loading so notification governance is outside processor initialization", () => {
    expect(processor).toContain('await import("./provenance-alerting")');
    expect(processor).not.toContain('import { checkProvenanceThresholds } from "./provenance-alerting"');
  });
});

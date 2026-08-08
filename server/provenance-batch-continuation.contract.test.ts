import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const processor = readFileSync(resolve(here, "batch-rerun.ts"), "utf8");
const batchCompat = readFileSync(resolve(here, "provenance-batch-runtime-compat.ts"), "utf8");
const findingCompat = readFileSync(resolve(here, "provenance-batch-finding-compat.ts"), "utf8");
const provenanceCompat = readFileSync(resolve(here, "provenance-runtime-compat.ts"), "utf8");
const driftCompat = readFileSync(resolve(here, "provenance-drift-runtime-compat.ts"), "utf8");
const facade = readFileSync(resolve(here, "db.ts"), "utf8");

describe("provenance batch continuation contract", () => {
  it("does not fall back to the drifted Drizzle batch table for resume or fatal status", () => {
    expect(processor).toContain("await db.resumeBatchRun(batchId, resumedTotal)");
    expect(processor).toContain("await db.failBatchRun(batchId)");
    expect(processor).not.toContain('import("../drizzle/schema")');
    expect(processor).not.toContain("db.db.update(batchRerunRuns)");
  });

  it("persists processor failures through the live findings compatibility boundary", () => {
    expect(processor).toContain("await db.markFindingRerunError(findingId, batchId, message)");
    expect(processor).not.toContain("provenanceStatus: \"rerun_error\"");
    expect(findingCompat).toContain("provenance_status = 'rerun_error'");
    expect(findingCompat).toContain("provenance_attempted = 1");
    expect(findingCompat).toContain("JSON.stringify({ batchRerunId: batchId, error: errorMessage, errorAt: now })");
  });

  it("keeps rerun errors visible and eligible for recovery instead of dropping them from provenance state", () => {
    expect(provenanceCompat).toContain("'unsupported_synthesis', 'rerun_error'");
    expect(processor).toContain('f.provenanceStatus === "unsupported" || f.provenanceStatus === "rerun_error"');
    expect(driftCompat).toContain('status === "unsupported" || status === "rerun_error"');
  });

  it("keeps stillUnsupported equal to unresolved population rather than processed-minus-one drift", () => {
    expect(processor).toContain("const stillUnsupported = Math.max(totalFindings - resolvedCount - errorCount, 0)");
    expect(processor).not.toContain("findingIds.length + startProcessed - processedCount");
    expect(batchCompat).toContain("greatest(total_findings - resolved_count - error_count, 0)");
  });

  it("distinguishes abort, fatal error, resume, and completed terminal states", () => {
    expect(batchCompat).toContain("export async function resumeBatchRun");
    expect(batchCompat).toContain("status = 'running'");
    expect(batchCompat).toContain("export async function failBatchRun");
    expect(batchCompat).toContain("status = 'error'");
    expect(batchCompat).toContain("status = 'aborted'");
    expect(batchCompat).toContain("status = 'completed'");
  });

  it("validates matched claim IDs before writing the TEXT-backed claim_ids payload", () => {
    expect(processor).toContain("const matchedClaimIds = result.matchedIds.map(value => Number(value))");
    expect(processor).toContain("Number.isSafeInteger(value)");
    expect(processor).toContain("await db.updateFindingClaimIds(findingId, matchedClaimIds)");
  });

  it("routes finding detail and batch lifecycle helpers through explicit compatibility exports", () => {
    expect(facade).toContain('from "./provenance-batch-finding-compat"');
    expect(facade).toContain("getFindingMatchDetail");
    expect(facade).toContain("markFindingRerunError");
    expect(facade).toContain("resumeBatchRun");
    expect(facade).toContain("failBatchRun");
  });
});

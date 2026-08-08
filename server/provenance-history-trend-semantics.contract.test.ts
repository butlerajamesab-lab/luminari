import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const history = readFileSync(resolve(here, "../client/src/pages/ProvenanceHistory.tsx"), "utf8");

describe("provenance history trend semantics", () => {
  it("computes trend deltas from completed non-empty batches only", () => {
    expect(history).toContain('run.status === "completed"');
    expect(history).toContain("completedRuns.filter(run => run.totalFindings > 0)");
    expect(history).toContain("const comparisonPair = comparableRuns.slice(-2)");
    expect(history).toContain("if (comparisonPair.length === 2)");
  });

  it("does not substitute zero for an unavailable trend comparison", () => {
    expect(history).toContain("let resolveRateDelta: number | null = null");
    expect(history).toContain("let fallbackRateDelta: number | null = null");
    expect(history).toContain('trends.resolveRateDelta === null');
    expect(history).toContain('trends.fallbackRateDelta === null');
    expect(history).toContain(">N/A</p>");
  });

  it("explains N/A until two completed non-empty runs are comparable", () => {
    expect(history).toContain("comparableRuns: comparableRuns.length");
    expect(history).toContain("trends.comparableRuns < 2 && trends.totalRuns > 0");
    expect(history).toContain("At least two completed batch runs with nonzero finding populations are required");
  });

  it("keeps incomplete passes visible without using them as trend observations", () => {
    expect(history).toContain("All batch passes remain visible; trend deltas use completed, non-empty runs only.");
    expect(history).toContain("running, aborted, and errored passes are never substituted");
    expect(history).toContain("batchRuns.map((run)");
  });

  it("renders terminal time and missing denominator values without inventing zero measurements", () => {
    expect(history).toContain("const terminalAt = run.completedAt ?? run.abortedAt ?? null");
    expect(history).toContain('run.totalFindings > 0');
    expect(history).toContain(': "—";');
    expect(history).toContain("value === null || value === undefined");
  });

  it("surfaces completed-batch identity on automatic provenance alerts when present", () => {
    expect(history).toContain("const batchId = Number(m?.batchId)");
    expect(history).toContain('`#${batchId}` : "Manual / unspecified"');
    expect(history).toContain("No persisted provenance alert events");
    expect(history).toContain(">Not sent</Badge>");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");

describe("atomic finalization", () => {
  it("completes only after no source artifacts remain", () => {
    expect(service).toContain("if (!artifacts.length) { await finalizeRun(runId)");
    expect(service).toContain("completed_with_failures");
  });
});

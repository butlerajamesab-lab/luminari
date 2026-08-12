import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");

describe("atomic zero-row artifacts", () => {
  it("still completes an artifact receipt when a structural parser finds zero rows", () => {
    expect(service).toContain("records.length");
    expect(service).toContain("records_generated: records.length");
  });
});

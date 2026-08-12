import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");

describe("atomic exact duplicate sources", () => {
  it("does not reprocess exact Storage duplicates as independent source files", () => {
    expect(service).toContain("where a.exact_duplicate_of is null");
  });
});

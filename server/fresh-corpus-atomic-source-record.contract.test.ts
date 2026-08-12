import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const contract = readFileSync(new URL("../docs/FRESH_ATOMIC_CORPUS_CONTRACT.md", import.meta.url), "utf8");

describe("source record doctrine", () => {
  it("defines source occurrence and deduplicated record counts separately", () => {
    expect(contract).toContain("atomic_record_count");
    expect(contract).toContain("origin_count");
    expect(contract).toContain("source occurrences/provenance locations");
  });
});

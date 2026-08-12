import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const docs = readFileSync(new URL("../docs/FRESH_ATOMIC_CORPUS_CONTRACT.md", import.meta.url), "utf8");

describe("source occurrence accounting", () => {
  it("uses origin count for source occurrences, not public-resource count", () => {
    expect(docs).toContain("origin_count");
    expect(docs).toContain("source occurrences/provenance locations");
  });
});

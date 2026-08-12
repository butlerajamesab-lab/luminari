import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const contract = readFileSync(new URL("../docs/FRESH_ATOMIC_CORPUS_CONTRACT.md", import.meta.url), "utf8");

describe("source file/content distinction", () => {
  it("keeps artifact identity and atomic source records separate", () => {
    expect(contract).toContain("storage artifact != atomic source record");
  });
});

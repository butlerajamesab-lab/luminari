import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const contract = readFileSync(new URL("../docs/FRESH_ATOMIC_CORPUS_CONTRACT.md", import.meta.url), "utf8");

describe("atomic source unit definition", () => {
  it("does not equate data-point counts with canonical public identities", () => {
    expect(contract).toContain("Neither count is a count of unique public resources");
    expect(contract).toContain("Typed derivation and identity resolution remain separate governed operations");
  });
});

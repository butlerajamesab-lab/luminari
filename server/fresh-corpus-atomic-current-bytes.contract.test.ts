import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const contract = readFileSync(new URL("../docs/FRESH_ATOMIC_CORPUS_ACCEPTANCE.md", import.meta.url), "utf8");

describe("atomic current-byte authority", () => {
  it("uses historical populations only as coverage oracles", () => {
    expect(contract).toContain("current Storage bytes reproduce/explain the gap");
    expect(contract).toContain("historical 53k/56k resource-stage populations are used only as a coverage oracle");
  });
});

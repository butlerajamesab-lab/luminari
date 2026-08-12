import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");

describe("atomic relation bounds", () => {
  it("bounds SQL relation labels", () => {
    expect(service).toContain("slice(0, 300)");
  });
});

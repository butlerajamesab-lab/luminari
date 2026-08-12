import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");

describe("atomic source excerpts", () => {
  it("bounds retained raw excerpts while preserving full structured values", () => {
    expect(service).toContain("MAX_RAW_EXCERPT = 8_000");
    expect(service).toContain("values_json");
  });
});

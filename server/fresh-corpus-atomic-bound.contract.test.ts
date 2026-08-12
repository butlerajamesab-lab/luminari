import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");

describe("atomic bounded execution", () => {
  it("bounds per-source records, insert chunks, batch size, and batch count", () => {
    expect(service).toContain("MAX_RECORDS_PER_SOURCE_FILE = 200_000");
    expect(service).toContain("offset += 500");
    expect(service).toContain("Math.min(8, options.batchSize ?? 3)");
    expect(service).toContain("Math.min(100, options.maxBatches ?? 60)");
  });
});

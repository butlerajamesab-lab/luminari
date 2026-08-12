import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");

describe("atomic per-artifact ceiling", () => {
  it("prevents an accidental unbounded source expansion", () => {
    expect(service).toContain("MAX_RECORDS_PER_SOURCE_FILE = 200_000");
  });
});

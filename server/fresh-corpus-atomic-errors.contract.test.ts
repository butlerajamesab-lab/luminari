import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./services/fresh-corpus-atomic-v1.ts", import.meta.url), "utf8");

describe("atomic failure preservation", () => {
  it("marks artifact failure instead of silently dropping the source", () => {
    expect(service).toContain("set status='failed',error_message=$3");
    expect(service).toContain("attempt_count<2");
  });
});

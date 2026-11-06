import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(
  new URL("./services/resource-directory-fast-current.ts", import.meta.url),
  "utf8",
);

describe("Resource Directory summary timeout contract", () => {
  it("runs the classified-catalog summary under a bounded per-query timeout", () => {
    // The summary measures ~16 s against production; the pool default is 8 s.
    // It must go through the diagnostics helper with its own ceiling, not the
    // bare pool, or every cold Civic Map /coverage and /health call fails.
    expect(service).toContain("const SUMMARY_QUERY_TIMEOUT_MS = 45_000;");
    expect(service).toContain("query_with_diagnostics(`");
    expect(service).toContain('label: "resource_directory_summary"');
    expect(service).toContain("query_timeout_ms: SUMMARY_QUERY_TIMEOUT_MS");
  });
});

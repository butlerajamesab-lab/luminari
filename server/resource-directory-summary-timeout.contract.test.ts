import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(
  new URL("./services/resource-directory-fast-current.ts", import.meta.url),
  "utf8",
);

describe("Resource Directory classified-view query timeout contract", () => {
  it("uses the bounded diagnostic query wrapper for summary, search, and detail", () => {
    // The source view takes 13–16 seconds on cold reads. All classified
    // catalog queries share a reviewed 45-second query budget and a bounded
    // 15-second pool-acquisition budget; never fall back to the 8-second pool.
    expect(service).toContain("const DIRECTORY_VIEW_QUERY_TIMEOUT_MS = 45_000;");
    expect(service).toContain("const DIRECTORY_VIEW_POOL_ACQUIRE_TIMEOUT_MS = 15_000;");
    expect(service).toContain("return query_with_diagnostics<T>(text, values, {");
    expect(service).toContain("pool_acquire_timeout_ms: DIRECTORY_VIEW_POOL_ACQUIRE_TIMEOUT_MS");
    expect(service).toContain("query_timeout_ms: DIRECTORY_VIEW_QUERY_TIMEOUT_MS");
    expect(service).toContain("const result = await query_directory_view(");
    for (const label of [
      "resource_directory_summary",
      "resource_directory_search",
      "resource_directory_detail",
    ]) {
      expect(service).toContain('"' + label + '"');
    }
  });
});

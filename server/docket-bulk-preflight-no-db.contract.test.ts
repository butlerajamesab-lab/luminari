import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

describe("LegiScan bulk preflight does not initialize Lighthouse database runtime", () => {
  const runner = readFileSync("scripts/legiscan-bulk-docket-intake.ts", "utf8");
  it("imports all database and projection code only after the --apply gate", () => {
    expect(runner).toContain('const writer_modules = applying ? await Promise.all([');
    expect(runner).toContain('import("../server/db")');
    expect(runner).toContain('import("../server/civic-genome-projection")');
    expect(runner).toContain('import("../server/docket-bill-detail-acceptance")');
    expect(runner).not.toMatch(/^import \{[^}]*query_with_diagnostics.*from "\.\.\/server\/db";/m);
  });
  it("preserves exact-manifest approval and negative archive holds", () => {
    expect(runner).toContain("DOCKET_BULK_ARCHIVE_APPLY_APPROVED_SHA256");
    expect(runner).toContain('if (!applying) continue;');
    expect(runner).toContain("if (result.totals.held > 0) process.exitCode = 1");
  });
});

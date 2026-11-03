import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

describe("LegiScan bulk preflight does not initialize Lighthouse database runtime", () => {
  const runner = readFileSync("scripts/legiscan-bulk-docket-intake.ts", "utf8");

  it("loads only canonical Docket acceptance after the exact --apply approval gate", () => {
    const approvalGate = runner.indexOf("if (applying) {");
    const lateLoader = runner.indexOf("const writer_modules = applying ? await Promise.all([");

    expect(approvalGate).toBeGreaterThan(-1);
    expect(lateLoader).toBeGreaterThan(approvalGate);
    expect(runner).toContain('import("../server/docket-bill-detail-acceptance")');

    // Archive transport must not directly execute an alternative database,
    // Civic Genome projection, or legislative-version registration pathway.
    expect(runner).not.toContain('import("../server/db")');
    expect(runner).not.toContain('import("../server/civic-genome-projection")');
    expect(runner).not.toContain("project_docket_bulk_bill_to_civic_genome(");
    expect(runner).not.toContain("register_docket_legislative_version_spine(");
    expect(runner).not.toMatch(/^import .*from "\.\.\/server\/(?:db|civic-genome-projection)";/m);
  });

  it("preserves exact-manifest approval and negative archive holds", () => {
    expect(runner).toContain("DOCKET_BULK_ARCHIVE_APPLY_APPROVED_SHA256");
    expect(runner).toContain("--acknowledge-docket-triggers");
    expect(runner).toContain('if (!applying) continue;');
    expect(runner).toContain("if (result.totals.held > 0) process.exitCode = 1");
  });
});

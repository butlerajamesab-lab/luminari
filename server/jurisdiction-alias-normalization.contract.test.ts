import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf-8");
}

describe("Jurisdiction alias normalization", () => {
  const service = source("server/services/resource-directory-fast-current.ts");

  it("normalizes the nonstandard USVI code to canonical VI at the read layer", () => {
    expect(service).toContain("JURISDICTION_CODE_SQL");
    expect(service).toContain("when 'USVI' then 'VI'");
  });

  it("applies the same normalization to summary counts, filters, search, and row display", () => {
    // The summary aggregation groups on the normalized code…
    expect(service).toContain("jurisdiction_code");
    // …and the row mapper normalizes both state and jurisdiction fields.
    expect(service).toContain('row.state_code === "USVI" ? "VI"');
    expect(service).toContain('row.jurisdiction === "USVI" ? "VI"');
  });
});

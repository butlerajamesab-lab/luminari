import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "client/src/pages/CivicGenome.tsx"),
  "utf8",
);

describe("Civic Genome standalone service links", () => {
  it("renders only declared external contract URLs as safe links", () => {
    expect(source).toContain("external_url: string | null");
    expect(source).toContain("contract.external_url &&");
    expect(source).toContain("href={contract.external_url}");
    expect(source).toContain('target="_blank"');
    expect(source).toContain('rel="noopener noreferrer"');
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });

  it("does not fabricate missing upstream contract entries or zero counts", () => {
    expect(source).toContain("missing_contract_keys");
    expect(source).toContain("Their status and counts are unobserved, not zero.");
    expect(source).toContain("operating_contracts.data?.contracts");
    expect(source).not.toContain("explicit_empty_contracts");
    expect(source).not.toContain("const returned_keys");
  });
});

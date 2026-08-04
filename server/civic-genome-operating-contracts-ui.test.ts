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

  it("keeps explicit empty contracts external-link free", () => {
    const fallback_section = source.slice(
      source.indexOf("const explicit_empty_contracts"),
      source.indexOf("const returned_keys"),
    );
    expect(fallback_section).toContain('service_key: "atlas"');
    expect(fallback_section).toContain('service_key: "prism"');
    expect(fallback_section).toContain('service_key: "viewfinder"');
    expect(fallback_section).toContain('service_key: "kaleidoscope"');
    expect(fallback_section.match(/external_url: null/g)).toHaveLength(4);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./civic-genome-rosetta-generation-upgrade-worker.ts", import.meta.url),
  "utf8",
);

describe("Rosetta generation identity resolution", () => {
  it("requires source version but permits a missing Lighthouse content hash", () => {
    expect(source).toContain("if (!candidate.source_version)");
    expect(source).not.toContain("if (!candidate.source_content_hash || !candidate.source_version)");
    expect(source).toContain("source_version: `eq.${candidate.source_version}`");
  });

  it("retains content-hash matching whenever Lighthouse has the hash", () => {
    expect(source).toContain("if (candidate.source_content_hash)");
    expect(source).toContain("query_params.source_content_hash = `eq.${candidate.source_content_hash}`");
  });

  it("retains the exact-one-row fail-closed identity gate", () => {
    expect(source).toContain("rows.length !== 1");
    expect(source).toContain("rosetta_upgrade_source_identity_not_unique");
  });
});

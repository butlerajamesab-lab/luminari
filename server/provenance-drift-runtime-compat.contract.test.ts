import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const compat = readFileSync(resolve(here, "provenance-drift-runtime-compat.ts"), "utf8");
const legacy = readFileSync(resolve(here, "db-legacy.ts"), "utf8");
const facade = readFileSync(resolve(here, "db.ts"), "utf8");

describe("provenance drift metrics on live Postgres", () => {
  it("replaces the historical MySQL JSON_LENGTH path with explicit JSON-text parsing", () => {
    expect(legacy).toContain("JSON_LENGTH(claimIds)");
    expect(compat).toContain("JSON.parse(value)");
    expect(compat).toContain("claim_id_count(row.claim_ids)");
    expect(compat).not.toContain("JSON_LENGTH");
  });

  it("does not report an empty finding population as 100 percent provenance coverage", () => {
    expect(compat).toContain('total === 0\n    ? "not_evaluated"');
    expect(compat).toContain("provenanceCoverage: total > 0");
    expect(compat).toContain(": null,");
    expect(compat).toContain("unsupportedRate: total > 0");
  });

  it("surfaces malformed claim-id persistence as incomplete instead of averaging it as zero", () => {
    expect(compat).toContain('claimIdParseFailures > 0\n      ? "incomplete"');
    expect(compat).toContain("avgClaimsPerFinding: linked === 0 || claimIdParseFailures > 0");
    expect(compat).toContain("claimIdParseFailures,");
  });

  it("does not invent fallback or processing measurements owned by runtime queue state", () => {
    expect(compat).toContain("fallbackMatcherHitRate: null");
    expect(compat).toContain("avgProcessingTimeMs: null");
    expect(compat).toContain("Runtime fallback/processing counters are supplied by the router");
  });

  it("routes the existing provenance drift endpoint through the compatibility implementation", () => {
    expect(facade).toContain('getProvenanceDriftMetrics } from "./provenance-drift-runtime-compat"');
  });
});

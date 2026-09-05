import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf-8");
}

describe("Did You Know fact-shape gate", () => {
  const service = source("server/services/current-discovery-facts.ts");

  it("classifies every row as discovery fact or resource listing by content shape", () => {
    expect(service).toContain("discovery_fact");
    expect(service).toContain("resource_listing");
    expect(service).toContain("fact_kind");
  });

  it("the claim signal is deterministic content, not judgment", () => {
    expect(service).toContain("claimSignalSql");
    // Amounts, percentages, bounded durations, and eligibility/right verbs.
    expect(service).toMatch(/\\\$\[0-9\]/);
    expect(service).toContain("eligible");
    expect(service).toContain("deadline");
  });

  it("orders the feed facts-first and rotates the daily spotlight through facts only", () => {
    expect(service).toContain("factPool");
    expect(service).toContain("dailyPool");
    expect(service).toContain('item.fact_kind === "discovery_fact"');
  });

  it("reports the fact/listing split honestly in the summary", () => {
    expect(service).toContain("discovery_facts");
    expect(service).toContain("resource_listings");
  });
});

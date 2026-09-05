import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf-8");
}

describe("Civic Map government-office pin wire", () => {
  const service = source("server/services/resource-directory.ts");
  const router = source("server/routes/civic-map-router.ts");

  it("admits official government-office coordinates into the exact-site points query", () => {
    expect(service).toContain("gov_office_sites");
    expect(service).toContain("public.gov_offices");
    expect(service).toContain("g.superseded_by is null");
    expect(service).toContain("g.lat is not null");
    expect(service).toContain("g.lng is not null");
    // The reviewed v3_13 lane remains the first arm — nothing was displaced.
    expect(service).toContain("l.manual_map_eligible is true");
    expect(service).toContain("reviewed_sites");
  });

  it("keeps the two provenance lanes distinguishable in the point source label", () => {
    expect(router).toContain("reviewed_v3_13_exact_public_sites");
    expect(router).toContain("gov_offices_official_coordinates");
  });

  it("accepts hash-derived gof_ office identities on the detail endpoint", () => {
    expect(router).toContain("isGovOfficeId");
    expect(router).toContain("getGovOfficeDetail");
    expect(service).toContain("getGovOfficeDetail");
  });

  it("reports government-office exact sites as their own counter", () => {
    expect(router).toContain("gov_office_exact_sites");
    expect(service).toContain("getGovOfficeExactSiteCount");
  });
});

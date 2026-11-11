import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf-8");
}

// U3 cutover (2026-11-10): government offices no longer reach the map
// through a locator-table lane. The U2 projection made them catalog
// entities, and pins are catalog locations — one lane, one system, per
// Alexander's unification ruling. This contract replaces the two-lane
// gov-office pin contract that preceded it.
describe("Civic Map unified catalog pins", () => {
  const service = source("server/services/resource-directory-unified.ts");
  const router = source("server/routes/civic-map-router.ts");

  it("serves exact-site points from catalog entities and their stored locations", () => {
    expect(service).toContain("public.luminari_resource_entities");
    expect(service).toContain("public.luminari_resource_locations");
    expect(service).toContain("l.latitude is not null");
    expect(service).toContain("l.longitude is not null");
  });

  it("does not read the gov_offices locator table as a map lane", () => {
    const points_sql = service.slice(
      service.indexOf("build_unified_map_points_sql"),
    );
    expect(points_sql).not.toContain("public.gov_offices");
    expect(service).not.toContain("gov_office_sites");
    expect(service).not.toContain("reviewed_sites");
  });

  it("labels the points source as the unified catalog", () => {
    expect(router).toContain("unified_catalog_exact_sites");
    expect(router).toContain("get_unified_catalog_map_points");
  });

  it("accepts hash-derived gof_ office identities on the detail endpoint and resolves them in the catalog", () => {
    expect(router).toContain("isGovOfficeId");
    expect(router).toContain("get_unified_catalog_detail");
    expect(service).toContain("canonical_id = $1");
  });

  it("governs pins with the category filter", () => {
    expect(router).toContain("parseCategory");
    expect(service).toContain("e.resource_category = $5");
    expect(service).toContain("$5 = any(coalesce(e.service_categories");
  });
});

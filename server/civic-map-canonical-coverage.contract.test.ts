import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

// U3 cutover (2026-11-10): Civic Map coverage is the unified catalog
// summary — the same corpus the directory searches — so the panel's
// record total, category counts, and site counts reconcile by
// construction instead of being stitched from three divergent reads
// (21,647 view records vs 59,617 locator pins vs ~63 reviewed counts).
describe("Civic Map unified coverage contract", () => {
  const router = read("./routes/civic-map-router.ts");
  const service = read("./services/resource-directory-unified.ts");

  it("uses the unified catalog summary for jurisdiction coverage", () => {
    expect(router).toContain("get_unified_catalog_summary");
    expect(router).toContain("unified_catalog_v1");
    expect(router).not.toContain("get_publishable_resource_directory_summary");
  });

  it("derives site counts from catalog locations, not a separate reviewed projection", () => {
    expect(service).toContain("public.luminari_resource_locations");
    expect(service).toContain("exact_mappable_resources");
    expect(router).not.toContain("v_luminari_resource_locations_current_v3_13");
    expect(router).not.toContain("getReviewedMapSiteCounts");
    expect(router).not.toContain("getGovOfficeExactSiteCount");
  });

  it("does not turn source-attached addresses into asserted map coordinates", () => {
    expect(router).toContain("get_unified_catalog_map_points");
    expect(router).toContain("unified_catalog_exact_sites");
    expect(router.toLowerCase()).not.toContain("geocode");
    expect(service).toContain("l.latitude is not null");
    expect(service).toContain("l.longitude is not null");
  });
});

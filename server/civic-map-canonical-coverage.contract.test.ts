import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("Civic Map canonical coverage contract", () => {
  const router = read("./routes/civic-map-router.ts");

  it("uses whole-corpus breadth for jurisdiction coverage", () => {
    expect(router).toContain("getPublishableResourceDirectorySummary");
    expect(router).toContain("breadth_preserving_resource_directory_v3");
    expect(router).not.toContain("getResourceDirectorySummary as getStrictGeographySummary");
  });

  it("keeps exact physical-site counts as a separate reviewed geography projection", () => {
    expect(router).toContain("v_luminari_resource_locations_current_v3_13");
    expect(router).toContain("manual_map_eligible is true");
    expect(router).toContain("latitude is not null");
    expect(router).toContain("longitude is not null");
  });

  it("does not turn source-attached addresses into asserted map coordinates", () => {
    expect(router).toContain("getResourceDirectoryMapPoints");
    expect(router).toContain("reviewed_v3_13_exact_public_sites");
    expect(router).not.toContain("geocode");
  });
});
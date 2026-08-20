import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("Architecture Map current substrate", () => {
  it("reads the governed current-object snapshot without merging it into seed-layer totals", () => {
    const router = read("server/routers/architecture-map.ts");

    expect(router).toContain("get_lighthouse_civic_object_snapshot_v1");
    expect(router).toContain("currentSubstratePromise");
    expect(router).toContain("currentSubstrate,");
    expect(router).toContain("separate from the eight governed seed layers");
    expect(router).toContain("const totalRecords = layers.reduce");
  });

  it("shows live routing separately and links to the correct operating surfaces", () => {
    const page = read("client/src/pages/ArchitectureMap.tsx");

    expect(page).toContain("Current Node Substrate");
    expect(page).toContain("do not inflate the governed legal seed layers");
    expect(page).toContain("currentSubstrate.objectClasses");
    expect(page).not.toContain('navigate("/civic-legal-explorer")');
    expect(page).toContain('typed_corpus: "/architecture-map"');
    expect(page).toContain('navigate("/resources")');
    expect(page).toContain('navigate("/viewfinder")');
    expect(page).toContain("TARGET_SURFACE_ROUTES");
    expect(page).toContain("targetSurfaceRoute(row.targetSurface)");
  });

  it("routes case law to the Legal Library instead of the Doctrine Graph", () => {
    const page = read("client/src/pages/ArchitectureMap.tsx");
    expect(page).toContain('case_law: "/legal-library"');
    expect(page).not.toContain('case_law: "/doctrine-graph"');
  });
});

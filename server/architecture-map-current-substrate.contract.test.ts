import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("Architecture Map current substrate", () => {
  it("reads the governed current-object snapshot without merging it into seed-layer totals", () => {
    const router = read("server/routers/architecture-map.ts");

    expect(router).toContain("get_lighthouse_civic_object_snapshot_v1");
    expect(router).toContain("current_substrate_promise");
    expect(router).toContain("current_substrate,");
    expect(router).toContain("separate from the eight governed seed layers");
    expect(router).toContain("const total_records = layers.reduce");
  });

  it("shows live routing separately and links to the correct operating surfaces", () => {
    const page = read("client/src/pages/ArchitectureMap.tsx");

    expect(page).toContain("Current Node Substrate");
    expect(page).toContain("do not inflate the governed legal seed layers");
    expect(page).toContain("current_substrate.object_classes");
    expect(page).not.toContain('navigate("/civic-legal-explorer")');
    expect(page).toContain("CurrentCorpusConnections");
    expect(page).toContain('navigate("/resources")');
    expect(page).toContain('navigate("/viewfinder")');
    expect(page).toContain("current_object_inspection_route");
    expect(page).toContain("current_object_inspection_route(row.object_class)");
  });

  it("routes case law to the Legal Library instead of the Doctrine Graph", () => {
    const page = read("shared/architecture-routes.ts");
    expect(page).toContain('case_law: "/legal-library"');
    expect(page).not.toContain('case_law: "/doctrine-graph"');
  });
});

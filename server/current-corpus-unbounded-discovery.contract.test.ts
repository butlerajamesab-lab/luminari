import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("current corpus discovery is not semantically capped", () => {
  it("separates transport windows from the canonical graph universe", () => {
    const router = source("server/routers/canonical-core-router.ts");
    const reader = source("server/services/current-corpus-page-reader.ts");

    expect(router).toContain("graphNodePage");
    expect(router).toContain("graphEdgePage");
    expect(router).toContain("unresolvedRelationshipPage");
    expect(router).toContain("total");
    expect(router).toContain("window_only: true");
    expect(router).toContain("must never be interpreted");

    expect(reader).toContain("count(*) over()::int as filtered_total");
    expect(reader).toContain("window_only: true");
    expect(reader).toContain("v_lighthouse_graph_nodes_v1");
    expect(reader).toContain("v_lighthouse_graph_edges_v2");
  });

  it("keeps the complete current legal-authority universe reachable", () => {
    const router = source("server/routers/canonical-core-router.ts");

    expect(router).toContain("legalAuthorities");
    expect(router).toContain("v_lighthouse_legal_authority_catalog_v2");
    expect(router).toContain("count(*) over()::int as filtered_total");
    expect(router).toContain("complete filtered universe");
    expect(router).not.toContain("not trying to render thousands of graph");
  });
});

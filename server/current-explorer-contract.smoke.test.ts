import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const router = readFileSync("server/routers/canonical-core-router.ts", "utf8");

describe("current explorer contract smoke", () => {
  it("exposes whole-universe legal and graph readers", () => {
    for (const name of ["legalAuthorities", "graph_node_page", "graph_edge_page", "unresolved_relationship_page", "currentObjectCounts"]) {
      expect(router).toContain(name);
    }
  });
});

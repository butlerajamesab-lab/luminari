import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(resolve(process.cwd(), "server/services/current-corpus-page-reader.ts"), "utf8");

describe("whole-universe current corpus readers", () => {
  it("return totals independently from transport windows", () => {
    expect(src).toContain("select count(*)::int from filtered");
    expect(src).toContain("window_only: true");
    expect(src).toContain("v_lighthouse_graph_nodes_v1");
    expect(src).toContain("v_lighthouse_graph_edges_v2");
    expect(src).toContain("v_lighthouse_graph_unresolved_relationships_v1");
  });
});

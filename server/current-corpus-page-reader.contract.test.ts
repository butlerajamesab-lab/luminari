import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(resolve(process.cwd(), "server/services/current-corpus-page-reader.ts"), "utf8");

describe("whole-universe current corpus readers", () => {
  it("return totals independently from transport windows", () => {
    expect(src.match(/count\(\*\) over\(\)::int as filtered_total/g)?.length).toBe(3);
    expect(src.match(/window_only: true/g)?.length).toBe(3);
    expect(src).toContain("v_lighthouse_graph_nodes_v1");
    expect(src).toContain("v_lighthouse_graph_edges_v2");
    expect(src).toContain("v_lighthouse_graph_unresolved_relationships_v1");
  });
});

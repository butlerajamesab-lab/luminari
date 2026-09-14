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

    expect(router).toContain("graph_node_page");
    expect(router).toContain("graph_edge_page");
    expect(router).toContain("unresolved_relationship_page");
    expect(router).toContain("total");
    expect(router).toContain("read_current_graph_node_page(input ?? {})");
    expect(router).toContain("read_current_graph_edge_page(input ?? {})");
    expect(router).toContain("read_current_unresolved_relationship_page(input ?? {})");
    expect(router).toContain("must never be interpreted");

    expect(reader).toContain("select count(*)::int from filtered");
    expect(reader).toContain("window_only: true");
    expect(reader).toContain("v_lighthouse_graph_nodes_v1");
    expect(reader).toContain("v_lighthouse_graph_edges_v2");
  });

  it("keeps the complete current legal-authority universe reachable", () => {
    const router = source("server/routers/canonical-core-router.ts");
    const reader = source("server/services/current-legal-authority-reader.ts");

    expect(router).toContain("legalAuthorities");
    expect(router).toContain('from "../services/current-legal-authority-reader"');
    expect(router).toContain("read_current_legal_authorities(input)");
    expect(reader).toContain("v_lighthouse_legal_authority_catalog_v2");
    expect(reader).toContain("count(*) filter (where legal_catalog_ready is true)::int as filtered_total");
    expect(reader).toContain("total: count(row.filtered_total)");
    expect(reader).toContain("window_only: true");
    expect(reader).toContain("limit $${params.length - 1} offset $${params.length}");
    expect(router).toContain("complete filtered universe");
    expect(router).not.toContain("not trying to render thousands of graph");
  });
});

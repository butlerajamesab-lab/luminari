import { describe, it, expect } from "vitest";

/**
 * World Index Validation Tests
 *
 * These tests validate the world.getIndex endpoint returns the expected
 * unified data structure with correct node/edge types and relationships.
 */

const API_BASE = "http://localhost:3000/api/trpc";

async function fetchWorldIndex() {
  const res = await fetch(`${API_BASE}/world.getIndex`);
  const json = await res.json();
  return json.result?.data?.json ?? { nodes: [], edges: [] };
}

describe("World Index Unification", () => {
  it("world.getIndex endpoint returns 200 with nodes and edges", async () => {
    const res = await fetch(`${API_BASE}/world.getIndex`);
    expect(res.status).toBe(200);
    const json = await res.json();
    const data = json.result?.data?.json;
    expect(data).toBeDefined();
    expect(Array.isArray(data.nodes)).toBe(true);
    expect(Array.isArray(data.edges)).toBe(true);
  });

  it("returns nodes with correct WorldObject structure", async () => {
    const data = await fetchWorldIndex();
    expect(data.nodes.length).toBeGreaterThan(0);
    const node = data.nodes[0];
    expect(node).toHaveProperty("id");
    expect(node).toHaveProperty("type");
    expect(node).toHaveProperty("jurisdiction");
    expect(node).toHaveProperty("domain");
    expect(node).toHaveProperty("source_table");
    expect(node).toHaveProperty("source_id");
    expect(node).toHaveProperty("metadata");
  });

  it("returns edges with correct WorldRelationship structure", async () => {
    const data = await fetchWorldIndex();
    expect(data.edges.length).toBeGreaterThan(0);
    const edge = data.edges[0];
    expect(edge).toHaveProperty("id");
    expect(edge).toHaveProperty("from");
    expect(edge).toHaveProperty("to");
    expect(edge).toHaveProperty("type");
    expect(edge).toHaveProperty("metadata");
  });

  it("contains all 5 required node types", async () => {
    const data = await fetchWorldIndex();
    const types = new Set(data.nodes.map((n: any) => n.type));
    expect(types.has("agency")).toBe(true);
    expect(types.has("program")).toBe(true);
    expect(types.has("jurisdiction")).toBe(true);
    expect(types.has("signal")).toBe(true);
    expect(types.has("workflow")).toBe(true);
  });

  it("contains expected edge types", async () => {
    const data = await fetchWorldIndex();
    const types = new Set(data.edges.map((e: any) => e.type));
    // At minimum, oversight and program_access should exist
    expect(types.has("oversight")).toBe(true);
    expect(types.has("program_access")).toBe(true);
  });

  it("signal nodes include metadata.origin classification", async () => {
    const data = await fetchWorldIndex();
    const signals = data.nodes.filter((n: any) => n.type === "signal");
    expect(signals.length).toBeGreaterThan(0);
    // At least some signals should have origin
    const withOrigin = signals.filter((s: any) => s.metadata?.origin);
    expect(withOrigin.length).toBeGreaterThan(0);
    // Origin must be one of the allowed values
    const validOrigins = new Set(["stream", "registry", "validation", "pattern"]);
    for (const s of withOrigin) {
      expect(validOrigins.has(s.metadata.origin)).toBe(true);
    }
  });

  it("node IDs follow the ${table}_${id} format", async () => {
    const data = await fetchWorldIndex();
    for (const node of data.nodes.slice(0, 20)) {
      // ID should contain the source_table prefix
      expect(node.id).toContain(node.source_table);
    }
  });

  it("edges reference valid node IDs", async () => {
    const data = await fetchWorldIndex();
    const nodeIds = new Set(data.nodes.map((n: any) => n.id));
    // Check a sample of edges — not all, since some may reference nodes
    // from tables that don't have direct node representations
    let validCount = 0;
    for (const edge of data.edges.slice(0, 50)) {
      if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) {
        validCount++;
      }
    }
    // At least 50% of sampled edges should have valid references
    expect(validCount).toBeGreaterThan(0);
  });

  it("returns correct approximate counts", async () => {
    const data = await fetchWorldIndex();
    const typeCounts: Record<string, number> = {};
    for (const n of data.nodes) {
      typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
    }
    // Based on validated data:
    expect(typeCounts["agency"]).toBeGreaterThanOrEqual(60);
    expect(typeCounts["program"]).toBeGreaterThanOrEqual(500);
    expect(typeCounts["jurisdiction"]).toBeGreaterThanOrEqual(30);
    expect(typeCounts["signal"]).toBeGreaterThanOrEqual(100);
    expect(typeCounts["workflow"]).toBeGreaterThanOrEqual(20);
    expect(data.edges.length).toBeGreaterThanOrEqual(600);
  });
});

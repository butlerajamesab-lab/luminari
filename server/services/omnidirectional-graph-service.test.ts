import { describe, expect, it } from "vitest";

import {
  computeActionFeasibility,
  fingerprintTraversal,
  type OmnidirectionalTraversalRow,
} from "./omnidirectional-graph-service";

describe("omnidirectional graph service", () => {
  it("computes deterministic bounded action feasibility", () => {
    expect(
      computeActionFeasibility({
        evidence_completeness: 1,
        deadline_slack: 0.8,
        authority_strength: 0.9,
        route_availability: 1,
      }),
    ).toBe(0.925);
  });

  it("rejects out-of-range feasibility inputs", () => {
    expect(() =>
      computeActionFeasibility({
        evidence_completeness: 1.1,
        deadline_slack: 1,
        authority_strength: 1,
        route_availability: 1,
      }),
    ).toThrow();
  });

  it("fingerprints traversal independently of database row order", () => {
    const rows: OmnidirectionalTraversalRow[] = [
      {
        node_id: "00000000-0000-0000-0000-000000000002",
        node_type: "statute",
        depth: 1,
        path_node_ids: [
          "00000000-0000-0000-0000-000000000001",
          "00000000-0000-0000-0000-000000000002",
        ],
        path_edge_ids: ["00000000-0000-0000-0000-000000000010"],
        path_score: "23.00000",
        result_hash: "path-b",
      },
      {
        node_id: "00000000-0000-0000-0000-000000000001",
        node_type: "claim",
        depth: 0,
        path_node_ids: ["00000000-0000-0000-0000-000000000001"],
        path_edge_ids: [],
        path_score: "9.00000",
        result_hash: "path-a",
      },
    ];

    expect(fingerprintTraversal(rows)).toBe(fingerprintTraversal([...rows].reverse()));
  });
});

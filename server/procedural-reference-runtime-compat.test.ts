import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  map_deadline_rule,
  map_jurisdiction,
  map_node_timeline,
  map_workflow,
  map_workflow_step,
} from "./procedural-reference-runtime-compat";

describe("procedural reference live-schema mapping", () => {
  it("maps jurisdiction snake_case fields to the established UI contract", () => {
    expect(map_jurisdiction({
      id: 1,
      name: "Washington",
      jurisdiction_type: "state",
      parent_id: null,
      level: 1,
      jurisdiction_status: "active",
      preemption_rules: '["federal"]',
    })).toMatchObject({ id: 1, name: "Washington", type: "state", status: "active", preemptionRules: ["federal"] });
  });

  it("maps node, workflow, step, and deadline physical columns explicitly", () => {
    expect(map_node_timeline({ id: 2, node_id: "n", node_timeline_type: "statute", title: "Node" }))
      .toMatchObject({ id: 2, nodeId: "n", nodeType: "statute", title: "Node" });
    expect(map_workflow({ id: 3, title: "Route", issue_types: '["appeal"]', workflow_status: "active", evidence_profile_id: "EP-1" }))
      .toMatchObject({ id: 3, issueTypes: ["appeal"], status: "active", evidenceProfileId: "EP-1" });
    expect(map_workflow_step({ id: 4, workflow_id: 3, step_number: 2, action_type: "file", action_description: "File" }))
      .toMatchObject({ id: 4, workflowId: 3, order: 2, type: "file", stepType: "file", title: "File" });
    expect(map_deadline_rule({ id: 5, workflow_id: 3, time_limit_days: 30, tolling_possible: 0 }))
      .toMatchObject({ id: 5, workflowId: 3, timeLimitDays: 30, tollingPossible: false });
  });

  it("enforces ownership before every case-scoped procedural read", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./routers/procedural-engine.ts", import.meta.url)),
      "utf8",
    );
    const caseReadNames = [
      "getCaseViability",
      "getCaseContradictions",
      "getCaseElementStrength",
      "getCaseEvidenceRecords",
      "getCaseWeakJointHits",
      "getCaseFactClaims",
      "getCaseDetectionResults",
    ];
    for (const name of caseReadNames) {
      const start = source.indexOf(`${name}: protectedProcedure`);
      expect(start, name).toBeGreaterThan(-1);
      const next = source.indexOf("\n  getCase", start + name.length);
      const block = source.slice(start, next === -1 ? source.length : next);
      expect(block, name).toContain("verifyCaseOwnership(input.caseId, ctx.user.id)");
    }
  });

  it("renders absent timeline storage as unavailable rather than completed zero", () => {
    const client = readFileSync(
      fileURLToPath(new URL("../client/src/pages/CommandBoard.tsx", import.meta.url)),
      "utf8",
    );

    expect(client).toContain(
      'stats.data?.availability.timelineEvents === "table_unavailable"',
    );
    expect(client).toContain(
      'stats.data?.availability.timelineEdges === "table_unavailable"',
    );
    expect(client).toContain("Timeline event storage is not established.");
    expect(client).toContain("Timeline-edge storage is not established.");
  });
});

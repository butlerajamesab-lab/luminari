import { describe, expect, it } from "vitest";
import { buildPrismProblemObservation, type LighthouseProblemInstanceRow } from "./prism-problem-intake-client";

function row(overrides: Partial<LighthouseProblemInstanceRow> = {}): LighthouseProblemInstanceRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    record_id: "PI-TEST",
    problem_type: "DENIAL",
    jurisdiction: "Washington",
    system_primary: "Housing",
    risk_level: "RED",
    friction: { coefficient: 0.72 },
    alignment: { micro: 0.5 },
    findings: [],
    resolution_pathways: [],
    evidence: [],
    grounding_entities: [],
    actions: [],
    feedback_history: [],
    traceability: JSON.stringify({
      created_at: "2026-04-09T22:53:10.000Z",
      updated_at: "2026-04-10T01:17:28.000Z",
      validation_status: "VALIDATED",
      source_refs: ["source-c", "source-a", "source-b"],
    }),
    coordination: JSON.stringify({
      systems_involved: [],
      dependencies: [],
      conflicts: [],
      blocking_entities: [],
      jurisdiction_context: { level: "state", name: "Washington", overrides: [], depends_on: [] },
      cross_jurisdiction: { present: false, jurisdictions_involved: [] },
    }),
    intake_ready: true,
    recommended_next_action: null,
    created_at: "2026-04-09T22:53:10.000Z",
    updated_at: "2026-04-10T01:17:28.000Z",
    ...overrides,
  };
}

describe("Lighthouse to Prism problem projection", () => {
  it("binds the complete Lighthouse snapshot while preserving upstream source refs", () => {
    const built = buildPrismProblemObservation(row());
    expect(built.source_snapshot_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(built.observation.source_validation_state).toBe("VALIDATED");
    expect(built.observation.source_refs).toEqual(["source-c", "source-a", "source-b"]);
    expect(built.observation.evidence_origin_key).toBe("lighthouse:problem_instance:PI-TEST");
    expect(built.observation.jurisdiction_keys).toContain("state:Washington");
    expect(built.observation.slice_id).toBe("Housing");
  });

  it("is deterministic for the same exact problem snapshot", () => {
    const first = buildPrismProblemObservation(row());
    const second = buildPrismProblemObservation(row());
    expect(first.source_snapshot_hash).toBe(second.source_snapshot_hash);
  });

  it("changes snapshot identity when the upstream problem record changes", () => {
    const first = buildPrismProblemObservation(row());
    const second = buildPrismProblemObservation(row({ risk_level: "ORANGE" }));
    expect(first.source_snapshot_hash).not.toBe(second.source_snapshot_hash);
  });

  it("refuses records that are not intake-ready", () => {
    expect(() => buildPrismProblemObservation(row({ intake_ready: false }))).toThrow("lighthouse_problem_not_intake_ready");
  });
});

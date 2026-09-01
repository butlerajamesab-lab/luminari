import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list_events: vi.fn(),
  read_integrity: vi.fn(),
  read_layer: vi.fn(),
  project_entities: vi.fn(),
  project_relationships: vi.fn(),
  query: vi.fn(),
}));

vi.mock("./case-runtime-chronology-compat", () => ({
  listEvents: mocks.list_events,
}));

vi.mock("./db-legacy", () => ({
  getPool: () => ({ query: mocks.query }),
}));

vi.mock("./intake-case-integrity-projection", () => ({
  read_case_intake_integrity_projection: mocks.read_integrity,
}));

vi.mock("./intake-case-layer-reader", () => ({
  read_canonical_case_layer_outputs: mocks.read_layer,
}));

vi.mock("./intake-case-runtime-projection", () => ({
  project_case_entities: mocks.project_entities,
  project_case_relationships: mocks.project_relationships,
}));

import { getCaseStats } from "./case-stats-intake-compat";

function layer_data(layer_name: string, count: number) {
  return Array.from({ length: count }, (_, index) => {
    if (layer_name === "verification_gate") {
      return {
        fact_key: `entity-${index}|state|2026-08-30`,
        verification_state: "document_stated",
        source_refs: [
          {
            artifact_key: "artifact-current",
            span_offset: index,
            value_stated: "active",
          },
        ],
        contradiction_refs: [],
      };
    }
    if (layer_name === "state_timeline") {
      return {
        transition_id: `transition-${index}`,
        source_artifact_key: "artifact-current",
      };
    }
    if (layer_name === "pattern_registry") {
      return {
        pattern_id: `pattern-${index}`,
        source_artifacts: ["artifact-current"],
        matching_transitions: [{ transition_id: "transition-0" }],
      };
    }
    if (layer_name === "cascade_registry") {
      return {
        cascade_id: `cascade-${index}`,
        source_artifacts: ["artifact-current"],
        transitions_in_chain: [{ transition_id: "transition-0" }],
      };
    }
    return {
      candidate_id: `claim-${index}`,
      triggering_relationship_ids: ["rel-0"],
      triggering_transition_ids: [],
      triggering_pattern_ids: [],
    };
  });
}

function canonical_output(
  layer_name: string,
  count: number,
  projection_current = true,
  intake_session_id = "session-current",
) {
  return {
    state: "canonical_projection",
    outputs: [
      {
        intake_session_id,
        projection_current,
        data: layer_data(layer_name, count),
      },
    ],
  };
}

describe("case stats Intake Spine compatibility projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.read_integrity.mockResolvedValue({
      projection_state: "verified",
      source_artifact_count: 5,
      artifacts: [
        {
          intake_session_id: "session-current",
          artifact_key: "artifact-current",
          integrity_status: "preserved",
        },
        {
          intake_session_id: "session-current",
          artifact_key: "artifact-two",
          integrity_status: "preserved",
        },
        {
          intake_session_id: "session-current",
          artifact_key: "artifact-three",
          integrity_status: "preserved",
        },
        {
          intake_session_id: "session-current",
          artifact_key: "artifact-quarantined",
          integrity_status: "quarantined",
        },
        { source_artifact_status: "registered" },
      ],
    });
    mocks.project_entities.mockResolvedValue({
      state: "canonical_projection",
      entities: Array.from({ length: 132 }, (_, index) => ({ index })),
    });
    mocks.project_relationships.mockResolvedValue({
      state: "canonical_projection",
      relationships: Array.from({ length: 765 }, (_, index) => ({
        canonicalRelationshipId: `rel-${index}`,
        evidence: [{ canonicalIntakeSessionId: "session-current" }],
      })),
    });
    mocks.list_events.mockResolvedValue(
      Array.from({ length: 1_022 }, (_, index) => ({ index })),
    );
    mocks.read_layer.mockImplementation(
      async (_case_id: number, layer_name: string) => {
        if (layer_name === "verification_gate")
          return canonical_output(layer_name, 87);
        if (layer_name === "state_timeline")
          return canonical_output(layer_name, 1);
        if (layer_name === "rights_and_duties_matrix")
          return canonical_output(layer_name, 11);
        if (layer_name === "pattern_registry")
          return canonical_output(layer_name, 4);
        if (layer_name === "cascade_registry")
          return canonical_output(layer_name, 2);
        throw new Error(`unexpected layer ${layer_name}`);
      },
    );
    mocks.query.mockResolvedValue({
      rows: [
        {
          findings: 2,
          barriers: 1,
          benefits: 3,
          signals: 4,
          statutes: 5,
          foia_requests: 6,
          filings: 7,
        },
      ],
    });
  });

  it("keeps derived Intake Spine counts separate from reviewer commitments", async () => {
    const stats = await getCaseStats(11);

    expect(stats.derivedIntake).toEqual({
      registeredSources: 5,
      entities: 132,
      events: 1_022,
      relationships: 765,
      verificationRecords: 87,
      claimCandidates: 11,
      structuralSignals: 6,
    });
    expect(stats.committed).toEqual({
      findings: 2,
      barriers: 1,
      benefits: 3,
      signals: 4,
      statutes: 5,
      foiaRequests: 6,
      filings: 7,
    });
    expect(stats.verificationRecords).toBe(87);
    expect(stats.claimCandidates).toBe(11);
    expect(stats.committedFindings).toBe(2);
    expect(stats.derivedIntake.verificationRecords).not.toBe(
      stats.committed.findings,
    );
    expect(stats.provenance.derivedIntake.reviewerCommitted).toBe(false);
    expect(stats.provenance.committed.reviewerCommitted).toBe(true);
  });

  it("excludes sealed outputs that are not part of a current governed session", async () => {
    mocks.read_layer.mockImplementation(
      async (_case_id: number, layer_name: string) => {
        if (layer_name === "verification_gate")
          return canonical_output(layer_name, 87, false);
        if (layer_name === "state_timeline")
          return canonical_output(layer_name, 1, true);
        if (layer_name === "rights_and_duties_matrix")
          return {
            state: "canonical_projection",
            outputs: [
              ...canonical_output(layer_name, 11, false).outputs,
              ...canonical_output(layer_name, 3, true).outputs,
            ],
          };
        if (layer_name === "pattern_registry")
          return canonical_output(layer_name, 4, false);
        if (layer_name === "cascade_registry")
          return canonical_output(layer_name, 2, true);
        throw new Error(`unexpected layer ${layer_name}`);
      },
    );

    const stats = await getCaseStats(11);

    expect(stats.derivedIntake).toMatchObject({
      verificationRecords: 0,
      claimCandidates: 3,
      structuralSignals: 2,
    });
    expect(stats).toMatchObject({ findings: 0, claims: 3, signalFlags: 2 });
    expect(stats.projectionState).toMatchObject({
      verification: "not_projected",
      claims: "canonical_projection",
      patterns: "not_projected",
      cascades: "canonical_projection",
    });
  });

  it("excludes source-invalid rows even when another session preserves the same artifact key", async () => {
    mocks.read_integrity.mockResolvedValue({
      projection_state: "blocked",
      source_artifact_count: 2,
      artifacts: [
        {
          intake_session_id: "session-preserved",
          artifact_key: "artifact-current",
          integrity_status: "preserved",
        },
        {
          intake_session_id: "session-quarantined",
          artifact_key: "artifact-current",
          integrity_status: "quarantined",
        },
      ],
    });
    mocks.project_relationships.mockResolvedValue({
      state: "canonical_projection",
      relationships: [
        {
          canonicalRelationshipId: "rel-0",
          evidence: [{ canonicalIntakeSessionId: "session-preserved" }],
        },
      ],
    });
    mocks.read_layer.mockImplementation(
      async (_case_id: number, layer_name: string) =>
        canonical_output(
          layer_name,
          layer_name === "state_timeline" ? 1 : 2,
          true,
          "session-quarantined",
        ),
    );

    const stats = await getCaseStats(11);

    expect(stats.derivedIntake).toMatchObject({
      verificationRecords: 0,
      claimCandidates: 0,
      structuralSignals: 0,
    });
    expect(stats).toMatchObject({ findings: 0, claims: 0, signalFlags: 0 });
  });

  it("retains the legacy top-level counters as documented compatibility aliases", async () => {
    const stats = await getCaseStats(11);

    expect(stats).toMatchObject({
      documents: 5,
      entities: 132,
      quotes: 0,
      claims: 11,
      findings: 87,
      events: 1_022,
      relationships: 765,
      signalFlags: 6,
      documentStatus: { preserved: 3, quarantined: 1, registered: 1 },
    });
    expect(stats.provenance.topLevelCompatibility).toEqual({
      documents: "derivedIntake.registeredSources",
      entities: "derivedIntake.entities",
      quotes: "not_projected",
      claims: "derivedIntake.claimCandidates",
      findings: "derivedIntake.verificationRecords",
      events: "derivedIntake.events",
      relationships: "derivedIntake.relationships",
      signalFlags: "derivedIntake.structuralSignals",
    });
  });

  it("reports an absent Case State as no commitment projection, not as derived findings", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] });

    const stats = await getCaseStats(11);

    expect(stats.committed).toEqual({
      findings: 0,
      barriers: 0,
      benefits: 0,
      signals: 0,
      statutes: 0,
      foiaRequests: 0,
      filings: 0,
    });
    expect(stats.projectionState.commitments).toBe("not_projected");
    expect(stats.findings).toBe(87);
    expect(stats.committedFindings).toBe(0);
  });

  it("treats an unprovisioned Case State relation as not projected instead of failing stats", async () => {
    mocks.query.mockRejectedValueOnce(
      Object.assign(new Error('relation "public.case_state" does not exist'), {
        code: "42P01",
      }),
    );

    const stats = await getCaseStats(11);

    expect(stats.committed).toEqual({
      findings: 0,
      barriers: 0,
      benefits: 0,
      signals: 0,
      statutes: 0,
      foiaRequests: 0,
      filings: 0,
    });
    expect(stats.projectionState.commitments).toBe("not_projected");
    expect(stats.derivedIntake.verificationRecords).toBe(87);
  });
});

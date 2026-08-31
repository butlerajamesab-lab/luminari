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

function canonical_output(count: number) {
  return {
    state: "canonical_projection",
    outputs: [
      { data: Array.from({ length: count }, (_, index) => ({ index })) },
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
        { integrity_status: "preserved" },
        { integrity_status: "preserved" },
        { integrity_status: "preserved" },
        { integrity_status: "quarantined" },
        { source_artifact_status: "registered" },
      ],
    });
    mocks.project_entities.mockResolvedValue({
      state: "canonical_projection",
      entities: Array.from({ length: 132 }, (_, index) => ({ index })),
    });
    mocks.project_relationships.mockResolvedValue({
      state: "canonical_projection",
      relationships: Array.from({ length: 765 }, (_, index) => ({ index })),
    });
    mocks.list_events.mockResolvedValue(
      Array.from({ length: 1_022 }, (_, index) => ({ index })),
    );
    mocks.read_layer.mockImplementation(
      async (_case_id: number, layer_name: string) => {
        if (layer_name === "verification_gate") return canonical_output(87);
        if (layer_name === "rights_and_duties_matrix")
          return canonical_output(11);
        if (layer_name === "pattern_registry") return canonical_output(4);
        if (layer_name === "cascade_registry") return canonical_output(2);
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

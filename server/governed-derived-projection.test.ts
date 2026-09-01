import { describe, expect, it } from "vitest";

import { projectGovernedDerivedRows } from "./governed-derived-projection";

function inSession<T extends Record<string, unknown>>(
  row: T,
  intakeSessionId: string,
) {
  return {
    ...row,
    _receipt: { intake_session_id: intakeSessionId },
  };
}

describe("governed derived projection", () => {
  it("deduplicates canonical rows from multiple valid sessions", () => {
    const sessions = ["session-a", "session-b"];
    const duplicateRows = <T extends Record<string, unknown>>(row: T) =>
      sessions.map((sessionId) => inSession(row, sessionId));

    const projected = projectGovernedDerivedRows({
      verificationRows: duplicateRows({
        fact_key: "resident|state|2026-08-30",
        verification_state: "document_stated",
        source_refs: [
          {
            artifact_key: "artifact-shared",
            span_offset: 10,
            value_stated: "active",
          },
        ],
        contradiction_refs: [],
      }),
      stateRows: duplicateRows({
        transition_id: "transition-shared",
        source_artifact_key: "artifact-shared",
      }),
      patternRows: duplicateRows({
        pattern_id: "pattern-shared",
        source_artifacts: ["artifact-shared"],
        matching_transitions: [{ transition_id: "transition-shared" }],
      }),
      cascadeRows: duplicateRows({
        cascade_id: "cascade-shared",
        source_artifacts: ["artifact-shared"],
        transitions_in_chain: [{ transition_id: "transition-shared" }],
      }),
      claimRows: duplicateRows({
        candidate_id: "claim-shared",
        triggering_relationship_ids: ["relationship-shared"],
        triggering_transition_ids: ["transition-shared"],
        triggering_pattern_ids: ["pattern-shared"],
      }),
      relationships: [
        {
          canonical_relationship_id: "relationship-shared",
          evidence: sessions.map((sessionId) => ({
            canonical_intake_session_id: sessionId,
          })),
        },
      ],
      governedArtifactIdentities: new Set(
        sessions.map((sessionId) => `${sessionId}\u001fartifact-shared`),
      ),
    });

    expect(projected.verificationRecords).toHaveLength(1);
    expect(projected.stateTransitions).toHaveLength(1);
    expect(projected.patterns).toHaveLength(1);
    expect(projected.cascades).toHaveLength(1);
    expect(projected.claimCandidates).toHaveLength(1);
    for (const rows of Object.values(projected)) {
      expect(rows[0]).toMatchObject({
        canonical_intake_session_ids: sessions,
      });
    }
  });

  it("combines valid cross-session verification evidence by fact key", () => {
    const projected = projectGovernedDerivedRows({
      verificationRows: [
        inSession(
          {
            fact_key: "resident|state|2026-08-30",
            verification_state: "document_stated",
            source_refs: [
              {
                artifact_key: "artifact-a",
                span_offset: 10,
                value_stated: "active",
              },
            ],
            contradiction_refs: [],
          },
          "session-a",
        ),
        inSession(
          {
            fact_key: "resident|state|2026-08-30",
            verification_state: "document_stated",
            source_refs: [
              {
                artifact_key: "artifact-b",
                span_offset: 20,
                value_stated: "active",
              },
            ],
            contradiction_refs: [],
          },
          "session-b",
        ),
      ],
      stateRows: [],
      patternRows: [],
      cascadeRows: [],
      claimRows: [],
      relationships: [],
      governedArtifactIdentities: new Set([
        "session-a\u001fartifact-a",
        "session-b\u001fartifact-b",
      ]),
    });

    expect(projected.verificationRecords).toEqual([
      expect.objectContaining({
        verification_state: "supported_by_multiple_sources",
        canonical_intake_session_ids: ["session-a", "session-b"],
        source_refs: [
          expect.objectContaining({ artifact_key: "artifact-a" }),
          expect.objectContaining({ artifact_key: "artifact-b" }),
        ],
      }),
    ]);
  });
});

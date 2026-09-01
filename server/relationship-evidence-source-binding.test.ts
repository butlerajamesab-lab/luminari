import { describe, expect, it } from "vitest";

import {
  project_relationship_evidence,
  resolve_source_artifact_binding,
  type CanonicalRelationship,
  type SourceArtifactRow,
} from "./intake-case-runtime-projection";

function artifact(
  overrides: Partial<SourceArtifactRow> = {},
): SourceArtifactRow {
  return {
    intake_session_id: "session-1",
    artifact_id: "artifact-1",
    artifact_key: "source-1",
    artifact_status: "registered",
    filename: "source.pdf",
    mime_type: "application/pdf",
    metadata: { legacy_document_id: 9 },
    preservation_integrity_status: "preserved",
    ...overrides,
  };
}

function relationship(): CanonicalRelationship {
  return {
    relationship_id: "rel-1",
    entity_a_id: "entity-a",
    entity_b_id: "entity-b",
    type: "communicated_with",
    direction: "a_to_b",
    role_a: "sender",
    role_b: "recipient",
    source_refs: [
      {
        artifact_key: "source-1",
        span_start_offset: 3,
        span_text: "A wrote to B",
        marker_text: "wrote to",
        marker_offset: 5,
        intake_session_id: "session-1",
      },
    ],
  };
}

describe("relationship evidence source binding", () => {
  it("labels receipt-bound evidence preserved even while its source remains registered", () => {
    for (const status of ["registered", "preserved"] as const) {
      const rows = [artifact({ artifact_status: status })];
      expect(resolve_source_artifact_binding(rows)).toMatchObject({
        binding_state: "bound",
        document_id: 9,
        source_artifact_status: "preserved",
      });

      const evidence = project_relationship_evidence(
        1,
        relationship(),
        new Map([["source-1", rows]]),
      );
      expect(evidence).toHaveLength(1);
      expect(evidence[0].sourceArtifactStatus).toBe("preserved");
      expect(evidence[0].explanation).toContain("preserved source span");
    }
  });

  it("emits no source text for missing, quarantined, cross-session, or ambiguous bindings", () => {
    const rejected = [
      new Map<string, SourceArtifactRow[]>(),
      new Map([
        [
          "source-1",
          [artifact({ preservation_integrity_status: "quarantined" })],
        ],
      ]),
      new Map([
        ["source-1", [artifact({ preservation_integrity_status: null })]],
      ]),
      new Map([["source-1", [artifact({ artifact_status: "quarantined" })]]]),
      new Map([
        ["source-1", [artifact({ intake_session_id: "another-session" })]],
      ]),
      new Map([
        [
          "source-1",
          [
            artifact(),
            artifact({
              artifact_id: "artifact-2",
              metadata: { legacy_document_id: 10 },
            }),
          ],
        ],
      ]),
      new Map([
        ["source-1", [artifact(), artifact({ artifact_id: "artifact-2" })]],
      ]),
    ];

    for (const artifacts of rejected) {
      expect(
        project_relationship_evidence(1, relationship(), artifacts),
      ).toEqual([]);
    }
  });
});

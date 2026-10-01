import { describe, expect, it } from "vitest";
import {
  project_source_semantic_coverage,
} from "./intake-source-semantic-coverage";
import type { IntakeIntegrityProjection } from "./intake-case-integrity-projection";

function integrityFixture(): IntakeIntegrityProjection {
  return {
    projection_state: "verified",
    source_artifact_count: 3,
    projected_artifact_count: 3,
    preserved_count: 3,
    quarantined_count: 0,
    referenced_missing_count: 0,
    unresolved_dependency_count: 0,
    artifacts: [
      {
        artifact_id: "img",
        intake_session_id: "session",
        legacy_document_id: 1,
        artifact_key: "sha256:image",
        filename: "paperwork.jpeg",
        mime_type: "image/jpeg",
        source_sha256: "a".repeat(64),
        source_artifact_status: "registered",
        layer_run_id: "run-image",
        layer_version: "1",
        rule_version: "1",
        input_hash: "b".repeat(64),
        output_hash: "c".repeat(64),
        receipt_hash: "d".repeat(64),
        completed_at: null,
        integrity_status: "preserved",
        verified_sha256: "a".repeat(64),
        verification_timestamp: "2026-09-20T00:00:00Z",
        unresolved_dependencies: [],
      },
      {
        artifact_id: "sms",
        intake_session_id: "session",
        legacy_document_id: 2,
        artifact_key: "sha256:sms",
        filename: "messages.xml",
        mime_type: "application/vnd.sms-backup-restore+xml",
        source_sha256: "e".repeat(64),
        source_artifact_status: "registered",
        layer_run_id: "run-sms",
        layer_version: "1",
        rule_version: "1",
        input_hash: "f".repeat(64),
        output_hash: "1".repeat(64),
        receipt_hash: "2".repeat(64),
        completed_at: null,
        integrity_status: "preserved",
        verified_sha256: "e".repeat(64),
        verification_timestamp: "2026-09-20T00:00:00Z",
        unresolved_dependencies: [],
      },
      {
        artifact_id: "pdf",
        intake_session_id: "session",
        legacy_document_id: 3,
        artifact_key: "sha256:pdf",
        filename: "silent.pdf",
        mime_type: "application/pdf",
        source_sha256: "3".repeat(64),
        source_artifact_status: "registered",
        layer_run_id: "run-pdf",
        layer_version: "1",
        rule_version: "1",
        input_hash: "4".repeat(64),
        output_hash: "5".repeat(64),
        receipt_hash: "6".repeat(64),
        completed_at: null,
        integrity_status: "preserved",
        verified_sha256: "3".repeat(64),
        verification_timestamp: "2026-09-20T00:00:00Z",
        unresolved_dependencies: [],
      },
    ],
  };
}

describe("source semantic coverage accounting", () => {
  it("does not equate preservation with interpretation", () => {
    const result = project_source_semantic_coverage({
      integrity: integrityFixture(),
      semantic_projection_available: true,
      chronology: [{
        event_id: "evt",
        date: null,
        date_precision: "unknown",
        event_text: "A care conference occurred.",
        actor: null,
        source_artifact_key: "sha256:sms",
        source_span_offset: 10,
        verification_status: "document_stated",
      }],
      entities: [{
        entity_id: "entity",
        type: "person",
        canonical_name: "Rick",
        raw_mentions: [{
          raw_text: "Rick",
          artifact_key: "sha256:sms",
          span_offset: 2,
        }],
        review_candidates: [],
      }],
      relationships: [],
      transitions: [],
    });

    expect(result.projection_state).toBe("canonical_projection");
    expect(result.sources_with_some_semantic_use).toBe(1);
    expect(result.sources_requiring_interpretation_review).toBe(2);
    expect(result.image_sources_requiring_interpretation_review).toBe(1);
    expect(result.non_image_sources_requiring_interpretation_review).toBe(1);

    const image = result.artifacts.find(artifact => artifact.artifact_id === "img");
    expect(image?.preservation_state).toBe("preserved");
    expect(image?.interpretation_state).toBe("image_interpretation_unproven");
    expect(image?.requires_interpretation_review).toBe(true);
    expect(image?.contribution_counts.total_semantic_references).toBe(0);

    const sms = result.artifacts.find(artifact => artifact.artifact_id === "sms");
    expect(sms?.interpretation_state).toBe("some_semantic_use");
    expect(sms?.contribution_counts.chronology_events).toBe(1);
    expect(sms?.contribution_counts.entity_mentions).toBe(1);

    expect(result.minimum_semantic_usage_only).toBe(true);
    expect(result.some_semantic_use_does_not_prove_complete_interpretation).toBe(true);
  });

  it("does not call absent governed outputs a semantic failure", () => {
    const result = project_source_semantic_coverage({
      integrity: integrityFixture(),
      semantic_projection_available: false,
      chronology: [],
      entities: [],
      relationships: [],
      transitions: [],
    });
    expect(result.projection_state).toBe("not_projected");
    expect(result.sources_requiring_interpretation_review).toBe(0);
    expect(result.artifacts.every(artifact => artifact.interpretation_state === "not_evaluated")).toBe(true);
  });
});

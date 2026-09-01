import { beforeEach, describe, expect, it, vi } from "vitest";

import { computeHash } from "./engines/intake-spine/utils";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  readIntegrity: vi.fn(),
}));

vi.mock("./db-legacy", () => ({
  getPool: () => ({ query: mocks.query }),
}));

vi.mock("./intake-case-integrity-projection", () => ({
  read_case_intake_integrity_projection: mocks.readIntegrity,
}));

import { project_case_entities } from "./intake-case-runtime-projection";

const entityData = [
  {
    entity_id: "entity-resident-1",
    type: "person",
    canonical_name: "Resident 1",
    raw_mentions: [
      {
        raw_text: "Resident 1",
        artifact_key: "artifact-shared",
        span_offset: 12,
      },
    ],
    review_candidates: [],
  },
];

const outputHash = computeHash(entityData);
const layerRows = [
  {
    intake_session_id: "session-quarantined",
    link_type: "primary_projection",
    is_primary: true,
    layer_run_id: "run-entity",
    layer_name: "entity_registry",
    layer_version: "2.5.0",
    rule_version: "2.5.0",
    normalization_version: null,
    run_status: "completed",
    input_hash: "1".repeat(64),
    output_hash: outputHash,
    output_refs: [{ artifact_id: "output-entity" }],
    unresolved_dependencies: [],
    receipt: {
      receipt_type: "layer_execution",
      execution_contract_version: "luminari.intake.layer-execution.v1",
      output_artifact_id: "output-entity",
    },
    receipt_hash: "2".repeat(64),
    canonicalization_version: "luminari.intake.canonical-json.v2",
    completed_at: "2026-08-30T21:00:00.000Z",
    sealed_at: "2026-08-30T21:00:00.000Z",
    output_artifact_id: "output-entity",
    output_artifact_key: "output:key",
    output_artifact_type: "intake_layer_output",
    output_artifact_status: "preserved",
    output_artifact_metadata: {
      execution_contract_version: "luminari.intake.layer-execution.v1",
      canonicalization_version: "luminari.intake.canonical-json.v2",
      layer_name: "entity_registry",
      layer_version: "2.5.0",
      rule_version: "2.5.0",
      output_hash: outputHash,
      data: entityData,
    },
  },
];

const sourceRows = [
  {
    intake_session_id: "session-quarantined",
    artifact_id: "source-quarantined",
    artifact_key: "artifact-shared",
    artifact_status: "registered",
    filename: "quarantined.pdf",
    mime_type: "application/pdf",
    metadata: { legacy_document_id: 8 },
  },
  {
    intake_session_id: "session-preserved",
    artifact_id: "source-preserved-duplicate",
    artifact_key: "artifact-shared",
    artifact_status: "registered",
    filename: "preserved-duplicate.pdf",
    mime_type: "application/pdf",
    metadata: { legacy_document_id: 7 },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("lr.layer_name = $2") ? layerRows : sourceRows,
  }));
  mocks.readIntegrity.mockResolvedValue({
    artifacts: [
      {
        intake_session_id: "session-quarantined",
        artifact_id: "source-quarantined",
        artifact_key: "artifact-shared",
        integrity_status: "quarantined",
      },
      {
        intake_session_id: "session-preserved",
        artifact_id: "source-preserved-duplicate",
        artifact_key: "artifact-shared",
        integrity_status: "preserved",
      },
    ],
  });
});

describe("entity mention producing-session source binding", () => {
  it("does not bind a quarantined mention to a preserved duplicate in another session", async () => {
    const projection = await project_case_entities(44);

    expect(projection.state).toBe("canonical_projection");
    expect(projection.canonical_entities).toEqual([]);
    expect(projection.entities).toEqual([]);
  });
});

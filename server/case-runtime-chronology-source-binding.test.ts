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

import {
  getCaseChronologyProjectionState,
  listEvents,
} from "./case-runtime-chronology-compat";

const chronology = [
  {
    event_id: "event-preserved",
    date: "2026-08-30",
    date_precision: "exact",
    event_text: "Preserved source event",
    actor: null,
    source_artifact_key: "artifact-preserved",
    source_span_offset: 10,
    verification_status: "document_stated",
  },
  {
    event_id: "event-quarantined",
    date: "2026-08-31",
    date_precision: "exact",
    event_text: "Quarantined source event",
    actor: null,
    source_artifact_key: "artifact-quarantined",
    source_span_offset: 20,
    verification_status: "document_stated",
  },
];

const outputHash = computeHash(chronology);
const canonicalRows = [
  {
    layer_run_id: "run-chronology",
    layer_version: "2.5.0",
    rule_version: "2.5.0",
    output_hash: outputHash,
    output_refs: [{ artifact_id: "output-artifact" }],
    receipt: {
      receipt_type: "layer_execution",
      execution_contract_version: "luminari.intake.layer-execution.v1",
      output_artifact_id: "output-artifact",
    },
    receipt_hash: "a".repeat(64),
    canonicalization_version: "luminari.intake.canonical-json.v2",
    output_artifact_id: "output-artifact",
    artifact_type: "intake_layer_output",
    artifact_status: "preserved",
    metadata: {
      execution_contract_version: "luminari.intake.layer-execution.v1",
      canonicalization_version: "luminari.intake.canonical-json.v2",
      layer_name: "chronology_reconstruction",
      layer_version: "2.5.0",
      rule_version: "2.5.0",
      output_hash: outputHash,
      data: chronology,
    },
  },
];

const sourceRows = [
  {
    intake_session_id: "session-current",
    artifact_id: "source-preserved",
    artifact_key: "artifact-preserved",
    filename: "preserved.pdf",
    metadata: { legacy_document_id: 7 },
  },
  {
    intake_session_id: "session-current",
    artifact_id: "source-quarantined",
    artifact_key: "artifact-quarantined",
    filename: "quarantined.pdf",
    metadata: { legacy_document_id: 8 },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("chronology_reconstruction")
      ? canonicalRows
      : sourceRows,
  }));
  mocks.readIntegrity.mockResolvedValue({
    artifacts: [
      {
        intake_session_id: "session-current",
        artifact_id: "source-preserved",
        artifact_key: "artifact-preserved",
        integrity_status: "preserved",
      },
      {
        intake_session_id: "session-current",
        artifact_id: "source-quarantined",
        artifact_key: "artifact-quarantined",
        integrity_status: "quarantined",
      },
    ],
  });
});

describe("chronology Layer 3 source binding", () => {
  it("projects only events bound to the exact preserved source identity", async () => {
    const events = await listEvents(44);

    expect(events.map((event) => event.id)).toEqual(["event-preserved"]);
    expect(events[0]).toMatchObject({
      documentId: 7,
      documentFilename: "preserved.pdf",
    });
  });

  it("counts only exact preserved source events", async () => {
    const state = await getCaseChronologyProjectionState(44);

    expect(state).toMatchObject({
      projection_state: "canonical_projection",
      event_count: 1,
    });
  });
});

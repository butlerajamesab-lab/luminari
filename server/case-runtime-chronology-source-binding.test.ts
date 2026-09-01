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
    intake_session_id: "session-current",
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

  it("does not bind a quarantined event to a preserved duplicate in another session", async () => {
    const duplicateChronology = [
      {
        event_id: "event-shared",
        date: "2026-08-31",
        date_precision: "exact",
        event_text: "Event from quarantined session",
        actor: null,
        source_artifact_key: "artifact-shared",
        source_span_offset: 20,
        verification_status: "document_stated",
      },
    ];
    const duplicateHash = computeHash(duplicateChronology);
    mocks.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes("chronology_reconstruction")
        ? [
            {
              ...canonicalRows[0],
              intake_session_id: "session-quarantined",
              output_hash: duplicateHash,
              metadata: {
                ...canonicalRows[0].metadata,
                output_hash: duplicateHash,
                data: duplicateChronology,
              },
            },
          ]
        : [
            {
              intake_session_id: "session-quarantined",
              artifact_id: "source-quarantined",
              artifact_key: "artifact-shared",
              filename: "quarantined.pdf",
              metadata: { legacy_document_id: 8 },
            },
            {
              intake_session_id: "session-preserved",
              artifact_id: "source-preserved-duplicate",
              artifact_key: "artifact-shared",
              filename: "preserved-duplicate.pdf",
              metadata: { legacy_document_id: 7 },
            },
          ],
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

    await expect(listEvents(44)).resolves.toEqual([]);
  });

  it("keeps one canonical event when multiple valid sessions bind duplicate evidence", async () => {
    const sharedChronology = [chronology[0]];
    const sharedHash = computeHash(sharedChronology);
    const canonicalOutput = (sessionId: string, outputArtifactId: string) => ({
      ...canonicalRows[0],
      intake_session_id: sessionId,
      layer_run_id: `run-${sessionId}`,
      output_hash: sharedHash,
      output_refs: [{ artifact_id: outputArtifactId }],
      receipt: {
        ...canonicalRows[0].receipt,
        output_artifact_id: outputArtifactId,
      },
      output_artifact_id: outputArtifactId,
      metadata: {
        ...canonicalRows[0].metadata,
        output_hash: sharedHash,
        data: sharedChronology,
      },
    });
    mocks.query.mockImplementation(async (sql: string) => ({
      rows: sql.includes("chronology_reconstruction")
        ? [
            canonicalOutput("session-a", "output-artifact-a"),
            canonicalOutput("session-b", "output-artifact-b"),
          ]
        : [
            {
              intake_session_id: "session-a",
              artifact_id: "source-a",
              artifact_key: "artifact-preserved",
              filename: "duplicate-a.pdf",
              metadata: { legacy_document_id: 7 },
            },
            {
              intake_session_id: "session-b",
              artifact_id: "source-b",
              artifact_key: "artifact-preserved",
              filename: "duplicate-b.pdf",
              metadata: { legacy_document_id: 9 },
            },
          ],
    }));
    mocks.readIntegrity.mockResolvedValue({
      artifacts: [
        {
          intake_session_id: "session-a",
          artifact_id: "source-a",
          artifact_key: "artifact-preserved",
          integrity_status: "preserved",
        },
        {
          intake_session_id: "session-b",
          artifact_id: "source-b",
          artifact_key: "artifact-preserved",
          integrity_status: "preserved",
        },
      ],
    });

    await expect(listEvents(44)).resolves.toEqual([
      expect.objectContaining({
        id: "event-preserved",
        documentId: 7,
        documentFilename: "duplicate-a.pdf",
        canonical_source_intake_session_id: "session-a",
        canonical_source_intake_session_ids: ["session-a", "session-b"],
      }),
    ]);
    await expect(getCaseChronologyProjectionState(44)).resolves.toMatchObject({
      projection_state: "canonical_projection",
      event_count: 1,
    });
  });
});

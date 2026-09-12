import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  readIntegrity: vi.fn(),
  readLayer: vi.fn(),
}));

vi.mock("./db-legacy", () => ({
  getPool: () => ({ query: mocks.query }),
}));

vi.mock("./intake-case-integrity-projection", () => ({
  read_case_intake_integrity_projection: mocks.readIntegrity,
}));

vi.mock("./intake-case-layer-reader", () => ({
  read_canonical_case_layer_outputs: mocks.readLayer,
}));

import { read_case_intake_continuity } from "./intake-case-continuity";

describe("case intake continuity projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue({
      rows: [
        {
          legacy_case_id: 11,
          case_uuid: "e650c976-0178-4d72-9dda-092eddf3207a",
          intake_session_id: "11111111-1111-4111-8111-111111111111",
          link_type: "primary_projection",
          is_primary: true,
          session_type: "live",
          entry_channel: "upload",
          source_label: "upload",
          session_status: "complete",
          completion_state: "governed_execution_complete",
          created_at: "2026-09-10T10:00:00.000Z",
          updated_at: "2026-09-10T12:00:00.000Z",
          artifact_count: 4,
          source_artifact_count: 2,
          layer_run_count: 8,
          completed_layer_run_count: 6,
          sealed_layer_run_count: 5,
          failed_layer_run_count: 1,
          pending_layer_run_count: 1,
          layer_output_available_count: 4,
          unresolved_dependency_count: 2,
          stabilization_snapshot_count: 2,
          active_stabilization_snapshot_count: 1,
          pending_reassess_count: 0,
          latest_reassess_at: "2026-09-15T00:00:00.000Z",
        },
        {
          legacy_case_id: 11,
          case_uuid: "e650c976-0178-4d72-9dda-092eddf3207a",
          intake_session_id: "22222222-2222-4222-8222-222222222222",
          link_type: "clean_room_restart",
          is_primary: false,
          session_type: "clean_room",
          entry_channel: "restart",
          source_label: "clean room",
          session_status: "pending",
          completion_state: "projection_pending",
          created_at: "2026-09-11T10:00:00.000Z",
          updated_at: "2026-09-11T10:30:00.000Z",
          artifact_count: 1,
          source_artifact_count: 1,
          layer_run_count: 2,
          completed_layer_run_count: 0,
          sealed_layer_run_count: 0,
          failed_layer_run_count: 0,
          pending_layer_run_count: 2,
          layer_output_available_count: 0,
          unresolved_dependency_count: 1,
          stabilization_snapshot_count: 0,
          active_stabilization_snapshot_count: 0,
          pending_reassess_count: 0,
          latest_reassess_at: null,
        },
      ],
    });
    mocks.readIntegrity.mockResolvedValue({
      artifacts: [
        {
          intake_session_id: "11111111-1111-4111-8111-111111111111",
          legacy_document_id: 41,
          filename: "care-plan.pdf",
          source_artifact_status: "registered",
          integrity_status: "preserved",
        },
        {
          intake_session_id: "11111111-1111-4111-8111-111111111111",
          legacy_document_id: 42,
          filename: "photos.zip",
          source_artifact_status: "registered",
          integrity_status: "quarantined",
        },
        {
          intake_session_id: "22222222-2222-4222-8222-222222222222",
          legacy_document_id: 43,
          filename: "notes.txt",
          source_artifact_status: "registered",
          integrity_status: null,
        },
      ],
    });
    mocks.readLayer.mockImplementation(
      async (_case_id: number, layer_name: string) => {
        if (layer_name === "verification_gate") {
          return {
            state: "canonical_projection",
            outputs: [
              {
                intake_session_id: "11111111-1111-4111-8111-111111111111",
                completed_at: "2026-09-10T12:00:00.000Z",
                data: [
                  { verification_state: "document_stated" },
                  { verification_state: "contradicted" },
                ],
              },
              {
                intake_session_id: "22222222-2222-4222-8222-222222222222",
                completed_at: null,
                data: [{ verification_state: "unresolved" }],
              },
            ],
          };
        }
        if (layer_name === "state_timeline") {
          return {
            state: "canonical_projection",
            outputs: [
              {
                intake_session_id: "11111111-1111-4111-8111-111111111111",
                completed_at: "2026-09-10T12:15:00.000Z",
                data: [
                  { to_state: "care_deficit_documented", verification_status: "document_stated" },
                  { to_state: "inspection_observed", verification_status: "supported_by_multiple_sources" },
                ],
              },
            ],
          };
        }
        throw new Error(`unexpected layer ${layer_name}`);
      },
    );
  });

  it("separates primary and related linked sessions without merging clean-room restarts", async () => {
    const continuity = await read_case_intake_continuity({ case_id: 11 });

    expect(continuity.case_id).toBe(11);
    expect(continuity.case_uuid).toBe("e650c976-0178-4d72-9dda-092eddf3207a");
    expect(continuity.primary_sessions).toHaveLength(1);
    expect(continuity.related_sessions).toHaveLength(1);
    expect(continuity.primary_sessions[0]).toMatchObject({
      intake_session_id: "11111111-1111-4111-8111-111111111111",
      link_type: "primary_projection",
      source_artifact_count: 2,
      verification_record_count: 2,
      transition_count: 2,
    });
    expect(continuity.related_sessions[0]).toMatchObject({
      intake_session_id: "22222222-2222-4222-8222-222222222222",
      link_type: "clean_room_restart",
      is_primary: false,
      pending_layer_run_count: 2,
      layer_output_available_count: 0,
      verification_state_counts: { unresolved: 1 },
    });
    expect(continuity.related_sessions[0].document_links).toEqual([]);
  });

  it("aggregates output, verification, and source-bound continuity counts", async () => {
    const continuity = await read_case_intake_continuity({ case_id: 11 });

    expect(continuity.totals).toMatchObject({
      session_count: 2,
      primary_session_count: 1,
      related_session_count: 1,
      artifact_count: 5,
      source_artifact_count: 3,
      completed_layer_run_count: 6,
      sealed_layer_run_count: 5,
      failed_layer_run_count: 1,
      pending_layer_run_count: 3,
      layer_output_available_count: 4,
      unresolved_dependency_count: 3,
      verification_record_count: 3,
      transition_count: 2,
      stabilization_snapshot_count: 2,
      active_stabilization_snapshot_count: 1,
    });
    expect(continuity.totals.artifact_status_counts).toEqual({
      preserved: 1,
      quarantined: 1,
      registered: 1,
    });
    expect(continuity.totals.verification_state_counts).toEqual({
      contradicted: 1,
      document_stated: 1,
      unresolved: 1,
    });
    expect(continuity.totals.transition_state_counts).toEqual({
      care_deficit_documented: 1,
      inspection_observed: 1,
    });
    expect(continuity.primary_sessions[0].document_links.map((link) => link.document_id)).toEqual([41, 42]);
    expect(continuity.primary_sessions[0].document_links[0]?.href).toBe("/documents/41?caseId=11");
    expect(continuity.surface_links.case_overview).toBe("/case-overview?caseId=11");
    expect(continuity.surface_links.review).toBe("/control-room?caseId=11");
    expect(continuity.surface_links.act).toBe("/guide/11");
  });

  it("supports canonical uuid bridge reads and preserves empty or failed states", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          legacy_case_id: 11,
          case_uuid: "e650c976-0178-4d72-9dda-092eddf3207a",
        },
      ],
    });
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          legacy_case_id: 11,
          case_uuid: "e650c976-0178-4d72-9dda-092eddf3207a",
          intake_session_id: "33333333-3333-4333-8333-333333333333",
          link_type: "related_projection",
          is_primary: false,
          session_type: "live",
          entry_channel: "upload",
          source_label: null,
          session_status: "failed",
          completion_state: "projection_failed",
          created_at: "2026-09-12T10:00:00.000Z",
          updated_at: "2026-09-12T10:01:00.000Z",
          artifact_count: 0,
          source_artifact_count: 0,
          layer_run_count: 1,
          completed_layer_run_count: 0,
          sealed_layer_run_count: 0,
          failed_layer_run_count: 1,
          pending_layer_run_count: 0,
          layer_output_available_count: 0,
          unresolved_dependency_count: 0,
          stabilization_snapshot_count: 0,
          active_stabilization_snapshot_count: 0,
          pending_reassess_count: 0,
          latest_reassess_at: null,
        },
      ],
    });
    mocks.readIntegrity.mockResolvedValueOnce({ artifacts: [] });
    mocks.readLayer.mockImplementationOnce(async () => ({
      state: "not_projected",
      outputs: [],
    }));
    mocks.readLayer.mockImplementationOnce(async () => ({
      state: "not_projected",
      outputs: [],
    }));

    const continuity = await read_case_intake_continuity({
      case_uuid: "e650c976-0178-4d72-9dda-092eddf3207a",
    });

    expect(mocks.query.mock.calls[0]?.[1]).toEqual([
      null,
      "e650c976-0178-4d72-9dda-092eddf3207a",
    ]);
    expect(mocks.query.mock.calls[1]?.[1]).toEqual([
      11,
      "e650c976-0178-4d72-9dda-092eddf3207a",
    ]);
    expect(continuity.primary_sessions).toEqual([]);
    expect(continuity.related_sessions[0]).toMatchObject({
      session_status: "failed",
      failed_layer_run_count: 1,
      verification_record_count: 0,
      transition_count: 0,
      document_links: [],
    });
  });

  it("returns an empty continuity model when the case bridge exists without linked intake sessions", async () => {
    mocks.query.mockResolvedValueOnce({
      rows: [
        {
          legacy_case_id: 11,
          case_uuid: "e650c976-0178-4d72-9dda-092eddf3207a",
        },
      ],
    });
    mocks.query.mockResolvedValueOnce({ rows: [] });
    mocks.readIntegrity.mockResolvedValueOnce({ artifacts: [] });
    mocks.readLayer.mockImplementationOnce(async () => ({
      state: "not_projected",
      outputs: [],
    }));
    mocks.readLayer.mockImplementationOnce(async () => ({
      state: "not_projected",
      outputs: [],
    }));

    const continuity = await read_case_intake_continuity({ case_id: 11 });

    expect(continuity.case_id).toBe(11);
    expect(continuity.case_uuid).toBe("e650c976-0178-4d72-9dda-092eddf3207a");
    expect(continuity.primary_sessions).toEqual([]);
    expect(continuity.related_sessions).toEqual([]);
    expect(continuity.totals).toMatchObject({
      session_count: 0,
      primary_session_count: 0,
      related_session_count: 0,
      artifact_count: 0,
      source_artifact_count: 0,
      completed_layer_run_count: 0,
      sealed_layer_run_count: 0,
      failed_layer_run_count: 0,
      pending_layer_run_count: 0,
      layer_output_available_count: 0,
      unresolved_dependency_count: 0,
      verification_record_count: 0,
      transition_count: 0,
    });
  });
});

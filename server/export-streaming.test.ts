import { EventEmitter } from "node:events";
import type { Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  getSnapshot: vi.fn(),
  getLatestSnapshot: vi.fn(),
  listDocuments: vi.fn(),
  listEntities: vi.fn(),
  listEvents: vi.fn(),
  listRelationshipsEnriched: vi.fn(),
  getCaseStats: vi.fn(),
  getGovernedEntityRolesForDocument: vi.fn(),
  readIntegrity: vi.fn(),
  readLayer: vi.fn(),
}));

vi.mock("./db", () => ({
  getSnapshot: state.getSnapshot,
  getLatestSnapshot: state.getLatestSnapshot,
  listDocuments: state.listDocuments,
  listEntities: state.listEntities,
  listEvents: state.listEvents,
  listRelationshipsEnriched: state.listRelationshipsEnriched,
  getCaseStats: state.getCaseStats,
  getGovernedEntityRolesForDocument: state.getGovernedEntityRolesForDocument,
}));

vi.mock("./intake-case-layer-reader", () => ({
  read_canonical_case_layer_outputs: state.readLayer,
}));

vi.mock("./intake-case-integrity-projection", () => ({
  read_case_intake_integrity_projection: state.readIntegrity,
}));

import {
  EXPORT_TYPE_HEADER,
  ExportRequestError,
  loadCurrentCaseExportData,
  setExportDownloadHeaders,
  streamHtmlBundle,
  streamJsonExport,
} from "./export-current";

function responseDouble() {
  const headers = new Map<string, string>();
  const res = {
    setHeader: vi.fn((name: string, value: string) => {
      headers.set(name.toLowerCase(), value);
      return res;
    }),
    removeHeader: vi.fn((name: string) => {
      headers.delete(name.toLowerCase());
    }),
    write: vi.fn(),
    end: vi.fn(),
  } as unknown as Response;

  return { headers, res };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.getLatestSnapshot.mockResolvedValue(null);
  state.listDocuments.mockResolvedValue([]);
  state.listEntities.mockResolvedValue([]);
  state.listEvents.mockResolvedValue([]);
  state.listRelationshipsEnriched.mockResolvedValue([]);
  state.getCaseStats.mockResolvedValue({
    documents: 0,
    entities: 0,
    events: 0,
  });
  state.getGovernedEntityRolesForDocument.mockResolvedValue([]);
  state.readIntegrity.mockResolvedValue({ artifacts: [] });
  state.readLayer.mockResolvedValue({ state: "not_projected", outputs: [] });
});

describe("sovereign export response contract", () => {
  it.each([
    ["json-dump", "application/json; charset=utf-8", "Data.json"],
    ["full-bundle", "text/html; charset=utf-8", "Bundle.html"],
  ] as const)(
    "marks %s as a private attachment",
    (type, contentType, suffix) => {
      const { headers, res } = responseDouble();

      setExportDownloadHeaders(res, type, "A Case / Proof");

      expect(headers.get("content-type")).toBe(contentType);
      expect(headers.get("content-disposition")).toBe(
        `attachment; filename="Luminari_A_Case___Proof_${suffix}"`,
      );
      expect(headers.get(EXPORT_TYPE_HEADER.toLowerCase())).toBe(type);
      expect(headers.get("cache-control")).toContain("no-store");
      expect(headers.get("x-content-type-options")).toBe("nosniff");
      expect(headers.has("transfer-encoding")).toBe(false);
    },
  );

  it("rejects a snapshot outside the authorized case before writing a byte", async () => {
    state.getSnapshot.mockResolvedValue({
      id: 72,
      caseId: 99,
      status: "sealed",
    });
    const { headers, res } = responseDouble();

    await expect(
      streamJsonExport(res, { id: 44, name: "Authorized Case" }, 44, {
        snapshotId: 72,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<ExportRequestError>>({
        name: "ExportRequestError",
        message: "Snapshot not found for this case",
        statusCode: 404,
      }),
    );

    expect(state.getSnapshot).toHaveBeenCalledWith(72);
    expect(res.write).not.toHaveBeenCalled();
    expect(headers.get(EXPORT_TYPE_HEADER.toLowerCase())).toBe("json-dump");
  });

  it("exports governed projections without private storage locations", async () => {
    state.readIntegrity.mockResolvedValue({
      artifacts: [{ legacy_document_id: 7, integrity_status: "preserved" }],
    });
    state.listDocuments.mockResolvedValue([
      {
        id: 7,
        caseId: 44,
        filename: "inspection.pdf",
        s3Key: "private/key",
        s3Url: "https://private",
        sha256Hash: "abc",
      },
    ]);
    state.listEntities.mockResolvedValue([
      {
        id: 8,
        caseId: 44,
        name: "Caroline Kline Galland Home",
        type: "organization",
        canonical_entity_id: "entity-1",
      },
    ]);
    state.listEvents.mockResolvedValue([
      {
        id: "event-1",
        caseId: 44,
        title: "Inspection observed",
        documentId: 7,
        canonical_source_artifact_key: "artifact:abc",
        canonical_source_span_offset: 12,
      },
    ]);
    state.getGovernedEntityRolesForDocument.mockResolvedValue([
      { entityId: 8, documentId: 7 },
    ]);

    const exported = await loadCurrentCaseExportData(
      { id: 44, name: "Inspection case", userId: 9 },
      44,
    );

    expect(exported.case).not.toHaveProperty("userId");
    expect(exported.sources[0]).toMatchObject({
      filename: "inspection.pdf",
      sha256_hash: "abc",
    });
    expect(exported.sources[0]).not.toHaveProperty("s3Key");
    expect(exported.sources[0]).not.toHaveProperty("s3Url");
    expect(exported.entities).toHaveLength(1);
    expect(exported.chronology).toHaveLength(1);
    expect(exported.projection_scope.authority).toBe(
      "sealed_current_universal_intake_projection",
    );
  });

  it("streams top-level arrays one row at a time", async () => {
    state.readIntegrity.mockResolvedValue({
      artifacts: [
        { legacy_document_id: 7, integrity_status: "preserved" },
        { legacy_document_id: 8, integrity_status: "preserved" },
      ],
    });
    state.listDocuments.mockResolvedValue([
      { id: 7, filename: "first-large-source.pdf" },
      { id: 8, filename: "second-large-source.pdf" },
    ]);
    const { res } = responseDouble();

    await streamJsonExport(res, { id: 44, name: "Inspection case" }, 44, {
      includeTextContent: true,
    });

    const written = (res.write as ReturnType<typeof vi.fn>).mock.calls.map(
      ([chunk]) => String(chunk),
    );
    const finalChunk = (res.end as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    const parsed = JSON.parse(`${written.join("")}${String(finalChunk)}`);
    expect(
      parsed.sources.map((source: Record<string, unknown>) => source.filename),
    ).toEqual(["first-large-source.pdf", "second-large-source.pdf"]);
    expect(
      written.some(
        (chunk) =>
          chunk.includes("first-large-source.pdf") &&
          chunk.includes("second-large-source.pdf"),
      ),
    ).toBe(false);
  });

  it("streams the HTML bundle section by section", async () => {
    state.readIntegrity.mockResolvedValue({
      artifacts: [
        {
          artifact_key: "artifact-current",
          legacy_document_id: 7,
          integrity_status: "preserved",
        },
      ],
    });
    state.listDocuments.mockResolvedValue([
      { id: 7, filename: "inspection.pdf" },
    ]);
    const { res } = responseDouble();

    await streamHtmlBundle(res, { id: 44, name: "Inspection case" }, 44);

    const written = (res.write as ReturnType<typeof vi.fn>).mock.calls.map(
      ([chunk]) => String(chunk),
    );
    expect(written.length).toBeGreaterThanOrEqual(10);
    expect(written[0]).toContain("<!doctype html>");
    expect(written.some((chunk) => chunk.includes("Source register"))).toBe(
      true,
    );
    expect(
      written.some((chunk) => chunk.includes("Source-bound chronology")),
    ).toBe(true);
    expect(written.at(-1)).toContain("</html>");
    expect(res.end).toHaveBeenCalledWith();
    expect(
      written.some(
        (chunk) =>
          chunk.includes("Source register") &&
          chunk.includes("Source-bound chronology"),
      ),
    ).toBe(false);
  });

  it("stops waiting for backpressure when the client disconnects", async () => {
    const { res } = responseDouble();
    const events = new EventEmitter();
    Object.assign(res, {
      once: events.once.bind(events),
      off: events.off.bind(events),
      destroyed: false,
      writableEnded: false,
    });
    (res.write as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

    const exporting = streamJsonExport(
      res,
      { id: 44, name: "Inspection case" },
      44,
    );
    setTimeout(() => {
      Object.assign(res, { destroyed: true });
      events.emit("close");
    }, 0);

    await expect(exporting).rejects.toThrow(
      "Export response closed before buffered data drained",
    );
    expect(res.end).not.toHaveBeenCalled();
  });

  it("restricts source rows and role lookups to preserved linked intake artifacts", async () => {
    state.listDocuments.mockResolvedValue([
      { id: 7, filename: "current.pdf", documentResolution: "active" },
      { id: 8, filename: "quarantined.pdf", documentResolution: "active" },
      { id: 9, filename: "superseded.pdf", documentResolution: "superseded" },
      { id: 10, filename: "unlinked.pdf", documentResolution: "active" },
    ]);
    state.readIntegrity.mockResolvedValue({
      artifacts: [
        { legacy_document_id: 7, integrity_status: "preserved" },
        { legacy_document_id: 8, integrity_status: "quarantined" },
      ],
    });

    const exported = await loadCurrentCaseExportData(
      { id: 44, name: "Inspection case" },
      44,
    );

    expect(exported.sources.map((source) => source.filename)).toEqual([
      "current.pdf",
    ]);
    expect(state.getGovernedEntityRolesForDocument).toHaveBeenCalledTimes(1);
    expect(state.getGovernedEntityRolesForDocument).toHaveBeenCalledWith(44, 7);
    expect(exported.projection_scope.source_filter_policy).toBe(
      "active linked source artifacts with sealed preserved integrity",
    );
  });

  it("exports only relationships backed by currently governed sources", async () => {
    state.listDocuments.mockResolvedValue([
      { id: 7, filename: "current.pdf" },
      { id: 8, filename: "superseded.pdf" },
    ]);
    state.readIntegrity.mockResolvedValue({
      artifacts: [
        {
          artifact_key: "artifact-current",
          legacy_document_id: 7,
          integrity_status: "preserved",
        },
        {
          artifact_key: "artifact-stale",
          legacy_document_id: 8,
          integrity_status: "quarantined",
        },
      ],
    });
    state.listEntities.mockResolvedValue([
      { id: 101, name: "Current entity" },
      { id: 102, name: "Stale entity" },
    ]);
    state.getGovernedEntityRolesForDocument.mockResolvedValue([
      { entityId: 101, documentId: 7 },
    ]);
    state.listEvents.mockResolvedValue([
      { id: "event-current", documentId: 7 },
      { id: "event-stale", documentId: 8 },
      { id: "event-unbound", documentId: null },
    ]);
    state.listRelationshipsEnriched.mockResolvedValue([
      {
        id: "relationship-current",
        backingEvidence: [
          { id: "evidence-current", documentId: 7 },
          { id: "evidence-stale-copy", documentId: 8 },
        ],
      },
      {
        id: "relationship-stale",
        backingEvidence: [{ id: "evidence-stale", documentId: 8 }],
      },
      { id: "relationship-unsupported", backingEvidence: [] },
    ]);
    state.readLayer.mockImplementation(
      async (_caseId: number, layerName: string) =>
        layerName === "state_timeline"
          ? {
              state: "canonical_projection",
              outputs: [
                {
                  intake_session_id: "session-current",
                  layer_run_id: "run-state-current",
                  layer_name: layerName,
                  layer_version: "2.5.0",
                  rule_version: "2.5.0",
                  parser_version: "parser-v1",
                  input_hash: "1".repeat(64),
                  output_hash: "2".repeat(64),
                  receipt_hash: "3".repeat(64),
                  completed_at: "2026-08-30T21:00:00.000Z",
                  unresolved_dependencies: [],
                  projection_current: true,
                  data: [
                    {
                      transition_id: "transition-current",
                      source_artifact_key: "artifact-current",
                    },
                    {
                      transition_id: "transition-stale",
                      source_artifact_key: "artifact-stale",
                    },
                  ],
                },
              ],
            }
          : { state: "not_projected", outputs: [] },
    );

    const exported = await loadCurrentCaseExportData(
      { id: 44, name: "Inspection case" },
      44,
    );

    expect(exported.relationships).toEqual([
      expect.objectContaining({
        id: "relationship-current",
        backingEvidence: [
          expect.objectContaining({ id: "evidence-current", documentId: 7 }),
        ],
      }),
    ]);
    expect(exported.relationships[0].evidence).toEqual(
      exported.relationships[0].backingEvidence,
    );
    expect(exported.entities.map((entity) => entity.id)).toEqual([101]);
    expect(exported.chronology.map((event) => event.id)).toEqual([
      "event-current",
    ]);
    expect(
      exported.state_transitions.map((transition) =>
        String(transition.transition_id),
      ),
    ).toEqual(["transition-current"]);
    expect(exported.projection_scope.relationship_filter_policy).toBe(
      "at least one backing-evidence row bound to a governed source",
    );
    expect(exported.projection_scope.derived_source_filter_policy).toBe(
      "entities, chronology, relationships, and state transitions require governed source bindings",
    );
  });

  it("excludes sealed layer outputs that are not the current governed projection", async () => {
    state.readLayer.mockImplementation(
      async (_caseId: number, layerName: string) =>
        layerName === "verification_gate"
          ? {
              state: "canonical_projection",
              outputs: [
                {
                  intake_session_id: "session-stale",
                  layer_run_id: "run-stale",
                  layer_name: layerName,
                  layer_version: "2.5.0",
                  rule_version: "2.5.0",
                  parser_version: "parser-v1",
                  input_hash: "1".repeat(64),
                  output_hash: "2".repeat(64),
                  receipt_hash: "3".repeat(64),
                  completed_at: "2026-08-30T20:00:00.000Z",
                  unresolved_dependencies: [],
                  projection_current: false,
                  data: [{ verification_id: "stale-record" }],
                },
                {
                  intake_session_id: "session-current",
                  layer_run_id: "run-current",
                  layer_name: layerName,
                  layer_version: "2.5.0",
                  rule_version: "2.5.0",
                  parser_version: "parser-v1",
                  input_hash: "4".repeat(64),
                  output_hash: "5".repeat(64),
                  receipt_hash: "6".repeat(64),
                  completed_at: "2026-08-30T21:00:00.000Z",
                  unresolved_dependencies: [],
                  projection_current: true,
                  data: [{ verification_id: "current-record" }],
                },
              ],
            }
          : { state: "not_projected", outputs: [] },
    );

    const exported = await loadCurrentCaseExportData(
      { id: 44, name: "Inspection case" },
      44,
    );

    expect(
      exported.verification_records.map((row) => row.verification_id),
    ).toEqual(["current-record"]);
    expect(
      exported.layer_receipts.map((receipt) => receipt.intake_session_id),
    ).toEqual(["session-current"]);
  });
});

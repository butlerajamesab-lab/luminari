import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), project: vi.fn() }));
vi.mock("./db-legacy", () => ({ getPool: () => ({ query: mocks.query }) }));
vi.mock("./intake-case-runtime-projection", async importOriginal => ({
  ...await importOriginal<typeof import("./intake-case-runtime-projection")>(),
  project_case_entities: mocks.project,
}));

import { build_document_connections } from "./intake-document-connections";
import { listCorrelations, listCorrelationsEnriched } from "./case-runtime-read-compat";
import type { project_case_entities, SourceArtifactRow } from "./intake-case-runtime-projection";

type Projection = Awaited<ReturnType<typeof project_case_entities>>;
type Entity = Projection["canonical_entities"][number];

function artifact(documentId: number, key = `artifact-${documentId}`, session = "session-1"): SourceArtifactRow {
  return {
    intake_session_id: session,
    artifact_id: `source-${documentId}`,
    artifact_key: key,
    artifact_status: "preserved",
    preservation_integrity_status: "preserved",
    filename: `source-${documentId}.txt`,
    mime_type: "text/plain",
    metadata: { legacy_document_id: documentId },
  };
}

function mention(documentId: number, raw_text = "Resident A", span_offset = 20) {
  return { artifact_key: `artifact-${documentId}`, intake_session_id: "session-1", raw_text, span_offset };
}

function fixture(): Projection {
  const entity: Entity = {
    entity_id: "entity-resident-a",
    type: "person",
    canonical_name: "resident a",
    raw_mentions: [mention(11), mention(22, "Resident A", 4)],
  };
  return {
    state: "canonical_projection",
    canonical_entities: [entity],
    entities: [{
      id: -1, caseId: 8, canonicalEntityId: entity.entity_id,
      name: "Resident A", type: "person", description: null, aliases: null,
      engineVersion: "intake-spine:test", laneId: "universal_intake_spine",
      snapshotId: null, createdAt: null, updatedAt: null, legacyRelationId: null,
      canonicalOutputHashes: ["output-hash"], canonicalReceiptHashes: ["receipt-hash"],
      sourceDocumentIds: [11, 22], sourceMentionCount: 2,
      projectionSource: "universal_intake_spine",
    }],
    source_artifacts: new Map([["artifact-11", [artifact(11)]], ["artifact-22", [artifact(22)]]]),
  };
}

beforeEach(() => vi.resetAllMocks());

describe("source-bound document connections", () => {
  it("returns the actual paired source mentions, offsets, identities and receipts", () => {
    const projection = fixture();
    projection.canonical_entities[0].raw_mentions[0].binding_provenance_refs = ["reviewed-author:1"];
    const [connection] = build_document_connections(8, projection);
    expect(connection).toMatchObject({
      caseId: 8, sourceDocumentId: 11, targetDocumentId: 22,
      correlationType: "shared_entity", evidenceStatus: "source_linked", evidenceCount: 1,
      sharedIdentifiers: ["Resident A"], canonicalOutputHashes: ["output-hash"], canonicalReceiptHashes: ["receipt-hash"],
      basis: [{
        canonicalEntityId: "entity-resident-a", canonicalEntityName: "Resident A",
        sourceMentionCount: 1, targetMentionCount: 1,
        source: {
          documentId: 11, documentName: "source-11.txt", sourceArtifactId: "source-11",
          artifactKey: "artifact-11", sessionId: "session-1", mentionText: "Resident A",
          charStart: 20, charEnd: 30, bindingProvenanceRefs: ["reviewed-author:1"],
          sourceContext: null, sourceContextOffset: null,
        },
        target: { documentId: 22, sourceArtifactId: "source-22", charStart: 4, charEnd: 14 },
      }],
    });
    expect(connection.id).toBeLessThan(0);
    expect(Number.isSafeInteger(connection.id)).toBe(true);
    expect(connection.description).toContain("do not establish corroboration");
  });

  it("keeps document pair identity stable across ordering, duplicates and additional shared entities", () => {
    const projection = fixture();
    const original = build_document_connections(8, projection)[0];
    projection.canonical_entities[0].raw_mentions.reverse();
    projection.canonical_entities[0].raw_mentions.push(mention(11), mention(11, "Resident A", 80));
    projection.canonical_entities.unshift({
      entity_id: "entity-facility", type: "organization", canonical_name: "Sample Facility",
      raw_mentions: [mention(22, "Sample Facility", 200), mention(11, "Sample Facility", 100)],
    });
    const [updated] = build_document_connections(8, projection);
    expect(updated.id).toBe(original.id);
    expect(updated.canonicalConnectionId).toBe(original.canonicalConnectionId);
    expect(updated.evidenceCount).toBe(2);
    expect(updated.basis.find(basis => basis.canonicalEntityId === "entity-resident-a"))
      .toMatchObject({ sourceMentionCount: 2, targetMentionCount: 1 });
    expect(build_document_connections(9, projection)[0].id).not.toBe(original.id);
  });

  it("does not merge identically named anonymized staff with distinct canonical identities", () => {
    const projection = fixture();
    projection.canonical_entities = [
      { entity_id: "staff-a:document-11", canonical_name: "Staff A", type: "person", raw_mentions: [mention(11, "Staff A")] },
      { entity_id: "staff-a:document-22", canonical_name: "Staff A", type: "person", raw_mentions: [mention(22, "Staff A")] },
    ];
    expect(build_document_connections(8, projection)).toEqual([]);
  });

  it("does not turn multiple mentions in one document into a self connection", () => {
    const projection = fixture();
    projection.canonical_entities[0].raw_mentions = [mention(11), mention(11, "Resident A", 80)];
    expect(build_document_connections(8, projection)).toEqual([]);
  });

  it("does not bind a missing producing-session source to a preserved duplicate in another session", () => {
    const projection = fixture();
    projection.source_artifacts.set("artifact-22", [artifact(22, "artifact-22", "other-session")]);
    expect(build_document_connections(8, projection)).toEqual([]);
  });

  it.each(["ambiguous", "quarantined", "missing", "ineligible"])("fails closed for a %s source", state => {
    const projection = fixture();
    if (state === "ambiguous") projection.source_artifacts.get("artifact-22")!.push(artifact(33, "artifact-22"));
    if (state === "quarantined") projection.source_artifacts.get("artifact-22")![0].preservation_integrity_status = "quarantined";
    if (state === "missing") projection.source_artifacts.delete("artifact-22");
    if (state === "ineligible") projection.source_artifacts.get("artifact-22")![0].artifact_status = "deleted";
    expect(build_document_connections(8, projection)).toEqual([]);
  });

  it("rejects absent or invalid source spans", () => {
    for (const invalid of [NaN, -1, 1.5]) {
      const projection = fixture();
      projection.canonical_entities[0].raw_mentions[1].span_offset = invalid;
      expect(build_document_connections(8, projection)).toEqual([]);
    }
  });

  it("includes only exact persisted context containing the bound mention at its source offset", () => {
    const projection = fixture();
    Object.assign(projection.canonical_entities[0].raw_mentions[0], {
      source_context: "The Resident A arrived.", source_context_offset: 16,
    });
    Object.assign(projection.canonical_entities[0].raw_mentions[1], {
      source_context: "An unrelated event.", source_context_offset: 0,
    });
    const [{ basis: [basis] }] = build_document_connections(8, projection);
    expect(basis.source).toMatchObject({ sourceContext: "The Resident A arrived.", sourceContextOffset: 16 });
    expect(basis.target).toMatchObject({ sourceContext: null, sourceContextOffset: null });
  });

  it("returns every shared entity basis and separates pair count from repeated mention count", () => {
    const projection = fixture();
    projection.canonical_entities = Array.from({ length: 120 }, (_, i) => ({
      entity_id: `entity-${i}`, canonical_name: `Entity ${i}`, type: "person",
      raw_mentions: [mention(11, `Entity ${i}`, i * 20), mention(22, `Entity ${i}`, i * 20)],
    }));
    const [connection] = build_document_connections(8, projection);
    expect(connection.evidenceCount).toBe(120);
    expect(connection.basis).toHaveLength(120);
  });

  it("does not project from a noncanonical state", () => {
    expect(build_document_connections(8, { ...fixture(), state: "not_projected" })).toEqual([]);
  });
});

describe("case correlation read compatibility", () => {
  it.each([listCorrelations, listCorrelationsEnriched])("retains unsupported legacy records as unverified beside exact canonical evidence", async list => {
    mocks.project.mockResolvedValue(fixture());
    mocks.query.mockResolvedValue({ rows: [{
      id: 77, case_id: 8, source_document_id: 11, target_document_id: 22,
      correlation_type: "corroborated", source_filename: "source-11.txt", target_filename: "source-22.txt",
    }] });
    const rows = await list(8);
    expect(rows).toHaveLength(2);
    expect(rows.find(row => row.id === 77)).toMatchObject({
      correlationType: "corroborated", evidenceStatus: "unverified", evidenceCount: 0, basis: [], sharedIdentifiers: [],
    });
    expect(rows.find(row => row.id < 0)).toMatchObject({ correlationType: "shared_entity", evidenceStatus: "source_linked", evidenceCount: 1 });
    expect(mocks.query.mock.calls[0][1]).toEqual([8]);
  });

  it("propagates canonical integrity failures instead of silently returning legacy records", async () => {
    mocks.project.mockRejectedValue(new Error("sealed output hash mismatch"));
    mocks.query.mockResolvedValue({ rows: [] });
    await expect(listCorrelationsEnriched(8)).rejects.toThrow("sealed output hash mismatch");
  });
});

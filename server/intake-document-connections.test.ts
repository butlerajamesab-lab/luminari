import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), project: vi.fn() }));
vi.mock("./db-legacy", () => ({ getPool: () => ({ query: mocks.query }) }));
vi.mock("./intake-case-runtime-projection", async importOriginal => ({
  ...await importOriginal<typeof import("./intake-case-runtime-projection")>(),
  project_case_entities: mocks.project,
}));

import { build_document_connections, build_document_connection_page } from "./intake-document-connections";
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

function many_documents(count: number): Projection {
  const projection = fixture();
  projection.source_artifacts = new Map(Array.from({ length: count }, (_, i) => [`artifact-${i + 1}`, [artifact(i + 1)]]));
  projection.canonical_entities[0].raw_mentions = Array.from({ length: count }, (_, i) => mention(i + 1));
  return projection;
}

describe("bounded document-pair expansion", () => {
  it("materializes a bounded page for an entity present in thousands of sources", () => {
    const projection = many_documents(2_000);
    const page = build_document_connection_page(8, projection, { limit: 20 });
    expect(page.items).toHaveLength(20);
    expect(page.items.map(item => [item.sourceDocumentId, item.targetDocumentId])).toEqual(Array.from({ length: 20 }, (_, i) => [1, i + 2]));
    expect(page.nextCursor).toBe("1:21");
    const tail = build_document_connection_page(8, projection, { limit: 20, cursor: "1998:2000" });
    expect(tail.items.map(item => [item.sourceDocumentId, item.targetDocumentId])).toEqual([[1999, 2000]]);
    expect(tail.nextCursor).toBeNull();
  });

  it("pages overlapping entity pair streams without duplicate pairs or missing bases", () => {
    const projection = many_documents(6);
    projection.canonical_entities.push({
      entity_id: "entity-facility", type: "organization", canonical_name: "Sample Facility",
      raw_mentions: [mention(1, "Sample Facility"), mention(3, "Sample Facility"), mention(6, "Sample Facility")],
    });
    const all = [];
    let cursor: string | undefined;
    do {
      const page = build_document_connection_page(8, projection, { limit: 3, cursor });
      all.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(all).toHaveLength(15);
    expect(new Set(all.map(item => item.canonicalConnectionId)).size).toBe(15);
    expect(all.find(item => item.sourceDocumentId === 1 && item.targetDocumentId === 3)?.basis).toHaveLength(2);
    expect(all.map(item => [item.sourceDocumentId, item.targetDocumentId])).toEqual(
      Array.from({ length: 5 }, (_, i) => Array.from({ length: 5 - i }, (_, j) => [i + 1, i + j + 2])).flat(),
    );
  });

  it("applies source and filename/entity filters before paging and keeps all paired evidence", () => {
    const projection = many_documents(6);
    projection.canonical_entities.push({
      entity_id: "entity-facility", type: "organization", canonical_name: "Sample Facility",
      raw_mentions: [mention(1, "Sample Facility"), mention(3, "Sample Facility"), mention(6, "Sample Facility")],
    });
    const sourcePage = build_document_connection_page(8, projection, { limit: 2, documentId: 6 });
    expect(sourcePage.items.map(item => [item.sourceDocumentId, item.targetDocumentId])).toEqual([[1, 6], [2, 6]]);
    expect(sourcePage.nextCursor).toBe("2:6");
    const searched = build_document_connection_page(8, projection, { search: "facility", documentId: 6 });
    expect(searched.items.map(item => [item.sourceDocumentId, item.targetDocumentId])).toEqual([[1, 6], [3, 6]]);
    expect(searched.items.every(item => item.basis.length === 2)).toBe(true);
    const filename = build_document_connection_page(8, projection, { search: "source-3.txt", limit: 2 });
    expect(filename.items.map(item => [item.sourceDocumentId, item.targetDocumentId])).toEqual([[1, 3], [2, 3]]);
    expect(build_document_connection_page(8, projection, { search: "no matching source" }).items).toEqual([]);
    expect(build_document_connection_page(8, projection, { search: "shared entity", limit: 2 }).items).toHaveLength(2);
  });

  it("rejects an excessive page size or invalid cursor", () => {
    expect(() => build_document_connection_page(8, fixture(), { limit: 51 })).toThrow("page limit");
    expect(() => build_document_connection_page(8, fixture(), { cursor: "22:11" })).toThrow("cursor");
    expect(() => build_document_connection_page(8, fixture(), { cursor: "9007199254740992:9007199254740993" })).toThrow("cursor");
  });
});

describe("case correlation read compatibility", () => {
  const legacy = (id = 77) => ({
    id, case_id: 8, source_document_id: 11, target_document_id: 22,
    correlation_type: "corroborated", source_filename: "source-11.txt", target_filename: "source-22.txt",
  });

  it("keeps gate/export compatibility reads limited to recorded legacy rows and never invokes the projection", async () => {
    mocks.project.mockRejectedValue(new Error("must not be queried by legacy gate"));
    mocks.query.mockResolvedValue({ rows: [legacy()] });
    const rows = await listCorrelations(8);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 77, evidenceStatus: "unverified", evidenceCount: 0, basis: [], sharedIdentifiers: [] });
    expect(mocks.project).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls[0][1]).toEqual([8]);
  });

  it("returns source-linked inspection evidence and recorded legacy candidates through the enriched page only", async () => {
    mocks.project.mockResolvedValue(fixture());
    mocks.query.mockResolvedValue({ rows: [legacy()] });
    const page = await listCorrelationsEnriched(8);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
    expect(page.items.find(row => row.id === 77)).toMatchObject({ correlationType: "corroborated", evidenceStatus: "unverified", evidenceCount: 0 });
    expect(page.items.find(row => row.id < 0)).toMatchObject({ correlationType: "shared_entity", evidenceStatus: "source_linked", evidenceCount: 1 });
    expect(mocks.query.mock.calls[0][1]).toEqual([8, 0, null, "", 20]);
  });

  it("bounds legacy reads, resumes by recorded id, and applies the same source/search filters", async () => {
    mocks.query.mockResolvedValue({ rows: [legacy(78), legacy(79), legacy(80)] });
    const page = await listCorrelationsEnriched(8, { cursor: "legacy:77", limit: 2, documentId: 11, search: " Corroborated " });
    expect(page.items.map(item => item.id)).toEqual([78, 79]);
    expect(page.nextCursor).toBe("legacy:79");
    expect(mocks.project).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls[0][1]).toEqual([8, 77, 11, "corroborated", 3]);
    expect(mocks.query.mock.calls[0][0]).toContain("c.id > $2");
    expect(mocks.query.mock.calls[0][0]).toContain("limit $5");
  });

  it("transitions between derived and legacy pages without exceeding the page limit or hiding legacy rows", async () => {
    mocks.project.mockResolvedValue(fixture());
    mocks.query.mockResolvedValue({ rows: [legacy()] });
    const first = await listCorrelationsEnriched(8, { limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.items[0].id).toBeLessThan(0);
    expect(first.nextCursor).toBe("legacy:0");
    expect(mocks.query.mock.calls[0][1]).toEqual([8, 0, null, "", 1]);
    const second = await listCorrelationsEnriched(8, { limit: 1, cursor: first.nextCursor! });
    expect(second.items.map(item => item.id)).toEqual([77]);
    expect(second.nextCursor).toBeNull();
    expect(mocks.project).toHaveBeenCalledTimes(1);
  });

  it("does not fetch legacy records before a derived page is complete", async () => {
    mocks.project.mockResolvedValue(many_documents(6));
    const page = await listCorrelationsEnriched(8, { limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe("projected:1:3");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("propagates canonical integrity failures instead of silently returning legacy records", async () => {
    mocks.project.mockRejectedValue(new Error("sealed output hash mismatch"));
    mocks.query.mockResolvedValue({ rows: [] });
    await expect(listCorrelationsEnriched(8)).rejects.toThrow("sealed output hash mismatch");
  });
});

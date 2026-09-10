import { createHash } from "node:crypto";

import {
  project_case_entities,
  resolve_source_artifact_binding,
} from "./intake-case-runtime-projection";

type EntityProjection = Awaited<ReturnType<typeof project_case_entities>>;
type EntityMention = EntityProjection["canonical_entities"][number]["raw_mentions"][number];

export type DocumentConnectionEvidence = {
  documentId: number;
  documentName: string | null;
  sourceArtifactId: string;
  artifactKey: string;
  sessionId: string;
  mentionText: string;
  charStart: number;
  charEnd: number;
  bindingProvenanceRefs: string[];
  sourceContext: string | null;
  sourceContextOffset: number | null;
};

export type DocumentConnectionBasis = {
  canonicalEntityId: string;
  canonicalEntityName: string;
  sourceMentionCount: number;
  targetMentionCount: number;
  source: DocumentConnectionEvidence;
  target: DocumentConnectionEvidence;
};

export type DocumentConnection = {
  id: number;
  caseId: number;
  sourceDocumentId: number;
  targetDocumentId: number;
  correlationType: "shared_entity";
  description: string;
  sharedIdentifiers: string[];
  evidenceStatus: "source_linked";
  evidenceCount: number;
  basis: DocumentConnectionBasis[];
  sourceDocument: { id: number; filename: string | null; fileType: string | null };
  targetDocument: { id: number; filename: string | null; fileType: string | null };
  canonicalConnectionId: string;
  canonicalOutputHashes: string[];
  canonicalReceiptHashes: string[];
  projectionSource: "universal_intake_spine";
};

function mention_evidence(
  mention: EntityMention,
  projection: EntityProjection,
): DocumentConnectionEvidence | null {
  if (!mention.intake_session_id || typeof mention.raw_text !== "string"
    || !mention.raw_text.trim() || !Number.isSafeInteger(mention.span_offset)
    || mention.span_offset < 0) return null;

  // Match the producing session before resolving a source. An identically
  // hashed document in another session cannot rescue a missing source binding.
  const artifacts = (projection.source_artifacts.get(mention.artifact_key) ?? [])
    .filter(artifact => artifact.intake_session_id === mention.intake_session_id);
  const binding = resolve_source_artifact_binding(artifacts);
  if (binding.binding_state !== "bound" || binding.document_id === null) return null;

  const contextMention = mention as EntityMention & {
    source_context?: string;
    source_context_offset?: number;
  };
  const contextOffset = contextMention.source_context_offset;
  const context = contextMention.source_context;
  const hasExactContext = typeof context === "string"
    && Number.isSafeInteger(contextOffset)
    && contextOffset! >= 0
    && mention.span_offset >= contextOffset!
    && context.slice(mention.span_offset - contextOffset!, mention.span_offset - contextOffset! + mention.raw_text.length) === mention.raw_text;

  return {
    documentId: binding.document_id,
    documentName: binding.filename,
    sourceArtifactId: artifacts[0].artifact_id,
    artifactKey: mention.artifact_key,
    sessionId: mention.intake_session_id,
    mentionText: mention.raw_text,
    charStart: mention.span_offset,
    charEnd: mention.span_offset + mention.raw_text.length,
    bindingProvenanceRefs: [...new Set((mention.binding_provenance_refs ?? [])
      .filter(ref => typeof ref === "string" && ref.trim()))].sort(),
    sourceContext: hasExactContext ? context! : null,
    sourceContextOffset: hasExactContext ? contextOffset! : null,
  };
}

function evidence_key(evidence: DocumentConnectionEvidence): string {
  return JSON.stringify([
    evidence.sessionId, evidence.sourceArtifactId, evidence.artifactKey,
    evidence.charStart, evidence.charEnd, evidence.mentionText,
  ]);
}

export type DocumentConnectionPageOptions = {
  limit?: number;
  cursor?: string;
  documentId?: number;
  search?: string;
};
export type DocumentConnectionPage = { items: DocumentConnection[]; nextCursor: string | null };
type DocumentPair = { sourceDocumentId: number; targetDocumentId: number };
type IndexedEntity = {
  entityId: string;
  name: string;
  documents: Map<number, DocumentConnectionEvidence[]>;
  documentIds: number[];
  matchingDocumentIds: Set<number>;
  allPairsMatch: boolean;
  outputHashes: string[];
  receiptHashes: string[];
};

export function document_connection_page_limit(value = 20): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 50) throw new Error("Document connection page limit must be between 1 and 50");
  return value;
}

function parse_pair_cursor(cursor: string | undefined): DocumentPair | null {
  if (!cursor) return null;
  const match = /^(\d+):(\d+)$/.exec(cursor);
  if (!match) throw new Error("Invalid document connection cursor");
  const sourceDocumentId = Number(match[1]);
  const targetDocumentId = Number(match[2]);
  if (!Number.isSafeInteger(sourceDocumentId) || sourceDocumentId <= 0
    || !Number.isSafeInteger(targetDocumentId) || targetDocumentId <= sourceDocumentId) throw new Error("Invalid document connection cursor");
  return { sourceDocumentId, targetDocumentId };
}

function compare_pairs(a: DocumentPair, b: DocumentPair): number {
  return a.sourceDocumentId - b.sourceDocumentId || a.targetDocumentId - b.targetDocumentId;
}

function lower_bound(values: number[], value: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (values[mid] < value) low = mid + 1;
    else high = mid;
  }
  return low;
}

// Generate only requested pairs. No entity's complete document cross-product
// is created, including when a cursor starts deep into a large source set.
function* entity_pairs(entity: IndexedEntity, after: DocumentPair | null, documentId?: number): Generator<DocumentPair> {
  const ids = entity.documentIds;
  if (documentId !== undefined) {
    if (!entity.documents.has(documentId)) return;
    for (const other of ids) {
      if (other === documentId) continue;
      const pair = { sourceDocumentId: Math.min(documentId, other), targetDocumentId: Math.max(documentId, other) };
      if (after && compare_pairs(pair, after) <= 0) continue;
      if (entity.allPairsMatch || entity.matchingDocumentIds.has(documentId) || entity.matchingDocumentIds.has(other)) yield pair;
    }
    return;
  }
  const matching = ids.filter(id => entity.matchingDocumentIds.has(id));
  if (!entity.allPairsMatch && matching.length === 0) return;
  for (let sourceIndex = after ? lower_bound(ids, after.sourceDocumentId) : 0; sourceIndex < ids.length - 1; sourceIndex++) {
    const sourceDocumentId = ids[sourceIndex];
    if (!entity.allPairsMatch && !entity.matchingDocumentIds.has(sourceDocumentId) && sourceDocumentId >= matching[matching.length - 1]) return;
    const targets = entity.allPairsMatch || entity.matchingDocumentIds.has(sourceDocumentId) ? ids : matching;
    const targetMinimum = after?.sourceDocumentId === sourceDocumentId ? Math.max(sourceDocumentId + 1, after.targetDocumentId + 1) : sourceDocumentId + 1;
    for (let targetIndex = lower_bound(targets, targetMinimum); targetIndex < targets.length; targetIndex++) {
      yield { sourceDocumentId, targetDocumentId: targets[targetIndex] };
    }
  }
}

type PairFrontier = { pair: DocumentPair; iterator: Generator<DocumentPair>; entityIndex: number };
function compare_frontiers(a: PairFrontier, b: PairFrontier): number {
  return compare_pairs(a.pair, b.pair) || a.entityIndex - b.entityIndex;
}
function heap_push(heap: PairFrontier[], item: PairFrontier): void {
  heap.push(item);
  let child = heap.length - 1;
  while (child > 0) {
    const parent = (child - 1) >>> 1;
    if (compare_frontiers(heap[parent], heap[child]) <= 0) break;
    [heap[parent], heap[child]] = [heap[child], heap[parent]];
    child = parent;
  }
}
function heap_pop(heap: PairFrontier[]): PairFrontier | undefined {
  const first = heap[0];
  const last = heap.pop();
  if (!heap.length || !last) return first;
  heap[0] = last;
  let parent = 0;
  while (true) {
    const left = parent * 2 + 1;
    if (left >= heap.length) break;
    const right = left + 1;
    const child = right < heap.length && compare_frontiers(heap[right], heap[left]) < 0 ? right : left;
    if (compare_frontiers(heap[parent], heap[child]) <= 0) break;
    [heap[parent], heap[child]] = [heap[child], heap[parent]];
    parent = child;
  }
  return first;
}

/** Read-only shared mentions, paged before pair evidence is materialized. */
export function build_document_connection_page(caseId: number, projection: EntityProjection, options: DocumentConnectionPageOptions = {}): DocumentConnectionPage {
  if (!Number.isSafeInteger(caseId) || caseId <= 0) throw new Error("Invalid document connection case identity");
  const limit = document_connection_page_limit(options.limit);
  const after = parse_pair_cursor(options.cursor);
  if (options.documentId !== undefined && (!Number.isSafeInteger(options.documentId) || options.documentId <= 0)) throw new Error("Invalid document connection source document");
  if (projection.state !== "canonical_projection") return { items: [], nextCursor: null };
  const query = (options.search ?? "").trim().toLowerCase();
  const displayEntities = new Map(projection.entities.map(entity => [entity.canonicalEntityId, entity]));
  const indexed: IndexedEntity[] = [];
  for (const entity of [...projection.canonical_entities].sort((a, b) => a.entity_id.localeCompare(b.entity_id))) {
    if (!entity.entity_id || !entity.canonical_name) continue;
    const display = displayEntities.get(entity.entity_id);
    const distinct = new Map<number, Map<string, DocumentConnectionEvidence>>();
    for (const mention of entity.raw_mentions) {
      const evidence = mention_evidence(mention, projection);
      if (!evidence) continue;
      const mentions = distinct.get(evidence.documentId) ?? new Map<string, DocumentConnectionEvidence>();
      mentions.set(evidence_key(evidence), evidence);
      distinct.set(evidence.documentId, mentions);
    }
    const documents = new Map([...distinct].map(([id, mentions]) => [id, [...mentions.values()].sort((a, b) => evidence_key(a).localeCompare(evidence_key(b)))]));
    const name = display?.name ?? entity.canonical_name;
    indexed.push({
      entityId: entity.entity_id, name, documents, documentIds: [...documents.keys()].sort((a, b) => a - b),
      allPairsMatch: !query || name.toLowerCase().includes(query) || "shared_entity shared entity mentions".includes(query),
      matchingDocumentIds: new Set([...documents].filter(([, mentions]) => mentions.some(mention => mention.documentName?.toLowerCase().includes(query))).map(([id]) => id)),
      outputHashes: display?.canonicalOutputHashes ?? [], receiptHashes: display?.canonicalReceiptHashes ?? [],
    });
  }
  const heap: PairFrontier[] = [];
  indexed.forEach((entity, entityIndex) => {
    const iterator = entity_pairs(entity, after, options.documentId);
    const next = iterator.next();
    if (!next.done) heap_push(heap, { pair: next.value, iterator, entityIndex });
  });
  const requestedPairs: DocumentPair[] = [];
  while (heap.length && requestedPairs.length <= limit) {
    const frontier = heap_pop(heap)!;
    const prior = requestedPairs.at(-1);
    if (!prior || compare_pairs(prior, frontier.pair) !== 0) requestedPairs.push(frontier.pair);
    if (requestedPairs.length > limit) break;
    const next = frontier.iterator.next();
    if (!next.done) heap_push(heap, { ...frontier, pair: next.value });
  }
  const hasMore = requestedPairs.length > limit;
  const items = requestedPairs.slice(0, limit).map(pair => {
    // Match all indexed entities for each selected pair, including entities
    // that did not match the search term. A filter never truncates its proof.
    const shared = indexed.filter(entity => entity.documents.has(pair.sourceDocumentId) && entity.documents.has(pair.targetDocumentId));
    const basis = shared.map(entity => ({
      canonicalEntityId: entity.entityId, canonicalEntityName: entity.name,
      sourceMentionCount: entity.documents.get(pair.sourceDocumentId)!.length,
      targetMentionCount: entity.documents.get(pair.targetDocumentId)!.length,
      source: entity.documents.get(pair.sourceDocumentId)![0], target: entity.documents.get(pair.targetDocumentId)![0],
    }));
    const pairKey = `${pair.sourceDocumentId}:${pair.targetDocumentId}:shared_entity`;
    const digest = createHash("sha256").update(`document_connection:${caseId}:${pairKey}`).digest("hex");
    return {
      id: -(Number.parseInt(digest.slice(0, 13), 16) + 1), caseId, ...pair,
      correlationType: "shared_entity" as const,
      description: "These documents mention the same entity. Shared mentions alone do not establish corroboration or independent sources.",
      sharedIdentifiers: basis.map(value => value.canonicalEntityName), evidenceStatus: "source_linked" as const,
      evidenceCount: basis.length, basis,
      sourceDocument: { id: pair.sourceDocumentId, filename: basis[0].source.documentName, fileType: null },
      targetDocument: { id: pair.targetDocumentId, filename: basis[0].target.documentName, fileType: null },
      canonicalConnectionId: `document_connection:${digest}`,
      canonicalOutputHashes: [...new Set(shared.flatMap(entity => entity.outputHashes))].sort(),
      canonicalReceiptHashes: [...new Set(shared.flatMap(entity => entity.receiptHashes))].sort(),
      projectionSource: "universal_intake_spine" as const,
    };
  });
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error("Document connection projection identity collision");
  const last = items.at(-1);
  return { items, nextCursor: hasMore && last ? `${last.sourceDocumentId}:${last.targetDocumentId}` : null };
}

// Compatibility for pure projection callers: bounded to the first page.
export function build_document_connections(caseId: number, projection: EntityProjection): DocumentConnection[] {
  return build_document_connection_page(caseId, projection).items;
}

export async function project_case_document_connections(caseId: number, options: DocumentConnectionPageOptions = {}): Promise<DocumentConnectionPage> {
  return build_document_connection_page(caseId, await project_case_entities(caseId), options);
}

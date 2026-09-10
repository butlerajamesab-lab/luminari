export const ENTITY_TYPE_COLORS: Record<string, string> = {
  person: '#60a5fa', organization: '#f59e0b', address: '#34d399',
  contact: '#22d3ee', unknown: '#94a3b8', document: '#a78bfa',
};

export type GraphEntity = {
  id: number;
  name: string;
  type: string;
  sourceDocumentIds?: number[];
  sourceMentionCount?: number;
};
export type GraphDocument = { id: number; filename: string };
export type GraphEvidence = {
  id: number;
  documentId: number;
  documentFilename?: string | null;
  quoteText?: string | null;
  pageNumber?: number | null;
  canonical_artifact_key?: string;
  canonical_marker_offset?: number;
  canonical_marker_text?: string;
};
export type GraphRelationship = {
  id: number;
  sourceEntityId: number;
  targetEntityId: number;
  relationshipType: string;
  description?: string | null;
  evidenceCount?: number;
  evidence?: GraphEvidence[];
  backingEvidence?: GraphEvidence[];
};
export type EvidenceGraphNode = {
  id: string;
  kind: 'entity' | 'document';
  name: string;
  type: string;
  color: string;
  val: number;
  entityId?: number;
  documentId?: number;
  sourceDocumentIds: number[];
  sourceMentionCount: number;
  explicitConnectionCount: number;
  x?: number;
  y?: number;
};
export type EvidenceGraphLink = {
  id: string;
  kind: 'relationship' | 'document_mention';
  source: string;
  target: string;
  label: string;
  description?: string | null;
  relId?: number;
  entityId?: number;
  documentId?: number;
  evidenceCount: number;
};
export type EvidenceGraphOptions = {
  documentId: number | null;
  excludedEntityTypes: ReadonlySet<string>;
  relationshipType: string | null;
  connectedOnly: boolean;
  showRelationships: boolean;
  showDocumentMentions: boolean;
  documentEntityIds?: ReadonlySet<number>;
};

export function evidenceForDocument(relationship: GraphRelationship, documentId: number | null) {
  const evidence = relationship.evidence ?? relationship.backingEvidence ?? [];
  return documentId === null ? evidence : evidence.filter(row => row.documentId === documentId);
}

/** Read-only graph projection: source membership is never a personal relationship. */
export function buildEvidenceGraph(
  entities: GraphEntity[],
  relationships: GraphRelationship[],
  documents: GraphDocument[],
  options: EvidenceGraphOptions,
) {
  const scopedEntities = entities.filter(entity => options.documentId === null
    || entity.sourceDocumentIds?.includes(options.documentId)
    || options.documentEntityIds?.has(entity.id));
  const scopedRelationships = relationships.filter(relationship =>
    (options.documentId === null || evidenceForDocument(relationship, options.documentId).length > 0)
    && (options.relationshipType === null || relationship.relationshipType === options.relationshipType));
  const typedEntities = scopedEntities.filter(entity => !options.excludedEntityTypes.has(entity.type));
  const typedIds = new Set(typedEntities.map(entity => entity.id));
  const boundedRelationships = scopedRelationships.filter(relationship =>
    typedIds.has(relationship.sourceEntityId) && typedIds.has(relationship.targetEntityId));
  const counts = new Map<number, number>();
  for (const relationship of boundedRelationships) {
    for (const id of [relationship.sourceEntityId, relationship.targetEntityId]) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  const visibleEntities = typedEntities.filter(entity => !options.connectedOnly || counts.has(entity.id));
  const nodes: EvidenceGraphNode[] = visibleEntities.map(entity => ({
    id: `e-${entity.id}`, kind: 'entity', name: entity.name, type: entity.type,
    color: ENTITY_TYPE_COLORS[entity.type] ?? '#94a3b8', entityId: entity.id,
    val: Math.max(2, Math.min(12, (counts.get(entity.id) ?? 0) * 2)),
    sourceDocumentIds: [...new Set(entity.sourceDocumentIds ?? (
      options.documentId !== null && options.documentEntityIds?.has(entity.id) ? [options.documentId] : []
    ))].sort((a, b) => a - b),
    sourceMentionCount: entity.sourceMentionCount ?? 0,
    explicitConnectionCount: counts.get(entity.id) ?? 0,
  }));
  const nodeIds = new Set(nodes.map(node => node.id));
  const links: EvidenceGraphLink[] = options.showRelationships ? boundedRelationships
    .filter(relationship => nodeIds.has(`e-${relationship.sourceEntityId}`) && nodeIds.has(`e-${relationship.targetEntityId}`))
    .map(relationship => ({
      id: `r-${relationship.id}`, kind: 'relationship',
      source: `e-${relationship.sourceEntityId}`, target: `e-${relationship.targetEntityId}`,
      label: relationship.relationshipType, description: relationship.description,
      relId: relationship.id,
      evidenceCount: evidenceForDocument(relationship, options.documentId).length ||
        (options.documentId === null ? relationship.evidenceCount ?? 0 : 0),
    })) : [];

  if (options.showDocumentMentions) {
    const documentMap = new Map(documents.map(document => [document.id, document]));
    for (const entity of nodes.filter(node => node.kind === 'entity')) {
      for (const documentId of entity.sourceDocumentIds) {
        if (options.documentId !== null && documentId !== options.documentId) continue;
        const document = documentMap.get(documentId);
        if (!document) continue;
        const documentNodeId = `d-${documentId}`;
        if (!nodeIds.has(documentNodeId)) {
          nodes.push({
            id: documentNodeId, kind: 'document', name: document.filename, type: 'document',
            color: ENTITY_TYPE_COLORS.document, documentId, val: 5,
            sourceDocumentIds: [documentId], sourceMentionCount: 0, explicitConnectionCount: 0,
          });
          nodeIds.add(documentNodeId);
        }
        links.push({
          id: `m-${entity.entityId}-${documentId}`, kind: 'document_mention',
          source: entity.id, target: documentNodeId, label: 'Mentioned in document',
          entityId: entity.entityId, documentId, evidenceCount: 0,
        });
      }
    }
  }
  return { nodes, links, scopedEntityCount: scopedEntities.length, availableRelationshipCount: boundedRelationships.length };
}

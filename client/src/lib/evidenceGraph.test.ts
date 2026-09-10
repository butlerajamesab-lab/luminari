import { describe, expect, it } from 'vitest';
import { buildEvidenceGraph, evidenceForDocument, type EvidenceGraphOptions } from './evidenceGraph';

const entities = [
  { id: -1, name: 'Jordan', type: 'person', sourceDocumentIds: [10], sourceMentionCount: 3 },
  { id: -2, name: 'Rowan', type: 'person', sourceDocumentIds: [10, 20], sourceMentionCount: 5 },
  { id: -3, name: 'Harbor Care Home', type: 'organization', sourceDocumentIds: [20], sourceMentionCount: 7 },
  { id: -4, name: 'Staff 1', type: 'person', sourceDocumentIds: [10], sourceMentionCount: 1 },
  { id: -5, name: 'Staff 1', type: 'person', sourceDocumentIds: [20], sourceMentionCount: 1 },
];
const documents = [{ id: 10, filename: 'messages.xml' }, { id: 20, filename: 'inspection.pdf' }];
const relationships = [{
  id: -8, sourceEntityId: -1, targetEntityId: -2, relationshipType: 'caregiver_recipient',
  evidence: [{ id: -9, documentId: 10, quoteText: 'I am Rowan’s caregiver.' }],
}];
const defaults: EvidenceGraphOptions = {
  documentId: null, excludedEntityTypes: new Set(), relationshipType: null,
  connectedOnly: false, showRelationships: true, showDocumentMentions: false,
};

describe('source-bound evidence graph views', () => {
  it('shows facilities and unconnected people without inventing relationships', () => {
    const graph = buildEvidenceGraph(entities, relationships, documents, defaults);
    expect(graph.nodes).toHaveLength(5);
    expect(graph.links).toHaveLength(1);
    expect(graph.nodes.find(node => node.entityId === -3)?.explicitConnectionCount).toBe(0);
  });
  it('renders entities even when the completed relationship output is empty', () => {
    expect(buildEvidenceGraph(entities, [], documents, defaults).nodes).toHaveLength(5);
  });
  it('scopes nodes and explicit proof to the chosen document', () => {
    const graph = buildEvidenceGraph(entities, relationships, documents, { ...defaults, documentId: 20 });
    expect(graph.nodes.map(node => node.entityId)).toEqual([-2, -3, -5]);
    expect(graph.links).toEqual([]);
    expect(evidenceForDocument(relationships[0], 20)).toEqual([]);
  });
  it('shows separately typed document membership without joining people who share a document', () => {
    const graph = buildEvidenceGraph(entities, relationships, documents, { ...defaults, showDocumentMentions: true });
    expect(graph.nodes.filter(node => node.kind === 'document')).toHaveLength(2);
    expect(graph.links.filter(link => link.kind === 'relationship')).toHaveLength(1);
    expect(graph.links.filter(link => link.kind === 'document_mention')).toHaveLength(6);
    expect(graph.links.filter(link => link.kind === 'document_mention').every(link => link.target.startsWith('d-'))).toBe(true);
    expect(graph.nodes.filter(node => node.name === 'Staff 1')).toHaveLength(2);
  });
  it('treats connected-only as an explicit opt-in and keeps edge endpoints inside type filters', () => {
    expect(buildEvidenceGraph(entities, relationships, documents, { ...defaults, connectedOnly: true }).nodes.map(node => node.entityId))
      .toEqual([-1, -2]);
    const facilities = buildEvidenceGraph(entities, relationships, documents, { ...defaults, excludedEntityTypes: new Set(['person']) });
    expect(facilities.nodes.map(node => node.name)).toEqual(['Harbor Care Home']);
    expect(facilities.links).toEqual([]);
  });
  it('can hide personal relationship lines without removing source entities', () => {
    const graph = buildEvidenceGraph(entities, relationships, documents, { ...defaults, showRelationships: false });
    expect(graph.nodes).toHaveLength(5);
    expect(graph.links).toEqual([]);
  });
  it('supports the existing selected-document roles as a membership fallback', () => {
    const graph = buildEvidenceGraph([{ id: -1, name: 'Jordan', type: 'person' }], [], documents, {
      ...defaults, documentId: 10, documentEntityIds: new Set([-1]), showDocumentMentions: true,
    });
    expect(graph.nodes.map(node => node.kind)).toEqual(['entity', 'document']);
    expect(graph.links[0].kind).toBe('document_mention');
  });
});

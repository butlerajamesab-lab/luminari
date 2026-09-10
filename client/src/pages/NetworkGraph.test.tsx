import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  search: '', entities: {} as any, relationships: {} as any, projected: true,
  documents: {} as any, documentRoles: vi.fn(), entityRoles: vi.fn(), graph: vi.fn(),
}));
vi.mock('wouter', () => ({ useSearch: () => state.search, useLocation: () => ['/network', vi.fn()] }));
vi.mock('@/contexts/CaseContext', () => ({ useCase: () => ({ currentCaseId: 44 }) }));
vi.mock('@/components/ReadAloud', () => ({ default: () => null }));
vi.mock('react-force-graph-2d', () => ({ default: (props: any) => {
  state.graph(props.graphData); return <div>Graph canvas</div>;
} }));
vi.mock('@/lib/trpc', () => ({ trpc: {
  entities: { list: { useQuery: () => state.entities }, roles: { useQuery: state.entityRoles } },
  relationships: { list: { useQuery: () => state.relationships }, evidence: { useQuery: () => ({ data: [] }) } },
  documents: { list: { useQuery: () => state.documents }, entityRoles: { useQuery: state.documentRoles } },
  analyze: { getIntakeRelationshipProjection: { useQuery: () => ({ data: { projection_state: state.projected ? 'canonical_projection' : 'not_projected', outputs: [] } }) } },
} }));

import NetworkGraph from './NetworkGraph';

beforeEach(() => {
  vi.clearAllMocks(); state.search = ''; state.projected = true;
  state.entities = { data: [
    { id: -1, name: 'Harbor Care Home', type: 'organization', sourceDocumentIds: [10], sourceMentionCount: 5 },
    { id: -2, name: 'Staff 1', type: 'unknown', sourceDocumentIds: [20], sourceMentionCount: 2 },
  ] };
  state.relationships = { data: [] };
  state.documents = { data: [{ id: 10, filename: 'report.pdf' }, { id: 20, filename: 'messages.xml' }] };
  state.documentRoles.mockReturnValue({ data: [] }); state.entityRoles.mockReturnValue({ data: [] });
});

describe('network graph evidence navigation', () => {
  it('renders the actual graph canvas with zero explicit edges and all registered entities', () => {
    const html = renderToStaticMarkup(<NetworkGraph />);
    expect(html).toContain('Graph canvas');
    expect(html).toContain('Type not established');
    expect(state.graph.mock.lastCall?.[0].nodes.filter((node: any) => node.kind === 'entity')).toHaveLength(2);
    expect(state.graph.mock.lastCall?.[0].links.filter((link: any) => link.kind === 'relationship')).toEqual([]);
    expect(state.graph.mock.lastCall?.[0].links.filter((link: any) => link.kind === 'document_mention')).toHaveLength(2);
    expect(html).toContain('No explicit relationships are recorded in this view.');
    expect(state.entityRoles.mock.lastCall?.[1]).toMatchObject({ enabled: false });
    expect(state.documentRoles.mock.lastCall?.[1]).toMatchObject({ enabled: false });
  });
  it('distinguishes an unexecuted relationship layer from a completed zero-edge projection', () => {
    state.projected = false;
    const html = renderToStaticMarkup(<NetworkGraph />);
    expect(html).toContain('Graph canvas');
    expect(html).toContain('The relationship layer has no eligible sealed projection yet.');
    expect(html).not.toContain('No explicit relationships are recorded in this view.');
  });
  it('opens a document-scoped graph with distinguishable document mention links', () => {
    state.search = 'documentId=10';
    const html = renderToStaticMarkup(<NetworkGraph />);
    expect(html).toContain('Graph canvas');
    const graph = state.graph.mock.lastCall?.[0];
    expect(graph.nodes.map((node: any) => node.name)).toEqual(['Harbor Care Home', 'report.pdf']);
    expect(graph.links.map((link: any) => link.kind)).toEqual(['document_mention']);
    expect(state.documentRoles.mock.lastCall).toEqual([{ documentId: 10 }, { enabled: true }]);
  });
  it('does not show a different document as a successful scope for an unavailable ID', () => {
    state.search = 'documentId=999';
    const html = renderToStaticMarkup(<NetworkGraph />);
    expect(html).toContain('This document is not available in the selected case');
    expect(state.graph).not.toHaveBeenCalled();
    expect(state.documentRoles.mock.lastCall?.[1]).toMatchObject({ enabled: false });
  });
  it('withholds cached source names when an evidence query denies access', () => {
    state.entities.error = { message: 'Access denied' };
    const html = renderToStaticMarkup(<NetworkGraph />);
    expect(html).toContain('Access denied');
    expect(html).not.toContain('report.pdf');
    expect(state.graph).not.toHaveBeenCalled();
  });
});

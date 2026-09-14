import { renderToStaticMarkup as render_markup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const ui = vi.hoisted(() => ({
  search: '', hook_index: 0, stored_state: [] as unknown[],
  selected: {} as Record<string, any>, edges: {} as Record<string, any>, source: {} as Record<string, any>,
  node_query: vi.fn(),edge_query: vi.fn(),source_query: vi.fn(),unresolved_query: vi.fn(),navigate: vi.fn(),
}));
vi.mock('react', async import_original => {
  const actual = await import_original<typeof import('react')>();
  return { ...actual,useState: (initial: unknown) => {
    const index = ui.hook_index++;
    return actual.useState(ui.stored_state[index] ?? initial);
  } };
});
vi.mock('wouter', () => ({ useSearch: () => ui.search,useLocation: () => ['/architecture-map',ui.navigate] }));
vi.mock("@/lib/trpc", () => ({ trpc: { canonicalCore: {
  graph_node_page: { useQuery: ui.node_query },graph_edge_page: { useQuery: ui.edge_query },
  graph_node_source: { useQuery: ui.source_query },unresolved_relationship_page: { useQuery: ui.unresolved_query },
} } }));
import CurrentCorpusConnections, { ResourceReviewPresentation } from "./CurrentCorpusConnections";

const pending = () => ({ isLoading: true,isFetching: true,isSuccess: false,isError: false,refetch: vi.fn() });
function render_inspector() {
  ui.hook_index = 0;
  return render_markup(<CurrentCorpusConnections object_classes={['resource']} />);
}
function open_selection(node_type: string, node_id: string) {
  ui.search = new URLSearchParams({ object_class: node_type,node_id }).toString();
  ui.selected = { isSuccess: true,isFetching: false,data: { total: 1,items: [{ node_id,label: 'Selected source' }] } };
}
beforeEach(() => {
  vi.clearAllMocks();
  ui.search = ''; ui.hook_index = 0; ui.stored_state = [];
  ui.selected = pending(); ui.edges = pending(); ui.source = pending();
  ui.node_query.mockImplementation(input => input.node_id ? ui.selected : {
    isSuccess: true,data: { total: 1,items: [{ node_id: 'object:old',label: 'Cached class result' }] },
  });
  ui.edge_query.mockImplementation(() => ui.edges);
  ui.source_query.mockImplementation(() => ui.source);
  ui.unresolved_query.mockImplementation(() => pending());
});

it('loads only the selected record first, then source/edges, then unresolved declarations', () => {
  ui.search = 'object_class=source_artifact&node_id=artifact%3Aexact';
  render_inspector();
  expect(ui.node_query.mock.calls.map(call => call[1].enabled)).toEqual([false,true]);
  expect(ui.edge_query.mock.lastCall?.[1].enabled).toBe(false);
  expect(ui.source_query.mock.lastCall?.[1].enabled).toBe(false);
  expect(ui.unresolved_query.mock.lastCall?.[1].enabled).toBe(false);
  open_selection('source_artifact','artifact:exact');
  const html = render_inspector();
  expect(html).not.toContain('Cached class result');
  expect(html).toContain('Browse this record class');
  expect(ui.edge_query.mock.lastCall?.[1].enabled).toBe(true);
  expect(ui.source_query.mock.lastCall?.[1].enabled).toBe(true);
  expect(ui.unresolved_query.mock.lastCall?.[1].enabled).toBe(false);
  ui.edges = { isSuccess: true,isFetching: false,data: { total: 0,items: [] } };
  render_inspector();
  expect(ui.unresolved_query.mock.lastCall?.[1].enabled).toBe(true);
});

it('changes identity at offset zero before issuing requests and restores the prior class search on back navigation', () => {
  const prior_scope = JSON.stringify(['resource','object:denver','Denver Rescue Mission']);
  ui.stored_state = [
    { object_class: 'resource',query: 'Denver Rescue Mission',submitted_query: 'Denver Rescue Mission' },
    { scope: prior_scope,offset: 25 },{ scope: prior_scope,offset: 25 },{ scope: prior_scope,offset: 25 },
  ];
  open_selection('source_artifact','artifact:exact');
  render_inspector();
  expect(ui.node_query.mock.lastCall?.[0]).toMatchObject({ node_id: 'artifact:exact' });
  expect(ui.node_query.mock.calls[0][0]).toMatchObject({ query: undefined,offset: 0 });
  expect(ui.edge_query.mock.lastCall?.[0]).toMatchObject({ node_id: 'artifact:exact',offset: 0 });
  expect(ui.unresolved_query.mock.lastCall?.[0].offset).toBe(0);
  open_selection('resource','object:denver');
  render_inspector();
  expect(ui.edge_query.mock.lastCall?.[0]).toMatchObject({ node_id: 'object:denver',offset: 25 });
  ui.search = 'object_class=resource';
  render_inspector();
  const class_call = ui.node_query.mock.calls.at(-2)!;
  expect(class_call[0]).toMatchObject({ query: 'Denver Rescue Mission',offset: 0 });
  expect(class_call[1].enabled).toBe(true);
  expect(ui.edge_query.mock.lastCall?.[1].enabled).toBe(false);
  expect(ui.source_query.mock.lastCall?.[1].enabled).toBe(false);
});

it('does not open or inspect an arbitrarily selected ambiguous identity or stale cached item', () => {
  open_selection('resource','object:denver');
  ui.selected.data.total = 2;
  expect(render_inspector()).toContain('matches multiple current records');
  expect(ui.edge_query.mock.lastCall?.[1].enabled).toBe(false);
  expect(ui.source_query.mock.lastCall?.[1].enabled).toBe(false);
  ui.selected.data.total = 1;
  ui.selected.data.items[0].node_id = 'object:other';
  render_inspector();
  expect(ui.edge_query.mock.lastCall?.[1].enabled).toBe(false);
});

it('offers source-access retry independently when the selected record loaded', () => {
  open_selection('source_artifact','artifact:exact');
  ui.source = { isError: true,error: new Error('timeout'),refetch: vi.fn() };
  expect(render_inspector()).toContain('Retry source access');
});

it("shows reviewed categories, original values and both limited review receipts", () => {
  const html = render_markup(<ResourceReviewPresentation value={{
    recorded_label: "📞 303-297-1815 · denverrescuemission.org",
    recorded_category: "cash_assistance_income",
    reviewed_primary_category: "housing",
    reviewed_category_memberships: ["housing", "food_nutrition"],
    source_transcription_correction: { revision_id: "transcription-source-receipt" },
    category_review: { revision_id: "classification-source-receipt" },
  }} />);
  expect(html).toContain("Reviewed primary category: housing");
  expect(html).toContain("Additional service interpretations: food nutrition");
  expect(html).toContain("303-297-1815");
  expect(html).toContain("cash_assistance_income");
  expect(html).toContain("transcription-source-receipt");
  expect(html).toContain("classification-source-receipt");
  expect(html).toContain("do not verify service suitability or legal applicability");
});

it("does not imply a review exists for an unreviewed source", () => {
  expect(render_markup(<ResourceReviewPresentation value={null} />)).toBe("");
});

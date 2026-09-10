import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  connections: {} as any,
  documents: {} as any,
  events: {} as any,
  readConnections: vi.fn(),
  readDocuments: vi.fn(),
  readEvents: vi.fn(),
}));

vi.mock("wouter", () => ({ useLocation: () => ["/findings", vi.fn()] }));
vi.mock("@/contexts/CaseContext", () => ({ useCase: () => ({ currentCaseId: 44 }) }));
vi.mock("@/core/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 1 } }) }));
vi.mock("@/components/ReadAloud", () => ({ default: () => null }));
vi.mock("@/components/PageReadAloud", () => ({ default: () => null }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  correlations: { listEnriched: { useInfiniteQuery: state.readConnections } },
  documents: { list: { useQuery: state.readDocuments } },
  events: { list: { useQuery: state.readEvents } },
} }));

import { CorrelationsTab } from "./Findings";
import Timeline from "./Timeline";

function connection(id: number, filename: string) {
  return {
    id, caseId: 44, sourceDocumentId: id, targetDocumentId: id + 10,
    correlationType: "corroborating_events", evidenceStatus: "unverified", basis: [],
    sourceDocument: { id, filename }, targetDocument: { id: id + 10, filename: `target-${id}.pdf` },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.connections = {
    data: { pages: [{ items: [], nextCursor: null }] },
    error: null, isLoading: false, hasNextPage: false, isFetchingNextPage: false,
    refetch: vi.fn(), fetchNextPage: vi.fn(),
  };
  state.documents = { data: [{ id: 12, filename: "document-with-no-connections.pdf" }], error: null };
  state.events = { data: undefined, error: null };
  state.readConnections.mockImplementation(() => state.connections);
  state.readDocuments.mockImplementation(() => state.documents);
  state.readEvents.mockImplementation(() => state.events);
});

describe("Findings document connection pages", () => {
  it("keeps all document and search filters usable when the server returns zero matches", () => {
    const html = renderToStaticMarkup(<CorrelationsTab caseId={44} />);
    expect(html).toContain('aria-label="Filter document connections"');
    expect(html).toContain('aria-label="Search document connections"');
    expect(html).toContain("document-with-no-connections.pdf");
    expect(html).toContain("No document connections match these filters.");
    expect(state.readConnections.mock.lastCall?.[0]).toEqual({ caseId: 44, limit: 20, documentId: undefined, search: undefined });
    expect(state.readDocuments.mock.lastCall?.[0]).toEqual({ caseId: 44 });
    expect(state.readEvents.mock.lastCall?.[1]).toMatchObject({ enabled: false });
  });

  it("renders appended pages without treating loaded rows as an overall total", () => {
    state.connections.data.pages = [
      { items: [connection(1, "page-one.pdf")], nextCursor: "cursor-one" },
      { items: [connection(2, "page-two.pdf")], nextCursor: "cursor-two" },
    ];
    state.connections.hasNextPage = true;
    const html = renderToStaticMarkup(<CorrelationsTab caseId={44} />);
    expect(html).toContain("page-one.pdf");
    expect(html).toContain("page-two.pdf");
    expect(html).toContain("2 connections loaded · more available");
    expect(html).toContain("Load more connections");
    expect(html.match(/Unverified candidate/g)).toHaveLength(2);
    const options = state.readConnections.mock.lastCall?.[1];
    expect(options.getNextPageParam({ nextCursor: "opaque-cursor" })).toBe("opaque-cursor");
    expect(options.getNextPageParam({ nextCursor: null })).toBeUndefined();
  });

  it("disables additional page requests while the next page loads", () => {
    state.connections.hasNextPage = true;
    state.connections.isFetchingNextPage = true;
    const html = renderToStaticMarkup(<CorrelationsTab caseId={44} />);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Loading connections…<\/button>/);
  });

  it("retains filters after a first-page error so the user can change the query", () => {
    state.connections.data = undefined;
    state.connections.error = new Error("Temporarily unavailable");
    const html = renderToStaticMarkup(<CorrelationsTab caseId={44} />);
    expect(html).toContain("Document connections could not be loaded.");
    expect(html).toContain('aria-label="Filter document connections"');
    expect(html).toContain('aria-label="Search document connections"');
    expect(html).not.toContain("No document connections match these filters.");
  });

  it.each([
    ["connections", "UNAUTHORIZED"], ["connections", "FORBIDDEN"],
    ["documents", "UNAUTHORIZED"], ["documents", "FORBIDDEN"],
    ["events", "UNAUTHORIZED"], ["events", "FORBIDDEN"],
  ] as const)("withholds cached source names after %s returns %s", (query, code) => {
    state.connections.data.pages = [{ items: [connection(1, "cached-private-source.pdf")], nextCursor: null }];
    state[query].error = { message: "Access denied", data: { code } };
    const html = renderToStaticMarkup(<CorrelationsTab caseId={44} />);
    expect(html).not.toContain("cached-private-source.pdf");
    expect(html).not.toContain("document-with-no-connections.pdf");
    expect(html).toContain("Access to these source records is unavailable.");
  });
});

describe("Chronology source access", () => {
  it("labels a source-local timestamp and preserves the original calendar day without claiming UTC", () => {
    state.events.data = [{
      id: "local-event", title: "I visited the facility.", documentId: 12,
      documentFilename: "messages.html", dateOccurred: "2026-01-05",
      projection_source: "universal_intake_spine", canonical_date_precision: "exact",
      canonical_verification_status: "document_stated",
      source_message_local_time: "2026-01-05T23:59:42", source_message_timezone: "unknown",
      source_message_timestamp_text: "Jan 5, 2026 11:59:42 PM",
    }];
    const html = renderToStaticMarkup(<Timeline />);
    expect(html).toContain("Source time: Jan 5, 2026 11:59:42 PM · timezone not recorded");
    expect(html).toContain("2026-01-05 · Exact Date");
    expect(html).toContain("Document Stated");
    expect(html).not.toContain("2026-01-06");
    expect(html).not.toContain("UTC");
  });
  it.each([
    ["events", "UNAUTHORIZED"], ["events", "FORBIDDEN"],
    ["documents", "UNAUTHORIZED"], ["documents", "FORBIDDEN"],
  ] as const)("withholds cached chronology and document names after %s returns %s", (query, code) => {
    state.events.data = [{
      id: "private-event", title: "Private source statement", documentId: 12,
      documentFilename: "private-document.pdf", projection_source: "universal_intake_spine",
      canonical_source_artifact_key: "private-artifact", canonical_verification_status: "document_stated",
    }];
    const beforeDenial = renderToStaticMarkup(<Timeline />);
    expect(beforeDenial).toContain("Private source statement");
    expect(beforeDenial).toContain("document-with-no-connections.pdf");
    state[query].error = { message: "Access denied", data: { code } };
    const html = renderToStaticMarkup(<Timeline />);
    expect(html).not.toContain("Private source statement");
    expect(html).not.toContain("private-document.pdf");
    expect(html).not.toContain("document-with-no-connections.pdf");
    expect(html).not.toContain("private-artifact");
    expect(html).toContain('role="alert"');
  });
});

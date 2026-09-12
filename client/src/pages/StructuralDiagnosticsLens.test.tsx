import type { PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  results: {} as Record<string, any>,
  reads: {} as Record<string, any>,
  world: vi.fn(),
  user: { id: 1 } as { id: number } | null,
}));
vi.mock("@/core/hooks/useAuth", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("wouter", () => ({
  useSearch: () => "",
  useLocation: () => ["/diagnostics", vi.fn()],
}));
vi.mock("@/hooks/useWorldIndex", () => ({ useWorldIndex: state.world }));
vi.mock("@/components/signal-architecture/SignalArtifactContext", () => ({
  SignalArtifactContext: () => null,
}));
// Render cached tab contents together to exercise every response shape, including
// inactive queries. Radix normally withholds these panels until selected.
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: PropsWithChildren) => <div>{children}</div>,
  TabsList: ({ children }: PropsWithChildren) => <div>{children}</div>,
  TabsTrigger: ({ children }: PropsWithChildren) => <button>{children}</button>,
  TabsContent: ({ children }: PropsWithChildren) => (
    <section>{children}</section>
  ),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    dualLens: new Proxy(
      {},
      {
        get: (_target, name: string) => ({
          useQuery: (_input: unknown, options: any) => {
            state.reads[name] = options;
            const result = state.results[name];
            return {
              ...result,
              data:
                result.data === undefined
                  ? undefined
                  : options.select(result.data),
              refetch: vi.fn(),
            };
          },
        }),
      },
    ),
  },
}));

import StructuralDiagnosticsLens, { formatRecordedConfidence, formatTimeAgo } from "./StructuralDiagnosticsLens";

beforeEach(() => {
  state.reads = {};
  state.user = { id: 1 };
  state.world.mockReset();
  const responses = {
    stats: {
      structural_diagnostics: {
        doctrines: 15,
        signals: 173,
        barriers: 10,
        detected_signals: 6,
      },
      graph: {
        name: "canonical_civic_graph",
        edges: null,
        structural_edges: null,
        semantic_edges: null,
        unresolved_relationships: null,
        available: false,
        reason: "The canonical graph summary timed out. Retry after the current database load clears.",
        contract: null,
      },
    },
    getBarrierClusters: {
      clusters: [
        { type: "procedural", count: 7, severity: "high", barriers: [] },
      ],
      total_barriers: 7,
      operational_references: [{ id: 2, name: "Ingestion backlog", description: "Operational reference" }],
    },
    getDoctrineClusters: {
      clusters: [
        {
          category: "civil rights",
          count: 1,
          doctrines: [{ id: 1, name: "Equal protection" }],
        },
      ],
      total_doctrines: 1,
      returned_doctrines: 1,
      next_offset: null,
      doctrine_edges: 0,
      doctrine_edges_available: false,
      doctrine_edges_unavailable_reason: "The doctrine graph count is unavailable.",
    },
    getAffectedInstitutions: {
      institutions: [
        {
          id: 1,
          agency: "Test Agency",
          agency_short: "TEST",
          domain: "housing",
          signal_count: 12,
          barrier_count: 3,
          issue_score: null,
          statute: "Saved authority",
          attribution_status: "not_established",
        },
      ],
      total_agencies: 40,
      total_signals: 173,
    },
    getSignalPatterns: {
      patterns: [
        {
          type: "repeated_denial",
          count: 2,
          signals: [
            {
              id: 1,
              signal_type: "repeated_denial", domain: "employment",
              explanation: "A recorded signal explanation",
            },
          ],
        },
      ],
      total_signals: 2,
    },
    getSystemicPaths: {
      paths: [
        {
          barrier: "procedural_delay",
          severity: "high",
          doctrineLink: "review",
          statuteLink: "",
          reformPath: "Clarify the review procedure",
          authority_refs: ["Saved authority"],
          reference_scope: "catalog_reference",
        },
      ],
      total_barriers: 10,
      total_doctrines: 15,
    },
    getLiveSignalsForDiagnostics: {
      items: [{ record_id: "current-1", title: "Current candidate", description: "Recorded recurrence",
        governance_status: "observation_candidate", verification_state: "unresolved", signal_hash: "a".repeat(64),
        destination_path: "/viewfinder?signal_domain=live_data&signal_id=current-1" }],
      total: 101, returned: 1, next_offset: 100,
    },
    getLiveSignalSummary: {
      total_current: 101, observation_candidates: 101, promoted_signals: 0,
      by_severity: { high: 4 }, jurisdictions: ["WA"], domains: ["consumer"], last_detected_at: null,
    },
  };
  state.results = Object.fromEntries(
    Object.entries(responses).map(([key, data]) => [
      key,
      { data, error: null, isLoading: false },
    ]),
  );
});

it("renders the snake_case API responses across every diagnostics panel", () => {
  const html = renderToStaticMarkup(<StructuralDiagnosticsLens />);
  expect(html).toContain("Structural Diagnostics");
  expect(html).toContain("7 civic barrier references");
  expect(html).toContain("Equal protection");
  expect(html).toContain("Showing 1 on this page");
  expect(html).toContain("doctrine graph connections are unavailable");
  expect(html).toContain("TEST");
  expect(html).not.toContain(">27<");
  expect(html).toContain("Issue attribution: not established");
  expect(html).toContain("Saved authority");
  expect(html).toContain("out of 40 total agencies");
  expect(html).toContain("A recorded signal explanation");
  expect(html).toContain("from 10 civic barrier catalog records");
  expect(html).toContain("101 observation candidates");
  expect(html).toContain("0 promoted signals");
  expect(html).toContain("/viewfinder?signal_domain=live_data&amp;signal_id=current-1");
  expect(html).toContain("Ingestion backlog");
  expect(html).toContain("Next records");
  expect(html).toContain("Unavailable");
  expect(html).toContain("canonical graph summary timed out");
});

it("shows doctrine pagination and every doctrine returned on the current page", () => {
  state.results.getDoctrineClusters.data = {
    ...state.results.getDoctrineClusters.data,
    total_doctrines: 731, returned_doctrines: 6, next_offset: 100,
    clusters: [{ category: "general", count: 6, doctrines: Array.from({ length: 6 }, (_, i) => ({ id: i, name: `Visible doctrine ${i + 1}` })) }],
  };
  const html = renderToStaticMarkup(<StructuralDiagnosticsLens />);
  expect(html).toContain("731 matching doctrines");
  expect(html).toContain("Showing 6 on this page");
  expect(html).toContain("Visible doctrine 6");
  expect(html).toContain("Search all doctrines");
  expect(html).toContain("Next doctrines");
  expect(html).not.toMatch(/disabled=""[^>]*>Next doctrines/);
});

it("renders a verified canonical edge count when the governed graph is available", () => {
  state.results.stats.data.graph = {
    name: "canonical_civic_graph",
    edges: 655,
    structural_edges: 600,
    semantic_edges: 55,
    unresolved_relationships: 4,
    available: true,
    reason: null,
    contract: "lighthouse_canonical_state_v2",
  };
  const html = renderToStaticMarkup(<StructuralDiagnosticsLens />);
  expect(html).toContain("Canonical Civic Graph Edges:");
  expect(html).toContain(">655<");
  expect(html).not.toContain("canonical graph summary timed out");
});

it("distinguishes absent confidence and dates from a recorded zero", () => {
  expect(formatRecordedConfidence(null)).toBe("Not recorded");
  expect(formatRecordedConfidence("null")).toBe("Not recorded");
  expect(formatRecordedConfidence("0")).toBe("0%");
  expect(formatRecordedConfidence("0.8")).toBe("80%");
  expect(formatTimeAgo(null)).toBe("Date not recorded");
  expect(formatTimeAgo("invalid")).toBe("Date unresolved");
});

it("requests only the initial table and summary, leaving broader context on demand", () => {
  renderToStaticMarkup(<StructuralDiagnosticsLens />);
  expect(
    Object.entries(state.reads)
      .filter(([, options]) => options.enabled !== false)
      .map(([name]) => name)
      .sort(),
  ).toEqual(["getBarrierClusters", "stats"]);
  expect(state.world).not.toHaveBeenCalled();
});

it.each([true, false])(
  "contains a 504 failure while retaining the rest of the page (cached table: %s)",
  (cached) => {
    state.results.getBarrierClusters.error = new Error("504 Gateway Timeout");
    if (!cached) state.results.getBarrierClusters.data = undefined;
    const html = renderToStaticMarkup(<StructuralDiagnosticsLens />);
    expect(html).toContain("504 Gateway Timeout");
    expect(html).toContain("Retry selected diagnostics table");
    expect(html).toContain("Structural Diagnostics");
    expect(html).toContain("Equal protection");
    if (cached) {
      expect(html).toContain("The last successful result remains visible");
      expect(html).toContain("7 civic barrier references");
    } else {
      expect(html).toContain("Results are unavailable");
      expect(html).not.toMatch(/\b0 barriers/);
    }
  },
);

it("does not expose cached canonical records after sign-out", () => {
  state.user = null;
  const html = renderToStaticMarkup(<StructuralDiagnosticsLens />);
  expect(html).toContain("Sign in to inspect current detections");
  expect(html).not.toContain("Current candidate");
  expect(html).not.toContain("101 observation candidates");
  expect(state.reads.getLiveSignalsForDiagnostics.enabled).toBe(false);
  expect(state.reads.getLiveSignalSummary.enabled).toBe(false);
});

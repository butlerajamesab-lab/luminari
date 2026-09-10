import type { PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  results: {} as Record<string, any>,
  reads: {} as Record<string, any>,
  world: vi.fn(),
}));
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
  state.world.mockReset();
  const responses = {
    stats: {
      structural_diagnostics: {
        doctrines: 15,
        signals: 173,
        barriers: 10,
        detected_signals: 6,
      },
      graph: { edges: 0, available: false },
    },
    getBarrierClusters: {
      clusters: [
        { type: "procedural", count: 7, severity: "high", barriers: [] },
      ],
      total_barriers: 7,
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
      doctrine_edges: 0,
      doctrine_edges_available: false,
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
          issue_score: 27,
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
        },
      ],
      total_barriers: 10,
      total_doctrines: 15,
    },
    getLiveSignalsForDiagnostics: {
      groups: [],
      total_signals: 0,
      unique_types: 0,
      unique_datasets: 0,
    },
    getLiveSignalSummary: {
      total_active: 6,
      by_severity: { high: 4 },
      by_domain: {},
      by_type: {},
      last_detected_at: null,
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
  expect(html).toContain("7 barriers");
  expect(html).toContain("Equal protection");
  expect(html).toContain("graph connections are not available");
  expect(html).toContain("TEST");
  expect(html).toContain(">27<");
  expect(html).toContain("out of 40 total agencies");
  expect(html).toContain("A recorded signal explanation");
  expect(html).toContain("identified from 10 barriers");
  expect(html).toContain("Recorded Signals");
  expect(html).toContain("Unavailable");
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
      expect(html).toContain("7 barriers");
    } else {
      expect(html).toContain("Results are unavailable");
      expect(html).not.toMatch(/\b0 barriers/);
    }
  },
);

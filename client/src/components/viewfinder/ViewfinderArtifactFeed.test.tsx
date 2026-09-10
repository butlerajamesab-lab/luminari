import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "reader" } as { id: string } | null,
  search: "?signal_domain=live_data",
  feed: {} as any,
  listQuery: vi.fn(),
  stateQuery: vi.fn(),
}));
vi.mock("@/lib/trpc", () => ({ trpc: {
  enforcementIntel: { list_signal_artifacts: { useQuery: state.listQuery } },
  resourceDirectory: { viewfinderStates: { useQuery: state.stateQuery } },
} }));
vi.mock("@/core/hooks/useAuth", () => ({ useAuth: () => ({ user: state.user, loading: false }) }));
vi.mock("@/components/signal-architecture/SignalArtifactContext", () => ({ SignalArtifactContext: () => null }));
vi.mock("wouter", () => ({ useLocation: () => ["/viewfinder", vi.fn()], useSearch: () => state.search }));

import AnomalyViewfinder from "@/pages/AnomalyViewfinder";
import { ViewfinderArtifactFeed, formatViewfinderDate } from "./ViewfinderArtifactFeed";

function item(index: number) {
  return {
    domain_code: "live_data", record_id: `record-${index}`, source_hash: `hash-${index}`,
    title: `Current detection ${index}`, description: "A recorded observation candidate.",
    artifact_type: "frequency_spike", jurisdiction_id: "WA", status: "verified",
    governance_status: "observation_candidate", occurred_at: "2026-08-22T00:00:00.000Z",
    source_freshness_at: "2026-08-21T00:00:00.000Z",
    method: { rule_id: "atlas.domain3.frequency_spike", rule_version: "1.0.0", engine_id: "atlas", engine_version: "2.0.0" },
  };
}

describe("Viewfinder canonical feed", () => {
  beforeEach(() => {
    state.user = { id: "reader" };
    state.search = "?signal_domain=live_data";
    state.feed = {
      data: { items: Array.from({ length: 50 }, (_, i) => item(i + 1)), total: 61, offset: 0, has_more: true, next_offset: 50, checked_at: "2026-09-10T12:00:00.000Z" },
      isLoading: false, isFetching: false, error: null, refetch: vi.fn(), fetchStatus: "idle",
    };
    state.listQuery.mockReset().mockImplementation(() => state.feed);
    state.stateQuery.mockReset().mockReturnValue({ data: { states: [] }, isLoading: false, isFetching: false, dataUpdatedAt: 0 });
  });

  it("renders past ten results, their total, and an enabled next page", () => {
    const html = renderToStaticMarkup(<ViewfinderArtifactFeed domain="live_data" />);
    expect(html.match(/<article /g)).toHaveLength(50);
    expect(html).toContain("1–50 of 61 results");
    expect(html).toContain('<button type="button">Next</button>');
    expect(html).toContain("Current detection 50");
    expect(html).toContain("atlas.domain3.frequency_spike");
    expect(html).toContain("observation candidate");
    expect(html).toContain("verified");
  });

  it("uses the same protected Signal Registry query and enables ongoing checks", () => {
    renderToStaticMarkup(<AnomalyViewfinder />);
    expect(state.listQuery).toHaveBeenCalledWith(
      { domain: "live_data", limit: 50, offset: 0, query: undefined },
      expect.objectContaining({ refetchInterval: 30_000, refetchOnWindowFocus: true, refetchOnReconnect: true, staleTime: 0 }),
    );
    state.search = "?signal_domain=legal_pattern";
    renderToStaticMarkup(<AnomalyViewfinder />);
    expect(state.listQuery.mock.lastCall?.[0].domain).toBe("legal_pattern");
  });

  it("does not run protected reads or show cached records to a signed-out visitor", () => {
    state.user = null;
    const html = renderToStaticMarkup(<AnomalyViewfinder />);
    expect(state.listQuery).not.toHaveBeenCalled();
    expect(html).toContain("Sign in to view live detections");
    expect(html).toContain("interactive=1");
    expect(html).toContain("redirect=%2Fviewfinder%3Fsignal_domain%3Dlive_data");
    expect(html).not.toContain("Current detection");
    expect(html).not.toContain("Interpretive layer");
  });

  it("shows refreshed records without altering their source dates", () => {
    state.feed.data.items = [item(62)];
    const html = renderToStaticMarkup(<ViewfinderArtifactFeed domain="live_data" />);
    expect(html).toContain("Current detection 62");
    expect(html).not.toContain("Current detection 1");
    expect(html).toContain(formatViewfinderDate("2026-08-22T00:00:00.000Z"));
    expect(html).toContain(formatViewfinderDate("2026-09-10T12:00:00.000Z"));
  });

  it("labels a failed background refresh and retains the last successful check time", () => {
    state.feed.error = new Error("database unavailable");
    const html = renderToStaticMarkup(<ViewfinderArtifactFeed domain="live_data" />);
    expect(html).toContain("Refresh failed");
    expect(html).toContain("Showing the last successful result; it may be out of date.");
    expect(html).toContain(formatViewfinderDate(state.feed.data.checked_at));
  });

  it("keeps an empty feed distinct from loading and transport failure", () => {
    state.feed.data = { ...state.feed.data, items: [], total: 0, has_more: false, next_offset: null };
    const html = renderToStaticMarkup(<ViewfinderArtifactFeed domain="live_data" />);
    expect(html).toContain("No current records have been published");
    expect(html).toContain("0–0 of 0 results");
    expect(html).not.toContain("Refresh failed");
    expect(formatViewfinderDate(null)).toBe("Unknown");
    expect(formatViewfinderDate("invalid")).toBe("Unknown");
  });
});

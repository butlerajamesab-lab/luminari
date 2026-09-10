import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ feed: {} as any, architecture: {} as any }));
vi.mock("wouter", () => ({ useSearch: () => "", useLocation: () => ["/signal-registry", vi.fn()] }));
vi.mock("@/core/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 1 } }) }));
vi.mock("@/components/LayerNavBar", () => ({ LayerNavBar: () => null }));
vi.mock("@/components/PublicWalkthroughShell", () => ({ PublicWalkthroughShell: () => null }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({}),
  cases: { list: { useQuery: () => ({ data: [] }) } },
  enforcementIntel: {
    get_signal_architecture: { useQuery: () => state.architecture },
    list_signal_artifacts: { useQuery: () => state.feed },
    get_signal_artifact: { useQuery: () => ({ data: undefined }) },
    connect_signal_artifact_to_case: { useMutation: () => ({}) },
  },
} }));
import SignalRegistry from "./SignalRegistry";

beforeEach(() => {
  state.architecture = { data: { domains: [], integrity: { intake_signal_count: 0, legal_pattern_count: 0, live_data_signal_count: 1, legacy_detected_signals_count: 0, legacy_live_signals_count: 0 } }, error: null, isLoading: false };
  state.feed = { data: { total: 1, has_more: false, items: [{ domain_code: "live_data", record_id: "1", artifact_type: "frequency_spike", title: "Saved detection", description: "Preserved observation", status: "unresolved", occurred_at: null }] }, error: null, isLoading: false };
});

it("keeps cached registry rows and counts visible after transient background failures", () => {
  state.feed.error = new Error("Temporary database failure");
  state.architecture.error = new Error("Temporary network failure");
  const html = renderToStaticMarkup(<SignalRegistry />);
  expect(html).toContain("Saved detection");
  expect(html).toContain("Registry refresh failed");
  expect(html).toContain("Architecture refresh failed");
});

it.each(["UNAUTHORIZED", "FORBIDDEN"])("withholds cached registry rows after %s", (code) => {
  state.feed.error = { message: "Access denied", data: { code } };
  const html = renderToStaticMarkup(<SignalRegistry />);
  expect(html).not.toContain("Saved detection");
  expect(html).toContain("Access denied");
});

it("shows a blocking error when there is no saved result", () => {
  state.feed.data = undefined;
  state.feed.error = new Error("Unavailable");
  const html = renderToStaticMarkup(<SignalRegistry />);
  expect(html).toContain("Unavailable");
  expect(html).not.toContain("Showing the last successful results");
});

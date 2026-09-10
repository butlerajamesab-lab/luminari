import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ feed: {} as any, architecture: {} as any, search: "", cases: vi.fn(), artifacts: vi.fn(), detail: vi.fn(), catalog: {} as any }));
vi.mock("wouter", () => ({ useSearch: () => state.search, useLocation: () => ["/signal-registry", vi.fn()] }));
vi.mock("@/core/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 1 } }) }));
vi.mock("@/components/LayerNavBar", () => ({ LayerNavBar: () => null }));
vi.mock("@/components/PublicWalkthroughShell", () => ({ PublicWalkthroughShell: () => null }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({}),
  cases: { list: { useQuery: state.cases } },
  enforcementIntel: {
    get_signal_architecture: { useQuery: () => state.architecture },
    list_signal_artifacts: { useQuery: state.artifacts },
    get_signal_artifact: { useQuery: state.detail },
    get_intake_pattern_catalog: { useQuery: () => state.catalog },
    connect_signal_artifact_to_case: { useMutation: () => ({}) },
  },
} }));
import SignalRegistry from "./SignalRegistry";

beforeEach(() => {
  state.search = "";
  state.cases.mockReset().mockReturnValue({ data: [] });
  state.artifacts.mockReset().mockImplementation(() => state.feed);
  state.detail.mockReset().mockReturnValue({ data: undefined });
  state.catalog = { data: { rules: [{ rule_id: "example_rule", rule_version: "2.2.0", pattern_type: "example_structural_match", description: "Complaint followed by termination", required_sequence: [{ to_state: "complaint_filed" }, { to_state: "terminated" }], time_window_days: 90, min_independent_source_artifacts: 2, same_entity: true }], history: [], retained_records: 6019, chronology_observations: 6019, distinct_pattern_occurrences: 0 }, error: null, isLoading: false };
  state.architecture = { data: { domains: [], integrity: { intake_signal_count: 0, legal_pattern_count: 0, live_data_signal_count: 1, legacy_detected_signals_count: 0, legacy_live_signals_count: 0 } }, error: null, isLoading: false };
  state.feed = { data: { total: 1, has_more: false, items: [{ domain_code: "live_data", record_id: "1", artifact_type: "frequency_spike", title: "Saved detection", description: "Preserved observation", status: "unresolved", occurred_at: null }] }, error: null, isLoading: false };
});

it.each(["domain", "signal_domain"])("opens intake pattern meanings from %s without requesting case files or unrelated artifacts", param => {
  state.search = `${param}=case_intake&signal_id=obsolete-case-reference`;
  const html = renderToStaticMarkup(<SignalRegistry />);
  expect(html).toContain("Intake patterns: meaning and evidence");
  expect(html).toContain("Complaint followed by termination");
  expect(html).toContain("complaint filed");
  expect(html).toContain("Within 90 days; at least 2 distinct source artifacts");
  expect(html).toContain("6,019");
  expect(html).toContain("No identified structural pattern matches");
  expect(html).not.toContain("Saved detection");
  expect(html).not.toMatch(/href="\/cases|Open private case artifacts/);
  for (const read of [state.cases, state.artifacts, state.detail]) {
    expect(read.mock.lastCall?.[1]).toMatchObject({ enabled: false });
  }
});

it("keeps recorded historical matches visible and separate from chronology counts", () => {
  state.search = "domain=case_intake";
  state.catalog.data.distinct_pattern_occurrences = 1;
  state.catalog.data.history = [{ rule_id: "older_rule", rule_version: "1.0.0", breakpoint_type: "older_pattern", recorded_versions: 3, distinct_occurrence_keys: 1, unresolved_identity_records: 0 }];
  const html = renderToStaticMarkup(<SignalRegistry />);
  expect(html).toContain("older_rule / 1.0.0");
  expect(html).toContain("Processing records");
  expect(html).not.toContain("No identified structural pattern matches");
});

it.each(["UNAUTHORIZED", "FORBIDDEN"])("withholds cached intake history after %s", code => {
  state.search = "domain=case_intake";
  state.catalog.error = { message: "Access denied", data: { code } };
  const html = renderToStaticMarkup(<SignalRegistry />);
  expect(html).toContain("Access denied");
  expect(html).not.toContain("Complaint followed by termination");
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

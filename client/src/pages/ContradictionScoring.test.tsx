import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ search: "", library: vi.fn(), score: vi.fn() }));
vi.mock("wouter", () => ({ useSearch: () => state.search, useLocation: () => ["/contradiction-scoring", vi.fn()] }));
vi.mock("@/lib/trpc", () => ({ trpc: { enforcementIntel: {
  scoreAllContradictions: { useQuery: state.library }, scoreContradiction: { useQuery: state.score },
} } }));
vi.mock("@/components/signal-architecture/SignalArtifactContext", () => ({ SignalArtifactContext: () => <p>Selected source observations and checks</p> }));
import ContradictionScoring from "./ContradictionScoring";

beforeEach(() => {
  state.search = "";
  state.library.mockReset().mockReturnValue({ data: [], isLoading: false });
  state.score.mockReset().mockReturnValue({ data: null, isLoading: false });
});

it("opens the linked detection's own evidence without requesting unrelated scores", () => {
  state.search = "?signal_domain=legal_pattern&signal_id=19df1cf7-d89b-4668-b590-5021103cf1db";
  const html = renderToStaticMarkup(<ContradictionScoring />);
  expect(html).toContain("Selected source observations and checks");
  expect(state.library.mock.lastCall?.[1]).toMatchObject({ enabled: false });
  expect(state.score.mock.lastCall?.[1]).toMatchObject({ enabled: false });
  expect(html).not.toContain("All Contradictions — Ranked by Score");
});

it("retains clearly labeled library scoring when opened without a linked detection", () => {
  const html = renderToStaticMarkup(<ContradictionScoring />);
  expect(state.library.mock.lastCall?.[1]).toMatchObject({ enabled: true });
  expect(html).toContain("baseline evidence assumptions");
  expect(html).not.toContain("Selected source observations and checks");
});

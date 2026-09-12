import { readFileSync } from "node:fs";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  catalog: vi.fn(),
  canonical: vi.fn(),
  query: vi.fn(),
  rows: new Map<unknown, any[]>(),
}));
vi.mock("./intake-pattern-catalog", () => ({
  read_intake_pattern_catalog: state.catalog,
}));
vi.mock("./db", () => ({
  getPool: vi.fn(),
  db: {
    select: () => ({
      from: (table: unknown) => {
        const query: any = {
          where: () => query,
          orderBy: () => query,
          limit: () => query,
          then: (resolve: any, reject: any) =>
            Promise.resolve(state.rows.get(table) ?? []).then(resolve, reject),
        };
        return query;
      },
    }),
  },
}));
vi.mock("./services/current-canonical-state", () => ({
  getCurrentCanonicalState: state.canonical,
}));
vi.mock("./db-legacy", () => ({
  query_with_diagnostics: state.query,
}));

import { enforcementIntelligenceRouter } from "./routers/enforcement-intelligence";
import { dualLensRouter } from "./routers/dual-lens";
import {
  litigationBarriers,
  signalRegistry,
  doctrineRegistry,
  legalStatutes,
  detectedSignals,
  dataStreamRegistry,
} from "../drizzle/schema";

beforeEach(() => {
  state.rows.clear();
  state.catalog.mockReset().mockResolvedValue({
    rules: [],
    history: [],
    chronology_observations: 6019,
    distinct_pattern_occurrences: 0,
  });
  state.canonical.mockReset().mockResolvedValue({
    contract: "lighthouse_canonical_state_v2",
    graph_edges: 655,
    structural_graph_edges: 600,
    semantic_graph_edges: 55,
    unresolved_relationships: 4,
  });
  state.query.mockReset().mockResolvedValue({
    rows: [{
      claim_count: 1,
      proof_count: 2,
      barrier_count: 3,
      agency_count: 4,
      workflow_count: 5,
      deadline_count: 6,
      doctrine_count: 7,
      signal_count: 8,
      court_count: 9,
      live_signal_count: 10,
    }],
  });
  state.rows.set(litigationBarriers, [
    {
      id: 1,
      barrier_id: "LB-1",
      name: "Procedural review",
      barrier_type: "procedural",
      severity: "high",
      description: "A stored procedural barrier",
      what_it_blocks: "Review",
      domains: ["employment"],
      possible_workarounds: [
        "Document the review request",
        "Preserve the response",
      ],
    },
    {
      id: 2,
      barrier_id: "LB-2",
      name: "Time limit",
      barrier_type: "timing",
      severity: "high",
      description: "A stored timing barrier",
      domains: ["employment"],
      possible_workarounds: ["Verify the relevant dates"],
    },
  ]);
  state.rows.set(signalRegistry, [
    {
      id: 10,
      signal_type: "repeated_denial",
      domain: "employment",
      explanation: "Repeated denials in recorded decisions",
    },
    {
      id: 11,
      signal_type: "missing_notice",
      domain: "housing",
      explanation: "A required notice is absent from the record",
    },
  ]);
  state.rows.set(doctrineRegistry, [
    {
      id: 1,
      name: "Procedural review doctrine",
      description: "Stored procedural context",
    },
  ]);
  state.rows.set(legalStatutes, [
    {
      id: 1,
      title: "Procedural review source",
      summary: "Stored procedural context",
    },
  ]);
});

it("serves the catalog from the enforcement router actually mounted by the app", async () => {
  const root = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
  expect(root).toContain(
    'import { enforcementIntelligenceRouter } from "./routers/enforcement-intelligence"',
  );
  expect(root).toContain("enforcementIntel: enforcementIntelligenceRouter");
  const caller = enforcementIntelligenceRouter.createCaller({
    user: { id: 1 },
    auth: { auth_status: "authenticated" },
  } as never);
  expect(await caller.get_intake_pattern_catalog()).toMatchObject({
    chronology_observations: 6019,
    distinct_pattern_occurrences: 0,
  });
  expect(state.catalog).toHaveBeenCalledOnce();
});

it.each(["unauthenticated", "authenticated_profile_unresolved"])(
  "does not read catalog history for %s",
  async (auth_status) => {
    const caller = enforcementIntelligenceRouter.createCaller({
      user: null,
      auth: { auth_status },
    } as never);
    await expect(caller.get_intake_pattern_catalog()).rejects.toMatchObject({
      code: auth_status === "unauthenticated" ? "UNAUTHORIZED" : "FORBIDDEN",
    });
    expect(state.catalog).not.toHaveBeenCalled();
  },
);

it("groups physical barrier and signal rows by their saved types", async () => {
  const caller = dualLensRouter.createCaller({ user: { id: 1 }, auth: { auth_status: "authenticated" } } as never);
  const barriers = await caller.getBarrierClusters({});
  expect(barriers.clusters.map((c) => c.type)).toEqual([
    "procedural",
    "timing",
  ]);
  expect(barriers.clusters[0].barriers[0]).toMatchObject({
    barrier_id: "LB-1",
    what_it_blocks: "Review",
  });
  const signals = await caller.getSignalPatterns({});
  expect(signals.patterns.map((p) => p.type)).toEqual([
    "repeated_denial",
    "missing_notice",
  ]);
});

it("returns the stored workaround text and honors the barrier-type filter", async () => {
  const caller = dualLensRouter.createCaller({ user: { id: 1 }, auth: { auth_status: "authenticated" } } as never);
  const result = await caller.getSystemicPaths({ barrierType: "procedural" });
  expect(result.paths).toMatchObject([
    {
      barrier: "procedural",
      severity: "high",
      doctrineLink: null,
      statuteLink: null,
      reformPath: "Document the review request; Preserve the response",
    },
  ]);
});

it("reads current Domain 3 records with exact identity and no registry inference", async () => {
  state.query.mockResolvedValueOnce({ rows: [{
    record_id: "00000000-0000-4000-8000-000000000001", signal_type: "repeat_entity",
    title: "Recorded recurrence", description: "Recorded explanation", primary_stream_id: "cfpb_complaints",
    jurisdiction_id: "WA", domain: "consumer", verification_state: "unresolved",
    governance_status: "observation_candidate", signal_hash: "a".repeat(64),
    confidence_score: null, detected_at: null, total_count: 101,
  }] });
  state.rows.set(detectedSignals, [{ signalId: "legacy", plainLanguageExplanation: "Must not reappear" }]);
  const result = await dualLensRouter.createCaller({ user: { id: 1 }, auth: { auth_status: "authenticated" } } as never).getLiveSignalsForDiagnostics({
    jurisdiction: "WA", domain: "consumer", offset: 100,
  });
  expect(result).toMatchObject({ total: 101, returned: 1, next_offset: null, source_relation: "public.live_data_signals" });
  expect(result.items[0]).toMatchObject({
    verification_state: "unresolved", governance_status: "observation_candidate",
    signal_hash: "a".repeat(64), confidence_score: null, detected_at: null,
    destination_path: "/viewfinder?signal_domain=live_data&signal_id=00000000-0000-4000-8000-000000000001",
  });
  const [sql, params] = state.query.mock.calls[0];
  expect(sql).toContain("from public.live_data_signals");
  expect(sql).toContain("where s.is_current");
  expect(sql).not.toContain("detected_signals");
  expect(params).toEqual(["WA", "consumer", null, "", 100, 100]);
  expect(JSON.stringify(result)).not.toContain("Must not reappear");
});

it("retains totals for an empty page and rejects an unavailable total", async () => {
  const caller = dualLensRouter.createCaller({ user: { id: 1 }, auth: { auth_status: "authenticated" } } as never);
  state.query.mockResolvedValueOnce({ rows: [{ record_id: null, total_count: 3 }] });
  expect(await caller.getLiveSignalsForDiagnostics({ offset: 100 })).toMatchObject({ items: [], total: 3, next_offset: null });
  state.query.mockResolvedValueOnce({ rows: [] });
  await expect(caller.getLiveSignalsForDiagnostics({})).rejects.toThrow("count is unavailable");
});

it("counts candidate and promoted states separately with the same page filters", async () => {
  state.query.mockResolvedValueOnce({ rows: [{ total_current: 3, observation_candidates: 2, promoted_signals: 0,
    by_severity: { high: 3 }, jurisdictions: ["WA"], domains: ["consumer"], last_detected_at: null }] });
  const result = await dualLensRouter.createCaller({ user: { id: 1 }, auth: { auth_status: "authenticated" } } as never).getLiveSignalSummary({ jurisdiction: "WA", domain: "consumer" });
  expect(result).toMatchObject({ total_current: 3, observation_candidates: 2, promoted_signals: 0 });
  expect(state.query.mock.calls[0][1]).toEqual(["WA", "consumer", null, ""]);
  expect(state.query.mock.calls[0][0]).toContain("governance_status = 'promoted'");
  expect(state.query.mock.calls[0][0]).not.toContain("detected_signals");
});

it("does not turn agency name overlap into institutional issue attribution", async () => {
  state.query.mockResolvedValueOnce({ rows: [{ id: 1, agency: "Procedural Review Agency", agency_short: "PRA", domain: "employment", statute: "Recorded authority" }] });
  const result = await dualLensRouter.createCaller({ user: { id: 1 }, auth: { auth_status: "authenticated" } } as never).getAffectedInstitutions({ domain: "employment" });
  expect(result.institutions).toHaveLength(1);
  expect(result.institutions[0]).toMatchObject({ statute: "Recorded authority", signal_count: null, barrier_count: null, issue_score: null, attribution_status: "not_established" });
  expect(state.query.mock.calls[0][0]).not.toContain("signal_registry");
});

it("keeps operational and legacy-derived records inspectable without case alerts or invented paths", async () => {
  state.rows.get(litigationBarriers)!.push(
    { id: 3, barrier_id: "ingestion", name: "Procedural ingestion", barrier_type: "procedural", domains: '["ingestion"]', severity: "high" },
    { id: 4, barrier_id: "legacy", name: "Procedural legacy", barrier_type: "procedural", domains: '["employment"]', severity: "high", added_by: "derived:knowledge-derivation-phase3:live_signals", leading_authorities: '["Saved authority"]' },
  );
  const caller = dualLensRouter.createCaller({ user: { id: 1 }, auth: { auth_status: "authenticated" } } as never);
  const clusters = await caller.getBarrierClusters({});
  expect(clusters.total_barriers).toBe(3);
  expect(clusters.operational_references.map((row: any) => row.barrier_id)).toEqual(["ingestion"]);
  const paths = await caller.getSystemicPaths({});
  expect(paths.paths.find((row: any) => row.barrier_id === "legacy")).toMatchObject({
    authority_refs: ["Saved authority"], doctrineLink: null, statuteLink: null, route_status: "not_established",
  });
  expect(paths.paths.some((row: any) => row.barrier_id === "ingestion")).toBe(false);
  const alerts = await caller.getBarrierAlerts({ claimType: "procedural", domain: "employment" });
  expect(alerts.barriers.map((row: any) => row.barrier_id)).toEqual(["LB-1"]);
  expect(alerts.barriers[0]).toMatchObject({ barrier_type: "procedural", what_it_blocks: "Review" });
  expect(alerts.excluded_unverified_references).toBe(2);
  expect((await caller.getBarrierClusters({ domain: "housing" })).total_barriers).toBe(0);
  expect((await caller.getSignalPatterns({ domain: "housing" })).patterns[0].type).toBe("missing_notice");
});

it("reports the governed canonical graph count and its component totals", async () => {
  const caller = dualLensRouter.createCaller({ user: { id: 1 }, auth: { auth_status: "authenticated" } } as never);
  const result = await caller.stats();
  expect(result.graph).toEqual({
    name: "canonical_civic_graph",
    edges: 655,
    structural_edges: 600,
    semantic_edges: 55,
    unresolved_relationships: 4,
    available: true,
    reason: null,
    contract: "lighthouse_canonical_state_v2",
  });
});

it("keeps registry stats available and explains when the graph read times out", async () => {
  state.canonical.mockRejectedValueOnce(new Error("query timeout after 7000ms"));
  const caller = dualLensRouter.createCaller({ user: { id: 1 }, auth: { auth_status: "authenticated" } } as never);
  const result = await caller.stats();
  expect(result.structural_diagnostics).toBeDefined();
  expect(result.graph).toMatchObject({
    name: "canonical_civic_graph",
    edges: null,
    available: false,
    contract: null,
  });
  expect(result.graph.reason).toContain("timed out");
});

it("applies an explicit pool and query budget to the diagnostics summary read", async () => {
  const caller = dualLensRouter.createCaller({ user: { id: 1 }, auth: { auth_status: "authenticated" } } as never);
  await caller.stats();
  expect(state.query).toHaveBeenCalledWith(
    expect.stringContaining("from public.strategy_claim_catalog"),
    [],
    expect.objectContaining({
      label: "dual_lens_stats",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    }),
  );
});

it("expands only the doctrine graph with indexed directions and a bounded result", async () => {
  state.query.mockResolvedValueOnce({ rows: [
    { direction: "outgoing", id: 1, from_id: "D-1", to_id: "S-1" },
    { direction: "incoming", id: 2, from_id: "C-1", to_id: "D-1" },
  ] });
  const caller = dualLensRouter.createCaller({ user: { id: 1 }, auth: { auth_status: "authenticated" } } as never);
  const result = await caller.expandNode({ nodeId: "D-1", nodeType: "doctrine" });
  expect(result).toMatchObject({
    graph_name: "doctrine_graph",
    graph_available: true,
    returned_connections: 2,
    truncated: false,
  });
  expect(result.outgoing).toHaveLength(1);
  expect(result.incoming).toHaveLength(1);
  expect(state.query).toHaveBeenCalledWith(
    expect.stringMatching(/where from_type = \$1[\s\S]*limit 25[\s\S]*where to_type = \$1[\s\S]*limit 25/),
    ["doctrine", "D-1"],
    expect.objectContaining({ query_timeout_ms: 4_000 }),
  );
});

it("does not route foreign node types into the doctrine graph", async () => {
  const caller = dualLensRouter.createCaller({ user: { id: 1 }, auth: { auth_status: "authenticated" } } as never);
  const result = await caller.expandNode({ nodeId: "P-1", nodeType: "pattern" });
  expect(result).toMatchObject({
    graph_name: "doctrine_graph",
    graph_available: false,
    returned_connections: 0,
  });
  expect(result.graph_unavailable_reason).toContain("not owned by the doctrine graph");
  expect(state.query).not.toHaveBeenCalled();
});

it("keeps the doctrine total independent from the capped cluster rows", async () => {
  const doctrineRows = Array.from({ length: 500 }, (_, index) => ({
    id: index + 1,
    name: `Doctrine ${index + 1}`,
    domains: ["general"],
  }));
  state.query.mockImplementation((_sql: string, _params: unknown[], options: { label: string }) => {
    if (options.label === "dual_lens_doctrine_clusters") return Promise.resolve({ rows: doctrineRows });
    if (options.label === "dual_lens_doctrine_count") return Promise.resolve({ rows: [{ doctrine_count: 731 }] });
    if (options.label === "dual_lens_doctrine_edge_count") return Promise.resolve({ rows: [{ edge_count: 44 }] });
    throw new Error(`Unexpected query: ${options.label}`);
  });
  const caller = dualLensRouter.createCaller({ user: { id: 1 }, auth: { auth_status: "authenticated" } } as never);
  const result = await caller.getDoctrineClusters({});
  expect(result.total_doctrines).toBe(731);
  expect(result.clusters.reduce((sum, cluster) => sum + cluster.count, 0)).toBe(500);
  expect(result.doctrine_results_limited).toBe(true);
  expect(result.returned_doctrines).toBe(500);
  expect(result.next_offset).toBe(500);
  expect(result.doctrine_edges).toBe(44);
  expect(state.query).toHaveBeenCalledWith(
    expect.stringContaining("count(*)::int as doctrine_count"),
    [[], ""],
    expect.objectContaining({ query_timeout_ms: 4_000 }),
  );
});

it("filters the full doctrine registry before paging beyond the first 500 rows", async () => {
  state.query.mockImplementation((_sql: string, _params: unknown[], options: { label: string }) => {
    if (options.label === "dual_lens_doctrine_clusters") return Promise.resolve({ rows: [{ id: 601, name: "Later doctrine", domains: ["housing"] }] });
    if (options.label === "dual_lens_doctrine_count") return Promise.resolve({ rows: [{ doctrine_count: 601 }] });
    return Promise.resolve({ rows: [{ edge_count: 44 }] });
  });
  const result = await dualLensRouter.createCaller({ user: { id: 1 }, auth: { auth_status: "authenticated" } } as never).getDoctrineClusters({
    keywords: ["HOUSING"], search: "Later", offset: 600, limit: 100,
  });
  expect(result.clusters[0].doctrines[0].id).toBe(601);
  expect(result.next_offset).toBeNull();
  expect(result.total_doctrines).toBe(601);
  expect(state.query).toHaveBeenCalledWith(
    expect.stringMatching(/where[\s\S]*unnest\(\$1::text\[\]\)[\s\S]*order by name asc, id asc[\s\S]*limit \$3 offset \$4/),
    [["housing"], "later", 100, 600], expect.any(Object),
  );
  expect(state.query).toHaveBeenCalledWith(
    expect.stringMatching(/count\(\*\)[\s\S]*where[\s\S]*unnest\(\$1::text\[\]\)/),
    [["housing"], "later"], expect.any(Object),
  );
});

it.each(["unauthenticated", "authenticated_profile_unresolved"])("protects canonical diagnostic records for %s", async auth_status => {
  const caller = dualLensRouter.createCaller({ user: null, auth: { auth_status } } as never);
  await expect(caller.getLiveSignalsForDiagnostics({})).rejects.toMatchObject({ code: auth_status === "unauthenticated" ? "UNAUTHORIZED" : "FORBIDDEN" });
  await expect(caller.getLiveSignalSummary({ query: "private title" })).rejects.toMatchObject({ code: auth_status === "unauthenticated" ? "UNAUTHORIZED" : "FORBIDDEN" });
  expect(state.query).not.toHaveBeenCalled();
});

it("binds claim text before paging and uses the same predicate for totals", async () => {
  state.query.mockResolvedValueOnce({ rows: [{ record_id: null, total_count: 0 }] });
  const caller = dualLensRouter.createCaller({ user: { id: 1 }, auth: { auth_status: "authenticated" } } as never);
  await caller.getLiveSignalsForDiagnostics({ query: "EMPLOYMENT_Discrimination", offset: 100 });
  expect(state.query.mock.calls[0][1]).toEqual([null, null, null, "employment discrimination", 100, 100]);
  expect(state.query.mock.calls[0][0]).toMatch(/strpos[\s\S]*limit \$5 offset \$6/);
});

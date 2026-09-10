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
  const caller = dualLensRouter.createCaller({} as never);
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
  const caller = dualLensRouter.createCaller({} as never);
  const result = await caller.getSystemicPaths({ barrierType: "procedural" });
  expect(result.paths).toEqual([
    {
      barrier: "procedural",
      severity: "high",
      doctrineLink: "Procedural review doctrine",
      statuteLink: "Procedural review source",
      reformPath: "Document the review request; Preserve the response",
    },
  ]);
});

it("matches live detections to canonical registry types and keeps their stored description", async () => {
  state.rows.set(detectedSignals, [
    {
      signalId: "live-1",
      signalType: "repeated_denial",
      datasetId: "public-records",
      signalDescription: "Stored pattern description",
      plainLanguageExplanation: "Stored explanation",
      severityLevel: "high",
      confidenceScore: "0.8",
      jurisdictionScope: "WA",
      detectionTimestamp: 1788998400000,
      crossSignalLinks: [],
    },
  ]);
  state.rows.set(dataStreamRegistry, [
    { datasetId: "public-records", datasetName: "Public records" },
  ]);
  const caller = dualLensRouter.createCaller({} as never);
  const result = await caller.getLiveSignalsForDiagnostics({});
  expect(result.groups[0].signals[0]).toMatchObject({
    matchesKnownPattern: true,
    patternSummary: "Stored explanation",
    datasetName: "Public records",
  });
});

it("keeps incomplete live metadata explicit without exposing additional source fields", async () => {
  state.rows.set(detectedSignals, [
    {
      signalId: "live-2",
      signalType: "missing_notice",
      datasetId: null,
      signalDescription: "Unpublished source description",
      plainLanguageExplanation: "Published explanation",
      severityLevel: null,
      confidenceScore: null,
      jurisdictionScope: null,
      detectionTimestamp: null,
      crossSignalLinks: [],
    },
  ]);
  const caller = dualLensRouter.createCaller({} as never);
  const result = await caller.getLiveSignalsForDiagnostics({});
  expect(result.unique_datasets).toBe(0);
  expect(result.groups[0].signals[0]).toMatchObject({
    domain: "",
    datasetName: "Source not recorded",
    confidenceScore: null,
    detectedAt: null,
    severity: "unclassified",
    patternSummary: "Published explanation",
  });
  expect(JSON.stringify(result)).not.toContain(
    "Unpublished source description",
  );
});

it("reports the governed canonical graph count and its component totals", async () => {
  const caller = dualLensRouter.createCaller({} as never);
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
  const caller = dualLensRouter.createCaller({} as never);
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
  const caller = dualLensRouter.createCaller({} as never);
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
  const caller = dualLensRouter.createCaller({} as never);
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
  const caller = dualLensRouter.createCaller({} as never);
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
  const caller = dualLensRouter.createCaller({} as never);
  const result = await caller.getDoctrineClusters({});
  expect(result.total_doctrines).toBe(731);
  expect(result.clusters.reduce((sum, cluster) => sum + cluster.count, 0)).toBe(500);
  expect(result.doctrine_results_limited).toBe(true);
  expect(result.doctrine_edges).toBe(44);
  expect(state.query).toHaveBeenCalledWith(
    expect.stringContaining("count(*)::int as doctrine_count"),
    [],
    expect.objectContaining({ query_timeout_ms: 4_000 }),
  );
});

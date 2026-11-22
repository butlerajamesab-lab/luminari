import { describe, expect, it, vi } from "vitest";

/**
 * Gate B Kernel 2 — exposure closure, behavior level.
 *
 * Before this build, unified.get_unified_signals,
 * signalGovernance.dashboard, and the admin dashboard's
 * structuralSignals / findingsBySeverity were public procedures over
 * a default filter of every current non-rejected signal: unreviewed
 * candidates' titles, explanations, entity ids, evidence refs and
 * supporting statistics were served to anonymous callers, around the
 * human review gate. These tests pin the closed state with real tRPC
 * callers (the createCaller pattern from case-context-auth.test.ts):
 *
 * - an anonymous caller is rejected by all three candidate-content
 *   procedures;
 * - the single-operator public-read SYNTHESIZED user is also
 *   rejected — that fallback (env-gated, query-only) must not carry
 *   candidate content when enabled;
 * - a real authenticated operator session still reads them — the
 *   operator surfaces Mission Control depends on are intact.
 *
 * The data layer is mocked: authorization happens before any read,
 * and the operator case resolves against a fixture candidate.
 */

const CANDIDATE_ID = "cc7edc84-2618-46d7-9504-ffd2f8c1d57a";

const candidateFixture = {
  id: CANDIDATE_ID,
  signal_id: CANDIDATE_ID,
  title: "Unreviewed candidate",
  explanation: "Candidate explanation that must never be served anonymously.",
  entity_id: "entity-1",
  affected_entities: ["entity-1"],
  evidence_refs: [{ event_identity_hash: "x".repeat(64) }],
  supporting_statistics: { entity_name: "EXAMPLE CORP" },
  governance_status: "observation_candidate",
  record_kind: "observation_candidate",
  confidence_score: 0.5,
  severity_level: "high",
  category: "cross_jurisdiction_recurrence",
  stream_id: "cfpb_complaints",
  detected_at: 1_700_000_000_000,
  detection_rule_id: "atlas.domain3.cross_jurisdiction_recurrence",
  detection_rule_version: "1.0.0",
  engine_id: "atlas.domain3_population_exact",
  engine_version: "1.1.0",
  signal_hash: "a".repeat(64),
};

vi.mock("./db", () => ({
  db: { execute: async () => ({ rows: [] }) },
  pool: { query: async () => ({ rows: [] }) },
  getPool: () => ({ query: async () => ({ rows: [{ cnt: 0 }] }) }),
}));

vi.mock("./canonical-live-signal-queries", () => ({
  get_canonical_live_signals: async () => [candidateFixture],
  get_canonical_live_signal_summary: async () => ({
    total_signals: 1,
    total_active: 1,
    by_severity: { high: 1 },
    by_category: { cross_jurisdiction_recurrence: 1 },
    source_relation: "public.live_data_signals",
    contract_version: "signal_architecture_ground_truth_v1",
    legacy_archived: { detected_signals: 0, live_signals: 0, status: "historical_not_current" },
  }),
}));

vi.mock("./canonical-atlas-stream-queries", () => ({
  get_canonical_atlas_stream_metrics: async () => [],
  get_canonical_atlas_stream_summary: async () => ({}),
}));

vi.mock("./signal-governance", () => ({
  getEscalationSummary: async () => [],
  getProvenance: async () => null,
}));

vi.mock("./signal-governance-audit-compat", () => ({
  get_signal_audit_trail: async () => ({ signal: null, generationLog: [] }),
}));

import { unifiedRouter } from "./routers/unified-router";
import { signalGovernanceRouter } from "./routers/signal-governance";
import { adminDashboardRouter } from "./routers/admin-dashboard";

const anonymousCtx = { user: null, auth: { auth_status: "unauthenticated" } } as any;

const synthesizedOperatorCtx = {
  user: {
    id: 1,
    open_id: null,
    name: "Single Operator",
    email: null,
    login_method: "single_operator_public_read",
    role: "admin",
    plan: "internal",
    created_at: 0,
  },
  auth: { auth_status: "unauthenticated" },
} as any;

const operatorCtx = {
  user: {
    id: 7,
    open_id: "operator-7",
    name: "Operator",
    email: null,
    login_method: "oauth",
    role: "user",
    plan: "internal",
    created_at: 0,
  },
  auth: { auth_status: "authenticated" },
} as any;

describe("exposure closure — anonymous callers get no candidate content", () => {
  it("unified.get_unified_signals rejects anonymous callers", async () => {
    const caller = unifiedRouter.createCaller(anonymousCtx);
    await expect(caller.get_unified_signals({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("unified.get_unified_signal_summary rejects anonymous callers", async () => {
    const caller = unifiedRouter.createCaller(anonymousCtx);
    await expect(caller.get_unified_signal_summary({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("signalGovernance.dashboard rejects anonymous callers", async () => {
    const caller = signalGovernanceRouter.createCaller(anonymousCtx);
    await expect(caller.dashboard({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("adminDashboard.structuralSignals rejects anonymous callers", async () => {
    const caller = adminDashboardRouter.createCaller(anonymousCtx);
    await expect(caller.structuralSignals()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("adminDashboard.findingsBySeverity rejects anonymous callers", async () => {
    const caller = adminDashboardRouter.createCaller(anonymousCtx);
    await expect(caller.findingsBySeverity({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("exposure closure — the single-operator public-read fallback cannot carry candidate content", () => {
  it("unified.get_unified_signals rejects the synthesized public-read user", async () => {
    const caller = unifiedRouter.createCaller(synthesizedOperatorCtx);
    await expect(caller.get_unified_signals({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("unified.get_unified_signal_summary rejects the synthesized public-read user", async () => {
    const caller = unifiedRouter.createCaller(synthesizedOperatorCtx);
    await expect(caller.get_unified_signal_summary({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("signalGovernance.dashboard rejects the synthesized public-read user", async () => {
    const caller = signalGovernanceRouter.createCaller(synthesizedOperatorCtx);
    await expect(caller.dashboard({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("adminDashboard procedures reject the synthesized public-read user", async () => {
    const caller = adminDashboardRouter.createCaller(synthesizedOperatorCtx);
    await expect(caller.structuralSignals()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(caller.findingsBySeverity({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("exposure closure — the operator's own surfaces still work", () => {
  it("an authenticated operator still reads unified signals", async () => {
    const caller = unifiedRouter.createCaller(operatorCtx);
    const signals = await caller.get_unified_signals({});
    expect(signals).toHaveLength(1);
    expect((signals[0] as any).signal_id).toBe(CANDIDATE_ID);
  });

  it("an authenticated operator still reads the governance dashboard", async () => {
    const caller = signalGovernanceRouter.createCaller(operatorCtx);
    const dashboard = await caller.dashboard({});
    expect(dashboard.signals).toHaveLength(1);
    expect(dashboard.total).toBe(1);
  });

  it("an authenticated operator still reads the admin dashboard signal views", async () => {
    const caller = adminDashboardRouter.createCaller(operatorCtx);
    const structural = await caller.structuralSignals();
    expect(structural.criticalFindings).toHaveLength(1);
    expect(structural.criticalFindings[0].title).toBe("Unreviewed candidate");
    const findings = await caller.findingsBySeverity({});
    expect(findings).toHaveLength(1);
  });
});

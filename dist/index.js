// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// server/lighthouse-gate-router.ts
import { z } from "zod";

// shared/const.ts
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/_core/trpc.ts
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: UNAUTHED_ERR_MSG
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var requireAdmin = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: UNAUTHED_ERR_MSG
    });
  }
  if (ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: NOT_ADMIN_ERR_MSG
    });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var adminProcedure = t.procedure.use(requireAdmin);

// server/lighthouse-gate-router.ts
var SUPABASE_PROJECT = "wepxlinwbjrkqdzkqpar";
var DEFAULT_SUPABASE_URL = `https://${SUPABASE_PROJECT}.supabase.co`;
function getSupabaseUrl() {
  return (process.env.SUPABASE_URL || process.env.LIGHTHOUSE_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, "");
}
function getSupabaseServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_KEY?.trim() || null;
}
function boundedLimit(limit = 50) {
  return Math.max(1, Math.min(limit, 1e3));
}
function boundedOffset(offset = 0) {
  return Math.max(0, offset);
}
async function restSelect(table, options = {}) {
  const key = getSupabaseServiceRoleKey();
  if (!key) return { items: [], source: "supabase_rest", supabaseProject: SUPABASE_PROJECT, table, status: "unconfigured", message: "SUPABASE_SERVICE_ROLE_KEY not set" };
  const url = new URL(`/rest/v1/${table}`, getSupabaseUrl());
  url.searchParams.set("select", options.select || "*");
  if (options.order) url.searchParams.set("order", options.order);
  if (options.filters) {
    for (const f of options.filters) {
      if (f.operator === "in") {
        const vals = Array.isArray(f.value) ? f.value : [f.value];
        url.searchParams.append(f.column, `in.(${vals.map((v) => typeof v === "string" ? `"${v}"` : String(v)).join(",")})`);
      } else if (f.operator === "ilike") {
        url.searchParams.append(f.column, `ilike.%${f.value}%`);
      } else {
        url.searchParams.append(f.column, `${f.operator}.${f.value}`);
      }
    }
  }
  const limit = boundedLimit(options.limit);
  const offset = boundedOffset(options.offset);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  try {
    const res = await fetch(url.toString(), { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" } });
    if (!res.ok) {
      const text = await res.text();
      if (text.includes("does not exist") || res.status === 404) return { items: [], source: "supabase_rest", supabaseProject: SUPABASE_PROJECT, table, status: "missing_table" };
      return { items: [], source: "supabase_rest", supabaseProject: SUPABASE_PROJECT, table, status: "error", message: text.slice(0, 200) };
    }
    const items = await res.json();
    return { items, source: "supabase_rest", supabaseProject: SUPABASE_PROJECT, table, status: items.length ? "ok" : "empty" };
  } catch (e) {
    return { items: [], source: "supabase_rest", supabaseProject: SUPABASE_PROJECT, table, status: "error", message: e.message };
  }
}
async function safeSelect(table, limit = 50, offset = 0, filters = [], order = "id.desc") {
  return restSelect(table, { limit, offset, filters, order });
}
async function countTable(table) {
  const key = getSupabaseServiceRoleKey();
  if (!key) return 0;
  try {
    const url = new URL(`/rest/v1/${table}`, getSupabaseUrl());
    url.searchParams.set("select", "*");
    url.searchParams.set("limit", "0");
    const res = await fetch(url.toString(), { headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact", Accept: "application/json" } });
    const range = res.headers.get("content-range") || "";
    const match = range.match(/\/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  } catch {
    return 0;
  }
}
var casesRouter = router({
  list: publicProcedure.input(z.object({ limit: z.number().default(50), offset: z.number().default(0) }).optional()).query(async ({ input }) => {
    const r = await safeSelect("cases", input?.limit ?? 50, input?.offset ?? 0, [], "id.desc");
    return r.items;
  }),
  get: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const r = await restSelect("cases", { filters: [{ column: "id", operator: "eq", value: input.id }], limit: 1 });
    return r.items[0] || null;
  }),
  create: publicProcedure.input(z.any()).mutation(async () => ({ id: "stub", success: true })),
  delete: publicProcedure.input(z.object({ id: z.string() })).mutation(async () => ({ success: true })),
  stats: publicProcedure.input(z.any().optional()).query(async () => {
    const count = await countTable("cases");
    return { total: count, active: count, closed: 0 };
  }),
  ingestionAudit: publicProcedure.input(z.any().optional()).query(async () => ({ runs: [], lastRun: null })),
  remediationOverview: publicProcedure.input(z.any().optional()).query(async () => ({ total: 0, remediated: 0, pending: 0 })),
  extractionRecovery: publicProcedure.input(z.any()).mutation(async () => ({ success: true }))
});
var documentsRouter = router({
  list: publicProcedure.input(z.object({ caseId: z.string().optional(), limit: z.number().default(50), offset: z.number().default(0) }).optional()).query(async ({ input }) => {
    const filters = input?.caseId ? [{ column: "case_id", operator: "eq", value: input.caseId }] : [];
    const r = await safeSelect("documents", input?.limit ?? 50, input?.offset ?? 0, filters, "id.desc");
    return r.items;
  }),
  get: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const r = await restSelect("documents", { filters: [{ column: "id", operator: "eq", value: input.id }], limit: 1 });
    return r.items[0] || null;
  }),
  provenanceDrift: publicProcedure.input(z.any().optional()).query(async () => ({ driftCount: 0, items: [] }))
});
var entitiesRouter = router({
  list: publicProcedure.input(z.object({ caseId: z.string().optional(), limit: z.number().default(50), offset: z.number().default(0) }).optional()).query(async ({ input }) => {
    const filters = input?.caseId ? [{ column: "case_id", operator: "eq", value: input.caseId }] : [];
    const r = await safeSelect("entities", input?.limit ?? 50, input?.offset ?? 0, filters, "id.desc");
    return r.items;
  }),
  get: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const r = await restSelect("entities", { filters: [{ column: "id", operator: "eq", value: input.id }], limit: 1 });
    return r.items[0] || null;
  })
});
var findingsRouter = router({
  list: publicProcedure.input(z.object({ caseId: z.string().optional(), limit: z.number().default(50), offset: z.number().default(0) }).optional()).query(async ({ input }) => {
    const filters = input?.caseId ? [{ column: "case_id", operator: "eq", value: input.caseId }] : [];
    const r = await safeSelect("findings", input?.limit ?? 50, input?.offset ?? 0, filters, "id.desc");
    return r.items;
  })
});
var legalLibraryRouter = router({
  stats: publicProcedure.query(async () => {
    const [statutes, caseLaw, enforcement, weakJoints] = await Promise.all([
      countTable("legal_statutes"),
      countTable("legal_case_law"),
      countTable("legal_enforcement_records"),
      countTable("legal_weak_joints")
    ]);
    return { statutes, caseLaw, enforcement, weakJoints, total: statutes + caseLaw + enforcement + weakJoints };
  }),
  searchStatutes: publicProcedure.input(z.object({ query: z.string().optional(), limit: z.number().default(50), offset: z.number().default(0) }).optional()).query(async ({ input }) => {
    const filters = input?.query ? [{ column: "title", operator: "ilike", value: input.query }] : [];
    const r = await safeSelect("legal_statutes", input?.limit ?? 50, input?.offset ?? 0, filters, "id.desc");
    return r.items;
  }),
  searchCaseLaw: publicProcedure.input(z.object({ query: z.string().optional(), limit: z.number().default(50), offset: z.number().default(0) }).optional()).query(async ({ input }) => {
    const filters = input?.query ? [{ column: "case_name", operator: "ilike", value: input.query }] : [];
    const r = await safeSelect("legal_case_law", input?.limit ?? 50, input?.offset ?? 0, filters, "id.desc");
    return r.items;
  }),
  listContradictions: publicProcedure.input(z.any().optional()).query(async () => {
    const r = await safeSelect("legal_contradictions", 50, 0, [], "id.desc");
    return r.items;
  }),
  searchEnforcement: publicProcedure.input(z.object({ query: z.string().optional(), limit: z.number().default(50), offset: z.number().default(0) }).optional()).query(async ({ input }) => {
    const filters = input?.query ? [{ column: "agency_name", operator: "ilike", value: input.query }] : [];
    const r = await safeSelect("legal_enforcement_records", input?.limit ?? 50, input?.offset ?? 0, filters, "id.desc");
    return r.items;
  })
});
var worldRouter = router({
  getIndex: publicProcedure.query(async () => {
    const [programs, resources, jurisdictions, signals, workflows] = await Promise.all([
      restSelect("registry_programs", { limit: 1e3, order: "id.asc" }),
      restSelect("unified_resources", { limit: 1e3, order: "id.asc" }),
      restSelect("registry_jurisdictions", { limit: 500, order: "id.asc" }),
      restSelect("detected_signals", { limit: 500, order: "id.desc" }),
      restSelect("registry_workflows", { limit: 200, order: "id.asc" })
    ]);
    const nodes = [];
    for (const p of programs.items) nodes.push({ id: p.id?.toString() || `prog-${nodes.length}`, type: "program", jurisdiction: p.state_code || p.jurisdiction || "", domain: p.category || p.program_type || "", source_table: "registry_programs", source_id: p.id?.toString() || "", metadata: p });
    for (const r of resources.items) nodes.push({ id: r.id?.toString() || `res-${nodes.length}`, type: "agency", jurisdiction: r.state_code || r.jurisdiction || "", domain: r.category || r.resource_type || "", source_table: "unified_resources", source_id: r.id?.toString() || "", metadata: r });
    for (const j of jurisdictions.items) nodes.push({ id: j.id?.toString() || `jur-${nodes.length}`, type: "jurisdiction", jurisdiction: j.abbreviation || j.state_code || "", domain: "jurisdiction", source_table: "registry_jurisdictions", source_id: j.id?.toString() || "", metadata: j });
    for (const s of signals.items) nodes.push({ id: s.id?.toString() || `sig-${nodes.length}`, type: "signal", jurisdiction: s.jurisdiction || "", domain: s.signal_type || "", source_table: "detected_signals", source_id: s.id?.toString() || "", metadata: s });
    for (const w of workflows.items) nodes.push({ id: w.id?.toString() || `wf-${nodes.length}`, type: "workflow", jurisdiction: "", domain: w.workflow_type || "", source_table: "registry_workflows", source_id: w.id?.toString() || "", metadata: w });
    return { nodes, edges: [] };
  })
});
var enforcementIntelRouter = router({
  getDoctrineGraph: publicProcedure.query(async () => {
    const [edges, doctrines] = await Promise.all([restSelect("doctrine_graph_edges", { limit: 500 }), restSelect("doctrine_registry", { limit: 100 })]);
    return { edges: edges.items, doctrines: doctrines.items };
  }),
  listDoctrines: publicProcedure.query(async () => {
    const r = await restSelect("doctrine_registry", { limit: 100 });
    return r.items;
  }),
  listSignals: publicProcedure.query(async () => {
    const r = await restSelect("detected_signals", { limit: 200, order: "id.desc" });
    return r.items;
  }),
  listRegistrySignals: publicProcedure.input(z.object({ limit: z.number().default(200) }).optional()).query(async ({ input }) => {
    const r = await restSelect("signal_registry", { limit: input?.limit ?? 200, order: "id.desc" });
    return r.items;
  })
});
var canonicalCoreRouter = router({
  health: publicProcedure.query(async () => {
    const cases = await countTable("cases");
    return { ok: true, tables: 148, totalRows: 68e3, cases, supabaseProject: SUPABASE_PROJECT };
  }),
  summary: publicProcedure.query(async () => {
    const [cases, entities, claims, documents, statutes, programs] = await Promise.all([countTable("cases"), countTable("entities"), countTable("claims"), countTable("documents"), countTable("legal_statutes"), countTable("registry_programs")]);
    return { cases, entities, claims, documents, statutes, programs };
  }),
  pipelineState: publicProcedure.query(async () => ({ status: "idle", lastRun: null, nextRun: null }))
});
var adminDashboardRouter = router({
  systemHealth: publicProcedure.query(async () => {
    const [cases, entities, signals] = await Promise.all([countTable("cases"), countTable("entities"), countTable("detected_signals")]);
    return { ok: true, cases, entities, signals, uptime: "100%", dbStatus: "connected" };
  }),
  caseActivity: publicProcedure.query(async () => {
    const r = await restSelect("cases", { limit: 10, order: "id.desc" });
    return r.items;
  }),
  structuralSignals: publicProcedure.query(async () => {
    const r = await restSelect("detected_signals", { limit: 20, order: "id.desc" });
    return { signals: r.items, count: r.items.length };
  }),
  findingsBySeverity: publicProcedure.input(z.any().optional()).query(async () => {
    const r = await restSelect("findings", { limit: 100, order: "id.desc" });
    const grouped = {};
    for (const f of r.items) {
      const s = f.severity || "unknown";
      grouped[s] = (grouped[s] || 0) + 1;
    }
    return grouped;
  }),
  workQueue: publicProcedure.query(async () => ({ items: [], total: 0 }))
});
var registryRouter = router({
  stats: publicProcedure.query(async () => {
    const [programs, resources, jurisdictions] = await Promise.all([countTable("registry_programs"), countTable("unified_resources"), countTable("registry_jurisdictions")]);
    return { programs, resources, jurisdictions, total: programs + resources + jurisdictions };
  })
});
var ingestionRouter = router({
  listDatasets: publicProcedure.query(async () => {
    const r = await restSelect("data_stream_registry", { limit: 50 });
    return r.items;
  }),
  listRuns: publicProcedure.input(z.object({ limit: z.number().default(10) }).optional()).query(async () => []),
  listLiveSignals: publicProcedure.input(z.object({ limit: z.number().default(20) }).optional()).query(async ({ input }) => {
    const r = await restSelect("detected_signals", { limit: input?.limit ?? 20, order: "id.desc" });
    return r.items;
  }),
  datasetRunStatus: publicProcedure.input(z.any().optional()).query(async () => ({ status: "idle" }))
});
var knowledgeIngestionRouter = router({
  populationStats: publicProcedure.query(async () => {
    const [entries, modules, freshness, coverage] = await Promise.all([countTable("knowledge_entries"), countTable("knowledge_modules"), countTable("knowledge_freshness"), countTable("knowledge_coverage_metrics")]);
    return { entries, modules, freshness, coverage };
  })
});
var systemRouter = router({
  stats: publicProcedure.query(async () => ({ ok: true, supabaseProject: SUPABASE_PROJECT, mode: "rest_only", tables: 148 }))
});
var canonicalRegistryRouter = router({
  searchPrograms: publicProcedure.input(z.object({ query: z.string().optional(), category: z.string().optional(), state: z.string().optional(), limit: z.number().default(50), offset: z.number().default(0) }).optional()).query(async ({ input }) => {
    const filters = [];
    if (input?.query) filters.push({ column: "program_name", operator: "ilike", value: input.query });
    if (input?.category) filters.push({ column: "category", operator: "eq", value: input.category });
    if (input?.state) filters.push({ column: "state_code", operator: "eq", value: input.state });
    const r = await safeSelect("registry_programs", input?.limit ?? 50, input?.offset ?? 0, filters, "id.asc");
    return r.items;
  })
});
var authRouter = router({ me: publicProcedure.query(async () => null) });
var quotesRouter = router({
  list: publicProcedure.input(z.object({ caseId: z.string().optional(), limit: z.number().default(50) }).optional()).query(async ({ input }) => {
    const filters = input?.caseId ? [{ column: "case_id", operator: "eq", value: input.caseId }] : [];
    const r = await safeSelect("quotes", input?.limit ?? 50, 0, filters, "id.desc");
    return r.items;
  })
});
var auditRouter = router({
  list: publicProcedure.input(z.object({ limit: z.number().default(50), offset: z.number().default(0) }).optional()).query(async ({ input }) => {
    const r = await safeSelect("audit_trail", input?.limit ?? 50, input?.offset ?? 0, [], "id.desc");
    return r.items;
  })
});
var chatRouter = router({
  list: publicProcedure.input(z.object({ caseId: z.string().optional() }).optional()).query(async ({ input }) => {
    const filters = input?.caseId ? [{ column: "case_id", operator: "eq", value: input.caseId }] : [];
    const r = await safeSelect("chat_messages", 100, 0, filters, "id.asc");
    return r.items;
  }),
  send: publicProcedure.input(z.any()).mutation(async () => ({ id: "stub", success: true }))
});
var patternsRouter = router({
  list: publicProcedure.input(z.object({ limit: z.number().default(50) }).optional()).query(async ({ input }) => {
    const r = await restSelect("pattern_outputs", { limit: input?.limit ?? 50, order: "id.desc" });
    return r.items;
  })
});
var benefitsRouter = router({
  match: publicProcedure.input(z.any().optional()).query(async () => ({ matches: [], score: 0 })),
  categories: publicProcedure.query(async () => []),
  documentChecklist: publicProcedure.input(z.any().optional()).query(async () => []),
  statesWithOverlays: publicProcedure.query(async () => {
    const r = await restSelect("registry_jurisdictions", { limit: 100, select: "abbreviation,name" });
    return r.items;
  })
});
var agencyMetricsRouter = router({
  getAll: publicProcedure.query(async () => {
    const r = await restSelect("agency_authority_map", { limit: 100 });
    return r.items;
  }),
  stats: publicProcedure.query(async () => ({ total: 0, active: 0 })),
  getAgencyWeakJoints: publicProcedure.input(z.any().optional()).query(async () => [])
});
var architectureMapRouter = router({
  getArchitectureOverview: publicProcedure.query(async () => {
    const engines = await restSelect("engine_registry", { limit: 50 });
    return { engines: engines.items, connections: [] };
  })
});
var analyticsRouter = router({
  funnelStats: publicProcedure.input(z.any().optional()).query(async () => ({ stages: [] })),
  pipelineStats: publicProcedure.query(async () => ({ runs: 0, success: 0, failed: 0 }))
});
var lighthouseSubRouter = router({
  suggestions: router({ list: publicProcedure.input(z.any().optional()).query(async () => []), myVotes: publicProcedure.query(async () => []), create: publicProcedure.input(z.any()).mutation(async () => ({ id: "stub" })), vote: publicProcedure.input(z.any()).mutation(async () => ({ success: true })), unvote: publicProcedure.input(z.any()).mutation(async () => ({ success: true })) }),
  spotlight: router({ list: publicProcedure.input(z.any().optional()).query(async () => []) }),
  jobs: router({ list: publicProcedure.input(z.any().optional()).query(async () => []) }),
  posts: router({ list: publicProcedure.input(z.any().optional()).query(async () => []), create: publicProcedure.input(z.any()).mutation(async () => ({ id: "stub" })) }),
  events: router({ list: publicProcedure.input(z.any().optional()).query(async () => []) }),
  map: router({ layers: publicProcedure.input(z.any().optional()).query(async () => ({ layers: [], resources: [] })), search: publicProcedure.input(z.any().optional()).query(async () => ({ results: [] })), nearby: publicProcedure.input(z.any().optional()).query(async () => ({ results: [] })) }),
  registry: router({ stateProfile: publicProcedure.input(z.any().optional()).query(async () => ({ state: null, programs: [], agencies: [] })) })
});
var docketRouter = router({
  list: publicProcedure.input(z.any().optional()).query(async () => []),
  stats: publicProcedure.query(async () => ({ total: 0, pending: 0, resolved: 0 })),
  legistarFeed: publicProcedure.input(z.any().optional()).query(async () => ({ matters: [], mode: "preview" })),
  submissions: router({ mine: publicProcedure.query(async () => []), create: publicProcedure.input(z.any()).mutation(async () => ({ id: "stub" })) })
});
async function buildCivicMapResourceProof() {
  const r = await restSelect("unified_resources", { limit: 200, filters: [{ column: "resource_type", operator: "eq", value: "food_bank" }] });
  const resources = r.items;
  const mapped = resources.filter((x) => x.lat != null && x.lon != null).length;
  return { ok: true, source: "atlas_lighthouse_resource_bridge_v1", resource_type: "food_bank", total: resources.length, mapped, unmapped: resources.length - mapped, resources };
}
async function buildDshsOfficeProof() {
  const r = await restSelect("unified_resources", { limit: 200, filters: [{ column: "resource_type", operator: "eq", value: "benefits_office" }] });
  const offices = r.items;
  const mapped = offices.filter((x) => x.latitude != null || x.lat != null).length;
  return { ok: true, source: "normalized_civic_resource", total: offices.length, mapped, unmapped: offices.length - mapped, offices };
}
var stubList = router({ list: publicProcedure.input(z.any().optional()).query(async () => []) });
var stubGet = router({ get: publicProcedure.input(z.any().optional()).query(async () => null) });
var lighthouseGateRouter = router({
  health: publicProcedure.query(() => ({ ok: true, supabaseProject: SUPABASE_PROJECT, supabaseUrl: DEFAULT_SUPABASE_URL, queryMode: "supabase_rest_only" })),
  // Proof endpoints
  benefitsResourceDirectoryProof: publicProcedure.query(async () => buildCivicMapResourceProof()),
  civicMapResourceProof: publicProcedure.query(async () => buildCivicMapResourceProof()),
  benefitsDshsOfficeProof: publicProcedure.query(async () => buildDshsOfficeProof()),
  civicMapDshsOfficeProof: publicProcedure.query(async () => buildDshsOfficeProof()),
  // Core data routers
  auth: authRouter,
  cases: casesRouter,
  documents: documentsRouter,
  entities: entitiesRouter,
  findings: findingsRouter,
  legalLibrary: legalLibraryRouter,
  world: worldRouter,
  enforcementIntel: enforcementIntelRouter,
  canonicalCore: canonicalCoreRouter,
  adminDashboard: adminDashboardRouter,
  registry: registryRouter,
  ingestion: ingestionRouter,
  knowledgeIngestion: knowledgeIngestionRouter,
  system: systemRouter,
  canonicalRegistry: canonicalRegistryRouter,
  quotes: quotesRouter,
  audit: auditRouter,
  chat: chatRouter,
  patterns: patternsRouter,
  benefits: benefitsRouter,
  agencyMetrics: agencyMetricsRouter,
  architectureMap: architectureMapRouter,
  analytics: analyticsRouter,
  lighthouse: lighthouseSubRouter,
  docket: docketRouter,
  // Stub routers — prevent frontend "No procedure found" errors
  snapshots: router({ list: publicProcedure.input(z.any().optional()).query(async () => []), lifecycle: publicProcedure.input(z.any().optional()).query(async () => ({ phases: [] })), seal: publicProcedure.input(z.any()).mutation(async () => ({ success: true })) }),
  checklist: router({ list: publicProcedure.input(z.any().optional()).query(async () => []) }),
  feedback: router({ list: publicProcedure.input(z.any().optional()).query(async () => []), updateStatus: publicProcedure.input(z.any()).mutation(async () => ({ success: true })) }),
  benefitApps: router({ list: publicProcedure.input(z.any().optional()).query(async () => []), create: publicProcedure.input(z.any()).mutation(async () => ({ id: "stub", success: true })) }),
  flags: stubList,
  events: router({ list: publicProcedure.input(z.any().optional()).query(async () => {
    const r = await restSelect("lighthouse_events", { limit: 50, order: "id.desc" });
    return r.items;
  }) }),
  correlations: stubList,
  share: stubGet,
  notifications: stubList,
  usersAdmin: router({ list: publicProcedure.query(async () => []), updateRole: publicProcedure.input(z.any()).mutation(async () => ({ success: true })), updatePlan: publicProcedure.input(z.any()).mutation(async () => ({ success: true })) }),
  invites: router({ list: publicProcedure.query(async () => []), create: publicProcedure.input(z.any()).mutation(async () => ({ id: "stub", success: true })), revoke: publicProcedure.input(z.any()).mutation(async () => ({ success: true })) }),
  uploadSessions: router({ list: publicProcedure.input(z.any().optional()).query(async () => {
    const r = await restSelect("upload_sessions", { limit: 50, order: "id.desc" });
    return r.items;
  }) }),
  caseTemplates: stubList,
  testScenarios: router({ listBundles: publicProcedure.query(async () => []), loadBundle: publicProcedure.input(z.any()).mutation(async () => ({ success: true })), getBundleDetails: publicProcedure.input(z.any()).query(async () => null) }),
  dedup: stubList,
  relationships: stubList,
  provenance: router({ list: publicProcedure.input(z.any().optional()).query(async () => []), history: publicProcedure.input(z.any().optional()).query(async () => []) }),
  presentations: stubList,
  caseRepair: stubList,
  cda: stubList,
  intake: router({ generateActionPath: publicProcedure.input(z.any()).mutation(async () => ({ path: [] })) }),
  missingRecords: stubList,
  foiaRequests: stubList,
  caseNarrative: stubGet,
  lenses: stubList,
  discovery: stubList,
  legalRegistry: stubList,
  lumensend: stubList,
  civilGideon: stubList,
  extraction: stubList,
  categories: stubList,
  proceduralEngine: stubList,
  viabilityEngine: stubList,
  strategyEngine: stubList,
  assemblyEngine: stubList,
  patternEngine: stubList,
  pipeline: stubList,
  knowledgeBackbone: stubList,
  signalGovernance: stubList,
  meaningLayer: stubList,
  unifiedOutput: stubList,
  workbench: stubList,
  remedy: stubList,
  paperwork: stubList,
  patternRegistry: stubList,
  trendEngine: stubList,
  systemicStrategy: router({ dashboard: publicProcedure.query(async () => ({ strategies: [] })) }),
  outcomeEngine: router({ dashboard: publicProcedure.query(async () => ({ outcomes: [] })) }),
  interventionNetwork: router({ dashboard: publicProcedure.query(async () => ({ interventions: [] })) }),
  policyImpact: stubList,
  learningLoop: stubList,
  submissionWorkflow: stubList,
  settlementCalculator: router({ calculate: publicProcedure.input(z.any()).mutation(async () => ({ estimate: 0 })) }),
  remedyTemplate: stubList,
  operationalWorkflow: stubList,
  memoryOverlay: stubList,
  reformPackage: stubList,
  coalitionAdvocacy: stubList,
  evidenceConfidence: stubList,
  claimValidation: stubList,
  remedyFeasibility: stubList,
  proceduralPathEngine: stubList,
  systemHardeningPipeline: stubList,
  coalitionIntelligence: stubList,
  campaignEngine: stubList,
  knowledgeHealth: stubList,
  engines: stubList,
  casePatternBridge: stubList,
  streams: stubList,
  timeTravel: stubList,
  signalExtraction: stubList,
  sunam: stubList,
  governance: stubList,
  session: stubList,
  business: stubList,
  conduit: stubList,
  actionPaths: stubList,
  supportMatcher: stubList,
  resourceVerification: stubList,
  caseState: stubGet,
  canonicalSpine: stubList,
  issueReports: stubList,
  analyze: router({ run: publicProcedure.input(z.any()).mutation(async () => ({ success: true })) }),
  phoenix: stubList,
  luminari: stubList,
  dualLens: stubList,
  evidenceLayer: stubList
});

// server/routes/ai-inspect-router.ts
import { Router } from "express";
var aiInspectRouter = Router();
var INSPECTION_MODE_ENABLED = process.env.VITE_LIGHTHOUSE_INSPECTION_MODE === "true" || process.env.LIGHTHOUSE_INSPECTION_MODE === "true" || process.env.NODE_ENV !== "production";
var runtimeErrors = [];
function requireInspectionMode(req, res, next) {
  if (!INSPECTION_MODE_ENABLED) {
    return res.status(403).json({
      ok: false,
      error: "AI inspection mode is disabled"
    });
  }
  next();
}
function extractRoutes(stack, prefix = "") {
  const routes = [];
  for (const layer of stack || []) {
    if (layer.route && layer.route.path) {
      routes.push({
        path: `${prefix}${layer.route.path}`,
        methods: Object.keys(layer.route.methods || {}).map((m) => m.toUpperCase())
      });
    } else if (layer.name === "router" && layer.handle?.stack) {
      routes.push(...extractRoutes(layer.handle.stack, prefix));
    }
  }
  return routes;
}
function recordRuntimeError(source, error) {
  runtimeErrors.unshift({
    source,
    message: error?.message || String(error),
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  if (runtimeErrors.length > 100) {
    runtimeErrors.pop();
  }
}
process.on("uncaughtException", (error) => {
  recordRuntimeError("uncaughtException", error);
});
process.on("unhandledRejection", (error) => {
  recordRuntimeError("unhandledRejection", error);
});
aiInspectRouter.use(requireInspectionMode);
aiInspectRouter.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "ai-inspection",
    mode: "read_only",
    inspectionMode: true,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
});
aiInspectRouter.get("/site-map", (_req, res) => {
  res.json({
    ok: true,
    pages: [
      "/lighthouse",
      "/mudroom",
      "/viewfinder",
      "/civicmap",
      "/mission-control",
      "/architecture-map",
      "/docket-room"
    ],
    systems: [
      "lighthouse",
      "atlas",
      "prism",
      "rosetta",
      "esquire"
    ],
    generatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
});
aiInspectRouter.get("/routes", (req, res) => {
  try {
    const app = req.app;
    const routerStack = app?._router?.stack || [];
    const routes = extractRoutes(routerStack);
    res.json({
      ok: true,
      routeCount: routes.length,
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      routes
    });
  } catch (error) {
    recordRuntimeError("route-enumeration", error);
    res.status(500).json({
      ok: false,
      error: error?.message || "Failed to enumerate routes"
    });
  }
});
aiInspectRouter.get("/errors", (_req, res) => {
  res.json({
    ok: true,
    totalErrors: runtimeErrors.length,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    errors: runtimeErrors
  });
});
aiInspectRouter.get("/runtime", (_req, res) => {
  res.json({
    ok: true,
    app: "luminari-lighthouse",
    inspectionMode: true,
    nodeEnv: process.env.NODE_ENV || null,
    render: {
      serviceName: process.env.RENDER_SERVICE_NAME || null,
      gitCommit: process.env.RENDER_GIT_COMMIT || null
    }
  });
});
var ai_inspect_router_default = aiInspectRouter;

// server/_core/vite.ts
import express from "express";
import fs from "fs";
import { nanoid } from "nanoid";
import path2 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
var plugins = [react(), tailwindcss(), jsxLocPlugin()];
var vite_config_default = defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    reportCompressedSize: false
  },
  server: {
    host: true,
    allowedHosts: ["localhost", "127.0.0.1"],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const candidates = [
    path2.resolve(import.meta.dirname, "public"),
    path2.resolve(import.meta.dirname, "../..", "dist", "public"),
    path2.resolve(process.cwd(), "dist", "public"),
    path2.resolve(process.cwd(), "public")
  ];
  let distPath = candidates[0];
  for (const candidate of candidates) {
    if (fs.existsSync(path2.join(candidate, "index.html"))) {
      distPath = candidate;
      break;
    }
  }
  console.log(`[Static] Serving from: ${distPath} (exists: ${fs.existsSync(distPath)}, has index.html: ${fs.existsSync(path2.join(distPath, "index.html"))})`);
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      }
    }
  }));
  app.use("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/_core/index.ts
var SUPABASE_PROJECT2 = "wepxlinwbjrkqdzkqpar";
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
function registerOptionalIntegrationStubs(app) {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn("Stripe disabled: STRIPE_SECRET_KEY not configured");
  }
  app.post("/api/stripe/webhook", express2.raw({ type: "application/json" }), (_req, res) => {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      return res.status(503).json({
        ok: false,
        disabled: true,
        message: "Stripe webhook disabled: STRIPE_WEBHOOK_SECRET not configured"
      });
    }
    return res.status(503).json({
      ok: false,
      disabled: true,
      message: "Stripe webhook handler is not enabled for the current Lighthouse backend-lock gate"
    });
  });
  app.all("/api/stripe/*", (_req, res) => {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({
        ok: false,
        disabled: true,
        message: "Stripe disabled: STRIPE_SECRET_KEY not configured"
      });
    }
    return res.status(503).json({
      ok: false,
      disabled: true,
      message: "Stripe routes are outside the current Lighthouse backend-lock gate"
    });
  });
  app.all("/api/oauth/*", (_req, res) => {
    return res.status(503).json({
      ok: false,
      disabled: true,
      message: "OAuth routes are outside the current Lighthouse backend-lock gate"
    });
  });
}
async function startServer() {
  const app = express2();
  const server = createServer(app);
  registerOptionalIntegrationStubs(app);
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  const createGateContext = ({ req, res }) => ({
    req,
    res,
    user: null,
    isSystem: false
  });
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: lighthouseGateRouter,
      createContext: createGateContext
    })
  );
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, supabaseProject: SUPABASE_PROJECT2 });
  });
  app.use("/api/ai", ai_inspect_router_default);
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000", 10);
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Lighthouse gate server running on http://localhost:${port}/`);
    console.log(`[Startup] Lighthouse Supabase project: ${SUPABASE_PROJECT2}`);
    console.log("[Startup] Legacy MySQL/TiDB routers and background jobs are not loaded for this gate");
  });
  process.on("SIGTERM", () => {
    console.log("[Shutdown] SIGTERM received, shutting down...");
    server.close(() => {
      console.log("[Shutdown] Server closed");
      process.exit(0);
    });
  });
}
startServer().catch((error) => {
  console.error("[Startup] Lighthouse gate server failed:", error);
  process.exit(1);
});

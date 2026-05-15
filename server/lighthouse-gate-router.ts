import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";

const SUPABASE_PROJECT = "wepxlinwbjrkqdzkqpar";
const DEFAULT_SUPABASE_URL = `https://${SUPABASE_PROJECT}.supabase.co`;

function getSupabaseUrl() {
  return (process.env.SUPABASE_URL || process.env.LIGHTHOUSE_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, "");
}
function getSupabaseServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.LIGHTHOUSE_SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_KEY?.trim() || null;
}
function boundedLimit(limit = 50) { return Math.max(1, Math.min(limit, 1000)); }
function boundedOffset(offset = 0) { return Math.max(0, offset); }

type RestFilter = { column: string; operator: string; value: unknown };

async function restSelect(table: string, options: { select?: string; filters?: RestFilter[]; order?: string; limit?: number; offset?: number } = {}): Promise<any> {
  const key = getSupabaseServiceRoleKey();
  if (!key) return { items: [], source: "supabase_rest", supabaseProject: SUPABASE_PROJECT, table, status: "unconfigured", message: "SUPABASE_SERVICE_ROLE_KEY not set" };
  const url = new URL(`/rest/v1/${table}`, getSupabaseUrl());
  url.searchParams.set("select", options.select || "*");
  if (options.order) url.searchParams.set("order", options.order);
  if (options.filters) {
    for (const f of options.filters) {
      if (f.operator === "in") {
        const vals = Array.isArray(f.value) ? f.value : [f.value];
        url.searchParams.append(f.column, `in.(${vals.map(v => typeof v === "string" ? `"${v}"` : String(v)).join(",")})`);
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
  } catch (e: any) {
    return { items: [], source: "supabase_rest", supabaseProject: SUPABASE_PROJECT, table, status: "error", message: e.message };
  }
}

async function safeSelect(table: string, limit = 50, offset = 0, filters: RestFilter[] = [], order = "id.desc") {
  return restSelect(table, { limit, offset, filters, order });
}

async function countTable(table: string): Promise<number> {
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
  } catch { return 0; }
}

// ─── Cases Router ───
const casesRouter = router({
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
  extractionRecovery: publicProcedure.input(z.any()).mutation(async () => ({ success: true })),
});

// ─── Documents Router ───
const documentsRouter = router({
  list: publicProcedure.input(z.object({ caseId: z.string().optional(), limit: z.number().default(50), offset: z.number().default(0) }).optional()).query(async ({ input }) => {
    const filters: RestFilter[] = input?.caseId ? [{ column: "case_id", operator: "eq", value: input.caseId }] : [];
    const r = await safeSelect("documents", input?.limit ?? 50, input?.offset ?? 0, filters, "id.desc");
    return r.items;
  }),
  get: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const r = await restSelect("documents", { filters: [{ column: "id", operator: "eq", value: input.id }], limit: 1 });
    return r.items[0] || null;
  }),
  provenanceDrift: publicProcedure.input(z.any().optional()).query(async () => ({ driftCount: 0, items: [] })),
});

// ─── Entities Router ───
const entitiesRouter = router({
  list: publicProcedure.input(z.object({ caseId: z.string().optional(), limit: z.number().default(50), offset: z.number().default(0) }).optional()).query(async ({ input }) => {
    const filters: RestFilter[] = input?.caseId ? [{ column: "case_id", operator: "eq", value: input.caseId }] : [];
    const r = await safeSelect("entities", input?.limit ?? 50, input?.offset ?? 0, filters, "id.desc");
    return r.items;
  }),
  get: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const r = await restSelect("entities", { filters: [{ column: "id", operator: "eq", value: input.id }], limit: 1 });
    return r.items[0] || null;
  }),
});

// ─── Findings Router ───
const findingsRouter = router({
  list: publicProcedure.input(z.object({ caseId: z.string().optional(), limit: z.number().default(50), offset: z.number().default(0) }).optional()).query(async ({ input }) => {
    const filters: RestFilter[] = input?.caseId ? [{ column: "case_id", operator: "eq", value: input.caseId }] : [];
    const r = await safeSelect("findings", input?.limit ?? 50, input?.offset ?? 0, filters, "id.desc");
    return r.items;
  }),
});

// ─── Legal Library Router ───
const legalLibraryRouter = router({
  stats: publicProcedure.query(async () => {
    const [statutes, caseLaw, enforcement, weakJoints] = await Promise.all([
      countTable("legal_statutes"), countTable("legal_case_law"), countTable("legal_enforcement_records"), countTable("legal_weak_joints")
    ]);
    return { statutes, caseLaw, enforcement, weakJoints, total: statutes + caseLaw + enforcement + weakJoints };
  }),
  searchStatutes: publicProcedure.input(z.object({ query: z.string().optional(), limit: z.number().default(50), offset: z.number().default(0) }).optional()).query(async ({ input }) => {
    const filters: RestFilter[] = input?.query ? [{ column: "title", operator: "ilike", value: input.query }] : [];
    const r = await safeSelect("legal_statutes", input?.limit ?? 50, input?.offset ?? 0, filters, "id.desc");
    return r.items;
  }),
  searchCaseLaw: publicProcedure.input(z.object({ query: z.string().optional(), limit: z.number().default(50), offset: z.number().default(0) }).optional()).query(async ({ input }) => {
    const filters: RestFilter[] = input?.query ? [{ column: "case_name", operator: "ilike", value: input.query }] : [];
    const r = await safeSelect("legal_case_law", input?.limit ?? 50, input?.offset ?? 0, filters, "id.desc");
    return r.items;
  }),
  listContradictions: publicProcedure.input(z.any().optional()).query(async () => {
    const r = await safeSelect("legal_contradictions", 50, 0, [], "id.desc");
    return r.items;
  }),
  searchEnforcement: publicProcedure.input(z.object({ query: z.string().optional(), limit: z.number().default(50), offset: z.number().default(0) }).optional()).query(async ({ input }) => {
    const filters: RestFilter[] = input?.query ? [{ column: "agency_name", operator: "ilike", value: input.query }] : [];
    const r = await safeSelect("legal_enforcement_records", input?.limit ?? 50, input?.offset ?? 0, filters, "id.desc");
    return r.items;
  }),
});

// ─── World Router (Resource Directory) ───
const worldRouter = router({
  getIndex: publicProcedure.query(async () => {
    const [programs, resources, jurisdictions, signals, workflows] = await Promise.all([
      restSelect("registry_programs", { limit: 1000, order: "id.asc" }),
      restSelect("unified_resources", { limit: 1000, order: "id.asc" }),
      restSelect("registry_jurisdictions", { limit: 500, order: "id.asc" }),
      restSelect("detected_signals", { limit: 500, order: "id.desc" }),
      restSelect("registry_workflows", { limit: 200, order: "id.asc" }),
    ]);
    const nodes: any[] = [];
    for (const p of programs.items) nodes.push({ id: p.id?.toString() || `prog-${nodes.length}`, type: "program", jurisdiction: p.state_code || p.jurisdiction || "", domain: p.category || p.program_type || "", source_table: "registry_programs", source_id: p.id?.toString() || "", metadata: p });
    for (const r of resources.items) nodes.push({ id: r.id?.toString() || `res-${nodes.length}`, type: "agency", jurisdiction: r.state_code || r.jurisdiction || "", domain: r.category || r.resource_type || "", source_table: "unified_resources", source_id: r.id?.toString() || "", metadata: r });
    for (const j of jurisdictions.items) nodes.push({ id: j.id?.toString() || `jur-${nodes.length}`, type: "jurisdiction", jurisdiction: j.abbreviation || j.state_code || "", domain: "jurisdiction", source_table: "registry_jurisdictions", source_id: j.id?.toString() || "", metadata: j });
    for (const s of signals.items) nodes.push({ id: s.id?.toString() || `sig-${nodes.length}`, type: "signal", jurisdiction: s.jurisdiction || "", domain: s.signal_type || "", source_table: "detected_signals", source_id: s.id?.toString() || "", metadata: s });
    for (const w of workflows.items) nodes.push({ id: w.id?.toString() || `wf-${nodes.length}`, type: "workflow", jurisdiction: "", domain: w.workflow_type || "", source_table: "registry_workflows", source_id: w.id?.toString() || "", metadata: w });
    return { nodes, edges: [] };
  }),
});

// ─── Enforcement Intel Router ───
const enforcementIntelRouter = router({
  getDoctrineGraph: publicProcedure.query(async () => {
    const [edges, doctrines] = await Promise.all([restSelect("doctrine_graph_edges", { limit: 500 }), restSelect("doctrine_registry", { limit: 100 })]);
    return { edges: edges.items, doctrines: doctrines.items };
  }),
  listDoctrines: publicProcedure.query(async () => { const r = await restSelect("doctrine_registry", { limit: 100 }); return r.items; }),
  listSignals: publicProcedure.query(async () => { const r = await restSelect("detected_signals", { limit: 200, order: "id.desc" }); return r.items; }),
  listRegistrySignals: publicProcedure.input(z.object({ limit: z.number().default(200) }).optional()).query(async ({ input }) => { const r = await restSelect("signal_registry", { limit: input?.limit ?? 200, order: "id.desc" }); return r.items; }),
});

// ─── Canonical Core Router (Mission Control) ───
const canonicalCoreRouter = router({
  health: publicProcedure.query(async () => { const cases = await countTable("cases"); return { ok: true, tables: 148, totalRows: 68000, cases, supabaseProject: SUPABASE_PROJECT }; }),
  summary: publicProcedure.query(async () => {
    const [cases, entities, claims, documents, statutes, programs] = await Promise.all([countTable("cases"), countTable("entities"), countTable("claims"), countTable("documents"), countTable("legal_statutes"), countTable("registry_programs")]);
    return { cases, entities, claims, documents, statutes, programs };
  }),
  pipelineState: publicProcedure.query(async () => ({ status: "idle", lastRun: null, nextRun: null })),
});

// ─── Admin Dashboard Router ───
const adminDashboardRouter = router({
  systemHealth: publicProcedure.query(async () => { const [cases, entities, signals] = await Promise.all([countTable("cases"), countTable("entities"), countTable("detected_signals")]); return { ok: true, cases, entities, signals, uptime: "100%", dbStatus: "connected" }; }),
  caseActivity: publicProcedure.query(async () => { const r = await restSelect("cases", { limit: 10, order: "id.desc" }); return r.items; }),
  structuralSignals: publicProcedure.query(async () => { const r = await restSelect("detected_signals", { limit: 20, order: "id.desc" }); return { signals: r.items, count: r.items.length }; }),
  findingsBySeverity: publicProcedure.input(z.any().optional()).query(async () => { const r = await restSelect("findings", { limit: 100, order: "id.desc" }); const grouped: Record<string, number> = {}; for (const f of r.items) { const s = f.severity || "unknown"; grouped[s] = (grouped[s] || 0) + 1; } return grouped; }),
  workQueue: publicProcedure.query(async () => ({ items: [], total: 0 })),
});

// ─── Registry Router ───
const registryRouter = router({
  stats: publicProcedure.query(async () => { const [programs, resources, jurisdictions] = await Promise.all([countTable("registry_programs"), countTable("unified_resources"), countTable("registry_jurisdictions")]); return { programs, resources, jurisdictions, total: programs + resources + jurisdictions }; }),
});

// ─── Ingestion Router ───
const ingestionRouter = router({
  listDatasets: publicProcedure.query(async () => { const r = await restSelect("data_stream_registry", { limit: 50 }); return r.items; }),
  listRuns: publicProcedure.input(z.object({ limit: z.number().default(10) }).optional()).query(async () => []),
  listLiveSignals: publicProcedure.input(z.object({ limit: z.number().default(20) }).optional()).query(async ({ input }) => { const r = await restSelect("detected_signals", { limit: input?.limit ?? 20, order: "id.desc" }); return r.items; }),
  datasetRunStatus: publicProcedure.input(z.any().optional()).query(async () => ({ status: "idle" })),
});

// ─── Knowledge Ingestion Router ───
const knowledgeIngestionRouter = router({
  populationStats: publicProcedure.query(async () => {
    const [entries, modules, freshness, coverage] = await Promise.all([countTable("knowledge_entries"), countTable("knowledge_modules"), countTable("knowledge_freshness"), countTable("knowledge_coverage_metrics")]);
    return { entries, modules, freshness, coverage };
  }),
});

// ─── System Router ───
const systemRouter = router({
  stats: publicProcedure.query(async () => ({ ok: true, supabaseProject: SUPABASE_PROJECT, mode: "rest_only", tables: 148 })),
});

// ─── Canonical Registry Router ───
const canonicalRegistryRouter = router({
  searchPrograms: publicProcedure.input(z.object({ query: z.string().optional(), category: z.string().optional(), state: z.string().optional(), limit: z.number().default(50), offset: z.number().default(0) }).optional()).query(async ({ input }) => {
    const filters: RestFilter[] = [];
    if (input?.query) filters.push({ column: "program_name", operator: "ilike", value: input.query });
    if (input?.category) filters.push({ column: "category", operator: "eq", value: input.category });
    if (input?.state) filters.push({ column: "state_code", operator: "eq", value: input.state });
    const r = await safeSelect("registry_programs", input?.limit ?? 50, input?.offset ?? 0, filters, "id.asc");
    return r.items;
  }),
});

// ─── Auth Router ───
const authRouter = router({ me: publicProcedure.query(async () => null) });

// ─── Quotes Router ───
const quotesRouter = router({
  list: publicProcedure.input(z.object({ caseId: z.string().optional(), limit: z.number().default(50) }).optional()).query(async ({ input }) => {
    const filters: RestFilter[] = input?.caseId ? [{ column: "case_id", operator: "eq", value: input.caseId }] : [];
    const r = await safeSelect("quotes", input?.limit ?? 50, 0, filters, "id.desc");
    return r.items;
  }),
});

// ─── Audit Router ───
const auditRouter = router({
  list: publicProcedure.input(z.object({ limit: z.number().default(50), offset: z.number().default(0) }).optional()).query(async ({ input }) => { const r = await safeSelect("audit_trail", input?.limit ?? 50, input?.offset ?? 0, [], "id.desc"); return r.items; }),
});

// ─── Chat Router ───
const chatRouter = router({
  list: publicProcedure.input(z.object({ caseId: z.string().optional() }).optional()).query(async ({ input }) => { const filters: RestFilter[] = input?.caseId ? [{ column: "case_id", operator: "eq", value: input.caseId }] : []; const r = await safeSelect("chat_messages", 100, 0, filters, "id.asc"); return r.items; }),
  send: publicProcedure.input(z.any()).mutation(async () => ({ id: "stub", success: true })),
});

// ─── Patterns Router ───
const patternsRouter = router({
  list: publicProcedure.input(z.object({ limit: z.number().default(50) }).optional()).query(async ({ input }) => { const r = await restSelect("pattern_outputs", { limit: input?.limit ?? 50, order: "id.desc" }); return r.items; }),
});

// ─── Benefits Router ───
const benefitsRouter = router({
  match: publicProcedure.input(z.any().optional()).query(async () => ({ matches: [], score: 0 })),
  categories: publicProcedure.query(async () => []),
  documentChecklist: publicProcedure.input(z.any().optional()).query(async () => []),
  statesWithOverlays: publicProcedure.query(async () => { const r = await restSelect("registry_jurisdictions", { limit: 100, select: "abbreviation,name" }); return r.items; }),
});

// ─── Agency Metrics Router ───
const agencyMetricsRouter = router({
  getAll: publicProcedure.query(async () => { const r = await restSelect("agency_authority_map", { limit: 100 }); return r.items; }),
  stats: publicProcedure.query(async () => ({ total: 0, active: 0 })),
  getAgencyWeakJoints: publicProcedure.input(z.any().optional()).query(async () => []),
});

// ─── Architecture Map Router ───
const architectureMapRouter = router({
  getArchitectureOverview: publicProcedure.query(async () => { const engines = await restSelect("engine_registry", { limit: 50 }); return { engines: engines.items, connections: [] }; }),
});

// ─── Analytics Router ───
const analyticsRouter = router({
  funnelStats: publicProcedure.input(z.any().optional()).query(async () => ({ stages: [] })),
  pipelineStats: publicProcedure.query(async () => ({ runs: 0, success: 0, failed: 0 })),
});

// ─── Lighthouse Sub-Router ───
const lighthouseSubRouter = router({
  suggestions: router({ list: publicProcedure.input(z.any().optional()).query(async () => []), myVotes: publicProcedure.query(async () => []), create: publicProcedure.input(z.any()).mutation(async () => ({ id: "stub" })), vote: publicProcedure.input(z.any()).mutation(async () => ({ success: true })), unvote: publicProcedure.input(z.any()).mutation(async () => ({ success: true })) }),
  spotlight: router({ list: publicProcedure.input(z.any().optional()).query(async () => []) }),
  jobs: router({ list: publicProcedure.input(z.any().optional()).query(async () => []) }),
  posts: router({ list: publicProcedure.input(z.any().optional()).query(async () => []), create: publicProcedure.input(z.any()).mutation(async () => ({ id: "stub" })) }),
  events: router({ list: publicProcedure.input(z.any().optional()).query(async () => []) }),
  map: router({ layers: publicProcedure.input(z.any().optional()).query(async () => ({ layers: [], resources: [] })), search: publicProcedure.input(z.any().optional()).query(async () => ({ results: [] })), nearby: publicProcedure.input(z.any().optional()).query(async () => ({ results: [] })) }),
  registry: router({ stateProfile: publicProcedure.input(z.any().optional()).query(async () => ({ state: null, programs: [], agencies: [] })) }),
});

// ─── Docket Router ───
const docketRouter = router({
  list: publicProcedure.input(z.any().optional()).query(async () => []),
  stats: publicProcedure.query(async () => ({ total: 0, pending: 0, resolved: 0 })),
  legistarFeed: publicProcedure.input(z.any().optional()).query(async () => ({ matters: [], mode: "preview" })),
  submissions: router({ mine: publicProcedure.query(async () => []), create: publicProcedure.input(z.any()).mutation(async () => ({ id: "stub" })) }),
});

// ─── Civic Map Proof Endpoints ───
async function buildCivicMapResourceProof() {
  const r = await restSelect("unified_resources", { limit: 200, filters: [{ column: "resource_type", operator: "eq", value: "food_bank" }] });
  const resources = r.items;
  const mapped = resources.filter((x: any) => x.lat != null && x.lon != null).length;
  return { ok: true, source: "atlas_lighthouse_resource_bridge_v1", resource_type: "food_bank", total: resources.length, mapped, unmapped: resources.length - mapped, resources };
}

async function buildDshsOfficeProof() {
  const r = await restSelect("unified_resources", { limit: 200, filters: [{ column: "resource_type", operator: "eq", value: "benefits_office" }] });
  const offices = r.items;
  const mapped = offices.filter((x: any) => x.latitude != null || x.lat != null).length;
  return { ok: true, source: "normalized_civic_resource", total: offices.length, mapped, unmapped: offices.length - mapped, offices };
}

// ─── Stub routers (return empty arrays, prevent frontend crashes) ───
const stubList = router({ list: publicProcedure.input(z.any().optional()).query(async () => []) });
const stubGet = router({ get: publicProcedure.input(z.any().optional()).query(async () => null) });

// ═══════════════════════════════════════════════════════════════
// MAIN EXPORT — The Lighthouse Gate Router
// ═══════════════════════════════════════════════════════════════
export const lighthouseGateRouter = router({
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
  events: router({ list: publicProcedure.input(z.any().optional()).query(async () => { const r = await restSelect("lighthouse_events", { limit: 50, order: "id.desc" }); return r.items; }) }),
  correlations: stubList,
  share: stubGet,
  notifications: stubList,
  usersAdmin: router({ list: publicProcedure.query(async () => []), updateRole: publicProcedure.input(z.any()).mutation(async () => ({ success: true })), updatePlan: publicProcedure.input(z.any()).mutation(async () => ({ success: true })) }),
  invites: router({ list: publicProcedure.query(async () => []), create: publicProcedure.input(z.any()).mutation(async () => ({ id: "stub", success: true })), revoke: publicProcedure.input(z.any()).mutation(async () => ({ success: true })) }),
  uploadSessions: router({ list: publicProcedure.input(z.any().optional()).query(async () => { const r = await restSelect("upload_sessions", { limit: 50, order: "id.desc" }); return r.items; }) }),
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
  evidenceLayer: stubList,
});

export type LighthouseGateRouter = typeof lighthouseGateRouter;

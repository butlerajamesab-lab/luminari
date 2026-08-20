/**
 * ============================================================
 * LUMINARI — SYSTEM VISIBILITY LAYER
 *
 * Deterministic, read-only administrator diagnostic layer.
 * Allows authenticated administrators and runtime diagnostics to inspect
 * Lighthouse architecture without touching production logic or mutating data.
 *
 * MOUNT:
 *   server/_core/index.ts:
 *     import { systemVisibilityRouter } from "../routes/system-visibility-router";
 *     app.use("/api/system", requireExpressAdmin, systemVisibilityRouter);
 *
 * RULES:
 *   - GET only. No POST, no mutations, no writes.
 *   - Administrator auth required at the Express mount.
 *   - Structural metadata only — no PII, no raw records.
 *   - Every DB query is wrapped. Failures surface explicitly.
 *   - No secrets exposed. No service_role keys, no JWT secrets.
 *
 * DESIGN PRINCIPLE:
 *   Expose: what exists, what connects, what hydrates, what renders, what drifts, what fails.
 *   Never allow: mutation, execution, writes, runtime contamination.
 *
 * ============================================================
 */
import express, { Request, Response } from "express";
import { getPool } from "../db";

const router = express.Router();

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function cacheStatic(res: Response) {
  res.setHeader("Cache-Control", "public, max-age=120, must-revalidate");
}

function cacheLive(res: Response) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
}

async function safeQuery(sql: string): Promise<any[]> {
  try {
    const { rows } = await getPool().query(sql);
    return rows;
  } catch (e: any) {
    return [{ error: String(e?.message ?? e).slice(0, 300) }];
  }
}

// ─────────────────────────────────────────────
// PHASE 1: HEALTH
// GET /api/system/health
// ─────────────────────────────────────────────
router.get("/health", async (_req: Request, res: Response) => {
  cacheLive(res);

  let db_connected = false;
  let db_version = "";
  let table_count = 0;

  let db_error = "";
  try {
    const pool = getPool();
    const versionResult = await pool.query("SELECT version()");
    db_version = versionResult.rows[0]?.version?.split(" ").slice(0, 2).join(" ") ?? "unknown";
    db_connected = true;

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    table_count = Number(countResult.rows[0]?.cnt ?? 0);
  } catch (err: any) {
    db_error = err?.message?.replace(/password=[^\s&]+/g, 'password=***') ?? "unknown error";
  }

  res.json({
    status: db_connected ? "healthy" : "degraded",
    database: db_connected ? "connected" : "unreachable",
    ...(db_error ? { db_diagnostic: db_error } : {}),
    database_url: process.env.DATABASE_URL ? "configured" : "missing",
    database_version: db_version,
    supabase: "wepxlinwbjrkqdzkqpar",
    public_tables: table_count,
    runtime: "active",
    build_version: process.env.RENDER_GIT_COMMIT?.slice(0, 8) ?? "dev",
    timestamp: now(),
  });
});

// ─────────────────────────────────────────────
// PHASE 1: ROUTES
// GET /api/system/routes
// ─────────────────────────────────────────────
router.get("/routes", async (_req: Request, res: Response) => {
  cacheStatic(res);

  // Frontend routes (from App.tsx — canonical list)
  const frontend_routes = [
    { path: "/", component_slug: "home", layer: "L0" },
    { path: "/welcome", component_slug: "welcome", layer: "L0" },
    { path: "/login", component_slug: "login", layer: "L0" },
    { path: "/intake", component_slug: "intake", layer: "L0" },
    { path: "/luminari-intake", component_slug: "guided_intake_new", layer: "L0" },
    { path: "/guided-intake", component_slug: "guided_intake_new", layer: "L0" },
    { path: "/case/:id", component_slug: "case", layer: "L1" },
    { path: "/cases", component_slug: "cases", layer: "L1" },
    { path: "/documents", component_slug: "documents", layer: "L1" },
    { path: "/document/:id", component_slug: "document_detail", layer: "L1" },
    { path: "/entities", component_slug: "entities", layer: "L1" },
    { path: "/entity/:id", component_slug: "entity_detail", layer: "L1" },
    { path: "/findings", component_slug: "findings", layer: "L1" },
    { path: "/timeline", component_slug: "timeline", layer: "L1" },
    { path: "/narrative", component_slug: "statement_of_facts", layer: "L1" },
    { path: "/patterns", component_slug: "patterns", layer: "L1" },
    { path: "/mission-control", component_slug: "mission_control", layer: "L2" },
    { path: "/lighthouse", component_slug: "lighthouse", layer: "L2" },
    { path: "/civic-map", component_slug: "civic_map", layer: "L2" },
    { path: "/legal-library", component_slug: "legal_library", layer: "L2" },
    { path: "/signal-registry", component_slug: "signal_registry", layer: "L2" },
    { path: "/enforcement-intel", component_slug: "enforcement_intel", layer: "L2" },
    { path: "/enforcement-pathway", component_slug: "enforcement_pathway", layer: "L2" },
    { path: "/agency-metrics", component_slug: "agency_metrics", layer: "L2" },
    { path: "/civil-gideon", component_slug: "civil_gideon", layer: "L2" },
    { path: "/benefits", component_slug: "benefits_navigator", layer: "L2" },
    { path: "/my-applications", component_slug: "my_applications", layer: "L2" },
    { path: "/discover", component_slug: "discover_benefits", layer: "L2" },
    { path: "/categories", component_slug: "category_explorer", layer: "L2" },
    { path: "/category/:categoryId", component_slug: "category_landing", layer: "L2" },
    { path: "/doctrine-graph", component_slug: "doctrine_graph", layer: "L2" },
    { path: "/barriers", component_slug: "litigation_barriers", layer: "L2" },
    { path: "/contradiction-scoring", component_slug: "contradiction_scoring", layer: "L2" },
    { path: "/deadline-calculator", component_slug: "deadline_calculator", layer: "L2" },
    { path: "/investigation-workflow", component_slug: "investigation_workflow", layer: "L2" },
    { path: "/investigation-guidance", component_slug: "investigation_guidance", layer: "L2" },
    { path: "/proof-frameworks", component_slug: "proof_frameworks", layer: "L2" },
    { path: "/claim-elements", component_slug: "claim_elements", layer: "L2" },
    { path: "/filing-generator", component_slug: "filing_generator", layer: "L2" },
    { path: "/docket", component_slug: "docket_room", layer: "L2" },
    { path: "/docket/:slug", component_slug: "docket_room", layer: "L2" },
    { path: "/lumensend", component_slug: "lumen_send", layer: "L2" },
    { path: "/viewfinder", component_slug: "anomaly_viewfinder", layer: "L2" },
    { path: "/mental-health", component_slug: "mental_health", layer: "L2" },
    { path: "/command-board", component_slug: "command_board", layer: "L2" },
    { path: "/resolve", component_slug: "case_resolution_lens", layer: "L2" },
    { path: "/diagnostics", component_slug: "structural_diagnostics_lens", layer: "L2" },
    { path: "/mudroom", component_slug: "mudroom", layer: "L2" },
    { path: "/workshop", component_slug: "workshop_floor", layer: "L2" },
    { path: "/workbench/:caseId", component_slug: "workbench_dashboard", layer: "L2" },
    { path: "/workbench", component_slug: "workbench_dashboard", layer: "L2" },
    { path: "/evidence-lab", component_slug: "evidence_lab", layer: "L2" },
    { path: "/guide/:caseId", component_slug: "guided_dashboard", layer: "L1" },
    { path: "/shared/:token", component_slug: "shared_case_view", layer: "L1" },
    { path: "/presentations", component_slug: "presentations", layer: "L1" },
    { path: "/presentations/:id", component_slug: "presentation_editor", layer: "L1" },
    { path: "/architecture-map", component_slug: "architecture_map", layer: "L3" },
    { path: "/architecture", component_slug: "architecture_map", layer: "L3" },
    { path: "/sovereign-control", component_slug: "sovereign_control", layer: "L3" },
    { path: "/admin/feedback", component_slug: "admin_feedback", layer: "L3" },
    { path: "/admin/analytics", component_slug: "admin_analytics", layer: "L3" },
    { path: "/admin/users", component_slug: "admin_users", layer: "L3" },
    { path: "/admin/test-scenarios", component_slug: "admin_test_scenarios", layer: "L3" },
    { path: "/admin/resource-verification", component_slug: "resource_verification", layer: "L3" },
    { path: "/admin/knowledge-population", component_slug: "knowledge_population", layer: "L3" },
    { path: "/invite/:token", component_slug: "invite_landing", layer: "L0" },
    { path: "/templates", component_slug: "case_templates", layer: "L1" },
    { path: "/import-bundle", component_slug: "import_bundle", layer: "L1" },
    { path: "/upload", component_slug: "upload", layer: "L0" },
    { path: "/provenance", component_slug: "provenance", layer: "L3" },
    { path: "/provenance/:id", component_slug: "provenance_history", layer: "L3" },
    { path: "/exports", component_slug: "exports", layer: "L3" },
    { path: "/network-graph", component_slug: "network_graph", layer: "L2" },
    { path: "/action-path", component_slug: "action_path", layer: "L2" },
    { path: "/activation-control", component_slug: "activation_control", layer: "L3" },
    { path: "/control-room", component_slug: "control_room", layer: "L3" },
    { path: "/shop-office", component_slug: "shop_office", layer: "L2" },
    { path: "/business-analytics", component_slug: "business_analytics", layer: "L3" },
    { path: "/resource-directory", component_slug: "resource_directory", layer: "L2" },
    { path: "/foia-tracking", component_slug: "foia_tracking", layer: "L2" },
  ];

  // Backend API mounts
  const backend_mounts = [
    { method: "USE", path: "/api/trpc", source: "appRouter (tRPC)" },
    { method: "USE", path: "/api/system", source: "systemVisibilityRouter" },
    { method: "GET", path: "/api/health", source: "inline health check" },
    { method: "POST", path: "/api/stripe/webhook", source: "stripe-webhook" },
    { method: "POST", path: "/api/upload", source: "upload-route" },
    { method: "POST", path: "/api/docket-upload", source: "docket-upload-route" },
    { method: "GET", path: "/api/export/*", source: "export-route" },
    { method: "GET", path: "/api/cda-export/*", source: "cda-export-route" },
    { method: "POST", path: "/api/bundle-sync", source: "bundle-sync" },
    { method: "GET", path: "/api/bundle-download/*", source: "bundle-download-route" },
    { method: "USE", path: "/api/executor/*", source: "executor-routes" },
    { method: "USE", path: "/api/ui-editor/*", source: "ui-editor/routes" },
    { method: "USE", path: "/api/healer/*", source: "healer-routes" },
  ];

  res.json({
    timestamp: now(),
    frontend: { total: frontend_routes.length, routes: frontend_routes },
    backend: { total: backend_mounts.length, mounts: backend_mounts },
  });
});

// ─────────────────────────────────────────────
// PHASE 1: SCHEMA
// GET /api/system/schema
// ─────────────────────────────────────────────
router.get("/schema", async (_req: Request, res: Response) => {
  cacheLive(res);

  const tables = await safeQuery(`
    SELECT table_name, 
           (SELECT COUNT(*)::int FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = t.table_name) AS column_count
    FROM information_schema.tables t
    WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  const views = await safeQuery(`
    SELECT table_name AS view_name
    FROM information_schema.views
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);

  const foreign_keys = await safeQuery(`
    SELECT
      tc.table_name AS source_table,
      kcu.column_name AS source_column,
      ccu.table_name AS target_table,
      ccu.column_name AS target_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    ORDER BY tc.table_name
  `);

  res.json({
    timestamp: now(),
    tables: { total: Array.isArray(tables) ? tables.length : 0, items: tables },
    views: { total: Array.isArray(views) ? views.length : 0, items: views },
    foreign_keys: { total: Array.isArray(foreign_keys) ? foreign_keys.length : 0, items: foreign_keys },
  });
});

// ─────────────────────────────────────────────
// PHASE 1: SCHEMA DETAIL (single table)
// GET /api/system/schema/:table_name_param
// ─────────────────────────────────────────────
router.get("/schema/:table_name_param", async (req: Request, res: Response) => {
  cacheLive(res);
  const table_name_param = req.params.table_name_param.replace(/[^a-z0-9_]/gi, "");

  const columns = await safeQuery(`
    SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = '${table_name_param}'
    ORDER BY ordinal_position
  `);

  const row_count = await safeQuery(`SELECT COUNT(*)::int AS count FROM "${table_name_param}"`);

  res.json({
    timestamp: now(),
    table: table_name_param,
    columns,
    row_count: row_count[0]?.count ?? row_count[0]?.error ?? "unknown",
  });
});

// ─────────────────────────────────────────────
// PHASE 2: TABLE CONTRACTS
// GET /api/system/table-contracts
// ─────────────────────────────────────────────
router.get("/table-contracts", async (_req: Request, res: Response) => {
  cacheLive(res);

  // Detect tables with blob/polymorphic patterns — the instability vectors
  const blobDetection = await safeQuery(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        column_name IN ('contact', 'contacts', 'domains', 'metadata', 'related_entities', 'committee_memberships')
        OR column_name LIKE '%_rp'
        OR (data_type = 'jsonb' AND column_name NOT IN ('raw_payload', 'metadata', 'config', 'settings'))
        OR (data_type = 'json')
      )
    ORDER BY table_name, column_name
  `);

  // Canonical contact pattern detection
  const canonicalContactTables = await safeQuery(`
    SELECT table_name,
      bool_or(column_name = 'phone') AS has_phone,
      bool_or(column_name = 'email') AS has_email,
      bool_or(column_name = 'website') AS has_website,
      bool_or(column_name = 'address') AS has_address,
      bool_or(column_name = 'contact') AS has_contact_blob,
      bool_or(column_name = 'contacts') AS has_contacts_blob,
      bool_or(column_name LIKE 'contact_%') AS has_contact_kv
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (column_name IN ('phone', 'email', 'website', 'address', 'contact', 'contacts')
           OR column_name LIKE 'contact_%')
    GROUP BY table_name
    ORDER BY table_name
  `);

  const violations: Array<{ table: string; issue: string; severity: string }> = [];

  if (Array.isArray(canonicalContactTables)) {
    for (const t of canonicalContactTables) {
      if (t.has_contact_blob) violations.push({ table: t.table_name, issue: "contact blob detected — should be phone/email/website/address", severity: "high" });
      if (t.has_contacts_blob) violations.push({ table: t.table_name, issue: "contacts blob detected — polymorphic storage", severity: "high" });
      if (t.has_contact_kv) violations.push({ table: t.table_name, issue: "contact_type/contact_value KV pattern detected", severity: "medium" });
    }
  }

  if (Array.isArray(blobDetection)) {
    for (const col of blobDetection) {
      if (col.column_name?.endsWith("_rp")) {
        violations.push({ table: col.table_name, issue: `_rp suffix column: ${col.column_name}`, severity: "high" });
      }
      if (col.data_type === "json") {
        violations.push({ table: col.table_name, issue: `json column (not jsonb): ${col.column_name}`, severity: "medium" });
      }
    }
  }

  res.json({
    timestamp: now(),
    canonical_pattern: { good: ["phone", "email", "website", "address"], bad: ["contact", "contacts", "domains", "metadata", "related_entities", "_rp"] },
    contact_tables: canonicalContactTables,
    blob_columns: blobDetection,
    violations: { total: violations.length, items: violations },
  });
});

// ─────────────────────────────────────────────
// PHASE 2: VIEW CONTRACTS
// GET /api/system/view-contracts
// ─────────────────────────────────────────────
router.get("/view-contracts", async (_req: Request, res: Response) => {
  cacheLive(res);

  const view_definitions = await safeQuery(`
    SELECT table_name AS view_name, view_definition
    FROM information_schema.views
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);

  // Extract source tables from view definitions
  const view_contracts = Array.isArray(view_definitions) ? view_definitions.map((v: any) => {
    const def = v.view_definition ?? "";
    // Extract table references from FROM and JOIN clauses
    const table_refs = [...def.matchAll(/(?:FROM|JOIN)\s+"?(\w+)"?/gi)].map((m: any) => m[1]).filter((t: string) => t !== "public");
    return {
      view: v.view_name,
      source_tables: [...new Set(table_refs)],
      definition_length: def.length,
      has_joins: /JOIN/i.test(def),
      has_union: /UNION/i.test(def),
    };
  }) : [];

  res.json({
    timestamp: now(),
    views: { total: view_contracts.length, items: view_contracts },
    raw_definitions: view_definitions,
  });
});

// ─────────────────────────────────────────────
// PHASE 2: UI BINDINGS
// GET /api/system/ui-bindings
// ─────────────────────────────────────────────
router.get("/ui-bindings", async (_req: Request, res: Response) => {
  cacheStatic(res);

  // Canonical mapping: page → tRPC queries → backing tables
  const bindings = [
    { page: "/mission-control", component_slug: "mission_control", queries: ["canonicalCore.health", "canonicalCore.knowledgeBackbone", "canonicalCore.populationStats", "canonicalCore.legalLibrary", "canonicalCore.enforcementAgencies", "system.stats"], tables: ["knowledge_entries", "registry_programs", "legal_enforcement_records", "detected_signals", "forms_registry", "resources"] },
    { page: "/lighthouse", component_slug: "lighthouse", queries: ["lighthouse.gateReview", "lighthouse.liveIntakeOps", "lighthouse.patternRegistry", "lighthouse.pipelineHealth", "lighthouse.signalLineage", "lighthouse.strategyProjection", "lighthouse.trendPressure"], tables: ["raw_live_signals", "ingested_records", "detected_signals", "pipeline_runs", "activation_outputs", "strategy_outputs"] },
    { page: "/civic-map", component_slug: "civic_map", queries: ["/api/civic-map/coverage", "/api/civic-map/bounds", "/api/civic-map/detail/:resource_entity_id"], tables: ["v_lighthouse_resource_program_catalog_v2", "v_luminari_resource_locations_current_v3_13"] },
    { page: "/resources", component_slug: "resource_directory", queries: ["resourceDirectory.summary", "resourceDirectory.search", "resourceDirectory.detail"], tables: ["v_lighthouse_resource_program_catalog_v2", "luminari_civic_object_reconciliation_v1", "luminari_corpus_candidate_v1"] },
    { page: "/legal-library", component_slug: "legal_library", queries: ["canonicalCore.legalLibrary"], tables: ["legal_enforcement_records", "claim_validation_rules_v2", "remedy_feasibility_rules_v2"] },
    { page: "/doctrine-graph", component_slug: "doctrine_graph", queries: ["enforcementIntel.getDoctrineGraph"], tables: ["doctrine_registry", "doctrine_graph_edges"] },
    { page: "/signal-registry", component_slug: "signal_registry", queries: ["signalExtraction.list", "signalExtraction.stats"], tables: ["detected_signals", "signal_flags", "signal_registry"] },
    { page: "/enforcement-intel", component_slug: "enforcement_intel", queries: ["canonicalCore.enforcementAgencies"], tables: ["legal_enforcement_records"] },
    { page: "/benefits", component_slug: "benefits_navigator", queries: ["benefits.list", "benefits.eligibility"], tables: ["government_benefits", "benefit_applications"] },
    { page: "/cases", component_slug: "cases", queries: ["cases.list"], tables: ["cases", "documents"] },
    { page: "/case/:id", component_slug: "case", queries: ["cases.get", "documents.byCase", "entities.byCase", "claims.byCase", "findings.byCase"], tables: ["cases", "documents", "entities", "claims", "findings", "events"] },
    { page: "/documents", component_slug: "documents", queries: ["documents.list"], tables: ["documents"] },
    { page: "/entities", component_slug: "entities", queries: ["entities.list"], tables: ["entities", "entity_roles", "relationships"] },
    { page: "/docket", component_slug: "docket_room", queries: ["docket.list", "docket.get"], tables: ["docket_entries", "docket_documents"] },
    { page: "/foia-tracking", component_slug: "foia_tracking", queries: ["foia.list"], tables: ["foia_requests", "foia_agencies", "foia_statutes"] },
    { page: "/sovereign-control", component_slug: "sovereign_control", queries: ["admin.*", "system.*"], tables: ["(all — admin introspection)"] },
    { page: "/command-board", component_slug: "command_board", queries: ["conduit.*"], tables: ["conduit_messages", "conduit_channels"] },
    { page: "/patterns", component_slug: "patterns", queries: ["patterns.list"], tables: ["patterns", "pattern_occurrences", "pattern_types"] },
    { page: "/network-graph", component_slug: "network_graph", queries: ["entities.graph"], tables: ["entities", "relationships", "relationship_evidence"] },
    { page: "/provenance", component_slug: "provenance", queries: ["provenance.list"], tables: ["provenance_audit_logs"] },
  ];

  res.json({
    timestamp: now(),
    bindings: { total: bindings.length, items: bindings },
    note: "Each binding declares the expected tRPC queries and backing tables for a frontend page. If a table is empty or missing, the page renders zero data.",
  });
});

// ─────────────────────────────────────────────
// PHASE 2: RUNTIME MAP
// GET /api/system/runtime-map
// ─────────────────────────────────────────────
router.get("/runtime-map", async (_req: Request, res: Response) => {
  cacheLive(res);

  // Check which key tables actually have data
  const key_tables = [
    "cases", "documents", "entities", "claims", "findings", "events",
    "knowledge_entries", "registry_programs", "legal_enforcement_records",
    "detected_signals", "raw_live_signals", "ingested_records",
    "normalized_civic_resource", "unified_resources",
    "claim_validation_rules_v2", "remedy_feasibility_rules_v2",
    "coalition_advocacy_orgs", "advocacy_coalition_network",
    "legislator_registry", "government_benefits", "benefit_applications",
    "pipeline_runs", "activation_outputs", "signal_flags",
    "pattern_types", "patterns", "pattern_occurrences",
    "foia_requests", "foia_agencies", "foia_statutes",
    "provenance_audit_logs", "corpus_snapshots",
    "forms_registry", "resources",
  ];

  const count_queries = key_tables.map(t => `SELECT '${t}' AS table_name, COUNT(*)::int AS row_count FROM "${t}"`);
  const union_query = count_queries.join(" UNION ALL ");
  const table_counts = await safeQuery(union_query);

  // Hydration chain: how data flows from ingestion → storage → views → frontend
  const hydration_chain = {
    ingestion: {
      sources: ["CFPB", "EEOC", "DOL", "HUD", "state labor boards", "manual upload"],
      landing_tables: ["raw_live_signals", "ingested_records"],
      processing_pipeline: ["signal extraction → detected_signals", "pattern detection → patterns", "entity extraction → entities"],
    },
    storage: {
      canonical_tables: ["cases", "documents", "entities", "claims", "findings", "events"],
      registry_tables: ["knowledge_entries", "registry_programs", "legal_enforcement_records", "normalized_civic_resource"],
      engine_outputs: ["activation_outputs", "signal_flags", "pattern_occurrences", "strategy_outputs", "procedural_outputs"],
    },
    projection: {
      views: ["v_luminari_resource_contact_points_current_v3_13", "v_luminari_resource_locations_current_v3_13"],
      tRPC: "appRouter → resourceDirectory router → canonical resource tables",
      static_pages: ["civicmap.html (same-origin Resource Directory API)"],
    },
    frontend: {
      framework: "React 19 + Wouter routing",
      state_management: "TanStack Query (tRPC hooks)",
      total_pages: 91,
    },
  };

  res.json({
    timestamp: now(),
    table_counts: Array.isArray(table_counts) ? table_counts : [],
    hydration_chain,
    known_issues: [
      "restSelect() in lighthouse-gate-router.ts uses camelCase column names but DB is snake_case — causes 400 errors",
      "Resource Directory exact-site pins remain unavailable until reviewed public addresses receive genuine coordinates",
    ],
  });
});

// ─────────────────────────────────────────────
// PHASE 3: DRIFT DETECTION
// GET /api/system/drift
// ─────────────────────────────────────────────
router.get("/drift", async (_req: Request, res: Response) => {
  cacheLive(res);

  const drift_checks: Array<{ category: string; issue: string; severity: string; table?: string; column?: string }> = [];

  // 1. Detect suffix doctrine contamination (_rp columns)
  const rp_columns = await safeQuery(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name LIKE '%_rp'
    ORDER BY table_name
  `);
  if (Array.isArray(rp_columns)) {
    for (const col of rp_columns) {
      drift_checks.push({ category: "suffix_contamination", issue: `_rp suffix: ${col.table_name}.${col.column_name}`, severity: "high", table: col.table_name, column: col.column_name });
    }
  }

  // 2. Detect polymorphic contact storage
  const contact_blobs = await safeQuery(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name IN ('contact', 'contacts', 'contact_info', 'contact_details')
    ORDER BY table_name
  `);
  if (Array.isArray(contact_blobs)) {
    for (const col of contact_blobs) {
      drift_checks.push({ category: "polymorphic_contact", issue: `blob contact field: ${col.table_name}.${col.column_name} (${col.data_type})`, severity: "high", table: col.table_name, column: col.column_name });
    }
  }

  // 3. Detect serialized array/JSON fields that should be normalized
  const json_fields = await safeQuery(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type IN ('json', 'jsonb')
      AND column_name NOT IN ('raw_payload', 'config', 'settings', 'metadata', 'extra')
    ORDER BY table_name
  `);
  if (Array.isArray(json_fields)) {
    for (const col of json_fields) {
      drift_checks.push({ category: "serialized_field", issue: `JSON field: ${col.table_name}.${col.column_name}`, severity: "low", table: col.table_name, column: col.column_name });
    }
  }

  // 4. Detect tables with RLS disabled (security drift)
  const rls_status = await safeQuery(`
    SELECT relname AS table_name, relrowsecurity AS rls_enabled
    FROM pg_class
    WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      AND relkind = 'r'
    ORDER BY relname
  `);
  const rls_off = Array.isArray(rls_status) ? rls_status.filter((r: any) => r.rls_enabled === false) : [];
  const rls_on = Array.isArray(rls_status) ? rls_status.filter((r: any) => r.rls_enabled === true) : [];

  // 5. Detect naming convention drift (camelCase columns)
  const camel_case_columns = await safeQuery(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name ~ '[a-z][A-Z]'
    ORDER BY table_name, column_name
  `);

  // 6. Detect empty tables (wired but no data)
  const empty_tables = await safeQuery(`
    SELECT schemaname, relname AS table_name, n_live_tup AS row_estimate
    FROM pg_stat_user_tables
    WHERE schemaname = 'public' AND n_live_tup = 0
    ORDER BY relname
  `);

  res.json({
    timestamp: now(),
    summary: {
      total_drift_issues: drift_checks.length,
      suffix_contamination: drift_checks.filter(d => d.category === "suffix_contamination").length,
      polymorphic_contact: drift_checks.filter(d => d.category === "polymorphic_contact").length,
      serialized_fields: drift_checks.filter(d => d.category === "serialized_field").length,
      camel_case_columns: Array.isArray(camel_case_columns) ? camel_case_columns.length : 0,
      rls_disabled: rls_off.length,
      rls_enabled: rls_on.length,
      empty_tables: Array.isArray(empty_tables) ? empty_tables.length : 0,
    },
    drift: drift_checks,
    camel_case_columns: Array.isArray(camel_case_columns) ? camel_case_columns : [],
    rls_security: { enabled: rls_on.length, disabled: rls_off.length, disabled_tables: rls_off.map((r: any) => r.table_name) },
    empty_tables: Array.isArray(empty_tables) ? empty_tables.map((t: any) => t.table_name) : [],
  });
});

// ─────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────
export const systemVisibilityRouter = router;
export default router;

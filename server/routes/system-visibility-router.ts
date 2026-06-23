/**
 * ============================================================
 * LUMINARI — BUILDER VISIBILITY LAYER
 *
 * Deterministic, read-only introspection layer.
 * Allows GPTs, backend assistants, developers, auditors, and
 * runtime diagnostics to safely inspect Lighthouse architecture
 * without touching production logic or mutating data.
 *
 * MOUNT:
 *   server/_core/index.ts:
 *     import { systemVisibilityRouter } from "../routes/system-visibility-router";
 *     app.use("/api/system", systemVisibilityRouter);
 *
 * RULES:
 *   - GET only. No POST, no mutations, no writes.
 *   - No auth required. Structural metadata only — no PII, no raw records.
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
// PHASE 1: ROUTES
// GET /api/system/routes
// ─────────────────────────────────────────────
router.get("/routes", async (_req: Request, res: Response) => {
  cacheStatic(res);

  // Frontend routes (from App.tsx — canonical list)
  const frontend_routes = [
    { path: "/", component: "Home", layer: "L0" },
    { path: "/welcome", component: "Welcome", layer: "L0" },
    { path: "/login", component: "Login", layer: "L0" },
    { path: "/intake", component: "Intake", layer: "L0" },
    { path: "/luminari-intake", component: "GuidedIntakeNew", layer: "L0" },
    { path: "/guided-intake", component: "GuidedIntakeNew", layer: "L0" },
    { path: "/case/:id", component: "Case", layer: "L1" },
    { path: "/cases", component: "Cases", layer: "L1" },
    { path: "/documents", component: "Documents", layer: "L1" },
    { path: "/document/:id", component: "DocumentDetail", layer: "L1" },
    { path: "/entities", component: "Entities", layer: "L1" },
    { path: "/entity/:id", component: "EntityDetail", layer: "L1" },
    { path: "/findings", component: "Findings", layer: "L1" },
    { path: "/timeline", component: "Timeline", layer: "L1" },
    { path: "/narrative", component: "StatementOfFacts", layer: "L1" },
    { path: "/patterns", component: "Patterns", layer: "L1" },
    { path: "/mission-control", component: "MissionControl", layer: "L2" },
    { path: "/lighthouse", component: "Lighthouse", layer: "L2" },
    { path: "/civic-map", component: "CivicMap", layer: "L2" },
    { path: "/legal-library", component: "LegalLibrary", layer: "L2" },
    { path: "/signal-registry", component: "SignalRegistry", layer: "L2" },
    { path: "/enforcement-intel", component: "EnforcementIntel", layer: "L2" },
    { path: "/enforcement-pathway", component: "EnforcementPathway", layer: "L2" },
    { path: "/agency-metrics", component: "AgencyMetrics", layer: "L2" },
    { path: "/civil-gideon", component: "CivilGideon", layer: "L2" },
    { path: "/benefits", component: "BenefitsNavigator", layer: "L2" },
    { path: "/my-applications", component: "MyApplications", layer: "L2" },
    { path: "/discover", component: "DiscoverBenefits", layer: "L2" },
    { path: "/categories", component: "CategoryExplorer", layer: "L2" },
    { path: "/category/:categoryId", component: "CategoryLanding", layer: "L2" },
    { path: "/doctrine-graph", component: "DoctrineGraph", layer: "L2" },
    { path: "/barriers", component: "LitigationBarriers", layer: "L2" },
    { path: "/contradiction-scoring", component: "ContradictionScoring", layer: "L2" },
    { path: "/deadline-calculator", component: "DeadlineCalculator", layer: "L2" },
    { path: "/investigation-workflow", component: "InvestigationWorkflow", layer: "L2" },
    { path: "/investigation-guidance", component: "InvestigationGuidance", layer: "L2" },
    { path: "/proof-frameworks", component: "ProofFrameworks", layer: "L2" },
    { path: "/claim-elements", component: "ClaimElements", layer: "L2" },
    { path: "/claim-denial-analysis", component: "ClaimDenialAnalysis", layer: "L2" },
    { path: "/filing-generator", component: "FilingGenerator", layer: "L2" },
    { path: "/docket", component: "docket_room_page", layer: "L2" },
    { path: "/docket/:slug", component: "docket_room_page", layer: "L2" },
    { path: "/lumensend", component: "LumenSend", layer: "L2" },
    { path: "/viewfinder", component: "AnomalyViewfinder", layer: "L2" },
    { path: "/mental-health", component: "MentalHealth", layer: "L2" },
    { path: "/command-board", component: "CommandBoard", layer: "L2" },
    { path: "/resolve", component: "CaseResolutionLens", layer: "L2" },
    { path: "/diagnostics", component: "StructuralDiagnosticsLens", layer: "L2" },
    { path: "/mudroom", component: "Mudroom", layer: "L2" },
    { path: "/workshop", component: "WorkshopFloor", layer: "L2" },
    { path: "/workbench/:caseId", component: "WorkbenchDashboard", layer: "L2" },
    { path: "/workbench", component: "WorkbenchDashboard", layer: "L2" },
    { path: "/evidence-lab", component: "EvidenceLab", layer: "L2" },
    { path: "/guide/:caseId", component: "GuidedDashboard", layer: "L1" },
    { path: "/shared/:token", component: "SharedCaseView", layer: "L1" },
    { path: "/presentations", component: "Presentations", layer: "L1" },
    { path: "/presentations/:id", component: "PresentationEditor", layer: "L1" },
    { path: "/extraction", component: "ExtractionDashboard", layer: "L3" },
    { path: "/architecture-map", component: "ArchitectureMap", layer: "L3" },
    { path: "/architecture", component: "ArchitectureMap", layer: "L3" },
    { path: "/sovereign-control", component: "SovereignControl", layer: "L3" },
    { path: "/admin/feedback", component: "AdminFeedback", layer: "L3" },
    { path: "/admin/analytics", component: "AdminAnalytics", layer: "L3" },
    { path: "/admin/users", component: "AdminUsers", layer: "L3" },
    { path: "/admin/test-scenarios", component: "AdminTestScenarios", layer: "L3" },
    { path: "/admin/resource-verification", component: "ResourceVerification", layer: "L3" },
    { path: "/admin/knowledge-population", component: "KnowledgePopulation", layer: "L3" },
    { path: "/invite/:token", component: "InviteLanding", layer: "L0" },
    { path: "/templates", component: "CaseTemplates", layer: "L1" },
    { path: "/import-bundle", component: "ImportBundle", layer: "L1" },
    { path: "/upload", component: "Upload", layer: "L0" },
    { path: "/spine-viewer", component: "SpineViewer", layer: "L3" },
    { path: "/provenance", component: "Provenance", layer: "L3" },
    { path: "/provenance/:id", component: "ProvenanceHistory", layer: "L3" },
    { path: "/exports", component: "Exports", layer: "L3" },
    { path: "/network-graph", component: "NetworkGraph", layer: "L2" },
    { path: "/action-path", component: "ActionPath", layer: "L2" },
    { path: "/activation-control", component: "ActivationControl", layer: "L3" },
    { path: "/control-room", component: "ControlRoom", layer: "L3" },
    { path: "/shop-office", component: "ShopOffice", layer: "L2" },
    { path: "/business-analytics", component: "BusinessAnalytics", layer: "L3" },
    { path: "/resource-directory", component: "ResourceDirectory", layer: "L2" },
    { path: "/foia-tracking", component: "FoiaTracking", layer: "L2" },
  ];

  // Backend API mounts
  const backend_mounts = [
    { method: "USE", path: "/api/trpc", source: "appRouter (tRPC)" },
    { method: "USE", path: "/api/ai", source: "aiInspectRouter" },
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
    { page: "/mission-control", component: "MissionControl", queries: ["canonicalCore.health", "canonicalCore.knowledgeBackbone", "canonicalCore.populationStats", "canonicalCore.legalLibrary", "canonicalCore.enforcementAgencies", "system.stats"], tables: ["knowledge_entries", "registry_programs", "legal_enforcement_records", "detected_signals", "forms_registry", "resources"] },
    { page: "/lighthouse", component: "Lighthouse", queries: ["lighthouse.gateReview", "lighthouse.liveIntakeOps", "lighthouse.patternRegistry", "lighthouse.pipelineHealth", "lighthouse.signalLineage", "lighthouse.strategyProjection", "lighthouse.trendPressure"], tables: ["raw_live_signals", "ingested_records", "detected_signals", "pipeline_runs", "activation_outputs", "strategy_outputs"] },
    { page: "/civic-map", component: "CivicMap", queries: ["(standalone HTML — direct Supabase REST)"], tables: ["normalized_civic_resource", "registry_programs", "legal_enforcement_records", "coalition_advocacy_orgs", "advocacy_coalition_network", "legislator_registry", "knowledge_entries"] },
    { page: "/legal-library", component: "LegalLibrary", queries: ["canonicalCore.legalLibrary"], tables: ["legal_enforcement_records", "claim_validation_rules_v2", "remedy_feasibility_rules_v2"] },
    { page: "/signal-registry", component: "SignalRegistry", queries: ["signalExtraction.list", "signalExtraction.stats"], tables: ["detected_signals", "signal_flags", "signal_registry"] },
    { page: "/enforcement-intel", component: "EnforcementIntel", queries: ["canonicalCore.enforcementAgencies"], tables: ["legal_enforcement_records"] },
    { page: "/benefits", component: "BenefitsNavigator", queries: ["benefits.list", "benefits.eligibility"], tables: ["government_benefits", "benefit_applications"] },
    { page: "/cases", component: "Cases", queries: ["cases.list"], tables: ["cases", "documents"] },
    { page: "/case/:id", component: "Case", queries: ["cases.get", "documents.byCase", "entities.byCase", "claims.byCase", "findings.byCase"], tables: ["cases", "documents", "entities", "claims", "findings", "events"] },
    { page: "/documents", component: "Documents", queries: ["documents.list"], tables: ["documents"] },
    { page: "/entities", component: "Entities", queries: ["entities.list"], tables: ["entities", "entity_roles", "relationships"] },
    { page: "/docket", component: "docket_room_page", queries: ["docket.list", "docket.get"], tables: ["docket_entries", "docket_documents"] },
    { page: "/foia-tracking", component: "FoiaTracking", queries: ["foia.list"], tables: ["foia_requests", "foia_agencies", "foia_statutes"] },
    { page: "/sovereign-control", component: "SovereignControl", queries: ["admin.*", "system.*"], tables: ["(all — admin introspection)"] },
    { page: "/command-board", component: "CommandBoard", queries: ["conduit.*"], tables: ["conduit_messages", "conduit_channels"] },
    { page: "/patterns", component: "Patterns", queries: ["patterns.list"], tables: ["patterns", "pattern_occurrences", "pattern_types"] },
    { page: "/network-graph", component: "NetworkGraph", queries: ["entities.graph"], tables: ["entities", "relationships", "relationship_evidence"] },
    { page: "/provenance", component: "Provenance", queries: ["provenance.list"], tables: ["provenance_audit_logs"] },
    { page: "/spine-viewer", component: "SpineViewer", queries: ["spine.export"], tables: ["corpus_snapshots"] },
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
      views: ["v_unified_civic_infrastructure (CivicMap aggregation)"],
      tRPC: "appRouter → lighthouse-gate-router.ts (restSelect queries)",
      static_pages: ["civicmap.html (standalone, hardcoded Supabase anon key)"],
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
      "civicmap.html has hardcoded anon key — does not read from env vars",
      "v_unified_civic_infrastructure view may not include all 12 source tables",
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

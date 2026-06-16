/**
 * ============================================================
 * LUMINARI — AI INSPECTION ROUTER (corrected, 2026-05-21)
 *
 * Read-only semantic inspection layer for browser-blind AI assistants.
 *
 * MOUNT (already done in your repo):
 *   server/_core/index.ts:
 *     import { aiInspectRouter } from "../routes/ai-inspect-router";
 *     app.use("/api/ai", aiInspectRouter);   // BEFORE the SPA catch-all
 *
 * RULES:
 *   - GET only. No POST, no mutations, no writes.
 *   - No auth required. Counts and route metadata only — no PII, no raw records.
 *   - Every DB query is wrapped. Failures surface explicitly as
 *       { error: "...", table: "<name>" }
 *     instead of silently degrading to null/0. Ornamental "everything healthy"
 *     responses are forbidden.
 *
 * QUERIES VERIFIED AGAINST LIVE DB:
 *   project: wepxlinwbjrkqdzkqpar (Lighthouse)
 *   verified: 2026-05-21
 *   341 base tables in public schema.
 * ============================================================
 */

import express, { Request, Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

type CountResult = { count: number } | { error: string; table: string };

function now(): string {
  return new Date().toISOString();
}

/**
 * Count rows in a table. Returns either { count } or { error, table } — NEVER null.
 * Errors are surfaced so the response can never lie about table existence.
 */
async function countTable(tableName: string): Promise<CountResult> {
  try {
    // Table names are hard-coded literals below — not user input — so sql.raw
    // is safe here. Keeping the SQL minimal: just a count, no filters.
    // COUNT(*) returns bigint. We deliberately do NOT cast to int (Postgres int
    // is 32-bit, overflows at ~2.1B rows). node-postgres serializes bigint as a
    // string by default; the parser below handles both number and string.
    const result: any = await db.execute(
      sql.raw(`SELECT COUNT(*) AS count FROM "${tableName}"`),
    );
    const rows = result?.rows ?? result;
    const raw = Array.isArray(rows) ? rows[0]?.count : undefined;
    const n =
      typeof raw === "number"
        ? raw
        : typeof raw === "string"
          ? parseInt(raw, 10)
          : NaN;
    if (Number.isFinite(n)) return { count: n };
    return { error: "no_count_in_result", table: tableName };
  } catch (e: any) {
    return {
      error: String(e?.message ?? e ?? "query_failed").slice(0, 240),
      table: tableName,
    };
  }
}

/**
 * Set cache headers. Static (route table, namespace map) can be cached briefly;
 * DB-backed endpoints are always no-store so they reflect current truth.
 */
function setCache(res: Response, kind: "static" | "live") {
  if (kind === "static") {
    res.setHeader("Cache-Control", "public, max-age=3600, must-revalidate");
  } else {
    res.setHeader("Cache-Control", "no-store");
  }
}

/**
 * DEPLOYMENT NOTE — RATE LIMITING:
 * This router is unauthenticated by design. The /api/ai/site-map, /page/*,
 * and /compare endpoints each issue 2–7 parallel COUNT queries against the
 * primary DB. A malicious caller hammering these in a loop could create
 * meaningful load. Recommended: apply express-rate-limit (or your platform's
 * equivalent) at /api/ai/* — e.g. 60 req/min per IP. Not enforced here
 * because adding the dep is out of scope for this file; add it at the
 * application level in server/_core/index.ts.
 */

// ─────────────────────────────────────────────
// STATIC PLATFORM METADATA
// ─────────────────────────────────────────────

/**
 * Full route table extracted from client/src/App.tsx (manifest 2026-05-20).
 * 90 routes. Pure static metadata — does not lie if DB is down.
 *
 * Note: Route paths do NOT cleanly map from PascalCase component names.
 * Examples that violate kebab-of-PascalCase guess:
 *   BenefitsNavigator   → /benefits      (not /benefits-navigator)
 *   DocketRoom          → /docket
 *   AnomalyViewfinder   → /viewfinder
 *   StatementOfFacts    → /narrative
 *   CaseResolutionLens  → /resolve
 *   WorkshopFloor       → /workshop
 *   FoiaTracking        → /foia
 */
export const ROUTE_TABLE: ReadonlyArray<{ path: string; component: string }> = [
  { path: "/", component: "HomeOrWelcome" },
  { path: "/control-room", component: "ControlRoom" },
  { path: "/cases/:id/control-room", component: "ControlRoom" },
  { path: "/cases", component: "Cases" },
  { path: "/documents", component: "Documents" },
  { path: "/documents/:id", component: "DocumentDetail" },
  { path: "/upload", component: "Upload" },
  { path: "/entities", component: "Entities" },
  { path: "/entities/dedup", component: "EntityDedup" },
  { path: "/entities/:id", component: "EntityDetail" },
  { path: "/findings", component: "Findings" },
  { path: "/timeline", component: "Timeline" },
  { path: "/network", component: "NetworkGraph" },
  { path: "/chat", component: "Chat" },
  { path: "/exports", component: "Exports" },
  { path: "/audit", component: "AuditTrail" },
  { path: "/repair", component: "CaseRepair" },
  { path: "/cda", component: "CdaRunList" },
  { path: "/cda/:id", component: "CdaRunDetail" },
  { path: "/provenance", component: "Provenance" },
  { path: "/provenance/history", component: "ProvenanceHistory" },
  { path: "/extraction-failures", component: "ExtractionFailures" },
  { path: "/integrity", component: "IntegrityDashboard" },
  { path: "/spine/:caseId/:snapshotId", component: "SpineViewer" },
  { path: "/action-path", component: "ActionPath" },
  { path: "/foia", component: "FoiaTracking" },
  { path: "/narrative", component: "StatementOfFacts" },
  { path: "/patterns", component: "Patterns" },
  { path: "/presentations", component: "Presentations" },
  { path: "/presentations/:id", component: "PresentationEditor" },
  { path: "/extraction", component: "ExtractionDashboard" },
  { path: "/welcome", component: "Welcome" },
  { path: "/intake", component: "Intake" },
  { path: "/case/:id", component: "Case" },
  { path: "/luminari-intake", component: "GuidedIntakeNew" },
  { path: "/guided-intake", component: "GuidedIntakeNew" },
  { path: "/benefits", component: "BenefitsNavigator" },
  { path: "/my-applications", component: "MyApplications" },
  { path: "/discover", component: "DiscoverBenefits" },
  { path: "/guide/:caseId", component: "GuidedDashboard" },
  { path: "/shared/:token", component: "SharedCaseView" },
  { path: "/admin/feedback", component: "AdminFeedback" },
  { path: "/admin/analytics", component: "AdminAnalytics" },
  { path: "/admin/users", component: "AdminUsers" },
  { path: "/admin/test-scenarios", component: "AdminTestScenarios" },
  { path: "/admin/resource-verification", component: "ResourceVerification" },
  { path: "/invite/:token", component: "InviteLanding" },
  { path: "/templates", component: "CaseTemplates" },
  { path: "/import-bundle", component: "ImportBundle" },
  { path: "/mission-control", component: "MissionControl" },
  { path: "/lighthouse", component: "Lighthouse" },
  { path: "/civic-map", component: "CivicMap" },
  { path: "/viewfinder", component: "AnomalyViewfinder" },
  { path: "/docket", component: "DocketRoom" },
  { path: "/docket/:slug", component: "DocketRoom" },
  { path: "/lumensend", component: "LumenSend" },
  { path: "/legal-library", component: "LegalLibrary" },
  { path: "/agency-metrics", component: "AgencyMetrics" },
  { path: "/civil-gideon", component: "CivilGideon" },
  { path: "/mental-health", component: "MentalHealth" },
  { path: "/categories", component: "CategoryExplorer" },
  { path: "/category/:categoryId", component: "CategoryLanding" },
  { path: "/doctrine-graph", component: "DoctrineGraph" },
  { path: "/barriers", component: "LitigationBarriers" },
  { path: "/signal-registry", component: "SignalRegistry" },
  { path: "/enforcement-intel", component: "EnforcementIntel" },
  { path: "/deadline-calculator", component: "DeadlineCalculator" },
  { path: "/contradiction-scoring", component: "ContradictionScoring" },
  { path: "/enforcement-pathway", component: "EnforcementPathway" },
  { path: "/investigation-workflow", component: "InvestigationWorkflow" },
  { path: "/architecture-map", component: "ArchitectureMap" },
  { path: "/architecture", component: "ArchitectureMap" },
  { path: "/filing-generator", component: "FilingGenerator" },
  { path: "/proof-frameworks", component: "ProofFrameworks" },
  { path: "/claim-elements", component: "ClaimElements" },
  { path: "/claim-denial-analysis", component: "ClaimDenialAnalysis" },
  { path: "/investigation-guidance", component: "InvestigationGuidance" },
  { path: "/command-board", component: "CommandBoard" },
  { path: "/admin/knowledge-population", component: "KnowledgePopulation" },
  { path: "/resolve", component: "CaseResolutionLens" },
  { path: "/diagnostics", component: "StructuralDiagnosticsLens" },
  { path: "/mudroom", component: "Mudroom" },
  { path: "/workshop", component: "WorkshopFloor" },
  { path: "/workbench/:caseId", component: "WorkbenchDashboard" },
  { path: "/workbench", component: "WorkbenchDashboard" },
  { path: "/evidence-lab", component: "EvidenceLab" },
  { path: "/shop-office", component: "ShopOffice" },
  { path: "/resources", component: "ResourceDirectory" },
  { path: "/sovereign-control", component: "SovereignControl" },
  { path: "/mission-control/governance", component: "GovernanceDashboard" },
  { path: "/verify", component: "Verify" },
  { path: "/business-analytics", component: "BusinessAnalytics" },
];

export const API_ROUTE_TABLE: ReadonlyArray<{
  method: string;
  path: string;
  source: string;
}> = [
  { method: "USE", path: "/api/trpc", source: "app_router_trpc" },
  { method: "GET", path: "/api/health", source: "inline_health_check" },
  { method: "USE", path: "/api/ai", source: "ai_inspect_router" },
  { method: "USE", path: "/api/system", source: "system_visibility_router" },
  { method: "USE", path: "/api/conveyor", source: "conveyor_router" },
  { method: "USE", path: "/api/civic-map", source: "civic_map_router" },
  { method: "USE", path: "/api/atlas", source: "atlas_proxy_router" },
  { method: "USE", path: "/api/ingestion-control", source: "ingestion_control_rest_router" },
  { method: "USE", path: "/api/docket", source: "docket_router" },
  { method: "USE", path: "/api/executor/*", source: "executor_routes" },
];

/**
 * Page → primary tRPC namespace (first one referenced in the page's calls).
 * Extracted from all_pages_calls.tsv, manifest 2026-05-21.
 * "-" means the page makes no tRPC calls (static / placeholder / dead).
 */
export const PAGE_TO_NAMESPACE: Readonly<Record<string, string>> = {
  ActionPath: "intake",
  ActivationControl: "-",
  AdminAnalytics: "analytics",
  AdminFeedback: "feedback",
  AdminTestScenarios: "testScenarios",
  AdminUsers: "useUtils",
  AgencyMetrics: "agencyMetrics",
  AnomalyViewfinder: "-",
  ArchitectureMap: "interventionNetwork",
  AuditTrail: "audit",
  BenefitsNavigator: "benefits",
  BusinessAnalytics: "business",
  Case: "cases",
  CaseRepair: "caseRepair",
  CaseResolutionLens: "remedyFeasibility",
  CaseTemplates: "caseTemplates",
  Cases: "cases",
  CategoryExplorer: "categories",
  CategoryLanding: "categories",
  CdaRunDetail: "cda",
  CdaRunList: "cda",
  Chat: "chat",
  CivicMap: "civilGideon",
  CivilGideon: "civilGideon",
  ClaimDenialAnalysis: "claimValidation",
  ClaimElements: "legalLibrary",
  CommandBoard: "operationalWorkflow",
  ContradictionScoring: "evidenceConfidence",
  ControlRoom: "lighthouse",
  DeadlineCalculator: "legalLibrary",
  DiscoverBenefits: "benefits",
  DocketRoom: "docket",
  DoctrineGraph: "legalLibrary",
  DocumentDetail: "documents",
  Documents: "documents",
  EnforcementIntel: "enforcementIntel",
  EnforcementPathway: "enforcementIntel",
  Entities: "entities",
  EntityDedup: "dedup",
  EntityDetail: "entities",
  EvidenceLab: "evidenceLayer",
  Exports: "snapshots",
  ExtractionDashboard: "extraction",
  ExtractionFailures: "extraction",
  FilingGenerator: "legalLibrary",
  Findings: "findings",
  FoiaTracking: "foiaRequests",
  GovernanceDashboard: "governance",
  GuidedDashboard: "lighthouse",
  GuidedIntake: "intake",
  GuidedIntakeNew: "intake",
  Home: "-",
  ImportBundle: "ingestion",
  Intake: "intake",
  IntegrityDashboard: "integrity",
  InvestigationGuidance: "investigationGuidance",
  InvestigationWorkflow: "operationalWorkflow",
  InviteLanding: "invites",
  KnowledgePopulation: "knowledgeIngestion",
  LegalLibrary: "legalLibrary",
  Lighthouse: "lighthouse",
  LitigationBarriers: "legalLibrary",
  LumenSend: "lumensend",
  MapIntakePanel: "intake",
  MentalHealth: "civilGideon",
  MissionControl: "lighthouse",
  Mudroom: "operationalWorkflow",
  MyApplications: "benefitApps",
  NetworkGraph: "relationships",
  NotFound: "-",
  Patterns: "patterns",
  PresentationEditor: "presentations",
  Presentations: "presentations",
  ProofFrameworks: "legalLibrary",
  Provenance: "provenance",
  ProvenanceHistory: "provenance",
  ResourceDirectory: "civilGideon",
  ResourceVerification: "resourceVerification",
  SharedCaseView: "share",
  ShopOffice: "operationalWorkflow",
  SignalRegistry: "signalGovernance",
  SovereignControl: "s76",
  SpineViewer: "engines",
  StatementOfFacts: "caseNarrative",
  StructuralDiagnosticsLens: "dualLens",
  Timeline: "events",
  Upload: "uploadSessions",
  Verify: "lighthouse",
  Welcome: "-",
  WorkbenchDashboard: "workbench",
  WorkshopFloor: "operationalWorkflow",
};

// ─────────────────────────────────────────────
// ROUTER
// ─────────────────────────────────────────────

const router = express.Router();

// ─────────────────────────────────────────────
// GET /api/ai/health
// Cheap liveness check. No DB hit. Confirms the mount survived the SPA catch-all.
// ─────────────────────────────────────────────
router.get("/health", (_req: Request, res: Response) => {
  setCache(res, "static");
  res.json({
    status: "ok",
    service: "luminari-ai-inspect",
    lastChecked: now(),
    mount: "/api/ai",
    schemaVersion: "2026-05-21",
  });
});

// ─────────────────────────────────────────────
// GET /api/ai/site-map
// Top-level platform truth. Real counts, real route table.
// ─────────────────────────────────────────────
router.get("/site-map", async (_req: Request, res: Response) => {
  setCache(res, "live");
  const [
    casesCount,
    documentsCount,
    findingsCount,
    signalRegistryCount,
    signalsCount,
    registryProgramsCount,
    legalStatutesCount,
    legalCaseLawCount,
    claimElementMatrixCount,
    engineRegistryCount,
  ] = await Promise.all([
    countTable("cases"),
    countTable("documents"),
    countTable("findings"),
    countTable("signal_registry"),
    countTable("signals"),
    countTable("registry_programs"),
    countTable("legal_statutes"),
    countTable("legal_case_law"),
    countTable("claim_element_matrix"),
    countTable("engine_registry"),
  ]);

  res.json({
    platform: "Luminari / Lighthouse",
    description:
      "Universal civic-forensic operating system. Receives a real human problem and returns verified next action, fallback, escalation, or logged gap.",
    lastChecked: now(),
    deploy: {
      domain: "lighthouse.columbiacitycustomllc.com",
      stack: "React 19 / Express / tRPC 11 / Drizzle / Supabase (Postgres)",
      schemaSource: "wepxlinwbjrkqdzkqpar (public schema, 341 base tables)",
    },
    surfaceSummary: {
      routes: ROUTE_TABLE.length,
      pagesWithTrpcNamespace: Object.values(PAGE_TO_NAMESPACE).filter(
        (n) => n !== "-",
      ).length,
      pagesStaticOrUnwired: Object.values(PAGE_TO_NAMESPACE).filter(
        (n) => n === "-",
      ).length,
    },
    api_surface: {
      total: API_ROUTE_TABLE.length,
      routes: API_ROUTE_TABLE,
    },
    backbone: {
      cases: casesCount,
      documents: documentsCount,
      findings: findingsCount,
      signalRegistry: signalRegistryCount,
      signals: signalsCount,
      registryPrograms: registryProgramsCount,
      legalStatutes: legalStatutesCount,
      legalCaseLaw: legalCaseLawCount,
      claimElementMatrix: claimElementMatrixCount,
      engineRegistry: engineRegistryCount,
    },
    note: "Counts are live. Empty (0) tables indicate the surface is wired but no records have been written yet. error objects indicate the table or column does not exist in this DB.",
  });
});

// ─────────────────────────────────────────────
// GET /api/ai/routes
// The full embedded route table. No DB hit. Always trustworthy.
// ─────────────────────────────────────────────
router.get("/routes", (_req: Request, res: Response) => {
  setCache(res, "static");
  res.json({
    lastChecked: now(),
    count: ROUTE_TABLE.length,
    source: "client/src/App.tsx (manifest 2026-05-20)",
    routes: ROUTE_TABLE,
  });
});

// ─────────────────────────────────────────────
// GET /api/ai/namespaces
// Page → primary tRPC namespace map. No DB hit.
// ─────────────────────────────────────────────
router.get("/namespaces", (_req: Request, res: Response) => {
  setCache(res, "static");
  res.json({
    lastChecked: now(),
    pageCount: Object.keys(PAGE_TO_NAMESPACE).length,
    source: "all_pages_calls.tsv (manifest 2026-05-21)",
    mapping: PAGE_TO_NAMESPACE,
  });
});

// ─────────────────────────────────────────────
// GET /api/ai/page/mission-control
// ─────────────────────────────────────────────
router.get("/page/mission-control", async (_req: Request, res: Response) => {
  setCache(res, "live");
  const [
    casesCount,
    documentsCount,
    findingsCount,
    pipelineRunsCount,
    engineRunsCount,
    engineRegistryCount,
    systemHealthLogsCount,
  ] = await Promise.all([
    countTable("cases"),
    countTable("documents"),
    countTable("findings"),
    countTable("pipeline_runs"),
    countTable("engine_runs"),
    countTable("engine_registry"),
    countTable("system_health_logs"),
  ]);

  res.json({
    route: "/mission-control",
    title: "Mission Control",
    component: "MissionControl",
    primaryNamespace: PAGE_TO_NAMESPACE.MissionControl,
    layer: "L10 / L11",
    purpose:
      "Platform operations hub. Engine health, active pipeline runs, error rates, system-level integrity signals.",
    status: "live",
    lastChecked: now(),
    dataSource:
      "live — cases, documents, findings, pipeline_runs, engine_runs, engine_registry, system_health_logs",
    sections: [
      {
        name: "Platform Counts",
        description: "Live record counts across core tables",
        counts: {
          cases: casesCount,
          documents: documentsCount,
          findings: findingsCount,
          pipelineRuns: pipelineRunsCount,
          engineRuns: engineRunsCount,
        },
      },
      {
        name: "Engine Health",
        description:
          "Engine registry — canonical engines across 12 layers (L0–L11). enabled_er column gates activation.",
        counts: { registered: engineRegistryCount },
        availableActions: ["view engine registry", "inspect engine output", "replay run"],
      },
      {
        name: "Pipeline Queue",
        description: "Active and queued processing runs",
        counts: { runs: pipelineRunsCount },
        availableActions: ["view run log", "cancel run", "force retry"],
      },
      {
        name: "Error Surface",
        description:
          "system_health_logs accumulates schema errors, validation failures, integrity violations.",
        counts: { logEntries: systemHealthLogsCount },
        availableActions: ["view failure log", "export error report"],
      },
    ],
    availableActions: [
      "export status report",
      "trigger integrity check",
      "view audit log",
    ],
    disabledActions: [],
    knownWarnings: [],
  });
});

// ─────────────────────────────────────────────
// GET /api/ai/page/sovereign-control
// ─────────────────────────────────────────────
router.get("/page/sovereign-control", async (_req: Request, res: Response) => {
  setCache(res, "live");
  const [
    engineRegistryCount,
    claimValidationRulesCount,
    sunamGateLogCount,
    governanceLogCount,
    constitutionalViolationLogCount,
    auditTrailCount,
  ] = await Promise.all([
    countTable("engine_registry"),
    countTable("claim_validation_rules"),
    countTable("sunam_gate_log"),
    countTable("governance_log"),
    countTable("constitutional_violation_log"),
    countTable("audit_trail"),
  ]);

  res.json({
    route: "/sovereign-control",
    title: "Sovereign Control",
    component: "SovereignControl",
    primaryNamespace: PAGE_TO_NAMESPACE.SovereignControl,
    layer: "L11",
    purpose:
      "Constitutional enforcement surface. Engine registry, governance constraints, behavioral contracts, override authority.",
    status: "live",
    lastChecked: now(),
    dataSource:
      "live — engine_registry, claim_validation_rules, sunam_gate_log, governance_log, constitutional_violation_log, audit_trail",
    sections: [
      {
        name: "Engine Registry",
        description:
          "Canonical engines across all layers. engine_registry uses _er-suffixed columns (engine_id_er, engine_name_er, enabled_er, etc.).",
        counts: { registered: engineRegistryCount },
        availableActions: ["view engine", "inspect contracts", "view layer assignment"],
      },
      {
        name: "Constitutional Rules",
        description: "Behavioral contracts locked into the system.",
        counts: { validationRules: claimValidationRulesCount },
        availableActions: ["view rule", "audit rule history"],
      },
      {
        name: "Sunam Gate Activity",
        description:
          "Sovereign gate log — every gated decision is recorded immutably.",
        counts: { gateEvents: sunamGateLogCount },
        availableActions: ["view gate event", "trace gate decision"],
      },
      {
        name: "Governance Audit",
        description: "Governance log + general audit trail.",
        counts: {
          governanceEvents: governanceLogCount,
          auditEntries: auditTrailCount,
        },
        availableActions: ["view audit log", "export audit trail"],
      },
      {
        name: "Constitutional Violations",
        description: "Recorded violations of platform constitutional constraints.",
        counts: { violations: constitutionalViolationLogCount },
        availableActions: ["view violation", "trace remediation"],
      },
    ],
    availableActions: ["export governance report", "verify integrity chain"],
    disabledActions: [],
    knownWarnings: [],
  });
});

// ─────────────────────────────────────────────
// GET /api/ai/page/docket
// ─────────────────────────────────────────────
router.get("/page/docket", async (_req: Request, res: Response) => {
  setCache(res, "live");
  // Note: cases.status is a free-text column (data_type=text). The enum values
  // are not constrained at the DB level, so we don't filter by a guessed value
  // like 'active'. Instead we return total counts and let the caller filter.
  const [casesCount, docketEntriesCount, deadlinesCount] = await Promise.all([
    countTable("cases"),
    countTable("docket_entries"),
    countTable("deadlines"),
  ]);

  res.json({
    route: "/docket",
    title: "Docket",
    component: "DocketRoom",
    primaryNamespace: PAGE_TO_NAMESPACE.DocketRoom,
    layer: "L5 / L8",
    purpose:
      "Active case tracker and legislative docket. Shows cases, current pipeline stage, upcoming deadlines, assigned engines.",
    status: "live",
    lastChecked: now(),
    dataSource: "live — cases, docket_entries, deadlines",
    sections: [
      {
        name: "Cases",
        description:
          "All cases. cases.status is free-text (text column, no DB-enforced enum) — caller should inspect distinct values before filtering.",
        counts: { total: casesCount },
        availableActions: ["open case", "view timeline", "view claims", "view findings"],
      },
      {
        name: "Docket Entries",
        description:
          "Legislative/judicial docket entries (jurisdictions, bills, court filings).",
        counts: { total: docketEntriesCount },
        availableActions: ["view entry", "filter by jurisdiction"],
      },
      {
        name: "Deadlines",
        description: "Filing deadlines, renewal dates, expiration warnings.",
        counts: { tracked: deadlinesCount },
        availableActions: ["view deadline", "set reminder", "export deadline list"],
      },
    ],
    availableActions: ["create new case", "export docket", "filter by domain"],
    disabledActions: [],
    knownWarnings: [],
  });
});

// ─────────────────────────────────────────────
// GET /api/ai/page/signal-registry
// ─────────────────────────────────────────────
router.get("/page/signal-registry", async (_req: Request, res: Response) => {
  setCache(res, "live");
  // The original queried `patterns` (does not exist). Real table is
  // pattern_registry. The original also filtered signals by `type='anomaly'`
  // but the column is signal_type and the value space isn't constrained, so
  // we drop the filter and return totals.
  const [signalRegistryCount, signalsCount, patternRegistryCount, signalEventsCount] =
    await Promise.all([
      countTable("signal_registry"),
      countTable("signals"),
      countTable("pattern_registry"),
      countTable("signal_events"),
    ]);

  res.json({
    route: "/signal-registry",
    title: "Signal Registry",
    component: "SignalRegistry",
    primaryNamespace: PAGE_TO_NAMESPACE.SignalRegistry,
    layer: "L6",
    purpose:
      "Structural pattern and signal detection. Population-level patterns, repeat signals, institutional vectors.",
    status: "live",
    lastChecked: now(),
    dataSource: "live — signal_registry, signals, pattern_registry, signal_events",
    sections: [
      {
        name: "Signal Registry",
        description:
          "Canonical signal types and templates. Columns: signalType, domain, severity, triggerPatterns (camelCase column names — Drizzle/TiDB legacy schema).",
        counts: { total: signalRegistryCount },
        availableActions: ["view signal", "trace to source cases", "export signal report"],
      },
      {
        name: "Detected Signals",
        description:
          "Per-case signal instances. Columns are snake_case here (case_id, signal_type) — different naming convention than signal_registry.",
        counts: { total: signalsCount },
        availableActions: ["view detected", "open case"],
      },
      {
        name: "Patterns",
        description:
          "Cross-case patterns from the pattern engine. Includes trend windows and repeat detection.",
        counts: { total: patternRegistryCount },
        availableActions: ["view pattern", "view affected cases", "flag for reform"],
      },
      {
        name: "Signal Events",
        description: "Time-series of signal firings across cases.",
        counts: { total: signalEventsCount },
        availableActions: ["view event timeline"],
      },
    ],
    availableActions: [
      "export signal report",
      "trigger pattern scan",
      "flag for policy escalation",
    ],
    disabledActions: [],
    knownWarnings: [
      "Naming drift: signal_registry uses camelCase columns; signals uses snake_case. Caller must adapt per table.",
    ],
  });
});

// ─────────────────────────────────────────────
// GET /api/ai/page/benefits
// ─────────────────────────────────────────────
router.get("/page/benefits", async (_req: Request, res: Response) => {
  setCache(res, "live");
  // The original queried `benefit_programs` (does not exist). Real tables:
  //   registry_programs            — 2,422 civic programs catalog
  //   government_benefits_registry — narrower benefits subset
  //   benefit_applications         — user-submitted applications
  const [
    registryProgramsCount,
    governmentBenefitsCount,
    benefitApplicationsCount,
    eligibilityHintsCount,
  ] = await Promise.all([
    countTable("registry_programs"),
    countTable("government_benefits_registry"),
    countTable("benefit_applications"),
    countTable("eligibility_hints"),
  ]);

  res.json({
    route: "/benefits",
    title: "Benefits Navigator",
    component: "BenefitsNavigator",
    primaryNamespace: PAGE_TO_NAMESPACE.BenefitsNavigator,
    layer: "L3 / L8",
    purpose:
      "Eligibility screening, benefit lifecycle (application → submission → approval → renewal), threshold/cliff analysis, form assistance.",
    status: "live",
    lastChecked: now(),
    dataSource:
      "live — registry_programs, government_benefits_registry, benefit_applications, eligibility_hints",
    sections: [
      {
        name: "Eligibility Screener",
        description: "Determines which benefits match a person's situation.",
        counts: { eligibilityHints: eligibilityHintsCount },
        availableActions: ["run eligibility check", "view matched programs"],
      },
      {
        name: "Civic Program Registry",
        description:
          "Broad civic-program catalog (federal, state, local). registry_programs is the union catalog.",
        counts: { total: registryProgramsCount },
        availableActions: ["view program", "check income limits"],
      },
      {
        name: "Government Benefits",
        description:
          "Government benefits subset with eligibility rules and application forms.",
        counts: { total: governmentBenefitsCount },
        availableActions: ["view benefit", "view application form"],
      },
      {
        name: "User Applications",
        description: "User-submitted benefit applications tracked across lifecycle.",
        counts: { total: benefitApplicationsCount },
        availableActions: ["view status", "set renewal reminder", "start appeal"],
      },
    ],
    availableActions: ["start benefits check", "export eligibility report"],
    disabledActions: [],
    knownWarnings: [],
  });
});

// ─────────────────────────────────────────────
// GET /api/ai/page/guided-intake
// ─────────────────────────────────────────────
router.get("/page/guided-intake", async (_req: Request, res: Response) => {
  setCache(res, "live");
  // The original queried `intake_events` (does not exist).
  // Real tables: intake_records, entry_runs, map_intake_sessions.
  const [intakeRecordsCount, entryRunsCount, mapIntakeSessionsCount] =
    await Promise.all([
      countTable("intake_records"),
      countTable("entry_runs"),
      countTable("map_intake_sessions"),
    ]);

  res.json({
    route: "/guided-intake",
    title: "Guided Intake",
    component: "GuidedIntakeNew",
    primaryNamespace: PAGE_TO_NAMESPACE.GuidedIntakeNew,
    layer: "L0",
    purpose:
      "Step-by-step structured intake. Produces a normalized problem statement that feeds the deterministic pipeline.",
    status: "live",
    lastChecked: now(),
    dataSource: "live — intake_records, entry_runs, map_intake_sessions",
    sections: [
      {
        name: "Problem Framing",
        description: "Guided questions for users to describe their situation.",
        counts: { intakeRecords: intakeRecordsCount },
        availableActions: ["start intake", "resume draft", "submit problem"],
      },
      {
        name: "Entry Runs",
        description:
          "Each intake submission becomes an entry_run, which then feeds pipeline_runs.",
        counts: { total: entryRunsCount },
        availableActions: ["view run", "trace to case"],
      },
      {
        name: "Map Intake Sessions",
        description:
          "Geographic / civic-map-driven intake — user starts from a map area instead of free text.",
        counts: { total: mapIntakeSessionsCount },
        availableActions: ["view session", "open associated case"],
      },
    ],
    availableActions: ["start new intake", "view intake history"],
    disabledActions: [],
    knownWarnings: [],
  });
});

// ─────────────────────────────────────────────
// GET /api/ai/compare/main-vs-manus
// ─────────────────────────────────────────────
router.get("/compare/main-vs-manus", async (_req: Request, res: Response) => {
  setCache(res, "live");
  const [casesCount, documentsCount] = await Promise.all([
    countTable("cases"),
    countTable("documents"),
  ]);

  res.json({
    route: "/compare/main-vs-manus",
    title: "Main (Render) vs Manus Reference",
    purpose:
      "Semantic comparison between the live Render deployment and the Manus reference build. Used to detect drift, missing features, and rebuild gaps.",
    lastChecked: now(),
    main: {
      url: "https://lighthouse.columbiacitycustomllc.com",
      branch: "main",
      stack:
        "React 19 / Express / tRPC 11 / Drizzle / Supabase Postgres (wepxlinwbjrkqdzkqpar)",
      dbCounts: {
        cases: casesCount,
        documents: documentsCount,
      },
      status: "live — Supabase Postgres backend confirmed",
    },
    manus: {
      url: "https://3000-ice1zn74bmhq0q38qyje9-7e7ca167.manus.space",
      stack: "React 19 / Express / tRPC 11 / Drizzle / TiDB (MySQL-compatible)",
      status: "reference — Manus sandbox, not permanent hosting",
      dbCounts: {
        note: "Cannot be read from this inspector — different DB host, no cross-environment access.",
      },
    },
    drift: {
      note: "Counts above are for the Render/Supabase side only. Manus side requires its own inspector deployed in that environment for a true diff.",
      knownGaps: [
        "Schema parity TiDB→Postgres unverified column-by-column.",
        "Engine registry uses _er-suffixed columns (engine_id_er, engine_name_er, enabled_er) — drift candidate vs canonical schema.",
        "Same case may have integer id (cases table, TiDB legacy) AND uuid id (pipeline_runs.case_id) — two case ID spaces.",
      ],
      confirmed: [
        "wepxlinwbjrkqdzkqpar has 341 public base tables.",
        "Inspector is live on Render with /api/ai mount before SPA catch-all.",
      ],
    },
  });
});

// ─────────────────────────────────────────────
// EXPORTS
//
// The repo uses NAMED import: `import { aiInspectRouter } from ...`
// We also default-export for compatibility with the original mount style.
// ─────────────────────────────────────────────

export const aiInspectRouter = router;
export default router;

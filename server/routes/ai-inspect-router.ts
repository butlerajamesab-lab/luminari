/**
 * ============================================================
 * LUMINARI — AI INSPECTION ROUTER
 *
 * Read-only semantic inspection layer for browser-blind AI assistants.
 * Rules: GET only, no mutations, no writes, no PII/raw records.
 * ============================================================
 */

import express, { Request, Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";

type CountResult = { count: number } | { error: string; table: string };

function now(): string {
  return new Date().toISOString();
}

async function countTable(tableName: string): Promise<CountResult> {
  try {
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

function setCache(res: Response, kind: "static" | "live") {
  if (kind === "static") {
    res.setHeader("Cache-Control", "public, max-age=3600, must-revalidate");
  } else {
    res.setHeader("Cache-Control", "no-store");
  }
}

// Static route manifest synchronized with client/src/App.tsx.
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
  { path: "/sovereign-control", component: "SovereignControl" },
  { path: "/ingestion-control", component: "IngestionControl" },
  { path: "/lighthouse", component: "Lighthouse" },
  { path: "/civic-map", component: "CivicMap" },
  { path: "/viewfinder", component: "AnomalyViewfinder" },
  { path: "/docket", component: "docket_room_page" },
  { path: "/docket/:slug", component: "docket_room_page" },
  { path: "/lumensend", component: "LumenSend" },
  { path: "/legal-library", component: "LegalLibrary" },
  { path: "/agency-metrics", component: "AgencyMetrics" },
  { path: "/civil-gideon", component: "CivilGideon" },
  { path: "/native-nations", component: "native_nations_hub_page" },
  { path: "/recognition-gideon", component: "recognition_gideon_page" },
  { path: "/recognition-atlas/:tribe_id/:layer_slug", component: "recognition_atlas_layer_page" },
  { path: "/recognition-atlas/:tribe_id", component: "recognition_atlas_tribe_page" },
  { path: "/recognition-atlas", component: "recognition_atlas_page" },
  { path: "/mental-health", component: "MentalHealth" },
  { path: "/categories", component: "CategoryExplorer" },
  { path: "/category/:categoryId", component: "CategoryLanding" },
  { path: "/doctrine-graph", component: "DoctrineGraph" },
  { path: "/barriers", component: "LitigationBarriers" },
  { path: "/litigation-barriers", component: "LitigationBarriers" },
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
  { path: "/login", component: "Login" },
  { path: "/workshop", component: "WorkshopFloor" },
  { path: "/workbench/:caseId", component: "WorkbenchDashboard" },
  { path: "/workbench", component: "WorkbenchDashboard" },
  { path: "/evidence-lab", component: "EvidenceLab" },
  { path: "/shop-office", component: "ShopOffice" },
  { path: "/resources", component: "ResourceDirectory" },
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

export const NATIVE_RECOGNITION_ROUTE_CANDIDATES: ReadonlyArray<{
  expected_path: string;
  expected_component: string;
}> = [
  { expected_path: "/native-nations", expected_component: "native_nations_hub_page" },
  { expected_path: "/recognition-atlas", expected_component: "recognition_atlas_page" },
  { expected_path: "/recognition-atlas/:tribe_id", expected_component: "recognition_atlas_tribe_page" },
  { expected_path: "/recognition-atlas/:tribe_id/:layer_slug", expected_component: "recognition_atlas_layer_page" },
  { expected_path: "/recognition-gideon", expected_component: "recognition_gideon_page" },
];

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
  docket_room_page: "docket",
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
  HomeOrWelcome: "-",
  ImportBundle: "ingestion",
  IngestionControl: "-",
  Intake: "intake",
  IntegrityDashboard: "integrity",
  InvestigationGuidance: "investigationGuidance",
  InvestigationWorkflow: "operationalWorkflow",
  InviteLanding: "invites",
  KnowledgePopulation: "knowledgeIngestion",
  LegalLibrary: "legalLibrary",
  Lighthouse: "lighthouse",
  LitigationBarriers: "legalLibrary",
  Login: "-",
  LumenSend: "lumensend",
  MapIntakePanel: "intake",
  MentalHealth: "civilGideon",
  MissionControl: "lighthouse",
  Mudroom: "operationalWorkflow",
  MyApplications: "benefitApps",
  native_nations_hub_page: "-",
  NetworkGraph: "relationships",
  NotFound: "-",
  Patterns: "patterns",
  PresentationEditor: "presentations",
  Presentations: "presentations",
  ProofFrameworks: "legalLibrary",
  Provenance: "provenance",
  ProvenanceHistory: "provenance",
  recognition_atlas_page: "-",
  recognition_atlas_layer_page: "-",
  recognition_atlas_tribe_page: "-",
  recognition_gideon_page: "-",
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

const router = express.Router();

router.get("/health", (_req: Request, res: Response) => {
  setCache(res, "static");
  res.json({
    status: "ok",
    service: "luminari-ai-inspect",
    last_checked: now(),
    mount: "/api/ai",
    schema_version: "2026-06-16",
  });
});

router.get("/site-map", async (_req: Request, res: Response) => {
  setCache(res, "live");
  const [
    cases_count,
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
    last_checked: now(),
    deploy: {
      domain: "lighthouse.columbiacitycustomllc.com",
      stack: "React 19 / Express / tRPC 11 / Drizzle / Supabase (Postgres)",
      schema_source: "wepxlinwbjrkqdzkqpar (public schema, 341 base tables)",
    },
    surface_summary: {
      routes: ROUTE_TABLE.length,
      pages_with_trpc_namespace: Object.values(PAGE_TO_NAMESPACE).filter(
        (n) => n !== "-",
      ).length,
      pages_static_or_unwired: Object.values(PAGE_TO_NAMESPACE).filter(
        (n) => n === "-",
      ).length,
    },
    frontend_surface: {
      total_routes: ROUTE_TABLE.length,
      routes: ROUTE_TABLE,
    },
    api_surface: {
      total_mounts: API_ROUTE_TABLE.length,
      routes: API_ROUTE_TABLE,
    },
    native_recognition_surface: {
      candidates: NATIVE_RECOGNITION_ROUTE_CANDIDATES.map((candidate) => {
        const matched_route = ROUTE_TABLE.find(
          (route) =>
            route.path === candidate.expected_path ||
            route.component === candidate.expected_component,
        );

        return {
          expected_path: candidate.expected_path,
          expected_component: candidate.expected_component,
          route_status: matched_route ? "registered" : "not_registered",
          matched_route: matched_route ?? null,
        };
      }),
    },
    backbone: {
      cases: cases_count,
      documents: documentsCount,
      findings: findingsCount,
      signal_registry: signalRegistryCount,
      signals: signalsCount,
      registry_programs: registryProgramsCount,
      legal_statutes: legalStatutesCount,
      legal_case_law: legalCaseLawCount,
      claim_element_matrix: claimElementMatrixCount,
      engine_registry: engineRegistryCount,
    },
    note: "Counts are live. Empty (0) tables indicate the surface is wired but no records have been written yet. error objects indicate the table or column does not exist in this DB.",
  });
});

router.get("/routes", (_req: Request, res: Response) => {
  setCache(res, "static");
  res.json({
    last_checked: now(),
    count: ROUTE_TABLE.length,
    source: "client/src/App.tsx",
    routes: ROUTE_TABLE,
  });
});

router.get("/namespaces", (_req: Request, res: Response) => {
  setCache(res, "static");
  res.json({
    last_checked: now(),
    page_count: Object.keys(PAGE_TO_NAMESPACE).length,
    source: "all_pages_calls.tsv plus App.tsx route manifest reconciliation",
    mapping: PAGE_TO_NAMESPACE,
  });
});

router.get("/page/mission-control", async (_req: Request, res: Response) => {
  setCache(res, "live");
  const [cases_count, documentsCount, findingsCount, pipelineRunsCount, engineRunsCount, engineRegistryCount, systemHealthLogsCount] = await Promise.all([
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
    primary_namespace: PAGE_TO_NAMESPACE.MissionControl,
    status: "live",
    last_checked: now(),
    data_source: "live — cases, documents, findings, pipeline_runs, engine_runs, engine_registry, system_health_logs",
    sections: [
      { name: "Platform Counts", counts: { cases: cases_count, documents: documentsCount, findings: findingsCount } },
      { name: "Pipeline Queue", counts: { pipeline_runs: pipelineRunsCount, engine_runs: engineRunsCount } },
      { name: "Engine Registry", counts: { registered: engineRegistryCount } },
      { name: "Error Surface", counts: { log_entries: systemHealthLogsCount } },
    ],
  });
});

router.get("/page/sovereign-control", async (_req: Request, res: Response) => {
  setCache(res, "live");
  const [engineRegistryCount, claimValidationRulesCount, sunamGateLogCount, governanceLogCount, constitutionalViolationLogCount, auditTrailCount] = await Promise.all([
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
    primary_namespace: PAGE_TO_NAMESPACE.SovereignControl,
    status: "live",
    last_checked: now(),
    data_source: "live — engine_registry, claim_validation_rules, sunam_gate_log, governance_log, constitutional_violation_log, audit_trail",
    sections: [
      { name: "Engine Registry", counts: { registered: engineRegistryCount } },
      { name: "Constitutional Rules", counts: { validation_rules: claimValidationRulesCount } },
      { name: "Sunam Gate Activity", counts: { gate_events: sunamGateLogCount } },
      { name: "Governance Audit", counts: { governance_events: governanceLogCount, audit_entries: auditTrailCount } },
      { name: "Constitutional Violations", counts: { violations: constitutionalViolationLogCount } },
    ],
  });
});

router.get("/page/docket", async (_req: Request, res: Response) => {
  setCache(res, "live");
  const [cases_count, docket_entries_count, deadlines_count] = await Promise.all([
    countTable("cases"),
    countTable("docket_entries"),
    countTable("deadlines"),
  ]);
  res.json({
    route: "/docket",
    title: "Docket",
    component: "docket_room_page",
    primary_namespace: PAGE_TO_NAMESPACE.docket_room_page,
    status: "live",
    last_checked: now(),
    data_source: "live — cases, docket_entries, deadlines",
    sections: [
      { name: "Cases", counts: { total: cases_count } },
      { name: "Docket Entries", counts: { total: docket_entries_count } },
      { name: "Deadlines", counts: { tracked: deadlines_count } },
    ],
  });
});

router.get("/page/signal-registry", async (_req: Request, res: Response) => {
  setCache(res, "live");
  const [signalRegistryCount, signalsCount, patternRegistryCount, signalEventsCount] = await Promise.all([
    countTable("signal_registry"),
    countTable("signals"),
    countTable("pattern_registry"),
    countTable("signal_events"),
  ]);
  res.json({
    route: "/signal-registry",
    title: "Signal Registry",
    component: "SignalRegistry",
    primary_namespace: PAGE_TO_NAMESPACE.SignalRegistry,
    status: "live",
    last_checked: now(),
    data_source: "live — signal_registry, signals, pattern_registry, signal_events",
    sections: [
      { name: "Signal Registry", counts: { total: signalRegistryCount } },
      { name: "Detected Signals", counts: { total: signalsCount } },
      { name: "Patterns", counts: { total: patternRegistryCount } },
      { name: "Signal Events", counts: { total: signalEventsCount } },
    ],
  });
});

router.get("/page/benefits", async (_req: Request, res: Response) => {
  setCache(res, "live");
  const [registryProgramsCount, governmentBenefitsCount, benefitApplicationsCount, eligibilityHintsCount] = await Promise.all([
    countTable("registry_programs"),
    countTable("government_benefits_registry"),
    countTable("benefit_applications"),
    countTable("eligibility_hints"),
  ]);
  res.json({
    route: "/benefits",
    title: "Benefits Navigator",
    component: "BenefitsNavigator",
    primary_namespace: PAGE_TO_NAMESPACE.BenefitsNavigator,
    status: "live",
    last_checked: now(),
    data_source: "live — registry_programs, government_benefits_registry, benefit_applications, eligibility_hints",
    sections: [
      { name: "Eligibility Screener", counts: { eligibility_hints: eligibilityHintsCount } },
      { name: "Civic Program Registry", counts: { total: registryProgramsCount } },
      { name: "Government Benefits", counts: { total: governmentBenefitsCount } },
      { name: "User Applications", counts: { total: benefitApplicationsCount } },
    ],
  });
});

router.get("/page/guided-intake", async (_req: Request, res: Response) => {
  setCache(res, "live");
  const [intakeRecordsCount, entryRunsCount, mapIntakeSessionsCount] = await Promise.all([
    countTable("intake_records"),
    countTable("entry_runs"),
    countTable("map_intake_sessions"),
  ]);
  res.json({
    route: "/guided-intake",
    title: "Guided Intake",
    component: "GuidedIntakeNew",
    primary_namespace: PAGE_TO_NAMESPACE.GuidedIntakeNew,
    status: "live",
    last_checked: now(),
    data_source: "live — intake_records, entry_runs, map_intake_sessions",
    sections: [
      { name: "Problem Framing", counts: { intake_records: intakeRecordsCount } },
      { name: "Entry Runs", counts: { total: entryRunsCount } },
      { name: "Map Intake Sessions", counts: { total: mapIntakeSessionsCount } },
    ],
  });
});

router.get("/compare/main-vs-manus", async (_req: Request, res: Response) => {
  setCache(res, "live");
  const [cases_count, documentsCount] = await Promise.all([
    countTable("cases"),
    countTable("documents"),
  ]);
  res.json({
    route: "/compare/main-vs-manus",
    title: "Main (Render) vs Manus Reference",
    purpose: "Semantic comparison between the live Render deployment and the Manus reference build.",
    last_checked: now(),
    main: {
      url: "https://lighthouse.columbiacitycustomllc.com",
      branch: "main",
      stack: "React 19 / Express / tRPC 11 / Drizzle / Supabase Postgres (wepxlinwbjrkqdzkqpar)",
      db_counts: { cases: cases_count, documents: documentsCount },
      status: "live — Supabase Postgres backend confirmed",
    },
    manus: {
      url: "https://3000-ice1zn74bmhq0q38qyje9-7e7ca167.manus.space",
      stack: "React 19 / Express / tRPC 11 / Drizzle / TiDB (MySQL-compatible)",
      status: "reference — Manus sandbox, not permanent hosting",
      db_counts: { note: "Cannot be read from this inspector — different DB host, no cross-environment access." },
    },
    drift: {
      note: "Counts above are for the Render/Supabase side only. Manus side requires its own inspector deployed in that environment for a true diff.",
      confirmed: [
        "wepxlinwbjrkqdzkqpar has 341 public base tables.",
        "Inspector is live on Render with /api/ai mount before SPA catch-all.",
      ],
    },
  });
});

export const aiInspectRouter = router;
export default router;

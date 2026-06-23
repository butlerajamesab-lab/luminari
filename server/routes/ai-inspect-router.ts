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
export const ROUTE_TABLE: ReadonlyArray<{ path: string; component_slug: string }> = [
  { path: "/", component_slug: "home_or_welcome" },
  { path: "/control-room", component_slug: "control_room" },
  { path: "/cases/:id/control-room", component_slug: "control_room" },
  { path: "/cases", component_slug: "cases" },
  { path: "/documents", component_slug: "documents" },
  { path: "/documents/:id", component_slug: "document_detail" },
  { path: "/upload", component_slug: "upload" },
  { path: "/entities", component_slug: "entities" },
  { path: "/entities/dedup", component_slug: "entity_dedup" },
  { path: "/entities/:id", component_slug: "entity_detail" },
  { path: "/findings", component_slug: "findings" },
  { path: "/timeline", component_slug: "timeline" },
  { path: "/network", component_slug: "network_graph" },
  { path: "/chat", component_slug: "chat" },
  { path: "/exports", component_slug: "exports" },
  { path: "/audit", component_slug: "audit_trail" },
  { path: "/repair", component_slug: "case_repair" },
  { path: "/cda", component_slug: "cda_run_list" },
  { path: "/cda/:id", component_slug: "cda_run_detail" },
  { path: "/provenance", component_slug: "provenance" },
  { path: "/provenance/history", component_slug: "provenance_history" },
  { path: "/extraction-failures", component_slug: "extraction_failures" },
  { path: "/integrity", component_slug: "integrity_dashboard" },
  { path: "/spine/:caseId/:snapshotId", component_slug: "spine_viewer" },
  { path: "/action-path", component_slug: "action_path" },
  { path: "/foia", component_slug: "foia_tracking" },
  { path: "/narrative", component_slug: "statement_of_facts" },
  { path: "/patterns", component_slug: "patterns" },
  { path: "/presentations", component_slug: "presentations" },
  { path: "/presentations/:id", component_slug: "presentation_editor" },
  { path: "/extraction", component_slug: "extraction_dashboard" },
  { path: "/welcome", component_slug: "welcome" },
  { path: "/intake", component_slug: "intake" },
  { path: "/case/:id", component_slug: "case" },
  { path: "/luminari-intake", component_slug: "guided_intake_new" },
  { path: "/guided-intake", component_slug: "guided_intake_new" },
  { path: "/benefits", component_slug: "benefits_navigator" },
  { path: "/my-applications", component_slug: "my_applications" },
  { path: "/discover", component_slug: "discover_benefits" },
  { path: "/guide/:caseId", component_slug: "guided_dashboard" },
  { path: "/shared/:token", component_slug: "shared_case_view" },
  { path: "/admin/feedback", component_slug: "admin_feedback" },
  { path: "/admin/analytics", component_slug: "admin_analytics" },
  { path: "/admin/users", component_slug: "admin_users" },
  { path: "/admin/test-scenarios", component_slug: "admin_test_scenarios" },
  { path: "/admin/resource-verification", component_slug: "resource_verification" },
  { path: "/invite/:token", component_slug: "invite_landing" },
  { path: "/templates", component_slug: "case_templates" },
  { path: "/import-bundle", component_slug: "import_bundle" },
  { path: "/mission-control", component_slug: "mission_control" },
  { path: "/sovereign-control", component_slug: "sovereign_control" },
  { path: "/ingestion-control", component_slug: "ingestion_control" },
  { path: "/lighthouse", component_slug: "lighthouse" },
  { path: "/civic-map", component_slug: "civic_map" },
  { path: "/viewfinder", component_slug: "anomaly_viewfinder" },
  { path: "/docket", component_slug: "docket_room" },
  { path: "/docket/:slug", component_slug: "docket_room" },
  { path: "/lumensend", component_slug: "lumen_send" },
  { path: "/legal-library", component_slug: "legal_library" },
  { path: "/agency-metrics", component_slug: "agency_metrics" },
  { path: "/civil-gideon", component_slug: "civil_gideon" },
  { path: "/native-nations", component_slug: "native_nations_hub" },
  { path: "/recognition-gideon", component_slug: "recognition_gideon" },
  { path: "/recognition-atlas/:tribe_id/:layer_slug", component_slug: "recognition_atlas_layer" },
  { path: "/recognition-atlas/:tribe_id", component_slug: "recognition_atlas_tribe" },
  { path: "/recognition-atlas", component_slug: "recognition_atlas" },
  { path: "/mental-health", component_slug: "mental_health" },
  { path: "/categories", component_slug: "category_explorer" },
  { path: "/category/:categoryId", component_slug: "category_landing" },
  { path: "/doctrine-graph", component_slug: "doctrine_graph" },
  { path: "/barriers", component_slug: "litigation_barriers" },
  { path: "/litigation-barriers", component_slug: "litigation_barriers" },
  { path: "/signal-registry", component_slug: "signal_registry" },
  { path: "/enforcement-intel", component_slug: "enforcement_intel" },
  { path: "/deadline-calculator", component_slug: "deadline_calculator" },
  { path: "/contradiction-scoring", component_slug: "contradiction_scoring" },
  { path: "/enforcement-pathway", component_slug: "enforcement_pathway" },
  { path: "/investigation-workflow", component_slug: "investigation_workflow" },
  { path: "/architecture-map", component_slug: "architecture_map" },
  { path: "/architecture", component_slug: "architecture_map" },
  { path: "/filing-generator", component_slug: "filing_generator" },
  { path: "/proof-frameworks", component_slug: "proof_frameworks" },
  { path: "/claim-elements", component_slug: "claim_elements" },
  { path: "/claim-denial-analysis", component_slug: "claim_denial_analysis" },
  { path: "/investigation-guidance", component_slug: "investigation_guidance" },
  { path: "/command-board", component_slug: "command_board" },
  { path: "/admin/knowledge-population", component_slug: "knowledge_population" },
  { path: "/resolve", component_slug: "case_resolution_lens" },
  { path: "/diagnostics", component_slug: "structural_diagnostics_lens" },
  { path: "/mudroom", component_slug: "mudroom" },
  { path: "/login", component_slug: "login" },
  { path: "/workshop", component_slug: "workshop_floor" },
  { path: "/workbench/:caseId", component_slug: "workbench_dashboard" },
  { path: "/workbench", component_slug: "workbench_dashboard" },
  { path: "/evidence-lab", component_slug: "evidence_lab" },
  { path: "/shop-office", component_slug: "shop_office" },
  { path: "/resources", component_slug: "resource_directory" },
  { path: "/mission-control/governance", component_slug: "governance_dashboard" },
  { path: "/verify", component_slug: "verify" },
  { path: "/business-analytics", component_slug: "business_analytics" },
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
  expected_component_slug: string;
}> = [
  { expected_path: "/native-nations", expected_component_slug: "native_nations_hub" },
  { expected_path: "/recognition-atlas", expected_component_slug: "recognition_atlas" },
  { expected_path: "/recognition-atlas/:tribe_id", expected_component_slug: "recognition_atlas_tribe" },
  { expected_path: "/recognition-atlas/:tribe_id/:layer_slug", expected_component_slug: "recognition_atlas_layer" },
  { expected_path: "/recognition-gideon", expected_component_slug: "recognition_gideon" },
];

export const PAGE_TO_NAMESPACE: Readonly<Record<string, string>> = {
  action_path: "intake",
  activation_control: "-",
  admin_analytics: "analytics",
  admin_feedback: "feedback",
  admin_test_scenarios: "testScenarios",
  admin_users: "useUtils",
  agency_metrics: "agencyMetrics",
  anomaly_viewfinder: "-",
  architecture_map: "interventionNetwork",
  audit_trail: "audit",
  benefits_navigator: "benefits",
  business_analytics: "business",
  case: "cases",
  case_repair: "caseRepair",
  case_resolution_lens: "remedyFeasibility",
  case_templates: "caseTemplates",
  cases: "cases",
  category_explorer: "categories",
  category_landing: "categories",
  cda_run_detail: "cda",
  cda_run_list: "cda",
  chat: "chat",
  civic_map: "civilGideon",
  civil_gideon: "civilGideon",
  claim_denial_analysis: "claimValidation",
  claim_elements: "legalLibrary",
  command_board: "operationalWorkflow",
  contradiction_scoring: "evidenceConfidence",
  control_room: "lighthouse",
  deadline_calculator: "legalLibrary",
  discover_benefits: "benefits",
  docket_room: "docket",
  doctrine_graph: "legalLibrary",
  document_detail: "documents",
  documents: "documents",
  enforcement_intel: "enforcementIntel",
  enforcement_pathway: "enforcementIntel",
  entities: "entities",
  entity_dedup: "dedup",
  entity_detail: "entities",
  evidence_lab: "evidenceLayer",
  exports: "snapshots",
  extraction_dashboard: "extraction",
  extraction_failures: "extraction",
  filing_generator: "legalLibrary",
  findings: "findings",
  foia_tracking: "foiaRequests",
  governance_dashboard: "governance",
  guided_dashboard: "lighthouse",
  guided_intake: "intake",
  guided_intake_new: "intake",
  home: "-",
  home_or_welcome: "-",
  import_bundle: "ingestion",
  ingestion_control: "-",
  intake: "intake",
  integrity_dashboard: "integrity",
  investigation_guidance: "investigationGuidance",
  investigation_workflow: "operationalWorkflow",
  invite_landing: "invites",
  knowledge_population: "knowledgeIngestion",
  legal_library: "legalLibrary",
  lighthouse: "lighthouse",
  litigation_barriers: "legalLibrary",
  login: "-",
  lumen_send: "lumensend",
  map_intake_panel: "intake",
  mental_health: "civilGideon",
  mission_control: "lighthouse",
  mudroom: "operationalWorkflow",
  my_applications: "benefitApps",
  native_nations_hub: "-",
  network_graph: "relationships",
  not_found: "-",
  patterns: "patterns",
  presentation_editor: "presentations",
  presentations: "presentations",
  proof_frameworks: "legalLibrary",
  provenance: "provenance",
  provenance_history: "provenance",
  recognition_atlas: "-",
  recognition_atlas_layer: "-",
  recognition_atlas_tribe: "-",
  recognition_gideon: "-",
  resource_directory: "civilGideon",
  resource_verification: "resourceVerification",
  shared_case_view: "share",
  shop_office: "operationalWorkflow",
  signal_registry: "signalGovernance",
  sovereign_control: "s76",
  spine_viewer: "engines",
  statement_of_facts: "caseNarrative",
  structural_diagnostics_lens: "dualLens",
  timeline: "events",
  upload: "uploadSessions",
  verify: "lighthouse",
  welcome: "-",
  workbench_dashboard: "workbench",
  workshop_floor: "operationalWorkflow",
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
    signal_registry_count,
    signals_count,
    registry_programs_count,
    legal_statutes_count,
    legal_case_law_count,
    claim_element_matrix_count,
    engine_registry_count,
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
            route.component_slug === candidate.expected_component_slug,
        );

        return {
          expected_path: candidate.expected_path,
          expected_component_slug: candidate.expected_component_slug,
          route_status: matched_route ? "registered" : "not_registered",
          matched_route: matched_route ?? null,
        };
      }),
    },
    backbone: {
      cases: cases_count,
      documents: documentsCount,
      findings: findingsCount,
      signal_registry: signal_registry_count,
      signals: signals_count,
      registry_programs: registry_programs_count,
      legal_statutes: legal_statutes_count,
      legal_case_law: legal_case_law_count,
      claim_element_matrix: claim_element_matrix_count,
      engine_registry: engine_registry_count,
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
    pageCount: Object.keys(PAGE_TO_NAMESPACE).length,
    source: "all_pages_calls.tsv plus App.tsx route manifest reconciliation",
    mapping: PAGE_TO_NAMESPACE,
  });
});

router.get("/page/mission-control", async (_req: Request, res: Response) => {
  setCache(res, "live");
  const [cases_count, documentsCount, findingsCount, pipeline_runs_count, engine_runs_count, engine_registry_count, systemHealthLogsCount] = await Promise.all([
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
    component_slug: "mission_control",
    primary_namespace: PAGE_TO_NAMESPACE.mission_control,
    status: "live",
    last_checked: now(),
    data_source: "live — cases, documents, findings, pipeline_runs, engine_runs, engine_registry, system_health_logs",
    sections: [
      { name: "Platform Counts", counts: { cases: cases_count, documents: documentsCount, findings: findingsCount } },
      { name: "Pipeline Queue", counts: { pipeline_runs: pipeline_runs_count, engine_runs: engine_runs_count } },
      { name: "Engine Registry", counts: { registered: engine_registry_count } },
      { name: "Error Surface", counts: { log_entries: systemHealthLogsCount } },
    ],
  });
});

router.get("/page/sovereign-control", async (_req: Request, res: Response) => {
  setCache(res, "live");
  const [engine_registry_count, claimValidationRulesCount, sunamGateLogCount, governanceLogCount, constitutionalViolationLogCount, auditTrailCount] = await Promise.all([
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
    component_slug: "sovereign_control",
    primary_namespace: PAGE_TO_NAMESPACE.sovereign_control,
    status: "live",
    last_checked: now(),
    data_source: "live — engine_registry, claim_validation_rules, sunam_gate_log, governance_log, constitutional_violation_log, audit_trail",
    sections: [
      { name: "Engine Registry", counts: { registered: engine_registry_count } },
      { name: "Constitutional Rules", counts: { validationRules: claimValidationRulesCount } },
      { name: "Sunam Gate Activity", counts: { gateEvents: sunamGateLogCount } },
      { name: "Governance Audit", counts: { governanceEvents: governanceLogCount, auditEntries: auditTrailCount } },
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
    component_slug: "docket_room",
    primary_namespace: PAGE_TO_NAMESPACE.docket_room,
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
  const [signal_registry_count, signals_count, patternRegistryCount, signalEventsCount] = await Promise.all([
    countTable("signal_registry"),
    countTable("signals"),
    countTable("pattern_registry"),
    countTable("signal_events"),
  ]);
  res.json({
    route: "/signal-registry",
    title: "Signal Registry",
    component_slug: "signal_registry",
    primary_namespace: PAGE_TO_NAMESPACE.signal_registry,
    status: "live",
    last_checked: now(),
    data_source: "live — signal_registry, signals, pattern_registry, signal_events",
    sections: [
      { name: "Signal Registry", counts: { total: signal_registry_count } },
      { name: "Detected Signals", counts: { total: signals_count } },
      { name: "Patterns", counts: { total: patternRegistryCount } },
      { name: "Signal Events", counts: { total: signalEventsCount } },
    ],
  });
});

router.get("/page/benefits", async (_req: Request, res: Response) => {
  setCache(res, "live");
  const [registry_programs_count, governmentBenefitsCount, benefitApplicationsCount, eligibilityHintsCount] = await Promise.all([
    countTable("registry_programs"),
    countTable("government_benefits_registry"),
    countTable("benefit_applications"),
    countTable("eligibility_hints"),
  ]);
  res.json({
    route: "/benefits",
    title: "Benefits Navigator",
    component_slug: "benefits_navigator",
    primary_namespace: PAGE_TO_NAMESPACE.benefits_navigator,
    status: "live",
    last_checked: now(),
    data_source: "live — registry_programs, government_benefits_registry, benefit_applications, eligibility_hints",
    sections: [
      { name: "Eligibility Screener", counts: { eligibilityHints: eligibilityHintsCount } },
      { name: "Civic Program Registry", counts: { total: registry_programs_count } },
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
    component_slug: "guided_intake_new",
    primary_namespace: PAGE_TO_NAMESPACE.guided_intake_new,
    status: "live",
    last_checked: now(),
    data_source: "live — intake_records, entry_runs, map_intake_sessions",
    sections: [
      { name: "Problem Framing", counts: { intakeRecords: intakeRecordsCount } },
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

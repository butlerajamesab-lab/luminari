/**
 * PANEL REGISTRY — Mission Control Panel Activation System
 *
 * LAYER DEFINITIONS:
 *   REGISTRY    — canonical tables, single source of truth, NOT user-facing
 *   ALPHA_LAKE  — snapshot-bound outputs, immutable, export-only
 *   PROJECTION  — UI projection, filtered view of Registry data
 *
 * VIABILITY STATUS:
 *   WIRED_WITH_DATA — live query + canonical table has records > 0
 *   WIRED_LLM       — LLM-backed engine, always functional (no persistent data required)
 *   WIRED_NO_DATA   — live query but canonical table is empty
 *   UNWIRED         — no backing query or data source missing
 *   INVALID         — mixed/broken queries or non-existent tables
 *   DISABLED        — explicitly disabled, hidden from UI
 *
 * ACTIVATION RULES:
 *   WIRED_WITH_DATA                   → Active (full render)
 *   WIRED_LLM                         → Active (full render)
 *   WIRED_NO_DATA + allowEmptyState   → Active (empty state UI)
 *   WIRED_NO_DATA + !allowEmptyState  → Hidden
 *   UNWIRED                           → Hidden
 *   INVALID                           → Hidden + console warning
 *   DISABLED                          → Hidden
 */

export type PanelViability =
  | "WIRED_WITH_DATA"
  | "WIRED_LLM"
  | "WIRED_NO_DATA"
  | "UNWIRED"
  | "INVALID"
  | "DISABLED";

export type PanelLayer = "REGISTRY" | "ALPHA_LAKE" | "PROJECTION" | "LLM" | "UNKNOWN";

export type PanelSubsystem =
  | "legal"
  | "benefits"
  | "civic_map"
  | "case"
  | "enforcement"
  | "campaign_reform"
  | "mission_control"
  | "knowledge"
  | "signal_ingestion"
  | "stream"
  | "advanced_engine"
  | "conduit";

export interface PanelConfig {
  key: string;
  label: string;
  enabled: boolean;
  viability: PanelViability;
  layer: PanelLayer;
  subsystem: PanelSubsystem;
  dataSource: string;
  canonicalTables: string[];
  requiresData: boolean;
  allowEmptyState: boolean;
  category: "core" | "data" | "engine" | "analysis" | "stream" | "advanced" | "conduit";
}

export const PANEL_REGISTRY: Record<string, PanelConfig> = {
  // ═══════════════════════════════════════════════════════════════
  // CORE PANELS — Always enabled, foundational system views
  // ═══════════════════════════════════════════════════════════════
  operations: {
    key: "operations",
    label: "Operations",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "mission_control",
    dataSource: "trpc.operationalWorkflow",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "core",
  },
  registry: {
    key: "registry",
    label: "Registry",
    enabled: true,
    viability: "WIRED_WITH_DATA",
    layer: "REGISTRY",
    subsystem: "mission_control",
    dataSource: "trpc.registry.stats",
    canonicalTables: [
      "registry_programs",
      "registry_oversight_bodies",
      "registry_jurisdictions",
      "registry_workflows",
      "registry_signals",
      "registry_source_traceability",
    ],
    requiresData: false,
    allowEmptyState: true,
    category: "core",
  },
  ingestion: {
    key: "ingestion",
    label: "Live Data",
    enabled: true,
    viability: "WIRED_WITH_DATA",
    layer: "REGISTRY",
    subsystem: "signal_ingestion",
    dataSource: "trpc.ingestion.stats",
    canonicalTables: ["live_signals", "ingest_runs", "ingested_records"],
    requiresData: false,
    allowEmptyState: true,
    category: "core",
  },
  "kb-explorer": {
    key: "kb-explorer",
    label: "KB Explorer",
    enabled: true,
    viability: "WIRED_WITH_DATA",
    layer: "REGISTRY",
    subsystem: "knowledge",
    dataSource: "trpc.knowledgeIngestion.stats",
    canonicalTables: ["knowledge_entries", "knowledge_modules", "knowledge_cross_refs"],
    requiresData: false,
    allowEmptyState: true,
    category: "data",
  },

  // ═══════════════════════════════════════════════════════════════
  // DATA PANELS — Backed by canonical tables with real data
  // ═══════════════════════════════════════════════════════════════
  governance: {
    key: "governance",
    label: "Signal Governance",
    enabled: true,
    viability: "WIRED_WITH_DATA",
    layer: "REGISTRY",
    subsystem: "signal_ingestion",
    dataSource: "trpc.signalGovernance.dashboard",
    canonicalTables: ["signal_flags", "signal_registry", "registry_signals"],
    requiresData: false,
    allowEmptyState: true,
    category: "data",
  },

  // ═══════════════════════════════════════════════════════════════
  // ENGINE PANELS — LLM-backed, always functional
  // ═══════════════════════════════════════════════════════════════
  "procedural-paths": {
    key: "procedural-paths",
    label: "Procedural Paths",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "legal",
    dataSource: "trpc.proceduralEngine.dashboard",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "engine",
  },
  "evidence-lab": {
    key: "evidence-lab",
    label: "Evidence Lab",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "case",
    dataSource: "trpc.evidenceConfidence.dashboard",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "engine",
  },
  "claim-validation": {
    key: "claim-validation",
    label: "Claim Validation",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "legal",
    dataSource: "trpc.claimValidation",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "engine",
  },
  "remedy-feasibility": {
    key: "remedy-feasibility",
    label: "Remedy Feasibility",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "legal",
    dataSource: "trpc.remedyFeasibility.dashboard",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "engine",
  },
  "remedy-templates": {
    key: "remedy-templates",
    label: "Outcomes",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "legal",
    dataSource: "trpc.remedyTemplate.dashboard",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "engine",
  },
  "knowledge-health": {
    key: "knowledge-health",
    label: "Knowledge Health",
    enabled: true,
    viability: "WIRED_NO_DATA",
    layer: "REGISTRY",
    subsystem: "knowledge",
    dataSource: "trpc.knowledgeHealth.coverageMetrics",
    canonicalTables: ["knowledge_coverage_metrics", "knowledge_freshness"],
    requiresData: false,
    allowEmptyState: true,
    category: "data",
  },
  "hardening-pipeline": {
    key: "hardening-pipeline",
    label: "Hardening Pipeline",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "mission_control",
    dataSource: "trpc.systemHardeningPipeline.dashboard",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "engine",
  },

  // ═══════════════════════════════════════════════════════════════
  // STREAM PANELS — LLM-backed intelligence streams
  // ═══════════════════════════════════════════════════════════════
  lobbying: {
    key: "lobbying",
    label: "Lobbying",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "stream",
    dataSource: "trpc.streams.lobbyingStats",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "stream",
  },
  litigation: {
    key: "litigation",
    label: "Litigation",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "stream",
    dataSource: "trpc.streams.litigationStats",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "stream",
  },
  "admin-decisions": {
    key: "admin-decisions",
    label: "Admin Decisions",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "stream",
    dataSource: "trpc.streams.adminDecisionsStats",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "stream",
  },
  "verified-reports": {
    key: "verified-reports",
    label: "Verified Reports",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "stream",
    dataSource: "trpc.streams.verifiedReportStats",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "stream",
  },
  advocacy: {
    key: "advocacy",
    label: "Advocacy",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "stream",
    dataSource: "trpc.streams.advocacyStats",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "stream",
  },
  "cross-stream": {
    key: "cross-stream",
    label: "Cross-Stream",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "stream",
    dataSource: "trpc.streams.correlationStats",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "stream",
  },
  "front-door": {
    key: "front-door",
    label: "Front Door",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "stream",
    dataSource: "trpc.operationalWorkflow",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "stream",
  },

  // ═══════════════════════════════════════════════════════════════
  // ADVANCED ENGINE PANELS — LLM-backed, always functional
  // ═══════════════════════════════════════════════════════════════
  "time-travel": {
    key: "time-travel",
    label: "Time Travel",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "advanced_engine",
    dataSource: "trpc.timeTravel.getStats",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "advanced",
  },
  "entity-intel": {
    key: "entity-intel",
    label: "Entity Intel",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "advanced_engine",
    dataSource: "trpc.enginesV2.entityStats",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "advanced",
  },
  institutions: {
    key: "institutions",
    label: "Institutions",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "advanced_engine",
    dataSource: "trpc.enginesV2.institutionStats",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "advanced",
  },
  "reg-capture": {
    key: "reg-capture",
    label: "Reg Capture",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "advanced_engine",
    dataSource: "trpc.enginesV2.captureStats",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "advanced",
  },
  "crisis-predict": {
    key: "crisis-predict",
    label: "Crisis Predict",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "advanced_engine",
    dataSource: "trpc.enginesV2.crisisStats",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "advanced",
  },
  "simulation-lab": {
    key: "simulation-lab",
    label: "Simulation Lab",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "advanced_engine",
    dataSource: "trpc.enginesV3.simulationStats",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "advanced",
  },
  transparency: {
    key: "transparency",
    label: "Transparency",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "advanced_engine",
    dataSource: "trpc.enginesV3.transparencyStats",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "advanced",
  },
  "dossier-studio": {
    key: "dossier-studio",
    label: "Dossier Studio",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "advanced_engine",
    dataSource: "trpc.enginesV3.dossierStats",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "advanced",
  },
  "ext-collab": {
    key: "ext-collab",
    label: "Ext Collab",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "advanced_engine",
    dataSource: "trpc.enginesV3.collaborationStats",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "advanced",
  },
  "entity-transparency": {
    key: "entity-transparency",
    label: "Entity Transparency",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "advanced_engine",
    dataSource: "trpc.enginesV4.entityTransparencyStats",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "advanced",
  },
  "evidence-threshold": {
    key: "evidence-threshold",
    label: "Evidence Threshold",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "advanced_engine",
    dataSource: "trpc.enginesV4.evidenceThresholdStats",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "advanced",
  },
  alerting: {
    key: "alerting",
    label: "Alerting",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "advanced_engine",
    dataSource: "trpc.enginesV4.alertingStats",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "advanced",
  },
  "system-map": {
    key: "system-map",
    label: "System Map",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "advanced_engine",
    dataSource: "trpc.enginesV4.mapStats",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "advanced",
  },
  "failure-predict": {
    key: "failure-predict",
    label: "Failure Predict",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "advanced_engine",
    dataSource: "trpc.enginesV4.failurePredictionStats",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "advanced",
  },
  "investigative-query": {
    key: "investigative-query",
    label: "Investigative Query",
    enabled: true,
    viability: "WIRED_WITH_DATA",
    layer: "PROJECTION",
    subsystem: "advanced_engine",
    dataSource: "trpc.enginesV4.investigativeQueryStats",
    canonicalTables: ["investigative_queries"],
    requiresData: false,
    allowEmptyState: true,
    category: "advanced",
  },

  // ═══════════════════════════════════════════════════════════════
  // CONDUIT PANELS — Metadata system health
  // ═══════════════════════════════════════════════════════════════
  "metadata-health": {
    key: "metadata-health",
    label: "Metadata Health",
    enabled: true,
    viability: "WIRED_WITH_DATA",
    layer: "REGISTRY",
    subsystem: "conduit",
    dataSource: "trpc.conduit.metadataHealth",
    canonicalTables: ["table_registry"],
    requiresData: true,
    allowEmptyState: false,
    category: "conduit",
  },
  "pipeline-integrity": {
    key: "pipeline-integrity",
    label: "Pipeline Integrity",
    enabled: true,
    viability: "WIRED_WITH_DATA",
    layer: "REGISTRY",
    subsystem: "conduit",
    dataSource: "trpc.conduit.pipelineIntegrity",
    canonicalTables: ["pipeline_events"],
    requiresData: true,
    allowEmptyState: false,
    category: "conduit",
  },
  "export-readiness": {
    key: "export-readiness",
    label: "Export Readiness",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "ALPHA_LAKE",
    subsystem: "conduit",
    dataSource: "trpc.conduit.exportReadiness",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "conduit",
  },

  // ═══════════════════════════════════════════════════════════════
  // DISABLED PANELS — No backing data or queries yet
  // ═══════════════════════════════════════════════════════════════
  patterns: {
    key: "patterns",
    label: "Pattern Registry",
    enabled: false,
    viability: "DISABLED",
    layer: "REGISTRY",
    subsystem: "mission_control",
    dataSource: "patterns",
    canonicalTables: ["patterns"],
    requiresData: true,
    allowEmptyState: false,
    category: "engine",
  },
  trends: {
    key: "trends",
    label: "Trends & Pressure",
    enabled: false,
    viability: "DISABLED",
    layer: "REGISTRY",
    subsystem: "mission_control",
    dataSource: "trend_snapshots",
    canonicalTables: ["trend_snapshots"],
    requiresData: true,
    allowEmptyState: false,
    category: "engine",
  },
  "strategy-paths": {
    key: "strategy-paths",
    label: "Strategy Paths",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "mission_control",
    dataSource: "strategy_outputs",
    canonicalTables: ["strategy_outputs", "strategy_matter_profile"],
    requiresData: false,
    allowEmptyState: true,
    category: "engine",
  },
  outcomes: {
    key: "outcomes",
    label: "Outcomes",
    enabled: false,
    viability: "DISABLED",
    layer: "REGISTRY",
    subsystem: "mission_control",
    dataSource: "outcome_registry",
    canonicalTables: ["outcome_registry"],
    requiresData: true,
    allowEmptyState: false,
    category: "engine",
  },
  interventions: {
    key: "interventions",
    label: "Interventions",
    enabled: false,
    viability: "DISABLED",
    layer: "REGISTRY",
    subsystem: "campaign_reform",
    dataSource: "intervention_endpoints",
    canonicalTables: ["intervention_endpoints", "intervention_network_nodes"],
    requiresData: true,
    allowEmptyState: false,
    category: "engine",
  },
  policy: {
    key: "policy",
    label: "Policy",
    enabled: false,
    viability: "DISABLED",
    layer: "REGISTRY",
    subsystem: "campaign_reform",
    dataSource: "policy_events",
    canonicalTables: ["policy_events", "policy_impact_events"],
    requiresData: true,
    allowEmptyState: false,
    category: "engine",
  },
  "memory-strategy": {
    key: "memory-strategy",
    label: "Memory Strategy",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "mission_control",
    dataSource: "canonical_strategy_memory",
    canonicalTables: ["canonical_strategy_memory"],
    requiresData: false,
    allowEmptyState: true,
    category: "engine",
  },
  "reform-proposals": {
    key: "reform-proposals",
    label: "Reform Proposals",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "campaign_reform",
    dataSource: "canonical_reform_packages",
    canonicalTables: ["canonical_reform_packages"],
    requiresData: false,
    allowEmptyState: true,
    category: "engine",
  },
  coalitions: {
    key: "coalitions",
    label: "Coalitions",
    enabled: false,
    viability: "DISABLED",
    layer: "REGISTRY",
    subsystem: "campaign_reform",
    dataSource: "canonical_coalition_legislators",
    canonicalTables: ["canonical_coalition_legislators"],
    requiresData: true,
    allowEmptyState: false,
    category: "engine",
  },
  "coalition-intel": {
    key: "coalition-intel",
    label: "Coalition Intel",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "campaign_reform",
    dataSource: "canonical_coalition_agencies",
    canonicalTables: ["canonical_coalition_agencies"],
    requiresData: false,
    allowEmptyState: true,
    category: "engine",
  },
  "campaign-engine": {
    key: "campaign-engine",
    label: "Campaign Engine",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "campaign_reform",
    dataSource: "campaign_engine_runs",
    canonicalTables: ["campaign_engine_runs"],
    requiresData: false,
    allowEmptyState: true,
    category: "engine",
  },
  "gap-analysis": {
    key: "gap-analysis",
    label: "Gap Analysis",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "mission_control",
    dataSource: "none",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "engine",
  },
  "harm-index": {
    key: "harm-index",
    label: "Harm Index",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "mission_control",
    dataSource: "none",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "engine",
  },
  "risk-forecast": {
    key: "risk-forecast",
    label: "Risk Forecast",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "mission_control",
    dataSource: "none",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "engine",
  },
  flags: {
    key: "flags",
    label: "Flag Queue",
    enabled: true,
    viability: "WIRED_WITH_DATA",
    layer: "REGISTRY",
    subsystem: "signal_ingestion",
    dataSource: "trpc.signalGovernance.flags",
    canonicalTables: ["signal_flags"],
    requiresData: false,
    allowEmptyState: true,
    category: "data",
  },
  "harm-map": {
    key: "harm-map",
    label: "Harm Map",
    enabled: true,
    viability: "WIRED_LLM",
    layer: "LLM",
    subsystem: "mission_control",
    dataSource: "none",
    canonicalTables: [],
    requiresData: false,
    allowEmptyState: true,
    category: "engine",
  },
};

// ═══════════════════════════════════════════════════════════════
// QUERY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/** Get all enabled panel keys */
export function getEnabledPanels(): string[] {
  return Object.values(PANEL_REGISTRY)
    .filter((p) => p.enabled)
    .map((p) => p.key);
}

/** Get all disabled panel keys */
export function getDisabledPanels(): string[] {
  return Object.values(PANEL_REGISTRY)
    .filter((p) => !p.enabled)
    .map((p) => p.key);
}

/** Check if a panel is enabled */
export function isPanelEnabled(key: string): boolean {
  return PANEL_REGISTRY[key]?.enabled ?? false;
}

/** Get panel config by key */
export function getPanelConfig(key: string): PanelConfig | undefined {
  return PANEL_REGISTRY[key];
}

/** Get panels by viability status */
export function getPanelsByViability(viability: PanelViability): PanelConfig[] {
  return Object.values(PANEL_REGISTRY).filter((p) => p.viability === viability);
}

/** Get panels by subsystem */
export function getPanelsBySubsystem(subsystem: PanelSubsystem): PanelConfig[] {
  return Object.values(PANEL_REGISTRY).filter((p) => p.subsystem === subsystem);
}

/** Get panels by layer */
export function getPanelsByLayer(layer: PanelLayer): PanelConfig[] {
  return Object.values(PANEL_REGISTRY).filter((p) => p.layer === layer);
}

/**
 * Determine if a panel should be rendered based on activation rules.
 * This is the SINGLE gate function for all panel rendering decisions.
 */
export function shouldRenderPanel(key: string): boolean {
  const config = PANEL_REGISTRY[key];
  if (!config) {
    console.warn(`[PanelRegistry] Unknown panel key: "${key}"`);
    return false;
  }

  // DISABLED panels are always hidden
  if (!config.enabled) return false;

  // INVALID panels are blocked with a warning
  if (config.viability === "INVALID") {
    console.warn(`[PanelRegistry] INVALID panel blocked: "${key}" — data source is broken`);
    return false;
  }

  // UNWIRED panels are hidden
  if (config.viability === "UNWIRED") return false;

  // WIRED_WITH_DATA and WIRED_LLM are always active
  if (config.viability === "WIRED_WITH_DATA" || config.viability === "WIRED_LLM") return true;

  // WIRED_NO_DATA: depends on allowEmptyState
  if (config.viability === "WIRED_NO_DATA") {
    return config.allowEmptyState;
  }

  return false;
}

// ═══════════════════════════════════════════════════════════════
// SUMMARY STATS (for debug overlay)
// ═══════════════════════════════════════════════════════════════

export function getPanelSummary() {
  const all = Object.values(PANEL_REGISTRY);
  return {
    total: all.length,
    enabled: all.filter((p) => p.enabled).length,
    disabled: all.filter((p) => !p.enabled).length,
    wiredWithData: all.filter((p) => p.viability === "WIRED_WITH_DATA").length,
    wiredLLM: all.filter((p) => p.viability === "WIRED_LLM").length,
    wiredNoData: all.filter((p) => p.viability === "WIRED_NO_DATA").length,
    unwired: all.filter((p) => p.viability === "UNWIRED").length,
    invalid: all.filter((p) => p.viability === "INVALID").length,
    bySubsystem: Object.fromEntries(
      [...new Set(all.map((p) => p.subsystem))].map((s) => [
        s,
        all.filter((p) => p.subsystem === s).length,
      ])
    ),
    byLayer: Object.fromEntries(
      [...new Set(all.map((p) => p.layer))].map((l) => [
        l,
        all.filter((p) => p.layer === l).length,
      ])
    ),
  };
}

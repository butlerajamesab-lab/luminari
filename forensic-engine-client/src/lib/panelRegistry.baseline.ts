/**
 * PANEL REGISTRY — Mission Control Panel Activation System
 *
 * Only panels with enabled=true AND a live data source are rendered.
 * Panels with enabled=false are hidden from the UI entirely.
 *
 * dataSource: the canonical table or tRPC endpoint backing this panel
 * requiresData: if true, panel is hidden when data count = 0
 * allowEmptyState: if true, panel renders even with 0 records (e.g., ingestion)
 */

export interface PanelConfig {
  key: string;
  label: string;
  enabled: boolean;
  dataSource: string;
  requiresData: boolean;
  allowEmptyState: boolean;
  category: "core" | "data" | "engine" | "analysis" | "stream" | "advanced" | "conduit";
}

export const PANEL_REGISTRY: Record<string, PanelConfig> = {
  // ── CORE (always enabled) ──
  operations: {
    key: "operations",
    label: "Operations",
    enabled: true,
    dataSource: "engine_registry",
    requiresData: false,
    allowEmptyState: true,
    category: "core",
  },
  registry: {
    key: "registry",
    label: "Registry",
    enabled: true,
    dataSource: "legal_statutes",
    requiresData: false,
    allowEmptyState: true,
    category: "core",
  },
  ingestion: {
    key: "ingestion",
    label: "Live Data",
    enabled: true,
    dataSource: "live_signals",
    requiresData: false,
    allowEmptyState: true,
    category: "core",
  },
  "kb-explorer": {
    key: "kb-explorer",
    label: "KB Explorer",
    enabled: true,
    dataSource: "legal_statutes",
    requiresData: false,
    allowEmptyState: true,
    category: "data",
  },

  // ── DATA PANELS (enabled if backing table has data) ──
  governance: {
    key: "governance",
    label: "Signal Governance",
    enabled: true,
    dataSource: "trpc.signalGovernance.dashboard",
    requiresData: false,
    allowEmptyState: true,
    category: "data",
  },
  "procedural-paths": {
    key: "procedural-paths",
    label: "Procedural Paths",
    enabled: true,
    dataSource: "procedural_outputs",
    requiresData: true,
    allowEmptyState: false,
    category: "engine",
  },
  "evidence-lab": {
    key: "evidence-lab",
    label: "Evidence Lab",
    enabled: true,
    dataSource: "trpc.evidenceConfidence.dashboard",
    requiresData: false,
    allowEmptyState: true,
    category: "engine",
  },
  "claim-validation": {
    key: "claim-validation",
    label: "Claim Validation",
    enabled: true,
    dataSource: "trpc.claimValidation",
    requiresData: false,
    allowEmptyState: true,
    category: "engine",
  },
  "remedy-feasibility": {
    key: "remedy-feasibility",
    label: "Remedy Feasibility",
    enabled: true,
    dataSource: "trpc.remedyFeasibility.dashboard",
    requiresData: false,
    allowEmptyState: true,
    category: "engine",
  },
  "remedy-templates": {
    key: "remedy-templates",
    label: "Outcomes",
    enabled: true,
    dataSource: "trpc.remedyTemplate.dashboard",
    requiresData: false,
    allowEmptyState: true,
    category: "engine",
  },
  "knowledge-health": {
    key: "knowledge-health",
    label: "Knowledge Health",
    enabled: true,
    dataSource: "trpc.knowledgeHealth.coverageMetrics",
    requiresData: false,
    allowEmptyState: true,
    category: "data",
  },
  "hardening-pipeline": {
    key: "hardening-pipeline",
    label: "Hardening Pipeline",
    enabled: true,
    dataSource: "trpc.systemHardeningPipeline.dashboard",
    requiresData: false,
    allowEmptyState: true,
    category: "engine",
  },

  // ── STREAM PANELS (LLM-backed, always functional) ──
  lobbying: {
    key: "lobbying",
    label: "Lobbying",
    enabled: true,
    dataSource: "trpc.streams.lobbyingStats",
    requiresData: false,
    allowEmptyState: true,
    category: "stream",
  },
  litigation: {
    key: "litigation",
    label: "Litigation",
    enabled: true,
    dataSource: "trpc.streams.litigationStats",
    requiresData: false,
    allowEmptyState: true,
    category: "stream",
  },
  "admin-decisions": {
    key: "admin-decisions",
    label: "Admin Decisions",
    enabled: true,
    dataSource: "trpc.streams.adminDecisionsStats",
    requiresData: false,
    allowEmptyState: true,
    category: "stream",
  },
  "verified-reports": {
    key: "verified-reports",
    label: "Verified Reports",
    enabled: true,
    dataSource: "trpc.streams.verifiedReportStats",
    requiresData: false,
    allowEmptyState: true,
    category: "stream",
  },
  advocacy: {
    key: "advocacy",
    label: "Advocacy",
    enabled: true,
    dataSource: "trpc.streams.advocacyStats",
    requiresData: false,
    allowEmptyState: true,
    category: "stream",
  },
  "cross-stream": {
    key: "cross-stream",
    label: "Cross-Stream",
    enabled: true,
    dataSource: "trpc.streams.correlationStats",
    requiresData: false,
    allowEmptyState: true,
    category: "stream",
  },
  "front-door": {
    key: "front-door",
    label: "Front Door",
    enabled: true,
    dataSource: "trpc.operationalWorkflow",
    requiresData: false,
    allowEmptyState: true,
    category: "stream",
  },

  // ── ADVANCED PANELS (LLM-backed engines, always functional) ──
  "time-travel": {
    key: "time-travel",
    label: "Time Travel",
    enabled: true,
    dataSource: "trpc.timeTravel.getStats",
    requiresData: false,
    allowEmptyState: true,
    category: "advanced",
  },
  "entity-intel": {
    key: "entity-intel",
    label: "Entity Intel",
    enabled: true,
    dataSource: "trpc.enginesV2.entityStats",
    requiresData: false,
    allowEmptyState: true,
    category: "advanced",
  },
  institutions: {
    key: "institutions",
    label: "Institutions",
    enabled: true,
    dataSource: "trpc.enginesV2.institutionStats",
    requiresData: false,
    allowEmptyState: true,
    category: "advanced",
  },
  "reg-capture": {
    key: "reg-capture",
    label: "Reg Capture",
    enabled: true,
    dataSource: "trpc.enginesV2.captureStats",
    requiresData: false,
    allowEmptyState: true,
    category: "advanced",
  },
  "crisis-predict": {
    key: "crisis-predict",
    label: "Crisis Predict",
    enabled: true,
    dataSource: "trpc.enginesV2.crisisStats",
    requiresData: false,
    allowEmptyState: true,
    category: "advanced",
  },
  "simulation-lab": {
    key: "simulation-lab",
    label: "Simulation Lab",
    enabled: true,
    dataSource: "trpc.enginesV3.simulationStats",
    requiresData: false,
    allowEmptyState: true,
    category: "advanced",
  },
  transparency: {
    key: "transparency",
    label: "Transparency",
    enabled: true,
    dataSource: "trpc.enginesV3.transparencyStats",
    requiresData: false,
    allowEmptyState: true,
    category: "advanced",
  },
  "dossier-studio": {
    key: "dossier-studio",
    label: "Dossier Studio",
    enabled: true,
    dataSource: "trpc.enginesV3.dossierStats",
    requiresData: false,
    allowEmptyState: true,
    category: "advanced",
  },
  "ext-collab": {
    key: "ext-collab",
    label: "Ext Collab",
    enabled: true,
    dataSource: "trpc.enginesV3.collaborationStats",
    requiresData: false,
    allowEmptyState: true,
    category: "advanced",
  },
  "entity-transparency": {
    key: "entity-transparency",
    label: "Entity Transparency",
    enabled: true,
    dataSource: "trpc.enginesV4.entityTransparencyStats",
    requiresData: false,
    allowEmptyState: true,
    category: "advanced",
  },
  "evidence-threshold": {
    key: "evidence-threshold",
    label: "Evidence Threshold",
    enabled: true,
    dataSource: "trpc.enginesV4.evidenceThresholdStats",
    requiresData: false,
    allowEmptyState: true,
    category: "advanced",
  },
  alerting: {
    key: "alerting",
    label: "Alerting",
    enabled: true,
    dataSource: "trpc.enginesV4.alertingStats",
    requiresData: false,
    allowEmptyState: true,
    category: "advanced",
  },
  "system-map": {
    key: "system-map",
    label: "System Map",
    enabled: true,
    dataSource: "trpc.enginesV4.mapStats",
    requiresData: false,
    allowEmptyState: true,
    category: "advanced",
  },
  "failure-predict": {
    key: "failure-predict",
    label: "Failure Predict",
    enabled: true,
    dataSource: "trpc.enginesV4.failurePredictionStats",
    requiresData: false,
    allowEmptyState: true,
    category: "advanced",
  },
  "investigative-query": {
    key: "investigative-query",
    label: "Investigative Query",
    enabled: true,
    dataSource: "trpc.enginesV4.investigativeQueryStats",
    requiresData: false,
    allowEmptyState: true,
    category: "advanced",
  },

  // ── CONDUIT PANELS (metadata system) ──
  "metadata-health": {
    key: "metadata-health",
    label: "Metadata Health",
    enabled: true,
    dataSource: "table_registry",
    requiresData: true,
    allowEmptyState: false,
    category: "conduit",
  },
  "pipeline-integrity": {
    key: "pipeline-integrity",
    label: "Pipeline Integrity",
    enabled: true,
    dataSource: "engine_runs",
    requiresData: true,
    allowEmptyState: false,
    category: "conduit",
  },
  "export-readiness": {
    key: "export-readiness",
    label: "Export Readiness",
    enabled: true,
    dataSource: "alpha_lake_exports",
    requiresData: false,
    allowEmptyState: true,
    category: "conduit",
  },

  // ── DISABLED PANELS (no backing data, "Coming Soon" placeholders) ──
  patterns: {
    key: "patterns",
    label: "Pattern Registry",
    enabled: false,
    dataSource: "none",
    requiresData: true,
    allowEmptyState: false,
    category: "engine",
  },
  trends: {
    key: "trends",
    label: "Trends & Pressure",
    enabled: false,
    dataSource: "trend_snapshots",
    requiresData: true,
    allowEmptyState: false,
    category: "engine",
  },
  "strategy-paths": {
    key: "strategy-paths",
    label: "Strategy Paths",
    enabled: false,
    dataSource: "strategy_matter_profile",
    requiresData: true,
    allowEmptyState: false,
    category: "engine",
  },
  outcomes: {
    key: "outcomes",
    label: "Outcomes",
    enabled: false,
    dataSource: "outcome_engine_runs",
    requiresData: true,
    allowEmptyState: false,
    category: "engine",
  },
  interventions: {
    key: "interventions",
    label: "Interventions",
    enabled: false,
    dataSource: "intervention_network_nodes",
    requiresData: true,
    allowEmptyState: false,
    category: "engine",
  },
  policy: {
    key: "policy",
    label: "Policy",
    enabled: false,
    dataSource: "policy_impact_events",
    requiresData: true,
    allowEmptyState: false,
    category: "engine",
  },
  "memory-strategy": {
    key: "memory-strategy",
    label: "Memory Strategy",
    enabled: false,
    dataSource: "canonical_strategy_memory",
    requiresData: true,
    allowEmptyState: false,
    category: "engine",
  },
  "reform-proposals": {
    key: "reform-proposals",
    label: "Reform Proposals",
    enabled: false,
    dataSource: "canonical_reform_packages",
    requiresData: true,
    allowEmptyState: false,
    category: "engine",
  },
  coalitions: {
    key: "coalitions",
    label: "Coalitions",
    enabled: false,
    dataSource: "canonical_coalition_legislators",
    requiresData: true,
    allowEmptyState: false,
    category: "engine",
  },
  "coalition-intel": {
    key: "coalition-intel",
    label: "Coalition Intel",
    enabled: false,
    dataSource: "canonical_coalition_agencies",
    requiresData: true,
    allowEmptyState: false,
    category: "engine",
  },
  "campaign-engine": {
    key: "campaign-engine",
    label: "Campaign Engine",
    enabled: false,
    dataSource: "campaign_engine_runs",
    requiresData: true,
    allowEmptyState: false,
    category: "engine",
  },
  "gap-analysis": {
    key: "gap-analysis",
    label: "Gap Analysis",
    enabled: false,
    dataSource: "none",
    requiresData: true,
    allowEmptyState: false,
    category: "engine",
  },
  "harm-index": {
    key: "harm-index",
    label: "Harm Index",
    enabled: false,
    dataSource: "none",
    requiresData: true,
    allowEmptyState: false,
    category: "engine",
  },
  "risk-forecast": {
    key: "risk-forecast",
    label: "Risk Forecast",
    enabled: false,
    dataSource: "none",
    requiresData: true,
    allowEmptyState: false,
    category: "engine",
  },
  "harm-map": {
    key: "harm-map",
    label: "Harm Map",
    enabled: false,
    dataSource: "none",
    requiresData: true,
    allowEmptyState: false,
    category: "engine",
  },
};

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

import { trpc } from "@/lib/trpc";

const HOT_PATH_QUERY_OPTIONS = {
  staleTime: 60_000,
  refetchOnWindowFocus: false,
  retry: false,
} as const;

const DEFERRED_ARRAY_QUERY_OPTIONS = {
  ...HOT_PATH_QUERY_OPTIONS,
  enabled: false,
  placeholderData: [] as unknown[],
} as const;

const DEFERRED_OBJECT_QUERY_OPTIONS = {
  ...HOT_PATH_QUERY_OPTIONS,
  enabled: false,
  placeholderData: null,
} as const;

export function useMissionControlData() {
  // System Health & Operations — keep only the top-level boot panels hot.
  const systemHealth = trpc.adminDashboard.systemHealth.useQuery(undefined, HOT_PATH_QUERY_OPTIONS);
  const knowledgePopulation = trpc.knowledgeIngestion.populationStats.useQuery(undefined, HOT_PATH_QUERY_OPTIONS);
  const caseActivity = trpc.adminDashboard.caseActivity.useQuery(undefined, HOT_PATH_QUERY_OPTIONS);
  const structuralSignals = trpc.adminDashboard.structuralSignals.useQuery(undefined, HOT_PATH_QUERY_OPTIONS);
  const workQueue = trpc.adminDashboard.workQueue.useQuery(undefined, HOT_PATH_QUERY_OPTIONS);
  const sunamStatus = trpc.sunam.getStatus.useQuery(undefined, HOT_PATH_QUERY_OPTIONS);

  // Ingestion & Datasets — non-critical lists are deferred to avoid startup DB stampede.
  const datasets = trpc.ingestion.listDatasets.useQuery(undefined, DEFERRED_ARRAY_QUERY_OPTIONS as any);
  const runs = trpc.ingestion.listRuns.useQuery(undefined, DEFERRED_ARRAY_QUERY_OPTIONS as any);
  const schedulerStatus = trpc.s76.execution.getSchedulerStatus.useQuery(undefined, DEFERRED_OBJECT_QUERY_OPTIONS as any);
  const seedMutation = trpc.ingestion.seedDefaultDatasets.useMutation();
  const triggerMutation = trpc.ingestion.triggerIngestion.useMutation();
  const toggleMutation = trpc.ingestion.toggleDataset.useMutation();

  // Knowledge Ingestion Browse — deferred; these were firing multiple large browse reads on first paint.
  const jurisdictions = trpc.knowledgeIngestion.getJurisdictions.useQuery(undefined, DEFERRED_ARRAY_QUERY_OPTIONS as any);
  const domains = trpc.knowledgeIngestion.getDomains.useQuery(undefined, DEFERRED_ARRAY_QUERY_OPTIONS as any);
  const statutes = trpc.knowledgeIngestion.browseStatutes.useQuery({}, DEFERRED_OBJECT_QUERY_OPTIONS as any);
  const caseLaw = trpc.knowledgeIngestion.browseCaseLaw.useQuery({}, DEFERRED_OBJECT_QUERY_OPTIONS as any);
  const agencies = trpc.knowledgeIngestion.browseAgencies.useQuery({}, DEFERRED_OBJECT_QUERY_OPTIONS as any);
  const courts = trpc.knowledgeIngestion.browseCourts.useQuery({}, DEFERRED_OBJECT_QUERY_OPTIONS as any);
  const targets = trpc.knowledgeIngestion.browseAdvocacyTargets.useQuery({}, DEFERRED_OBJECT_QUERY_OPTIONS as any);
  const formulas = trpc.knowledgeIngestion.browseSettlementFormulas.useQuery({}, DEFERRED_OBJECT_QUERY_OPTIONS as any);

  // Signal Governance
  const escalationSummary = trpc.signalGovernance.escalationSummary.useQuery({ limit: 20 }, HOT_PATH_QUERY_OPTIONS);
  const escalationThresholds = trpc.signalGovernance.escalationThresholds.useQuery(undefined, DEFERRED_ARRAY_QUERY_OPTIONS as any);
  const auditTrail = trpc.signalGovernance.auditTrail.useQuery({ limit: 50 }, DEFERRED_ARRAY_QUERY_OPTIONS as any);

  // Trend Engine
  const trendDashboard = trpc.trendEngine.dashboard.useQuery(undefined, DEFERRED_OBJECT_QUERY_OPTIONS as any);
  const alertRules = trpc.trendEngine.alertRules.useQuery(undefined, DEFERRED_ARRAY_QUERY_OPTIONS as any);
  const trendMissionSummary = trpc.trendEngine.missionControlSummary.useQuery(undefined, HOT_PATH_QUERY_OPTIONS);

  // Pattern Engine
  const entityClusters = trpc.patternEngine.getEntityClusters.useQuery(undefined, DEFERRED_ARRAY_QUERY_OPTIONS as any);
  const conductClusters = trpc.patternEngine.getConductClusters.useQuery(undefined, DEFERRED_ARRAY_QUERY_OPTIONS as any);
  const outcomeAnalytics = trpc.patternEngine.getOutcomeAnalytics.useQuery(undefined, DEFERRED_ARRAY_QUERY_OPTIONS as any);

  // Strategy Engine
  const strategyDashboard = trpc.systemicStrategy.dashboard.useQuery(undefined, DEFERRED_OBJECT_QUERY_OPTIONS as any);

  // Procedural Engine
  const proceduralJurisdictions = trpc.proceduralEngine.listJurisdictions.useQuery({}, DEFERRED_ARRAY_QUERY_OPTIONS as any);

  // Outcome Engine
  const outcomeDashboard = trpc.outcomeEngine.dashboard.useQuery(undefined, DEFERRED_OBJECT_QUERY_OPTIONS as any);
  const effectivenessReport = trpc.outcomeEngine.effectivenessReport.useQuery(undefined, DEFERRED_OBJECT_QUERY_OPTIONS as any);
  const outcomeMissionSummary = trpc.outcomeEngine.missionControlSummary.useQuery(undefined, HOT_PATH_QUERY_OPTIONS);

  // Intervention Network
  const interventionDashboard = trpc.interventionNetwork.dashboard.useQuery(undefined, DEFERRED_OBJECT_QUERY_OPTIONS as any);
  const interventionSummary = trpc.interventionNetwork.missionControlSummary.useQuery(undefined, HOT_PATH_QUERY_OPTIONS);

  // Policy Impact
  const policyDashboard = trpc.policyImpact.dashboard.useQuery(undefined, DEFERRED_OBJECT_QUERY_OPTIONS as any);

  // Remedy Template
  const remedyDashboard = trpc.remedyTemplate.dashboard.useQuery(undefined, DEFERRED_OBJECT_QUERY_OPTIONS as any);
  const remedyMissionSummary = trpc.remedyTemplate.missionControlSummary.useQuery(undefined, HOT_PATH_QUERY_OPTIONS);

  // Memory Overlay
  const memoryMetrics = trpc.memoryOverlay.missionControlMetrics.useQuery(undefined, HOT_PATH_QUERY_OPTIONS);

  // Reform Package
  const reformDashboard = trpc.reformPackage.dashboard.useQuery(undefined, DEFERRED_OBJECT_QUERY_OPTIONS as any);
  const generateMutation = trpc.reformPackage.generate.useMutation();
  const updateStatusMutation = trpc.reformPackage.updateStatus.useMutation();

  // Lighthouse
  const lighthouseSuggestions = trpc.lighthouse.suggestions.list.useQuery(undefined, DEFERRED_ARRAY_QUERY_OPTIONS as any);
  const lighthouseCategories = trpc.lighthouse.categories.list.useQuery(undefined, DEFERRED_ARRAY_QUERY_OPTIONS as any);

  // Cases
  const casesList = trpc.cases.list.useQuery(undefined, DEFERRED_ARRAY_QUERY_OPTIONS as any);

  // Upload Sessions
  const uploadSessionsActive = trpc.uploadSessions.getActive.useQuery(undefined, DEFERRED_ARRAY_QUERY_OPTIONS as any);

  // Benefits
  const benefitAppsList = trpc.benefitApps.list.useQuery({}, DEFERRED_ARRAY_QUERY_OPTIONS as any);

  // Documents, Entities, Findings (no caseId = admin view)
  const signalStats = trpc.signalExtraction.stats.useQuery({ caseId: undefined } as any, HOT_PATH_QUERY_OPTIONS as any);

  return {
    // System Health & Operations
    systemHealth,
    knowledgePopulation,
    caseActivity,
    structuralSignals,
    workQueue,
    sunamStatus,
    registryStats: knowledgePopulation, // alias

    // Ingestion & Datasets
    runStatus: runs,
    datasets,
    runs,
    signals: auditTrail,
    signalStats,
    schedulerStatus,
    seedMutation,
    triggerMutation,
    toggleMutation,

    // Knowledge Ingestion Browse
    jurisdictions,
    domains,
    statutes,
    caseLaw,
    agencies,
    courts,
    targets,
    formulas,

    // Signal Governance
    signalGovDashboard: escalationSummary,
    escalationSummary,
    escalationThresholds,
    auditTrail,

    // Trend Engine
    trendSummary: trendMissionSummary,
    trendDashboard,
    alertRules,
    updateAllMutation: { mutate: () => {}, isLoading: false },

    // Pattern Engine
    patternDashboard: entityClusters,
    patternSummary: conductClusters,
    patterns: outcomeAnalytics,

    // Strategy Engine
    strategyDashboard,
    strategySummary: strategyDashboard,
    strategies: strategyDashboard,

    // Procedural Engine
    proceduralDashboard: proceduralJurisdictions,
    proceduralSummary: proceduralJurisdictions,
    procedures: proceduralJurisdictions,

    // Viability Engine (no standalone dashboard — uses case-level procedures)
    viabilityDashboard: { data: null, isLoading: false, error: null },
    viabilitySummary: { data: null, isLoading: false, error: null },

    // Assembly Engine (no standalone dashboard — uses case-level procedures)
    assemblyDashboard: { data: null, isLoading: false, error: null },
    assemblySummary: { data: null, isLoading: false, error: null },

    // Campaign Engine (no standalone dashboard — uses case-level procedures)
    campaignDashboard: { data: null, isLoading: false, error: null },
    campaignSummary: { data: null, isLoading: false, error: null },

    // Outcome Engine
    outcomeDashboard,
    effectivenessReport,
    outcomeMissionSummary,

    // Operational Workflow
    feedbackLogs: auditTrail,
    triggerFeedbackMutation: { mutate: () => {}, isLoading: false },

    // Intervention Network
    interventionDashboard,
    interventionSummary,

    // Policy Impact
    policyDashboard,
    policyTimeline: policyDashboard,

    // Remedy Template
    remedyDashboard,
    remedyMissionSummary,
    remedyQueueStatus: remedyDashboard,
    settlementCalcDashboard: remedyDashboard,
    processQueueMutation: { mutate: () => {}, isLoading: false },

    // Memory Overlay
    memoryMetrics,

    // Reform Package
    reformDashboard,
    generateMutation,
    updateStatusMutation,
    regenerateMutation: updateStatusMutation,

    // Lighthouse
    lighthouseSuggestions,
    lighthouseCategories,

    // Cases
    casesList,
    casesStats: { data: null, isLoading: false, error: null },

    // Snapshots
    snapshotsLifecycle: { data: null, isLoading: false, error: null },

    // Upload Sessions
    uploadSessionsActive,

    // Benefits
    benefitsCategories: { data: [], isLoading: false, error: null },
    benefitsMatch: { data: null, isLoading: false, error: null },

    // Benefit Apps
    benefitAppsList,

    // Documents
    documentsList: { data: [], isLoading: false, error: null },

    // Entities
    entitiesList: { data: [], isLoading: false, error: null },

    // Findings
    findingsList: { data: [], isLoading: false, error: null },
  };
}

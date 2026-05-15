import { trpc } from "@/lib/trpc";

export function useMissionControlData() {
  // System Health & Operations
  const systemHealth = trpc.adminDashboard.systemHealth.useQuery();
  const knowledgePopulation = trpc.knowledgeIngestion.populationStats.useQuery();
  const caseActivity = trpc.adminDashboard.caseActivity.useQuery();
  const structuralSignals = trpc.adminDashboard.structuralSignals.useQuery();
  const workQueue = trpc.adminDashboard.workQueue.useQuery();
  const sunamStatus = trpc.sunam.getStatus.useQuery();

  // Ingestion & Datasets
  const datasets = trpc.ingestion.listDatasets.useQuery();
  const runs = trpc.ingestion.listRuns.useQuery();
  const schedulerStatus = trpc.s76.execution.getSchedulerStatus.useQuery();
  const seedMutation = trpc.ingestion.seedDefaultDatasets.useMutation();
  const triggerMutation = trpc.ingestion.triggerIngestion.useMutation();
  const toggleMutation = trpc.ingestion.toggleDataset.useMutation();

  // Knowledge Ingestion Browse
  const jurisdictions = trpc.knowledgeIngestion.getJurisdictions.useQuery();
  const domains = trpc.knowledgeIngestion.getDomains.useQuery();
  const statutes = trpc.knowledgeIngestion.browseStatutes.useQuery({});
  const caseLaw = trpc.knowledgeIngestion.browseCaseLaw.useQuery({});
  const agencies = trpc.knowledgeIngestion.browseAgencies.useQuery({});
  const courts = trpc.knowledgeIngestion.browseCourts.useQuery({});
  const targets = trpc.knowledgeIngestion.browseAdvocacyTargets.useQuery({});
  const formulas = trpc.knowledgeIngestion.browseSettlementFormulas.useQuery({});

  // Signal Governance
  const escalationSummary = trpc.signalGovernance.escalationSummary.useQuery({ limit: 20 });
  const escalationThresholds = trpc.signalGovernance.escalationThresholds.useQuery();
  const auditTrail = trpc.signalGovernance.auditTrail.useQuery({ limit: 50 });

  // Trend Engine
  const trendDashboard = trpc.trendEngine.dashboard.useQuery();
  const alertRules = trpc.trendEngine.alertRules.useQuery();
  const trendMissionSummary = trpc.trendEngine.missionControlSummary.useQuery();

  // Pattern Engine
  const entityClusters = trpc.patternEngine.getEntityClusters.useQuery();
  const conductClusters = trpc.patternEngine.getConductClusters.useQuery();
  const outcomeAnalytics = trpc.patternEngine.getOutcomeAnalytics.useQuery();

  // Strategy Engine
  const strategyDashboard = trpc.systemicStrategy.dashboard.useQuery();

  // Procedural Engine
  const proceduralJurisdictions = trpc.proceduralEngine.listJurisdictions.useQuery({});

  // Outcome Engine
  const outcomeDashboard = trpc.outcomeEngine.dashboard.useQuery();
  const effectivenessReport = trpc.outcomeEngine.effectivenessReport.useQuery();
  const outcomeMissionSummary = trpc.outcomeEngine.missionControlSummary.useQuery();

  // Intervention Network
  const interventionDashboard = trpc.interventionNetwork.dashboard.useQuery();
  const interventionSummary = trpc.interventionNetwork.missionControlSummary.useQuery();

  // Policy Impact
  const policyDashboard = trpc.policyImpact.dashboard.useQuery();

  // Remedy Template
  const remedyDashboard = trpc.remedyTemplate.dashboard.useQuery();
  const remedyMissionSummary = trpc.remedyTemplate.missionControlSummary.useQuery();

  // Memory Overlay
  const memoryMetrics = trpc.memoryOverlay.missionControlMetrics.useQuery();

  // Reform Package
  const reformDashboard = trpc.reformPackage.dashboard.useQuery();
  const generateMutation = trpc.reformPackage.generate.useMutation();
  const updateStatusMutation = trpc.reformPackage.updateStatus.useMutation();

  // Lighthouse
  const lighthouseSuggestions = trpc.lighthouse.suggestions.list.useQuery();
  const lighthouseCategories = trpc.lighthouse.categories.list.useQuery();

  // Cases
  const casesList = trpc.cases.list.useQuery();

  // Upload Sessions
  const uploadSessionsActive = trpc.uploadSessions.getActive.useQuery();

  // Benefits
  const benefitAppsList = trpc.benefitApps.list.useQuery({});

  // Documents, Entities, Findings (no caseId = admin view)
  const signalStats = trpc.signalExtraction.stats.useQuery({ caseId: undefined } as any);

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

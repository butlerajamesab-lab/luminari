export const frontendQueryCompatibilityRegistry = {
  architectureMap: {
    legacyQuery: 'trpc.architectureMap.getArchitectureOverview',
    runtimeRouter: 'architectureMapCompatRouter',
    status: 'compatibility_redirect_active',
  },
  missionControl: {
    legacyQuery: 'trpc.admin.getMissionControlMetrics',
    runtimeRouter: 'operationalCoreRuntimeRouter',
    status: 'runtime_reconciliation_pending',
  },
  governance: {
    legacyQuery: 'trpc.admin.getSystemHealth',
    runtimeRouter: 'activationAwareOperationalVisibilityRouter',
    status: 'runtime_reconciliation_pending',
  },
  legalLibrary: {
    legacyQuery: 'trpc.legalLibrary.*',
    runtimeRouter: 'operationalCoreRuntimeRouter',
    status: 'runtime_reconciliation_pending',
  },
  resourceDirectory: {
    legacyQuery: 'trpc.resources.*',
    runtimeRouter: 'resourceDirectoryRouter',
    status: 'canonical_directory_active',
  },
  guidedIntake: {
    legacyQuery: 'trpc.intake.*',
    runtimeRouter: 'operationalCoreActivationRouter',
    status: 'runtime_reconciliation_pending',
  },
  civicMap: {
    legacyQuery: 'trpc.civicMap.*',
    runtimeRouter: 'civicMapRouter',
    status: 'directory_geography_active',
  },
  signalRegistry: {
    legacyQuery: 'trpc.signal.*',
    runtimeRouter: 'operationalCoreRuntimeRouter',
    status: 'runtime_reconciliation_pending',
  },
};

export function getFrontendCompatibilityTarget(key: string) {
  return frontendQueryCompatibilityRegistry[
    key as keyof typeof frontendQueryCompatibilityRegistry
  ];
}

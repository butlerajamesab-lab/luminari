import { router, publicProcedure } from "../trpc";
import {
  getActivationAwareOperationalSurface,
  getActivationAwareOperationalSurfaces,
  getOperationalSurfaceStabilizationSummary,
} from "../services/activation-aware-operational-surface-service";

export const activationAwareOperationalVisibilityRouter = router({
  getOperationalVisibilitySummary: publicProcedure.query(() => {
    return getOperationalSurfaceStabilizationSummary();
  }),

  getOperationalVisibilitySurfaces: publicProcedure.query(() => {
    return getActivationAwareOperationalSurfaces();
  }),

  getMissionControlVisibility: publicProcedure.query(() => {
    return getActivationAwareOperationalSurface("mission-control");
  }),

  getGovernanceVisibility: publicProcedure.query(() => {
    return getActivationAwareOperationalSurface("governance");
  }),

  getLegalLibraryVisibility: publicProcedure.query(() => {
    return getActivationAwareOperationalSurface("legal-library");
  }),

  getKnowledgeBackboneVisibility: publicProcedure.query(() => {
    return getActivationAwareOperationalSurface("knowledge-backbone");
  }),

  getCivilGideonVisibility: publicProcedure.query(() => {
    return getActivationAwareOperationalSurface("civil-gideon");
  }),

  getAgencyMetricsVisibility: publicProcedure.query(() => {
    return getActivationAwareOperationalSurface("agency-metrics");
  }),

  getSignalGovernanceVisibility: publicProcedure.query(() => {
    return getActivationAwareOperationalSurface("signal-governance");
  }),

  getPatternRegistryVisibility: publicProcedure.query(() => {
    return getActivationAwareOperationalSurface("pattern-registry");
  }),

  getCivicMapVisibility: publicProcedure.query(() => {
    return getActivationAwareOperationalSurface("civic-map");
  }),
});

import { router, publicProcedure } from "../trpc";
import {
  getOperationalRuntimeSurface,
  getOperationalRuntimeSurfaces,
  getDeterministicOperationalNamespaces,
  isNamespaceRuntimeReady,
} from "../services/operational-core-runtime-service";

export const operationalCoreRuntimeRouter = router({
  getRuntimeNamespaces: publicProcedure.query(() => {
    return getOperationalRuntimeSurfaces();
  }),

  getDeterministicNamespaces: publicProcedure.query(() => {
    return getDeterministicOperationalNamespaces();
  }),

  getMissionControlRuntime: publicProcedure.query(() => {
    return getOperationalRuntimeSurface("mission-control");
  }),

  getGovernanceRuntime: publicProcedure.query(() => {
    return getOperationalRuntimeSurface("governance");
  }),

  getLegalLibraryRuntime: publicProcedure.query(() => {
    return getOperationalRuntimeSurface("legal-library");
  }),

  getKnowledgeBackboneRuntime: publicProcedure.query(() => {
    return getOperationalRuntimeSurface("knowledge-backbone");
  }),

  getCivilGideonRuntime: publicProcedure.query(() => {
    return getOperationalRuntimeSurface("civil-gideon");
  }),

  getAgencyMetricsRuntime: publicProcedure.query(() => {
    return getOperationalRuntimeSurface("agency-metrics");
  }),

  getSignalGovernanceRuntime: publicProcedure.query(() => {
    return getOperationalRuntimeSurface("signal-governance");
  }),

  getPatternRegistryRuntime: publicProcedure.query(() => {
    return getOperationalRuntimeSurface("pattern-registry");
  }),

  getCivicMapRuntime: publicProcedure.query(() => {
    return getOperationalRuntimeSurface("civic-map");
  }),

  isRuntimeNamespaceReady: publicProcedure
    .input((value: unknown) => value as string)
    .query(({ input }) => {
      return {
        namespace: input,
        ready: isNamespaceRuntimeReady(input),
      };
    }),
});

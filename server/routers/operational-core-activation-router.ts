import { router, publicProcedure } from "../trpc";
import {
  activateOperationalNamespace,
  getOperationalActivationStates,
  getOperationalActivationSummary,
  getReadyOperationalNamespaces,
} from "../runtime/operational-core-activation-orchestrator";

export const operationalCoreActivationRouter = router({
  getActivationStates: publicProcedure.query(() => {
    return getOperationalActivationStates();
  }),

  getActivationSummary: publicProcedure.query(() => {
    return getOperationalActivationSummary();
  }),

  getReadyNamespaces: publicProcedure.query(() => {
    return getReadyOperationalNamespaces();
  }),

  activateMissionControl: publicProcedure.query(() => {
    return activateOperationalNamespace("mission-control");
  }),

  activateGovernance: publicProcedure.query(() => {
    return activateOperationalNamespace("governance");
  }),

  activateLegalLibrary: publicProcedure.query(() => {
    return activateOperationalNamespace("legal-library");
  }),

  activateKnowledgeBackbone: publicProcedure.query(() => {
    return activateOperationalNamespace("knowledge-backbone");
  }),

  activateCivilGideon: publicProcedure.query(() => {
    return activateOperationalNamespace("civil-gideon");
  }),

  activateAgencyMetrics: publicProcedure.query(() => {
    return activateOperationalNamespace("agency-metrics");
  }),

  activateSignalGovernance: publicProcedure.query(() => {
    return activateOperationalNamespace("signal-governance");
  }),

  activatePatternRegistry: publicProcedure.query(() => {
    return activateOperationalNamespace("pattern-registry");
  }),

  activateCivicMap: publicProcedure.query(() => {
    return activateOperationalNamespace("civic-map");
  }),
});

import { operationalCoreRuntimeRouter } from "../routers/operational-core-runtime-router";
import { operationalCoreActivationRouter } from "../routers/operational-core-activation-router";
import { activationAwareOperationalVisibilityRouter } from "../routers/activation-aware-operational-visibility-router";

export const routersCompleteOperationalCoreIntegration = {
  operationalCoreRuntime: operationalCoreRuntimeRouter,
  operationalCoreActivation: operationalCoreActivationRouter,
  activationAwareOperationalVisibility:
    activationAwareOperationalVisibilityRouter,
};

export function getRoutersCompleteOperationalCoreIntegration() {
  return routersCompleteOperationalCoreIntegration;
}

export const operationalCoreRuntimeNamespaces = [
  "mission-control",
  "governance",
  "legal-library",
  "knowledge-backbone",
  "civil-gideon",
  "agency-metrics",
  "signal-governance",
  "pattern-registry",
  "civic-map",
];

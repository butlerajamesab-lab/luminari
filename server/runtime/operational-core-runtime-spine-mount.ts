import { mergeRouters } from "../trpc";
import { operationalCoreRuntimeRouter } from "../routers/operational-core-runtime-router";
import { operationalCoreActivationRouter } from "../routers/operational-core-activation-router";
import { activationAwareOperationalVisibilityRouter } from "../routers/activation-aware-operational-visibility-router";

export const operationalCoreRuntimeSpineMount = mergeRouters(
  operationalCoreRuntimeRouter,
  operationalCoreActivationRouter,
  activationAwareOperationalVisibilityRouter
);

export const operationalCoreRuntimeSpineNamespaces = {
  operationalCoreRuntime: "operational-core-runtime",
  operationalCoreActivation: "operational-core-activation",
  activationAwareOperationalVisibility:
    "activation-aware-operational-visibility",
};

export function getOperationalCoreRuntimeSpineMount() {
  return operationalCoreRuntimeSpineMount;
}

export function getOperationalCoreRuntimeSpineNamespaces() {
  return operationalCoreRuntimeSpineNamespaces;
}
